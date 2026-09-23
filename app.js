const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const providerMeta = {
  netease: { name: 'NetEase', short: 'NE' },
  tencent: { name: 'Tencent', short: 'QQ' },
  kugou: { name: 'KuGou', short: 'KG' },
  kuwo: { name: 'Kuwo', short: 'KW' },
  deezer: { name: 'Deezer preview', short: 'DZ' }
};

const quickSearches = [
  { title: 'The Weeknd', query: 'The Weeknd', copy: 'After Hours · Starboy' },
  { title: 'Hans Zimmer', query: 'Hans Zimmer', copy: 'Interstellar · Dune' },
  { title: 'Kendrick Lamar', query: 'Kendrick Lamar', copy: 'GNX · DAMN.' },
  { title: 'NewJeans', query: 'NewJeans', copy: 'Get Up · New Jeans' }
];

const state = {
  query: '',
  tracks: [],
  searchTracks: [],
  recentTracks: [],
  queue: [],
  currentIndex: -1,
  current: null,
  sourceFilter: 'all',
  repeat: false,
  shuffle: false,
  playing: false,
  latencies: {},
  failedSources: new Set(),
  likedTracks: JSON.parse(localStorage.getItem('meting:liked') || '[]'),
  searchRequest: 0,
  playbackRequest: 0
};

const audio = $('#audio');
const searchForm = $('#searchForm');
const searchInput = $('#searchInput');
const tracksEl = $('#tracks');
const resultMeta = $('#resultMeta');
const resultsTitle = $('#resultsTitle');
const speedText = $('#speedText');
const sourceList = $('#sourceList');
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

const providerName = source => providerMeta[source]?.name || source || 'Unknown';
const providerShort = source => providerMeta[source]?.short || 'M';

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

const sourceData = (track, source = track?.source) =>
  track?.sources?.[source] || track || {};

const artworkUrl = (track, size = 500, source = track?.source) => {
  const data = sourceData(track, source);
  const id = data.pic_id || data.id || '';
  if (!source || !id) return '';

  const params = new URLSearchParams({
    source,
    id,
    size: String(size)
  });
  return `/api/artwork?${params}`;
};

const orderedSources = track =>
  Object.keys(track?.sources || {})
    .sort((a, b) => (state.latencies[a] ?? 99999) - (state.latencies[b] ?? 99999));

const streamUrl = (track, source = track.source) => {
  if (source === 'deezer') return track.preview;
  const data = sourceData(track, source);
  return `/api/stream?source=${encodeURIComponent(source)}&id=${encodeURIComponent(data.url_id || data.id || '')}&br=320`;
};

const lyricsUrl = track => {
  const data = sourceData(track);
  return `/api/lyrics?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(data.lyric_id || data.id || '')}`;
};

const setArtwork = (element, track, size) => {
  if (!element || !track) return;

  const candidates = [track.source, ...orderedSources(track)]
    .filter((source, index, list) => source && list.indexOf(source) === index)
    .filter(source => sourceData(track, source)?.pic_id);

  const trySource = index => {
    const source = candidates[index];
    if (!source) {
      element.style.backgroundImage = '';
      element.classList.add('placeholder');
      return;
    }

    const url = artworkUrl(track, size, source);
    const image = new Image();

    image.onload = () => {
      element.style.backgroundImage = `url("${url}")`;
      element.classList.remove('placeholder');
    };

    image.onerror = () => trySource(index + 1);
    image.src = url;
  };

  trySource(0);
};


const isLiked = track =>
  Boolean(track && state.likedTracks.some(item => item.id === track.id));

