import os
import shutil

import yake
from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from langchain.retrievers import EnsembleRetriever
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.retrievers import BM25Retriever
from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_experimental.text_splitter import SemanticChunker
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from pydantic import BaseModel

load_dotenv()

UPLOAD_DIR = "uploads"
VECTORSTORE_DIR = "vectorstore"
os.makedirs(UPLOAD_DIR, exist_ok=True)

NO_ANSWER_MESSAGE = "I cannot answer this based on the provided document."

RETRIEVER_K = 5
SUMMARY_SAMPLE_CHUNKS = 24
SUMMARY_SAMPLE_CHARS = 8000

embeddings = HuggingFaceEmbeddings(model_name="all-MiniLM-L6-v2")

vectorstore: FAISS | None = None
retriever: EnsembleRetriever | None = None
document_summary: str = ""
_llm: ChatGroq | None = None


def get_llm() -> ChatGroq:
    global _llm
    if _llm is None:
        if not os.getenv("GROQ_API_KEY"):
            raise HTTPException(
                status_code=500,
                detail="GROQ_API_KEY is not set. Add it to your .env file.",
            )
        _llm = ChatGroq(model="llama-3.1-8b-instant", temperature=0.0)
    return _llm

app = FastAPI(title="Qbotica RAG API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/pdfs", StaticFiles(directory=UPLOAD_DIR), name="pdfs")


class ChatRequest(BaseModel):
    message: str
    history: list[dict] | None = None


@app.get("/")
async def root():
    return {"status": "ok", "service": "Qbotica RAG API"}


def _build_document_summary(chunks: list) -> str:
    if not chunks:
        return ""

    step = max(1, len(chunks) // SUMMARY_SAMPLE_CHUNKS)
    sample = chunks[::step][:SUMMARY_SAMPLE_CHUNKS]
    sample_text = "\n\n".join(c.page_content for c in sample)[:SUMMARY_SAMPLE_CHARS]

    summary_prompt = (
        "Write a concise 4-6 sentence overview of the following document. "
        "Describe its overall topic/subject, type (e.g. novel, report, manual), "
        "and structure if apparent. Base this only on the excerpts below.\n\n"
        f"Excerpts:\n{sample_text}\n\nOverview:"
    )

    try:
        response = get_llm().invoke(summary_prompt)
        return response.content.strip()
    except Exception:
        return ""


def _extract_document_intelligence(chunks: list) -> dict:
    all_text = " ".join(c.page_content for c in chunks)
    total_words = len(all_text.split())
    page_count = max((c.metadata.get("page", 0) for c in chunks), default=0) + 1
    reading_time = max(1, round(total_words / 250))

    # YAKE: purely statistical, no model — n=3 allows up to 3-word phrases
    extractor = yake.KeywordExtractor(lan="en", n=3, dedupLim=0.7, top=10, features=None)
    raw = extractor.extract_keywords(all_text[:12000])
    # Lower YAKE score = more relevant; capitalise for display
    topics = [kw.strip().title() for kw, _ in raw]

    return {
        "total_words": total_words,
        "page_count": page_count,
        "reading_time_minutes": reading_time,
        "key_topics": topics,
    }


@app.post("/upload")
async def upload_pdf(file: UploadFile = File(...)):
    global vectorstore, retriever, document_summary

    if not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported.")

    file_path = os.path.join(UPLOAD_DIR, file.filename)
    try:
        with open(file_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    finally:
        file.file.close()

    try:
        loader = PyPDFLoader(file_path)
        pages = loader.load()

        splitter = SemanticChunker(embeddings)
        chunks = splitter.split_documents(pages)

        if not chunks:
            raise HTTPException(status_code=400, detail="No extractable text found in the PDF.")

        page_paragraph_counts: dict[int, int] = {}
        for chunk in chunks:
            page = chunk.metadata.get("page", 0)
            page_paragraph_counts[page] = page_paragraph_counts.get(page, 0) + 1
            chunk.metadata["paragraph"] = page_paragraph_counts[page]

        vectorstore = FAISS.from_documents(chunks, embeddings)
        vectorstore.save_local(VECTORSTORE_DIR)
        faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVER_K})

        bm25_retriever = BM25Retriever.from_documents(chunks)
        bm25_retriever.k = RETRIEVER_K

        retriever = EnsembleRetriever(
            retrievers=[bm25_retriever, faiss_retriever], weights=[0.5, 0.5]
        )

        document_summary = _build_document_summary(chunks)
        doc_intelligence = _extract_document_intelligence(chunks)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {exc}") from exc

    return {
        "status": "success",
        "filename": file.filename,
        "chunks_indexed": len(chunks),
        "summary": document_summary,
        "key_topics": doc_intelligence["key_topics"],
        "stats": {
            "pages": doc_intelligence["page_count"],
            "words": doc_intelligence["total_words"],
            "reading_time_minutes": doc_intelligence["reading_time_minutes"],
        },
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    if retriever is None:
        raise HTTPException(status_code=400, detail="No document has been uploaded yet.")

    docs = retriever.invoke(request.message)[:RETRIEVER_K]

    context_blocks = []
    sources = []
    for i, doc in enumerate(docs):
        page = doc.metadata.get("page", 0) + 1
        paragraph = doc.metadata.get("paragraph", 1)
        label = f"Page {page}, Paragraph {paragraph}"
        context_blocks.append(f"[{i}] [{label}]\n{doc.page_content}")
        sources.append(
            {
                "label": label,
                "page": page,
                "paragraph": paragraph,
                "snippet": doc.page_content[:300],
            }
        )

    context = "\n\n".join(context_blocks)
    overview = document_summary or "No overview available."

    system_content = (
        "You are an enterprise AI assistant that answers questions about a single uploaded document. "
        "Use the Document Overview and Relevant Excerpts below as your ONLY sources of information — "
        "you are strictly forbidden from using outside knowledge.\n\n"
        "Always try to give a helpful, complete answer. You MAY combine, synthesize, and reason across "
        "the Document Overview and Excerpts (e.g. to summarize, compare, or describe content spanning "
        "multiple sections). If asked for a summary of a section, give your best answer from available context. "
        f"Only reply exactly with '{NO_ANSWER_MESSAGE}' if the Overview and Excerpts are completely unrelated "
        "to the question's subject.\n\n"
        "After your answer, on a new line write exactly:\n"
        "CITED: <comma-separated excerpt numbers whose content you actually used, e.g. 0,2>\n"
        "If none of the numbered excerpts contributed to your answer, write: CITED: none\n\n"
        f"Document Overview:\n{overview}\n\n"
        f"Relevant Excerpts:\n{context}"
    )

    msgs = [SystemMessage(content=system_content)]
    for turn in (request.history or []):
        if turn.get("role") == "user":
            msgs.append(HumanMessage(content=turn["content"]))
        else:
            msgs.append(AIMessage(content=turn["content"]))
    msgs.append(HumanMessage(content=request.message))

    try:
        response = get_llm().invoke(msgs)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM request failed: {exc}") from exc

    raw = response.content

    cited_indices: set[int] = set()
    if "\nCITED:" in raw:
        answer, cited_part = raw.rsplit("\nCITED:", 1)
        answer = answer.strip()
        cited_str = cited_part.strip()
        if cited_str.lower() != "none":
            for token in cited_str.split(","):
                try:
                    cited_indices.add(int(token.strip()))
                except ValueError:
                    pass
    else:
        answer = raw.strip()

    result = {"response": answer}
    if cited_indices:
        result["sources"] = [s for i, s in enumerate(sources) if i in cited_indices]

    return result
