# Landing.AI ADE Document Extraction Application

A full-stack web application that provides document parsing, data extraction, and chat capabilities using the Landing.AI ADE (AI Document Extraction) platform.

## Features

- **Parse**: Upload PDFs and images, view the document with bounding box overlays showing extracted chunks
- **Extract**: Define custom schemas and extract structured data from documents
- **Chat**: Ask questions about your documents using Claude AI

## Tech Stack

- **Backend**: Python with FastAPI
- **Frontend**: React with TypeScript and Vite
- **Styling**: Tailwind CSS
- **PDF Rendering**: react-pdf
- **APIs**: Landing.AI ADE, Anthropic Claude

## Prerequisites

- Python 3.9+
- Node.js 18+
- Landing.AI ADE API key (`VISION_AGENT_API_KEY`)
- Anthropic API key (`ANTHROPIC_API_KEY`) - for chat feature

## Setup

### Backend

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Create a virtual environment (optional but recommended):
   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```

4. Configure environment variables:
   - Copy `.env.example` to `.env`
   - Add your API keys:
     ```
     VISION_AGENT_API_KEY=your_landing_ai_key
     ANTHROPIC_API_KEY=your_anthropic_key
     ```

5. Start the backend server:
   ```bash
   uvicorn main:app --reload --port 8000
   ```

### Frontend

1. Navigate to the frontend directory:
   ```bash
   cd frontend
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the development server:
   ```bash
   npm run dev
   ```

4. Open your browser to `http://localhost:5173`

## Usage

1. **Upload a Document**: Click "Upload Document" and select a PDF, PNG, JPG, TIFF, or BMP file

2. **View Parse Results**:
   - The left panel shows the document with colored overlays indicating extracted chunks
   - The right panel (Parse tab) shows chunk details and full markdown output
   - Click on chunks to highlight them

3. **Extract Data**:
   - Switch to the Extract tab
   - Use preset templates or define custom fields
   - Click "Extract Data" to get structured results

4. **Chat with Document**:
   - Switch to the Chat tab
   - Ask questions about the document content
   - The AI will answer based on the parsed content

## API Endpoints

- `POST /api/parse` - Parse an uploaded document
- `POST /api/extract` - Extract data using a JSON schema
- `POST /api/chat` - Chat with the document
- `GET /health` - Health check

## Project Structure

```
landing-ai-ade-app/
├── backend/
│   ├── main.py           # FastAPI application entry point
│   ├── routers/          # API route handlers
│   │   ├── parse.py      # Document parsing endpoint
│   │   ├── extract.py    # Data extraction endpoint
│   │   └── chat.py       # Chat endpoint
│   ├── services/         # Business logic
│   │   └── ade_service.py
│   └── models/           # Pydantic models
│       └── schemas.py
├── frontend/
│   ├── src/
│   │   ├── App.tsx       # Main application component
│   │   ├── components/   # React components
│   │   ├── hooks/        # Custom React hooks
│   │   ├── types/        # TypeScript type definitions
│   │   └── utils/        # Utility functions
│   └── ...
└── README.md
```

## Chunk Types

The parser identifies different types of content:
- **text** (blue): Regular text content
- **table** (green): Tables and tabular data
- **figure** (orange): Images and figures
- **title** (purple): Headers and titles
- **caption** (pink): Image/figure captions
- **form_field** (teal): Form fields

## License

MIT
