import { useEffect, useRef } from 'react'
import { Loader2, Send } from 'lucide-react'

export default function ChatInput({ value, onChange, onSend, onKeyDown, disabled, isLoading, placeholder }) {
  const textareaRef = useRef(null)

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`
  }, [value])

  return (
    <footer className="border-t border-slate-200 bg-white/90 px-4 py-4 backdrop-blur sm:px-6">
      <div className="mx-auto flex max-w-3xl items-end gap-3">
        <div className="flex flex-1 items-end rounded-2xl border border-slate-300 bg-slate-50 transition-colors focus-within:border-blue-500 focus-within:bg-white focus-within:ring-4 focus-within:ring-blue-100">
          <textarea
            ref={textareaRef}
            rows={1}
            value={value}
            onChange={onChange}
            onKeyDown={onKeyDown}
            disabled={disabled}
            placeholder={placeholder}
            className="max-h-[120px] flex-1 resize-none bg-transparent px-4 py-3 text-sm text-slate-800 outline-none placeholder:text-slate-400 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </div>
        <button
          onClick={onSend}
          disabled={disabled || !value.trim()}
          className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[#0a192f] text-white shadow-lg shadow-slate-900/10 transition-all hover:bg-blue-600 hover:shadow-blue-500/30 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
        </button>
      </div>
      <p className="mx-auto mt-2 max-w-3xl text-center text-[11px] text-slate-400">
        qBotica answers strictly from your uploaded document and may be inaccurate.
      </p>
    </footer>
  )
}
