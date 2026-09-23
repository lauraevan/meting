import {
  PLAYBACK_PROVIDERS,
  clamp,
  mergeDeezerWithSources,
  searchDeezer,
  searchMetingProvider
} from './_lib.js';

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

  const started = performance.now();

  const [deezer, providerResults] = await Promise.all([
    searchDeezer(query, Math.max(limit * 2, 20)).catch(() => ({
      ok: false,
      elapsedMs: null,
      tracks: []
    })),
    Promise.all(
      providers.map(provider =>
        searchMetingProvider(provider, query, Math.max(limit, 12)).catch(() => ({
          provider,
          ok: false,
          elapsedMs: null,
          tracks: []
        }))
      )
    )
  ]);

  const tracks = mergeDeezerWithSources(
    deezer.tracks,
    providerResults,
    limit
  );

  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  return res.status(200).json({
    query,
    elapsedMs: Math.round(performance.now() - started),
    metadata: {
      provider: 'deezer',
      ok: deezer.ok,
      elapsedMs: deezer.elapsedMs
    },
    providers: providerResults.map(({ provider, ok, elapsedMs, tracks }) => ({
      provider,
      ok,
      elapsedMs,
      count: tracks.length
    })),
    tracks
  });
}
