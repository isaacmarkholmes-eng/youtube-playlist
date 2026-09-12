const player = document.getElementById("player");
const titleEl = document.getElementById("video-title");
const metaEl = document.getElementById("video-meta");
const videoTagsEl = document.getElementById("video-tags");
const queueEl = document.getElementById("queue");
const errorEl = document.getElementById("error");
const emptyStateEl = document.getElementById("empty-state");
const resultsCountEl = document.getElementById("results-count");

const btnRandom = document.getElementById("btn-random");
const btnNext = document.getElementById("btn-next");
const btnReshuffle = document.getElementById("btn-reshuffle");
const searchInput = document.getElementById("search-input");
const channelFilter = document.getElementById("channel-filter");
const tagFiltersEl = document.getElementById("tag-filters");

let videos = [];
let shuffled = [];
let currentIndex = 0;
const activeTags = new Set();
let searchDebounceTimer = null;

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeVideo(entry) {
  return {
    id: entry.id,
    title: entry.title || entry.id,
    channel: entry.channel || "Unknown",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
  };
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

function getFilteredVideos() {
  const query = searchInput.value.trim().toLowerCase();
  const channel = channelFilter.value;

  return videos.filter((video) => {
    if (channel !== "all" && video.channel !== channel) {
      return false;
    }

    if (activeTags.size > 0 && !video.tags.some((tag) => activeTags.has(tag))) {
      return false;
    }

    if (!query) {
      return true;
    }

    const haystack = [video.title, video.channel, ...video.tags]
      .join(" ")
      .toLowerCase();
    return haystack.includes(query);
  });
}

function getUniqueChannels() {
  return [...new Set(videos.map((video) => video.channel))].sort();
}

function getUniqueTags() {
  return [...new Set(videos.flatMap((video) => video.tags))].sort();
}

function populateChannelFilter() {
  const selected = channelFilter.value;
  channelFilter.innerHTML = '<option value="all">All channels</option>';

  getUniqueChannels().forEach((channel) => {
    const option = document.createElement("option");
    option.value = channel;
    option.textContent = channel;
    channelFilter.appendChild(option);
  });

  if ([...channelFilter.options].some((option) => option.value === selected)) {
    channelFilter.value = selected;
  }
}

function populateTagFilters() {
  tagFiltersEl.innerHTML = "";

  getUniqueTags().forEach((tag) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "tag-chip";
    button.textContent = tag;
    button.dataset.tag = tag;
    button.setAttribute("aria-pressed", activeTags.has(tag) ? "true" : "false");
    if (activeTags.has(tag)) {
      button.classList.add("active");
    }
    button.addEventListener("click", () => {
      if (activeTags.has(tag)) {
        activeTags.delete(tag);
      } else {
        activeTags.add(tag);
      }
      onFiltersChanged();
    });
    tagFiltersEl.appendChild(button);
  });
}

function updateResultsCount(filteredCount) {
  const total = videos.length;
  const channel = channelFilter.value;
  const query = searchInput.value.trim();
  const tagCount = activeTags.size;

  if (channel === "all" && !query && tagCount === 0) {
    resultsCountEl.textContent = `${total} videos`;
    return;
  }

  resultsCountEl.textContent = `${filteredCount} of ${total} videos match`;
}

function renderBrowseGrid() {
  queueEl.innerHTML = "";
  const filtered = getFilteredVideos();
  const currentId = shuffled[currentIndex]?.id;

  updateResultsCount(filtered.length);
  emptyStateEl.hidden = filtered.length > 0;
  queueEl.hidden = filtered.length === 0;

  filtered.forEach((video) => {
    const shuffledIndex = shuffled.findIndex((entry) => entry.id === video.id);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "queue-item";
    item.title = video.title;

    if (video.id === currentId) {
      item.classList.add("active");
    }

    const img = document.createElement("img");
    img.src = thumbnailUrl(video.id);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";

    const title = document.createElement("span");
    title.className = "queue-item-title";
    title.textContent = video.title;

    const channel = document.createElement("span");
    channel.className = "queue-item-channel";
    channel.textContent = video.channel;

    item.append(img, title, channel);
    item.addEventListener("click", () => {
      if (shuffledIndex >= 0) {
        playAt(shuffledIndex);
      } else {
        shuffled = shuffle(filtered);
        const index = shuffled.findIndex((entry) => entry.id === video.id);
        playAt(index >= 0 ? index : 0);
      }
    });
    queueEl.appendChild(item);
  });
}

function renderCurrentTags(video) {
  videoTagsEl.innerHTML = "";
  video.tags.forEach((tag) => {
    const chip = document.createElement("span");
    chip.className = "now-playing-tag";
    chip.textContent = tag;
    videoTagsEl.appendChild(chip);
  });
}

function updateNowPlaying(video, index) {
  titleEl.textContent = video.title;
  metaEl.textContent = `${video.channel} · ${index + 1} of ${shuffled.length} in shuffle`;
  renderCurrentTags(video);
  renderBrowseGrid();
}

function playVideo(video, index, reloadPlayer = true) {
  currentIndex = index;
  if (reloadPlayer) {
    player.src = embedUrl(video.id);
  }
  updateNowPlaying(video, index);
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

function reshuffleFiltered() {
  const filtered = getFilteredVideos();
  if (!filtered.length) {
    shuffled = [];
    currentIndex = 0;
    player.removeAttribute("src");
    titleEl.textContent = "No matches";
    metaEl.textContent = "";
    videoTagsEl.innerHTML = "";
    renderBrowseGrid();
    return;
  }

  shuffled = shuffle(filtered);
  playAt(Math.floor(Math.random() * shuffled.length));
}

function syncShuffleToFilters() {
  const filtered = getFilteredVideos();
  const currentId = shuffled[currentIndex]?.id;
  const hasActivePlayer = Boolean(player.getAttribute("src"));

  populateTagFilters();

  if (!filtered.length) {
    shuffled = [];
    currentIndex = 0;
    player.removeAttribute("src");
    titleEl.textContent = "No matches";
    metaEl.textContent = "";
    videoTagsEl.innerHTML = "";
    renderBrowseGrid();
    return;
  }

  shuffled = shuffle(filtered);
  const preservedIndex = currentId
    ? shuffled.findIndex((video) => video.id === currentId)
    : -1;

  if (preservedIndex >= 0) {
    playVideo(shuffled[preservedIndex], preservedIndex, !hasActivePlayer);
    return;
  }

  playAt(0);
}

function onFiltersChanged() {
  syncShuffleToFilters();
}

function onSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(onFiltersChanged, 200);
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
    videos = data.filter((entry) => entry && entry.id).map(normalizeVideo);
    if (!videos.length) {
      throw new Error("No valid video IDs found in the video list.");
    }

    populateChannelFilter();
    populateTagFilters();
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
btnReshuffle.addEventListener("click", reshuffleFiltered);
searchInput.addEventListener("input", onSearchInput);
channelFilter.addEventListener("change", onFiltersChanged);

init();
