# To run this code you need to install the following dependencies:
# pip install google-genai python-dotenv

import glob
import os
import sys
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()


def generate(audio_path: str):
    if not os.path.exists(audio_path):
        print(f"오디오 파일을 찾을 수 없습니다: {audio_path}")
        return

    client = genai.Client(
        api_key=os.environ.get("GEMINI_API_KEY"),
    )

    print(f"'{audio_path}' 오디오 파일 읽는 중...")
    with open(audio_path, "rb") as f:
        audio_bytes = f.read()

    # 파일 확장자에 따른 MIME 타입 설정
    mime_type = "audio/wav"
    if audio_path.lower().endswith(".mp3"):
        mime_type = "audio/mp3"
    elif audio_path.lower().endswith(".m4a"):
        mime_type = "audio/m4a"

    model = "gemini-3.5-transcribe"
    contents = [
        types.Content(
            role="user",
            parts=[
                types.Part.from_bytes(
                    data=audio_bytes,
                    mime_type=mime_type,
                ),
                types.Part.from_text(text="Transcribe the audio accurately."),
            ],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        audio_transcription_config=types.AudioTranscriptionConfig(
            word_timestamp=True,
            diarization=True,
        ),
    )

    print(f"'{audio_path}' 전사(STT) 진행 중...\n" + "-" * 50)
    for chunk in client.models.generate_content_stream(
        model=model,
        contents=contents,
        config=generate_content_config,
    ):
        if text := chunk.text:
            print(text, end="", flush=True)
    print("\n" + "-" * 50)
    print("전사 완료!")


def select_audio_file() -> str:
    # 1. 명령줄 인수로 파일 경로가 전달된 경우 (예: python gemini-3.5-transcribe-example.py my_audio.wav)
    if len(sys.argv) > 1:
        return sys.argv[1]

    # 2. 현재 디렉토리에서 오디오 파일 검색
    audio_files = glob.glob("*.wav") + glob.glob("*.mp3") + glob.glob("*.m4a")

    if not audio_files:
        return input("변환할 오디오 파일 경로를 입력하세요: ").strip().strip('"').strip("'")

    print("\n[현재 디렉토리의 오디오 파일 목록]")
    for idx, f in enumerate(audio_files, 1):
        print(f"  {idx}. {f}")

    choice = input(f"\n파일 번호(1~{len(audio_files)}) 또는 파일 경로를 입력하세요 (기본값: [1] {audio_files[0]}): ").strip().strip('"').strip("'")

    if not choice:
        return audio_files[0]
    elif choice.isdigit() and 1 <= int(choice) <= len(audio_files):
        return audio_files[int(choice) - 1]
    else:
        return choice


if __name__ == "__main__":
    target_file = select_audio_file()
    generate(target_file)


