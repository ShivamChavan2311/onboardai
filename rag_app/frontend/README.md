# RAG Knowledge Assistant - Frontend

This is the React frontend for the RAG-based document Q&A system.

## Prerequisites

- Node.js 18+ and npm
- Backend server running on port 8000

## Installation

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

## Development

Start the development server:
```bash
npm run dev
```

The app will be available at http://localhost:5173 and will proxy API requests to the backend at http://localhost:8000.

## Project Structure

- `src/components/` - Reusable React components
- `src/pages/` - Page components for each route
- `src/api.ts` - API utility functions for backend communication

## Available Routes

- `/chat` - Chat interface (default)
- `/upload` - Document upload
- `/settings` - API key configuration