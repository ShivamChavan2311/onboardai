import { useState, useEffect } from 'react'
import { uploadDocument, listDocuments, deleteDocument } from '../api'

interface Document {
  name: string;
  path: string;
  chunks: number;
  previews: string[];
}

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
const ALLOWED_TYPES = ['.pdf', '.docx', '.md', '.html', '.txt'];

const Upload = () => {
  const [files, setFiles] = useState<File[]>([])
  const [uploading, setUploading] = useState(false)
  const [message, setMessage] = useState('')
  const [uploadProgress, setUploadProgress] = useState<{[key: string]: number}>({})
  const [chunksProcessed, setChunksProcessed] = useState<{[key: string]: number}>({})
  const [documents, setDocuments] = useState<Document[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadDocuments()
  }, [])

  const loadDocuments = async () => {
    try {
      setLoading(true)
      const response = await listDocuments()
      setDocuments(response.data.documents)
    } catch (error) {
      console.error('Error loading documents:', error)
      setMessage('Failed to load documents')
    } finally {
      setLoading(false)
    }
  }

  const validateFile = (file: File): string | null => {
    if (file.size > MAX_FILE_SIZE) {
      return 'File size exceeds 50MB limit.'
    }
    
    const extension = '.' + file.name.split('.').pop()?.toLowerCase()
    if (!ALLOWED_TYPES.includes(extension)) {
      return `Invalid file type. Allowed types: ${ALLOWED_TYPES.join(', ')}`
    }
    
    return null
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = Array.from(e.target.files || [])
    const validFiles: File[] = []
    const errors: string[] = []

    selectedFiles.forEach(file => {
      const error = validateFile(file)
      if (error) {
        errors.push(`${file.name}: ${error}`)
      } else {
        validFiles.push(file)
      }
    })

    if (errors.length > 0) {
      setMessage(errors.join('\n'))
      if (!validFiles.length) {
        e.target.value = ''
        return
      }
    }

    setFiles(validFiles)
    if (validFiles.length > 0) {
      setMessage(errors.length ? 'Some files will be skipped due to errors.' : '')
    }
    setChunksProcessed({})
  }

  const handleUpload = async () => {
    if (!files.length) return

    setUploading(true)
    setMessage('')
    setUploadProgress({})
    setChunksProcessed({})

    try {
      for (const file of files) {
        setMessage(prev => prev + `\nUploading ${file.name}...`)
        const response = await uploadDocument(file, (progress) => {
          setUploadProgress(prev => ({
            ...prev,
            [file.name]: progress
          }))
        })

        const { chunks } = response.data
        setChunksProcessed(prev => ({
          ...prev,
          [file.name]: chunks
        }))
      }

      setMessage('All files uploaded successfully!')
      setFiles([])
      
      // Reset file input
      const input = document.querySelector('input[type="file"]') as HTMLInputElement
      if (input) input.value = ''
    } catch (error: any) {
      let errorMessage = 'Error uploading file. Please try again.'
      
      if (error.response) {
        // Server responded with an error
        errorMessage = error.response.data.detail || error.response.data.message || errorMessage
      } else if (error.request) {
        // No response received
        errorMessage = 'Server not responding. Please try again later.'
      } else if (error.message) {
        // Error in request setup
        errorMessage = error.message
      }
      
      setMessage(errorMessage)
      console.error('Upload error:', error)
    } finally {
      setUploading(false)
      setUploadProgress({})
    }
  }

  return (
    <div className="page">
      <h1>Upload Documents</h1>
      <p>Upload PDF, DOCX, MD, HTML, or TXT files to the knowledge base</p>

      {/* Document List */}
      {loading ? (
        <p>Loading documents...</p>
      ) : documents.length > 0 ? (
        <div className="documents-list">
          <h2>Uploaded Documents</h2>
          {documents.map((doc, index) => (
            <div key={index} className="document-item">
              <div className="document-header">
                <h3>{doc.name}</h3>
                <button 
                  className="delete-button"
                  onClick={async () => {
                    if (window.confirm(`Are you sure you want to delete ${doc.name}?`)) {
                      try {
                        await deleteDocument(doc.path);
                        setMessage(`Successfully deleted ${doc.name}`);
                        loadDocuments(); // Refresh the list
                      } catch (error) {
                        console.error('Error deleting document:', error);
                        setMessage(`Error deleting ${doc.name}`);
                      }
                    }
                  }}
                >
                  🗑️ Delete
                </button>
              </div>
              <p>Number of chunks: {doc.chunks}</p>
            </div>
          ))}
        </div>
      ) : (
        <p>No documents uploaded yet.</p>
      )}
      
      {/* Upload Form */}
      <div style={{ maxWidth: '400px', marginTop: '2rem' }}>
        <div className="form-group">
          <input
            type="file"
            onChange={handleFileChange}
            accept=".pdf,.docx,.md,.html,.txt"
            multiple
          />
          {files.length > 0 && (
            <div className="files-info">
              <strong>Selected files:</strong>
              {files.map((file, index) => (
                <div key={index} className="file-info">
                  {file.name} ({formatFileSize(file.size)})
                  {uploading && uploadProgress[file.name] !== undefined && (
                    <div className="progress-container">
                      <div className="progress-bar">
                        <div 
                          className="progress-fill" 
                          style={{ width: `${uploadProgress[file.name]}%` }}
                        />
                        <span className="progress-text">
                          {uploadProgress[file.name]}%
                        </span>
                      </div>
                    </div>
                  )}
                  {chunksProcessed[file.name] !== undefined && (
                    <div className="chunks-info">
                      Processed into {chunksProcessed[file.name]} chunks
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <button 
          className="button"
          onClick={handleUpload}
          disabled={files.length === 0 || uploading}
        >
          {uploading ? 'Uploading...' : 'Upload Documents'}
        </button>

        {message && (
          <div className={`message ${message.includes('Error') ? 'error' : 'success'}`}>
            {message}
          </div>
        )}
      </div>
    </div>
  )
}

export default Upload