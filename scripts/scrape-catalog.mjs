import { writeFile, rename } from 'node:fs/promises';
import seeds from '../data/catalog-seeds.json' with { type: 'json' };
import oldCatalog from '../data/catalog.js';
import { searchQijieya } from '../server/qijieya.js';
import { matchScore, searchDeezer } from '../server/music.js';

const tracks = new Map(oldCatalog.tracks.map(track => [track.id, track]));
let successful = 0;

for (const [index, query] of seeds.entries()) {
  const music = await searchQijieya(query, 30);
  if (music.ok) {
    successful += 1;
    const metadata = await searchDeezer(query, 40, 1500).catch(() => ({ tracks: [] }));
    for (const track of music.tracks) {
      const best = (metadata.tracks || [])
        .map(item => ({ item, score: matchScore(track, item) }))
        .sort((a, b) => b.score - a.score)[0];
      const enriched = best?.score >= 0.9
        ? { ...track, album: best.item.album, duration: best.item.duration, explicit: best.item.explicit }
        : track;
      tracks.set(track.id, { ...tracks.get(track.id), ...enriched });
    }
  }
  process.stdout.write(`${index + 1}/${seeds.length} ${query}: ${music.tracks.length} tracks\n`);
  // Keep the owner's service traffic bounded and spread across the run.
  if (index < seeds.length - 1) await new Promise(resolve => setTimeout(resolve, 500));
}

if (successful < 3 || tracks.size < 15) {
  throw new Error('Scrape returned too little data; keeping the previous catalog');
}

const catalog = { updatedAt: new Date().toISOString(), tracks: [...tracks.values()].slice(-5000) };
const target = new URL('../data/catalog.js', import.meta.url);
const temporary = new URL('../data/catalog.tmp.js', import.meta.url);
await writeFile(temporary, `// Synth's indexed metadata from the approved Meting endpoint.\nexport default ${JSON.stringify(catalog)};\n`);
await rename(temporary, target);
process.stdout.write(`Indexed ${catalog.tracks.length} distinct tracks from ${successful}/${seeds.length} searches.\n`);
