import { Bot, Loader2 } from 'lucide-react'

export default function TypingIndicator() {
  return (
    <div className="animate-fade-in-up flex w-full gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-blue-500 to-blue-600 shadow-sm">
        <Bot size={15} className="text-white" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-500 shadow-sm">
        <Loader2 size={16} className="animate-spin text-blue-500" />
        <span>Synthesizing response&hellip;</span>
      </div>
    </div>
  )
}
