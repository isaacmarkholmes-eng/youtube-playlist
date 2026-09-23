const player = document.getElementById("player");
const titleEl = document.getElementById("video-title");
const metaEl = document.getElementById("video-meta");
const videoTagsEl = document.getElementById("video-tags");
const queueEl = document.getElementById("queue");
const errorEl = document.getElementById("error");
const emptyStateEl = document.getElementById("empty-state");
const resultsCountEl = document.getElementById("results-count");

const btnPause = document.getElementById("btn-pause");
const btnRandom = document.getElementById("btn-random");
const btnNext = document.getElementById("btn-next");
const btnReshuffle = document.getElementById("btn-reshuffle");
const btnClearHistory = document.getElementById("btn-clear-history");
const toggleSmartShuffle = document.getElementById("toggle-smart-shuffle");
const toggleHideWatched = document.getElementById("toggle-hide-watched");
const subtitleEl = document.getElementById("subtitle");
const searchInput = document.getElementById("search-input");
const channelFiltersEl = document.getElementById("channel-filters");
const tagFiltersEl = document.getElementById("tag-filters");
const dynamicStatusEl = document.getElementById("dynamic-status");

const DYNAMIC_CACHE_KEY = "video-lounge-dynamic-cache";
const WATCH_HISTORY_KEY = "video-lounge-watch-history";
const PREFERENCES_KEY = "video-lounge-preferences";
const SHORT_MAX_SECONDS = window.SHORT_MAX_DURATION_SECONDS || 60;
const MAX_WATCH_HISTORY = 250;
const RECENT_HISTORY_WINDOW = 25;
const STOP_WORDS = new Set([
  "about", "after", "and", "are", "for", "from", "has", "have", "how", "into",
  "its", "just", "more", "most", "not", "our", "out", "that", "the", "their",
  "this", "was", "what", "when", "with", "you", "your",
]);

let videos = [];
let staticVideos = [];
let shuffled = [];
let currentIndex = 0;
const activeTags = new Set();
let searchDebounceTimer = null;
let selectedChannel = "all";
let smartShuffleEnabled = true;
let hideWatched = false;
let watchedIdSet = new Set();
let playbackPaused = false;
let savedFocusKey = "";

