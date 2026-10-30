import type {
  ChatResponse,
  SubmitVideoResponse,
  VideoStatusResponse,
} from '../types/api'

const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api'

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  const responseBody: unknown = await response.json().catch(() => null)

  if (!response.ok) {
    const body = responseBody as {
      detail?: string
      error?: string
      message?: string
    } | null

    const message =
      body?.detail ??
      body?.error ??
      body?.message ??
      `Request failed with status ${response.status}`

    throw new Error(message)
  }

  return responseBody as T
}

export function submitVideo(url: string): Promise<SubmitVideoResponse> {
  return request<SubmitVideoResponse>('/videos', {
    method: 'POST',
    body: JSON.stringify({ url }),
  })
}

export function getVideoStatus(
  videoId: string,
): Promise<VideoStatusResponse> {
  return request<VideoStatusResponse>(
    `/videos/${encodeURIComponent(videoId)}/status`,
  )
}

export function sendChatQuestion(
  videoId: string,
  question: string,
): Promise<ChatResponse> {
  return request<ChatResponse>('/chat', {
    method: 'POST',
    body: JSON.stringify({
      video_id: videoId,
      question,
    }),
  })
}