// Tests du catalogue YouTube RELIA : normalisation, fusion incrémentale, conservation/suppression,
// conversion vers le moteur chronologique existant et validation stricte du fichier.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  catalogEntryFromVideo, durationSecondsFromISO, durationDisplay, emptyCatalog, isSyncableVideo,
  mergeCatalog, orderedChronology, refreshByFor, toDatedEntries, validateCatalog,
  watchURL, REFRESH_AFTER_DAYS,
} from './catalog.js';
import { validateProvenance, isStale } from '../provenance.js';
import { chronologicalOrder } from '../dates.js';

const CAPTURED_AT = '2026-10-10T12:00:00Z';
const CHANNEL = { channelId: 'UCabcdefghij1234567890', title: 'Matt Mez Sax', url: 'https://www.youtube.com/@mattmezsax', thumbnail: null };

function rawVideo(overrides = {}) {
  return {
    videoId: 'aaaaaaaaaaa',
    title: 'Concert aux halles',
    channelId: 'UCabcdefghij1234567890',
    channelTitle: 'Matt Mez Sax',
    publishedAt: '2020-05-17T10:00:00Z',
    durationISO: 'PT3M24S',
    embeddable: true,
    privacyStatus: 'public',
    uploadStatus: 'processed',
    thumbnails: { high: { url: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq.jpg' } },
    ...overrides,
  };
}

function fullCatalog() {
  const first = catalogEntryFromVideo(rawVideo(), { capturedAt: CAPTURED_AT });
  const second = catalogEntryFromVideo(rawVideo({ videoId: 'bbbbbbbbbbb', publishedAt: '2021-06-02T09:00:00Z', title: 'Studio session' }), { capturedAt: CAPTURED_AT });
  return mergeCatalog(null, { identityId: 'relia:person:matt-mez-sax', channel: CHANNEL, entries: [second, first], capturedAt: CAPTURED_AT }).catalog;
}

test('durations are parsed from ISO 8601 and displayed', () => {
  assert.equal(durationSecondsFromISO('PT3M24S'), 204);
  assert.equal(durationSecondsFromISO('PT1H2M3S'), 3723);
  assert.equal(durationSecondsFromISO('P1DT2H'), 93600);
  assert.equal(durationSecondsFromISO('PT0S'), 0);
  assert.equal(durationSecondsFromISO('garbage'), null);
  assert.equal(durationSecondsFromISO(''), null);
  assert.equal(durationDisplay(204), '3:24');
  assert.equal(durationDisplay(3723), '1:02:03');
  assert.equal(durationDisplay(0), '0:00');
  assert.equal(durationDisplay(null), '');
  assert.equal(durationDisplay(-5), '');
});

test('the best safe thumbnail wins', () => {
  const entry = catalogEntryFromVideo(rawVideo({ thumbnail: 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq.jpg' }), { capturedAt: CAPTURED_AT });
  assert.equal(entry.thumbnail, 'https://i.ytimg.com/vi/aaaaaaaaaaa/hq.jpg');
  assert.equal(catalogEntryFromVideo(rawVideo({ thumbnail: 'http://insecure/x.jpg' }), { capturedAt: CAPTURED_AT }).thumbnail, null);
  assert.equal(catalogEntryFromVideo(rawVideo({ thumbnail: undefined }), { capturedAt: CAPTURED_AT }).thumbnail, null);
});

test('only public and processed videos enter the catalog', () => {
  assert.equal(isSyncableVideo(rawVideo()), true);
  assert.equal(isSyncableVideo(rawVideo({ privacyStatus: 'private' })), false);
  assert.equal(isSyncableVideo(rawVideo({ uploadStatus: 'deleted' })), false);
  assert.equal(isSyncableVideo(rawVideo({ uploadStatus: 'rejected' })), false);
});

test('each catalog entry carries complete dated provenance with a refresh deadline', () => {
  const entry = catalogEntryFromVideo(rawVideo(), { capturedAt: CAPTURED_AT });
  assert.deepEqual(validateProvenance(entry.provenance[0]), []);
  assert.equal(entry.provenance[0].method, 'youtube_api');
  assert.equal(entry.provenance[0].sourceId, 'aaaaaaaaaaa');
  assert.equal(entry.provenance[0].url, watchURL('aaaaaaaaaaa'));
  assert.equal(entry.provenance[0].refreshBy, refreshByFor(CAPTURED_AT));
  assert.equal(refreshByFor(CAPTURED_AT), new Date(Date.parse(CAPTURED_AT) + REFRESH_AFTER_DAYS * 86400000).toISOString());
  assert.equal(entry.durationSeconds, 204);
  assert.equal(entry.durationDisplay, '3:24');
  assert.equal(entry.link, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
  assert.equal(entry.embeddable, true);
});

test('a stale entry is detected after its refresh deadline', () => {
  const entry = catalogEntryFromVideo(rawVideo(), { capturedAt: '2025-01-01T00:00:00Z' });
  assert.equal(isStale(entry.provenance[0], new Date('2025-02-15T00:00:00Z')), true);
  assert.equal(isStale(entry.provenance[0], new Date('2025-01-15T00:00:00Z')), false);
});

test('merge adds, updates and deduplicates by YouTube identifier', () => {
  const first = catalogEntryFromVideo(rawVideo(), { capturedAt: CAPTURED_AT });
  const duplicate = catalogEntryFromVideo(rawVideo({ title: 'Concert aux halles (copie)' }), { capturedAt: '2026-10-11T12:00:00Z' });
  const fresh = catalogEntryFromVideo(rawVideo({ videoId: 'bbbbbbbbbbb', publishedAt: '2021-06-02T09:00:00Z' }), { capturedAt: '2026-10-11T12:00:00Z' });
  const { catalog } = mergeCatalog(null, { identityId: 'relia:person:matt-mez-sax', channel: CHANNEL, entries: [first, duplicate, fresh], capturedAt: '2026-10-11T12:00:00Z' });
  assert.equal(catalog.videos.length, 2, 'le doublon est ignoré');
  assert.equal(catalog.videos.find(video => video.videoId === 'aaaaaaaaaaa').title, 'Concert aux halles', 'la première occurrence gagne');
  assert.deepEqual(validateCatalog(catalog), []);
});

test('a complete full sync removes videos that left the channel, and only those', () => {
  const existing = fullCatalog();
  const otherChannel = catalogEntryFromVideo(rawVideo({ videoId: 'ccccccccccc', channelId: 'UCother999999999999999' }), { capturedAt: CAPTURED_AT });
  const withOther = mergeCatalog(existing, {
    identityId: 'relia:person:matt-mez-sax',
    channel: { channelId: 'UCother999999999999999', title: 'Deuxième chaîne', url: 'https://www.youtube.com/channel/UCother999999999999999' },
    entries: [otherChannel], capturedAt: '2026-10-11T12:00:00Z',
  }).catalog;
  const kept = catalogEntryFromVideo(rawVideo(), { capturedAt: '2026-10-11T12:00:00Z' });
  const { catalog, removed } = mergeCatalog(withOther, {
    identityId: 'relia:person:matt-mez-sax', channel: CHANNEL, entries: [kept], capturedAt: '2026-10-11T12:00:00Z',
  });
  assert.deepEqual(catalog.videos.map(video => video.videoId).sort(), ['aaaaaaaaaaa', 'ccccccccccc'], 'bbbbbbbbbbb a disparu, l’autre chaîne est intacte');
  assert.equal(removed, 1);
  assert.equal(catalog.channels.length, 2);
});

test('an incomplete listing never removes anything', () => {
  const existing = fullCatalog();
  const { catalog, removed } = mergeCatalog(existing, {
    identityId: 'relia:person:matt-mez-sax', channel: CHANNEL, entries: [], capturedAt: '2026-10-11T12:00:00Z', complete: false,
  });
  assert.equal(removed, 0);
  assert.equal(catalog.videos.length, 2, 'les vidéos restent tant que la liste est incomplète');
  assert.equal(catalog.sync.complete, false);
});

test('incremental mode adds and updates without removing', () => {
  const existing = fullCatalog();
  const added = catalogEntryFromVideo(rawVideo({ videoId: 'ddddddddddd', publishedAt: '2024-01-05T08:00:00Z' }), { capturedAt: '2026-10-11T12:00:00Z' });
  const { catalog, removed, added: addedCount } = mergeCatalog(existing, {
    identityId: 'relia:person:matt-mez-sax', channel: CHANNEL, entries: [added], capturedAt: '2026-10-11T12:00:00Z', mode: 'incremental',
  });
  assert.equal(removed, 0);
  assert.equal(addedCount, 1);
  assert.equal(catalog.videos.length, 3);
  assert.equal(catalog.sync.mode, 'incremental');
});

test('the first discovery date survives later syncs', () => {
  const existing = fullCatalog();
  const refetched = catalogEntryFromVideo(rawVideo(), { capturedAt: '2026-11-10T00:00:00Z' });
  const { catalog } = mergeCatalog(existing, {
    identityId: 'relia:person:matt-mez-sax', channel: CHANNEL, entries: [refetched], capturedAt: '2026-11-10T00:00:00Z',
  });
  assert.equal(catalog.videos[0].discoveredAt, CAPTURED_AT, 'première découverte conservée');
  assert.equal(catalog.videos[0].provenance[0].capturedAt, '2026-11-10T00:00:00Z', 'provenance rafraîchie');
});

test('the channel binding stays owner-declared at its original date', () => {
  const existing = fullCatalog();
  const { catalog } = mergeCatalog(existing, {
    identityId: 'relia:person:matt-mez-sax', channel: { ...CHANNEL, title: 'Nouveau titre de chaîne' }, entries: [], capturedAt: '2026-12-01T00:00:00Z',
  });
  assert.equal(catalog.channels[0].declaredAt, CAPTURED_AT);
  assert.equal(catalog.channels[0].title, 'Nouveau titre de chaîne');
  assert.equal(catalog.channels[0].declaredBy, 'owner');
});

test('catalog entries become content entries of the existing timeline engine', () => {
  const catalog = fullCatalog();
  const entries = toDatedEntries(catalog);
  assert.equal(entries.length, 2);
  for (const entry of entries) {
    assert.equal(entry.kind, 'content');
    assert.equal(entry.subjectId, 'relia:person:matt-mez-sax');
    assert.notEqual(entry.publishedAt, null);
    assert.equal(entry.publishedAt.precision, 'day');
    assert.equal(entry.eventDate, null, 'un contenu ne porte jamais de date d’événement');
  }
  const { rows, undated } = orderedChronology(catalog);
  assert.equal(undated.length, 0);
  assert.deepEqual(rows.map(row => row.entry.title), ['Concert aux halles', 'Studio session'], 'ordre ascendant : plus ancienne publication d’abord');
  assert.equal(rows[0].video.link, 'https://www.youtube.com/watch?v=aaaaaaaaaaa');
  // Le moteur existant est bien celui de src/dates.js, réutilisé sans réécriture.
  const direct = chronologicalOrder(toDatedEntries(catalog), 'publication');
  assert.deepEqual(direct.dated.map(entry => entry.id), rows.map(row => row.entry.id));
});

test('catalog validation enforces closed keys and rejects smuggled payloads', () => {
  const catalog = fullCatalog();
  assert.deepEqual(validateCatalog(catalog), []);
  assert.ok(validateCatalog({ ...catalog, apiKey: 'LEAKED' }).some(error => error.includes('apiKey')), 'tout champ inattendu est refusé');
  assert.ok(validateCatalog({ ...catalog, schemaVersion: 2 }).length > 0);
  const broken = structuredClone(catalog);
  broken.videos[0].link = 'javascript:alert(1)';
  assert.ok(validateCatalog(broken).some(error => error.includes('lien invalide')));
  const noBinding = structuredClone(catalog);
  noBinding.channels[0].declaredBy = 'name_match';
  assert.ok(validateCatalog(noBinding).some(error => error.includes('propriétaire')));
  const noRefresh = structuredClone(catalog);
  delete noRefresh.videos[0].provenance[0].refreshBy;
  assert.ok(validateCatalog(noRefresh).some(error => error.includes('échéance')));
  assert.ok(validateCatalog(emptyCatalog('relia:person:matt-mez-sax', CAPTURED_AT)).length === 0, 'un catalogue vide est valide');
});

test('merge refuses a foreign identity and an invalid identity id', () => {
  const existing = fullCatalog();
  assert.throws(() => mergeCatalog(existing, { identityId: 'relia:person:quelqu-un-d-autre', channel: CHANNEL, entries: [], capturedAt: CAPTURED_AT }), /appartient/);
  assert.throws(() => mergeCatalog(null, { identityId: 'Q12345', channel: CHANNEL, entries: [], capturedAt: CAPTURED_AT }), /Identité locale/);
});
