import { clamp, PLAYBACK_PROVIDERS, resolvePlayback } from '../server/music.js';
import { qijieyaUrl, validQijieyaId } from '../server/qijieya.js';
import { Readable } from 'node:stream';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  const bitrate = clamp(req.query.br, 24, 999, 320);

  if (!(source === 'qijieya' || PLAYBACK_PROVIDERS.includes(source) || (source === 'youtube' && process.env.YOUTUBE_STREAM_ORIGIN)) || !id) {
    return res.status(400).json({ error: 'Invalid source or track ID' });
  }

  try {
    if (source === 'qijieya') {
      if (!validQijieyaId(id)) return res.status(400).json({ error: 'Invalid track ID' });
      const abort = new AbortController();
      res.on('close', () => abort.abort());
      const timer = setTimeout(() => abort.abort(), 18000);
      let upstream;
      try {
        upstream = await fetch(qijieyaUrl('url', id, { br: bitrate }), {
          headers: { ...(req.headers.range ? { Range: req.headers.range } : {}) },
          signal: abort.signal
        });
      } finally { clearTimeout(timer); }
      if (!upstream.ok || !upstream.body || !upstream.headers.get('content-type')?.startsWith('audio/')) {
        upstream.body?.cancel().catch(() => {});
        throw new Error(`Music stream unavailable (${upstream.status})`);
      }
      res.status(upstream.status);
      for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      res.setHeader('Cache-Control', 'private, no-store');
      res.setHeader('X-Meting-Playback-Source', source);
      return Readable.fromWeb(upstream.body).pipe(res);
    }
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
