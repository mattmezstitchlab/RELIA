import test from 'node:test';
import assert from 'node:assert/strict';
import { makeDate, parseDate, dateFromWikidataTime, dateFromISO, formatDate, isDate, dateSortKey, makeDatedEntry, validateDatedEntry, datesOf, chronologicalOrder } from './dates.js';

const PROOF = [{ method: 'wikidata_claim', sourceId: 'Q33977', url: 'https://example.org/notice', capturedAt: '2026-10-10T08:00:00Z', refreshBy: '2027-10-10T08:00:00Z' }];
const DISCOVERED = '2026-10-10T09:00:00Z';

test('dates keep their precision and reject impossible values', () => {
  assert.deepEqual(makeDate({ year: 1828, month: 2, day: 8 }), { year: 1828, month: 2, day: 8, precision: 'day', approximate: false });
  assert.equal(makeDate({ year: 1828 }).precision, 'year');
  assert.equal(makeDate({ year: 1828, month: 2 }).precision, 'month');
  assert.throws(() => makeDate({ year: 2023, month: 2, day: 29 }), RangeError);
  assert.throws(() => makeDate({ year: 1885, precision: 'decade' }), RangeError);
  assert.throws(() => makeDate({ year: 1885, precision: 'century' }), RangeError);
  assert.throws(() => makeDate({ year: 1828.5 }), RangeError);
});

test('ISO-like input is parsed without guessing; invalid input yields null', () => {
  assert.deepEqual(parseDate('1850'), { year: 1850, month: null, day: null, precision: 'year', approximate: false });
  assert.equal(parseDate('1850-06').precision, 'month');
  assert.equal(parseDate('1850-06-15').day, 15);
  assert.equal(parseDate('~1850').approximate, true);
  assert.equal(parseDate('2024-02-29').day, 29);
  assert.equal(parseDate('2026-02-30'), null);
  assert.equal(parseDate('2026/01'), null);
  assert.equal(parseDate('vers 1850'), null);
  assert.equal(parseDate(''), null);
});

test('Wikidata time values map to the same model with their precision', () => {
  assert.equal(dateFromWikidataTime({ time: '+1828-02-08T00:00:00Z', precision: 11 }).precision, 'day');
  assert.equal(dateFromWikidataTime({ time: '+1828-02-00T00:00:00Z', precision: 10 }).precision, 'month');
  assert.equal(dateFromWikidataTime({ time: '+1828-00-00T00:00:00Z', precision: 9 }).precision, 'year');
  assert.equal(dateFromWikidataTime({ time: '+1880-00-00T00:00:00Z', precision: 8 }).precision, 'decade');
  assert.equal(dateFromWikidataTime({ time: '+1800-00-00T00:00:00Z', precision: 7 }).precision, 'century');
  // Précision trop grossière ou valeur incohérente : inconnue, jamais devinée.
  assert.equal(dateFromWikidataTime({ time: '+1828-00-00T00:00:00Z', precision: 6 }), null);
  assert.equal(dateFromWikidataTime({ time: '+1885-00-00T00:00:00Z', precision: 8 }), null);
  assert.equal(dateFromWikidataTime({ time: 'nonsense', precision: 9 }), null);
});

test('French display states precision and uncertainty explicitly', () => {
  assert.equal(formatDate(makeDate({ year: 1828, month: 2, day: 8 })), '8 février 1828');
  assert.equal(formatDate(makeDate({ year: 1990, month: 3 })), 'mars 1990');
  assert.equal(formatDate(makeDate({ year: 1990 })), '1990');
  assert.equal(formatDate(makeDate({ year: 1990, approximate: true })), 'vers 1990');
  assert.equal(formatDate(makeDate({ year: 1880, precision: 'decade' })), 'années 1880');
  assert.equal(formatDate(makeDate({ year: 1800, precision: 'century' })), 'XIXe siècle');
  assert.equal(formatDate(makeDate({ year: 1700, precision: 'century', approximate: true })), 'vers XVIIIe siècle');
  assert.equal(formatDate(makeDate({ year: 0 })), '1 av. J.-C.');
  assert.equal(formatDate(makeDate({ year: -50 })), '51 av. J.-C.');
  assert.equal(formatDate(null), 'Date inconnue');
});

test('sort keys are monotonic across months, days and BC years', () => {
  const ordered = [makeDate({ year: -50 }), makeDate({ year: -49, month: 1, day: 3 }), makeDate({ year: 1828, month: 2, day: 8 }), makeDate({ year: 1828, month: 2, day: 9 }), makeDate({ year: 1828, month: 3 })];
  const keys = ordered.map(dateSortKey);
  assert.deepEqual([...keys].sort((a, b) => a - b), keys);
  assert.equal(dateSortKey(null), null);
});

