import {
  PLAYBACK_PROVIDERS,
  clamp,
  mergeDeezerWithSources,
  searchDeezer,
  searchMetingProvider
} from '../server/music.js';
import { searchYouTube } from '../server/youtube.js';

// Warm serverless instances can reuse normalized search results and share
// identical concurrent requests. Vercel's CDN handles cross-instance hits.
const cache = new Map();
const MAX_ENTRIES = 100;
const TTL_MS = 5 * 60 * 1000;

const getSearch = (key, run) => {
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  if (cached) cache.delete(key);

  const value = run().then(result => {
    cache.set(key, { value: Promise.resolve(result), expires: Date.now() + TTL_MS });
    return result;
  }).catch(error => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, { value, expires: Date.now() + TTL_MS });
  if (cache.size > MAX_ENTRIES) cache.delete(cache.keys().next().value);
  return value;
};

export default async function handler(req, res) {
  const query = String(req.query.q || '').trim();
  const limit = clamp(req.query.limit, 1, 30, 12);
  const requestedSource = String(req.query.source || '').trim();

  if (!query) {
    return res.status(400).json({ error: 'Missing search query' });
  }

  if (requestedSource && !['youtube', ...PLAYBACK_PROVIDERS].includes(requestedSource)) {
    return res.status(400).json({ error: 'Unknown source' });
  }
  const providers = requestedSource ? [requestedSource] : ['youtube', ...PLAYBACK_PROVIDERS];

  const key = `${query.toLowerCase()}|${limit}|${providers.join(',')}`;

  try {
    const result = await getSearch(key, async () => {
      const started = performance.now();

      const metingProviders = providers.filter(provider => PLAYBACK_PROVIDERS.includes(provider));
      const [deezer, metingResults, youtubeResult] = await Promise.all([
    (!metingProviders.length ? Promise.resolve({ ok: false, elapsedMs: null, tracks: [] }) : searchDeezer(query, Math.max(limit * 2, 20))).catch(() => ({
      ok: false,
      elapsedMs: null,
      tracks: []
    })),
    Promise.all(
      metingProviders.map(provider =>
        searchMetingProvider(provider, query, Math.max(limit, 12), requestedSource ? 3500 : 2100).catch(() => ({
          provider,
          ok: false,
          elapsedMs: null,
          tracks: []
        }))
      )
    ),
    providers.includes('youtube') ? searchYouTube(query, Math.max(limit, 12)) : Promise.resolve(null)
      ]);

      const providerResults = [...(youtubeResult ? [youtubeResult] : []), ...metingResults];
      const metingTracks = mergeDeezerWithSources(deezer.tracks, metingResults, limit);
      // Keep independent recordings distinct; a title match does not prove the same audio.
      const tracks = requestedSource === 'youtube' ? youtubeResult.tracks.slice(0, limit)
        : metingTracks;
      if (!requestedSource) tracks.unshift(...(youtubeResult?.tracks || []).slice(0, Math.ceil(limit / 2)));
      if (!requestedSource) tracks.length = Math.min(tracks.length, limit);
      return {
        query,
        elapsedMs: Math.round(performance.now() - started),
        metadata: { provider: 'deezer', ok: deezer.ok, elapsedMs: deezer.elapsedMs },
        providers: providerResults.map(({ provider, ok, elapsedMs, tracks }) => ({
          provider, ok, elapsedMs, count: tracks.length
        })),
        tracks
      };
    });

    // Do not cache an outage as an empty catalog.
    if (!result.metadata.ok && !result.providers.some(item => item.ok)) cache.delete(key);
    res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
    return res.status(200).json(result);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Search unavailable' });
  }
}
