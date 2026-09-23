import { PLAYBACK_PROVIDERS } from '../server/music.js';

let streamHealth = { checkedAt: 0, ok: false };

export default async function handler(req, res) {
  if (process.env.YOUTUBE_STREAM_ORIGIN && Date.now() - streamHealth.checkedAt > 30000) {
    let ok = false;
    try {
      const base = new URL(process.env.YOUTUBE_STREAM_ORIGIN);
      if (base.protocol === 'https:') {
        const upstream = await fetch(new URL('/health', base), { signal: AbortSignal.timeout(1200) });
        ok = upstream.ok && (await upstream.json()).ok === true;
      }
    } catch { /* Fall back to the video player. */ }
    streamHealth = { checkedAt: Date.now(), ok };
  }
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=120');
  res.status(200).json({
    ok: true,
    name: 'Meting API',
    version: '0.3.0',
    metadata: 'deezer',
    artwork: 'provider',
    playbackProviders: ['qijieya', ...PLAYBACK_PROVIDERS, 'youtube'],
    youtubeStreamBackend: streamHealth.ok && Boolean(process.env.YOUTUBE_STREAM_ORIGIN)
  });
}
