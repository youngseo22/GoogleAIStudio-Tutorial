# Gemini 3.1 Flash TTS (Text-to-Speech) 코드 라인별(Line-by-Line) 해설

이 문서는 [`gemini-3.1-flash-tts-example.py`](./gemini-3.1-flash-tts-example.py) 코드의 모든 줄과 구조를 상세하게 설명합니다.

---

## 1. 전체 코드 개요

이 스크립트는 **Google GenAI SDK**와 **Gemini 3.1 Flash TTS Preview** 모델을 사용하여 텍스트 프롬프트(감정 태그 및 오디오 프로필 포함)를 실감 나는 음성(PCM 바이너리)으로 생성한 후, WAV 오디오 헤더를 붙여 `.wav` 파일로 저장하는 예제입니다.

---

## 2. 라인별 상세 설명

### 1) 라이브러리 설치 안내 및 임포트 (Line 1 ~ 11)

```python
1: # To run this code you need to install the following dependencies:
2: # pip install google-genai
3: 
4: import os
5: import struct
6: from dotenv import load_dotenv
7: from google import genai
8: from google.genai import types
9: 
10: load_dotenv()
11: 
```

- **Line 1-2**: 필요한 패키지(`google-genai`) 설치 가이드 주석입니다.
- **Line 4 (`import os`)**: 환경 변수 접근 및 파일 시스템 제어를 위한 파이썬 표준 라이브러리입니다.
- **Line 5 (`import struct`)**: WAV 파일 포맷의 44바이트 헤더를 바이너리(바이트 단위)로 패킹하기 위해 사용하는 표준 라이브러리입니다.
- **Line 6 (`from dotenv import load_dotenv`)**: `.env` 파일에 정의된 환경 변수(예: `GEMINI_API_KEY`)를 불러오는 라이브러리입니다.
- **Line 7-8 (`from google import genai`, `from google.genai import types`)**: 최신 Google GenAI 공식 SDK 및 타입 정의 모듈을 임포트합니다.
- **Line 10 (`load_dotenv()`)**: 현재 작업 디렉토리의 `.env` 파일을 읽어 환경 변수로 로드합니다.

---

### 2) 바이너리 파일 저장 함수 (Line 13 ~ 18)

```python
13: def save_binary_file(file_name, data):
14:     f = open(file_name, "wb")
15:     f.write(data)
16:     f.close()
17:     print(f"File saved to to: {file_name}")
18: 
```

- **Line 13 (`def save_binary_file(...)`)**: 생성된 바이트 데이터를 로컬 파일로 저장하는 함수입니다.
- **Line 14 (`open(file_name, "wb")`)**: 바이너리 쓰기 모드(`wb`)로 파일을 엽니다.
- **Line 15 (`f.write(data)`)**: 완성된 WAV 바이너리 데이터를 파일에 기록합니다.
- **Line 16-17**: 파일을 닫고 저장 완료 메시지를 출력합니다.

---

### 3) 음성 생성 및 스트리밍 처리 함수: `generate()` (Line 20 ~ 88)

#### (1) 클라이언트 초기화 및 프롬프트 설정 (Line 20 ~ 49)

```python
20: def generate():
21:     client = genai.Client(
22:         api_key=os.environ.get("GEMINI_API_KEY"),
23:     )
24: 
25:     model = "gemini-3.1-flash-tts-preview"
26:     contents = [
27:         types.Content(
28:             role="user",
29:             parts=[
30:                 types.Part.from_text(text="""Read the following transcript based on the audio profile.
31: 
32: # Audio Profile
33: warm
34: 
35: ## Scene:
36: A professional broadcast news studio, breaking tech news segment, clear and urgent atmosphere.
37: 
38: ## Sample Context:
39: The anchor is delivering a shocking and exciting breaking news announcement about a major breakthrough in AI pricing.
40: 
41: ## Transcript:
42: [breaking news] [excited] 속보입니다! 구글이 차세대 초거대 AI 모델, '제미나이 4.0 프로'를 전격 공개했습니다. [pause] 
43: 
44: 놀라운 건 압도적인 성능뿐만이 아닙니다. [surprised] 기존 모델 대비 가격이 무려 10분의 1 수준으로 책정되는 파격적인 가격 정책을 발표했습니다. [confident] 
45: 
46: 백만 토큰당 단돈 몇 센트라는 보고도 믿기 힘든 초저가로 출시되면서, [chuckle] 지금 글로벌 AI 생태계가 완전히 발칵 뒤집혔습니다. 과연 AI 가격 파괴의 끝은 어디일까요?"""),
47:             ],
48:         ),
49:     ]
```

