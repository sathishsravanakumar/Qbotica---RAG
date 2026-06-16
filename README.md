# qBotica RAG

A full-stack **Retrieval-Augmented Generation** app — upload a PDF and chat with an AI that answers strictly from that document, with page-level citations and an in-browser PDF viewer.

---

## Application Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                          USER UPLOADS PDF                           │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   PyPDF Loader      │  Extract text page by page
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │  Semantic Chunker   │  Split at meaning boundaries
                    └──────────┬──────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    ┌──────────────────┐             ┌──────────────────┐
    │   FAISS Index    │             │   BM25 Index     │
    │ (vector search)  │             │ (keyword search) │
    └────────┬─────────┘             └────────┬─────────┘
             │                                │
             └──────────────┬─────────────────┘
                            │  Also runs:
                            │  • LLM document overview (once)
                            │  • YAKE keyword extraction
                            │  • Word / page / reading stats
                            ▼
               ┌─────────────────────────┐
               │   Sidebar Intelligence  │  Summary · Topics · Stats
               └─────────────────────────┘

─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─

┌─────────────────────────────────────────────────────────────────────┐
│                          USER ASKS A QUESTION                       │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  + conversation history[]
                               ▼
                    ┌─────────────────────┐
                    │  Hybrid Retriever   │  FAISS 50% + BM25 50%
                    │  (top 5 chunks)     │  reciprocal rank fusion
                    └──────────┬──────────┘
                               │
                               ▼
                    ┌─────────────────────┐
                    │   Groq LLM          │  llama-3.1-8b-instant
                    │  (strict prompt)    │  Answers only from context
                    │                     │  Appends: CITED: 0,2
                    └──────────┬──────────┘
                               │
               ┌───────────────┴───────────────┐
               ▼                               ▼
    ┌──────────────────┐             ┌──────────────────┐
    │   Chat Answer    │             │  Citation Chips  │
    │  (in chat area)  │             │ Page X · Para Y  │
    └──────────────────┘             └────────┬─────────┘
                                              │ click
                                              ▼
                                   ┌──────────────────┐
                                   │  PDF Viewer      │
                                   │  Jump to page    │
                                   │  Highlight text  │
                                   └──────────────────┘
```

---

## Tech Stack

| Layer    | Tools                                                              |
| -------- | ------------------------------------------------------------------ |
| Backend  | FastAPI · LangChain · FAISS · BM25 · HuggingFace · Groq · YAKE    |
| Frontend | React 19 · Vite · Tailwind CSS · react-pdf                         |

---

## Getting Started

### 1. Backend

```bash
cd backend
python -m venv venv
venv\Scripts\activate        # Windows
pip install -r requirements.txt
```

Create `backend/.env`:
```
GROQ_API_KEY=your_key_here
```

```bash
uvicorn main:app --reload --port 8000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

> After every backend restart, re-upload your PDF — the BM25 index and retriever live in memory and are cleared on restart.

---

## Key Design Decisions

- **Semantic chunking** over fixed-size splits — chunks break at natural topic boundaries so retrieved excerpts are always coherent paragraphs.
- **Hybrid search** — dense FAISS catches meaning; sparse BM25 catches exact terms and acronyms. Both are fused 50/50.
- **LLM-declared citations** — the model appends `CITED: 0,2` to its answer; the backend parses this so only truly-used sources are shown, not keyword-overlapping ones.
- **No extra LLM calls for intelligence** — YAKE keyword extraction and reading stats are computed purely from text/metadata, keeping upload cost to a single LLM call (the document overview).
