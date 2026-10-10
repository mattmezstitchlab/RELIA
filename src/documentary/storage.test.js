import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MATT_MEZ_DOCUMENTARY as seed } from './matt-mez.js';
import { baseRecord, buildDocumentary, emptyDraft, recordFor } from './model.js';
import { DocumentaryDraftStore, exportNarration } from './storage.js';

const catalog = JSON.parse(readFileSync(new URL('../data/youtube/matt-mez-sax.json', import.meta.url)));
const now = () => '2026-10-10T18:40:00Z';
function storage() {
  const values = new Map();
  const writes = [];
  return { values, writes, getItem: key => values.get(key) ?? null, setItem: (key, value) => { writes.push([key, value]); values.set(key, value); } };
}
const create = persistence => new DocumentaryDraftStore({ catalog, seed, storage: persistence, now });
const first = catalog.videos[0];

test('la sauvegarde ne contient que le brouillon, jamais une copie de catalogue ni un secret', () => {
  const persistence = storage();
  const store = create(persistence);
  const record = baseRecord(first); record.claims.memory = { ...record.claims.memory, value: 'Souvenir à corroborer', status: 'hypothesis', confidence: 'low' };
  const result = store.saveRecord(first.videoId, record);
  assert.equal(result.persisted, true);
  const written = JSON.parse(persistence.writes[0][1]);
  assert.ok(!Object.hasOwn(written, 'videos'));
  assert.ok(!Object.hasOwn(written.records[first.videoId], 'title'));
  assert.ok(!Object.hasOwn(written.records[first.videoId], 'publishedAt'));
  assert.ok(!Object.hasOwn(written, 'apiKey'));
  assert.equal(create(persistence).read().records[first.videoId].claims.memory.value, 'Souvenir à corroborer');
});

test('la copie retournée ne permet pas de modifier le stockage par référence', () => {
  const store = create(storage());
  store.saveRecord(first.videoId, baseRecord(first));
  const result = store.read(); result.records[first.videoId].selectionReason = 'Modification externe';
  assert.notEqual(store.read().records[first.videoId].selectionReason, 'Modification externe');
});

test('un stockage absent ou refusé garde la session et permet l’export', () => {
  for (const persistence of [null, { getItem: () => null, setItem: () => { throw new Error('Quota'); } }]) {
    const store = create(persistence);
    const result = store.saveRecord(first.videoId, baseRecord(first));
    assert.equal(result.persisted, false);
    assert.match(result.warning, /session seulement/);
    assert.ok(JSON.parse(store.exportText()).records[first.videoId]);
  }
});

test('un ancien brouillon invalide n’est ni supprimé ni écrasé au chargement', () => {
  const persistence = storage();
  const key = `relia-documentary-v1:${catalog.identityId}`;
  persistence.values.set(key, '{corrompu');
  const store = create(persistence);
  assert.match(store.warning, /non chargé/);
  assert.equal(persistence.values.get(key), '{corrompu');
  assert.equal(persistence.writes.length, 0);
});

test('import refusé = aucune mutation du brouillon précédent ni du catalogue', () => {
  const persistence = storage(); const store = create(persistence);
  const beforeCatalog = JSON.stringify(catalog);
  store.saveRecord(first.videoId, baseRecord(first));
  const before = store.exportText(); const writes = persistence.writes.length;
  const wrong = emptyDraft('relia:person:autre', now());
  assert.throws(() => store.importText(JSON.stringify(wrong)), /autre identité/);
  assert.throws(() => store.importText('{'), /JSON valide/);
  assert.throws(() => store.importText('é'.repeat(500001)), /1 Mo/);
  assert.equal(store.exportText(), before);
  assert.equal(persistence.writes.length, writes);
  assert.equal(JSON.stringify(catalog), beforeCatalog);
});

test('un sourceURL non sûr est refusé avant toute écriture', () => {
  const persistence = storage(); const store = create(persistence);
  const source = { id: 'local:unsafe', kind: 'document', label: 'Source', url: 'javascript:alert(1)', checkedAt: now(), access: 'user_declared', note: 'Déclaration de test.', rights: '' };
  assert.throws(() => store.saveRecord(first.videoId, baseRecord(first), [source]), /HTTPS/);
  assert.equal(persistence.writes.length, 0);
  assert.deepEqual(store.read().records, {});
});

test('le retrait d’une correction est limité à cette vidéo et à ses sources privées inutilisées', () => {
  const persistence = storage(); const store = create(persistence);
  const second = catalog.videos[1];
  const record = baseRecord(first);
  record.claims.memory = { ...record.claims.memory, status: 'hypothesis', confidence: 'low', value: 'Souvenir privé', sourceIds: ['local:memory'] };
  const source = { id: 'local:memory', kind: 'personal_memory', label: 'Souvenir', url: null, checkedAt: now(), access: 'user_declared', note: 'Déclaration privée non corroborée.', rights: 'Privé.' };
  store.saveRecord(first.videoId, record, [source]);
  store.saveRecord(second.videoId, baseRecord(second));
  store.resetVideo(first.videoId);
  assert.ok(!Object.hasOwn(store.read().records, first.videoId));
  assert.ok(Object.hasOwn(store.read().records, second.videoId));
  assert.deepEqual(store.read().sources, []);
});

test('les IDs invalides ne peuvent pas modifier le prototype de l’objet records', () => {
  const store = create(storage());
  for (const id of ['__proto__', 'toString', 'not-an-id']) {
    assert.throws(() => store.saveRecord(id, baseRecord(first)), /Identifiant vidéo/);
    assert.throws(() => store.resetVideo(id), /Identifiant vidéo/);
  }
  assert.deepEqual(store.read().records, {});
});

test('l’export de script est lisible, sourcé et ne génère ni fichiers audio ni paroles', () => {
  const draft = emptyDraft(seed.identityId, now());
  const id = 'XgKcenvjMdI';
  const item = catalog.videos.find(item => item.videoId === id);
  draft.records[id] = recordFor(item, seed, draft);
  draft.records[id].narration.status = 'draft';
  const result = buildDocumentary(catalog, seed, draft, { now: new Date(now()) });
  const text = exportNarration(result);
  assert.match(text, /## 2006–2012/);
  assert.match(text, /Transition originale/);
  assert.match(text, /À RELIRE — non jouée automatiquement/);
  assert.match(text, /https:\/\/www\.youtube\.com\/watch\?v=/);
  assert.match(text, /https:\/\/www\.halleonard\.com/);
  assert.doesNotMatch(text, /apiKey|YOUTUBE_API_KEY|audio\.mp3/);
});
