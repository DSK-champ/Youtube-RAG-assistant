const API_BASE = "http://localhost:3000";

const videoMessage = document.querySelector("#video-message");
const statusMessage = document.querySelector("#status-message");
const indexButton = document.querySelector("#index-button");
const questionForm = document.querySelector("#question-form");
const questionInput = document.querySelector("#question");
const askButton = document.querySelector("#ask-button");
const messages = document.querySelector("#messages");
const videoSetup = document.querySelector("#video-setup");
const chat = document.querySelector("#chat");
const newVideoToggle = document.querySelector("#new-video-toggle");

let pendingVideoId = null;
let pendingVideoUrl = null;
let videoId = null;
let videoUrl = null;
let isPolling = false;

function setStatus(message) {
  statusMessage.textContent = message;
}

async function getErrorMessage(response) {
  const body = await response.json().catch(() => ({}));
  return body.detail || body.message || `Request failed (${response.status}).`;
}

function getYouTubeVideoId(url) {
  try {
    const parsed = new URL(url);

    if (parsed.hostname === "youtu.be") {
      return parsed.pathname.slice(1);
    }

    if (
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(
        parsed.hostname
      )
    ) {
      if (parsed.pathname === "/watch") {
        return parsed.searchParams.get("v");
      }

      const match = parsed.pathname.match(/^\/(?:shorts|embed)\/([^/?]+)/);
      return match ? match[1] : null;
    }
  } catch {
    // The current tab might not have a regular web address.
  }

  return null;
}

function showDetectedVideo(url) {
  const detectedId = url ? getYouTubeVideoId(url) : null;

  // The active chat is still for this video. No new index action is needed.
  if (detectedId && detectedId === videoId) {
    pendingVideoId = null;
    pendingVideoUrl = null;
    newVideoToggle.hidden = true;

    if (!videoId) {
      videoSetup.hidden = false;
    }
    return;
  }

  // This tab isn't a YouTube video. Keep any existing chat as-is.
  if (!detectedId) {
    pendingVideoId = null;
    pendingVideoUrl = null;
    newVideoToggle.hidden = true;

    if (!videoId) {
      videoSetup.hidden = false;
      videoMessage.textContent = "Open a YouTube video to get started.";
      indexButton.disabled = true;
    }
    return;
  }

  pendingVideoId = detectedId;
  pendingVideoUrl = url;
  videoMessage.textContent = `YouTube video detected: ${detectedId}`;
  indexButton.disabled = false;

  // With no active chat, show the initial setup card. Otherwise,
  // leave the current chat in place and offer the new video in the header.
  if (!videoId) {
    videoSetup.hidden = false;
  } else {
    newVideoToggle.hidden = false;
  }
}

async function loadCurrentTab() {
  const [tab] = await chrome.tabs.query({
    active: true,
    currentWindow: true,
  });

  showDetectedVideo(tab?.url || null);
}

chrome.tabs.onActivated.addListener(() => {
  loadCurrentTab().catch((error) => setStatus(error.message));
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (tab.active && (changeInfo.url || changeInfo.status === "complete")) {
    showDetectedVideo(tab.url || null);
  }
});

newVideoToggle.addEventListener("click", () => {
  videoSetup.hidden = !videoSetup.hidden;
});

async function getVideoStatus() {
  const response = await fetch(
    `${API_BASE}/api/videos/${encodeURIComponent(videoId)}/status`
  );

  if (!response.ok) {
    throw new Error(await getErrorMessage(response));
  }

  return response.json();
}

async function pollForReady() {
  if (isPolling) return;
  isPolling = true;

  try {
    while (true) {
      const result = await getVideoStatus();

      if (result.status === "ready") {
        setStatus("Captions are ready. Ask a question.");
        questionInput.disabled = false;
        askButton.disabled = false;
        return;
      }

      if (result.status === "failed") {
        throw new Error(result.message || "Caption indexing failed.");
      }

      setStatus("Indexing captions…");
      await new Promise((resolve) => setTimeout(resolve, 2500));
    }
  } catch (error) {
    setStatus(error.message);
  } finally {
    isPolling = false;
    indexButton.disabled = false;
  }
}

