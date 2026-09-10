# 🎙️ YouTube Audio Transcriber Web Service (Gemini 3.5 Transcribe)

유튜브 영상 URL을 입력하면 영상의 고음질 오디오를 자동으로 추출 및 다운로드하고, **Google Gemini 3.5 Transcribe** 모델을 활용해 실시간 스트리밍으로 텍스트 전사(STT: Speech-to-Text)를 수행하는 모던 웹 애플리케이션입니다.

---

## ✨ 주요 기능

1. **YouTube 오디오 자동 추출**:
   - `yt-dlp`를 사용하여 유튜브 영상의 오디오 스트림(M4A / WAV 등)을 고음질로 다운로드.
2. **Gemini 3.5 Transcribe STT 연동**:
   - `google-genai` SDK 기반 `gemini-3.5-transcribe` 모델 호출.
   - 단어 단위 타임스탬프(`word_timestamp=True`) 및 화자 분리(`diarization=True`) 옵션 적용.
3. **실시간 스트리밍 전사 (SSE)**:
   - Server-Sent Events (SSE) 기반으로 실시간 생성되는 전사 텍스트를 웹 브라우저에 끊김 없이 스트리밍.
4. **인앱 오디오 플레이어**:
   - 다운로드된 오디오를 브라우저에서 바로 들으며 전사 결과 텍스트와 대조 가능.
5. **다양한 포맷 내보내기**:
   - 원클릭 클립보드 복사.
   - `.txt`, `.md`(마크다운), `.json` 파일 다운로드 지원.
6. **로컬 오디오 파일 직접 업로드 지원**:
   - 드래그 앤 드롭으로 로컬 오디오(`*.wav`, `*.mp3`, `*.m4a` 등)를 업로드하여 즉시 전사 가능.

---

## 📁 프로젝트 구조

```
youtube-transcribe-service/
├── app.py                      # FastAPI 백엔드 (YouTube 다운로드 & Gemini API 연동)
├── requirements.txt            # 필요 패키지 목록
├── README.md                   # 설명 문서
├── downloads/                  # 다운로드된 오디오 파일 보관 폴더
└── static/                     # 프론트엔드 정적 파일
    ├── index.html              # 모던 글래스모피즘 웹 UI
    ├── style.css               # 세련된 다크 테마 디자인 시스템
    └── app.js                  # SSE 스트리밍 통신 및 UI 상호작용 로직
```

---

## 🚀 실행 방법

### 1. 패키지 설치
```bash
pip install -r requirements.txt
```

### 2. 환경 변수 설정
프로젝트 폴더 또는 상위 폴더의 `.env` 파일에 Gemini API 키가 설정되어 있어야 합니다:
```env
GEMINI_API_KEY="your_api_key_here"
```

### 3. 서버 실행
```bash
# 방법 1: Python 스크립트로 직접 실행
python app.py

# 방법 2: uvicorn 명령어로 실행
python -m uvicorn app:app --host 0.0.0.0 --port 8000 --reload
```

### 4. 웹 브라우저 접속
웹 브라우저를 열고 아래 주소로 접속합니다:
👉 **[http://localhost:8000](http://localhost:8000)**

---

## 🛠️ 기술 스택

- **Backend**: Python 3.10+, FastAPI, Uvicorn, yt-dlp, google-genai, python-dotenv
- **Frontend**: HTML5, Vanilla CSS3 (Custom Design System, Glassmorphism, CSS Grid/Flexbox), Vanilla JavaScript (ES6+, Server-Sent Events Fetch Streams)
- **AI Model**: Google Gemini 3.5 Transcribe (`gemini-3.5-transcribe`), Gemini 2.5 Flash
