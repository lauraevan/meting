const BASE = 'https://api.qijieya.cn/meting/';

export const qijieyaUrl = (type, id, extras = {}) => {
  const url = new URL(BASE);
  url.searchParams.set('server', 'netease');
  url.searchParams.set('type', type);
  url.searchParams.set('id', id);
  for (const [key, value] of Object.entries(extras)) url.searchParams.set(key, String(value));
  return url;
};

export const validQijieyaId = id => /^\d{1,24}$/.test(id);

const idFrom = (value, type) => {
  try {
    const url = new URL(value);
    if (url.origin !== 'https://api.qijieya.cn' || !url.pathname.startsWith('/meting/')) return '';
    if (url.searchParams.get('type') !== type) return '';
    const id = url.searchParams.get('id') || '';
    return validQijieyaId(id) ? id : '';
  } catch { return ''; }
};

export const normalizeQijieyaTrack = item => {
  const id = idFrom(item?.url, 'url');
  if (!id || !item?.name) return null;
  return {
    id, pic_id: idFrom(item.pic, 'pic'),
    name: String(item.name), artist: [String(item.artist || 'Unknown artist')],
    album: '', duration: 0
  };
};

export async function searchQijieya(query, limit, page = 1) {
  const started = performance.now();
  const provider = 'qijieya';
  try {
    const response = await fetch(qijieyaUrl('search', query, { limit, page }), {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(11000)
    });
    if (!response.ok) throw new Error(`Search returned ${response.status}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error('Unexpected search response');
    const tracks = data.map(normalizeQijieyaTrack).filter(Boolean);
    return { provider, ok: tracks.length > 0, elapsedMs: Math.round(performance.now() - started), tracks };
  } catch {
    return { provider, ok: false, elapsedMs: Math.round(performance.now() - started), tracks: [] };
  }
}

export async function lyricsQijieya(id) {
  const response = await fetch(qijieyaUrl('lrc', id), { signal: AbortSignal.timeout(7000) });
  if (!response.ok) throw new Error('Lyrics unavailable');
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return {
      lyric: parsed.lyric || parsed.lrc || '', tlyric: parsed.tlyric || ''
    };
  } catch { /* This API can return plain LRC text. */ }
  return { lyric: text, tlyric: '' };
}
