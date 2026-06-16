import { useState } from 'react'
import { Bot, ChevronDown, FileText, User } from 'lucide-react'

function Avatar({ isUser }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full shadow-sm ${
        isUser ? 'bg-[#0a192f]' : 'bg-gradient-to-br from-blue-500 to-blue-600'
      }`}
    >
      {isUser ? <User size={15} className="text-white" /> : <Bot size={15} className="text-white" />}
    </div>
  )
}

function Citation({ source, onPageClick, responseText }) {
  const [open, setOpen] = useState(false)

  return (
    <div>
      <button
        onClick={() => {
          setOpen((prev) => !prev)
          onPageClick?.(source.page, source.snippet, responseText)
        }}
        className="flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-600 transition-colors hover:border-blue-200 hover:bg-blue-100"
      >
        <FileText size={12} />
        Source: {source.label}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="animate-fade-in-up mt-1.5 max-w-sm rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-xs leading-relaxed text-slate-600">
          <p className="line-clamp-6 whitespace-pre-wrap">{source.snippet}&hellip;</p>
        </div>
      )}
    </div>
  )
}

export default function ChatMessage({ role, content, sources, timestamp, onCitationClick }) {
  const isUser = role === 'user'

  return (
    <div className={`animate-fade-in-up flex w-full gap-3 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      <Avatar isUser={isUser} />
      <div className={`flex max-w-[75%] flex-col gap-1.5 ${isUser ? 'items-end' : 'items-start'}`}>
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap shadow-sm ${
            isUser
              ? 'rounded-tr-sm bg-[#0a192f] text-white'
              : 'rounded-tl-sm border border-slate-200 bg-white text-slate-800'
          }`}
        >
          {content}
        </div>

        {sources?.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {sources.map((source, idx) => (
              <Citation key={idx} source={source} onPageClick={onCitationClick} responseText={content} />
            ))}
          </div>
        )}

        {timestamp && <span className="px-1 text-[11px] text-slate-400">{timestamp}</span>}
      </div>
    </div>
  )
}
