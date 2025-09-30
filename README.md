# IntraMate - AI-Powered Document Assistant

IntraMate is an intelligent document assistant that uses RAG (Retrieval-Augmented Generation) to provide accurate answers from your documents. It features a modern React frontend and FastAPI backend, supporting multiple languages and document types.

## 🌟 Features

- **Document Processing**
  - Upload PDFs, DOCX, and TXT files
  - Automatic text chunking and embedding
  - Secure document storage and management

- **Intelligent Chat**
  - Context-aware responses using RAG
  - Multi-language support (English, Marathi, Hindi)
  - Source citations and references
  - Thumbs up/down feedback system

- **Modern UI/UX**
  - Clean, responsive design
  - Dark/Light theme support
  - Real-time loading states
  - Mobile-friendly interface

## 🛠️ Tech Stack

### Frontend
- React.js
- TypeScript
- TailwindCSS
- Axios for API calls

### Backend
- FastAPI
- LangChain
- OpenAI
- Tavily Search API

## 🚀 Getting Started

### Prerequisites
- Node.js 16+
- Python 3.8+
- OpenAI API key
- Tavily API key

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/ShivamChavan2311/onboardai.git
   cd onboardai
   ```

2. **Backend Setup**
   ```bash
   cd rag_app/backend
   python -m venv venv
   source venv/bin/activate  # On Windows: .\venv\Scripts\activate
   pip install -r requirements.txt
   ```

3. **Frontend Setup**
   ```bash
   cd ../frontend
   npm install
   ```

4. **Environment Setup**
   - Create `.env` file in backend directory:
     ```env
     OPENAI_API_KEY=your_openai_key
     TAVILY_API_KEY=your_tavily_key
     ```

### Running the Application

1. **Start the Backend**
   ```bash
   cd backend
   uvicorn main:app --reload
   ```
   Backend will run on http://localhost:8000

2. **Start the Frontend**
   ```bash
   cd frontend
   npm run dev
   ```
   Frontend will run on http://localhost:5173

## 💡 Usage

1. **Document Upload**
   - Navigate to the Upload page
   - Drag & drop or select files
   - Supported formats: PDF, DOCX, TXT

2. **Chat Interface**
   - Ask questions about your documents
   - View source references
   - Switch between languages
   - Provide feedback on answers

3. **Settings**
   - Configure API keys
   - Manage theme preferences
   - View upload history

## 🔒 Security Notes

- API keys are stored locally in browser storage
- Documents are processed securely
- No sensitive information is logged

## 📱 Deployment

The application is deployed at:
- Frontend: [Add your frontend deployment URL]
- Backend: [Add your backend deployment URL]

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details

## 👏 Acknowledgments

- OpenAI for the GPT models
- Tavily for web search capabilities
- FastAPI team for the excellent framework
- React community for components and inspiration

## 📧 Contact

Shivam Chavan - [Your Email]
Project Link: https://github.com/ShivamChavan2311/onboardai

---

Made with ❤️ by Shivam Chavan
