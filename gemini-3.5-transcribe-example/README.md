# Gemini 3.5 Transcribe (음성 전사/STT) 코드 라인별(Line-by-Line) 해설

이 문서는 [`gemini-3.5-transcribe-example.py`](./gemini-3.5-transcribe-example.py) 코드의 모든 줄과 구조를 상세하게 설명합니다.

---

## 1. 전체 코드 개요

이 스크립트는 **Google GenAI SDK**와 **Gemini 3.5 Transcribe** 모델을 사용하여 로컬 오디오 파일(`.wav`, `.mp3`, `.m4a` 등)을 읽어들인 뒤, 타임스탬프(Word Timestamp) 및 화자 분리(Diarization) 옵션이 적용된 고품질 전사(STT: Speech-to-Text)를 스트리밍 방식으로 터미널에 출력하는 예제입니다.

---

## 2. 라인별 상세 설명

### 1) 패키지 설치 안내 및 모듈 임포트 (Line 1 ~ 12)

```python
1: # To run this code you need to install the following dependencies:
2: # pip install google-genai python-dotenv
3: 
4: import glob
5: import os
6: import sys
7: from dotenv import load_dotenv
8: from google import genai
9: from google.genai import types
10: 
11: load_dotenv()
12: 
```

- **Line 1-2**: 코드 실행을 위해 필요한 의존성 라이브러리(`google-genai`, `python-dotenv`) 설치 안내 주석입니다.
- **Line 4 (`import glob`)**: 특정 디렉터리 내의 확장자 패턴(예: `*.wav`)에 맞는 파일 목록을 검색하기 위한 표준 모듈입니다.
- **Line 5 (`import os`)**: 파일 존재 여부 확인(`os.path.exists`) 및 환경 변수 조회를 위한 모듈입니다.
- **Line 6 (`import sys`)**: 명령줄 인수(`sys.argv`)를 읽기 위한 모듈입니다.
- **Line 7 (`from dotenv import load_dotenv`)**: `.env` 파일의 환경 변수를 불러오기 위한 라이브러리입니다.
- **Line 8-9 (`from google import genai`, `from google.genai import types`)**: 최신 Google GenAI SDK 클라이언트 및 데이터 타입 객체를 임포트합니다.
- **Line 11 (`load_dotenv()`)**: `.env` 파일에서 `GEMINI_API_KEY`를 로드합니다.

---

### 2) 오디오 전사(STT) 함수: `generate(audio_path: str)` (Line 14 ~ 64)

#### (1) 파일 유효성 검사 및 클라이언트 초기화 (Line 14 ~ 25)

```python
14: def generate(audio_path: str):
15:     if not os.path.exists(audio_path):
16:         print(f"오디오 파일을 찾을 수 없습니다: {audio_path}")
17:         return
18: 
19:     client = genai.Client(
20:         api_key=os.environ.get("GEMINI_API_KEY"),
21:     )
22: 
23:     print(f"'{audio_path}' 오디오 파일 읽는 중...")
24:     with open(audio_path, "rb") as f:
25:         audio_bytes = f.read()
```

- **Line 14 (`def generate(...)`)**: 지정된 오디오 파일 경로를 받아 STT를 수행하는 메인 함수입니다.
- **Line 15-17**: 전달받은 파일 경로가 실제로 존재하는지 검사하고, 없으면 오류 메시지를 출력하고 종료합니다.
- **Line 19-21 (`genai.Client(...)`)**: Gemini API 클라이언트를 초기화합니다.
- **Line 24-25**: 지정된 오디오 파일을 바이너리 읽기 모드(`rb`)로 열어 전체 바이트 데이터를 메모리로 읽어옵니다.

#### (2) MIME 타입 판별 및 요청 콘텐츠 구성 (Line 27 ~ 46)

```python
27:     # 파일 확장자에 따른 MIME 타입 설정
28:     mime_type = "audio/wav"
29:     if audio_path.lower().endswith(".mp3"):
30:         mime_type = "audio/mp3"
31:     elif audio_path.lower().endswith(".m4a"):
32:         mime_type = "audio/m4a"
33: 
34:     model = "gemini-3.5-transcribe"
35:     contents = [
36:         types.Content(
37:             role="user",
38:             parts=[
39:                 types.Part.from_bytes(
40:                     data=audio_bytes,
41:                     mime_type=mime_type,
42:                 ),
43:                 types.Part.from_text(text="Transcribe the audio accurately."),
44:             ],
45:         ),
46:     ]
```

