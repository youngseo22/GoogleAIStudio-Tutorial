import asyncio
import json
import os
import re
import sys
import uuid
from datetime import datetime
from pathlib import Path
from typing import AsyncGenerator, Dict, List, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp

# 상위 폴더 및 현재 폴더의 .env 탐색
load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env")

from google import genai
from google.genai import types

app = FastAPI(title="AI YouTube Searcher Service", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).resolve().parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
STATIC_DIR = BASE_DIR / "static"
TRANSCRIPTS_DIR = BASE_DIR / "transcripts"

DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)
TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)


# Models
class ProcessVideoRequest(BaseModel):
    url: str


class ChatRequest(BaseModel):
    question: str
    video_title: Optional[str] = ""
    transcript: str
    segments: Optional[List[dict]] = []


def get_genai_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요."
        )
    return genai.Client(api_key=api_key)


def extract_youtube_video_id(url: str) -> Optional[str]:
    """유튜브 URL에서 비디오 ID 추출"""
    patterns = [
        r'(?:v=|\/)([0-9A-Za-z_-]{11})(?:[&?]|$)',
        r'youtu\.be\/([0-9A-Za-z_-]{11})',
        r'shorts\/([0-9A-Za-z_-]{11})',
        r'embed\/([0-9A-Za-z_-]{11})'
    ]
    for p in patterns:
        match = re.search(p, url)
        if match:
            return match.group(1)
    return None


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "00:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def time_str_to_seconds(time_str: str) -> int:
    """[MM:SS] 또는 [HH:MM:SS] 문자열을 초(seconds) 단위로 변환"""
    parts = time_str.strip("[] ").split(":")
    if len(parts) == 2:
        return int(parts[0]) * 60 + int(parts[1])
    elif len(parts) == 3:
        return int(parts[0]) * 3600 + int(parts[1]) * 60 + int(parts[2])
    return 0


def get_mime_type(file_path: str) -> str:
    lower = file_path.lower()
    if lower.endswith(".wav"):
        return "audio/wav"
    elif lower.endswith(".mp3"):
        return "audio/mp3"
    elif lower.endswith(".m4a") or lower.endswith(".mp4"):
        return "audio/mp4"
    elif lower.endswith(".webm"):
        return "audio/webm"
    elif lower.endswith(".ogg") or lower.endswith(".opus"):
        return "audio/ogg"
    return "audio/mp4"


