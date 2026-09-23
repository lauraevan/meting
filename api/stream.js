import { Readable } from 'node:stream';
import { clamp, PLAYBACK_PROVIDERS, resolvePlayback } from '../server/music.js';

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

    if (media.proxy) {
      const headers = {
        ...(media.headers || {}),
        Accept: 'audio/*',
        'User-Agent': media.headers?.['user-agent'] || 'Mozilla/5.0'
      };

      for (const key of ['host', 'content-length', 'connection', 'accept-encoding']) {
        delete headers[key];
        delete headers[key.toUpperCase()];
      }

      if (req.headers.range) headers.Range = req.headers.range;

      const upstream = await fetch(media.url, {
        headers,
        redirect: 'follow'
      });

      if (!upstream.ok && upstream.status !== 206) {
        throw new Error(`Primary stream returned ${upstream.status}`);
      }
      if (!upstream.body) {
        throw new Error('Primary stream returned an empty body');
      }

      for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag', 'last-modified']) {
        const value = upstream.headers.get(header);
        if (value) res.setHeader(header, value);
      }
      if (!upstream.headers.get('content-type')) {
        res.setHeader('Content-Type', 'audio/flac');
      }
      res.status(upstream.status);
      Readable.fromWeb(upstream.body).pipe(res);
      return;
    }

    return res.redirect(307, media.url);
  } catch (error) {
    return res.status(502).json({
      error: error.message || 'Stream unavailable',
      source
    });
  }
}
