const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];

const providerMeta = {
  netease: { name: 'NetEase', short: 'NE' },
  tencent: { name: 'Tencent', short: 'QQ' },
  kugou: { name: 'KuGou', short: 'KG' },
  kuwo: { name: 'Kuwo', short: 'KW' }
};

const quickSearches = [
  { title: 'Late Night', query: 'The Weeknd', copy: 'Dark pop, R&B and after-hours energy.' },
  { title: 'Focus', query: 'Hans Zimmer', copy: 'Cinematic instrumentals and deep focus.' },
  { title: 'Rap Now', query: 'Kendrick Lamar', copy: 'Heavy rotation from modern hip-hop.' },
  { title: 'Global', query: 'NewJeans', copy: 'Fast-moving pop across international catalogs.' }
];

const state = {
  query: '',
  tracks: [],
  queue: [],
  currentIndex: -1,
  current: null,
  sourceFilter: 'all',
  repeat: false,
  shuffle: false,
  playing: false,
  latencies: {}
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

const artworkUrl = (track, size = 500) =>
  track?.pic_id ? `/api/artwork?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.pic_id)}&size=${size}` : '';

const streamUrl = track =>
  `/api/stream?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.url_id)}&br=320`;

const renderSources = () => {
  const providers = ['all', ...Object.keys(providerMeta)];
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
  $$('.track-art[data-art]').forEach(el => {
    const url = el.dataset.art;
    const image = new Image();
    image.onload = () => {
      el.style.backgroundImage = `url("${url}")`;
      el.classList.remove('placeholder');
    };
    image.src = url;
  });
};

const renderTracks = () => {
  if (!state.tracks.length) {
    tracksEl.innerHTML = '<div class="empty-row">No matching tracks came back from the active sources.</div>';
    return;
  }

  tracksEl.innerHTML = state.tracks.map((track, index) => {
    const active = state.current?.source === track.source && state.current?.id === track.id ? 'active' : '';
    return `
      <div class="track-row ${active}" data-index="${index}">
        <div class="track-num">${String(index + 1).padStart(2, '0')}</div>
        <div class="track-art placeholder" data-art="${artworkUrl(track, 180)}"></div>
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

  const art = artworkUrl(track, 720);
  for (const el of [$('#miniArt'), $('#nowArt')]) {
    el.style.backgroundImage = art ? `url("${art}")` : '';
  }

  renderTracks();
};

const loadLyrics = async track => {
  $('#lyricsStatus').textContent = 'Loading';
  $('#lyrics').textContent = 'Fetching lyrics…';

  try {
    const response = await fetch(`/api/lyrics?source=${encodeURIComponent(track.source)}&id=${encodeURIComponent(track.lyric_id)}`);
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

const playIndex = async index => {
  const track = state.tracks[index];
  if (!track) return;

  state.currentIndex = index;
  state.current = track;
  state.queue = state.tracks.slice(index + 1);
  state.playing = true;
  updatePlayerUI();
  loadLyrics(track);

  speedText.textContent = 'Resolving stream…';
  audio.src = streamUrl(track);

  try {
    await audio.play();
    speedText.textContent = providerName(track.source);
  } catch (error) {
    state.playing = false;
    updatePlayerUI();
    speedText.textContent = 'Stream failed';
    toast('This source did not return a playable stream. Try another result.');
  }
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

const search = async query => {
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

  try {
    const response = await fetch(`/api/search?${params}`);
    const data = await response.json();

    if (!response.ok) throw new Error(data.error || 'Search failed');

    state.tracks = data.tracks || [];
    for (const provider of data.providers || []) {
      state.latencies[provider.provider] = provider.elapsedMs;
    }

    const clientElapsed = Math.round(performance.now() - started);
    speedText.textContent = `${data.elapsedMs ?? clientElapsed}ms API`;
    resultMeta.textContent = `${state.tracks.length} tracks · ${(data.providers || []).filter(item => item.ok).length} sources`;

    renderSources();
    renderTracks();
    $('#resultsSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (error) {
    state.tracks = [];
    tracksEl.innerHTML = '<div class="empty-row">The demo API could not complete this search.</div>';
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

$('#heartButton').addEventListener('click', event => {
  event.currentTarget.classList.toggle('active');
  event.currentTarget.textContent = event.currentTarget.classList.contains('active') ? '♥' : '♡';
});

$('#surpriseButton').addEventListener('click', () => {
  const item = quickSearches[Math.floor(Math.random() * quickSearches.length)];
  searchInput.value = item.query;
  search(item.query);
});

audio.addEventListener('play', () => {
  state.playing = true;
  updatePlayerUI();
});

audio.addEventListener('pause', () => {
  state.playing = false;
  updatePlayerUI();
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

  try {
    const response = await fetch('/api/health');
    const data = await response.json();
    $('#apiStatus').textContent = data.ok ? `${data.providers.length} live adapters` : 'Unavailable';
  } catch {
    $('#apiStatus').textContent = 'Unavailable';
  }

  search('The Weeknd');
};

bootstrap();
