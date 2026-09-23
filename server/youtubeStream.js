import youtubeDl from 'youtube-dl-exec';

const cache = new Map();
export const resolveYouTubeAudio = async id => {
  if (!/^[A-Za-z0-9_-]{11}$/.test(id)) throw new Error('Invalid YouTube video ID');
  const cached = cache.get(id);
  if (cached?.expires > Date.now()) return cached.url;

  const url = String(await youtubeDl(`https://www.youtube.com/watch?v=${id}`, {
    getUrl: true, format: 'bestaudio[ext=m4a]/bestaudio',
    noWarnings: true, noPlaylist: true
  }, { timeout: 10000 })).trim().split('\n')[0];
  if (!url.startsWith('https://')) throw new Error('No audio URL returned');
  cache.set(id, { url, expires: Date.now() + 5 * 60 * 1000 });
  if (cache.size > 100) cache.delete(cache.keys().next().value);
  return url;
};
