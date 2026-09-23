import http from 'http';
import { readFile } from 'fs/promises';
import { extname, join, normalize } from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';
import Meting from '../src/meting.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const publicDir = join(__dirname, 'public');

const PORT = Number(process.env.PORT || 4173);
const SEARCH_PROVIDERS = ['netease', 'tencent', 'kugou', 'kuwo'];
const ALL_PROVIDERS = Meting.getSupportedPlatforms();

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon'
};

const json = (res, status, payload) => {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
};

const clamp = (value, min, max, fallback) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
};

const safeParse = (value, fallback = null) => {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
};

const withTimeout = async (promise, ms, fallback) => {
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

const normalizeTrack = (track, provider) => {
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

const searchProvider = async (provider, query, limit) => {
  const started = performance.now();
  const meting = new Meting(provider);
  meting.format(true);

  const raw = await withTimeout(
    meting.search(query, { page: 1, limit }),
    2800,
    null
  );

  if (!raw) {
    return { provider, ok: false, elapsedMs: Math.round(performance.now() - started), tracks: [] };
  }

  const parsed = safeParse(raw, []);
  const sourceTracks = Array.isArray(parsed) ? parsed : [];

  return {
    provider,
    ok: true,
    elapsedMs: Math.round(performance.now() - started),
    tracks: sourceTracks
      .map(track => normalizeTrack(track, provider))
      .filter(track => track && track.id)
  };
};

const dedupeTracks = tracks => {
  const seen = new Set();
  const output = [];

  for (const track of tracks) {
    const artist = track.artist.join(' ').toLowerCase().replace(/\s+/g, ' ').trim();
    const name = track.name.toLowerCase().replace(/\s+/g, ' ').trim();
    const key = `${name}::${artist}`;

    if (seen.has(key)) continue;
    seen.add(key);
    output.push(track);
  }

  return output;
};

const resolveMedia = async (source, id, br = 320) => {
  if (!ALL_PROVIDERS.includes(source)) throw new Error('Unsupported provider');

  const meting = new Meting(source);
  meting.format(true);
  const raw = await meting.url(id, br);
  const parsed = safeParse(raw, {});

  if (!parsed?.url) throw new Error('No playable URL returned by provider');
  return parsed;
};

const proxyRemote = async (res, remoteUrl, requestHeaders = {}) => {
  const upstream = await fetch(remoteUrl, {
    headers: {
      'User-Agent': 'Mozilla/5.0',
      ...requestHeaders
    },
    redirect: 'follow'
  });

  if (!upstream.ok || !upstream.body) {
    throw new Error(`Upstream request failed with ${upstream.status}`);
  }

  const headers = {
    'Content-Type': upstream.headers.get('content-type') || 'application/octet-stream',
    'Cache-Control': 'public, max-age=600'
  };

  for (const name of ['content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
    const value = upstream.headers.get(name);
    if (value) headers[name.split('-').map(part => part[0].toUpperCase() + part.slice(1)).join('-')] = value;
  }

  res.writeHead(upstream.status, headers);
  Readable.fromWeb(upstream.body).pipe(res);
};

const api = async (req, res, url) => {
  if (url.pathname === '/api/health') {
    return json(res, 200, {
      ok: true,
      name: 'Meting Demo API',
      version: '0.1.0',
      providers: SEARCH_PROVIDERS,
      supportedProviders: ALL_PROVIDERS
    });
  }

  if (url.pathname === '/api/search') {
    const query = (url.searchParams.get('q') || '').trim();
    const limit = clamp(url.searchParams.get('limit'), 1, 30, 10);
    const requestedSource = url.searchParams.get('source');

    if (!query) return json(res, 400, { error: 'Missing search query' });

    const providers = requestedSource && SEARCH_PROVIDERS.includes(requestedSource)
      ? [requestedSource]
      : SEARCH_PROVIDERS;

    const started = performance.now();
    const results = await Promise.all(
      providers.map(provider =>
        searchProvider(provider, query, limit).catch(() => ({
          provider,
          ok: false,
          elapsedMs: null,
          tracks: []
        }))
      )
    );

    const merged = dedupeTracks(
      results
        .sort((a, b) => (a.elapsedMs ?? 99999) - (b.elapsedMs ?? 99999))
        .flatMap(result => result.tracks)
    ).slice(0, limit * 2);

    return json(res, 200, {
      query,
      elapsedMs: Math.round(performance.now() - started),
      providers: results.map(({ provider, ok, elapsedMs, tracks }) => ({
        provider,
        ok,
        elapsedMs,
        count: tracks.length
      })),
      tracks: merged
    });
  }

  if (url.pathname === '/api/lyrics') {
    const source = url.searchParams.get('source');
    const id = url.searchParams.get('id');

    if (!source || !id || !ALL_PROVIDERS.includes(source)) {
      return json(res, 400, { error: 'Invalid source or lyric ID' });
    }

    const meting = new Meting(source);
    meting.format(true);
    const raw = await meting.lyric(id);
    return json(res, 200, safeParse(raw, { lyric: '', tlyric: '' }));
  }

  if (url.pathname === '/api/artwork') {
    const source = url.searchParams.get('source');
    const id = url.searchParams.get('id');
    const size = clamp(url.searchParams.get('size'), 64, 1200, 500);

    if (!source || !id || !ALL_PROVIDERS.includes(source)) {
      return json(res, 400, { error: 'Invalid source or artwork ID' });
    }

    const meting = new Meting(source);
    meting.format(true);
    const raw = await meting.pic(id, size);
    const parsed = safeParse(raw, {});

    if (!parsed?.url) return json(res, 404, { error: 'Artwork unavailable' });
    return proxyRemote(res, parsed.url);
  }

  if (url.pathname === '/api/stream') {
    const source = url.searchParams.get('source');
    const id = url.searchParams.get('id');
    const br = clamp(url.searchParams.get('br'), 24, 999, 320);

    if (!source || !id || !ALL_PROVIDERS.includes(source)) {
      return json(res, 400, { error: 'Invalid source or track ID' });
    }

    const media = await resolveMedia(source, id, br);
    const range = req.headers.range;

    return proxyRemote(
      res,
      media.url,
      range ? { Range: range } : {}
    );
  }

  return false;
};

const serveStatic = async (req, res, url) => {
  const pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  const safePath = normalize(pathname).replace(/^(\.\.(\/|\\|$))+/, '');
  const filePath = join(publicDir, safePath);

  if (!filePath.startsWith(publicDir)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  try {
    const content = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': mimeTypes[extname(filePath)] || 'application/octet-stream',
      'Cache-Control': extname(filePath) === '.html' ? 'no-cache' : 'public, max-age=300'
    });
    res.end(content);
  } catch {
    const fallback = await readFile(join(publicDir, 'index.html'));
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(fallback);
  }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

  try {
    if (url.pathname.startsWith('/api/')) {
      const handled = await api(req, res, url);
      if (handled === false) json(res, 404, { error: 'API route not found' });
      return;
    }

    await serveStatic(req, res, url);
  } catch (error) {
    console.error(error);
    if (!res.headersSent) {
      json(res, 500, { error: error.message || 'Internal server error' });
    } else {
      res.end();
    }
  }
});

server.listen(PORT, () => {
  console.log(`Meting demo player: http://localhost:${PORT}`);
});
