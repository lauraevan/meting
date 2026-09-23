import { clamp, PLAYBACK_PROVIDERS, resolvePlayback } from '../server/music.js';
import { FULL_SOURCES, resolveFullSource } from '../server/fullSources.js';
import { resolveYouTubeAudio } from '../server/youtubeStream.js';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  const bitrate = clamp(req.query.br, 24, 999, 320);

  if (!['youtube', ...PLAYBACK_PROVIDERS, ...FULL_SOURCES].includes(source) || !id) {
    return res.status(400).json({ error: 'Invalid source or track ID' });
  }

  try {
    const media = source === 'youtube' ? { url: await resolveYouTubeAudio(id) }
      : FULL_SOURCES.includes(source)
        ? await resolveFullSource(source, id, 'stream') : await resolvePlayback(source, id, bitrate);

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