test('ISO timestamps convert to a day-precision date for display', () => {
  assert.equal(formatDate(dateFromISO('2026-10-10T09:00:00Z')), '10 octobre 2026');
  assert.equal(dateFromISO('10/10/2026'), null);
  assert.equal(isDate({ year: 2000, precision: 'bogus' }), false);
});

test('a published video never becomes a life event', () => {
  const video = makeDatedEntry({
    id: 'yt-1', subjectId: 'Q33977', kind: 'content', title: 'Documentaire 2025',
    publishedAt: makeDate({ year: 2025, month: 4, day: 2 }), discoveredAt: DISCOVERED, provenance: PROOF,
  });
  const birth = makeDatedEntry({
    id: 'life-birth', subjectId: 'Q33977', kind: 'life', title: 'Naissance',
    eventDate: makeDate({ year: 1828, month: 2, day: 8 }), discoveredAt: DISCOVERED, provenance: PROOF,
  });
  const { dated, undated } = chronologicalOrder([video, birth], 'event');
  assert.deepEqual(dated.map(entry => entry.id), ['life-birth']);
  assert.deepEqual(undated.map(entry => entry.id), ['yt-1']);
});

test('publication axis sorts content by publication date only', () => {
  const make = (id, year) => makeDatedEntry({
    id, subjectId: 'pilot', kind: 'content', title: id,
    publishedAt: makeDate({ year }), discoveredAt: DISCOVERED, provenance: PROOF,
  });
  const { dated, undated } = chronologicalOrder([make('c', 2023), make('a', 2019), make('b', 2019)], 'publication');
  assert.deepEqual(dated.map(entry => entry.id), ['a', 'b', 'c']);
  assert.deepEqual(undated, []);
});

test('undated events stay visible in a separate list, with a deterministic order', () => {
  const event = (id, eventDate) => makeDatedEntry({ id, subjectId: 's', kind: 'event', title: id, eventDate, discoveredAt: DISCOVERED, provenance: PROOF });
  const { dated, undated } = chronologicalOrder([event('z', null), event('m', makeDate({ year: 1900 })), event('a', null)], 'event');
  assert.deepEqual(dated.map(entry => entry.id), ['m']);
  assert.deepEqual(undated.map(entry => entry.id), ['a', 'z']);
  assert.throws(() => chronologicalOrder([], 'vibes'), RangeError);
});

test('each date is labelled by its axis: event, publication, discovery', () => {
  const content = makeDatedEntry({ id: 'c', subjectId: 's', kind: 'content', title: 'Vidéo', publishedAt: makeDate({ year: 2025, month: 4, day: 2 }), discoveredAt: DISCOVERED, provenance: PROOF });
  const rows = datesOf(content);
  assert.deepEqual(rows.map(row => row.role), ['publication', 'discovery']);
  assert.equal(rows[0].label, 'Publié le');
  assert.equal(rows[0].display, '2 avril 2025');
  assert.equal(rows[1].display, '10 octobre 2026');

  const event = makeDatedEntry({ id: 'e', subjectId: 's', kind: 'event', title: 'Concert', eventDate: makeDate({ year: 2019, month: 6 }), discoveredAt: DISCOVERED, provenance: PROOF });
  assert.deepEqual(datesOf(event).map(row => row.role), ['event', 'discovery']);
  assert.equal(datesOf(event)[0].display, 'juin 2019');

  const undatedEvent = makeDatedEntry({ id: 'u', subjectId: 's', kind: 'event', title: 'Festival', discoveredAt: DISCOVERED, provenance: PROOF });
  assert.equal(datesOf(undatedEvent)[0].display, 'Date inconnue');
  assert.equal(datesOf(undatedEvent)[0].undated, true);
});

test('invalid entries are refused with explicit reasons', () => {
  const base = { id: 'x', subjectId: 's', kind: 'event', title: 'T', discoveredAt: DISCOVERED, provenance: PROOF };
  assert.deepEqual(validateDatedEntry(base), []);
  assert.ok(validateDatedEntry({ ...base, discoveredAt: undefined }).length > 0);
  assert.ok(validateDatedEntry({ ...base, provenance: [] }).includes('Provenance requise.'));
  assert.ok(validateDatedEntry({ ...base, kind: 'content' }).includes('Un contenu doit avoir une date de publication.'));
  assert.ok(validateDatedEntry({ ...base, publishedAt: makeDate({ year: 2020 }) }).includes('Seul un contenu porte une date de publication.'));
  assert.ok(validateDatedEntry({ ...base, kind: 'content', publishedAt: makeDate({ year: 2020 }), eventDate: makeDate({ year: 2019 }) })
    .some(message => message.includes('ne porte pas de date d’événement')));
  assert.throws(() => makeDatedEntry({ ...base, kind: 'bogus' }), /Type d’entrée inconnu/);
});
