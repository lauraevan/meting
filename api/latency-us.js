import { searchQijieya } from '../server/qijieya.js';

export default async function handler(req, res) {
  const result = await searchQijieya('Blinding Lights', 3);
  res.setHeader('Cache-Control', 'no-store');
  return res.status(200).json({ region: process.env.VERCEL_REGION, elapsedMs: result.elapsedMs, ok: result.ok });
}
