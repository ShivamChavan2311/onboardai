import { useState, useEffect } from 'react'
import { chatWithRAG } from '../api'
import './Chat.css'

interface Citation {
  url: string;
  title?: string;
}

interface DocumentSource {
  source: string;
  preview: string;
}

interface Sources {
  type: 'documents' | 'web';
  documents: DocumentSource[];
  web: Citation[];
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: Sources;
  feedback?: 'thumbsUp' | 'thumbsDown';
}

const LANGUAGES = [
  'English', 'Marathi', 'Hindi',
];

const Chat = () => {
  // Initialize messages from localStorage or empty array
  const [messages, setMessages] = useState<Message[]>(() => {
    const savedMessages = localStorage.getItem('chatMessages');
    return savedMessages ? JSON.parse(savedMessages) : [];
  });
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [language, setLanguage] = useState('English')
  const [showFeedbackModal, setShowFeedbackModal] = useState(false)
  const [feedbackText, setFeedbackText] = useState('')
  const [selectedMessageIndex, setSelectedMessageIndex] = useState<number | null>(null)
  const [expandedSources, setExpandedSources] = useState<{[key: number]: boolean}>({})

  // Save messages to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('chatMessages', JSON.stringify(messages));
  }, [messages]);

  const toggleSources = (idx: number) => {
    setExpandedSources(prev => ({
      ...prev,
      [idx]: !prev[idx]
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || loading) return

    const question = input.trim()
    setInput('')
    setLoading(true)

    // Add user message to chat
    setMessages(prev => [...prev, { role: 'user', content: question }])

    try {
      const response = await chatWithRAG(question, language)
      const { answer, sources } = response.data
      
      // Add assistant response to chat with sources
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: answer,
        sources
      }])
    } catch (error: any) {
      let errorMessage = 'Sorry, I encountered an error. Please try again.'
      
      // Add specific error messages for common issues
      if (error.response) {
        if (error.response.status === 401) {
          errorMessage = 'Please add your API keys in the Settings page first.'
        } else if (error.response.data?.detail) {
          errorMessage = error.response.data.detail
        }
      }
      
      setMessages(prev => [...prev, { 
        role: 'assistant', 
        content: errorMessage
      }])
      console.error('Chat error:', error.response || error)
    } finally {
      setLoading(false)
    }
  }

  const handleClearChat = () => {
    if (window.confirm('Are you sure you want to clear the chat history?')) {
      setMessages([]);
      setExpandedSources({});
      localStorage.removeItem('chatMessages'); // Clear messages from localStorage
    }
  };

  const handleFeedback = (messageIndex: number, feedback: 'thumbsUp' | 'thumbsDown') => {
    if (feedback === 'thumbsUp') {
      setMessages(prev => {
        const updated = [...prev];
        updated[messageIndex] = {
          ...updated[messageIndex],
          feedback
        };
        return updated;
      });
    }
  };

  const handleDownloadChat = () => {
    // Create text content from messages
    const chatContent = messages.map(msg => {
      let text = `${msg.role === 'user' ? '👤 You' : '🤖 Assistant'}: ${msg.content}\n`;
      
      // Add sources if available
      if (msg.sources) {
        if (msg.sources.type === 'documents') {
          text += '\nSources:\n';
          msg.sources.documents.forEach(doc => {
            text += `📄 From: ${doc.source}\n${doc.preview}\n`;
          });
        } else if (msg.sources.type === 'web') {
          text += '\nWeb References:\n';
          msg.sources.web.forEach(citation => {
            text += `🌐 ${citation.title || citation.url}\n`;
          });
        }
      }
      text += '\n-------------------\n\n';
      return text;
    }).join('');

    // Create and download the file
    const blob = new Blob([chatContent], { type: 'text/plain' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `IntraMate_Chat_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  function handleFeedbackSubmit(event: React.MouseEvent<HTMLButtonElement, MouseEvent>): void {
    event.preventDefault();
    // Optionally send feedback to backend or log it
    // For now, just close modal and clear feedback
    setShowFeedbackModal(false);
    setFeedbackText('');
    setSelectedMessageIndex(null);
    // You can add API call here if needed
    // Example:
    // if (selectedMessageIndex !== null) {
    //   sendFeedback(messages[selectedMessageIndex], feedbackText);
    // }
  }

  return (
    <div className="page">
      <div className="chat-header">
        <div>
          <h1>Chat</h1>
          <p>Ask questions about your documents and get AI-powered answers</p>
        </div>
        {messages.length > 0 && (
          <div className="chat-actions">
            <button 
              onClick={handleClearChat}
              className="clear-chat-button"
            >
              🗑️ Clear Chat
            </button>
            <button 
              onClick={handleDownloadChat}
              className="download-chat-button"
            >
              💾 Download Chat
            </button>
          </div>
        )}
      </div>

      <div className="language-selector">
        <label htmlFor="language">Response Language:</label>
        <select
          id="language"
          value={language}
          onChange={(e) => setLanguage(e.target.value)}
          className="language-dropdown"
        >
          {LANGUAGES.map(lang => (
            <option key={lang} value={lang}>{lang}</option>
          ))}
        </select>
      </div>

      <div className="chat-container">
        <div className="messages">
          {messages.length === 0 && (
            <div className="empty-state">
              <h3>👋 Welcome! I am Your shortcut to company knowledge.</h3>
              <p>Everything you need to know — in one place.</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div key={idx} className={`message-bubble ${msg.role}`}>
              <p>{msg.content}</p>
              
              {msg.role === 'assistant' && (
                <div className="message-actions">
                  <div className="feedback-buttons">
                    <button 
                      onClick={() => handleFeedback(idx, 'thumbsUp')}
                      className={`feedback-button`}
                      title="Helpful"
                    >
                      👍
                    </button>
                    <button 
                      onClick={() => {
                        setSelectedMessageIndex(idx);
                        setShowFeedbackModal(true);
                      }}
                      className={`feedback-button`}
                      title="Not helpful"
                    >
                      👎
                    </button>
                  </div>
                </div>
              )}

              {msg.role === 'assistant' && msg.sources && (
                <div className="sources-section">
                  <button
                    className="sources-toggle"
                    onClick={() => toggleSources(idx)}
                  >
                    {msg.sources.type === 'documents' ? '📄' : '🌐'} View Sources
                  </button>
                  
                  {expandedSources[idx] && (
                    <div className="sources-list">
                      {/* Show document source if available */}
                      {msg.sources.type === 'documents' && msg.sources.documents.length > 0 && (
                        <div>
                          <h4>📄 Source</h4>
                          <div className="source-item">
                            <small>{msg.sources.documents[0].source.split('/').pop()}</small>
                          </div>
                        </div>
                      )}

                      {/* Show web search indicator */}
                      {msg.sources.type === 'web' && msg.sources.web.length > 0 && (
                        <div>
                          <h4>🌐 Web Search</h4>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
          
          {loading && (
            <div className="message-bubble assistant loading">
              🤔 Searching documents and web sources...
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="chat-input-form">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask a question..."
            disabled={loading}
          />
          <button 
            type="submit" 
            className="button"
            disabled={loading || !input.trim()}
          >
            Send
          </button>
        </form>
      </div>

      {/* Feedback Modal */}
      {showFeedbackModal && (
        <div className="feedback-modal">
          <div className="feedback-modal-content">
            <h3>Help us improve</h3>
            <p>Please let us know how we can make this response better:</p>
            <div className="feedback-options">
              <label>
                <input
                  type="checkbox"
                  checked={feedbackText.includes("Shouldn't have used Memory")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFeedbackText(prev => prev + "\nShouldn't have used Memory");
                    } else {
                      setFeedbackText(prev => prev.replace("\nShouldn't have used Memory", ""));
                    }
                  }}
                />
                Shouldn't have used Memory
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={feedbackText.includes("Don't like the personality")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFeedbackText(prev => prev + "\nDon't like the personality");
                    } else {
                      setFeedbackText(prev => prev.replace("\nDon't like the personality", ""));
                    }
                  }}
                />
                Don't like the personality
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={feedbackText.includes("Don't like the style")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFeedbackText(prev => prev + "\nDon't like the style");
                    } else {
                      setFeedbackText(prev => prev.replace("\nDon't like the style", ""));
                    }
                  }}
                />
                Don't like the style
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={feedbackText.includes("Not factually correct")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFeedbackText(prev => prev + "\nNot factually correct");
                    } else {
                      setFeedbackText(prev => prev.replace("\nNot factually correct", ""));
                    }
                  }}
                />
                Not factually correct
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={feedbackText.includes("Didn't fully follow instructions")}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setFeedbackText(prev => prev + "\nDidn't fully follow instructions");
                    } else {
                      setFeedbackText(prev => prev.replace("\nDidn't fully follow instructions", ""));
                    }
                  }}
                />
                Didn't fully follow instructions
              </label>
            </div>
            <textarea
              value={feedbackText}
              onChange={(e) => setFeedbackText(e.target.value)}
              placeholder="Additional feedback (optional)"
              rows={4}
            />
            <div className="feedback-modal-buttons">
              <button onClick={() => {
                setShowFeedbackModal(false);
                setFeedbackText('');
                setSelectedMessageIndex(null);
              }}>Cancel</button>
              <button onClick={handleFeedbackSubmit}>Submit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default Chat