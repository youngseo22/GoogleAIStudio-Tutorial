/**
 * AI YouTube Searcher - Frontend Application
 * Controls YouTube IFrame Player, Volume, Gemini 3.5 Transcribe, Gemini 3.8 Flash Q&A,
 * and Video Content Search & Timestamp Navigation.
 */

// State Management
let ytPlayer = null;
let isPlayerReady = false;
let currentVideoId = null;
let currentVideoTitle = "";
let transcriptSegments = []; // [{time: "00:15", seconds: 15, text: "..."}]
let fullTranscriptText = "";
let timeUpdateInterval = null;
let isMuted = false;
let lastVolume = 80;

// DOM Elements
const urlForm = document.getElementById("url-search-form");
const urlInput = document.getElementById("youtube-url-input");
const btnPaste = document.getElementById("btn-paste-url");
const playerPlaceholder = document.getElementById("yt-player-placeholder");
const playerWrapper = document.getElementById("player-wrapper");
const btnTogglePlay = document.getElementById("btn-toggle-play");
const iconPlay = document.getElementById("icon-play");
const iconPause = document.getElementById("icon-pause");
const btnMute = document.getElementById("btn-mute");
const iconVolHigh = document.getElementById("icon-vol-high");
const iconVolMuted = document.getElementById("icon-vol-muted");
const volumeSlider = document.getElementById("volume-slider");
const volumeLabel = document.getElementById("volume-label");
const currentTimeDisplay = document.getElementById("current-time");
const totalDurationDisplay = document.getElementById("total-duration");
const transcribeStatusChip = document.getElementById("ai-transcribe-status");

// Video Meta
const videoMetaSection = document.getElementById("video-meta-section");
const videoTitleEl = document.getElementById("video-title");
const videoAuthorEl = document.getElementById("video-author");
const videoDurationMetaEl = document.getElementById("video-duration-meta");

// Transcript & Content Search
const tabBtnSearch = document.getElementById("tab-btn-search");
const tabBtnAi = document.getElementById("tab-btn-ai");
const panelContentSearch = document.getElementById("panel-content-search");
const panelAiChat = document.getElementById("panel-ai-chat");
const contentSearchInput = document.getElementById("content-search-input");
const btnClearSearch = document.getElementById("btn-clear-search");
const searchCountBadge = document.getElementById("search-count");

// Sidebar AI Q&A
const sidebarChatMessages = document.getElementById("sidebar-chat-messages");
const sidebarChatForm = document.getElementById("sidebar-chat-form");
const sidebarChatInput = document.getElementById("sidebar-chat-input");
const btnSendSidebarChat = document.getElementById("btn-send-sidebar-chat");
const suggestionChipsSidebar = document.querySelectorAll(".chip-btn-sm");

const transcriptList = document.getElementById("transcript-list");
const transcribeProgress = document.getElementById("transcribe-progress");
const transcribeStatusText = document.getElementById("transcribe-status-text");
const btnCopyTranscript = document.getElementById("btn-copy-transcript");
const toastEl = document.getElementById("toast");
const toastMsgEl = document.getElementById("toast-msg");

// ============================================================================
// 1. YouTube IFrame API Initialization & Rendering Fix
// ============================================================================
let pendingVideoId = null;
let isYTAPILoaded = false;

window.onYouTubeIframeAPIReady = function () {
  console.log("YouTube IFrame API Ready");
  isYTAPILoaded = true;
  if (pendingVideoId) {
    createYouTubePlayer(pendingVideoId);
    pendingVideoId = null;
  }
};

function initYouTubePlayer(videoId) {
  // Always reveal the player wrapper and hide placeholder immediately
  if (playerPlaceholder) playerPlaceholder.classList.add("hidden");
  if (playerWrapper) playerWrapper.classList.remove("hidden");

  if (ytPlayer && typeof ytPlayer.loadVideoById === "function") {
    try {
      ytPlayer.loadVideoById({ videoId: videoId });
      enablePlayerControls();
      return;
    } catch (e) {
      console.warn("loadVideoById error, recreating player:", e);
    }
  }

  // Check if API is loaded yet
  if (typeof YT === "undefined" || !YT.Player) {
    pendingVideoId = videoId;
    return;
  }

  createYouTubePlayer(videoId);
}

