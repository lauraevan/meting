const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const quickSearches = [
  { title: 'The Weeknd', query: 'The Weeknd Blinding Lights', copy: 'Blinding Lights · After Hours' },
  { title: 'Hans Zimmer', query: 'Hans Zimmer Interstellar', copy: 'Interstellar · Dune' },
  { title: 'Kendrick Lamar', query: 'Kendrick Lamar Not Like Us', copy: 'GNX · DAMN.' },
  { title: 'NewJeans', query: 'NewJeans Super Shy', copy: 'Get Up · New Jeans' }
];

const state = {
  query: '',
  tracks: [],
  searchTracks: [],
  recentTracks: [],
  queue: [],
  currentIndex: -1,
  current: null,
  repeat: false,
  shuffle: false,
  playing: false,
  likedTracks: (JSON.parse(localStorage.getItem('synth:liked') || localStorage.getItem('meting:liked') || '[]'))
    .filter(track => /^\d+$/.test(String(track.id)) && !track.source),
  searchRequest: 0,
  playbackRequest: 0
};

let audio = $('#audio');
let standbyAudio = $('#nextAudio');
let previewTimer;
const SEARCH_CACHE_KEY = 'synth:search:v1';
const SEARCH_CACHE_TTL = 15 * 60 * 1000;
const searchCache = (() => {
  try {
    const saved = JSON.parse(localStorage.getItem(SEARCH_CACHE_KEY) || localStorage.getItem('meting:search:v2') || '{}');
    return saved && typeof saved === 'object' ? saved : {};
  } catch { return {}; }
})();
const cachedTracks = query => {
  const entry = searchCache[query.toLowerCase()];
  if (!entry || Date.now() - entry.at > SEARCH_CACHE_TTL || !Array.isArray(entry.tracks)) return null;
  return entry;
};
const rememberTracks = (query, tracks) => {
  searchCache[query.toLowerCase()] = { at: Date.now(), tracks };
  const keys = Object.keys(searchCache).sort((a, b) => searchCache[b].at - searchCache[a].at);
  for (const key of keys.slice(20)) delete searchCache[key];
  try { localStorage.setItem(SEARCH_CACHE_KEY, JSON.stringify(searchCache)); } catch { /* Storage is optional. */ }
};

const togglePlayback = () => {
  if (!state.current) return;
  return state.playing ? audio.pause() : audio.play();
};
const searchForm = $('#searchForm');
const searchInput = $('#searchInput');
const tracksEl = $('#tracks');
const resultMeta = $('#resultMeta');
const resultsTitle = $('#resultsTitle');
const speedText = $('#speedText');
const progress = $('#progress');
const volume = $('#volume');
const queuePopover = $('#queuePopover');
const queueList = $('#queueList');
const resultsSubtitle = $('#resultsSubtitle');

const escapeHtml = value => String(value ?? '')
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')
  .replaceAll('"', '&quot;')
  .replaceAll("'", '&#039;');


const formatTime = value => {
  if (!Number.isFinite(value) || value < 0) return '0:00';
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const toast = message => {
  const el = $('#toast');
  el.textContent = message;
  el.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => el.classList.remove('show'), 2200);
};

const artworkUrl = (track, size = 500) =>
  track.pic_id ? `/api/artwork?id=${encodeURIComponent(track.pic_id)}&size=${size}` : '';
const streamUrl = track => `/api/stream?id=${encodeURIComponent(track.id)}&br=320`;
const lyricsUrl = track => `/api/lyrics?id=${encodeURIComponent(track.id)}`;

// Warm the actual player element. Keeping its src when Play is tapped lets the
// browser reuse its existing connection and buffered media instead of starting
// another stream request. Never replace an active song just to preload one.
const prepareTrack = (track, player = audio) => {
  if (!track || (player === audio && state.current)) return;
  const url = streamUrl(track);
  if (player.getAttribute('src') === url) return;
  player.src = url;
  player.load();
};

const prepareNext = () => {
  if (!state.current || state.shuffle || !state.tracks.length) return;
  const nextIndex = state.currentIndex >= state.tracks.length - 1 ? 0 : state.currentIndex + 1;
  prepareTrack(state.tracks[nextIndex], standbyAudio);
};

