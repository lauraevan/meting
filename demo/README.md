# Meting Demo Player

A desktop-first demo client for the standalone Meting music API work, designed to run on Vercel.

## Architecture

The demo deliberately separates catalog presentation from playback resolution:

- **Deezer** provides the canonical search metadata used by the UI: track title, artist, album, duration, explicit flag, ranking, and temporary fallback artwork.
- **Apple Music** is the preferred artwork source. Artwork is looked up server-side from the Apple Music catalog and returned through the Vercel API.
- **Meting providers** provide playback matching and lyrics. The current playback pool is NetEase, Tencent, KuGou, and Kuwo.
- Search requests run Deezer and playback providers concurrently, then match provider tracks against the Deezer result set.
- Playback URLs are resolved by a short-lived Vercel function and returned with an HTTP redirect. Full audio is not proxied through Vercel.

## Vercel Environment Variables

Set these in Vercel Project Settings:

```
APPLE_MUSIC_DEVELOPER_TOKEN=<Apple Music developer token>
APPLE_MUSIC_STOREFRONT=us
```

`APPLE_MUSIC_STOREFRONT` is optional and defaults to `us`.

If the Apple Music token is not configured yet, the demo automatically falls back to Deezer artwork so development can continue.

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
- `GET /api/artwork?title=...&artist=...&album=...&size=1000`
- `GET /api/lyrics?source=netease&id=...`

## Deployment

Import `lauraevan/meting` into Vercel and deploy the `demo-player` branch for the current preview.

The repository includes `vercel.json`, so the root URL routes to the desktop player and the `api/` directory is deployed as Vercel Functions.
