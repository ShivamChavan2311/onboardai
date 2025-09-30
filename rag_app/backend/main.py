from fastapi import FastAPI, UploadFile, Form, Header, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn
import os
import logging
import chromadb

from rag import (
    load_document,
    build_vector_store_sync,
    semantic_search_sync,
    web_lookup_sync,
    web_lookup,
    generate_answer_sync,
    generate_answer,
    summarize_text_sync,
    init_clients,
    embed_texts,
    compute_hash,
)

# ---------------- LOGGING ----------------
logging.basicConfig(
    level=logging.INFO,
    format="[%(levelname)s] %(asctime)s - %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger("RAG_SERVER")

# ---------------- FASTAPI APP ----------------
app = FastAPI(
    title="IntraMate",
    description="API for document-based Q&A with web augmentation",
    version="2.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # frontend allowed
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------- DATABASE ----------------
chroma_client = chromadb.PersistentClient(path="./chroma_store")

# ---------------- LIST DOCUMENTS ----------------
@app.get("/documents")
async def list_documents():
    """List all documents in the vector store with their chunks."""
    try:
        collection = chroma_client.get_or_create_collection("knowledge_base")
        result = collection.get()
        
        # Group chunks by source document
        documents = {}
        for doc, meta in zip(result['documents'], result['metadatas']):
            source = meta.get('source', 'Unknown')
            if source not in documents:
                documents[source] = {
                    'chunks': 0,
                    'preview': []
                }
            documents[source]['chunks'] += 1
            if len(documents[source]['preview']) < 3:  # Store up to 3 previews per document
                preview = doc[:180] + "..." if len(doc) > 180 else doc
                documents[source]['preview'].append(preview)
        
        return {
            "documents": [
                {
                    "name": os.path.basename(source),
                    "path": source,
                    "chunks": info['chunks'],
                    "previews": info['preview']
                }
                for source, info in documents.items()
            ]
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------- API KEY VALIDATION ----------------
class APIKeys(BaseModel):
    openai_key: str
    tavily_key: str

@app.post("/validate_keys")
async def validate_keys(keys: APIKeys):
    """Validate API keys by trying to initialize clients."""
    try:
        openai_client, tavily_client, _ = init_clients(keys.openai_key, keys.tavily_key)
        return {"status": "success", "message": "API keys are valid"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

# ---------------- DELETE DOCUMENT ----------------
@app.delete("/documents/{document_path:path}")
async def delete_document(document_path: str):
    """Delete a document and its chunks from the vector store."""
    try:
        collection = chroma_client.get_or_create_collection("knowledge_base")
        # Get all document chunks
        result = collection.get(
            where={"source": document_path}
        )
        if not result['ids']:
            raise HTTPException(status_code=404, detail="Document not found")
        
        # Delete chunks from the collection
        collection.delete(
            where={"source": document_path}
        )
        
        # Delete the physical file if it exists in the uploads directory
        file_path = os.path.join("uploads", os.path.basename(document_path))
        if os.path.exists(file_path):
            os.remove(file_path)
            
        return {"status": "success", "message": f"Document {document_path} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ---------------- ROUTES ----------------
@app.post("/upload")
async def upload_document(
    file: UploadFile,
    x_openai_key: str = Header(None),
    x_tavily_key: str = Header(None)
):
    """Upload a document and insert into vector store."""
    try:
        if not x_openai_key or not x_tavily_key:
            raise HTTPException(
                status_code=401,
                detail="Please provide API keys in Settings"
            )

        # Initialize clients with user's API keys
        openai_client, _, _ = init_clients(x_openai_key, x_tavily_key)
        
        # Validate file size (50MB limit)
        file_size = 0
        MAX_SIZE = 50 * 1024 * 1024  # 50MB

        # Create uploads directory if it doesn't exist
        os.makedirs("uploads", exist_ok=True)
        filepath = os.path.join("uploads", file.filename)

        # Stream file to disk while checking size
        with open(filepath, "wb") as buffer:
            while True:
                chunk = await file.read(8192)  # 8KB chunks
                if not chunk:
                    break
                file_size += len(chunk)
                if file_size > MAX_SIZE:
                    os.remove(filepath)  # Clean up partial file
                    raise HTTPException(
                        status_code=413,
                        detail="File too large. Maximum size is 50MB."
                    )
                buffer.write(chunk)

        try:
            # Process the document
            chunks = load_document(filepath)
            if not chunks:
                raise ValueError("No content could be extracted from document")

            # Get vector store collection
            collection = chroma_client.get_or_create_collection("knowledge_base")

            # Get embeddings concurrently
            texts = [chunk[0] for chunk in chunks]
            embeddings = await embed_texts(texts, openai_client)
            
            # Add documents to vector store
            for (text, meta), emb in zip(chunks, embeddings):
                cid = f"{meta.get('source','doc')}_{compute_hash(text)[:12]}"
                try:
                    collection.add(
                        ids=[cid],
                        documents=[text],
                        embeddings=[emb],
                        metadatas=[meta]
                    )
                except Exception as e:
                    logger.warning(f"❌ Failed to add {cid}: {e}")

            logger.info(f"📂 Document {file.filename} processed into {len(chunks)} chunks")
            return {
                "status": "success",
                "message": f"Document processed successfully into {len(chunks)} chunks",
                "chunks": len(chunks)
            }

        except Exception as e:
            logger.error(f"Processing error for {file.filename}: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Error processing document: {str(e)}"
            )
        finally:
            # Clean up temporary file
            try:
                os.remove(filepath)
            except:
                pass

    except Exception as e:
        logger.error(f"Upload error for {file.filename}: {str(e)}")
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(
            status_code=500,
            detail=str(e)
        )


# ---------------- REQUEST MODELS ----------------
class ChatRequest(BaseModel):
    question: str
    language: str = "English"

@app.post("/chat")
async def chat_with_rag(
    request: ChatRequest,
    x_openai_key: str = Header(None),
    x_tavily_key: str = Header(None)
):
    """Ask a question and get answer from documents + web search."""
    try:
        if not x_openai_key or not x_tavily_key:
            raise HTTPException(
                status_code=401,
                detail="Please provide API keys in Settings"
            )

        # Initialize clients with user's API keys
        openai_client, tavily_client, _ = init_clients(x_openai_key, x_tavily_key)
        
        vector_store = chroma_client.get_or_create_collection("knowledge_base")

        try:
            # Step 1: Get query embedding and search
            logger.info(f"Searching for: {request.question}")
            q_emb = await embed_texts([request.question], openai_client)
            results = vector_store.query(query_embeddings=q_emb, n_results=3)
            
            # Prepare sources and context
            doc_texts = []
            doc_sources = []
            web_refs = []
            source_type = "documents"

            if results["documents"] and results["documents"][0]:
                # Process document hits
                for doc, meta in zip(results["documents"][0], results["metadatas"][0]):
                    preview = doc[:180] + "..." if len(doc) > 180 else doc
                    doc_texts.append(doc)
                    doc_sources.append({
                        "source": meta.get("source", "Unknown"),
                        "preview": preview
                    })
                context = "\n".join(doc_texts)
                logger.info(f"Found {len(doc_texts)} relevant documents")
            else:
                # Fallback to web search
                logger.info("No relevant documents found, falling back to web search")
                web_text, web_refs = await web_lookup(request.question, tavily_client)
                context = web_text
                source_type = "web"
                logger.info(f"Found {len(web_refs)} web references")

            # Generate answer
            answer = await generate_answer(request.question, context, openai_client, request.language)

            # Prepare response with answer and sources
            response = {
                "answer": answer,
                "sources": {
                    "type": source_type,
                    "documents": doc_sources,
                    "web": web_refs
                }
            }
            logger.info("Successfully generated response")
            return response
        except Exception as e:
            logger.error(f"Error generating answer: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to generate answer: {str(e)}"
            )

    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


class SummarizeRequest(BaseModel):
    text: str
    language: str = "English"

@app.post("/summarize")
async def summarize(
    request: SummarizeRequest,
    x_openai_key: str = Header(None),
    x_tavily_key: str = Header(None)
):
    """Summarize a piece of text into chosen language."""
    try:
        if not x_openai_key or not x_tavily_key:
            raise HTTPException(
                status_code=401,
                detail="Please provide API keys in Settings"
            )

        # Initialize clients with user's API keys
        openai_client, _, _ = init_clients(x_openai_key, x_tavily_key)

        summary = summarize_text_sync(request.text, openai_client, request.language)
        return {"summary": summary}
        
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))


# ---------------- MAIN ----------------
if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
