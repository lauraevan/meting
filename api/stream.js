import { Readable } from 'node:stream';
import { qijieyaUrl, validQijieyaId } from '../server/qijieya.js';

// A seek makes a new Range request. Reuse the recently resolved media URL
// instead of asking Meting to resolve the same track on every seek.
const resolved = new Map();
const mediaResponse = response => response.ok && response.body
  && response.headers.get('content-type')?.startsWith('audio/');

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!validQijieyaId(id) || req.query.source) {
    return res.status(400).json({ error: 'Invalid track ID' });
  }
  const br = ['128', '192', '320', '2000'].includes(String(req.query.br)) ? String(req.query.br) : '320';
  const abort = new AbortController();
  res.on('close', () => abort.abort());
  const timer = setTimeout(() => abort.abort(), 18000);
  let upstream;
  const key = `${id}:${br}`;
  const headers = { ...(req.headers.range ? { Range: req.headers.range } : {}) };
  try {
    const cached = resolved.get(key);
    if (cached && cached.expires > Date.now()) {
      try {
        upstream = await fetch(cached.url, { headers, signal: abort.signal });
        if (!mediaResponse(upstream)) {
          await upstream.body?.cancel().catch(() => {});
          upstream = null;
          resolved.delete(key);
        }
      } catch {
        if (abort.signal.aborted) throw new Error('Request cancelled');
        resolved.delete(key);
      }
    }
    if (!upstream) {
      upstream = await fetch(qijieyaUrl('url', id, { br }), { headers, signal: abort.signal });
      if (mediaResponse(upstream) && upstream.url.startsWith('https://')) {
        resolved.set(key, { url: upstream.url, expires: Date.now() + 60_000 });
        if (resolved.size > 200) resolved.delete(resolved.keys().next().value);
      }
    }
  } catch {
    return res.status(502).json({ error: 'Stream unavailable' });
  } finally {
    clearTimeout(timer);
  }

  if (!mediaResponse(upstream)) {
    upstream.body?.cancel().catch(() => {});
    return res.status(502).json({ error: 'Stream unavailable' });
  }
  res.status(upstream.status);
  for (const header of ['content-type', 'content-length', 'content-range', 'accept-ranges']) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }
  res.setHeader('Cache-Control', 'private, no-store');
  const stream = Readable.fromWeb(upstream.body);
  stream.on('error', () => { if (!res.destroyed) res.destroy(); });
  return stream.pipe(res);
}
