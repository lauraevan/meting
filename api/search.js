import { bestMetadataMatch, clamp, searchDeezer } from '../server/music.js';
import { searchQijieya } from '../server/qijieya.js';
import { catalogSearch } from '../server/catalog.js';

const cache = new Map();
const TTL = 15 * 60 * 1000;

export default async function handler(req, res) {
  const query = String(req.query.q || '').trim().slice(0, 120);
  const limit = Math.floor(clamp(req.query.limit, 1, 30, 12));
  if (!query) return res.status(400).json({ error: 'Missing search query' });
  if (req.query.source) return res.status(400).json({ error: 'Source selection is unavailable' });

  const key = `${query.toLowerCase()}|${limit}`;
  let entry = cache.get(key);
  const stale = entry && entry.expires + 30 * 60 * 1000 > Date.now() ? entry : null;
  if (!entry || entry.expires < Date.now()) {
    const value = (async () => {
      const started = performance.now();
      const indexed = catalogSearch(query, limit);
      if (indexed.length >= Math.min(limit, 6)) {
        return { query, elapsedMs: Math.round(performance.now() - started), tracks: indexed };
      }
      const [music, metadata] = await Promise.all([
        searchQijieya(query, limit),
        searchDeezer(query, Math.max(limit * 2, 20), 1100).catch(() => ({ tracks: [] }))
      ]);
      if (!music.ok && !indexed.length) throw new Error('Music search is temporarily unavailable');
      const live = music.tracks.map(track => {
        const match = bestMetadataMatch(track, metadata.tracks);
        if (!match) return track;
        return { ...track, album: match.album, duration: match.duration, explicit: match.explicit };
      });
      const seen = new Set();
      const tracks = [...live, ...indexed].filter(track => {
        if (seen.has(track.id)) return false;
        seen.add(track.id);
        return true;
      }).slice(0, limit);
      return { query, elapsedMs: Math.round(performance.now() - started), tracks };
    })();
    entry = { value, expires: Date.now() + TTL };
    cache.set(key, entry);
    value.catch(() => { if (cache.get(key) === entry) cache.delete(key); });
    if (cache.size > 100) cache.delete(cache.keys().next().value);
  }

  try {
    const result = await entry.value;
    res.setHeader('Cache-Control', 'public, s-maxage=900, stale-while-revalidate=3600');
    return res.status(200).json(result);
  } catch {
    if (stale && stale !== entry) {
      try {
        const result = await stale.value;
        res.setHeader('Cache-Control', 'public, s-maxage=30');
        return res.status(200).json(result);
      } catch { /* The old lookup failed too. */ }
    }
    return res.status(503).json({ error: 'Music search is temporarily unavailable' });
  }
}
