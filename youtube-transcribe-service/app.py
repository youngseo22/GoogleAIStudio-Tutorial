import asyncio
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import AsyncGenerator, Optional

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
import yt_dlp

# 상위 폴더 및 현재 폴더의 .env 탐색
load_dotenv(Path(__file__).parent / ".env")
load_dotenv(Path(__file__).parent.parent / ".env")

from google import genai
from google.genai import types

app = FastAPI(title="YouTube Transcribe Web Service", version="1.0.0")

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

DOWNLOADS_DIR.mkdir(parents=True, exist_ok=True)
STATIC_DIR.mkdir(parents=True, exist_ok=True)


class TranscribeRequest(BaseModel):
    url: str
    model: Optional[str] = "gemini-3.5-transcribe"
    prompt: Optional[str] = None
    language_hint: Optional[str] = "ko"


class VideoInfoRequest(BaseModel):
    url: str


def get_genai_client() -> genai.Client:
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(
            status_code=500,
            detail="GEMINI_API_KEY 환경변수가 설정되지 않았습니다. .env 파일을 확인해주세요."
        )
    return genai.Client(api_key=api_key)


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
    return "audio/wav"


def format_duration(seconds: Optional[int]) -> str:
    if not seconds:
        return "00:00"
    m, s = divmod(int(seconds), 60)
    h, m = divmod(m, 60)
    if h > 0:
        return f"{h:02d}:{m:02d}:{s:02d}"
    return f"{m:02d}:{s:02d}"


def extract_video_info(url: str) -> dict:
    ydl_opts = {
        "quiet": True,
        "no_warnings": True,
        "skip_download": True,
    }
    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=False)
            return {
                "title": info.get("title", "제목 없음"),
                "uploader": info.get("uploader", "알 수 없는 채널"),
                "duration": info.get("duration", 0),
                "duration_formatted": format_duration(info.get("duration", 0)),
                "thumbnail": info.get("thumbnail", ""),
                "view_count": info.get("view_count", 0),
                "url": url,
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"유튜브 정보를 불러올 수 없습니다: {str(e)}")


def download_youtube_audio(url: str) -> dict:
    unique_id = uuid.uuid4().hex[:8]
    output_template = str(DOWNLOADS_DIR / f"{unique_id}_%(id)s.%(ext)s")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": output_template,
        "quiet": True,
        "no_warnings": True,
        # postprocessors 설정 시 ffmpeg가 없더라도 원시 오디오 포맷(.m4a, .webm 등)으로 정상 다운로드됨
        "postprocessors": [{
            "key": "FFmpegExtractAudio",
            "preferredcodec": "m4a",
            "preferredquality": "192",
        }] if _check_ffmpeg_installed() else [],
    }

    with yt_dlp.YoutubeDL(ydl_opts) as ydl:
        try:
            info = ydl.extract_info(url, download=True)
            video_title = info.get("title", "YouTube Audio")
            
            # 다운로드된 파일 탐색
            downloaded_files = list(DOWNLOADS_DIR.glob(f"{unique_id}_*"))
            if not downloaded_files:
                raise Exception("오디오 파일 다운로드에 실패했습니다.")
            
            target_file = downloaded_files[0]
            return {
                "file_path": str(target_file),
                "file_name": target_file.name,
                "title": video_title,
                "uploader": info.get("uploader", ""),
                "thumbnail": info.get("thumbnail", ""),
                "duration_formatted": format_duration(info.get("duration", 0)),
            }
        except Exception as e:
            raise HTTPException(status_code=400, detail=f"유튜브 오디오 다운로드 실패: {str(e)}")


def _check_ffmpeg_installed() -> bool:
    import shutil
    return shutil.which("ffmpeg") is not None


@app.post("/api/info")
async def api_video_info(req: VideoInfoRequest):
    return extract_video_info(req.url)


@app.get("/api/audio/{file_name}")
async def get_audio_file(file_name: str):
    file_path = DOWNLOADS_DIR / file_name
    if not file_path.exists() or not file_path.is_file():
        raise HTTPException(status_code=404, detail="오디오 파일을 찾을 수 없습니다.")
    mime_type = get_mime_type(str(file_path))
    return FileResponse(path=file_path, media_type=mime_type, filename=file_name)


