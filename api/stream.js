import { Readable } from 'node:stream';
import { qijieyaUrl, validQijieyaId } from '../server/qijieya.js';

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
  try {
    upstream = await fetch(qijieyaUrl('url', id, { br }), {
      headers: { ...(req.headers.range ? { Range: req.headers.range } : {}) },
      signal: abort.signal
    });
  } catch {
    return res.status(502).json({ error: 'Stream unavailable' });
  } finally {
    clearTimeout(timer);
  }

  if (!upstream.ok || !upstream.body || !upstream.headers.get('content-type')?.startsWith('audio/')) {
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
