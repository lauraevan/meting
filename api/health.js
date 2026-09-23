import { PLAYBACK_PROVIDERS } from '../server/music.js';
import { FULL_SOURCES } from '../server/fullSources.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.status(200).json({
    ok: true,
    name: 'Meting API',
    version: '0.3.0',
    metadata: 'deezer',
    artwork: 'provider',
    playbackProviders: ['youtube', ...FULL_SOURCES, ...PLAYBACK_PROVIDERS]
  });
}
