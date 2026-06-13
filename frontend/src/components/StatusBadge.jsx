import { Loader2 } from 'lucide-react'
import { STATUS } from '../constants'

export default function StatusBadge({ status }) {
  if (status === STATUS.VECTORIZING) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/20">
        <Loader2 size={12} className="animate-spin" />
        Vectorizing
      </span>
    )
  }

  if (status === STATUS.ACTIVE) {
    return (
      <span className="flex items-center gap-1.5 rounded-full bg-emerald-400/10 px-2.5 py-1 text-xs font-medium text-emerald-300 ring-1 ring-emerald-400/20">
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-400" />
        </span>
        Active
      </span>
    )
  }

  return (
    <span className="flex items-center gap-1.5 rounded-full bg-amber-400/10 px-2.5 py-1 text-xs font-medium text-amber-300 ring-1 ring-amber-400/20">
      <span className="h-2 w-2 rounded-full bg-amber-400" />
      Awaiting upload
    </span>
  )
}
