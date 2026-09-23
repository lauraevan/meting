# Meting Demo Player

A desktop-first demo client for the standalone Meting music API work, designed to run on Vercel.

## Architecture

The demo deliberately separates catalog presentation from playback resolution:

- **Deezer** provides the canonical search metadata used by the UI: track title, artist, album, duration, explicit flag, ranking, and temporary fallback artwork.
- **Meting providers** supply the default artwork through their native cover IDs, so artwork stays tied to the matched music source for now.
- **Meting providers** provide playback matching, artwork, and lyrics. The current provider pool is NetEase, Tencent, KuGou, and Kuwo.
- Search requests run Deezer and playback providers concurrently, then match provider tracks against the Deezer result set.
- Playback URLs are resolved by a short-lived Vercel function and returned with an HTTP redirect. Full audio is not proxied through Vercel.

## Local Vercel Development

```bash
npm install
npm run demo
```

This runs the site through `vercel dev`, including the same `/api/*` functions used in deployment.

## API Routes

- `GET /api/health`
- `GET /api/search?q=...&limit=12`
- `GET /api/search?q=...&source=netease`
- `GET /api/stream?source=netease&id=...&br=320`
- `GET /api/artwork?source=netease&id=...&size=1000`
- `GET /api/lyrics?source=netease&id=...`

## Deployment

Import `lauraevan/meting` into Vercel and deploy the `demo-player` branch for the current preview.

The desktop player lives at the repository root (`index.html`, `app.js`, and `styles.css`), while the `api/` directory is deployed as Vercel Functions.
