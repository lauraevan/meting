import {
  PLAYBACK_PROVIDERS,
  PRIMARY_PROVIDER,
  clamp,
  mergeDeezerWithSources,
  searchDeezer,
  searchMonochrome,
  searchMetingProvider
} from '../server/music.js';

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

  const providers = requestedSource && PLAYBACK_PROVIDERS.includes(requestedSource)
    ? [requestedSource]
    : PLAYBACK_PROVIDERS;

  const key = `${query.toLowerCase()}|${limit}|${providers.join(',')}`;

  try {
    const result = await getSearch(key, async () => {
      const started = performance.now();

      const [deezer, providerResults] = await Promise.all([
    searchDeezer(query, Math.max(limit * 2, 20)).catch(() => ({
      ok: false,
      elapsedMs: null,
      tracks: []
    })),
    Promise.all(
      providers.map(provider => {
        const run = provider === PRIMARY_PROVIDER
          ? searchMonochrome(query, Math.max(limit * 2, 20), requestedSource ? 4500 : 3200)
          : searchMetingProvider(provider, query, Math.max(limit, 12), requestedSource ? 3500 : 2100);

        return run.catch(() => ({
          provider,
          ok: false,
          elapsedMs: null,
          tracks: []
        }));
      })
    )
      ]);

      const tracks = mergeDeezerWithSources(deezer.tracks, providerResults, limit);
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
