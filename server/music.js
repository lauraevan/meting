import Meting from '../src/meting.js';

export const PLAYBACK_PROVIDERS = ['netease', 'tencent', 'kugou', 'kuwo'];

export const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

export const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

export const withTimeout = async (promise, ms, fallback) => {
  let timer;
  try {
    return await Promise.race([
      promise,
      new Promise(resolve => {
        timer = setTimeout(() => resolve(fallback), ms);
      })
    ]);
  } finally {
    clearTimeout(timer);
  }
};

const normalizeText = value =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\([^)]*\)|\[[^\]]*\]/g, ' ')
    .replace(/feat\.?|ft\.?/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const tokenSet = value => new Set(normalizeText(value).split(' ').filter(Boolean));

const overlap = (a, b) => {
  const left = tokenSet(a);
  const right = tokenSet(b);
  if (!left.size || !right.size) return 0;
  let hits = 0;
  for (const token of left) if (right.has(token)) hits += 1;
  return hits / Math.max(left.size, right.size);
};

export const matchScore = (canonical, candidate) => {
  const title = overlap(canonical.name, candidate.name);
  const artist = overlap(canonical.artist.join(' '), candidate.artist.join(' '));
  const album = canonical.album && candidate.album
    ? overlap(canonical.album, candidate.album)
    : 0.5;

  return (title * 0.62) + (artist * 0.30) + (album * 0.08);
};

export const normalizeMetingTrack = (track, provider) => {
  if (!track || typeof track !== 'object') return null;

  const artists = Array.isArray(track.artist)
    ? track.artist.filter(Boolean)
    : [track.artist].filter(Boolean);

  return {
    id: String(track.id ?? track.url_id ?? ''),
    name: track.name || 'Unknown track',
    artist: artists.length ? artists : ['Unknown artist'],
    album: track.album || '',
    pic_id: String(track.pic_id ?? ''),
    url_id: String(track.url_id ?? track.id ?? ''),
    lyric_id: String(track.lyric_id ?? track.id ?? ''),
    source: track.source || provider
  };
};

export const searchMetingProvider = async (provider, query, limit) => {
  const started = performance.now();
  const meting = new Meting(provider);
  meting.format(true);

  const raw = await withTimeout(
    meting.search(query, { page: 1, limit }),
    2800,
    null
  );

  if (!raw) {
    return {
      provider,
      ok: false,
      elapsedMs: Math.round(performance.now() - started),
      tracks: []
    };
  }

  const parsed = safeParse(raw, []);
  const sourceTracks = Array.isArray(parsed) ? parsed : [];

  return {
    provider,
    ok: true,
    elapsedMs: Math.round(performance.now() - started),
    tracks: sourceTracks
      .map(track => normalizeMetingTrack(track, provider))
      .filter(track => track && track.id)
  };
};

export const searchDeezer = async (query, limit) => {
  const started = performance.now();
  const url = new URL('https://api.deezer.com/search');
  url.searchParams.set('q', query);
  url.searchParams.set('limit', String(limit));

  const response = await withTimeout(
    fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Meting-Demo/0.2'
      }
    }),
    2800,
    null
  );

  if (!response?.ok) {
    return {
      ok: false,
      elapsedMs: Math.round(performance.now() - started),
      tracks: []
    };
  }

  const payload = await response.json();
  const data = Array.isArray(payload?.data) ? payload.data : [];

  return {
    ok: true,
    elapsedMs: Math.round(performance.now() - started),
    tracks: data.map(track => ({
      id: `deezer:${track.id}`,
      deezerId: String(track.id),
      name: track.title || track.title_short || 'Unknown track',
      artist: [track.artist?.name || 'Unknown artist'],
      album: track.album?.title || '',
      duration: Number(track.duration || 0),
      explicit: Boolean(track.explicit_lyrics),
      rank: Number(track.rank || 0),
      metadataSource: 'deezer',
      deezerUrl: track.link || '',
      preview: track.preview || '',
      artwork: track.album?.cover_xl || track.album?.cover_big || track.album?.cover_medium || track.album?.cover || ''
    }))
  };
};

const sourcePayload = track => ({
  id: track.id,
  url_id: track.url_id,
  lyric_id: track.lyric_id,
  pic_id: track.pic_id
});

export const mergeDeezerWithSources = (deezerTracks, providerResults, limit) => {
  const providerOrder = [...providerResults]
    .sort((a, b) => (a.elapsedMs ?? 99999) - (b.elapsedMs ?? 99999))
    .map(result => result.provider);

  const merged = deezerTracks.map(track => {
    const sources = {};

    for (const result of providerResults) {
      let best = null;
      let bestScore = 0;

      for (const candidate of result.tracks) {
        const score = matchScore(track, candidate);
        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }

      if (best && bestScore >= 0.69) {
        sources[result.provider] = {
          ...sourcePayload(best),
          match: Number(bestScore.toFixed(3))
        };
      }
    }

    const source = providerOrder.find(provider => sources[provider]) || null;
    return { ...track, source, sources };
  });

  const playable = merged.filter(track => track.source);

  if (playable.length >= Math.min(limit, 5)) {
    return playable.slice(0, limit);
  }

  const existing = new Set(
    playable.map(track => `${normalizeText(track.name)}::${normalizeText(track.artist.join(' '))}`)
  );

  const fallbacks = providerResults
    .flatMap(result => result.tracks.map(track => ({
      ...track,
      duration: 0,
      explicit: false,
      rank: 0,
      metadataSource: 'provider-fallback',
      artwork: '',
      sources: {
        [track.source]: {
          ...sourcePayload(track),
          match: 1
        }
      }
    })))
    .filter(track => {
      const key = `${normalizeText(track.name)}::${normalizeText(track.artist.join(' '))}`;
      if (existing.has(key)) return false;
      existing.add(key);
      return true;
    });

  return [...playable, ...fallbacks].slice(0, limit);
};

export const resolvePlayback = async (source, id, bitrate = 320) => {
  if (!PLAYBACK_PROVIDERS.includes(source)) {
    throw new Error('Unsupported playback provider');
  }

  const meting = new Meting(source);
  meting.format(true);
  const raw = await meting.url(id, bitrate);
  const parsed = safeParse(raw, {});

  if (!parsed?.url) {
    throw new Error('No playable URL returned by provider');
  }

  return parsed;
};

export const getLyrics = async (source, id) => {
  if (!PLAYBACK_PROVIDERS.includes(source)) {
    throw new Error('Unsupported lyrics provider');
  }

  const meting = new Meting(source);
  meting.format(true);
  const raw = await meting.lyric(id);
  return safeParse(raw, { lyric: '', tlyric: '' });
};

export const resolveArtwork = async (source, id, size = 900) => {
  if (!PLAYBACK_PROVIDERS.includes(source)) {
    throw new Error('Unsupported artwork provider');
  }

  if (!id) {
    throw new Error('Missing artwork ID');
  }

  const meting = new Meting(source);
  meting.format(true);

  const requested = clamp(size, 64, 2000, 900);
  const raw = await meting.pic(id, requested);
  const parsed = safeParse(raw, {});

  if (!parsed?.url) {
    throw new Error('No artwork URL returned by provider');
  }

  return parsed;
};