def download_youtube_audio(url: str) -> dict:
    """yt-dlp로 오디오 다운로드 및 메타데이터 추출"""
    unique_id = uuid.uuid4().hex[:8]
    output_template = str(DOWNLOADS_DIR / f"{unique_id}_%(id)s.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=True)
            video_id = info.get("id")
            title = info.get("title", "제목 없음")
            uploader = info.get("uploader", "알 수 없는 채널")
            duration = info.get("duration", 0)
            thumbnail = info.get("thumbnail", "")

            # 다운로드된 파일 탐색
            matched = list(DOWNLOADS_DIR.glob(f"{unique_id}_*"))
            if not matched:
                raise RuntimeError("오디오 파일 다운로드에 실패했습니다.")

            audio_file = matched[0]
            return {
                "file_path": str(audio_file),
                "file_name": audio_file.name,
                "video_id": video_id,
                "title": title,
                "uploader": uploader,
                "duration": duration,
                "duration_formatted": format_duration(duration),
                "thumbnail": thumbnail,
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"유튜브 처리 중 오류가 발생했습니다: {str(e)}")


def parse_transcript_segments(raw_text: str) -> List[Dict]:
    """
    텍스트에서 [MM:SS] 또는 [HH:MM:SS] 타임스탬프와 매칭되는 세그먼트 파싱
    """
    segments = []
    lines = raw_text.splitlines()

    pattern = re.compile(r'\[((\d{1,2}:)?\d{1,2}:\d{2})\]\s*(.*)')
    
    current_time_str = "00:00"
    current_seconds = 0
    current_texts = []

    for line in lines:
        line_clean = line.strip()
        if not line_clean:
            continue

        match = pattern.search(line_clean)
        if match:
            # 이전 세그먼트 저장
            if current_texts:
                segments.append({
                    "time": current_time_str,
                    "seconds": current_seconds,
                    "text": " ".join(current_texts).strip()
                })
                current_texts = []

            time_part = match.group(1)
            # 타임스탬프 뒤의 텍스트
            text_part = match.group(3).strip()
            
            current_time_str = time_part
            current_seconds = time_str_to_seconds(time_part)
            if text_part:
                current_texts.append(text_part)
        else:
            current_texts.append(line_clean)

    # 마지막 세그먼트 추가
    if current_texts:
        segments.append({
            "time": current_time_str,
            "seconds": current_seconds,
            "text": " ".join(current_texts).strip()
        })

    # 만약 정규식으로 하나도 안 잡혔을 경우(모델이 형식을 안 지켰을 때 fallback)
    if not segments and raw_text.strip():
        # 임의로 문장 분리하여 00:00 세그먼트로 제공
        segments.append({
            "time": "00:00",
            "seconds": 0,
            "text": raw_text.strip()
        })

    return segments


@app.post("/api/process")
async def process_video(req: ProcessVideoRequest):
    """
    1. 영상 오디오 다운로드
    2. gemini-3.5-transcribe로 타임스탬프 & 트랜스크립트 추출
    3. 결과 반환 (SSE 스트리밍 방식)
    """
    video_id = extract_youtube_video_id(req.url)
    if not video_id:
        raise HTTPException(status_code=400, detail="유효한 유튜브 동영상 URL을 입력해주세요.")

    async def event_generator():
        cache_file = TRANSCRIPTS_DIR / f"{video_id}.json"

        # 0단계: 이전에 저장된 트랜스크립트(캐시)가 있는지 확인
        if cache_file.exists():
            try:
                with open(cache_file, "r", encoding="utf-8") as f:
                    cached_data = json.load(f)

                if cached_data.get("full_transcript"):
                    yield f"data: {json.dumps({'type': 'status', 'step': 1, 'message': '저장된 트랜스크립트 데이터를 발견했습니다. 불러오는 중...'})}\n\n"
                    await asyncio.sleep(0.1)

                    video_info = cached_data.get("video_info", {
                        "video_id": video_id,
                        "title": "저장된 비디오",
                        "uploader": "채널 정보 없음",
                        "duration": 0,
                        "duration_formatted": "00:00",
                        "thumbnail": ""
                    })
                    yield f"data: {json.dumps({'type': 'video_info', 'data': video_info})}\n\n"
                    await asyncio.sleep(0.1)

                    yield f"data: {json.dumps({'type': 'status', 'step': 2, 'message': '저장된 트랜스크립트를 성공적으로 불러왔습니다.'})}\n\n"
                    await asyncio.sleep(0.1)

                    yield f"data: {json.dumps({'type': 'done', 'full_transcript': cached_data['full_transcript'], 'segments': cached_data.get('segments', []), 'cached': True})}\n\n"
                    return
            except Exception as cache_err:
                print(f"저장된 트랜스크립트 읽기 실패: {cache_err}. 새로 전사를 진행합니다.")

        # 1단계: 다운로드 시작 알림
        yield f"data: {json.dumps({'type': 'status', 'step': 1, 'message': '유튜브 영상 및 오디오 스트림 다운로드 중...'})}\n\n"
        await asyncio.sleep(0.1)

        try:
            # 동기 I/O를 비동기 스레드 풀에서 실행
            loop = asyncio.get_event_loop()
            video_data = await loop.run_in_executor(None, download_youtube_audio, req.url)
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'오디오 다운로드 실패: {str(e)}'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'video_info', 'data': video_data})}\n\n"
        await asyncio.sleep(0.1)

        # 2단계: Gemini 3.5 Transcribe 시작
        try:
            client = get_genai_client()
        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': f'Gemini 클라이언트 초기화 실패: {str(e)}'})}\n\n"
            return

        yield f"data: {json.dumps({'type': 'status', 'step': 2, 'message': 'Gemini 3.5 Transcribe로 타임스탬프 및 음성 텍스트 추출 중...'})}\n\n"
        await asyncio.sleep(0.1)

        audio_path = video_data["file_path"]
        mime_type = get_mime_type(audio_path)

        try:
            with open(audio_path, "rb") as f:
                audio_bytes = f.read()

            prompt = (
                "당신은 오디오를 매우 정확하게 전사하는 고성능 AI 모델입니다.\n"
                "오디오의 모든 음성을 듣고, 각 발화나 문장이 시작되는 시간대를 타임스탬프와 함께 상세히 전사해주세요.\n"
                "반드시 아래 형식을 지켜 모든 문장마다 타임스탬프를 기재해주세요:\n"
                "[MM:SS] 발화 내용\n"
                "예시:\n"
                "[00:00] 안녕하세요, 오늘 영상에서는...\n"
                "[00:14] 첫 번째로 살펴볼 기술은...\n"
                "[01:05] 이것이 작동하는 원리를 보여드리겠습니다.\n\n"
                "한국어 및 원어를 자연스럽고 정확하게 전사해주세요."
            )

            contents = [
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(
                            data=audio_bytes,
                            mime_type=mime_type,
                        ),
                        types.Part.from_text(text=prompt),
                    ],
                ),
            ]

            generate_content_config = types.GenerateContentConfig(
                audio_transcription_config=types.AudioTranscriptionConfig(
                    word_timestamp=True,
                    diarization=True,
                ),
            )

            # Gemini 3.5 Transcribe 스트리밍 호출
            raw_transcript_chunks = []
            
            # 스트리밍 호출 실행 (동기 제너레이터를 비동기적으로 처리)
            def run_transcribe_stream():
                return client.models.generate_content_stream(
                    model="gemini-3.5-transcribe",
                    contents=contents,
                    config=generate_content_config,
                )

            stream = await loop.run_in_executor(None, run_transcribe_stream)

            for chunk in stream:
                if chunk.text:
                    raw_transcript_chunks.append(chunk.text)
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk.text})}\n\n"
                    await asyncio.sleep(0.01)

            full_transcript = "".join(raw_transcript_chunks)
            segments = parse_transcript_segments(full_transcript)

            # 트랜스크립트 및 영상 메타데이터 저장 (동일 영상 재요청 시 사용)
            try:
                cache_payload = {
                    "video_id": video_id,
                    "url": req.url,
                    "video_info": {
                        "video_id": video_id,
                        "title": video_data.get("title", ""),
                        "uploader": video_data.get("uploader", ""),
                        "duration": video_data.get("duration", 0),
                        "duration_formatted": video_data.get("duration_formatted", ""),
                        "thumbnail": video_data.get("thumbnail", ""),
                    },
                    "full_transcript": full_transcript,
                    "segments": segments,
                    "created_at": datetime.now().isoformat(),
                }
                with open(cache_file, "w", encoding="utf-8") as f:
                    json.dump(cache_payload, f, ensure_ascii=False, indent=2)
            except Exception as save_err:
                print(f"트랜스크립트 저장 실패: {save_err}")

            yield f"data: {json.dumps({'type': 'done', 'full_transcript': full_transcript, 'segments': segments, 'cached': False})}\n\n"

        except Exception as e:
            # fallback 시도 또는 에러 전송
            yield f"data: {json.dumps({'type': 'error', 'message': f'Gemini 전사 중 오류 발생: {str(e)}'})}\n\n"
        finally:
            # 다운로드된 임시 오디오 파일 정리
            try:
                if os.path.exists(audio_path):
                    os.remove(audio_path)
            except Exception:
                pass

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/chat")
async def chat_with_video(req: ChatRequest):
    """
    추출된 트랜스크립트와 타임스탬프를 기반으로 Gemini 3.8 Flash를 이용해 질의응답
    """
    client = get_genai_client()

    system_instruction = (
        "당신은 유튜브 영상의 내용을 바탕으로 사용자의 질문에 답변하는 스마트 AI 어시스턴트입니다.\n"
        "제공된 영상의 트랜스크립트와 타임스탬프를 기반으로 질문에 친절하고 명확하게 답변하세요.\n"
        "중요 지침:\n"
        "1. 설명하는 내용이 영상의 몇 분 몇 초에 등장하는지 반드시 [MM:SS] (예: [01:23]) 형식의 타임스탬프를 적극적으로 기재하세요.\n"
        "2. 사용자는 본문의 타임스탬프를 클릭하여 해당 영상 위치로 바로 이동할 수 있습니다.\n"
        "3. 영상에 나오지 않는 내용에 대해서는 추측하지 말고 영상 트랜스크립트 기준으로 솔직하게 답하세요.\n"
        "4. 핵심을 보기 쉽게 불릿 포인트나 문단으로 정돈하여 작성하세요."
    )

    user_prompt = (
        f"【영상 제목】: {req.video_title or '제목 없음'}\n\n"
        f"【영상 트랜스크립트(타임스탬프 포함)】:\n{req.transcript}\n\n"
        f"【사용자 질문】: {req.question}\n\n"
        f"위 트랜스크립트를 바탕으로 질문에 대해 관련 타임스탬프 [MM:SS]를 포함하여 상세히 답변해주세요."
    )

    async def chat_event_generator():
        loop = asyncio.get_event_loop()

        # 우선 Gemini 3.8 Flash 시도, 없으면 Gemini 2.5 Flash / 1.5 Flash로 fallback
        candidate_models = ["gemini-3.8-flash", "gemini-2.5-flash", "gemini-1.5-flash"]
        stream = None
        used_model = None

        for model_name in candidate_models:
            try:
                def call_model(m=model_name):
                    return client.models.generate_content_stream(
                        model=m,
                        contents=[types.Content(role="user", parts=[types.Part.from_text(text=user_prompt)])],
                        config=types.GenerateContentConfig(
                            system_instruction=system_instruction,
                            temperature=0.3,
                        )
                    )
                stream = await loop.run_in_executor(None, call_model)
                used_model = model_name
                break
            except Exception as e:
                print(f"Model {model_name} failed: {e}")
                continue

        if not stream:
            yield f"data: {json.dumps({'type': 'error', 'message': 'Gemini 응답 생성에 실패했습니다.'})}\n\n"
            return

        for chunk in stream:
            if chunk.text:
                yield f"data: {json.dumps({'type': 'chunk', 'text': chunk.text, 'model': used_model})}\n\n"
                await asyncio.sleep(0.01)

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    return StreamingResponse(chat_event_generator(), media_type="text/event-stream")


# 정적 파일 마운트
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def serve_index():
    return FileResponse(STATIC_DIR / "index.html")


if __name__ == "__main__":
    import uvicorn
    print("\n" + "=" * 60)
    print("🚀 AI 유튜브 검색기 웹 서버를 시작합니다!")
    print("👉 브라우저 접속 주소: http://127.0.0.1:8000")
    print("=" * 60 + "\n")
    uvicorn.run("app:app", host="127.0.0.1", port=8000, reload=True)

