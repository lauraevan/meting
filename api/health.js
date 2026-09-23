export default function handler(req, res) {
  res.setHeader('Cache-Control', 'public, s-maxage=30');
  return res.status(200).json({ ok: true, name: 'Meting', version: '1.0.0' });
}
