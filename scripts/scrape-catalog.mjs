import { readFile, writeFile, rename } from 'node:fs/promises';
import seeds from '../data/catalog-seeds.json' with { type: 'json' };
import oldCatalog from '../data/catalog.js';
import { searchQijieya } from '../server/qijieya.js';
import { searchDeezer } from '../server/music.js';
import {
  buildCatalog, dayNumber, discoverArtists, migrateTrack, pickQueries, pruneCrawled, scrapeQuery
} from '../server/catalog-build.js';

// Keep the owner's service traffic bounded: a fixed number of searches per
// run, each page spaced out, and recently crawled artists skipped.
const budget = Number(process.env.SCRAPE_QUERY_BUDGET) || 60;
const pauseMs = Number(process.env.SCRAPE_PAUSE_MS) || 500;
const pause = (ms = pauseMs) => new Promise(resolve => setTimeout(resolve, ms));

const statePath = new URL('../data/crawl-state.json', import.meta.url);
const state = await readFile(statePath, 'utf8').then(JSON.parse).catch(() => ({ crawled: {} }));
const day = dayNumber();

const queries = pickQueries({
  seeds,
  artists: discoverArtists(oldCatalog.tracks.map(track => migrateTrack(track, day))),
  crawled: state.crawled, day, budget
});

const scraped = [];
let successful = 0;
for (const [index, query] of queries.entries()) {
  const result = await scrapeQuery(query, {
    search: searchQijieya,
    metadata: q => searchDeezer(q, 40, 1500),
    pause
  });
  if (result.ok) {
    successful += 1;
    state.crawled[query.toLowerCase()] = day;
    scraped.push(...result.tracks);
  }
  process.stdout.write(`${index + 1}/${queries.length} ${query}: ${result.tracks.length} tracks\n`);
  if (index < queries.length - 1) await pause();
}

const tracks = buildCatalog({ existing: oldCatalog.tracks, scraped, day });
if (successful < 3 || tracks.length < 15 || tracks.length < oldCatalog.tracks.length * 0.5) {
  throw new Error(`Scrape looks unhealthy (${successful} searches, ${tracks.length} tracks); keeping the previous catalog`);
}

const catalog = { updatedAt: new Date().toISOString(), tracks };
const target = new URL('../data/catalog.js', import.meta.url);
const temporary = new URL('../data/catalog.tmp.js', import.meta.url);
await writeFile(temporary, `// Synth's indexed metadata from the approved Meting endpoint.\nexport default ${JSON.stringify(catalog)};\n`);
await rename(temporary, target);
await writeFile(statePath, `${JSON.stringify({ crawled: pruneCrawled(state.crawled, day) }, null, 2)}\n`);

const enriched = tracks.filter(track => track.album).length;
process.stdout.write(`Indexed ${tracks.length} distinct tracks (${enriched} with album data) from ${successful}/${queries.length} searches.\n`);