- **Line 21-23 (`genai.Client(...)`)**: `.env`에서 불러온 `GEMINI_API_KEY`를 사용하여 Gemini 클라이언트를 생성합니다.
- **Line 25 (`model = "gemini-3.1-flash-tts-preview"`)**: TTS 특화 프리뷰 모델을 지정합니다.
- **Line 26-49 (`contents = [...]`)**:
  - 모델에 전달할 프롬프트입니다.
  - `Audio Profile`(톤/분위기: warm), `Scene`(상황/배경), `Sample Context`(문맥)를 상세히 지정합니다.
  - `[breaking news]`, `[excited]`, `[pause]`, `[surprised]`, `[confident]`, `[chuckle]` 등 감정과 억양을 제어하는 프롬프트 태그를 포함하여 자연스러운 낭독을 유도합니다.

#### (2) 오디오 출력 설정 (Line 50 ~ 62)

```python
50:     generate_content_config = types.GenerateContentConfig(
51:         temperature=1,
52:         response_modalities=[
53:             "audio",
54:         ],
55:         speech_config=types.SpeechConfig(
56:             voice_config=types.VoiceConfig(
57:                 prebuilt_voice_config=types.PrebuiltVoiceConfig(
58:                     voice_name="Kore"
59:                 )
60:             )
61:         ),
62:     )
```

- **Line 50-51**: 콘텐츠 생성 옵션을 설정합니다.
- **Line 52-54 (`response_modalities=["audio"]`)**: 모델이 텍스트가 아닌 **오디오(음성 바이트)** 형태로 응답하도록 지정하는 필수 옵션입니다.
- **Line 55-61 (`speech_config=...`)**: 사전 구축된 음성(Prebuilt Voice) 중 `"Kore"` 보이스를 선택합니다.

#### (3) 스트림 응답 수신 및 오디오 데이터 축적 (Line 64 ~ 82)

```python
64:     audio_chunks = bytearray()
65:     mime_type = "audio/L16;rate=24000"
66: 
67:     print("음성 생성 중...")
68:     for chunk in client.models.generate_content_stream(
69:         model=model,
70:         contents=contents,
71:         config=generate_content_config,
72:     ):
73:         if chunk.parts is None:
74:             continue
75:         if chunk.parts[0].inline_data and chunk.parts[0].inline_data.data:
76:             inline_data = chunk.parts[0].inline_data
77:             if inline_data.mime_type:
78:                 mime_type = inline_data.mime_type
79:             audio_chunks.extend(inline_data.data)
80:         elif chunk.text:
81:             print(chunk.text, end="", flush=True)
82: 
```

- **Line 64 (`audio_chunks = bytearray()`)**: 스트리밍으로 전달되는 오디오 청크들을 순차적으로 이어붙이기 위한 바이트 버퍼입니다.
- **Line 65 (`mime_type = "audio/L16;rate=24000"`)**: 기본 오디오 포맷(Linear PCM 16bit, 24kHz 샘플레이트)입니다.
- **Line 68-72 (`generate_content_stream`)**: 모델에 요청을 보내고 스트리밍 청크 단위로 응답을 수신합니다.
- **Line 73-79**: 응답 파트의 `inline_data.data`에서 원시 오디오 바이트를 추출해 `audio_chunks`에 추가하고 MIME 타입을 갱신합니다.
- **Line 80-81**: 텍스트 응답이 함께 포함된 경우 터미널에 즉시 출력합니다.

#### (4) WAV 변환 및 파일 저장 (Line 83 ~ 87)

```python
83:     if audio_chunks:
84:         wav_data = convert_to_wav(bytes(audio_chunks), mime_type)
85:         output_file = "output.wav"
86:         save_binary_file(output_file, wav_data)
87:         print(f"\n완료! 음성 파일이 '{output_file}'로 저장되었습니다.")
```

