import os
import shutil

from dotenv import load_dotenv
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from langchain.retrievers import EnsembleRetriever
from langchain_community.vectorstores import FAISS
from langchain_community.document_loaders import PyPDFLoader
from langchain_community.retrievers import BM25Retriever
from langchain_core.prompts import PromptTemplate
from langchain_experimental.text_splitter import SemanticChunker
from langchain_groq import ChatGroq
from langchain_huggingface import HuggingFaceEmbeddings
from pydantic import BaseModel

load_dotenv()

UPLOAD_DIR = "uploads"
VECTORSTORE_DIR = "vectorstore"
os.makedirs(UPLOAD_DIR, exist_ok=True)

NO_ANSWER_MESSAGE = "I cannot answer this based on the provided document."

SYSTEM_PROMPT = f"""You are an enterprise AI assistant that answers questions about a single uploaded document. Use the Document Overview and the Relevant Excerpts below as your ONLY sources of information — you are strictly forbidden from using outside knowledge.

Always try to give a helpful, complete answer:
- You MAY combine, synthesize, and reason across the Document Overview and the Relevant Excerpts (for example, to summarize, compare, or describe content spanning multiple sections).
- If the user asks for a summary, overview, or description of part of the document (e.g. "the first two chapters," "the introduction"), use whatever relevant content is available in the Overview and Excerpts to give the best possible answer, even if it does not cover that section exhaustively.
- Only reply exactly with '{NO_ANSWER_MESSAGE}' if the Document Overview and Relevant Excerpts are about a completely different subject than what the question asks about.

Document Overview:
{{overview}}

Relevant Excerpts:
{{context}}

Question: {{question}}

Answer:"""

prompt = PromptTemplate(template=SYSTEM_PROMPT, input_variables=["overview", "context", "question"])

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


class ChatRequest(BaseModel):
    message: str


@app.get("/")
async def root():
    return {"status": "ok", "service": "Qbotica RAG API"}


def _build_document_summary(chunks: list) -> str:
    """Summarize a representative sample of chunks so broad/overview
    questions ("what is this document about?", "summarize chapter 1")
    have useful context even when no single chunk literally matches."""
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

        # Semantic chunking: split on meaning/structural boundaries instead of
        # fixed character counts, so a paragraph or thought is never cut in half.
        splitter = SemanticChunker(embeddings)
        chunks = splitter.split_documents(pages)

        if not chunks:
            raise HTTPException(status_code=400, detail="No extractable text found in the PDF.")

        # Number chunks within each page so citations can reference
        # "Page X, Paragraph Y".
        page_paragraph_counts: dict[int, int] = {}
        for chunk in chunks:
            page = chunk.metadata.get("page", 0)
            page_paragraph_counts[page] = page_paragraph_counts.get(page, 0) + 1
            chunk.metadata["paragraph"] = page_paragraph_counts[page]

        # Dense retrieval (FAISS vector similarity).
        vectorstore = FAISS.from_documents(chunks, embeddings)
        vectorstore.save_local(VECTORSTORE_DIR)
        faiss_retriever = vectorstore.as_retriever(search_kwargs={"k": RETRIEVER_K})

        # Sparse retrieval (BM25 keyword matching) for exact terms,
        # acronyms, and identifiers that embeddings can miss.
        bm25_retriever = BM25Retriever.from_documents(chunks)
        bm25_retriever.k = RETRIEVER_K

        # Hybrid search: combine both via reciprocal rank fusion.
        retriever = EnsembleRetriever(
            retrievers=[bm25_retriever, faiss_retriever], weights=[0.5, 0.5]
        )

        # Document-level overview so broad questions (e.g. "what is this
        # about?", "summarize the first chapters") have useful context even
        # when no single retrieved chunk literally contains the answer.
        document_summary = _build_document_summary(chunks)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to process PDF: {exc}") from exc

    return {
        "status": "success",
        "filename": file.filename,
        "chunks_indexed": len(chunks),
    }


@app.post("/chat")
async def chat(request: ChatRequest):
    if retriever is None:
        raise HTTPException(status_code=400, detail="No document has been uploaded yet.")

    docs = retriever.invoke(request.message)[:RETRIEVER_K]

    context_blocks = []
    sources = []
    for doc in docs:
        page = doc.metadata.get("page", 0) + 1
        paragraph = doc.metadata.get("paragraph", 1)
        label = f"Page {page}, Paragraph {paragraph}"
        context_blocks.append(f"[{label}]\n{doc.page_content}")
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
    formatted_prompt = prompt.format(overview=overview, context=context, question=request.message)

    try:
        response = get_llm().invoke(formatted_prompt)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"LLM request failed: {exc}") from exc

    answer = response.content
    result = {"response": answer}
    if answer.strip() != NO_ANSWER_MESSAGE:
        result["sources"] = sources

    return result
