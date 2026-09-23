import catalog from '../data/catalog.js';

const words = value => String(value || '')
  .toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);

export const catalogSearch = (query, limit, entries = catalog.tracks) => {
  const terms = [...new Set(words(query))];
  if (!terms.length) return [];
  return entries.map(track => {
    const title = words(track.name);
    const artist = words(track.artist.join(' '));
    const all = new Set([...title, ...artist]);
    if (!terms.every(term => all.has(term))) return null;
    const titleText = title.join(' ');
    const queryText = terms.join(' ');
    const score = (titleText === queryText ? 12 : 0)
      + (titleText.startsWith(queryText) ? 5 : 0)
      + terms.filter(term => title.includes(term)).length * 3
      + terms.filter(term => artist.includes(term)).length
      - Math.max(0, title.length - terms.length) * 0.05;
    return { track, score };
  }).filter(Boolean).sort((a, b) => b.score - a.score)
    .slice(0, limit).map(result => result.track);
};

export const catalogUpdatedAt = catalog.updatedAt;
