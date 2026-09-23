import { qijieyaUrl, validQijieyaId } from '../server/qijieya.js';

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!validQijieyaId(id) || req.query.source) return res.status(400).json({ error: 'Invalid artwork ID' });
  const cover = Math.min(500, Math.max(100, Number(req.query.size) || 500));
  try {
    const upstream = await fetch(qijieyaUrl('pic', id, { cover }), {
      signal: AbortSignal.timeout(12000)
    });
    if (!upstream.ok || !upstream.headers.get('content-type')?.startsWith('image/'))
      throw new Error('Artwork unavailable');
    res.setHeader('Content-Type', upstream.headers.get('content-type'));
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return res.status(200).send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return res.status(404).json({ error: 'Artwork unavailable' });
  }
}
