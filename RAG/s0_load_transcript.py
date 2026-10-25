from urllib.parse import urlparse, parse_qs
from youtube_transcript_api import YouTubeTranscriptApi
from langchain_core.runnables import RunnableLambda

def get_video_id(youtube_url: str) -> str:
    parsed_url = urlparse(youtube_url)

    # Shortened YouTube URLs, such as youtu.be/VIDEO_ID
    if parsed_url.hostname in {"youtu.be", "www.youtu.be"}:
        return parsed_url.path.lstrip("/")

    # Standard URLs, such as youtube.com/watch?v=VIDEO_ID
    if parsed_url.path == "/watch":
        return parse_qs(parsed_url.query)["v"][0]

    # YouTube Shorts URLs
    return parsed_url.path.strip("/").split("/")[-1]

def load_transcript(video_id: str) -> list[dict]:
    transcript = YouTubeTranscriptApi().fetch(video_id, languages=["en"])
    return transcript.to_raw_data()

def load_transcript_from_url(youtube_url: str) -> dict:
    video_id = get_video_id(youtube_url)
    return {
        "video_id": video_id,
        "segments": load_transcript(video_id),
    }
    
transcript_loader = RunnableLambda(load_transcript_from_url)

def main():
    youtube_url = input("Paste a YouTube video URL: ")
    video_id = get_video_id(youtube_url)
    segments = load_transcript(video_id)

    for segment in segments:
        print(segment)


if __name__ == "__main__":
    main()