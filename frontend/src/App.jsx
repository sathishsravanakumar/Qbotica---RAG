import { useEffect, useRef, useState } from 'react'
import Sidebar from './components/Sidebar'
import EmptyState from './components/EmptyState'
import ChatMessage from './components/ChatMessage'
import TypingIndicator from './components/TypingIndicator'
import ChatInput from './components/ChatInput'
import { API_BASE, STATUS } from './constants'

const timeNow = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

export default function App() {
  const [status, setStatus] = useState(STATUS.IDLE)
  const [fileName, setFileName] = useState('')
  const [chunkCount, setChunkCount] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isChatLoading, setIsChatLoading] = useState(false)
  const [error, setError] = useState('')

  const fileInputRef = useRef(null)
  const messagesEndRef = useRef(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, isChatLoading])

  const handleUploadClick = () => {
    fileInputRef.current?.click()
  }

  const handleFileChange = async (event) => {
    const file = event.target.files?.[0]
    if (!file) return

    setError('')
    setStatus(STATUS.VECTORIZING)
    setMessages([])

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch(`${API_BASE}/upload`, {
        method: 'POST',
        body: formData,
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || 'Failed to process the document.')
      }

      const data = await res.json()
      setFileName(file.name)
      setChunkCount(data.chunks_indexed ?? null)
      setStatus(STATUS.ACTIVE)
    } catch (err) {
      setStatus(STATUS.IDLE)
      setFileName('')
      setChunkCount(null)
      setError(err.message || 'Something went wrong while uploading the file.')
    } finally {
      event.target.value = ''
    }
  }

  const handleSend = async () => {
    const trimmed = input.trim()
    if (!trimmed || status !== STATUS.ACTIVE || isChatLoading) return

    setMessages((prev) => [...prev, { role: 'user', content: trimmed, timestamp: timeNow() }])
    setInput('')
    setIsChatLoading(true)
    setError('')

    try {
      const res = await fetch(`${API_BASE}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}))
        throw new Error(errBody.detail || 'Failed to get a response.')
      }

      const data = await res.json()
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: data.response, sources: data.sources, timestamp: timeNow() },
      ])
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'bot', content: `Error: ${err.message || 'Something went wrong.'}`, timestamp: timeNow() },
      ])
    } finally {
      setIsChatLoading(false)
    }
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault()
      handleSend()
    }
  }

  const handleNewChat = () => {
    setMessages([])
    setError('')
  }

  const isInputDisabled = status !== STATUS.ACTIVE || isChatLoading

  return (
    <div className="flex h-screen w-full flex-col bg-slate-50 lg:flex-row">
      <Sidebar
        status={status}
        fileName={fileName}
        chunkCount={chunkCount}
        fileInputRef={fileInputRef}
        onUploadClick={handleUploadClick}
        onFileChange={handleFileChange}
        onNewChat={handleNewChat}
        hasMessages={messages.length > 0}
      />

      <div className="flex min-h-0 flex-1 flex-col">
        <main className="flex-1 overflow-y-auto px-4 py-6 sm:px-6">
          <div className="mx-auto flex h-full max-w-3xl flex-col gap-5">
            {messages.length === 0 ? (
              <EmptyState hasDocument={status === STATUS.ACTIVE} />
            ) : (
              messages.map((msg, idx) => (
                <ChatMessage
                  key={idx}
                  role={msg.role}
                  content={msg.content}
                  sources={msg.sources}
                  timestamp={msg.timestamp}
                />
              ))
            )}
            {isChatLoading && <TypingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        </main>

        {error && (
          <div className="mx-auto w-full max-w-3xl px-4 pb-2 sm:px-6">
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">
              {error}
            </div>
          </div>
        )}

        <ChatInput
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onSend={handleSend}
          onKeyDown={handleKeyDown}
          disabled={isInputDisabled}
          isLoading={isChatLoading}
          placeholder={
            status === STATUS.ACTIVE
              ? 'Ask a question about your document...'
              : 'Upload a PDF to start chatting...'
          }
        />
      </div>
    </div>
  )
}
