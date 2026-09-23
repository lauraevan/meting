import { getLyrics, PLAYBACK_PROVIDERS } from './_lib.js';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');

  if (!PLAYBACK_PROVIDERS.includes(source) || !id) {
    return res.status(400).json({ error: 'Invalid source or lyric ID' });
  }

  try {
    const lyrics = await getLyrics(source, id);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(lyrics);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Lyrics unavailable' });
  }
}
