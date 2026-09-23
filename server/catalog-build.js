import { splitArtists } from './qijieya.js';
import { bestMetadataMatch } from './music.js';

export const DAY_MS = 24 * 60 * 60 * 1000;
export const dayNumber = (now = Date.now()) => Math.floor(now / DAY_MS);

const plain = value => String(value || '')
  .toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// The service lists one recording under several song IDs. Bracketed text stays
// in the key so mixes and live versions remain separate entries.
export const trackKey = track =>
  `${plain(track.name)}::${track.artist.map(plain).sort().join('|')}`;

// Older index entries were written before collaborations were split.
export const migrateTrack = (track, day) => ({
  ...track,
  artist: track.artist.length === 1 ? splitArtists(track.artist[0]) : track.artist,
  seen: track.seen ?? day
});

const filled = value => value !== undefined && value !== null && value !== '' && value !== 0;

// A fresh scrape carries no album or duration unless Deezer matched it this
// run. Keep what earlier runs learned instead of blanking it.
export const mergeTrack = (previous, fresh) => {
  if (!previous) return { ...fresh };
  const merged = { ...previous };
  for (const [key, value] of Object.entries(fresh)) {
    if (filled(value) || !filled(previous[key])) merged[key] = value;
  }
  return merged;
};

export const enrichTrack = (track, metadata) => {
  const match = bestMetadataMatch(track, metadata);
  return match
    ? { ...track, album: match.album, duration: match.duration, explicit: match.explicit }
    : track;
};

export const buildCatalog = ({ existing, scraped, day, maxTracks = 10000, maxAgeDays = 60 }) => {
  const byId = new Map(existing.map(track => [track.id, migrateTrack(track, day)]));
  for (const track of scraped) {
    byId.set(track.id, { ...mergeTrack(byId.get(track.id), track), seen: day });
  }

  // Keep the most recently seen ID for each recording; the earliest entry wins
  // a tie so saved IDs stay stable. Copy details the kept entry is missing.
  const byKey = new Map();
  for (const track of byId.values()) {
    const key = trackKey(track);
    const kept = byKey.get(key);
    if (!kept) byKey.set(key, track);
    else if (track.seen > kept.seen) byKey.set(key, { ...mergeTrack(kept, track), id: track.id, seen: track.seen });
    else byKey.set(key, mergeTrack(track, kept));
  }

  return [...byKey.values()]
    .filter(track => track.seen >= day - maxAgeDays)
    .sort((a, b) => b.seen - a.seen)
    .slice(0, maxTracks);
};

// Rank artists by how many indexed songs they appear on.
export const discoverArtists = (tracks, limit = 3000) => {
  const counts = new Map();
  for (const track of tracks) {
    for (const artist of track.artist) {
      if (artist === 'Unknown artist') continue;
      counts.set(artist, (counts.get(artist) || 0) + 1);
    }
  }
  return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([artist]) => artist);
};

// Seeds run every time. The remaining budget goes to discovered artists that
// were never crawled or were crawled longest ago, skipping recent ones.
export const pickQueries = ({ seeds, artists, crawled = {}, day, budget, recrawlDays = 7 }) => {
  const taken = new Set(seeds.map(seed => seed.toLowerCase()));
  const candidates = artists.filter(artist => {
    const key = artist.toLowerCase();
    if (taken.has(key)) return false;
    taken.add(key);
    const last = crawled[key];
    return last === undefined || day - last >= recrawlDays;
  });
  const order = artist => crawled[artist.toLowerCase()] ?? -Infinity;
  const discovered = candidates
    .map((artist, rank) => ({ artist, rank }))
    .sort((a, b) => order(a.artist) - order(b.artist) || a.rank - b.rank)
    .slice(0, Math.max(0, budget - seeds.length))
    .map(item => item.artist);
  return [...seeds, ...discovered];
};

export const pruneCrawled = (crawled, day, maxAgeDays = 180) =>
  Object.fromEntries(Object.entries(crawled).filter(([, last]) => day - last <= maxAgeDays));

// Follow result pages for one query until the service runs out or repeats.
export const scrapeQuery = async (query, { search, metadata, pause, maxPages = 4, pageSize = 30, retryMs = 2000 }) => {
  const seen = new Set();
  const tracks = [];
  let deezer = [];
  for (let page = 1; page <= maxPages; page += 1) {
    let music = await search(query, pageSize, page);
    if (!music.ok && page === 1) {
      await pause(retryMs);
      music = await search(query, pageSize, page);
    }
    if (!music.ok) break;
    if (page === 1) deezer = (await metadata(query).catch(() => ({ tracks: [] }))).tracks || [];
    let added = 0;
    for (const track of music.tracks) {
      if (seen.has(track.id)) continue;
      seen.add(track.id);
      added += 1;
      tracks.push(enrichTrack(track, deezer));
    }
    if (added === 0 || music.tracks.length < pageSize) break;
    await pause();
  }
  return { ok: seen.size > 0, tracks };
};
