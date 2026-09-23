import { getLyrics, PLAYBACK_PROVIDERS } from '../server/music.js';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');

  if (!['youtube', ...PLAYBACK_PROVIDERS].includes(source) || !id) {
    return res.status(400).json({ error: 'Invalid source or lyric ID' });
  }

  try {
    if (source === 'youtube') return res.status(200).json({ lyric: '', tlyric: '' });
    const lyrics = await getLyrics(source, id);
    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return res.status(200).json(lyrics);
  } catch (error) {
    return res.status(502).json({ error: error.message || 'Lyrics unavailable' });
  }
}
