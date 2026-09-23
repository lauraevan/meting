/**
 * Vercel Serverless Function: exposes the Meting API over HTTP
 *
 * GET /api?server=netease&type=search&id=keyword
 *
 * Parameters:
 *   server  Platform: netease / tencent / kugou / baidu / kuwo (default netease)
 *   type    search / song / album / artist / playlist / url / lyric / pic
 *   id      Keyword (search) or resource ID
 *   page    Search page number (default 1)
 *   limit   Search results per page (default 30) / artist item count (default 50)
 *   br      Bitrate in kbps for url (default 320)
 *   size    Image size for pic (default 300)
 *   format  Normalize data; pass 0 / false to disable (enabled by default)
 */

import Meting from '../src/meting.js';

const TYPES = ['search', 'song', 'album', 'artist', 'playlist', 'url', 'lyric', 'pic'];

function toInt(value, fallback) {
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function send(res, status, body, cache = 'no-store') {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', cache);
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.statusCode = 204;
    return res.end();
  }

  const query = new URL(req.url, 'http://localhost').searchParams;
  const server = query.get('server') || 'netease';
  const type = query.get('type') || 'search';
  const id = query.get('id');

  if (!Meting.isSupported(server)) {
    return send(res, 400, { error: `Unsupported server: ${server}`, servers: Meting.getSupportedPlatforms() });
  }
  if (!TYPES.includes(type)) {
    return send(res, 400, { error: `Unsupported type: ${type}`, types: TYPES });
  }
  if (!id) {
    return send(res, 400, { error: 'Missing required parameter: id' });
  }

  const meting = new Meting(server);
  const format = query.get('format');
  meting.format(!(format === '0' || format === 'false'));

  try {
    let result;
    switch (type) {
      case 'search':
        result = await meting.search(id, {
          page: toInt(query.get('page'), 1),
          limit: toInt(query.get('limit'), 30)
        });
        break;
      case 'artist':
        result = await meting.artist(id, toInt(query.get('limit'), 50));
        break;
      case 'url':
        result = await meting.url(id, toInt(query.get('br'), 320));
        break;
      case 'pic':
        result = await meting.pic(id, toInt(query.get('size'), 300));
        break;
      default:
        result = await meting[type](id);
    }

    if (meting.error) {
      return send(res, 502, { error: meting.error, message: meting.status });
    }

    // Playback URLs expire, so never cache them; cache everything else for 10 minutes
    const cache = type === 'url' ? 'no-store' : 's-maxage=600, stale-while-revalidate=3600';
    return send(res, 200, result, cache);
  } catch (err) {
    return send(res, 500, { error: err.name || 'Error', message: err.message });
  }
}
