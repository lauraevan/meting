export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30');
  return res.status(200).json({ ok: true, name: 'Synth', version: '1.0.0' });
}
