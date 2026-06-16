import { useCallback, useEffect, useRef, useState } from 'react'
import { Document, Page } from 'react-pdf'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { API_BASE } from '../constants'

export default function PdfViewerPanel({ open, page, snippet, response, fileName, onClose }) {
  const [numPages, setNumPages] = useState(null)
  const [currentPage, setCurrentPage] = useState(page)
  const containerRef = useRef(null)

  useEffect(() => {
    setCurrentPage(page)
  }, [page])

  const applyHighlight = useCallback(() => {
    if (!containerRef.current) return
    const textLayer = containerRef.current.querySelector('.react-pdf__Page__textContent')
    if (!textLayer) return

    // Build a set of normalised source texts to search in:
    // 1. The retrieved chunk snippet (location context)
    // 2. The LLM's actual answer (so e.g. "Ken Follett" lights up even if it's
    //    not inside the specific retrieved chunk that was clicked)
    const searchTexts = [snippet, response]
      .filter(Boolean)
      .map((t) => t.replace(/\s+/g, ' ').toLowerCase())

    textLayer.querySelectorAll('span').forEach((span) => {
      span.style.removeProperty('background')
      span.style.removeProperty('border-radius')

      const text = (span.textContent || '').replace(/\s+/g, ' ').toLowerCase().trim()
      // Skip very short tokens to avoid false positives on common words
      if (text.length > 4 && searchTexts.some((src) => src.includes(text))) {
        span.style.background = 'rgba(59, 130, 246, 0.4)'
        span.style.borderRadius = '2px'
      }
    })
  }, [snippet, response])

  // Re-highlight when snippet changes on the same page (text layer already rendered)
  useEffect(() => {
    applyHighlight()
  }, [applyHighlight])

  const pdfUrl = fileName ? `${API_BASE}/pdfs/${encodeURIComponent(fileName)}` : null

  return (
    <>
      {open && (
        <div
          className="fixed inset-0 z-30 bg-black/30 backdrop-blur-sm lg:hidden"
          onClick={onClose}
        />
      )}

      <div
        className={`fixed right-0 top-0 z-40 flex h-full w-full flex-col bg-white shadow-2xl transition-transform duration-300 ease-in-out sm:w-[520px] ${
          open ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-slate-800">
              {fileName || 'Document'}
            </p>
            <p className="text-xs text-slate-500">
              Page {currentPage}{numPages ? ` of ${numPages}` : ''}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-1">
            <button
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30"
            >
              <ChevronLeft size={16} />
            </button>
            <button
              onClick={() => setCurrentPage((p) => Math.min(numPages ?? p, p + 1))}
              disabled={numPages !== null && currentPage >= numPages}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-slate-200 disabled:opacity-30"
            >
              <ChevronRight size={16} />
            </button>
            <button
              onClick={onClose}
              className="ml-1 flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition-colors hover:bg-red-50 hover:text-red-500"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto bg-slate-100 p-4">
          {pdfUrl ? (
            <div ref={containerRef}>
              <Document
                file={pdfUrl}
                onLoadSuccess={({ numPages }) => setNumPages(numPages)}
                loading={
                  <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                    Loading PDF…
                  </div>
                }
                error={
                  <div className="flex h-40 items-center justify-center text-sm text-red-400">
                    Failed to load PDF.
                  </div>
                }
              >
                <Page
                  pageNumber={currentPage}
                  width={Math.min(480, window.innerWidth - 48)}
                  className="mx-auto shadow-md"
                  onRenderTextLayerSuccess={applyHighlight}
                  loading={
                    <div className="flex h-40 items-center justify-center text-sm text-slate-400">
                      Rendering page…
                    </div>
                  }
                />
              </Document>
            </div>
          ) : (
            <div className="flex h-40 items-center justify-center text-sm text-slate-400">
              No document loaded.
            </div>
          )}
        </div>
      </div>
    </>
  )
}
