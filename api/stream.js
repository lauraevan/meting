import { Readable } from 'stream';
import { clamp, PLAYBACK_PROVIDERS, resolvePlayback } from './_lib.js';

export const config = {
  api: {
    responseLimit: false
  }
};

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  const bitrate = clamp(req.query.br, 24, 999, 320);

  if (!PLAYBACK_PROVIDERS.includes(source) || !id) {
    return res.status(400).json({ error: 'Invalid source or track ID' });
  }

  try {
    const media = await resolvePlayback(source, id, bitrate);
    const headers = { 'User-Agent': 'Mozilla/5.0' };
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(media.url, {
      headers,
      redirect: 'follow'
    });

    if (!upstream.ok || !upstream.body) {
      throw new Error(`Upstream stream failed with ${upstream.status}`);
    }

    for (const name of [
      'content-type',
      'content-length',
      'content-range',
      'accept-ranges',
      'etag',
      'last-modified'
    ]) {
      const value = upstream.headers.get(name);
      if (value) res.setHeader(name, value);
    }

    res.setHeader('Cache-Control', 'private, no-store');
    res.statusCode = upstream.status;
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (error) {
    if (!res.headersSent) {
      return res.status(502).json({ error: error.message || 'Stream unavailable' });
    }
    res.end();
  }
}
