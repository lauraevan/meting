import { lyricsQijieya, validQijieyaId } from '../server/qijieya.js';

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!validQijieyaId(id) || req.query.source) return res.status(400).json({ error: 'Invalid lyric ID' });
  try {
    const lyrics = await lyricsQijieya(id);
    res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(lyrics);
  } catch {
    return res.status(502).json({ error: 'Lyrics unavailable' });
  }
}
