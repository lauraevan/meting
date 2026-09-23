# Meting Demo Player

A desktop-first demo client for the standalone Meting music API work.

## Run

The demo server relies on the built-in Fetch API, so use Node.js 18 or newer.

```bash
npm install
npm run demo
```

Then open:

```
http://localhost:4173
```

## What the demo does

- Searches NetEase, Tencent, KuGou, and Kuwo in parallel.
- Returns normalized search results before resolving streams.
- Lazily proxies artwork only when the UI needs it.
- Resolves and proxies audio only when a track is played.
- Loads lyrics on demand.
- Includes basic queue, previous/next, seek, volume, shuffle, repeat, and keyboard controls.

## Demo API

- `GET /api/health`
- `GET /api/search?q=...&limit=10`
- `GET /api/search?q=...&source=netease`
- `GET /api/stream?source=netease&id=...&br=320`
- `GET /api/artwork?source=netease&id=...&size=500`
- `GET /api/lyrics?source=netease&id=...`

This is an early demo layer. It is intentionally separate from the eventual production API so provider routing, caching, canonical IDs, and observability can evolve independently.