- **Line 28-32**: 파일 확장자를 확인하여 적절한 오디오 MIME 타입(`audio/wav`, `audio/mp3`, `audio/m4a`)을 자동 지정합니다.
- **Line 34 (`model = "gemini-3.5-transcribe"`)**: 오디오 전사에 최적화된 `gemini-3.5-transcribe` 모델을 지정합니다.
- **Line 35-46 (`contents = [...]`)**:
  - `types.Part.from_bytes(...)`: 읽어온 오디오 바이너리 데이터(`audio_bytes`)와 `mime_type`을 모델이 인식할 수 있는 파트 형태로 패킹합니다.
  - `types.Part.from_text(...)`: 모델에게 정확한 전사를 요청하는 텍스트 프롬프트를 함께 전달합니다.

#### (3) 전사 옵션 설정 (Line 47 ~ 53)

```python
47:     generate_content_config = types.GenerateContentConfig(
48:         audio_transcription_config=types.AudioTranscriptionConfig(
49:             word_timestamp=True,
50:             diarization=True,
51:         ),
52:     )
```

- **Line 48-51 (`AudioTranscriptionConfig`)**:
  - `word_timestamp=True`: 단어별 시간 위치(타임스탬프) 정보를 산출하도록 설정합니다.
  - `diarization=True`: 화자 분리(누가 말했는지 구분)를 활성화합니다.

#### (4) 스트리밍 전사 수신 및 터미널 출력 (Line 54 ~ 64)

```python
54:     print(f"'{audio_path}' 전사(STT) 진행 중...\n" + "-" * 50)
55:     for chunk in client.models.generate_content_stream(
56:         model=model,
57:         contents=contents,
58:         config=generate_content_config,
59:     ):
60:         if text := chunk.text:
61:             print(text, end="", flush=True)
62:     print("\n" + "-" * 50)
63:     print("전사 완료!")
```

- **Line 55-59 (`generate_content_stream`)**: 모델에 요청을 보내고 스트리밍 청크(`chunk`) 단위로 실시간 수신합니다.
- **Line 60-61**: 전달된 청크에 텍스트가 있을 경우 버퍼링 없이 즉시 터미널에 실시간 출력(`flush=True`)합니다.
- **Line 62-63**: 전사가 완료되면 구분선과 완료 안내 메시지를 출력합니다.

---

### 3) 오디오 파일 선택 헬퍼 함수: `select_audio_file()` (Line 66 ~ 89)

```python
66: def select_audio_file() -> str:
67:     # 1. 명령줄 인수로 파일 경로가 전달된 경우 (예: python gemini-3.5-transcribe-example.py my_audio.wav)
68:     if len(sys.argv) > 1:
69:         return sys.argv[1]
70: 
71:     # 2. 현재 디렉토리에서 오디오 파일 검색
72:     audio_files = glob.glob("*.wav") + glob.glob("*.mp3") + glob.glob("*.m4a")
73: 
74:     if not audio_files:
75:         return input("변환할 오디오 파일 경로를 입력하세요: ").strip().strip('"').strip("'")
76: 
77:     print("\n[현재 디렉토리의 오디오 파일 목록]")
78:     for idx, f in enumerate(audio_files, 1):
79:         print(f"  {idx}. {f}")
80: 
81:     choice = input(f"\n파일 번호(1~{len(audio_files)}) 또는 파일 경로를 입력하세요 (기본값: [1] {audio_files[0]}): ").strip().strip('"').strip("'")
82: 
83:     if not choice:
84:         return audio_files[0]
85:     elif choice.isdigit() and 1 <= int(choice) <= len(audio_files):
86:         return audio_files[int(choice) - 1]
87:     else:
88:         return choice
```

- **Line 68-69**: 터미널에서 `python gemini-3.5-transcribe-example.py <파일명>` 형태로 인수를 넘긴 경우 해당 파일을 바로 반환합니다.
- **Line 72**: 현재 디렉터리에서 지원되는 확장자(`.wav`, `.mp3`, `.m4a`) 파일을 검색합니다.
- **Line 74-75**: 발견된 파일이 없다면 사용자에게 직접 파일 경로를 입력받습니다.
- **Line 77-80**: 검색된 오디오 파일 목록을 번호와 함께 출력합니다.
- **Line 81-88**: 
  - 엔터를 누르면 기본 1번 파일이 선택됩니다.
  - 번호(1, 2, ...)를 입력하면 해당 목록의 파일이 선택됩니다.
  - 직접 파일 경로를 입력한 경우 해당 경로를 그대로 반환합니다.

---

### 4) 실행 진입점 (Line 91 ~ 94)

```python
91: if __name__ == "__main__":
92:     target_file = select_audio_file()
93:     generate(target_file)
```

- **Line 92**: `select_audio_file()`을 통해 전사할 오디오 파일 경로를 결정합니다.
- **Line 93**: 선택된 파일 경로를 `generate()` 함수에 전달하여 전사를 실행합니다.