function shuffle(list) {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function loadPreferences() {
  try {
    const prefs = JSON.parse(localStorage.getItem(PREFERENCES_KEY) || "{}");
    smartShuffleEnabled = prefs.smartShuffleEnabled !== false;
    hideWatched = Boolean(prefs.hideWatched);
  } catch (error) {
    smartShuffleEnabled = true;
    hideWatched = false;
  }

  toggleSmartShuffle.checked = smartShuffleEnabled;
  toggleHideWatched.checked = hideWatched;
  updateSubtitle();
}

function savePreferences() {
  localStorage.setItem(
    PREFERENCES_KEY,
    JSON.stringify({
      smartShuffleEnabled,
      hideWatched,
    }),
  );
}

function loadWatchHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(WATCH_HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch (error) {
    return [];
  }
}

function refreshWatchedIdSet() {
  watchedIdSet = new Set(loadWatchHistory().map((entry) => entry.id));
}

function saveWatchHistory(history) {
  localStorage.setItem(WATCH_HISTORY_KEY, JSON.stringify(history.slice(-MAX_WATCH_HISTORY)));
  refreshWatchedIdSet();
}

function recordWatch(video) {
  if (!video || !video.id) {
    return;
  }

  const history = loadWatchHistory().filter((entry) => entry.id !== video.id);
  history.push({
    id: video.id,
    watchedAt: Date.now(),
    title: video.title,
    channel: video.channel,
    tags: video.tags,
  });
  saveWatchHistory(history);
}

function clearWatchHistory() {
  localStorage.removeItem(WATCH_HISTORY_KEY);
  refreshWatchedIdSet();
}

function getRecentWatchHistory() {
  return loadWatchHistory()
    .slice(-RECENT_HISTORY_WINDOW)
    .reverse();
}

function titleTokens(title) {
  return (title || "")
    .toLowerCase()
    .replace(/[^\w\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

function computeSimilarityScore(video, recentHistory) {
  let score = 1;

  if (watchedIdSet.has(video.id)) {
    score -= 3;
  }

  recentHistory.forEach((entry, index) => {
    const recencyWeight = 1 / (1 + index * 0.15);

    const entryTags = new Set(Array.isArray(entry.tags) ? entry.tags : []);
    video.tags.forEach((tag) => {
      if (entryTags.has(tag)) {
        score += 3 * recencyWeight;
      }
    });

    if (video.channel === entry.channel) {
      score += 2 * recencyWeight;
    }

    const entryWords = new Set(titleTokens(entry.title));
    titleTokens(video.title).forEach((word) => {
      if (entryWords.has(word)) {
        score += 1 * recencyWeight;
      }
    });
  });

  return score;
}

function filterHiddenWatched(list) {
  if (!hideWatched) {
    return list;
  }

  const visible = list.filter((video) => !watchedIdSet.has(video.id));
  return visible.length ? visible : list;
}

function buildShuffleOrder(list) {
  const candidates = filterHiddenWatched(list);
  const recentHistory = getRecentWatchHistory();

  if (!smartShuffleEnabled || !recentHistory.length) {
    return shuffle(candidates);
  }

  const scored = candidates.map((video) => ({
    video,
    score: computeSimilarityScore(video, recentHistory),
  }));

  scored.sort((left, right) => {
    const leftScore = left.score + Math.random() * 3;
    const rightScore = right.score + Math.random() * 3;
    return rightScore - leftScore;
  });

  return scored.map((entry) => entry.video);
}

function getShuffleModeLabel() {
  if (smartShuffleEnabled && getRecentWatchHistory().length > 0) {
    return "smart shuffle";
  }
  return "random shuffle";
}

function updateSubtitle() {
  if (isTvRemote()) {
    subtitleEl.textContent = "Arrows move, Enter selects, Pause pauses the video";
    return;
  }

  subtitleEl.textContent = smartShuffleEnabled
    ? "Smart picks from your list"
    : "Random picks from your list";
}

function isVideoWatched(videoId) {
  return watchedIdSet.has(videoId);
}

function isShortVideo(entry) {
  if (!entry) {
    return false;
  }

  if (entry.durationSeconds != null && entry.durationSeconds <= SHORT_MAX_SECONDS) {
    return true;
  }

  const title = (entry.title || "").toLowerCase();
  return title.includes("#shorts");
}

function normalizeVideo(entry) {
  if (isShortVideo(entry)) {
    return null;
  }

  return {
    id: entry.id,
    title: entry.title || entry.id,
    channel: entry.channel || "Unknown",
    tags: Array.isArray(entry.tags) ? entry.tags : [],
    durationSeconds: entry.durationSeconds != null ? entry.durationSeconds : null,
  };
}

function showError(message) {
  errorEl.hidden = false;
  errorEl.textContent = message;
}

function isTizenTv() {
  const ua = navigator.userAgent || "";
  return /Tizen|SMART-TV|SamsungBrowser/i.test(ua);
}

function isTvRemote() {
  if (isTizenTv()) {
    return true;
  }
  return (window.location.search || "").indexOf("tv=1") !== -1;
}

function configurePlayerForPlatform() {
  player.tabIndex = -1;

  if (isTvRemote()) {
    document.body.classList.add("tv-remote");
    player.removeAttribute("sandbox");
    player.setAttribute(
      "allow",
      "accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; fullscreen"
    );
    return;
  }

  player.setAttribute(
    "sandbox",
    "allow-scripts allow-same-origin allow-presentation"
  );
}

function embedUrl(videoId) {
  const params = new URLSearchParams({
    autoplay: "1",
    rel: "0",
    modestbranding: "1",
    iv_load_policy: "3",
    playsinline: "1",
    fs: "1",
    enablejsapi: "1",
  });

  if (window.location.origin && window.location.origin !== "null") {
    params.set("origin", window.location.origin);
    params.set("widget_referrer", window.location.origin);
  }

  const host = isTizenTv()
    ? "https://www.youtube.com/embed/"
    : "https://www.youtube-nocookie.com/embed/";
  return `${host}${encodeURIComponent(videoId)}?${params}`;
}

function thumbnailUrl(videoId) {
  return `https://img.youtube.com/vi/${encodeURIComponent(videoId)}/mqdefault.jpg`;
}

function channelHue(channelName) {
  return [...channelName].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 360;
}

function getChannelIconUrl(channelName) {
  if (!window.CHANNEL_ICONS) {
    return null;
  }
  return window.CHANNEL_ICONS[channelName] || null;
}

function createChannelIcon(channelName, { small = false } = {}) {
  const icon = document.createElement("span");
  icon.className = small ? "channel-icon channel-icon-sm" : "channel-icon";
  const iconUrl = getChannelIconUrl(channelName);

  if (iconUrl) {
    const img = document.createElement("img");
    img.src = iconUrl;
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    icon.appendChild(img);
  } else {
    icon.classList.add("channel-icon-fallback");
    icon.style.backgroundColor = `hsl(${channelHue(channelName)}, 45%, 35%)`;
    icon.textContent = channelName
      .split(/\s+/)
      .map((word) => word[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();
  }

  return icon;
}

function getFilteredVideos() {
  const query = searchInput.value.trim().toLowerCase();
  const channel = selectedChannel;

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
  captureFocus();
  channelFiltersEl.innerHTML = "";

  const allButton = document.createElement("button");
  allButton.type = "button";
  allButton.className = "channel-filter-btn";
  allButton.dataset.channel = "all";
  allButton.title = "All channels";
  allButton.setAttribute("aria-pressed", selectedChannel === "all" ? "true" : "false");
  if (selectedChannel === "all") {
    allButton.classList.add("active");
  }

  const allIcon = document.createElement("span");
  allIcon.className = "channel-icon channel-icon-all";
  allIcon.textContent = "All";
  allButton.appendChild(allIcon);
  allButton.addEventListener("click", () => {
    selectedChannel = "all";
    populateChannelFilter();
    onFiltersChanged();
  });
  channelFiltersEl.appendChild(allButton);

  getUniqueChannels().forEach((channel) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "channel-filter-btn";
    button.dataset.channel = channel;
    button.title = channel;
    button.setAttribute("aria-pressed", selectedChannel === channel ? "true" : "false");
    if (selectedChannel === channel) {
      button.classList.add("active");
    }
    button.appendChild(createChannelIcon(channel));
    button.addEventListener("click", () => {
      selectedChannel = channel;
      populateChannelFilter();
      onFiltersChanged();
    });
    channelFiltersEl.appendChild(button);
  });
  restoreFocus();
}

function populateTagFilters() {
  captureFocus();
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
  restoreFocus();
}

function getBrowseVideos() {
  const filtered = getFilteredVideos();
  const filteredIds = new Set(filtered.map((video) => video.id));
  const fromShuffle = shuffled.filter((video) => filteredIds.has(video.id));

  if (fromShuffle.length === filtered.length && fromShuffle.length > 0) {
    return fromShuffle;
  }

  return buildShuffleOrder(filtered);
}

function updateResultsCount(filteredCount) {
  const total = videos.length;
  const channel = selectedChannel;
  const query = searchInput.value.trim();
  const tagCount = activeTags.size;

  if (channel === "all" && !query && tagCount === 0) {
    resultsCountEl.textContent = `${total} videos`;
    return;
  }

  resultsCountEl.textContent = `${filteredCount} of ${total} videos match`;
}

function renderBrowseGrid() {
  captureFocus();
  queueEl.innerHTML = "";
  const filtered = getFilteredVideos();
  const browseVideos = getBrowseVideos();
  const currentId = shuffled[currentIndex] && shuffled[currentIndex].id;

  updateResultsCount(filtered.length);
  emptyStateEl.hidden = browseVideos.length > 0;
  queueEl.hidden = browseVideos.length === 0;

  browseVideos.forEach((video) => {
    const shuffledIndex = shuffled.findIndex((entry) => entry.id === video.id);
    const item = document.createElement("button");
    item.type = "button";
    item.className = "queue-item";
    item.title = video.title;
    item.dataset.videoId = video.id;

    if (video.id === currentId) {
      item.classList.add("active");
    }
    if (isVideoWatched(video.id)) {
      item.classList.add("queue-item-watched");
    }

    const thumbWrap = document.createElement("span");
    thumbWrap.className = "queue-item-thumb-wrap";

    const img = document.createElement("img");
    img.src = thumbnailUrl(video.id);
    img.alt = "";
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      img.remove();
      const fallback = document.createElement("span");
      fallback.className = "queue-item-thumb-fallback";
      fallback.textContent = video.title.slice(0, 1).toUpperCase() || "?";
      thumbWrap.appendChild(fallback);
    });
    thumbWrap.appendChild(img);

    if (isVideoWatched(video.id)) {
      const badge = document.createElement("span");
      badge.className = "queue-item-watched-badge";
      badge.textContent = "Watched";
      thumbWrap.appendChild(badge);
    }

    const title = document.createElement("span");
    title.className = "queue-item-title";
    title.textContent = video.title;

    const channelRow = document.createElement("span");
    channelRow.className = "queue-item-channel";
    channelRow.append(createChannelIcon(video.channel, { small: true }));
    const channelName = document.createElement("span");
    channelName.textContent = video.channel;
    channelRow.appendChild(channelName);

    item.append(thumbWrap, title, channelRow);
    item.addEventListener("click", () => {
      if (shuffledIndex >= 0) {
        playAt(shuffledIndex);
      } else {
        shuffled = buildShuffleOrder(filtered);
        const index = shuffled.findIndex((entry) => entry.id === video.id);
        playAt(index >= 0 ? index : 0);
      }
    });
    queueEl.appendChild(item);
  });
  restoreFocus();
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
  metaEl.innerHTML = "";
  metaEl.append(createChannelIcon(video.channel, { small: true }));
  const metaText = document.createElement("span");
  metaText.textContent = `${video.channel} · ${index + 1} of ${shuffled.length} in ${getShuffleModeLabel()}`;
  metaEl.appendChild(metaText);
  renderCurrentTags(video);
  renderBrowseGrid();
}

function playVideo(video, index, reloadPlayer = true) {
  currentIndex = index;
  if (reloadPlayer) {
    player.src = embedUrl(video.id);
    recordWatch(video);
    setPaused(false);
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

  const recentHistory = getRecentWatchHistory();
  if (!smartShuffleEnabled || !recentHistory.length) {
    playAt(Math.floor(Math.random() * shuffled.length));
    return;
  }

  const weighted = shuffled.map((video, index) => ({
    index,
    weight: Math.max(0.1, computeSimilarityScore(video, recentHistory)),
  }));
  const totalWeight = weighted.reduce((sum, entry) => sum + entry.weight, 0);
  let pick = Math.random() * totalWeight;

  for (const entry of weighted) {
    pick -= entry.weight;
    if (pick <= 0) {
      playAt(entry.index);
      return;
    }
  }

  playAt(weighted[weighted.length - 1].index);
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
    metaEl.innerHTML = "";
    videoTagsEl.innerHTML = "";
    renderBrowseGrid();
    return;
  }

  shuffled = buildShuffleOrder(filtered);
  playRandom();
}

function syncShuffleToFilters() {
  const filtered = getFilteredVideos();
  const currentId = shuffled[currentIndex] && shuffled[currentIndex].id;
  const hasActivePlayer = Boolean(player.getAttribute("src"));

  populateTagFilters();

  if (!filtered.length) {
    shuffled = [];
    currentIndex = 0;
    player.removeAttribute("src");
    titleEl.textContent = "No matches";
    metaEl.innerHTML = "";
    videoTagsEl.innerHTML = "";
    renderBrowseGrid();
    return;
  }

  shuffled = buildShuffleOrder(filtered);
  const preservedIndex = currentId
    ? shuffled.findIndex((video) => video.id === currentId)
    : -1;

  if (preservedIndex >= 0) {
    playVideo(shuffled[preservedIndex], preservedIndex, !hasActivePlayer);
    return;
  }

  playAt(0);
}

function onPlaybackPreferencesChanged() {
  smartShuffleEnabled = toggleSmartShuffle.checked;
  hideWatched = toggleHideWatched.checked;
  savePreferences();
  updateSubtitle();
  syncShuffleToFilters();
}

function onClearWatchHistory() {
  if (!watchedIdSet.size) {
    return;
  }

  if (!window.confirm("Clear your watch history? Smart shuffle will reset until you watch more videos.")) {
    return;
  }

  clearWatchHistory();
  syncShuffleToFilters();
}

function onFiltersChanged() {
  syncShuffleToFilters();
}

function onSearchInput() {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(onFiltersChanged, 200);
}

function loadStaticVideos() {
  if (Array.isArray(window.VIDEO_LIST) && window.VIDEO_LIST.length > 0) {
    return window.VIDEO_LIST;
  }
  throw new Error("No videos found. Check that videos.js defines window.VIDEO_LIST.");
}

function loadDynamicCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(DYNAMIC_CACHE_KEY) || "[]");
    return Array.isArray(cached) ? cached.map(normalizeVideo).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function saveDynamicCache(dynamicVideos) {
  localStorage.setItem(DYNAMIC_CACHE_KEY, JSON.stringify(dynamicVideos));
}

function mergeVideoLists() {
  const merged = new Map();
  Array.prototype.forEach.call(arguments, function (list) {
    (list || []).forEach((entry) => {
      if (!entry || !entry.id) {
        return;
      }
      const normalized = normalizeVideo(entry);
      if (!normalized) {
        return;
      }
      merged.set(entry.id, normalized);
    });
  });
  return Array.from(merged.values());
}

function getBundledDynamicVideos() {
  if (!Array.isArray(window.DYNAMIC_VIDEO_LIST)) {
    return [];
  }
  return window.DYNAMIC_VIDEO_LIST.filter((entry) => entry && entry.id)
    .map(normalizeVideo)
    .filter(Boolean);
}

function setDynamicStatus(message) {
  if (!message) {
    dynamicStatusEl.hidden = true;
    dynamicStatusEl.textContent = "";
    return;
  }
  dynamicStatusEl.hidden = false;
  dynamicStatusEl.textContent = message;
}

function rebuildVideoLibrary() {
  videos = mergeVideoLists(
    staticVideos,
    getBundledDynamicVideos(),
    loadDynamicCache(),
  );
}

function refreshLibraryUi(preservePlayback = true) {
  const currentId = shuffled[currentIndex] && shuffled[currentIndex].id;
  populateChannelFilter();
  populateTagFilters();

  if (!videos.length) {
    throw new Error("No valid video IDs found in the video list.");
  }

  if (!preservePlayback || !currentId) {
    shuffled = buildShuffleOrder(getFilteredVideos());
    playAt(0);
    return;
  }

  syncShuffleToFilters();
}

async function fetchChannelFeed(channel) {
  const endpoint = `/.netlify/functions/youtube-rss?channelId=${encodeURIComponent(channel.channelId)}`;
  const response = await fetch(endpoint);
  if (!response.ok) {
    throw new Error(`Feed request failed (${response.status})`);
  }

  const payload = await response.json();
  if (!Array.isArray(payload.videos)) {
    throw new Error("Feed response did not include videos.");
  }

  return payload.videos
    .map((video) =>
      normalizeVideo({
        id: video.id,
        title: video.title,
        channel: channel.channel,
        tags: channel.tags,
        durationSeconds: video.durationSeconds != null ? video.durationSeconds : null,
      }),
    )
    .filter(Boolean);
}

async function refreshDynamicChannels() {
  const channels = Array.isArray(window.DYNAMIC_CHANNELS) ? window.DYNAMIC_CHANNELS : [];
  if (!channels.length) {
    return 0;
  }

  setDynamicStatus("Checking configured channels for new uploads…");

  const previousCount = videos.length;
  let fetchedVideos = loadDynamicCache();
  let feedSuccesses = 0;
  let feedFailures = 0;

  for (const channel of channels) {
    try {
      const latest = await fetchChannelFeed(channel);
      fetchedVideos = mergeVideoLists(fetchedVideos, latest);
      feedSuccesses += 1;
    } catch (error) {
      feedFailures += 1;
      console.warn(`Could not refresh ${channel.channel}:`, error);
    }
  }

  saveDynamicCache(fetchedVideos);
  rebuildVideoLibrary();

  const added = videos.length - previousCount;
  if (added > 0) {
    setDynamicStatus(`Added ${added} new video${added === 1 ? "" : "s"} from auto-updating channels.`);
  } else if (feedSuccesses === 0 && feedFailures > 0) {
    setDynamicStatus("Auto-update needs Netlify hosting. Using bundled Sportsnet videos for now.");
  } else {
    setDynamicStatus("Channel feeds checked. No new uploads since your last visit.");
  }

  refreshLibraryUi(true);
  return added;
}

function focusKey(element) {
  if (!element || element === document.body || element === document.documentElement) {
    return "";
  }
  if (element.id) {
    return "id:" + element.id;
  }
  if (element.dataset && element.dataset.videoId) {
    return "video:" + element.dataset.videoId;
  }
  if (element.dataset && element.dataset.channel) {
    return "channel:" + element.dataset.channel;
  }
  if (element.dataset && element.dataset.tag) {
    return "tag:" + element.dataset.tag;
  }
  return "";
}

function captureFocus() {
  const key = focusKey(document.activeElement);
  if (key) {
    savedFocusKey = key;
  }
}

function findFocusTarget(key) {
  if (!key) {
    return null;
  }
  if (key.indexOf("id:") === 0) {
    return document.getElementById(key.slice(3));
  }
  if (key.indexOf("video:") === 0) {
    const videoId = key.slice(6);
    const buttons = queueEl.querySelectorAll("button");
    for (let index = 0; index < buttons.length; index += 1) {
      if (buttons[index].dataset.videoId === videoId) {
        return buttons[index];
      }
    }
    return null;
  }
  if (key.indexOf("channel:") === 0) {
    const channel = key.slice(8);
    const buttons = channelFiltersEl.querySelectorAll("button");
    for (let index = 0; index < buttons.length; index += 1) {
      if (buttons[index].dataset.channel === channel) {
        return buttons[index];
      }
    }
    return null;
  }
  if (key.indexOf("tag:") === 0) {
    const tag = key.slice(4);
    const buttons = tagFiltersEl.querySelectorAll("button");
    for (let index = 0; index < buttons.length; index += 1) {
      if (buttons[index].dataset.tag === tag) {
        return buttons[index];
      }
    }
  }
  return null;
}

function restoreFocus() {
  const target = findFocusTarget(savedFocusKey);
  if (target) {
    target.focus();
  }
}

function focusableElements() {
  return Array.prototype.filter.call(
    document.querySelectorAll("button, input, a[href]"),
    (element) => {
      if (element.disabled || element.hidden) {
        return false;
      }
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    },
  );
}

function centerOf(element) {
  const rect = element.getBoundingClientRect();
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
  };
}

function moveTvFocus(direction) {
  const items = focusableElements();
  const current = document.activeElement;
  const currentInList = items.indexOf(current) !== -1;

  if (!currentInList) {
    focusTvStart();
    return;
  }

  const origin = centerOf(current);
  let best = null;
  let bestScore = Infinity;

  items.forEach((element) => {
    if (element === current) {
      return;
    }

    const point = centerOf(element);
    const dx = point.x - origin.x;
    const dy = point.y - origin.y;

    if (direction === "left" && dx >= -8) {
      return;
    }
    if (direction === "right" && dx <= 8) {
      return;
    }
    if (direction === "up" && dy >= -8) {
      return;
    }
    if (direction === "down" && dy <= 8) {
      return;
    }

    const primary = direction === "left" || direction === "right" ? Math.abs(dx) : Math.abs(dy);
    const secondary = direction === "left" || direction === "right" ? Math.abs(dy) : Math.abs(dx);
    const score = primary + secondary * 3;
    if (score < bestScore) {
      bestScore = score;
      best = element;
    }
  });

  if (!best) {
    return;
  }

  best.focus();
  if (best.scrollIntoView) {
    best.scrollIntoView({ block: "nearest", inline: "nearest" });
  }
}

function focusTvStart() {
  if (!isTvRemote() || !btnPause) {
    return;
  }
  btnPause.focus();
}

function sendPlayerCommand(funcName) {
  if (!player.contentWindow) {
    return;
  }
  player.contentWindow.postMessage(JSON.stringify({
    event: "command",
    func: funcName,
    args: "",
  }), "*");
}

function setPaused(paused) {
  playbackPaused = paused;
  if (btnPause) {
    btnPause.textContent = paused ? "Play" : "Pause";
  }
}

function togglePlayback() {
  sendPlayerCommand(playbackPaused ? "playVideo" : "pauseVideo");
  setPaused(!playbackPaused);
}

function tvDirection(event) {
  const key = event.key || "";
  const code = event.keyCode || event.which;
  if (key === "ArrowLeft" || code === 37) {
    return "left";
  }
  if (key === "ArrowUp" || code === 38) {
    return "up";
  }
  if (key === "ArrowRight" || code === 39) {
    return "right";
  }
  if (key === "ArrowDown" || code === 40) {
    return "down";
  }
  return "";
}

function onTvKeyDown(event) {
  if (!isTvRemote()) {
    return;
  }

  const code = event.keyCode || event.which;
  if (code === 179 || code === 10252) {
    event.preventDefault();
    togglePlayback();
    return;
  }
  if (code === 415) {
    event.preventDefault();
    sendPlayerCommand("playVideo");
    setPaused(false);
    return;
  }
  if (code === 19) {
    event.preventDefault();
    sendPlayerCommand("pauseVideo");
    setPaused(true);
    return;
  }

  const direction = tvDirection(event);
  if (!direction) {
    return;
  }

  const active = document.activeElement;
  const typing = active && (active.tagName === "INPUT" || active.tagName === "TEXTAREA");
  if (typing && (direction === "left" || direction === "right")) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  moveTvFocus(direction);
}

function onPlayerFrameLoad() {
  if (!isTvRemote()) {
    return;
  }

  window.setTimeout(() => {
    if (document.activeElement === player || document.activeElement === document.body) {
      restoreFocus();
    }
    if (document.activeElement === player || document.activeElement === document.body) {
      focusTvStart();
    }
  }, 50);
}

function registerTvMediaKeys() {
  if (!window.tizen || !window.tizen.tvinputdevice || !window.tizen.tvinputdevice.registerKey) {
    return;
  }

  ["MediaPlay", "MediaPause", "MediaPlayPause", "MediaStop"].forEach((name) => {
    try {
      window.tizen.tvinputdevice.registerKey(name);
    } catch (error) {
      // The TV may already own this key.
    }
  });
}

async function init() {
  try {
    configurePlayerForPlatform();
    loadPreferences();
    refreshWatchedIdSet();

    staticVideos = loadStaticVideos()
      .filter((entry) => entry && entry.id)
      .map(normalizeVideo)
      .filter(Boolean);
    rebuildVideoLibrary();

    if (!videos.length) {
      throw new Error("No valid video IDs found in the video list.");
    }

    populateChannelFilter();
    populateTagFilters();
    shuffled = buildShuffleOrder(videos);
    playAt(0);

    await refreshDynamicChannels();
    focusTvStart();
  } catch (error) {
    titleEl.textContent = "Could not load videos";
    metaEl.innerHTML = "";
    showError(error.message);
  }
}

btnRandom.addEventListener("click", playRandom);
btnNext.addEventListener("click", playNext);
btnPause.addEventListener("click", togglePlayback);
btnReshuffle.addEventListener("click", reshuffleFiltered);
toggleSmartShuffle.addEventListener("change", onPlaybackPreferencesChanged);
toggleHideWatched.addEventListener("change", onPlaybackPreferencesChanged);
btnClearHistory.addEventListener("click", onClearWatchHistory);
searchInput.addEventListener("input", onSearchInput);
document.addEventListener("keydown", onTvKeyDown, true);
player.addEventListener("load", onPlayerFrameLoad);
registerTvMediaKeys();

init();
