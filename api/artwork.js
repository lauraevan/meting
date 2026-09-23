import { findAppleArtwork } from '../server/music.js';

export default async function handler(req, res) {
  const title = String(req.query.title || '').trim();
  const artist = String(req.query.artist || '').trim();
  const album = String(req.query.album || '').trim();
  const size = Number(req.query.size || 900);

  if (!title || !artist) {
    return res.status(400).json({ error: 'Missing title or artist' });
  }

  try {
    const artwork = await findAppleArtwork({ title, artist, album, size });
    const upstream = await fetch(artwork.url);

    if (!upstream.ok) {
      throw new Error(`Apple artwork fetch failed with ${upstream.status}`);
    }

    const buffer = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Meting-Artwork-Source', 'apple-music');
    return res.status(200).send(buffer);
  } catch (error) {
    const status = error.code === 'APPLE_TOKEN_MISSING' ? 503 : 404;
    return res.status(status).json({
      error: error.message || 'Artwork unavailable',
      source: 'apple-music'
    });
  }
}
