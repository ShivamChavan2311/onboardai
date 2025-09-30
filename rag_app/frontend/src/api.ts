import axios from 'axios'

// Create an axios instance for making API calls to the backend
const api = axios.create({
  baseURL: 'http://localhost:8000', // This will be handled by Vite's proxy in development
  headers: {
    'Content-Type': 'application/json',
  },
})

// Add request interceptor to include API keys in headers
api.interceptors.request.use((config) => {
  // Get API keys from localStorage
  const openAiKey = localStorage.getItem('openAiKey')
  const tavilyKey = localStorage.getItem('tavilyKey')

  if (openAiKey) {
    config.headers['X-OpenAI-Key'] = openAiKey
  }
  if (tavilyKey) {
    config.headers['X-Tavily-Key'] = tavilyKey
  }

  return config
})

interface UploadResponse {
  chunks: number;
  message: string;
}

// Upload a document
export const uploadDocument = async (file: File, onProgress?: (progress: number) => void): Promise<{ data: UploadResponse }> => {
  const formData = new FormData()
  formData.append('file', file)
  return api.post<UploadResponse>('/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
    onUploadProgress: (progressEvent) => {
      if (onProgress && progressEvent.total) {
        const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total)
        onProgress(progress)
      }
    }
  })
}

// List all documents
export const listDocuments = async () => {
  return api.get('/documents')
}

// Chat with the RAG system
export const chatWithRAG = async (question: string, language: string = 'English') => {
  return api.post('/chat', {
    question,
    language
  })
}

// Summarize text
export const summarizeText = async (text: string, language: string = 'English') => {
  return api.post('/summarize', {
    text,
    language
  })
}

// Delete a document
export const deleteDocument = async (documentPath: string) => {
  return api.delete(`/documents/${encodeURIComponent(documentPath)}`)
}