function createYouTubePlayer(videoId) {
  if (playerPlaceholder) playerPlaceholder.classList.add("hidden");
  if (playerWrapper) playerWrapper.classList.remove("hidden");

  try {
    ytPlayer = new YT.Player("yt-player", {
      width: "100%",
      height: "100%",
      videoId: videoId,
      playerVars: {
        autoplay: 1,
        controls: 1,
        rel: 0,
        modestbranding: 1,
        playsinline: 1,
        enablejsapi: 1,
        origin: window.location.origin,
      },
      events: {
        onReady: onPlayerReady,
        onStateChange: onPlayerStateChange,
      },
    });
  } catch (err) {
    console.error("Failed to create YouTube player:", err);
  }
}

function onPlayerReady(event) {
  isPlayerReady = true;
  if (playerPlaceholder) playerPlaceholder.classList.add("hidden");
  if (playerWrapper) playerWrapper.classList.remove("hidden");
  enablePlayerControls();

  // Set default volume
  ytPlayer.setVolume(lastVolume);
  volumeSlider.value = lastVolume;
  volumeLabel.textContent = `${lastVolume}%`;

  // Start time update tracker
  if (timeUpdateInterval) clearInterval(timeUpdateInterval);
  timeUpdateInterval = setInterval(updatePlayerProgress, 350);
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.PLAYING) {
    iconPlay.classList.add("hidden");
    iconPause.classList.remove("hidden");
  } else {
    iconPlay.classList.remove("hidden");
    iconPause.classList.add("hidden");
  }
}

function enablePlayerControls() {
  btnTogglePlay.disabled = false;
  btnMute.disabled = false;
  volumeSlider.disabled = false;
}

// ============================================================================
// 2. Custom Player Controls (Volume, Play/Pause, Seek)
// ============================================================================
btnTogglePlay.addEventListener("click", () => {
  if (!isPlayerReady || !ytPlayer) return;
  const state = ytPlayer.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    ytPlayer.pauseVideo();
  } else {
    ytPlayer.playVideo();
  }
});

// Volume Slider Event (Requirement: 영상 출력에 음향 크기를 조절할 수 있게 해줘)
volumeSlider.addEventListener("input", (e) => {
  if (!isPlayerReady || !ytPlayer) return;
  const volume = parseInt(e.target.value, 10);
  ytPlayer.setVolume(volume);
  volumeLabel.textContent = `${volume}%`;

  if (volume === 0) {
    ytPlayer.mute();
    isMuted = true;
    iconVolHigh.classList.add("hidden");
    iconVolMuted.classList.remove("hidden");
  } else {
    if (ytPlayer.isMuted()) {
      ytPlayer.unMute();
      isMuted = false;
    }
    lastVolume = volume;
    iconVolHigh.classList.remove("hidden");
    iconVolMuted.classList.remove("hidden");
    iconVolMuted.classList.add("hidden");
  }
});

// Mute Toggle Button
btnMute.addEventListener("click", () => {
  if (!isPlayerReady || !ytPlayer) return;
  if (ytPlayer.isMuted()) {
    ytPlayer.unMute();
    ytPlayer.setVolume(lastVolume || 80);
    volumeSlider.value = lastVolume || 80;
    volumeLabel.textContent = `${lastVolume || 80}%`;
    iconVolHigh.classList.remove("hidden");
    iconVolMuted.classList.add("hidden");
    isMuted = false;
  } else {
    lastVolume = ytPlayer.getVolume();
    ytPlayer.mute();
    volumeSlider.value = 0;
    volumeLabel.textContent = `0%`;
    iconVolHigh.classList.add("hidden");
    iconVolMuted.classList.remove("hidden");
    isMuted = true;
  }
});

