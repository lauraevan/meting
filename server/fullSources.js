// Full-length catalogs with documented playback endpoints. Deezer is never an audio source.
export const FULL_SOURCES = process.env.JAMENDO_CLIENT_ID ? ['jamendo'] : [];

// A fresh serverless instance may need several seconds to open its first TLS connection.
const timeout = (ms = 7000) => AbortSignal.timeout(ms);
const result = (provider, started, ok, tracks = []) => ({
  provider, ok, elapsedMs: Math.round(performance.now() - started), tracks
});

const asTrack = (source, id, name, artist, album, duration) => ({
  id: `${source}:${id}`, name, artist: [artist], album: album || '',
  duration: Number(duration || 0), source, metadataSource: source,
  sources: { [source]: { id: String(id), url_id: String(id), pic_id: String(id), lyric_id: String(id), match: 1 } }
});

const jamendoUrl = (params = {}) => {
  const url = new URL('https://api.jamendo.com/v3.0/tracks/');
  url.searchParams.set('client_id', process.env.JAMENDO_CLIENT_ID);
  url.searchParams.set('format', 'json');
  url.searchParams.set('audioformat', 'mp32');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, String(value));
  return url;
};

const json = async url => {
  const response = await fetch(url, { signal: timeout(), headers: { Accept: 'application/json' } });
  if (!response.ok) throw new Error(`Catalog returned ${response.status}`);
  return response.json();
};

export const searchFullSource = async (source, query, limit) => {
  const started = performance.now();
  try {
    if (source === 'jamendo' && process.env.JAMENDO_CLIENT_ID) {
      const payload = await json(jamendoUrl({ search: query, limit }));
      if (payload.headers?.status !== 'success' || !Array.isArray(payload.results)) throw new Error('Invalid Jamendo response');
      return result(source, started, true, payload.results
        .filter(track => track?.id && track.audio)
        .map(track => asTrack(source, track.id, track.name, track.artist_name || 'Unknown artist', track.album_name, track.duration)));
    }
  } catch {
    return result(source, started, false);
  }
  return result(source, started, false);
};

const validId = id => /^\d{1,20}$/.test(id);

export const resolveFullSource = async (source, id, kind) => {
  if (!FULL_SOURCES.includes(source) || !validId(id)) throw new Error('Invalid track ID');
  const payload = await json(jamendoUrl({ id }));
  const track = payload.results?.[0];
  const url = kind === 'stream' ? track?.audio : track?.image;
  if (!url) throw new Error('Track unavailable');
  return { url };
};
