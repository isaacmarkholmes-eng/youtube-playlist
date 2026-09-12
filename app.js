const player = document.getElementById("player");
const titleEl = document.getElementById("video-title");
const metaEl = document.getElementById("video-meta");
const queueEl = document.getElementById("queue");
const errorEl = document.getElementById("error");

const btnRandom = document.getElementById("btn-random");
const btnNext = document.getElementById("btn-next");
const btnReshuffle = document.getElementById("btn-reshuffle");

let videos = [];
let shuffled = [];
let currentIndex = 0;

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function embedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
  });
  return `https://www.youtube.com/embed/${encodeURIComponent(videoId)}?${params}`;
}

function thumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

function getUpNext() {
  const upcoming = [];
  for (let offset = 1; offset < shuffled.length; offset += 1) {
    const index = (currentIndex + offset) % shuffled.length;
    upcoming.push({ video: shuffled[index], index });
  }
  return upcoming;
}

function renderQueue() {
  queueEl.innerHTML = "";

  getUpNext().forEach(({ video, index }) => {
    const item = document.createElement("button");
    item.type = "button";
    item.className = "queue-item";
    item.title = video.title || video.id;

    const img = document.createElement("img");
    img.src = thumbnailUrl(video.id);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    const title = document.createElement("span");
    title.className = "queue-item-title";
    title.textContent = video.title || video.id;

    item.append(img, title);
    item.addEventListener("click", () => playAt(index));
    queueEl.appendChild(item);
  });
}

function playVideo(video, index) {
  currentIndex = index;
  player.src = embedUrl(video.id);
  titleEl.textContent = video.title || "Untitled video";
  metaEl.textContent = `${index + 1} of ${shuffled.length} in shuffle`;
  renderQueue();
}

function playAt(index) {
  if (!shuffled.length) {
    return;
  }
  playVideo(shuffled[index], index);
}

function playRandom() {
  if (!shuffled.length) {
    return;
  }
  const index = Math.floor(Math.random() * shuffled.length);
  playAt(index);
}

function playNext() {
  if (!shuffled.length) {
    return;
  }
  const nextIndex = (currentIndex + 1) % shuffled.length;
  playAt(nextIndex);
}

function reshuffleAll() {
  shuffled = shuffle(videos);
  playAt(Math.floor(Math.random() * shuffled.length));
}

function loadVideos() {
  if (Array.isArray(window.VIDEO_LIST) && window.VIDEO_LIST.length > 0) {
    return window.VIDEO_LIST;
  }
  throw new Error("No videos found. Check that videos.js defines window.VIDEO_LIST.");
}

function init() {
  try {
    const data = loadVideos();
    videos = data.filter((entry) => entry && entry.id);
    if (!videos.length) {
      throw new Error("No valid video IDs found in the video list.");
    }

    shuffled = shuffle(videos);
    playAt(0);
  } catch (error) {
    titleEl.textContent = "Could not load videos";
    metaEl.textContent = "";
    showError(error.message);
  }
}

btnRandom.addEventListener("click", playRandom);
btnNext.addEventListener("click", playNext);
btnReshuffle.addEventListener("click", reshuffleAll);

init();
