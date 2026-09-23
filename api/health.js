import { PLAYBACK_PROVIDERS } from '../server/music.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.status(200).json({
    ok: true,
    name: 'Meting Demo API',
    version: '0.2.1',
    metadata: 'deezer',
    artwork: 'meting',
    playbackProviders: PLAYBACK_PROVIDERS
  });
}
