# qBotica RAG

An enterprise-styled, full-stack **Retrieval-Augmented Generation (RAG)** application. Upload a PDF and chat with an AI assistant that answers **strictly from that document** — with page-level citations, an in-browser PDF viewer with paragraph highlighting, multi-turn conversation memory, and algorithmic document intelligence.

| Layer    | Stack                                                                                      |
| -------- | ------------------------------------------------------------------------------------------ |
| Backend  | FastAPI · LangChain · FAISS · BM25 · HuggingFace Embeddings · Groq (Llama 3.1) · YAKE    |
| Frontend | React 19 · Vite · Tailwind CSS v4 · react-pdf · lucide-react                              |

---

## Table of Contents

- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Project Structure](#project-structure)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [RAG Pipeline Details](#rag-pipeline-details)
- [Frontend UI Overview](#frontend-ui-overview)
- [Configuration](#configuration)
- [Limitations](#limitations)

---

## Features

### Core RAG capabilities

- **PDF ingestion** — upload any PDF via `multipart/form-data`; parsed page-by-page with `PyPDFLoader`.
- **Semantic chunking** — `SemanticChunker` groups sentences by embedding similarity so chunks break at natural topic boundaries, not mid-sentence.
- **Hybrid search (dense + sparse)** — every query hits both:
  - **FAISS** vector index (dense, semantic similarity via `all-MiniLM-L6-v2`), and
  - **BM25** keyword index (sparse, exact-term / acronym matching),

  fused via `EnsembleRetriever` (50/50 reciprocal rank fusion, k=5).
- **Grounded answers** — a strict system prompt forces the LLM (`llama-3.1-8b-instant`, temperature 0) to answer only from retrieved context plus a document overview; outside knowledge is forbidden.
- **Document overview** — at upload time the LLM reads a representative sample of chunks and writes a 4–6 sentence overview, giving broad/summary questions useful context without re-indexing.

### Smart semantic citations

- Retrieved chunks are numbered `[0]`, `[1]`, … and injected into the prompt.
- After answering, the LLM appends a `CITED: 0,2` line declaring exactly which excerpts it used.
- The backend parses this line, filters sources to only those cited, and returns them — so citations are semantically relevant, not keyword-overlapping noise.
- Out-of-scope questions (`"what's today's date?"`) get no citation badges at all.

### In-browser PDF viewer with paragraph highlighting

- Clicking any citation chip opens a slide-in PDF viewer (powered by `react-pdf`) that jumps directly to the cited page.
- The text layer is scanned post-render and every span matching the retrieved chunk text or the LLM answer text is highlighted in blue — so e.g. "Ken Follett" lights up even if the name appears outside the specific retrieved chunk.
- In-panel page navigation (previous / next) and a backdrop overlay on mobile.

### Multi-turn conversation memory

- The frontend sends the full conversation history (as `[{role, content}]`) with every request.
- The backend builds a proper `[SystemMessage, HumanMessage, AIMessage, …, HumanMessage]` list for ChatGroq so the LLM retains context across the entire session.
- "New Conversation" clears history without re-uploading the document.

### Algorithmic document intelligence (no extra LLM calls)

Surfaced in the sidebar immediately after upload — derived entirely from chunk text/metadata, not from any additional model call:

| Signal              | Method                                                                     |
| ------------------- | -------------------------------------------------------------------------- |
| **Page count**      | `max(chunk.metadata["page"])` across all chunks                            |
| **Word count**      | `len(all_text.split())`                                                    |
| **Reading time**    | `words ÷ 250 wpm` (rounded up, minimum 1 min)                              |
| **Key topics**      | **YAKE** (Yet Another Keyword Extractor) — statistical TF-IDF-like scoring, first 12 000 chars, up to 3-word phrases, top 10 results |
| **Document summary** | LLM overview computed once at upload (sunk cost; no new call)             |

Topic chips are clickable — clicking one pre-fills the chat input with *"Tell me about [topic]"*.

### UX polish

- **Live status badge** — `Awaiting upload` (amber) → `Vectorizing…` (spinner) → `Active` (pulsing green).
- **Auto-scrolling chat** with avatars, timestamps, fade-in animations, and a typing indicator.
- **Auto-resizing composer** — grows with content; Enter to send, Shift+Enter for newline.
- **Collapsible document summary** — "Show summary / Hide summary" toggle in the sidebar.

---

## Architecture

### Component diagram

```
Browser (React + Vite)                    Backend (FastAPI)
─────────────────────────────────────     ──────────────────────────────────────────────
 Sidebar                                   POST /upload
   • Knowledge Base card                     PyPDFLoader → SemanticChunker
   • Document Intelligence card              HF Embeddings (all-MiniLM-L6-v2)
   • Topic chips                             FAISS index  +  BM25 index
 Chat area                                   EnsembleRetriever (hybrid)
   • ChatMessage + Citation chips            _build_document_summary (LLM, once)
   • TypingIndicator                         _extract_document_intelligence (YAKE, stats)
   • ChatInput                            POST /chat
 PdfViewerPanel (react-pdf)                  EnsembleRetriever.invoke(query)
   • Page jump + text highlighting           [SystemMessage + history + HumanMessage]
                                             → ChatGroq (llama-3.1-8b-instant)
                                             Parse "CITED: 0,2" → filter sources
 GET /pdfs/{filename}  ←── StaticFiles mount (serves uploaded PDFs to the viewer)
```

### Upload flow

```
User selects PDF
  → POST /upload (multipart)
    → save to uploads/
    → PyPDFLoader → pages[]
    → SemanticChunker (embeds every sentence to find breakpoints)
    → tag each chunk with page + paragraph number
    → FAISS.from_documents() + save_local()
    → BM25Retriever.from_documents()
    → EnsembleRetriever(BM25 50% + FAISS 50%)
    → _build_document_summary() — LLM overview (24 evenly-sampled chunks)
    → _extract_document_intelligence() — YAKE topics + word/page/reading stats
  ← { status, filename, chunks_indexed, summary, key_topics, stats }
```

### Chat flow

```
User types message (frontend sends full history[])
  → POST /chat { message, history }
    → EnsembleRetriever.invoke(message) → top-5 chunks
    → number chunks [0]…[4] for LLM citation tracking
    → build [SystemMessage(context + overview), *history turns, HumanMessage]
    → ChatGroq.invoke(messages)
    → parse "CITED: 0,2" suffix → filter sources to cited only
  ← { response, sources[] }  (sources omitted if CITED: none)
```

---

## Tech Stack

### Backend (`/backend`)

| Component            | Library / Service                                              | Purpose                                                              |
| -------------------- | -------------------------------------------------------------- | -------------------------------------------------------------------- |
| API framework        | **FastAPI** + **Uvicorn**                                      | REST API, CORS middleware, static file serving (`/pdfs/`)            |
| PDF parsing          | **pypdf** / `PyPDFLoader`                                      | Per-page text extraction with page metadata                          |
| Semantic chunking    | **LangChain Experimental** `SemanticChunker`                   | Splits text at embedding-similarity breakpoints                      |
| Embeddings           | **HuggingFace** `sentence-transformers` (`all-MiniLM-L6-v2`)  | Chunk and query vectors                                              |
| Dense retrieval      | **FAISS** (`faiss-cpu`)                                        | Vector similarity index                                              |
| Sparse retrieval     | **rank-bm25** (`BM25Retriever`)                                | Keyword / lexical index                                              |
| Hybrid retrieval     | **LangChain** `EnsembleRetriever`                              | Fuses FAISS + BM25 via reciprocal rank fusion                        |
| LLM                  | **langchain-groq** → Groq Cloud (`llama-3.1-8b-instant`)      | Answer generation + document summary + semantic citation declaration  |
| Keyword extraction   | **YAKE** (`yake==0.4.8`)                                       | Statistical keyphrase extraction — no model, no API call             |
| Config               | **python-dotenv**                                              | Loads `GROQ_API_KEY` from `.env`                                     |

### Frontend (`/frontend`)

| Component       | Library               | Purpose                                                      |
| --------------- | --------------------- | ------------------------------------------------------------ |
| UI framework    | **React 19**          | Component-based SPA                                          |
| Build tool      | **Vite**              | Dev server + HMR + production bundling                       |
| Styling         | **Tailwind CSS v4**   | Utility-first styling                                        |
| PDF rendering   | **react-pdf**         | In-browser PDF viewer; wraps `pdfjs-dist`                    |
| Icons           | **lucide-react**      | Bot, UploadCloud, FileText, ChevronDown, X, etc.             |
| Font            | **Inter** (Google)    | Clean enterprise sans-serif                                  |

---

## Project Structure

```
Qbotica - RAG/
├── backend/
│   ├── main.py              # FastAPI app — /upload, /chat, /pdfs static mount
│   ├── requirements.txt     # Python dependencies (incl. yake==0.4.8)
│   ├── .env                 # GROQ_API_KEY (not committed)
│   ├── uploads/             # Saved PDF files (served at /pdfs/<filename>)
│   └── vectorstore/         # Persisted FAISS index (index.faiss / index.pkl)
│
├── frontend/
│   ├── index.html
│   ├── vite.config.js
│   └── src/
│       ├── main.jsx              # pdfjs worker setup + React root
│       ├── App.jsx               # Top-level state & handlers
│       ├── constants.js          # API_BASE, STATUS enum
│       ├── index.css             # Tailwind import, fonts, animations
│       └── components/
│           ├── Sidebar.jsx           # Branding, KB card, Document Intelligence card
│           ├── ChatMessage.jsx       # Message bubble, Citation chips
│           ├── ChatInput.jsx         # Auto-resizing textarea + send
│           ├── PdfViewerPanel.jsx    # Slide-in PDF viewer with highlighting
│           ├── TypingIndicator.jsx   # "Synthesizing…" indicator
│           ├── EmptyState.jsx        # Pre/post-upload guidance
│           └── StatusBadge.jsx       # Awaiting / Vectorizing / Active
│
└── README.md
```

---

## Getting Started

### Prerequisites

- Python 3.11+
- Node.js 18+ / npm
- A [Groq API key](https://console.groq.com/) (free tier available)

### 1. Backend setup

```bash
cd backend
python -m venv venv

# Activate
venv\Scripts\activate        # Windows
source venv/bin/activate     # macOS / Linux

pip install -r requirements.txt
```

Create `backend/.env`:

```env
GROQ_API_KEY=your_groq_api_key_here
```

Start the server:

```bash
uvicorn main:app --reload --reload-include "main.py" --host 0.0.0.0 --port 8000
```

> **Note:** The first run downloads `all-MiniLM-L6-v2` (~90 MB). Uploading a large PDF takes 1–2 minutes because `SemanticChunker` embeds every sentence to find split points, then the LLM generates a document overview.

### 2. Frontend setup

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173). The frontend calls `http://localhost:8000` by default (see `src/constants.js`).

> **Important:** After every backend restart you must re-upload the PDF. The FAISS index is persisted to disk but the BM25 retriever, EnsembleRetriever, and `document_summary` live in process memory and are cleared on restart.

---

## API Reference

### `GET /`
Health check.
```json
{ "status": "ok", "service": "Qbotica RAG API" }
```

### `GET /pdfs/{filename}`
Serves the uploaded PDF file (used by the in-browser PDF viewer).

### `POST /upload`
Processes a PDF and builds the hybrid retriever + document intelligence.

- **Request**: `multipart/form-data`, field `file` (`.pdf` only)
- **Response** `200 OK`:
  ```json
  {
    "status": "success",
    "filename": "Eye of the Needle.pdf",
    "chunks_indexed": 741,
    "summary": "Eye of the Needle is a World War II espionage thriller by Ken Follett...",
    "key_topics": ["German Spy", "World War Ii", "Scottish Island", "..."],
    "stats": {
      "pages": 276,
      "words": 98432,
      "reading_time_minutes": 394
    }
  }
  ```
- **Errors**: `400` (not a PDF / no text), `500` (processing failure)

### `POST /chat`
Answers a question grounded strictly in the uploaded document, with conversation history support.

- **Request**:
  ```json
  {
    "message": "Who is the author?",
    "history": [
      { "role": "user", "content": "What is this book about?" },
      { "role": "assistant", "content": "Eye of the Needle is a WWII thriller..." }
    ]
  }
  ```
- **Response** `200 OK` (with citations):
  ```json
  {
    "response": "The author of the novel is Ken Follett.",
    "sources": [
      {
        "label": "Page 273, Paragraph 1",
        "page": 273,
        "paragraph": 1,
        "snippet": "KEN FOLLETT'S career as a bestselling author has spanned..."
      }
    ]
  }
  ```
- **Response** `200 OK` (out-of-scope — no `sources` key):
  ```json
  { "response": "I cannot answer this based on the provided document." }
  ```
- **Errors**: `400` (no document uploaded), `500` (missing API key / LLM failure)

---

## RAG Pipeline Details

1. **Load** — `PyPDFLoader` extracts one `Document` per page with `metadata.page` (0-indexed).
2. **Semantic chunk** — `SemanticChunker(embeddings)` splits pages where consecutive sentence embeddings diverge most, preserving coherent paragraphs.
3. **Tag paragraphs** — chunks are numbered sequentially within each page (`metadata.paragraph`), enabling "Page 4, Paragraph 2" citations.
4. **Index (dual)**:
   - **FAISS**: chunks are embedded with `all-MiniLM-L6-v2`, stored in a vector index persisted to `backend/vectorstore/`.
   - **BM25**: same chunks indexed for lexical search (in-memory, rebuilt on each upload).
5. **Document overview** — `_build_document_summary()` samples 24 evenly-spaced chunks (up to 8 000 chars total), sends them to the LLM once, and stores the 4–6 sentence overview. Broad questions like "what is this book about?" use this rather than failing to find a single matching chunk.
6. **Document intelligence** — `_extract_document_intelligence()` runs entirely on text/metadata without any model call: YAKE statistical keyphrase extraction on the first 12 000 chars, plus word count, page count, and reading time.
7. **Hybrid retrieval** — `EnsembleRetriever` queries both indexes (k=5) and fuses ranked results via reciprocal rank fusion (50% BM25 / 50% FAISS).
8. **Semantic citation** — retrieved chunks are numbered `[0]`…`[4]` in the prompt. The system instructs the LLM to append `CITED: 0,2` (or `CITED: none`). The backend parses this suffix and returns only the declared sources.
9. **Multi-turn memory** — the frontend sends `history[]` with every request. The backend builds `[SystemMessage, *history_turns, HumanMessage]` so the LLM tracks context across the conversation.

---

## Frontend UI Overview

| Component             | File                   | Description                                                                                         |
| --------------------- | ---------------------- | --------------------------------------------------------------------------------------------------- |
| **App**               | `App.jsx`              | Owns all state: status, fileName, messages, history, PDF viewer, document intelligence data         |
| **Sidebar**           | `Sidebar.jsx`          | Knowledge Base card (status badge, file info, upload button) + Document Intelligence card (stats, collapsible summary, topic chips) |
| **ChatMessage**       | `ChatMessage.jsx`      | Message bubble with avatar, timestamp, and expandable `Citation` chips that open the PDF viewer     |
| **PdfViewerPanel**    | `PdfViewerPanel.jsx`   | Slide-in panel with `react-pdf` `<Document>` + `<Page>`, page navigation, and post-render text-layer highlight injection |
| **ChatInput**         | `ChatInput.jsx`        | Auto-resizing `<textarea>`, send button, disabled until status is `Active`                          |
| **TypingIndicator**   | `TypingIndicator.jsx`  | Animated dots while `/chat` is in-flight                                                            |
| **EmptyState**        | `EmptyState.jsx`       | Contextual guidance — "upload a document" / "ask away"                                              |
| **StatusBadge**       | `StatusBadge.jsx`      | `Awaiting upload` (amber) / `Vectorizing…` (spinning) / `Active` (pulsing green)                  |

### PDF highlighting

After `react-pdf` renders the text layer, `applyHighlight()` scans every `.react-pdf__Page__textContent span`, normalises whitespace, and blue-highlights any span whose text appears in either the retrieved chunk snippet **or** the LLM's answer. This means named entities that appear in the answer (e.g. "Ken Follett") are highlighted even if they fall outside the specific cited chunk.

---

## Configuration

| Variable                | Location                    | Default                     | Description                                        |
| ----------------------- | --------------------------- | --------------------------- | -------------------------------------------------- |
| `GROQ_API_KEY`          | `backend/.env`              | —                           | Required to call the Groq LLM                      |
| `API_BASE`              | `frontend/src/constants.js` | `http://localhost:8000`     | Backend URL called by the frontend                 |
| `RETRIEVER_K`           | `backend/main.py`           | `5`                         | Chunks retrieved per query from each index         |
| `SUMMARY_SAMPLE_CHUNKS` | `backend/main.py`           | `24`                        | Chunks sampled for the document overview           |
| `SUMMARY_SAMPLE_CHARS`  | `backend/main.py`           | `8000`                      | Max chars sent to LLM for the overview             |
| LLM model               | `backend/main.py`           | `llama-3.1-8b-instant`      | Groq model used for answers + document summary     |
| Embedding model         | `backend/main.py`           | `all-MiniLM-L6-v2`          | HuggingFace model for chunk + query vectors        |

---

## Limitations

- **Single active document** — uploading a new PDF replaces the previous index; no multi-document support.
- **In-memory BM25** — the BM25 retriever is rebuilt on each upload and lives in process memory. After a backend restart the PDF must be re-uploaded (the FAISS index is persisted to disk, but BM25 is not).
- **Upload latency** — `SemanticChunker` embeds every sentence to detect breakpoints; large PDFs (200+ pages) can take 1–2 minutes.
- **No authentication** — CORS is open to all origins. Not intended for production deployment as-is.
- **pdfjs worker** — `react-pdf` requires the `pdfjs-dist` web worker to be explicitly set in `main.jsx`; the worker URL is resolved at Vite build time via `new URL(...)`.