const setArtwork = (element, track, size) => {
  if (!element || !track) return;

  const url = artworkUrl(track, size);
  if (!url) { element.style.backgroundImage = ''; element.classList.add('placeholder'); return; }
  if (element.dataset.artworkUrl === url) return;
  element.dataset.artworkUrl = url;
  element.style.backgroundImage = '';
  element.classList.add('placeholder');
  const image = new Image();
  image.onload = () => {
    if (element.dataset.artworkUrl !== url) return;
    element.style.backgroundImage = `url("${url}")`;
    element.classList.remove('placeholder');
  };
  image.onerror = () => { if (element.dataset.artworkUrl === url) element.dataset.artworkUrl = ''; };
  image.src = url;
};


const isLiked = track =>
  Boolean(track && state.likedTracks.some(item => item.id === track.id));

const saveLiked = () => {
  localStorage.setItem('synth:liked', JSON.stringify(state.likedTracks));
};

const renderQueue = () => {
  $('#queueCount').textContent = state.queue.length;
  $('#queueMeta').textContent = state.queue.length
    ? `${state.queue.length} track${state.queue.length === 1 ? '' : 's'}`
    : 'Nothing queued';

  if (!state.queue.length) {
    queueList.innerHTML = '<div class="empty-row">Play something and the upcoming tracks will appear here.</div>';
    return;
  }

  queueList.innerHTML = state.queue.map((track, index) => `
    <button class="queue-entry" data-queue-index="${index}">
      <div class="queue-entry-art placeholder" data-queue-art="${index}"></div>
      <div>
        <strong>${escapeHtml(track.name)}</strong>
        <span>${escapeHtml(track.artist.join(', '))}</span>
      </div>
      <div class="queue-index">${String(index + 1).padStart(2, '0')}</div>
    </button>
  `).join('');

  $$('[data-queue-art]').forEach(el => {
    setArtwork(el, state.queue[Number(el.dataset.queueArt)], 120);
  });

  $$('[data-queue-index]').forEach(button => {
    button.addEventListener('click', () => {
      const track = state.queue[Number(button.dataset.queueIndex)];
      const index = state.tracks.findIndex(item => item.id === track?.id);
      if (index >= 0) playIndex(index);
      queuePopover.classList.remove('show');
      queuePopover.setAttribute('aria-hidden', 'true');
    });
  });
};

const showHome = () => {
  if (state.searchTracks.length) {
    state.tracks = [...state.searchTracks];
    resultsTitle.textContent = `Results for “${state.query}”`;
    resultsSubtitle.textContent = 'Music to play';
    resultMeta.textContent = `${state.tracks.length} tracks`;
    renderTracks();
  }
  $('#content').scrollTo({ top: 0, behavior: 'smooth' });
  $$('.nav-item').forEach(item => item.classList.remove('active'));
  $('[data-home].nav-item')?.classList.add('active');
};

const showLibrary = () => {
  if (!state.likedTracks.length) {
    toast('Your Liked Songs library is empty.');
    return;
  }

  state.searchRequest += 1;
  state.tracks = [...state.likedTracks];
  resultsTitle.textContent = 'Liked Songs';
  resultsSubtitle.textContent = 'Saved on this device';
  resultMeta.textContent = `${state.tracks.length} saved`;
  renderTracks();
  $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const showRecent = () => {
  if (!state.recentTracks.length) return toast('Play a track to start your listening history.');
  state.searchRequest += 1;
  state.tracks = [...state.recentTracks];
  resultsTitle.textContent = 'Recently played';
  resultsSubtitle.textContent = 'This session';
  resultMeta.textContent = `${state.tracks.length} tracks`;
  renderTracks();
  $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

const renderQuickGrid = () => {
  $('#quickGrid').innerHTML = quickSearches.map((item, index) => `
    <button class="quick-card" data-query="${escapeHtml(item.query)}">
      <strong>${escapeHtml(item.title)}</strong>
      <span>${escapeHtml(item.copy)}</span>
      <div class="quick-index">0${index + 1}</div>
    </button>
  `).join('');

  $$('.quick-card').forEach(card => {
    card.addEventListener('click', () => {
      searchInput.value = card.dataset.query;
      search(card.dataset.query);
    });
  });
};

const renderSkeletons = () => {
  tracksEl.innerHTML = Array.from({ length: 7 }, (_, index) => `
    <div class="track-row">
      <div class="track-num">${String(index + 1).padStart(2, '0')}</div>
      <div class="track-art skeleton"></div>
      <div class="track-title">
        <div class="skeleton" style="height:12px;width:${55 + (index % 3) * 10}%;border-radius:5px"></div>
        <div class="skeleton" style="height:8px;width:42%;border-radius:5px;margin-top:7px"></div>
      </div>
      <div class="skeleton" style="height:9px;width:64%;border-radius:5px"></div>
      <div></div>
    </div>
  `).join('');
};

const artworkObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      artworkObserver.unobserve(entry.target);
      const track = state.tracks[Number(entry.target.dataset.index)];
      if (track) setArtwork(entry.target, track, 220);
    }
  }, { rootMargin: '160px' }) : null;