const saveLiked = () => {
  localStorage.setItem('meting:liked', JSON.stringify(state.likedTracks));
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
    resultsSubtitle.textContent = 'From available music sources';
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

const renderSources = () => {
  const providers = ['all', 'netease', 'tencent', 'kugou', 'kuwo'];
  sourceList.innerHTML = providers.map(source => {
    const active = state.sourceFilter === source ? 'active' : '';
    const label = source === 'all' ? 'All sources' : providerMeta[source].name;
    const latency = source === 'all'
      ? ''
      : state.latencies[source] != null
        ? `${state.latencies[source]}ms`
        : '—';

    return `
      <button class="source-row ${active}" data-source="${source}">
        <span class="source-left">
          <span class="source-bullet"></span>
          <span>${escapeHtml(label)}</span>
        </span>
        <span class="source-latency">${latency}</span>
      </button>
    `;
  }).join('');

  $$('.source-row').forEach(button => {
    button.addEventListener('click', () => {
      state.sourceFilter = button.dataset.source;
      renderSources();
      if (state.query) search(state.query);
    });
  });
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
      <div class="skeleton" style="height:22px;width:62px;border-radius:999px"></div>
      <div></div>
    </div>
  `).join('');
};

const hydrateArtwork = () => {
  $$('.track-art[data-index]').forEach(el => {
    const track = state.tracks[Number(el.dataset.index)];
    setArtwork(el, track, 220);
  });
};
const renderTracks = () => {
  if (!state.tracks.length) {
    tracksEl.innerHTML = '<div class="empty-row">No matching tracks came back from the active sources.</div>';
    return;
  }

  tracksEl.innerHTML = state.tracks.map((track, index) => {
    const active = state.current?.id === track.id ? 'active' : '';
    return `
      <div class="track-row ${active}" data-index="${index}">
        <div class="track-num">${String(index + 1).padStart(2, '0')}</div>
        <div class="track-art placeholder" data-index="${index}"></div>
        <div class="track-title">
          <strong>${escapeHtml(track.name)}</strong>
          <span>${escapeHtml(track.artist.join(', '))}</span>
        </div>
        <div class="track-album">${escapeHtml(track.album || 'Single')}</div>
        <div class="provider-chip">${escapeHtml(providerName(track.source))}</div>
        <button class="track-action" data-play="${index}" aria-label="Play">▶</button>
      </div>
    `;
  }).join('');

  $$('.track-row').forEach(row => {
    row.addEventListener('dblclick', () => playIndex(Number(row.dataset.index)));
  });

  $$('[data-play]').forEach(button => {
    button.addEventListener('click', event => {
      event.stopPropagation();
      playIndex(Number(button.dataset.play));
    });
  });

  hydrateArtwork();
};

const updatePlayerUI = () => {
  const track = state.current;
  $('#queueCount').textContent = state.queue.length;
  $('#playButton').textContent = state.playing ? '❚❚' : '▶';

  if (!track) return;

  $('#miniTitle').textContent = track.name;
  $('#miniArtist').textContent = track.artist.join(', ');
  $('#nowTitle').textContent = track.name;
  $('#nowArtist').textContent = track.artist.join(', ');
  $('#nowSource').textContent = providerName(track.source);
  $('#nowSourceIcon').textContent = providerShort(track.source);
  $('#nowQuality').textContent = track.source === 'deezer'
    ? '30-second preview'
    : 'Automatic source selection';
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
  if (!track?.source || request !== state.playbackRequest) return;

  speedText.textContent = `Resolving ${providerName(track.source)}…`;
  audio.src = streamUrl(track);

  try {
    await audio.play();
    if (request === state.playbackRequest) speedText.textContent = providerName(track.source);
  } catch {
    if (request === state.playbackRequest) await tryNextSource(request);
  }
};

const tryNextSource = async (request = state.playbackRequest) => {
  if (request !== state.playbackRequest) return;
  const track = state.current;
  if (!track) return;

  state.failedSources.add(track.source);
  const nextSource = orderedSources(track).find(source => !state.failedSources.has(source));

  if (!nextSource) {
    if (track.preview && !state.failedSources.has('deezer')) {
      track.source = 'deezer';
      toast('Full track unavailable. Playing a 30-second preview.');
    } else {
      state.playing = false;
      speedText.textContent = 'No playable source';
      updatePlayerUI();
      toast('This track is unavailable from the current sources.');
      return;
    }
  } else {
    track.source = nextSource;
  }

  state.playbackRequest += 1;
  updatePlayerUI();
  await startCurrentSource(state.playbackRequest);
};

const playIndex = async index => {
  const track = state.tracks[index];
  if (!track) return;

  state.currentIndex = index;
  state.current = track;
  state.recentTracks = [track, ...state.recentTracks.filter(item => item.id !== track.id)].slice(0, 30);
  state.failedSources = new Set();
  state.playbackRequest += 1;

  const fastest = orderedSources(track)[0];
  if (fastest) track.source = fastest;

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
  if (audio.currentTime > 4) {
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
  renderSkeletons();
  speedText.textContent = 'Searching…';

  const params = new URLSearchParams({ q: query, limit: '10' });
  if (state.sourceFilter !== 'all') params.set('source', state.sourceFilter);

  const started = performance.now();
  const request = ++state.searchRequest;

  try {
    const response = await fetch(`/api/search?${params}`);
    const data = await response.json();

    if (request !== state.searchRequest) return;
    if (!response.ok) throw new Error(data.error || 'Search failed');

    state.tracks = data.tracks || [];
    state.searchTracks = [...state.tracks];
    resultsSubtitle.textContent = 'From available music sources';
    for (const provider of data.providers || []) {
      state.latencies[provider.provider] = provider.elapsedMs;
    }

    const clientElapsed = Math.round(performance.now() - started);
    speedText.textContent = `${clientElapsed}ms API`;
    const sourceCount = (data.providers || []).filter(item => item.ok && item.count > 0).length;
    resultMeta.textContent = `${state.tracks.length} tracks · ${sourceCount} sources`;

    renderSources();
    renderTracks();
    if (scroll) $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    if (request !== state.searchRequest) return;
    state.tracks = [];
    tracksEl.innerHTML = '<div class="empty-row">Search is unavailable right now. Try again in a moment.</div>';
    resultMeta.textContent = '';
    speedText.textContent = 'Search failed';
    toast(error.message || 'Search failed');
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
    state.playing ? audio.pause() : audio.play();
  }
});

$('#playButton').addEventListener('click', () => {
  if (!state.current && state.tracks.length) return playIndex(0);
  if (!state.current) return;
  state.playing ? audio.pause() : audio.play();
});

$('#nextButton').addEventListener('click', next);
$('#prevButton').addEventListener('click', previous);

$('#repeatButton').addEventListener('click', event => {
  state.repeat = !state.repeat;
  event.currentTarget.classList.toggle('active', state.repeat);
  audio.loop = state.repeat;
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

audio.addEventListener('play', () => {
  state.playing = true;
  updatePlayerUI();
});

audio.addEventListener('pause', () => {
  state.playing = false;
  updatePlayerUI();
});

audio.addEventListener('error', () => {
  if (!state.current) return;
  const source = new URL(audio.currentSrc || audio.src, location.href).searchParams.get('source');
  if (!source || source === state.current.source) tryNextSource(state.playbackRequest);
});

audio.addEventListener('ended', () => {
  if (!state.repeat) next();
});

audio.addEventListener('timeupdate', () => {
  const duration = audio.duration || 0;
  progress.value = duration ? Math.round((audio.currentTime / duration) * 1000) : 0;
  $('#currentTime').textContent = formatTime(audio.currentTime);
  $('#duration').textContent = formatTime(duration);
});

progress.addEventListener('input', () => {
  if (!audio.duration) return;
  audio.currentTime = (Number(progress.value) / 1000) * audio.duration;
});

volume.addEventListener('input', () => {
  audio.volume = Number(volume.value);
});

audio.volume = Number(volume.value);

const bootstrap = async () => {
  renderSources();
  renderQuickGrid();
  renderQueue();

  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    $('#apiStatus').textContent = response.ok && data.ok
      ? 'Service online'
      : 'Unavailable';
  } catch {
    $('#apiStatus').textContent = 'Unavailable';
  }

  search('The Weeknd', { scroll: false });
};

bootstrap();
