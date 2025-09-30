import os
import asyncio
import hashlib
import logging
from typing import List, Dict, Tuple

import fitz
import docx
import markdown
from bs4 import BeautifulSoup
import chromadb
from openai import AsyncOpenAI
from tavily import TavilyClient
from dotenv import load_dotenv


# ---------------- LOGGING ----------------
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(asctime)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("RAG_PIPELINE")

# Load environment variables (if present)
load_dotenv()


# ---------------- UTILITIES ----------------
def chunk_text(text: str, max_tokens: int = 500, overlap: int = 50) -> List[str]:
    """
    Split text into chunks with overlap to preserve context.
    """
    words = text.split()
    step = max_tokens - overlap
    chunks = [
        " ".join(words[i : i + max_tokens]) for i in range(0, len(words), step)
    ]
    return [c for c in chunks if c.strip()]


def compute_hash(content: str) -> str:
    """Unique hash for detecting duplicate chunks."""
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


# ---------------- DOCUMENT LOADERS ----------------
def parse_pdf(path: str) -> List[Tuple[str, Dict]]:
    doc = fitz.open(path)
    data = []
    for idx, page in enumerate(doc):
        text = page.get_text()
        if not text.strip():
            continue
        for chunk in chunk_text(text):
            data.append((chunk, {"source": path, "page": idx + 1}))
    doc.close()
    return data


def parse_docx(path: str) -> List[Tuple[str, Dict]]:
    d = docx.Document(path)
    text = "\n".join([p.text for p in d.paragraphs if p.text.strip()])
    return [(c, {"source": path}) for c in chunk_text(text)]


def parse_markdown(path: str) -> List[Tuple[str, Dict]]:
    raw = open(path, encoding="utf-8").read()
    html = markdown.markdown(raw)
    soup = BeautifulSoup(html, "html.parser")
    return [(c, {"source": path}) for c in chunk_text(soup.get_text())]


def parse_html(path: str) -> List[Tuple[str, Dict]]:
    html = open(path, encoding="utf-8").read()
    soup = BeautifulSoup(html, "html.parser")
    return [(c, {"source": path}) for c in chunk_text(soup.get_text())]


def parse_txt(path: str) -> List[Tuple[str, Dict]]:
    raw = open(path, encoding="utf-8").read()
    return [(c, {"source": path}) for c in chunk_text(raw)]


def load_document(path: str) -> List[Tuple[str, Dict]]:
    """
    Dispatch to appropriate parser based on file extension.
    """
    if path.endswith(".pdf"):
        return parse_pdf(path)
    if path.endswith(".docx"):
        return parse_docx(path)
    if path.endswith(".md"):
        return parse_markdown(path)
    if path.endswith(".html") or path.endswith(".htm"):
        return parse_html(path)
    if path.endswith(".txt"):
        return parse_txt(path)
    raise ValueError(f"Unsupported file format: {path}")


# ---------------- CLIENT FACTORY ----------------
def init_clients(openai_key: str = None, tavily_key: str = None):
    """Initialize API clients with optional key overrides"""
    if not openai_key or not tavily_key:
        # Try environment variables as fallback
        openai_key = os.getenv("OPENAI_API_KEY")
        tavily_key = os.getenv("TAVILY_API_KEY")
        
        if not openai_key or not tavily_key:
            raise RuntimeError("Please provide OpenAI and Tavily API keys in Settings")

    return (
        AsyncOpenAI(api_key=openai_key),
        TavilyClient(api_key=tavily_key),
        chromadb.PersistentClient(path="./chroma_store"),
    )


# ---------------- EMBEDDINGS ----------------
async def embed_texts(texts: List[str], client: AsyncOpenAI) -> List[List[float]]:
    """Get embeddings concurrently for multiple texts."""
    tasks = [client.embeddings.create(input=t, model="text-embedding-3-small") for t in texts]
    results = await asyncio.gather(*tasks)
    return [r.data[0].embedding for r in results]


