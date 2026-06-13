import { Bot } from 'lucide-react'

export default function EmptyState({ hasDocument }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="relative">
        <div className="absolute inset-0 rounded-3xl bg-blue-400/30 blur-2xl" />
        <div className="relative flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-blue-500 to-[#0a192f] shadow-xl shadow-blue-900/20">
          <Bot size={36} className="text-white" />
        </div>
      </div>
      <div>
        <h2 className="text-lg font-semibold text-slate-800">
          {hasDocument ? 'Ask away' : 'Ready when you are'}
        </h2>
        <p className="mx-auto mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
          {hasDocument
            ? 'Your document is indexed and ready. Ask a question and qBotica will answer using only its contents — with citations.'
            : 'Upload a PDF using the panel on the left to build your knowledge base. qBotica will answer your questions using only that document — with citations.'}
        </p>
      </div>
    </div>
  )
}
