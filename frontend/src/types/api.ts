export type VideoStatus = 'processing' | 'ready' | 'failed'

export interface SubmitVideoResponse {
  video_id: string
  status: VideoStatus
}

export interface VideoStatusResponse {
  video_id: string
  status: VideoStatus
  message?: string
}

export interface CaptionSource {
  start: number
  end: number
  text: string
}

export interface ChatResponse {
  answer: string
  video_id: string
  video_url: string
  sources: CaptionSource[]
}