# ---------------- DATABASE ----------------
async def build_vector_store(
    docs: List[Tuple[str, Dict]], openai_client: AsyncOpenAI, db_client
):
    """
    Insert documents into Chroma vector DB.
    Skips duplicates using hash.
    """
    collection = db_client.get_or_create_collection("knowledge_base")

    try:
        current_ids = set(collection.get().get("ids", []))
    except Exception:
        current_ids = set()

    new_entries = []
    for idx, (chunk, meta) in enumerate(docs):
        cid = f"{meta.get('source','doc')}_{idx}_{compute_hash(chunk)[:12]}"
        if cid not in current_ids:
            new_entries.append((cid, chunk, meta))

    if not new_entries:
        logger.info("📂 No new chunks to insert.")
        return collection

    embeddings = await embed_texts([c for _, c, _ in new_entries], openai_client)

    for (cid, text, meta), emb in zip(new_entries, embeddings):
        try:
            collection.add(ids=[cid], documents=[text], embeddings=[emb], metadatas=[meta])
        except Exception as e:
            logger.warning(f"❌ Failed to add {cid}: {e}")

    logger.info(f"✅ Added {len(new_entries)} new chunks to vector store")
    return collection


# ---------------- SEARCH ----------------
async def semantic_search(
    query: str, collection, client: AsyncOpenAI, top_k: int = 3
) -> List[Tuple[str, Dict]]:
    try:
        q_emb = await embed_texts([query], client)
        res = collection.query(query_embeddings=q_emb, n_results=top_k)
        if not res or not res.get("documents"):
            return []

        docs = []
        for doc, meta in zip(res["documents"][0], res["metadatas"][0]):
            meta["preview"] = doc[:180] + "..." if len(doc) > 180 else doc
            docs.append((doc, meta))
        return docs
    except Exception as e:
        logger.error(f"Search failed: {e}")
        return []


def keyword_match(query: str, docs: List[Tuple[str, Dict]]) -> List[Tuple[str, Dict]]:
    """Naive fallback keyword search."""
    terms = query.lower().split()[:3]
    matches = []
    for text, meta in docs:
        if any(term in text.lower() for term in terms):
            meta["preview"] = text[:180] + "..."
            matches.append((text, meta))
    return matches[:2]


async def web_lookup(query: str, tavily_client, limit: int = 3):
    loop = asyncio.get_event_loop()
    try:
        resp = await loop.run_in_executor(None, tavily_client.search, query, limit)
        results = resp.get("results", [])
        content, cites = [], []
        for r in results:
            content.append(r.get("content", ""))
            cites.append({"title": r.get("title", ""), "url": r.get("url", "")})
        return "\n".join(content), cites
    except Exception as e:
        logger.error(f"Web search failed: {e}")
        return "", []


# ---------------- QA & SUMMARIZATION ----------------
async def generate_answer(
    question: str, context: str, client: AsyncOpenAI, language: str = "English"
) -> str:
    prompt = f"You are a multilingual assistant. Reply in {language}. Use sources if relevant."
    messages = [
        {"role": "system", "content": prompt},
        {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {question}"},
    ]
    resp = await client.chat.completions.create(model="gpt-3.5-turbo", messages=messages)
    return resp.choices[0].message.content


async def summarize_text(text: str, client: AsyncOpenAI, language: str = "English") -> str:
    resp = await client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=[
            {"role": "system", "content": f"Summarize in {language}"},
            {"role": "user", "content": text[:4000]},
        ],
    )
    return resp.choices[0].message.content


# ---------------- SYNC HELPERS ----------------
def run_async(coro):
    try:
        # Try to get the current event loop
        loop = asyncio.get_event_loop()
        
        # If we're in a running event loop, run the coroutine directly
        if loop.is_running():
            return loop.create_task(coro)
        
        # If we have a loop but it's not running, run the coroutine to completion
        return loop.run_until_complete(coro)
    except RuntimeError:
        # No event loop found, create one
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
        try:
            result = loop.run_until_complete(coro)
            return result
        finally:
            loop.close()


def build_vector_store_sync(docs, openai_client, db_client):
    return run_async(build_vector_store(docs, openai_client, db_client))


def semantic_search_sync(query, collection, client):
    return run_async(semantic_search(query, collection, client))


def web_lookup_sync(query, client):
    return run_async(web_lookup(query, client))


def generate_answer_sync(question, context, client, language="English"):
    return run_async(generate_answer(question, context, client, language))


def summarize_text_sync(text, client, language="English"):
    return run_async(summarize_text(text, client, language))

