import { useState, useEffect } from 'react'

// Helper function to mask API keys
const maskApiKey = (key: string): string => {
  if (!key) return '';
  if (key.length <= 7) return '•'.repeat(key.length);
  return `${key.slice(0, 3)}...${key.slice(-4)}`;
};

const Settings = () => {
  const [openAiKey, setOpenAiKey] = useState('')
  const [tavilyKey, setTavilyKey] = useState('')
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [savedKeys, setSavedKeys] = useState({ openAi: '', tavily: '' })

  // Load saved keys on mount
  useEffect(() => {
    const savedOpenAiKey = localStorage.getItem('openAiKey') || '';
    const savedTavilyKey = localStorage.getItem('tavilyKey') || '';
    setSavedKeys({
      openAi: savedOpenAiKey,
      tavily: savedTavilyKey
    });
  }, []);

  const saveKeys = async () => {
    // Clear any existing messages
    setMessage('');
    setError('');

    // Validate keys
    if (!openAiKey.trim() || !tavilyKey.trim()) {
      setError('Please enter both API keys');
      setTimeout(() => setError(''), 3000);
      return;
    }

    try {
      // First validate the keys with the backend
      const response = await fetch('http://localhost:8000/validate_keys', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          openai_key: openAiKey.trim(),
          tavily_key: tavilyKey.trim()
        })
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to validate API keys');
      }

      // If validation succeeds, save keys to localStorage
      localStorage.setItem('openAiKey', openAiKey.trim());
      localStorage.setItem('tavilyKey', tavilyKey.trim());
      
      // Update saved keys display
      setSavedKeys({
        openAi: openAiKey.trim(),
        tavily: tavilyKey.trim()
      });

      // Show success message
      setMessage('API keys validated and saved successfully!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setError(err.message || 'Failed to save API keys. Please try again.');
      setTimeout(() => setError(''), 5000);
    }
  }

  return (
    <div className="page">
      <h1>Settings</h1>
      <p>Configure your API keys for the RAG assistant</p>
      
      {/* Display current saved keys */}
      {(savedKeys.openAi || savedKeys.tavily) && (
        <div className="saved-keys">
          <h3>Current saved keys:</h3>
          {savedKeys.openAi && (
            <p>OpenAI API Key: {maskApiKey(savedKeys.openAi)}</p>
          )}
          {savedKeys.tavily && (
            <p>Tavily API Key: {maskApiKey(savedKeys.tavily)}</p>
          )}
        </div>
      )}

      <div style={{ maxWidth: '400px', marginTop: '2rem' }}>
        <div className="form-group">
          <label htmlFor="openai">OpenAI API Key</label>
          <input
            type="password"
            id="openai"
            value={openAiKey}
            onChange={(e) => setOpenAiKey(e.target.value)}
            placeholder="sk-..."
            className="input"
          />
        </div>

        <div className="form-group">
          <label htmlFor="tavily">Tavily API Key</label>
          <input
            type="password"
            id="tavily"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
            placeholder="tvly-..."
            className="input"
          />
        </div>

        <button className="button" onClick={saveKeys}>
          Save API Keys
        </button>

        {error && (
          <div className="message error">
            {error}
          </div>
        )}

        {message && (
          <div className="message success">
            {message}
          </div>
        )}
      </div>
    </div>
  )
}

export default Settings