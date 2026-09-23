import test from 'node:test';
import assert from 'node:assert/strict';
import { splitArtists } from '../server/qijieya.js';
import { bestMetadataMatch } from '../server/music.js';
import {
  buildCatalog, discoverArtists, mergeTrack, pickQueries, scrapeQuery, trackKey
} from '../server/catalog-build.js';

const song = (id, name, artist, extra = {}) =>
  ({ id, pic_id: `p${id}`, name, artist, album: '', duration: 0, ...extra });

test('splits collaborations but keeps slashed band names', () => {
  assert.deepEqual(splitArtists('The Weeknd/Daft Punk'), ['The Weeknd', 'Daft Punk']);
  assert.deepEqual(splitArtists('AC/DC'), ['AC/DC']);
  assert.deepEqual(splitArtists('AC/DC/Axl Rose'), ['AC/DC', 'Axl Rose']);
  assert.deepEqual(splitArtists(''), ['Unknown artist']);
});

test('matches Deezer metadata when its primary artist is one of the collaborators', () => {
  const track = song('1', 'Starboy', ['The Weeknd', 'Daft Punk']);
  const deezer = [{ name: 'Starboy', artist: ['The Weeknd'], album: 'Starboy', duration: 230 }];
  assert.equal(bestMetadataMatch(track, deezer)?.album, 'Starboy');
  assert.equal(bestMetadataMatch(song('2', 'Starboy', ['Someone Else']), deezer), null);
  assert.equal(bestMetadataMatch(song('3', 'Starboy (Live)', ['The Weeknd']), deezer), null);
});

test('a later scrape without metadata keeps earlier album data', () => {
  const merged = mergeTrack(song('1', 'Reminder', ['The Weeknd'], { album: 'Starboy', duration: 219 }),
    song('1', 'Reminder', ['The Weeknd']));
  assert.equal(merged.album, 'Starboy');
  assert.equal(merged.duration, 219);
});

test('collapses one recording listed under several IDs but keeps mixes apart', () => {
  const tracks = buildCatalog({
    existing: [
      song('1', 'Starboy', ['The Weeknd/Daft Punk'], { album: 'Starboy' }),
      song('2', 'Starboy', ['The Weeknd/Daft Punk']),
      song('3', 'Starboy (Sonny Alven Sunday Mix)', ['Sonny Alven/The Weeknd'])
    ],
    scraped: [],
    day: 100
  });
  assert.equal(tracks.length, 2);
  assert.equal(tracks.find(track => track.name === 'Starboy').id, '1');
  assert.deepEqual(tracks[0].artist, ['The Weeknd', 'Daft Punk']);
  assert.notEqual(trackKey(tracks[0]), trackKey(tracks[1]));
});

test('prefers the ID seen in the latest scrape and carries metadata over', () => {
  const tracks = buildCatalog({
    existing: [song('1', 'Starboy', ['The Weeknd'], { album: 'Starboy', seen: 90 })],
    scraped: [song('2', 'Starboy', ['The Weeknd'])],
    day: 100
  });
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].id, '2');
  assert.equal(tracks[0].album, 'Starboy');
  assert.equal(tracks[0].seen, 100);
});

test('drops stale songs and evicts the least recently seen first', () => {
  const tracks = buildCatalog({
    existing: [
      song('old', 'Gone', ['A'], { seen: 10 }),
      song('a', 'First', ['A'], { seen: 95 }),
      song('b', 'Second', ['A'], { seen: 99 })
    ],
    scraped: [song('a', 'First', ['A'])],
    day: 100,
    maxTracks: 2,
    maxAgeDays: 60
  });
  assert.deepEqual(tracks.map(track => track.id), ['a', 'b']);
});

test('runs seeds every time and spends the rest on uncrawled artists first', () => {
  const artists = discoverArtists([
    song('1', 'x', ['Seed Artist', 'Popular']), song('2', 'y', ['Popular']),
    song('3', 'z', ['Recent']), song('4', 'w', ['Stale'])
  ]);
  assert.deepEqual(artists, ['Popular', 'Seed Artist', 'Recent', 'Stale']);
  const queries = pickQueries({
    seeds: ['Seed Artist'], artists,
    crawled: { recent: 98, stale: 50 }, day: 100, budget: 3
  });
  assert.deepEqual(queries, ['Seed Artist', 'Popular', 'Stale']);
});

test('follows pages until the service repeats itself and retries a failed first page', async () => {
  const pages = {
    1: [song('1', 'a', ['A']), song('2', 'b', ['A'])],
    2: [song('3', 'c', ['A']), song('4', 'd', ['A'])],
    3: [song('3', 'c', ['A']), song('4', 'd', ['A'])]
  };
  let calls = 0;
  const search = async (query, size, page) => {
    calls += 1;
    if (calls === 1) return { ok: false, tracks: [] };
    return { ok: true, tracks: pages[page] || [] };
  };
  const result = await scrapeQuery('A', {
    search, metadata: async () => ({ tracks: [] }), pause: async () => {}, pageSize: 2
  });
  assert.deepEqual(result.tracks.map(track => track.id), ['1', '2', '3', '4']);
  assert.equal(calls, 4);
});