const hydrateArtwork = () => {
  artworkObserver?.disconnect();
  $$('.track-art[data-index]').forEach(el => {
    if (artworkObserver) artworkObserver.observe(el);
    else setArtwork(el, state.tracks[Number(el.dataset.index)], 220);
  });
};
const renderTracks = () => {
  if (!state.tracks.length) {
    tracksEl.innerHTML = '<div class="empty-row">No tracks found. Try another song or artist.</div>';
    return;
  }

  tracksEl.innerHTML = state.tracks.map((track, index) => {
    const active = state.current?.id === track.id ? 'active' : '';
    return `
      <div class="track-row ${active}" data-index="${index}" role="button" tabindex="0" aria-label="Play ${escapeHtml(track.name)} by ${escapeHtml(track.artist.join(', '))}">
        <div class="track-num">${String(index + 1).padStart(2, '0')}</div>
        <div class="track-art placeholder" data-index="${index}"></div>
        <div class="track-title">
          <strong>${escapeHtml(track.name)}</strong>
          <span>${escapeHtml(track.artist.join(', '))}</span>
        </div>
        <div class="track-album">${escapeHtml(track.album || 'Single')}</div>
        <span class="track-action" aria-hidden="true">▶</span>
      </div>
    `;
  }).join('');

  $$('.track-row').forEach(row => {
    row.addEventListener('click', () => playIndex(Number(row.dataset.index)));
    row.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      event.stopPropagation();
      playIndex(Number(row.dataset.index));
    });
  });

  hydrateArtwork();
  prepareTrack(state.tracks[0]);
  if (!state.current) prepareTrack(state.tracks[1], standbyAudio);
};

const prepareHoveredTrack = event => {
  if (state.current) return;
  const row = event.target.closest('.track-row[data-index]');
  if (!row || !tracksEl.contains(row)) return;
  const track = state.tracks[Number(row.dataset.index)];
  clearTimeout(previewTimer);
  previewTimer = setTimeout(() => prepareTrack(track), 100);
};
tracksEl.addEventListener('pointerover', prepareHoveredTrack);
tracksEl.addEventListener('focusin', prepareHoveredTrack);
tracksEl.addEventListener('pointerout', event => {
  if (!event.target.closest('.track-row[data-index]')?.contains(event.relatedTarget)) clearTimeout(previewTimer);
});

const updatePlayerUI = () => {
  const track = state.current;
  $('#queueCount').textContent = state.queue.length;
  $('#playButton').textContent = state.playing ? '❚❚' : '▶';

  if (!track) return;

  $('#miniTitle').textContent = track.name;
  $('#miniArtist').textContent = track.artist.join(', ');
  $('#nowTitle').textContent = track.name;
  $('#nowArtist').textContent = track.artist.join(', ');
  $('#heartButton').classList.toggle('active', isLiked(track));
  $('#heartButton').textContent = isLiked(track) ? '♥' : '♡';

  setArtwork($('#miniArt'), track, 220);
  setArtwork($('#nowArt'), track, 1000);

  renderTracks();
  renderQueue();
};

const loadLyrics = async track => {
  $('#lyricsStatus').textContent = 'Loading';
  $('#lyrics').textContent = 'Fetching lyrics…';

  try {
    const response = await fetch(lyricsUrl(track));
    const data = await response.json();

    const plain = (data.lyric || '')
      .replace(/^\[[^\]]+\]\s*/gm, '')
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 18)
      .join('\n');

    $('#lyrics').textContent = plain || 'Lyrics are unavailable for this track.';
    $('#lyricsStatus').textContent = plain ? 'Synced' : 'Unavailable';
  } catch {
    $('#lyrics').textContent = 'Lyrics are unavailable for this track.';
    $('#lyricsStatus').textContent = 'Unavailable';
  }
};

