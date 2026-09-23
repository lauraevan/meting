import { PLAYBACK_PROVIDERS, resolveArtwork } from '../server/music.js';
import { FULL_SOURCES, resolveFullSource } from '../server/fullSources.js';

export default async function handler(req, res) {
  const source = String(req.query.source || '');
  const id = String(req.query.id || '');
  const size = Number(req.query.size || 900);

  if (![...PLAYBACK_PROVIDERS, ...FULL_SOURCES].includes(source) || !id) {
    return res.status(400).json({ error: 'Invalid source or artwork ID' });
  }

  try {
    const artwork = FULL_SOURCES.includes(source)
      ? await resolveFullSource(source, id, 'artwork') : await resolveArtwork(source, id, size);
    const upstream = await fetch(artwork.url, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      redirect: 'follow'
    });

    if (!upstream.ok) {
      throw new Error(`Artwork fetch failed with ${upstream.status}`);
    }

    const body = Buffer.from(await upstream.arrayBuffer());
    res.setHeader('Content-Type', upstream.headers.get('content-type') || 'image/jpeg');
    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    res.setHeader('X-Meting-Artwork-Source', source);
    return res.status(200).send(body);
  } catch (error) {
    return res.status(404).json({
      error: error.message || 'Artwork unavailable',
      source
    });
  }
}
