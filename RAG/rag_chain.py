from pathlib import Path
from urllib.parse import urlparse
from langchain_core.output_parsers import StrOutputParser
from langchain_core.runnables import RunnableLambda, RunnablePassthrough
from langchain_ollama import ChatOllama

from rag.s0_load_transcript import create_store_id, get_video_id, transcript_loader
from rag.s1_indexing import transcript_indexer
from rag.s2_retriever import *
from rag.s3_augmentation import document_formatter, prompt


class RAG:
    INDEX_ROOT = Path(__file__).resolve().parent / "FAISS"
    K = 7

    @staticmethod
    def index_exists(index_path: Path) -> bool:
        return ((index_path / "index.faiss").is_file()
            and (index_path / "index.pkl"  ).is_file())

    @staticmethod
    def create_store(youtube_url: str, index_path: str) -> str:
        add_index_path = RunnableLambda(
            lambda transcript_data: {
                **transcript_data,
                "index_path": index_path,
            }
        )

        ingestion_chain = transcript_loader | add_index_path | transcript_indexer
        return ingestion_chain.invoke(youtube_url)

    @classmethod
    def get_or_create_index(cls, youtube_url: str) -> str:
        store_id = create_store_id(youtube_url)
        index_path = cls.INDEX_ROOT / store_id

        if cls.index_exists(index_path):
            print("This video has been indexed before.")
        else:
            print("This is a new video. Creating its FAISS store...")
            cls.create_store(youtube_url, str(index_path))

        return str(index_path)
    
    @staticmethod
    def extract_video_id(youtube_url: str) -> str:
        parsed_url = urlparse(youtube_url)
        hostname = (parsed_url.hostname or "").lower()

        allowed_hosts = {
            "youtube.com",
            "www.youtube.com",
            "m.youtube.com",
            "music.youtube.com",
            "youtu.be",
            "www.youtu.be",
        }

        if hostname not in allowed_hosts:
            raise ValueError("URL must be from YouTube.")

        video_id = get_video_id(youtube_url)

        if not video_id:
            raise ValueError("URL does not contain a video ID.")

        return video_id

    def __init__(self, youtube_url: str, k: int = 7):
        self.k = k
        self.video_id = self.extract_video_id(youtube_url)
        self.index_path = self.get_or_create_index(youtube_url)
        self.retriever = create_retriever(index_path=self.index_path, k=self.k)
        
        self.llm = ChatOllama(
            model="qwen3.5:latest",
            temperature=0.2,
            reasoning=False,
        )
        
        self.rewrite_llm = ChatOllama(
            model="qwen3.5:latest",
            temperature=0.7,
            reasoning=False,
        )
        
        
        

        answer_chain       = prompt  |  self.llm  |  StrOutputParser()
        question_input     = RunnableLambda(lambda question: {"question": question})
        query_chain        = pass_input(k=self.k) | rewrite_stage(self.rewrite_llm)    | build_queries
        retrieval_chain    = query_chain          | parallel_retrieval(self.retriever) | rrf_ordering
        retrieve_documents = RunnableLambda(lambda data: data["question"]) | retrieval_chain
        format_context     = RunnableLambda(lambda data: data["documents"]) | document_formatter
        answer_input       = RunnableLambda(lambda data: {"question": data["question"],"context": data["context"],})

        self.chain = (
              question_input
            | RunnablePassthrough.assign(documents=retrieve_documents)
            | RunnablePassthrough.assign(context=format_context)
            | RunnablePassthrough.assign(answer=answer_input | answer_chain)
        )

    def invoke(self, question: str) -> dict:
        return self.chain.invoke(question)

    @staticmethod
    def format_timestamp(seconds: float) -> str:
        total_seconds = round(float(seconds))
        hours, remainder = divmod(total_seconds, 3600)
        minutes, seconds_part = divmod(remainder, 60)
        return f"{hours:02}:{minutes:02}:{seconds_part:02}"

    def run_question_loop(self) -> None:
        while True:
            print("\n=======================================================")
            question = input("--- Question ---\n").strip()

            if question.lower() == "exit":
                print("Goodbye!")
                break

            if not question:
                continue

            try:
                result = self.invoke(question)
                

                print("\n--- Answer ---")
                print(result["answer"])

                print("\n--- Retrieved Sources ---")
                for number, document in enumerate(result["documents"], start=1,):
                    start = document.metadata.get("start", "unknown")
                    end   = document.metadata.get("end", "unknown")
                    print(f"{number}. {self.format_timestamp(start)} to "f"{self.format_timestamp(end)}")

            except Exception as exc:
                print(f"Error processing question: {exc}")


def main() -> None:
    youtube_url = input("Paste a YouTube video URL: ").strip()

    if not youtube_url:
        print("Please enter a YouTube URL.")
        return

    try:
        rag = RAG(youtube_url)
    except Exception as exc:
        print(f"Could not initialize the RAG chain: {exc}")
        return

    rag.run_question_loop()


if __name__ == "__main__":
    RAG.main()