import { searchQijieya, qijieyaUrl } from '../server/qijieya.js';

export default async function handler(req, res) {
  const result = await searchQijieya('Blinding Lights', 3);
  const started = performance.now();
  let audioOk = false;
  try {
    const audio = await fetch(qijieyaUrl('url', '1406633327', { br: 320 }), {
      headers: { Range: 'bytes=0-1023' }, signal: AbortSignal.timeout(10000)
    });
    audioOk = audio.status === 206 && (await audio.arrayBuffer()).byteLength === 1024;
  } catch { /* Measure unavailable audio as a failure. */ }
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ region: process.env.VERCEL_REGION, elapsedMs: result.elapsedMs, ok: result.ok,
    audioMs: Math.round(performance.now() - started), audioOk });
}