const startCurrentSource = async (request = state.playbackRequest) => {
  const track = state.current;
  if (!track || request !== state.playbackRequest) return;
  speedText.textContent = 'Loading track…';
  const url = streamUrl(track);
  if (audio.getAttribute('src') !== url) audio.src = url;

  try {
    await audio.play();
    if (request === state.playbackRequest) speedText.textContent = 'Playing';
  } catch {
    if (request === state.playbackRequest) playbackFailed();
  }
};

const playbackFailed = () => {
  state.playing = false;
  speedText.textContent = 'Track unavailable';
  updatePlayerUI();
  toast('This track is unavailable right now.');
};

const playIndex = async index => {
  const track = state.tracks[index];
  if (!track) return;

  clearTimeout(previewTimer);
  if (standbyAudio.getAttribute('src') === streamUrl(track)) {
    audio.pause();
    [audio, standbyAudio] = [standbyAudio, audio];
  }
  state.currentIndex = index;
  state.current = track;
  state.recentTracks = [track, ...state.recentTracks.filter(item => item.id !== track.id)].slice(0, 30);
  state.playbackRequest += 1;

  state.queue = state.tracks.slice(index + 1);
  state.playing = true;
  updatePlayerUI();
  loadLyrics(track);
  await startCurrentSource(state.playbackRequest);
};
const next = () => {
  if (!state.tracks.length) return;
  if (state.shuffle) {
    playIndex(Math.floor(Math.random() * state.tracks.length));
    return;
  }
  const nextIndex = state.currentIndex >= state.tracks.length - 1 ? 0 : state.currentIndex + 1;
  playIndex(nextIndex);
};

const previous = () => {
  const elapsed = audio.currentTime;
  if (elapsed > 4) {
    audio.currentTime = 0;
    return;
  }
  const previousIndex = state.currentIndex <= 0 ? state.tracks.length - 1 : state.currentIndex - 1;
  playIndex(previousIndex);
};

const search = async (query, { scroll = true } = {}) => {
  query = String(query || '').trim();
  if (!query) return;

  state.query = query;
  resultsTitle.textContent = `Results for “${query}”`;
  resultMeta.textContent = '';
  const cached = cachedTracks(query);
  const request = ++state.searchRequest;
  if (cached) {
    state.tracks = [...cached.tracks];
    state.searchTracks = [...state.tracks];
    resultsSubtitle.textContent = 'Music to play';
    resultMeta.textContent = `${state.tracks.length} tracks`;
    speedText.textContent = 'Ready';
    renderTracks();
    if (scroll) $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    if (Date.now() - cached.at < 2 * 60 * 1000) return;
  } else {
    renderSkeletons();
    speedText.textContent = 'Searching…';
  }

  const params = new URLSearchParams({ q: query, limit: '10' });

  const started = performance.now();

  try {
    const response = await fetch(`/api/search?${params}`);
    const data = await response.json();

    if (request !== state.searchRequest) return;
    if (!response.ok) throw new Error(data.error || 'Search failed');

    state.tracks = data.tracks || [];
    state.searchTracks = [...state.tracks];
    if (state.tracks.length) rememberTracks(query, state.tracks);
    resultsSubtitle.textContent = 'Music to play';

    const clientElapsed = Math.round(performance.now() - started);
    speedText.textContent = `${clientElapsed}ms API`;
    resultMeta.textContent = `${state.tracks.length} tracks`;

    renderTracks();
    if (scroll) $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (request !== state.searchRequest) return;
    if (!cached) {
      state.tracks = [];
      tracksEl.innerHTML = '<div class="empty-row">Search is unavailable right now. Try again in a moment.</div>';
      resultMeta.textContent = '';
      speedText.textContent = 'Search failed';
      toast(error.message || 'Search failed');
    }
  }
};

searchForm.addEventListener('submit', event => {
  event.preventDefault();
  search(searchInput.value);
});

