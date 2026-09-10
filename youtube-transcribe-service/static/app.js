document.addEventListener('DOMContentLoaded', () => {
  // Elements
  const tabYouTube = document.getElementById('tab-youtube');
  const tabFile = document.getElementById('tab-file');
  const youtubeView = document.getElementById('youtube-view');
  const fileView = document.getElementById('file-view');

  const transcribeForm = document.getElementById('transcribe-form');
  const youtubeUrlInput = document.getElementById('youtube-url');
  const btnPaste = document.getElementById('btn-paste');
  const sampleSelect = document.getElementById('sample-select');
  const modelSelect = document.getElementById('model-select');
  const btnSubmit = document.getElementById('btn-submit');

  const videoPreviewCard = document.getElementById('video-preview-card');
  const videoThumb = document.getElementById('video-thumb');
  const videoTitle = document.getElementById('video-title');
  const videoAuthor = document.getElementById('video-author');
  const videoDuration = document.getElementById('video-duration');

  const progressCard = document.getElementById('progress-card');
  const statusIcon = document.getElementById('status-icon');
  const statusText = document.getElementById('status-text');
  const step1 = document.getElementById('step-1');
  const step2 = document.getElementById('step-2');
  const step3 = document.getElementById('step-3');

  const SPINNER_HTML = '<div class="spinner"></div>';
  const SUCCESS_ICON_HTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>';
  const ERROR_ICON_HTML = '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

  const resultCard = document.getElementById('result-card');
  const transcriptText = document.getElementById('transcript-text');
  const resultStats = document.getElementById('result-stats');
  const audioPlayer = document.getElementById('audio-player');
  const audioFilename = document.getElementById('audio-filename');

  const btnCopy = document.getElementById('btn-copy');
  const btnExport = document.getElementById('btn-export');
  const exportDropdown = btnExport.parentElement;
  const exportTxt = document.getElementById('export-txt');
  const exportMd = document.getElementById('export-md');
  const exportJson = document.getElementById('export-json');

  const dropZone = document.getElementById('drop-zone');
  const audioFileInput = document.getElementById('audio-file-input');
  const fileInfoPreview = document.getElementById('file-info-preview');
  const selectedFileName = document.getElementById('selected-file-name');
  const btnUploadSubmit = document.getElementById('btn-upload-submit');
  const toast = document.getElementById('toast');
  const toastMessage = document.getElementById('toast-message');

  let currentFullText = '';
  let currentVideoTitle = 'YouTube Transcript';
  let selectedUploadFile = null;

  // Tabs switching
  tabYouTube.addEventListener('click', () => {
    tabYouTube.classList.add('active');
    tabFile.classList.remove('active');
    youtubeView.classList.add('active');
    fileView.classList.remove('active');
  });

  tabFile.addEventListener('click', () => {
    tabFile.classList.add('active');
    tabYouTube.classList.remove('active');
    fileView.classList.add('active');
    youtubeView.classList.remove('active');
  });

  // Paste from clipboard
  btnPaste.addEventListener('click', async () => {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        youtubeUrlInput.value = text.trim();
        fetchVideoPreview(youtubeUrlInput.value);
        showToast('클립보드 내용이 붙여넣어졌습니다.');
      }
    } catch (err) {
      showToast('클립보드 접근 권한이 필요합니다.');
    }
  });

  // Sample select
  sampleSelect.addEventListener('change', (e) => {
    if (e.target.value) {
      youtubeUrlInput.value = e.target.value;
      fetchVideoPreview(e.target.value);
    }
  });

  // URL input debounce for preview
  let debounceTimeout;
  youtubeUrlInput.addEventListener('input', () => {
    clearTimeout(debounceTimeout);
    debounceTimeout = setTimeout(() => {
      const url = youtubeUrlInput.value.trim();
      if (url.includes('youtube.com') || url.includes('youtu.be')) {
        fetchVideoPreview(url);
      } else {
        videoPreviewCard.classList.add('hidden');
      }
    }, 500);
  });

  async function fetchVideoPreview(url) {
    try {
      const res = await fetch('/api/info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      if (res.ok) {
        const data = await res.json();
        videoThumb.src = data.thumbnail || '';
        videoTitle.textContent = data.title;
        videoAuthor.textContent = data.uploader;
        videoDuration.textContent = data.duration_formatted;
        currentVideoTitle = data.title;
        videoPreviewCard.classList.remove('hidden');
      }
    } catch (e) {
      // preview error silent ignore
    }
  }

  // Handle Form Submit (SSE Streaming)
  transcribeForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = youtubeUrlInput.value.trim();
    if (!url) return;

    startTranscriptionUI();
    setStep(1);
    statusText.textContent = '유튜브 영상 분석 및 오디오 다운로드 준비 중...';

    try {
      const response = await fetch('/api/transcribe-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url,
          model: modelSelect.value,
        }),
      });

      if (!response.ok) {
        throw new Error(`서버 오류 (${response.status})`);
      }

      setStep(2);
      statusText.textContent = '유튜브 고음질 오디오 다운로드 중...';

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop(); // keep partial chunk

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const rawData = line.replace('data: ', '').trim();
            if (!rawData) continue;
            try {
              const event = JSON.parse(rawData);
              handleStreamEvent(event);
            } catch (err) {
              console.error('JSON parse error on SSE:', err, rawData);
            }
          }
        }
      }

    } catch (err) {
      showToast(`전사 실패: ${err.message}`);
      setErrorState(`오류 발생: ${err.message}`);
    } finally {
      btnSubmit.disabled = false;
    }
  });

  function handleStreamEvent(event) {
    if (event.type === 'status') {
      statusText.textContent = event.message;
    } else if (event.type === 'info') {
      setStep(3);
      statusText.textContent = 'Gemini 3.5 모델이 음성을 인식하고 전사 중입니다...';
      if (event.data) {
        if (event.data.title) currentVideoTitle = event.data.title;
        if (event.data.file_name) {
          audioFilename.textContent = `${event.data.title || event.data.file_name}`;
        }
      }
    } else if (event.type === 'chunk') {
      currentFullText += event.text;
      transcriptText.textContent = currentFullText;
      resultStats.textContent = `글자 수: ${currentFullText.length.toLocaleString()}자`;
      resultCard.classList.remove('hidden');
      transcriptText.scrollTop = transcriptText.scrollHeight;
    } else if (event.type === 'complete') {
      currentFullText = event.full_text || currentFullText;
      transcriptText.textContent = currentFullText;
      resultStats.textContent = `글자 수: ${currentFullText.length.toLocaleString()}자`;
      
      if (event.audio_url) {
        audioPlayer.src = event.audio_url;
      }

      setAllStepsComplete();
      statusText.textContent = '전사 작업이 성공적으로 완료되었습니다!';
      showToast('전사가 성공적으로 완료되었습니다.');
    } else if (event.type === 'error') {
      showToast(`오류: ${event.message}`);
      setErrorState(`실패: ${event.message}`);
    }
  }

  // Direct File Upload Logic
  dropZone.addEventListener('click', () => audioFileInput.click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('dragover');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleFileSelected(e.dataTransfer.files[0]);
    }
  });

  audioFileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleFileSelected(e.target.files[0]);
    }
  });

  function handleFileSelected(file) {
    selectedUploadFile = file;
    selectedFileName.textContent = `📁 ${file.name} (${(file.size / (1024 * 1024)).toFixed(2)} MB)`;
    fileInfoPreview.classList.remove('hidden');
  }

  btnUploadSubmit.addEventListener('click', async () => {
    if (!selectedUploadFile) return;

    startTranscriptionUI();
    setStep(2);
    statusText.textContent = '오디오 파일 업로드 및 Gemini 3.5 전사 진행 중...';

    const formData = new FormData();
    formData.append('file', selectedUploadFile);
    formData.append('model', modelSelect.value);

    try {
      setStep(3);
      const res = await fetch('/api/upload-transcribe', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('파일 전사 요청 실패');

      const data = await res.json();
      currentFullText = data.transcript || '';
      currentVideoTitle = data.title;
      transcriptText.textContent = currentFullText;
      resultStats.textContent = `글자 수: ${currentFullText.length.toLocaleString()}자`;

      if (data.audio_url) {
        audioPlayer.src = data.audio_url;
        audioFilename.textContent = data.title;
      }

      resultCard.classList.remove('hidden');
      setAllStepsComplete();
      statusText.textContent = '전사 작업이 성공적으로 완료되었습니다!';
      showToast('전사가 완료되었습니다.');
    } catch (err) {
      showToast(`업로드 전사 실패: ${err.message}`);
      setErrorState(`오류: ${err.message}`);
    } finally {
      btnSubmit.disabled = false;
    }
  });

  // UI Helpers
  function startTranscriptionUI() {
    btnSubmit.disabled = true;
    currentFullText = '';
    transcriptText.textContent = '';
    if (statusIcon) statusIcon.innerHTML = SPINNER_HTML;
    progressCard.classList.remove('complete', 'error');
    progressCard.classList.remove('hidden');
    resultCard.classList.remove('hidden');
    step1.className = 'step';
    step2.className = 'step';
    step3.className = 'step';
  }

  function setStep(stepNum) {
    step1.className = stepNum >= 1 ? (stepNum > 1 ? 'step complete' : 'step active') : 'step';
    step2.className = stepNum >= 2 ? (stepNum > 2 ? 'step complete' : 'step active') : 'step';
    step3.className = stepNum >= 3 ? 'step active' : 'step';
  }

  function setAllStepsComplete() {
    step1.className = 'step complete';
    step2.className = 'step complete';
    step3.className = 'step complete';
    if (statusIcon) statusIcon.innerHTML = SUCCESS_ICON_HTML;
    progressCard.classList.remove('error');
    progressCard.classList.add('complete');
  }

  function setErrorState(errorMessage) {
    if (statusIcon) statusIcon.innerHTML = ERROR_ICON_HTML;
    progressCard.classList.remove('complete');
    progressCard.classList.add('error');
    statusText.textContent = errorMessage;
  }

  // Copy to clipboard
  btnCopy.addEventListener('click', async () => {
    if (!currentFullText) return;
    try {
      await navigator.clipboard.writeText(currentFullText);
      showToast('전사 텍스트가 클립보드에 복사되었습니다.');
    } catch (e) {
      showToast('복사에 실패했습니다.');
    }
  });

  // Export dropdown
  btnExport.addEventListener('click', (e) => {
    e.stopPropagation();
    exportDropdown.classList.toggle('open');
  });

  document.addEventListener('click', () => exportDropdown.classList.remove('open'));

  exportTxt.addEventListener('click', (e) => {
    e.preventDefault();
    downloadFile(`${currentVideoTitle}_transcript.txt`, currentFullText, 'text/plain;charset=utf-8');
  });

  exportMd.addEventListener('click', (e) => {
    e.preventDefault();
    const mdContent = `# ${currentVideoTitle}\n\n**Generated by Gemini 3.5 Transcribe**\n\n---\n\n${currentFullText}`;
    downloadFile(`${currentVideoTitle}_transcript.md`, mdContent, 'text/markdown;charset=utf-8');
  });

  exportJson.addEventListener('click', (e) => {
    e.preventDefault();
    const jsonContent = JSON.stringify({
      title: currentVideoTitle,
      model: modelSelect.value,
      timestamp: new Date().toISOString(),
      transcript: currentFullText,
    }, null, 2);
    downloadFile(`${currentVideoTitle}_transcript.json`, jsonContent, 'application/json;charset=utf-8');
  });

  function downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${filename} 파일이 다운로드되었습니다.`);
  }

  // Toast helper
  let toastTimer;
  function showToast(msg) {
    toastMessage.textContent = msg;
    toast.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toast.classList.add('hidden');
    }, 3000);
  }
});
