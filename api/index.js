import { normalizeQijieyaTrack, qijieyaUrl, searchQijieya, validQijieyaId } from '../server/qijieya.js';
import stream from './stream.js';
import artwork from './artwork.js';
import lyrics from './lyrics.js';

const publicTrack = track => ({
  name: track.name,
  artist: track.artist.join(', '),
  url: `/api/stream?id=${encodeURIComponent(track.id)}`,
  pic: track.pic_id ? `/api/artwork?id=${encodeURIComponent(track.pic_id)}` : '',
  lrc: `/api/lyrics?id=${encodeURIComponent(track.id)}`
});

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method && req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });
  const query = req.query || Object.fromEntries(new URL(req.url, 'http://localhost').searchParams);
  const type = String(query.type || 'search');
  const id = String(query.id || '').trim();
  if (query.server && query.server !== 'netease') return res.status(400).json({ error: 'Unsupported server' });
  if (!id) return res.status(400).json({ error: 'Missing id' });
  req.query = query;
  if (type === 'url') return stream(req, res);
  if (type === 'pic') return artwork(req, res);
  if (type === 'lrc' || type === 'lyric') return lyrics(req, res);
  if (!['search', 'song', 'playlist', 'name', 'artist'].includes(type))
    return res.status(400).json({ error: 'Unsupported type' });
  if (type !== 'search' && !validQijieyaId(id)) return res.status(400).json({ error: 'Invalid id' });
  try {
    if (type === 'search') {
      const limit = Math.min(30, Math.max(1, parseInt(query.limit, 10) || 12));
      const result = await searchQijieya(id.slice(0, 120), limit);
      if (!result.ok) throw new Error('Search unavailable');
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      return res.status(200).json(result.tracks.map(publicTrack));
    }
    const upstream = await fetch(qijieyaUrl(type, id), { signal: AbortSignal.timeout(11000) });
    if (!upstream.ok) throw new Error('Catalog unavailable');
    if (type === 'name' || type === 'artist') {
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(200).send(await upstream.text());
    }
    const data = await upstream.json();
    if (!Array.isArray(data)) throw new Error('Catalog unavailable');
    res.setHeader('Cache-Control', 'public, s-maxage=60');
    return res.status(200).json(data.map(normalizeQijieyaTrack).filter(Boolean).map(publicTrack));
  } catch {
    return res.status(503).json({ error: 'Catalog temporarily unavailable' });
  }
}