indexButton.addEventListener("click", async () => {
  if (!pendingVideoId || !pendingVideoUrl) return;

  const selectedVideoUrl = pendingVideoUrl;

  indexButton.disabled = true;
  questionInput.disabled = true;
  askButton.disabled = true;
  setStatus("Submitting video for caption indexing…");

  try {
    const response = await fetch(`${API_BASE}/api/videos`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ url: selectedVideoUrl }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const result = await response.json();
    // Switch the assistant to the new video only because the user
    // explicitly clicked Index captions.
    videoId = result.video_id;
    videoUrl = selectedVideoUrl;
    pendingVideoId = null;
    pendingVideoUrl = null;
    newVideoToggle.hidden = true;
    videoSetup.hidden = true;
    chat.hidden = false;
    messages.replaceChildren();

    if (result.status === "ready") {
      setStatus("Captions are ready. Ask a question.");
      questionInput.disabled = false;
      askButton.disabled = false;
      indexButton.disabled = false;
      return;
    }

    await pollForReady();
  } catch (error) {
    setStatus(error.message);
    indexButton.disabled = false;
  }
});

function addMessage(role, text, parent = messages) {
  const bubble = document.createElement("div");
  bubble.className = `message ${role}`;
  bubble.textContent = text;
  parent.append(bubble);
  return bubble;
}

function addThinking(parent) {
  const indicator = document.createElement("div");
  indicator.className = "thinking-indicator";
  indicator.setAttribute("role", "status");
  indicator.setAttribute("aria-label", "Thinking");

  const dots = document.createElement("span");
  dots.className = "thinking-dots";
  dots.setAttribute("aria-hidden", "true");

  for (const delay of ["0s", "0.18s", "0.36s"]) {
    const dot = document.createElement("span");
    dot.className = "ripple-dot";
    dot.style.animationDelay = delay;
    dots.append(dot);
  }

  const text = document.createElement("span");
  text.className = "thinking-text";
  text.textContent = "Thinking…";

  indicator.append(dots, text);
  parent.append(indicator);
  return indicator;
}

function addSources(parent, sources) {
  if (!sources?.length) return;

  const disclosure = document.createElement("details");
  disclosure.className = "sources";

  const summary = document.createElement("summary");
  summary.textContent = `Show sources (${sources.length})`;

  disclosure.addEventListener("toggle", () => {
    summary.textContent = `${disclosure.open ? "Hide" : "Show"} sources (${sources.length})`;
  });

  const list = document.createElement("ul");
  list.className = "source-list";

  sources.forEach((source) => {
    const seconds = Math.max(0, Math.floor(source.start));
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = String(seconds % 60).padStart(2, "0");

    const item = document.createElement("li");
    item.className = "source-chunk";

    const link = document.createElement("a");
    link.href = `https://www.youtube.com/watch?v=${encodeURIComponent(videoId)}&t=${seconds}s`;
    link.target = "_blank";
    link.rel = "noreferrer";
    link.textContent = `${minutes}:${remainingSeconds}–${Math.floor(source.end / 60)}:${String(Math.floor(source.end) % 60).padStart(2, "0")}`;

    const text = document.createElement("p");
    text.textContent = source.text;

    item.append(link, text);
    list.append(item);
  });

  disclosure.append(summary, list);
  parent.append(disclosure);
}

questionForm.addEventListener("submit", async (event) => {
  event.preventDefault();

  const question = questionInput.value.trim();
  if (!question || !videoId) return;

  const turn = document.createElement("article");
  turn.className = "turn";
  messages.append(turn);
  addMessage("user", question, turn);
  questionInput.value = "";
  questionInput.disabled = true;
  askButton.disabled = true;
  const thinkingIndicator = addThinking(turn);

  try {
    const response = await fetch(`${API_BASE}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ video_id: videoId, question }),
    });

    if (!response.ok) {
      throw new Error(await getErrorMessage(response));
    }

    const result = await response.json();
    thinkingIndicator.remove();
    addMessage("assistant", result.answer, turn);
    addSources(turn, result.sources);
    setStatus("");
  } catch (error) {
    thinkingIndicator.remove();
    setStatus(error.message);
  } finally {
    questionInput.disabled = false;
    askButton.disabled = false;
    questionInput.focus();
  }
});

questionInput.addEventListener("keydown", (event) => {
  if (
    event.key === "Enter" &&
    !event.shiftKey &&
    !event.isComposing
  ) {
    event.preventDefault();
    questionForm.requestSubmit();
  }
});

loadCurrentTab().catch((error) => {
  videoMessage.textContent = "Could not read the active tab.";
  setStatus(error.message);
});
