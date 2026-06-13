import { Bot, FileText, Loader2, RotateCcw, UploadCloud } from 'lucide-react'
import StatusBadge from './StatusBadge'
import { STATUS } from '../constants'

const TECH_BADGES = ['LangChain', 'FAISS', 'BM25', 'Groq Llama 3.1']

export default function Sidebar({
  status,
  fileName,
  chunkCount,
  fileInputRef,
  onUploadClick,
  onFileChange,
  onNewChat,
  hasMessages,
}) {
  return (
    <aside className="flex w-full shrink-0 flex-col bg-gradient-to-b from-[#0a192f] to-[#0d2747] text-white lg:h-screen lg:w-80">
      {/* Brand */}
      <div className="px-6 pt-6 pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-blue-400 to-blue-600 shadow-lg shadow-blue-900/40">
            <Bot size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-white">qBotica RAG</h1>
            <p className="text-xs text-slate-400">Document Intelligence Assistant</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {/* Knowledge base card */}
        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-inner">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-xs font-semibold tracking-wider text-slate-400 uppercase">
              Knowledge Base
            </span>
            <StatusBadge status={status} />
          </div>

          {fileName ? (
            <div className="mb-3 flex items-start gap-2 rounded-xl bg-white/5 px-3 py-2.5">
              <FileText size={16} className="mt-0.5 shrink-0 text-blue-300" />
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-slate-100" title={fileName}>
                  {fileName}
                </p>
                {chunkCount != null && (
                  <p className="text-xs text-slate-400">{chunkCount} chunks indexed</p>
                )}
              </div>
            </div>
          ) : (
            <p className="mb-3 text-sm text-slate-400">
              No document loaded yet. Upload a PDF to build a searchable knowledge base.
            </p>
          )}

          <button
            onClick={onUploadClick}
            disabled={status === STATUS.VECTORIZING}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-blue-900/30 transition-all hover:bg-blue-500 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-60 disabled:shadow-none"
          >
            {status === STATUS.VECTORIZING ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <UploadCloud size={16} />
            )}
            {fileName ? 'Replace Document' : 'Upload Knowledge Base'}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf"
            className="hidden"
            onChange={onFileChange}
          />
        </div>

        {hasMessages && (
          <button
            onClick={onNewChat}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:border-white/20 hover:bg-white/5 hover:text-white"
          >
            <RotateCcw size={14} />
            New Conversation
          </button>
        )}
      </div>

      {/* Footer */}
      <div className="border-t border-white/10 px-6 py-5">
        <p className="mb-2 text-[11px] font-medium tracking-wider text-slate-500 uppercase">
          Powered by
        </p>
        <div className="flex flex-wrap gap-1.5">
          {TECH_BADGES.map((tech) => (
            <span
              key={tech}
              className="rounded-md border border-white/10 bg-white/5 px-2 py-1 text-[11px] font-medium text-slate-400"
            >
              {tech}
            </span>
          ))}
        </div>
      </div>
    </aside>
  )
}
