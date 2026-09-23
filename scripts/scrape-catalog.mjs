import { writeFile, rename } from 'node:fs/promises';
import seeds from '../data/catalog-seeds.json' with { type: 'json' };
import oldCatalog from '../data/catalog.js';
import { searchQijieya } from '../server/qijieya.js';
import { matchScore, searchDeezer } from '../server/music.js';

const tracks = new Map(oldCatalog.tracks.map(track => [track.id, track]));
let successful = 0;
const maxPages = 4;
const pageSize = 30;
const pause = () => new Promise(resolve => setTimeout(resolve, 500));

for (const [index, query] of seeds.entries()) {
  let count = 0;
  const seenInQuery = new Set();
  let metadata;
  for (let page = 1; page <= maxPages; page += 1) {
    const music = await searchQijieya(query, pageSize, page);
    if (!music.ok) break;
    if (page === 1) {
      successful += 1;
      metadata = await searchDeezer(query, 40, 1500).catch(() => ({ tracks: [] }));
    }
    let newOnPage = 0;
    for (const track of music.tracks) {
      if (seenInQuery.has(track.id)) continue;
      seenInQuery.add(track.id);
      newOnPage += 1;
      const best = (metadata.tracks || [])
        .map(item => ({ item, score: matchScore(track, item) }))
        .sort((a, b) => b.score - a.score)[0];
      const enriched = best?.score >= 0.9
        ? { ...track, album: best.item.album, duration: best.item.duration, explicit: best.item.explicit }
        : track;
      tracks.set(track.id, { ...tracks.get(track.id), ...enriched });
    }
    count += newOnPage;
    // Stop on the last page or if the service returned the first page again.
    if (newOnPage === 0 || music.tracks.length < pageSize) break;
    await pause();
  }
  process.stdout.write(`${index + 1}/${seeds.length} ${query}: ${count} distinct tracks\n`);
  // Keep the owner's service traffic bounded and spread across the run.
  if (index < seeds.length - 1) await pause();
}

if (successful < 3 || tracks.size < 15) {
  throw new Error('Scrape returned too little data; keeping the previous catalog');
}

const catalog = { updatedAt: new Date().toISOString(), tracks: [...tracks.values()].slice(-10000) };
const target = new URL('../data/catalog.js', import.meta.url);
const temporary = new URL('../data/catalog.tmp.js', import.meta.url);
await writeFile(temporary, `// Synth's indexed metadata from the approved Meting endpoint.\nexport default ${JSON.stringify(catalog)};\n`);
await rename(temporary, target);
process.stdout.write(`Indexed ${catalog.tracks.length} distinct tracks from ${successful}/${seeds.length} searches.\n`);
