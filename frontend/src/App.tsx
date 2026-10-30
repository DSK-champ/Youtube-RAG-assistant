import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  getVideoStatus,
  sendChatQuestion,
  submitVideo,
} from './services/api'
import type { ChatResponse, VideoStatus } from './types/api'

type VideoMetadata = {
  title: string
  authorName: string
  thumbnailUrl: string
}

type SessionVideo = VideoMetadata & {
  videoId: string
  videoUrl: string
  status: VideoStatus
}

type ChatTurn = {
  id: string
  question: string
  response?: ChatResponse // undefined while the answer is loading
}

const VIDEOS_STORAGE_KEY = 'youtube-rag-session-videos'
const CHATS_STORAGE_KEY = 'youtube-rag-session-chats'

function readSessionValue<T>(key: string, fallback: T): T {
  try {
    const savedValue = sessionStorage.getItem(key)
    return savedValue ? (JSON.parse(savedValue) as T) : fallback
  } catch {
    return fallback
  }
}

function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const hours = Math.floor(seconds / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)
  const remainingSeconds = seconds % 60

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(
      remainingSeconds,
    ).padStart(2, '0')}`
  }

  return `${minutes}:${String(remainingSeconds).padStart(2, '0')}`
}

function makeTimestampUrl(videoUrl: string, startSeconds: number): string {
  try {
    const url = new URL(videoUrl)
    url.searchParams.set('t', String(Math.max(0, Math.floor(startSeconds))))
    return url.toString()
  } catch {
    return videoUrl
  }
}

async function getVideoMetadata(videoUrl: string): Promise<VideoMetadata | null> {
  try {
    const endpoint = new URL('https://www.youtube.com/oembed')
    endpoint.searchParams.set('url', videoUrl)
    endpoint.searchParams.set('format', 'json')

    const response = await fetch(endpoint)

    if (!response.ok) {
      return null
    }

    const data: {
      title?: string
      author_name?: string
      thumbnail_url?: string
    } = await response.json()

    if (!data.title || !data.thumbnail_url) {
      return null
    }

    return {
      title: data.title,
      authorName: data.author_name ?? 'YouTube channel',
      thumbnailUrl: data.thumbnail_url,
    }
  } catch {
    // Metadata is optional. The video can still be indexed if this request fails.
    return null
  }
}

function getFallbackMetadata(videoId: string): VideoMetadata {
  return {
    title: `YouTube video (${videoId})`,
    authorName: 'Channel details unavailable',
    thumbnailUrl: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
  }
}

function getStatusLabel(status: VideoStatus): string {
  switch (status) {
    case 'processing':
      return 'Processing captions'
    case 'ready':
      return 'Ready for questions'
    case 'failed':
      return 'Indexing failed'
  }
}

function getStatusClasses(status: VideoStatus): string {
  switch (status) {
    case 'processing':
      return 'border-amber-400/20 bg-amber-400/10 text-amber-200'
    case 'ready':
      return 'border-emerald-400/20 bg-emerald-400/10 text-emerald-200'
    case 'failed':
      return 'border-red-400/20 bg-red-400/10 text-red-200'
  }
}

function getStatusDotClass(status: VideoStatus): string {
  switch (status) {
    case 'ready':
      return 'bg-emerald-400'
    case 'processing':
      return 'bg-amber-400'
    case 'failed':
      return 'bg-red-400'
  }
}

function App() {
  const [videos, setVideos] = useState<SessionVideo[]>(() =>
    readSessionValue<SessionVideo[]>(VIDEOS_STORAGE_KEY, []),
  )
  const [chatsByVideoId, setChatsByVideoId] = useState<
    Record<string, ChatTurn[]>
  >(() => readSessionValue<Record<string, ChatTurn[]>>(CHATS_STORAGE_KEY, {}))
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(() => {
    const savedVideos = readSessionValue<SessionVideo[]>(VIDEOS_STORAGE_KEY, [])
    const savedSelectedId = sessionStorage.getItem(
      'youtube-rag-selected-video-id',
    )

    if (
      savedSelectedId &&
      savedVideos.some((video) => video.videoId === savedSelectedId)
    ) {
      return savedSelectedId
    }

    return savedVideos[0]?.videoId ?? null
  })

  const [videoUrl, setVideoUrl] = useState('')
  const [question, setQuestion] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isAsking, setIsAsking] = useState(false)
  const [videoError, setVideoError] = useState('')
  const [chatError, setChatError] = useState('')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [expandedTurns, setExpandedTurns] = useState<Record<string, boolean>>({})

  const chatEndRef = useRef<HTMLDivElement>(null)

  const selectedVideo =
    videos.find((video) => video.videoId === selectedVideoId) ?? null
  const currentMessages = selectedVideoId
    ? chatsByVideoId[selectedVideoId] ?? []
    : []

  useEffect(() => {
    try {
      sessionStorage.setItem(VIDEOS_STORAGE_KEY, JSON.stringify(videos))
    } catch {
      // The app remains usable if browser storage is unavailable.
    }
  }, [videos])

  useEffect(() => {
    try {
      const finishedChats = Object.fromEntries(
        Object.entries(chatsByVideoId).map(([id, turns]) => [
          id,
          turns.filter((turn) => turn.response),
        ]),
      )
      sessionStorage.setItem(CHATS_STORAGE_KEY, JSON.stringify(finishedChats))
    } catch {
      // The app remains usable if browser storage is unavailable.
    }
  }, [chatsByVideoId])

  useEffect(() => {
    try {
      if (selectedVideoId) {
        sessionStorage.setItem('youtube-rag-selected-video-id', selectedVideoId)
      } else {
        sessionStorage.removeItem('youtube-rag-selected-video-id')
      }
    } catch {
      // The selected video will still work for the current page.
    }
  }, [selectedVideoId])

  useEffect(() => {
    if (!sidebarOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [sidebarOpen])

  // Keep the newest message in view inside the chat panel.
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: 'end' })
  }, [
    currentMessages.length,
    currentMessages[currentMessages.length - 1]?.response,
    selectedVideoId,
  ])

  useEffect(() => {
    if (!selectedVideo || selectedVideo.status !== 'processing') {
      return
    }

    const videoIdToCheck = selectedVideo.videoId
    let cancelled = false
    let timeoutId: ReturnType<typeof setTimeout>

    const checkStatus = async () => {
      try {
        const result = await getVideoStatus(videoIdToCheck)

        if (cancelled) return

        setVideos((currentVideos) =>
          currentVideos.map((video) =>
            video.videoId === videoIdToCheck
              ? { ...video, status: result.status }
              : video,
          ),
        )

        if (result.status === 'processing') {
          timeoutId = setTimeout(checkStatus, 2000)
        }
      } catch (caughtError) {
        if (cancelled) return

        setVideoError(
          caughtError instanceof Error
            ? caughtError.message
            : 'Could not check the video status.',
        )

        timeoutId = setTimeout(checkStatus, 4000)
      }
    }

    timeoutId = setTimeout(checkStatus, 1500)

    return () => {
      cancelled = true
      clearTimeout(timeoutId)
    }
  }, [selectedVideo?.videoId, selectedVideo?.status])

  async function handleAddVideo(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedUrl = videoUrl.trim()
    if (!trimmedUrl) return

    setIsSubmitting(true)
    setVideoError('')
    setChatError('')

    try {
      const result = await submitVideo(trimmedUrl)
      const metadata =
        (await getVideoMetadata(trimmedUrl)) ??
        getFallbackMetadata(result.video_id)

      const newVideo: SessionVideo = {
        videoId: result.video_id,
        videoUrl: trimmedUrl,
        status: result.status,
        ...metadata,
      }

      setVideos((currentVideos) => [
        newVideo,
        ...currentVideos.filter((video) => video.videoId !== result.video_id),
      ])

      setSelectedVideoId(result.video_id)
      setVideoUrl('')
      setSidebarOpen(false)
    } catch (caughtError) {
      setVideoError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not submit the video.',
      )
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleAskQuestion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    const trimmedQuestion = question.trim()

    if (
      !selectedVideo ||
      selectedVideo.status !== 'ready' ||
      !trimmedQuestion
    ) {
      return
    }

    const videoId = selectedVideo.videoId
    const turnId = `${Date.now()}-${Math.random()}`

    // Show the user's message immediately, with a pending answer
    setChatsByVideoId((currentChats) => ({
      ...currentChats,
      [videoId]: [
        ...(currentChats[videoId] ?? []),
        { id: turnId, question: trimmedQuestion },
      ],
    }))
    setQuestion('')
    setIsAsking(true)
    setChatError('')

    try {
      const response = await sendChatQuestion(videoId, trimmedQuestion)

      setChatsByVideoId((currentChats) => ({
        ...currentChats,
        [videoId]: (currentChats[videoId] ?? []).map((turn) =>
          turn.id === turnId ? { ...turn, response } : turn,
        ),
      }))
    } catch (caughtError) {
      // Remove the pending turn and give the text back so it can be resent
      setChatsByVideoId((currentChats) => ({
        ...currentChats,
        [videoId]: (currentChats[videoId] ?? []).filter(
          (turn) => turn.id !== turnId,
        ),
      }))
      setQuestion(trimmedQuestion)
      setChatError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Could not get an answer.',
      )
    } finally {
      setIsAsking(false)
    }
  }

  function toggleSources(turnId: string) {
    setExpandedTurns((current) => ({ ...current, [turnId]: !current[turnId] }))
  }

  function selectVideo(videoId: string) {
    setSelectedVideoId(videoId)
    setSidebarOpen(false)
    setVideoError('')
    setChatError('')
    setQuestion('')
  }

  const sidebarContent = (
    <div className="flex h-full min-h-0 flex-col gap-3 text-left">
      {/* Add video bar */}
      <section className="shrink-0 rounded-2xl border border-white/10 bg-red-950/40 p-3">
        <form onSubmit={handleAddVideo} className="flex items-center gap-2">
          <label htmlFor="youtube-url" className="sr-only">
            YouTube URL
          </label>
          <input
            id="youtube-url"
            type="url"
            required
            value={videoUrl}
            onChange={(event) => setVideoUrl(event.target.value)}
            placeholder="Paste a YouTube URL"
            className="min-w-0 flex-1 rounded-full border border-white/10 bg-neutral-800 px-4 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 focus:border-red-400"
          />
          <button
            type="submit"
            disabled={isSubmitting}
            className="shrink-0 rounded-full bg-red-500 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSubmitting ? 'Adding…' : 'Add'}
          </button>
        </form>

        <p className="mt-2 text-xs text-slate-400">
          Add a new video. Answers are based on captions only.
        </p>

        {videoError && (
          <p
            role="alert"
            className="mt-2 rounded-xl border border-red-400/30 bg-red-400/10 px-3 py-2 text-sm text-red-200"
          >
            {videoError}
          </p>
        )}
      </section>

      {/* Recent strip + selected video card */}
      <div className="flex min-h-0 flex-1 gap-3">
        <nav
          aria-label="Recent videos"
          className="flex min-h-0 w-1/4 min-w-20 max-w-28 shrink-0 flex-col rounded-2xl border border-white/10 bg-emerald-950/30"
        >
          <h2 className="shrink-0 px-2 py-2 text-sm font-medium">
            Recent videos
          </h2>

          {videos.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-500">
              Videos you add will appear here.
            </p>
          ) : (
            <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-2">
              {videos.map((video) => (
                <li key={video.videoId}>
                  <button
                    type="button"
                    onClick={() => selectVideo(video.videoId)}
                    title={video.title}
                    aria-label={`Select video: ${video.title}`}
                    className={`group relative block w-full overflow-hidden rounded-xl border transition ${
                      video.videoId === selectedVideoId
                        ? 'border-red-400/60 ring-2 ring-red-400/30'
                        : 'border-transparent opacity-70 hover:border-white/30 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={video.thumbnailUrl}
                      alt=""
                      className="aspect-video w-full bg-slate-800 object-cover"
                    />
                    <span
                      role="img"
                      aria-label={getStatusLabel(video.status)}
                      className={`absolute right-1.5 top-1.5 size-2.5 rounded-full ring-2 ring-slate-950 ${getStatusDotClass(video.status)}`}
                    />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>

        {selectedVideo ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col gap-3 overflow-hidden">
            <a
              href={selectedVideo.videoUrl}
              target="_blank"
              rel="noreferrer"
              className="block shrink-0 overflow-hidden rounded-2xl"
              aria-label={`Open ${selectedVideo.title} on YouTube`}
            >
              <img
                src={selectedVideo.thumbnailUrl}
                alt={`Thumbnail for ${selectedVideo.title}`}
                className="aspect-video w-full bg-slate-800 object-cover"
              />
            </a>

            <div className="min-w-0 text-left">
              <h2
                title={selectedVideo.title}
                className="line-clamp-2 break-words text-base font-semibold leading-6"
              >
                {selectedVideo.title}
              </h2>
              <p className="mt-1 truncate text-sm text-slate-400">
                {selectedVideo.authorName}
              </p>
            </div>

            <div>
              <span
                className={`inline-flex rounded-full border px-3 py-1.5 text-xs font-medium ${getStatusClasses(selectedVideo.status)}`}
              >
                {getStatusLabel(selectedVideo.status)}
              </span>
            </div>

            <a
              href={selectedVideo.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-red-400"
            >
              <span aria-hidden="true">▶</span>
              Watch on YouTube
              <span className="sr-only">(opens in a new tab)</span>
            </a>

            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-slate-500">Video ID</dt>
              <dd className="truncate text-slate-300">
                {selectedVideo.videoId}
              </dd>
              <dt className="text-slate-500">Added</dt>
              <dd className="text-slate-300">This session</dd>
            </dl>
          </section>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-2xl border border-dashed border-white/15 bg-slate-900/30 px-4 text-center">
            <h2 className="font-semibold">No video selected</h2>
            <p className="mt-2 text-sm leading-6 text-slate-400">
              Add a YouTube URL to start a conversation.
            </p>
          </section>
        )}
      </div>
    </div>
  )

  return (
    <main className="fixed inset-0 flex flex-col overflow-hidden bg-slate-950 text-left text-slate-100">
      <style>{`
        @keyframes ripple-dot {
          0%, 60%, 100% { transform: scale(0.6); opacity: 0.35; }
          30% { transform: scale(1.25); opacity: 1; }
        }
        @keyframes thinking-float {
          0%, 100% { transform: translateY(1.5px); opacity: 0.65; }
          50% { transform: translateY(-2.5px); opacity: 1; }
        }
        .ripple-dot {
          display: block;
          width: 0.5rem;
          height: 0.5rem;
          border-radius: 9999px;
          background: #fca5a5;
          animation: ripple-dot 1.4s ease-in-out infinite;
        }
        .thinking-text {
          display: inline-block;
          animation: thinking-float 3s ease-in-out infinite;
        }
        @media (prefers-reduced-motion: reduce) {
          .ripple-dot, .thinking-text { animation: none; opacity: 0.8; }
        }
      `}</style>
      <header className="shrink-0 border-b border-red-950 bg-red-950/80">
        <div className="flex w-full items-center justify-between px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-lg bg-red-500 text-xl font-bold text-white">
              Y
            </span>
            <span className="text-lg font-semibold tracking-tight sm:text-xl">
              YouTube RAG Assistant
            </span>
          </a>

          <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-slate-300">
            Current session
          </span>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 gap-3 overflow-hidden p-3 lg:gap-4 lg:p-4">
        {/* Fixed-width left panel on large screens */}
        <aside className="hidden min-h-0 min-w-72 basis-[30%] lg:block xl:max-w-md">
          {sidebarContent}
        </aside>

        {/* Collapsed sidebar: overlays the page on small screens */}
        {sidebarOpen && (
          <div className="fixed inset-0 z-40 lg:hidden">
            <button
              type="button"
              aria-label="Close videos panel"
              onClick={() => setSidebarOpen(false)}
              className="absolute inset-0 bg-black/60"
            />
            <aside className="absolute inset-y-0 left-0 flex w-[min(92vw,400px)] flex-col gap-3 border-r border-white/10 bg-slate-950 p-3 shadow-2xl">
              <div className="flex shrink-0 items-center justify-between">
                <span className="text-sm font-semibold">Videos</span>
                <button
                  type="button"
                  onClick={() => setSidebarOpen(false)}
                  aria-label="Close videos panel"
                  className="rounded-lg border border-white/10 px-3 py-1.5 text-sm text-slate-300 hover:bg-white/10"
                >
                  ✕
                </button>
              </div>
              <div className="min-h-0 flex-1">{sidebarContent}</div>
            </aside>
          </div>
        )}

        {/* CHAT PANEL */}
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-2xl border border-white/10 bg-neutral-800">
          <header className="flex shrink-0 items-center gap-3 border-b border-white/10 px-4 py-3 text-left sm:px-6">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              aria-label="Open videos panel"
              className="shrink-0 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10 lg:hidden"
            >
              ☰ Videos
            </button>
            <div className="min-w-0">
              <h2 className="font-semibold">Video chat</h2>
              <p className="mt-0.5 truncate text-sm text-slate-400">
                {selectedVideo
                  ? selectedVideo.title
                  : 'Select or add a video to begin'}
              </p>
            </div>
          </header>

          <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-6 sm:px-6">
            {!selectedVideo ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                <h3 className="text-lg font-semibold">Your chat starts here</h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  Add a video, then ask questions about its captions.
                </p>
              </div>
            ) : currentMessages.length === 0 ? (
              <div className="flex h-full min-h-40 flex-col items-center justify-center text-center">
                <h3 className="text-lg font-semibold">
                  {selectedVideo.status === 'ready'
                    ? 'Ask your first question'
                    : 'Preparing this video'}
                </h3>
                <p className="mt-2 max-w-md text-sm leading-6 text-slate-400">
                  {selectedVideo.status === 'ready'
                    ? 'Ask about the ideas covered in the captions.'
                    : selectedVideo.status === 'processing'
                      ? 'We’ll enable chat when caption indexing is complete.'
                      : 'This video could not be indexed. Try adding it again.'}
                </p>
              </div>
            ) : (
              currentMessages.map((turn) => {
                const sources = turn.response?.sources ?? []
                const isOpen = Boolean(expandedTurns[turn.id])

                return (
                  <article key={turn.id} className="space-y-4">
                    <div className="ml-auto w-fit max-w-[90%] whitespace-pre-wrap break-words rounded-2xl bg-blue-600/70 px-4 py-3 text-sm leading-6 text-white sm:max-w-[80%]">
                      {turn.question}
                    </div>

                    {!turn.response ? (
                      <div
                        role="status"
                        className="flex w-fit items-center gap-3 rounded-2xl bg-neutral-700 px-4 py-3 text-sm text-slate-300"
                      >
                        <span className="flex items-center gap-1" aria-hidden="true">
                          <span className="ripple-dot" />
                          <span className="ripple-dot" style={{ animationDelay: '0.18s' }} />
                          <span className="ripple-dot" style={{ animationDelay: '0.36s' }} />
                        </span>
                        <span className="thinking-text">Thinking…</span>
                      </div>
                    ) : (
                      <div className="max-w-[95%] overflow-hidden rounded-2xl bg-neutral-700 text-sm text-slate-100">
                        <div className="whitespace-pre-wrap break-words px-4 py-4 leading-7">
                          {turn.response.answer}
                        </div>

                        {sources.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => toggleSources(turn.id)}
                              aria-expanded={isOpen}
                              className="flex w-full items-center justify-between border-t border-white/10 px-4 py-2.5 text-left text-xs font-medium text-slate-300 transition hover:bg-white/5"
                            >
                              <span>
                                {isOpen ? 'Hide sources' : 'Show sources'} (
                                {sources.length})
                              </span>
                              <span
                                aria-hidden="true"
                                className={`transition-transform ${isOpen ? 'rotate-180' : ''}`}
                              >
                                ▾
                              </span>
                            </button>

                            {isOpen && (
                              <ul className="space-y-3 border-t border-white/10 bg-neutral-900/50 p-4">
                                {sources.map((source, index) => (
                                  <li
                                    key={`${source.start}-${source.end}-${index}`}
                                    className="rounded-xl bg-slate-950/70 p-3"
                                  >
                                    <a
                                      href={makeTimestampUrl(
                                        turn.response!.video_url,
                                        source.start,
                                      )}
                                      target="_blank"
                                      rel="noreferrer"
                                      className="text-sm font-semibold text-red-300 hover:text-red-200 hover:underline"
                                    >
                                      {formatTimestamp(source.start)}–
                                      {formatTimestamp(source.end)}
                                    </a>

                                    <p className="mt-2 text-sm leading-6 text-slate-300">
                                      {source.text}
                                    </p>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </article>
                )
              })
            )}

            <div ref={chatEndRef} />
          </div>

          {chatError && (
            <p
              role="alert"
              className="mx-4 mb-3 shrink-0 rounded-xl border border-red-400/30 bg-red-400/10 px-4 py-3 text-sm text-red-200 sm:mx-6"
            >
              {chatError}
            </p>
          )}

          <form
            onSubmit={handleAskQuestion}
            className="shrink-0 border-t border-white/10 bg-neutral-900/40 p-3 sm:p-4"
          >
            <label htmlFor="question" className="sr-only">
              Ask a question about this video
            </label>

            <div className="flex items-end gap-3">
              <textarea
                id="question"
                rows={2}
                value={question}
                onChange={(event) => setQuestion(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    event.currentTarget.form?.requestSubmit()
                  }
                }}
                placeholder={
                  selectedVideo?.status === 'ready'
                    ? 'Ask a question about this video…'
                    : 'Add a video and wait until it is ready'
                }
                disabled={
                  !selectedVideo || selectedVideo.status !== 'ready' || isAsking
                }
                className="min-w-0 flex-1 resize-none rounded-xl border border-white/10 bg-slate-950 px-4 py-3 text-sm text-white outline-none placeholder:text-slate-500 focus:border-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              />

              <button
                type="submit"
                disabled={
                  !selectedVideo ||
                  selectedVideo.status !== 'ready' ||
                  isAsking ||
                  question.trim().length === 0
                }
                className="shrink-0 rounded-xl bg-red-500 px-5 py-3 text-sm font-semibold text-white transition hover:bg-red-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isAsking ? 'Sending…' : 'Ask'}
              </button>
            </div>

            <p className="mt-2 text-xs text-slate-500">
              Each video has its own conversation in this browser session.
            </p>
          </form>
        </section>
      </div>
    </main>
  )
}

export default App