$$('[data-focus-search]').forEach(button => {
  button.addEventListener('click', () => {
    searchInput.focus();
    searchInput.select();
  });
});

document.addEventListener('keydown', event => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault();
    searchInput.focus();
    searchInput.select();
  }

  if (event.code === 'Space' && document.activeElement !== searchInput) {
    event.preventDefault();
    if (!state.current) return;
    togglePlayback();
  }
});

$('#playButton').addEventListener('click', () => {
  if (!state.current && state.tracks.length) return playIndex(0);
  if (!state.current) return;
  togglePlayback();
});

$('#nextButton').addEventListener('click', next);
$('#prevButton').addEventListener('click', previous);

$('#repeatButton').addEventListener('click', event => {
  state.repeat = !state.repeat;
  event.currentTarget.classList.toggle('active', state.repeat);
  audio.loop = state.repeat;
  standbyAudio.loop = state.repeat;
});

$('#shuffleButton').addEventListener('click', event => {
  state.shuffle = !state.shuffle;
  event.currentTarget.classList.toggle('active', state.shuffle);
});

$('#heartButton').addEventListener('click', () => {
  const track = state.current;
  if (!track) return;

  const index = state.likedTracks.findIndex(item => item.id === track.id);
  if (index >= 0) {
    state.likedTracks.splice(index, 1);
    toast('Removed from Liked Songs');
  } else {
    state.likedTracks.unshift(JSON.parse(JSON.stringify(track)));
    toast('Added to Liked Songs');
  }

  saveLiked();
  updatePlayerUI();
});

$('#surpriseButton').addEventListener('click', () => {
  const item = quickSearches[Math.floor(Math.random() * quickSearches.length)];
  searchInput.value = item.query;
  search(item.query);
});


$$('[data-home]').forEach(button => {
  button.addEventListener('click', showHome);
});

$$('[data-library]').forEach(button => {
  button.addEventListener('click', showLibrary);
});

$$('[data-recent]').forEach(button => {
  button.addEventListener('click', showRecent);
});

$('#queueButton').addEventListener('click', () => {
  const open = !queuePopover.classList.contains('show');
  queuePopover.classList.toggle('show', open);
  queuePopover.setAttribute('aria-hidden', String(!open));
  if (open) renderQueue();
});

$('#closeQueue').addEventListener('click', () => {
  queuePopover.classList.remove('show');
  queuePopover.setAttribute('aria-hidden', 'true');
});

document.addEventListener('click', event => {
  if (
    queuePopover.classList.contains('show') &&
    !queuePopover.contains(event.target) &&
    !$('#queueButton').contains(event.target)
  ) {
    queuePopover.classList.remove('show');
    queuePopover.setAttribute('aria-hidden', 'true');
  }
});

for (const player of [audio, standbyAudio]) {
  player.addEventListener('playing', () => {
    if (player !== audio) return;
    state.playing = true;
    speedText.textContent = 'Playing';
    updatePlayerUI();
    prepareNext();
  });

  player.addEventListener('pause', () => {
    if (player !== audio) return;
    state.playing = false;
    updatePlayerUI();
  });

  player.addEventListener('error', () => {
    if (player !== audio || !state.current) return;
    playbackFailed();
  });

  player.addEventListener('ended', () => {
    if (player === audio && !state.repeat) next();
  });

  player.addEventListener('timeupdate', () => {
    if (player !== audio) return;
    const duration = audio.duration || 0;
    progress.value = duration ? Math.round((audio.currentTime / duration) * 1000) : 0;
    $('#currentTime').textContent = formatTime(audio.currentTime);
    $('#duration').textContent = formatTime(duration);
  });
}

progress.addEventListener('input', () => {
  if (!audio.duration) return;
  audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
});

volume.addEventListener('input', () => {
  audio.volume = Number(volume.value);
  standbyAudio.volume = Number(volume.value);
});

audio.volume = Number(volume.value);
standbyAudio.volume = audio.volume;

const bootstrap = async () => {
  renderQuickGrid();
  renderQueue();
  search('The Weeknd Blinding Lights', { scroll: false });

  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    $('#apiStatus').textContent = response.ok && data.ok
      ? 'Service online'
      : 'Unavailable';
  } catch {
    $('#apiStatus').textContent = 'Unavailable';
  }

};

bootstrap();
