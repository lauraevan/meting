import { PLAYBACK_PROVIDERS } from './_lib.js';

export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.status(200).json({
    ok: true,
    name: 'Meting Demo API',
    version: '0.2.0',
    metadata: 'deezer',
    artwork: 'apple-music',
    appleArtworkConfigured: Boolean(process.env.APPLE_MUSIC_DEVELOPER_TOKEN),
    playbackProviders: PLAYBACK_PROVIDERS
  });
}