function formatTime(seconds) {
  if (!seconds || isNaN(seconds)) return "00:00";
  const sec = Math.floor(seconds);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  const h = Math.floor(m / 60);
  if (h > 0) {
    const remM = m % 60;
    return `${String(h).padStart(2, "0")}:${String(remM).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function updatePlayerProgress() {
  if (!isPlayerReady || !ytPlayer || typeof ytPlayer.getCurrentTime !== "function") return;
  const curr = ytPlayer.getCurrentTime();
  const dur = ytPlayer.getDuration();

  currentTimeDisplay.textContent = formatTime(curr);
  if (dur > 0) {
    totalDurationDisplay.textContent = formatTime(dur);
  }

  // Synchronize transcript active segment
  highlightActiveTranscriptSegment(curr);
}

// Seek video to specific timestamp (Requirement: 영상의 특정 내용을 검색하면 해당 시간 위치를 찾아주고 그 위치를 이동해서 영상을 재생)
function seekToSeconds(sec) {
  if (!isPlayerReady || !ytPlayer) return;
  ytPlayer.seekTo(sec, true);
  ytPlayer.playVideo();
  showToast(`⏱️ ${formatTime(sec)} 위치로 이동하여 재생합니다.`);
}

// ============================================================================
// 3. Top URL Search & Transcription Processing
// ============================================================================
function extractVideoId(url) {
  if (!url) return null;
  const cleanUrl = url.trim();
  const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/;
  const match = cleanUrl.match(regExp);
  if (match && match[1]) return match[1];

  const patterns = [
    /[?&]v=([a-zA-Z0-9_-]{11})/,
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /embed\/([a-zA-Z0-9_-]{11})/,
    /shorts\/([a-zA-Z0-9_-]{11})/,
    /\/([a-zA-Z0-9_-]{11})(?:[?&]|$)/,
  ];
  for (const p of patterns) {
    const m = cleanUrl.match(p);
    if (m && m[1]) return m[1];
  }
  return null;
}

// Paste button
btnPaste.addEventListener("click", async () => {
  try {
    const text = await navigator.clipboard.readText();
    if (text) {
      urlInput.value = text.trim();
      showToast("클립보드 주소를 붙여넣었습니다.");
    }
  } catch (err) {
    showToast("클립보드 권한이 필요합니다.");
  }
});

// Sample video buttons
document.querySelectorAll(".btn-sample").forEach((btn) => {
  btn.addEventListener("click", () => {
    urlInput.value = btn.getAttribute("data-url");
    urlForm.dispatchEvent(new Event("submit"));
  });
});

urlForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const url = urlInput.value.trim();
  if (!url) return;

  const vid = extractVideoId(url);
  if (!vid) {
    alert("올바른 유튜브 링크 형식을 입력해주세요.");
    return;
  }

  currentVideoId = vid;
  // Initialize or load player immediately
  initYouTubePlayer(vid);

  // Start audio download & Gemini 3.5 transcribe process
  await startProcessingPipeline(url);
});

async function startProcessingPipeline(url) {
  // Reset UI
  transcribeStatusChip.textContent = "분석 중...";
  transcribeStatusChip.className = "status-chip processing";
  transcribeProgress.classList.remove("hidden");
  transcribeStatusText.textContent = "오디오 스트림 다운로드 준비 중...";
  transcriptList.innerHTML = "";
  transcriptSegments = [];
  fullTranscriptText = "";
  sidebarChatInput.disabled = true;
  btnSendSidebarChat.disabled = true;
  contentSearchInput.disabled = true;
  btnCopyTranscript.disabled = true;

  try {
    const response = await fetch("/api/process", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url }),
    });

    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || "서버 처리 오류가 발생했습니다.");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop(); // remain incomplete part

      for (const block of lines) {
        if (!block.startsWith("data: ")) continue;
        const payloadStr = block.replace("data: ", "").trim();
        if (!payloadStr) continue;

        try {
          const data = JSON.parse(payloadStr);
          handlePipelineEvent(data);
        } catch (e) {
          console.error("SSE JSON parse error:", e);
        }
      }
    }
  } catch (error) {
    console.error("Processing error:", error);
    transcribeStatusChip.textContent = "오류 발생";
    transcribeStatusChip.className = "status-chip";
    transcribeStatusText.textContent = `에러: ${error.message}`;
    showToast(`❌ ${error.message}`);
  }
}

function handlePipelineEvent(data) {
  if (data.type === "status") {
    transcribeStatusText.textContent = data.message;
  } else if (data.type === "video_info") {
    // Show meta details
    const info = data.data;
    currentVideoTitle = info.title;
    videoTitleEl.textContent = info.title;
    videoAuthorEl.textContent = info.uploader;
    videoDurationMetaEl.textContent = info.duration_formatted;
    videoMetaSection.classList.remove("hidden");
  } else if (data.type === "chunk") {
    // Stream chunks into transcript text
    fullTranscriptText += data.text;
  } else if (data.type === "done") {
    fullTranscriptText = data.full_transcript;
    transcriptSegments = data.segments || [];

    transcribeProgress.classList.add("hidden");
    if (data.cached) {
      transcribeStatusChip.textContent = "저장본 불러옴";
      transcribeStatusChip.className = "status-chip done";
      showToast("⚡ 이전에 저장된 트랜스크립트를 성공적으로 불러왔습니다!");
    } else {
      transcribeStatusChip.textContent = "전사 완료";
      transcribeStatusChip.className = "status-chip done";
      showToast("✨ Gemini 3.5 Transcribe 및 타임스탬프 추출 완료! (저장됨)");
    }

    renderTranscriptSegments(transcriptSegments);

    // Enable chat & content search
    sidebarChatInput.disabled = false;
    btnSendSidebarChat.disabled = false;
    contentSearchInput.disabled = false;
    btnCopyTranscript.disabled = false;
  } else if (data.type === "error") {
    transcribeStatusText.textContent = data.message;
    showToast(`❌ ${data.message}`);
  }
}

// ============================================================================
// 4. Transcript Timeline Rendering & Synchronized Highlighting
// ============================================================================
function renderTranscriptSegments(segments, searchQuery = "") {
  transcriptList.innerHTML = "";

  if (!segments || segments.length === 0) {
    transcriptList.innerHTML = `
      <div class="empty-transcript">
        <p>전사된 내용이 없습니다.</p>
      </div>
    `;
    return;
  }

  const queryClean = searchQuery.trim().toLowerCase();
  let matchCount = 0;

  segments.forEach((seg, idx) => {
    const item = document.createElement("div");
    item.className = "segment-item";
    item.dataset.seconds = seg.seconds;
    item.dataset.index = idx;

    let displayText = escapeHtml(seg.text);

    if (queryClean) {
      const idxFind = seg.text.toLowerCase().indexOf(queryClean);
      if (idxFind !== -1) {
        matchCount++;
        const regex = new RegExp(`(${escapeRegex(queryClean)})`, "gi");
        displayText = displayText.replace(regex, "<mark>$1</mark>");
      } else {
        // if searching, optionally hide non-matching items
        item.style.display = "none";
      }
    }

    item.innerHTML = `
      <span class="segment-ts">${seg.time}</span>
      <span class="segment-text">${displayText}</span>
    `;

    // Click to seek video!
    item.addEventListener("click", () => {
      seekToSeconds(seg.seconds);
    });

    transcriptList.appendChild(item);
  });

  if (queryClean) {
    searchCountBadge.textContent = `${matchCount}개 일치`;
    searchCountBadge.classList.remove("hidden");
  } else {
    searchCountBadge.classList.add("hidden");
  }
}

function highlightActiveTranscriptSegment(currentSec) {
  if (!transcriptSegments || transcriptSegments.length === 0) return;

  let activeIndex = -1;
  for (let i = 0; i < transcriptSegments.length; i++) {
    if (currentSec >= transcriptSegments[i].seconds) {
      activeIndex = i;
    } else {
      break;
    }
  }

  if (activeIndex === -1) return;

  const items = transcriptList.querySelectorAll(".segment-item");
  items.forEach((it) => {
    if (parseInt(it.dataset.index, 10) === activeIndex) {
      if (!it.classList.contains("active")) {
        it.classList.add("active");
        it.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } else {
      it.classList.remove("active");
    }
  });
}

// Copy transcript
btnCopyTranscript.addEventListener("click", () => {
  if (!fullTranscriptText) return;
  navigator.clipboard.writeText(fullTranscriptText).then(() => {
    showToast("📋 전체 전사 내용이 클립보드에 복사되었습니다.");
  });
});

// ============================================================================
// 5. Video Content Search (Requirement: 영상 특정 내용 검색 및 시간 위치 이동)
// ============================================================================
contentSearchInput.addEventListener("input", (e) => {
  const query = e.target.value;
  if (query.trim().length > 0) {
    btnClearSearch.classList.remove("hidden");
  } else {
    btnClearSearch.classList.add("hidden");
  }
  renderTranscriptSegments(transcriptSegments, query);
});

btnClearSearch.addEventListener("click", () => {
  contentSearchInput.value = "";
  btnClearSearch.classList.add("hidden");
  renderTranscriptSegments(transcriptSegments, "");
  contentSearchInput.focus();
});

// ============================================================================
// 5-1. Dual Mode Sidebar Tabs (Content Search vs AI Q&A)
// ============================================================================
if (tabBtnSearch && tabBtnAi) {
  tabBtnSearch.addEventListener("click", () => {
    tabBtnSearch.classList.add("active");
    tabBtnAi.classList.remove("active");
    panelContentSearch.classList.remove("hidden");
    panelAiChat.classList.add("hidden");
  });

  tabBtnAi.addEventListener("click", () => {
    tabBtnAi.classList.add("active");
    tabBtnSearch.classList.remove("active");
    panelAiChat.classList.remove("hidden");
    panelContentSearch.classList.add("hidden");
    if (!sidebarChatInput.disabled) {
      sidebarChatInput.focus();
    }
  });
}

// ============================================================================
// 6. Gemini 3.8 Flash AI Q&A Chat Pipeline (Sidebar AI Chat)
// ============================================================================
if (sidebarChatForm) {
  sidebarChatForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const question = sidebarChatInput.value.trim();
    if (!question) return;

    sidebarChatInput.value = "";
    sendChatMessage(question);
  });
}

if (suggestionChipsSidebar) {
  suggestionChipsSidebar.forEach((chip) => {
    chip.addEventListener("click", () => {
      if (sidebarChatInput.disabled) {
        showToast("먼저 유튜브 영상을 검색해주세요.");
        return;
      }
      const query = chip.getAttribute("data-query");
      sendChatMessage(query);
    });
  });
}

async function sendChatMessage(question) {
  // Add User bubble to sidebar
  appendChatBubble("user", question);

  // Add Assistant bubble with spinner to sidebar
  const assistantBubble = appendChatBubble("assistant", "");
  const spinnerHtml = `
    <div style="display: flex; align-items: center; gap: 8px;">
      <div class="progress-spinner"></div>
      <span style="color: var(--text-secondary);">Gemini 3.8 Flash 답변 생성 중...</span>
    </div>
  `;
  if (assistantBubble) assistantBubble.innerHTML = spinnerHtml;

  // Disable sidebar input
  if (sidebarChatInput) sidebarChatInput.disabled = true;
  if (btnSendSidebarChat) btnSendSidebarChat.disabled = true;

  try {
    const response = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        question: question,
        video_title: currentVideoTitle,
        transcript: fullTranscriptText,
        segments: transcriptSegments,
      }),
    });

    if (!response.ok) {
      throw new Error("Gemini Q&A 답변 생성 실패");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let accumulatedText = "";

    if (assistantBubble) assistantBubble.innerHTML = "";

    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n\n");
      buffer = lines.pop();

      for (const block of lines) {
        if (!block.startsWith("data: ")) continue;
        const payloadStr = block.replace("data: ", "").trim();
        if (!payloadStr) continue;

        try {
          const data = JSON.parse(payloadStr);
          if (data.type === "chunk") {
            accumulatedText += data.text;
            const formatted = formatChatContentWithTimestamps(accumulatedText);
            if (assistantBubble) {
              assistantBubble.innerHTML = formatted;
              if (sidebarChatMessages) sidebarChatMessages.scrollTop = sidebarChatMessages.scrollHeight;
            }
          } else if (data.type === "error") {
            const errHtml = `<span style="color: #ff6b6b;">${data.message}</span>`;
            if (assistantBubble) assistantBubble.innerHTML = errHtml;
          }
        } catch (e) {
          console.error("Chat SSE parse error:", e);
        }
      }
    }

    if (assistantBubble) bindTimestampLinks(assistantBubble);
  } catch (err) {
    const errText = `<span style="color: #ff6b6b;">답변을 불러오는 중 오류가 발생했습니다: ${err.message}</span>`;
    if (assistantBubble) assistantBubble.innerHTML = errText;
  } finally {
    if (sidebarChatInput) sidebarChatInput.disabled = false;
    if (btnSendSidebarChat) btnSendSidebarChat.disabled = false;
  }
}

function appendChatBubble(role, text) {
  let bubble = null;
  if (sidebarChatMessages) {
    bubble = document.createElement("div");
    bubble.className = `chat-bubble ${role}`;
    if (text) bubble.textContent = text;
    sidebarChatMessages.appendChild(bubble);
    sidebarChatMessages.scrollTop = sidebarChatMessages.scrollHeight;
  }
  return bubble;
}

// Convert [MM:SS] or [HH:MM:SS] patterns in markdown text to clickable Seek badges
function formatChatContentWithTimestamps(raw) {
  // Convert newlines to <br> or paragraphs
  let safe = escapeHtml(raw);

  // Markdown bold formatting: **bold**
  safe = safe.replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");

  // Regex for timestamps: [00:15] or [01:23:45]
  const tsPattern = /\[((\d{1,2}:)?\d{1,2}:\d{2})\]/g;
  safe = safe.replace(tsPattern, (match, timeStr) => {
    const sec = timeStrToSeconds(timeStr);
    return `<a class="ts-link" data-seconds="${sec}" title="${timeStr} 위치로 이동">▶ [${timeStr}]</a>`;
  });

  // Simple bullet points
  safe = safe.replace(/^- (.*)/gm, "• $1");
  safe = safe.replace(/\n/g, "<br/>");

  return safe;
}

function bindTimestampLinks(container) {
  const links = container.querySelectorAll(".ts-link");
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const sec = parseInt(link.getAttribute("data-seconds"), 10);
      seekToSeconds(sec);
    });
  });
}

function timeStrToSeconds(timeStr) {
  const parts = timeStr.trim().split(":");
  if (parts.length === 2) {
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  } else if (parts.length === 3) {
    return parseInt(parts[0], 10) * 3600 + parseInt(parts[1], 10) * 60 + parseInt(parts[2], 10);
  }
  return 0;
}

// ============================================================================
// Utilities
// ============================================================================
function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

function escapeRegex(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

let toastTimer = null;
function showToast(message) {
  toastMsgEl.textContent = message;
  toastEl.classList.remove("hidden");
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toastEl.classList.add("hidden");
  }, 3000);
}
