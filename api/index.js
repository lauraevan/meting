/**
 * Vercel Serverless Function：以 HTTP 接口暴露 Meting API
 *
 * GET /api?server=netease&type=search&id=关键词
 *
 * 参数：
 *   server  平台：netease / tencent / kugou / baidu / kuwo（默认 netease）
 *   type    search / song / album / artist / playlist / url / lyric / pic
 *   id      关键词（search）或资源 ID
 *   page    search 页码（默认 1）
 *   limit   search 每页数量（默认 30）/ artist 数量（默认 50）
 *   br      url 码率 kbps（默认 320）
 *   size    pic 尺寸（默认 300）
 *   format  是否标准化数据，传 0 / false 关闭（默认开启）
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

    // 播放链接具有时效性，不做缓存；其余数据缓存 10 分钟
    const cache = type === 'url' ? 'no-store' : 's-maxage=600, stale-while-revalidate=3600';
    return send(res, 200, result, cache);
  } catch (err) {
    return send(res, 500, { error: err.name || 'Error', message: err.message });
  }
}
