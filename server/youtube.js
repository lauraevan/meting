import yts from 'yt-search';

const junk = /\b(cover|reaction|tutorial|karaoke|nightcore|sped up|slowed|remix|mashup|instrumental|live stream|1 hour|10 hours)\b/i;
const validId = id => /^[a-zA-Z0-9_-]{11}$/.test(id);

export const searchYouTube = async (query, limit) => {
  const started = performance.now();
  try {
    let videos;
    if (process.env.YOUTUBE_API_KEY) {
      const url = new URL('https://www.googleapis.com/youtube/v3/search');
      url.search = new URLSearchParams({ part: 'snippet', q: query, type: 'video', videoCategoryId: '10', videoEmbeddable: 'true', maxResults: String(Math.min(25, limit * 2)), key: process.env.YOUTUBE_API_KEY }).toString();
      const response = await fetch(url, { signal: AbortSignal.timeout(4500) });
      if (!response.ok) throw new Error(`YouTube search returned ${response.status}`);
      const data = await response.json();
      videos = (data.items || []).map(item => ({
        videoId: item.id?.videoId, title: item.snippet?.title,
        author: { name: item.snippet?.channelTitle }, duration: { seconds: 0 }
      }));
    } else {
      // Public search needs no credentials. Use a bounded wait so other sources can return.
      const raw = await Promise.race([
        yts(query),
        new Promise((_, reject) => setTimeout(() => reject(new Error('YouTube search timed out')), 5000))
      ]);
      videos = raw.videos || [];
    }

    const normalized = videos
      .filter(video => validId(video.videoId) && video.title && !junk.test(video.title))
      .sort((a, b) => {
        const score = v => (/ - Topic$/i.test(v.author?.name || '') ? 3 : 0)
          + (/VEVO|official/i.test(v.author?.name || '') ? 2 : 0)
          + (/official (audio|video|music video)/i.test(v.title || '') ? 1 : 0);
        return score(b) - score(a);
      })
      .slice(0, limit)
      .map(video => ({
        id: `youtube:${video.videoId}`,
        name: video.title.replace(/&amp;/g, '&').replace(/&quot;/g, '"'),
        artist: [video.author?.name || 'Unknown artist'], album: '',
        duration: Number(video.duration?.seconds || 0), source: 'youtube',
        metadataSource: 'youtube',
        sources: { youtube: { id: video.videoId, url_id: video.videoId, pic_id: video.videoId, lyric_id: video.videoId, match: 1 } }
      }));
    return { provider: 'youtube', ok: true, elapsedMs: Math.round(performance.now() - started), tracks: normalized };
  } catch {
    return { provider: 'youtube', ok: false, elapsedMs: Math.round(performance.now() - started), tracks: [] };
  }
};

export const youtubeArtwork = id => {
  if (!validId(id)) throw new Error('Invalid video ID');
  return { url: `https://i.ytimg.com/vi/${id}/hqdefault.jpg` };
};