@app.post("/api/transcribe-stream")
async def api_transcribe_stream(req: TranscribeRequest):
    async def event_generator() -> AsyncGenerator[str, None]:
        # Step 1: 시작 알림
        yield f"data: {json.dumps({'type': 'status', 'message': '유튜브 정보 조회 및 오디오 다운로드 준비 중...'})}\n\n"
        await asyncio.sleep(0.1)

        try:
            # Step 2: 오디오 다운로드
            loop = asyncio.get_running_loop()
            audio_info = await loop.run_in_executor(None, download_youtube_audio, req.url)
            
            yield f"data: {json.dumps({'type': 'info', 'data': audio_info})}\n\n"
            yield f"data: {json.dumps({'type': 'status', 'message': 'Gemini 3.5 Transcribe 모델로 음성 전사(STT) 중...'})}\n\n"
            await asyncio.sleep(0.1)

            file_path = audio_info["file_path"]
            mime_type = get_mime_type(file_path)

            with open(file_path, "rb") as f:
                audio_bytes = f.read()

            client = get_genai_client()
            model_name = req.model or "gemini-3.5-transcribe"

            # 사용자 지정 프롬프트가 있으면 반영, 없으면 기본 고품질 전사 프롬프트 사용
            user_prompt = req.prompt.strip() if req.prompt and req.prompt.strip() else (
                "Please accurately transcribe this audio in Korean (or original language) with high fidelity."
            )

            contents = [
                types.Content(
                    role="user",
                    parts=[
                        types.Part.from_bytes(
                            data=audio_bytes,
                            mime_type=mime_type,
                        ),
                        types.Part.from_text(
                            text=user_prompt
                        ),
                    ],
                ),
            ]

            generate_content_config = types.GenerateContentConfig(
                audio_transcription_config=types.AudioTranscriptionConfig(
                    word_timestamp=True,
                    diarization=True,
                ),
            )

            full_text = ""
            for chunk in client.models.generate_content_stream(
                model=model_name,
                contents=contents,
                config=generate_content_config,
            ):
                if chunk.text:
                    full_text += chunk.text
                    yield f"data: {json.dumps({'type': 'chunk', 'text': chunk.text})}\n\n"
                    await asyncio.sleep(0.01)

            audio_file_name = audio_info["file_name"]
            complete_payload = {
                "type": "complete",
                "full_text": full_text,
                "audio_url": f"/api/audio/{audio_file_name}",
            }
            yield f"data: {json.dumps(complete_payload)}\n\n"

        except Exception as e:
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@app.post("/api/upload-transcribe")
async def api_upload_transcribe(
    file: UploadFile = File(...),
    model: str = Form("gemini-3.5-transcribe"),
    prompt: Optional[str] = Form(None)
):
    try:
        unique_id = uuid.uuid4().hex[:8]
        safe_name = f"{unique_id}_{file.filename}"
        save_path = DOWNLOADS_DIR / safe_name

        content = await file.read()
        with open(save_path, "wb") as f:
            f.write(content)

        mime_type = get_mime_type(file.filename)
        client = get_genai_client()

        user_prompt = prompt.strip() if prompt and prompt.strip() else (
            "Please accurately transcribe this audio with timestamps and speaker diarization."
        )

        contents = [
            types.Content(
                role="user",
                parts=[
                    types.Part.from_bytes(
                        data=content,
                        mime_type=mime_type,
                    ),
                    types.Part.from_text(
                        text=user_prompt
                    ),
                ],
            ),
        ]

        generate_content_config = types.GenerateContentConfig(
            audio_transcription_config=types.AudioTranscriptionConfig(
                word_timestamp=True,
                diarization=True,
            ),
        )

        response = client.models.generate_content(
            model=model,
            contents=contents,
            config=generate_content_config,
        )

        return {
            "success": True,
            "title": file.filename,
            "file_name": safe_name,
            "audio_url": f"/api/audio/{safe_name}",
            "transcript": response.text or "",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/downloads")
async def list_downloads():
    files = []
    for f in DOWNLOADS_DIR.iterdir():
        if f.is_file():
            files.append({
                "file_name": f.name,
                "size_mb": round(f.stat().st_size / (1024 * 1024), 2),
                "audio_url": f"/api/audio/{f.name}",
            })
    return {"files": sorted(files, key=lambda x: x["file_name"], reverse=True)}


# Static files mount
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


@app.get("/")
async def root():
    index_path = STATIC_DIR / "index.html"
    if index_path.exists():
        return FileResponse(index_path)
    return HTMLResponse("<h1>YouTube Transcribe Service is running. Frontend static/index.html is loading...</h1>")


if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"Starting YouTube Transcribe Web Service on http://localhost:{port} ...")
    uvicorn.run("app:app", host="0.0.0.0", port=port, reload=True)