- **Line 83-84**: 수집된 PCM 원시 오디오 바이트를 WAV 포맷(`convert_to_wav`)으로 변환합니다.
- **Line 85-87**: 변환된 WAV 데이터를 `output.wav` 파일로 저장하고 완료 메시지를 출력합니다.

---

### 4) WAV 헤더 생성 함수: `convert_to_wav()` (Line 89 ~ 128)

```python
89: def convert_to_wav(audio_data: bytes, mime_type: str) -> bytes:
90:     """Generates a WAV file header for the given audio data and parameters."""
99:     parameters = parse_audio_mime_type(mime_type)
100:     bits_per_sample = parameters["bits_per_sample"]
101:     sample_rate = parameters["rate"]
102:     num_channels = 1
103:     data_size = len(audio_data)
104:     bytes_per_sample = bits_per_sample // 8
105:     block_align = num_channels * bytes_per_sample
106:     byte_rate = sample_rate * block_align
107:     chunk_size = 36 + data_size  # 36 bytes for header fields before data chunk size
108: 
109:     # http://soundfile.sapp.org/doc/WaveFormat/
110: 
111:     header = struct.pack(
112:         "<4sI4s4sIHHIIHH4sI",
113:         b"RIFF",          # ChunkID
114:         chunk_size,       # ChunkSize (total file size - 8 bytes)
115:         b"WAVE",          # Format
116:         b"fmt ",          # Subchunk1ID
117:         16,               # Subchunk1Size (16 for PCM)
118:         1,                # AudioFormat (1 for PCM)
119:         num_channels,     # NumChannels (1 = Mono)
120:         sample_rate,      # SampleRate (예: 24000)
121:         byte_rate,        # ByteRate (SampleRate * BlockAlign)
122:         block_align,      # BlockAlign (NumChannels * BytesPerSample)
123:         bits_per_sample,  # BitsPerSample (예: 16)
124:         b"data",          # Subchunk2ID
125:         data_size         # Subchunk2Size (순수 오디오 데이터 크기)
126:     )
127:     return header + audio_data
```

- **역할**: Gemini 모델이 반환하는 원시 PCM(Raw PCM) 오디오는 헤더가 없기 때문에 일반 플레이어에서 재생할 수 없습니다. 이 함수가 표준 RIFF/WAVE 44바이트 헤더를 계산하여 앞에 붙여줍니다.
- **Line 111-126 (`struct.pack("<4sI4s4sIHHIIHH4sI", ...)`)**:
  - 리틀 엔디언(`<`) 형식으로 규격에 맞게 44바이트 바이너리 헤더를 패킹합니다.
- **Line 127**: 생성된 헤더와 원시 오디오 데이터를 결합하여 유효한 `.wav` 바이너리를 반환합니다.

---

### 5) MIME 타입 파싱 함수: `parse_audio_mime_type()` (Line 129 ~ 162)

```python
129: def parse_audio_mime_type(mime_type: str) -> dict[str, int | None]:
130:     """Parses bits per sample and rate from an audio MIME type string."""
141:     bits_per_sample = 16
142:     rate = 24000
143: 
144:     # Extract rate from parameters
145:     parts = mime_type.split(";")
146:     for param in parts:
147:         param = param.strip()
148:         if param.lower().startswith("rate="):
149:             try:
150:                 rate_str = param.split("=", 1)[1]
151:                 rate = int(rate_str)
152:             except (ValueError, IndexError):
153:                 pass
154:         elif param.startswith("audio/L"):
155:             try:
156:                 bits_per_sample = int(param.split("L", 1)[1])
157:             except (ValueError, IndexError):
158:                 pass
159: 
160:     return {"bits_per_sample": bits_per_sample, "rate": rate}
```

- **역할**: `"audio/L16;rate=24000"`과 같은 MIME 타입 문자열에서 `bits_per_sample`(16)과 `rate`(24000)를 추출하여 딕셔너리로 반환합니다.

---

### 6) 스크립트 실행 진입점 (Line 164 ~ 168)

```python
164: if __name__ == "__main__":
165:     generate()
```

- 스크립트가 직접 실행될 때 `generate()` 함수를 호출하여 TTS 생성 과정을 시작합니다.
