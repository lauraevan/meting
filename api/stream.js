import { clamp, PLAYBACK_PROVIDERS, resolvePlayback } from '../server/music.js';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  const bitrate = clamp(req.query.br, 24, 999, 320);

  if (!(PLAYBACK_PROVIDERS.includes(source) || (source === 'youtube' && process.env.YOUTUBE_STREAM_ORIGIN)) || !id) {
    return res.status(400).json({ error: 'Invalid source or track ID' });
  }

  try {
    if (source === 'youtube') {
      if (!/^[A-Za-z0-9_-]{11}$/.test(id)) return res.status(400).json({ error: 'Invalid video ID' });
      const base = new URL(process.env.YOUTUBE_STREAM_ORIGIN);
      if (base.protocol !== 'https:') throw new Error('Stream backend must use HTTPS');
      res.setHeader('Cache-Control', 'private, no-store');
      return res.redirect(307, new URL(`/stream/${id}`, base).href);
    }
    const media = await resolvePlayback(source, id, bitrate);

    res.setHeader('Cache-Control', 'private, no-store');
    res.setHeader('X-Meting-Playback-Source', source);
    return res.redirect(307, media.url);
  } catch (error) {
    return res.status(502).json({
      error: error.message || 'Stream unavailable',
      source
    });
  }
}
