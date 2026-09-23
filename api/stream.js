import { clamp, PLAYBACK_PROVIDERS, resolvePlayback } from './_lib.js';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  const bitrate = clamp(req.query.br, 24, 999, 320);

  if (!PLAYBACK_PROVIDERS.includes(source) || !id) {
    return res.status(400).json({ error: 'Invalid source or track ID' });
  }

  try {
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
