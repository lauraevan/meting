import { clamp, matchScore, searchDeezer } from '../server/music.js';
import { searchQijieya } from '../server/qijieya.js';

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
      const [music, metadata] = await Promise.all([
        searchQijieya(query, limit),
        searchDeezer(query, Math.max(limit * 2, 20)).catch(() => ({ tracks: [] }))
      ]);
      if (!music.ok) throw new Error('Music search is temporarily unavailable');
      const tracks = music.tracks.map(track => {
        const best = (metadata.tracks || []).map(item => ({ item, score: matchScore(track, item) }))
          .sort((a, b) => b.score - a.score)[0];
        if (!best || best.score < 0.9) return track;
        return { ...track, album: best.item.album, duration: best.item.duration,
          explicit: best.item.explicit };
      });
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
