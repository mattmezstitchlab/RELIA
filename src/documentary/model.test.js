import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { orderedChronology } from '../youtube/catalog.js';
import { chronologicalOrder, formatDate } from '../dates.js';
import { MATT_MEZ_DOCUMENTARY as seed } from './matt-mez.js';
import {
  baseRecord, buildDocumentary, catalogFingerprint, emptyDraft, excerptFor,
  parseDraft, prepareRecordForSave, recordFor, sourceURL, validateDraft,
} from './model.js';

const catalog = JSON.parse(readFileSync(new URL('../data/youtube/matt-mez-sax.json', import.meta.url)));
const NOW = '2026-10-10T18:40:00Z';
const context = { catalog, seed };
const video = id => catalog.videos.find(item => item.videoId === id);
const build = (draft = emptyDraft(seed.identityId, NOW), data = catalog, now = new Date(NOW)) => buildDocumentary(data, seed, draft, { now });
const copy = value => structuredClone(value);
const claimed = (value, sourceIds, extra = {}) => ({ value, status: 'confirmed', confidence: 'high', sourceIds, note: 'Élément précis relu dans la source citée.', reviewedBy: 'Éditeur test', reviewedAt: NOW, ...extra });
const source = (id = 'local:document', kind = 'document') => ({ id, kind, label: 'Document relu', url: kind === 'personal_memory' ? null : 'https://example.org/document', checkedAt: NOW, access: 'user_declared', note: 'Document identifiant cet événement et sa date ; déclaration du relecteur.', rights: 'Lien de consultation uniquement.' });
function draftWith(id, change) {
  const draft = emptyDraft(seed.identityId, NOW);
  draft.records[id] = recordFor(video(id), seed, draft);
  change(draft.records[id], draft);
  return draft;
}
function freeze(value) {
  if (value && typeof value === 'object') { Object.freeze(value); Object.values(value).forEach(freeze); }
  return value;
}

// Le catalogue peut légitimement évoluer / retirer une vidéo. Ces tests n’imposent jamais
// la conservation d’un ID devenu privé ; ils vérifient la présence des séquences réellement jouées.
test('le prototype choisit uniquement des vidéos réelles, sans jouer le catalogue entier', () => {
  const result = build();
  const available = new Set(catalog.videos.map(item => item.videoId));
  const selected = Object.entries(seed.records).filter(([id, record]) => record.selected && available.has(id));
  assert.equal(result.catalogCount, catalog.videos.length);
  assert.equal(result.steps.length, selected.length);
  assert.ok(result.steps.length <= 12 && result.steps.length < result.catalogCount);
  assert.equal(new Set(result.steps.map(step => step.videoId)).size, result.steps.length);
  result.steps.forEach(step => assert.ok(available.has(step.videoId)));
  assert.equal(result.chapters.length, 6);
  assert.equal(result.from, 2006);
  assert.equal(result.to, 2026);
});

test('les publications des 296 archives sont analysées, les autres informations ne sont pas inférées', () => {
  const result = build();
  result.analysis.forEach(item => {
    assert.equal(item.title.value, item.video.title);
    assert.deepEqual(item.publication.value, item.entry.publishedAt);
    assert.equal(item.title.confidence, 'high');
    assert.equal(item.publication.confidence, 'high');
    assert.equal(item.entry.kind, 'content');
    assert.equal(item.entry.eventDate, null);
    assert.equal(item.eventEntry, null);
    assert.equal(item.claims.memory.value, null);
    assert.equal(item.claims.eventDate.value, null);
  });
});

test('ni UPTOWN, ni Slowly, ni Presence ne sont automatiquement des chansons ou des compositions', () => {
  const result = build();
  for (const id of ['XgKcenvjMdI', 'YT9M8JSJqwY', 'ZK2gy2XUCDc']) {
    const item = result.analysis.find(item => item.videoId === id);
    if (!item) continue;
    assert.equal(item.claims.song.status, 'unknown');
    assert.equal(item.claims.classification.status, 'unknown');
    assert.equal(item.claims.writers.status, 'unknown');
  }
});

test('un candidat ressemblant à un titre de chanson reste une hypothèse malgré sa source', () => {
  const item = build().analysis.find(item => item.videoId === '1X3dI1w3qTY');
  if (!item) return;
  assert.equal(item.claims.song.value, 'Hymne à l’amour');
  assert.equal(item.claims.song.status, 'hypothesis');
  assert.equal(item.claims.classification.status, 'unknown');
  assert.equal(item.claims.writers.status, 'unknown');
});

test('l’ordre vient du moteur de chronologie existant, même avec un catalogue inversé', () => {
  const reversed = copy(catalog);
  reversed.videos.reverse();
  const result = build(undefined, reversed);
  const expected = orderedChronology(catalog).rows.filter(row => seed.records[row.video.videoId]?.selected).map(row => row.video.videoId);
  assert.deepEqual(result.steps.map(step => step.videoId), expected);
  assert.deepEqual(result.analysis.map(item => item.entry.id), chronologicalOrder(result.analysis.map(item => item.entry), 'publication').dated.map(item => item.id));
});

test('le modèle, la narration et les sources ne modifient aucun octet des entrées fournies', () => {
  const original = JSON.stringify(catalog);
  const input = freeze(copy(catalog));
  const editorial = freeze(copy(seed));
  const result = buildDocumentary(input, editorial, emptyDraft(seed.identityId, NOW), { now: new Date(NOW) });
  result.analysis[0].record.selectionReason = 'Modification dans le résultat uniquement.';
  assert.equal(JSON.stringify(input), original);
  assert.equal(JSON.stringify(catalog), original);
  assert.notEqual(result.analysis[0].record.selectionReason, editorial.records[result.analysis[0].videoId]?.selectionReason);
});

test('les chapitres décrivent des fenêtres de publication et les lacunes ne sont pas comblées', () => {
  const result = build();
  assert.ok(result.chapters.find(item => item.id === 'ellipse').missingYears.includes(2013));
  const inRange = result.analysis.filter(item => item.entry.publishedAt.year >= seed.from && item.entry.publishedAt.year <= seed.to);
  assert.equal(result.chapters.reduce((count, chapter) => count + chapter.archiveCount, 0), inRange.length);
  result.steps.forEach(step => {
    const chapter = result.chapters.find(chapter => chapter.id === step.chapterId);
    assert.ok(step.entry.publishedAt.year >= chapter.from && step.entry.publishedAt.year <= chapter.to);
  });
  assert.equal(result.events.dated.length, 0);
});

test('les crédits vérifiés distinguent original, référence de reprise, auteur et arrangeur', () => {
  const result = build();
  const raise = result.analysis.find(item => item.videoId === 'mdqILjZhhw0');
  if (raise) {
    assert.equal(raise.claims.originalArtist.value, 'Secret Garden');
    assert.equal(raise.claims.versionArtist.value, 'Josh Groban');
    assert.match(raise.claims.writers.value, /Brendan Graham.*Rolf Løvland/);
    assert.doesNotMatch(raise.claims.writers.value, /Josh Groban|Roger Emerson/);
  }
  const photograph = result.analysis.find(item => item.videoId === 'By6BUKObbNs');
  if (photograph) {
    assert.equal(photograph.claims.writers.value.split(' · ').length, 4);
    assert.match(photograph.claims.writers.value, /Martin Peter Harrington/);
    assert.match(photograph.claims.writers.value, /Tom Leonard/);
    assert.doesNotMatch(photograph.claims.writers.value, /Cristi Cary Miller/);
  }
});

test('les thèmes sont résumés avec des notices autorisées, sans champ de paroles', () => {
  const result = build();
  for (const item of result.analysis.filter(item => item.claims.theme.status === 'confirmed')) {
    assert.ok(item.claims.theme.value.length <= 400);
    assert.equal(item.claims.theme.confidence, 'medium');
    const references = item.claims.theme.sourceIds.map(id => result.sources.find(source => source.id === id));
    assert.ok(references.every(source => ['licensed_music', 'official_artist'].includes(source.kind)));
    assert.ok(item.narration.text.includes('pas') || item.narration.text.includes('ne '), 'limite éditoriale explicite');
  }
  assert.ok(!JSON.stringify(seed).includes('"lyrics"'));
});

test('ajouter un événement documenté crée une entrée distincte sans dater le contenu', () => {
  const id = 'q9kVRm-ApXc';
  if (!video(id)) return;
  const draft = draftWith(id, (record, draft) => {
    draft.sources.push(source());
    record.claims.eventDate = claimed('~2017-06', ['local:document']);
  });
  assert.deepEqual(validateDraft(draft, context), []);
  const result = build(draft);
  const item = result.analysis.find(item => item.videoId === id);
  assert.equal(item.entry.eventDate, null);
  assert.equal(item.entry.publishedAt.year, 2018);
  assert.equal(item.eventEntry.kind, 'event');
  assert.equal(item.eventEntry.eventDate.precision, 'month');
  assert.equal(formatDate(item.eventEntry.eventDate), 'vers juin 2017');
  assert.equal(result.events.dated.length, 1);
  assert.deepEqual(result.steps.map(step => step.videoId), build().steps.map(step => step.videoId));
});

test('ni la publication ni une source musicale ne suffisent à confirmer une date d’événement', () => {
  for (const ref of ['catalog:XgKcenvjMdI', 'music:flowers:alfred']) {
    const draft = draftWith('XgKcenvjMdI', record => { record.claims.eventDate = claimed('2006-11-20', [ref]); });
    assert.ok(validateDraft(draft, context).some(message => message.includes('document de l’événement')));
  }
});

test('un souvenir personnel reste non corroboré et ne confirme pas un événement', () => {
  const draft = draftWith('XgKcenvjMdI', (record, draft) => {
    draft.sources.push(source('local:memory', 'personal_memory'));
    record.claims.memory = claimed('Un souvenir privé fourni par l’éditeur.', ['local:memory']);
  });
  assert.ok(validateDraft(draft, context).some(message => message.includes('document de l’événement')));
  draft.records.XgKcenvjMdI.claims.memory.status = 'hypothesis';
  draft.records.XgKcenvjMdI.claims.memory.confidence = 'low';
  assert.deepEqual(validateDraft(draft, context), []);
  const item = build(draft).analysis.find(item => item.videoId === 'XgKcenvjMdI');
  assert.equal(item.claims.memory.status, 'hypothesis');
  assert.ok(!item.narration.text.includes('souvenir privé fourni'));
  assert.ok(!Object.hasOwn(item.narration.claimBindings, 'memory'));
});

test('les auteurs, l’artiste original et les thèmes ne peuvent pas être confirmés par un titre YouTube seul', () => {
  for (const key of ['writers', 'originalArtist', 'theme']) {
    const draft = draftWith('wYbC0r8Vc68', record => { record.claims[key] = claimed('Attribution non vérifiée', ['catalog:wYbC0r8Vc68']); });
    assert.ok(validateDraft(draft, context).some(message => message.includes('source musicale autorisée')));
  }
});

test('Official Video n’est pas une confirmation de composition originale', () => {
  const draft = draftWith('XgKcenvjMdI', record => {
    record.claims.song = claimed('Nom explicitement proposé après relecture', ['catalog:XgKcenvjMdI']);
    record.claims.classification = claimed('original', ['catalog:XgKcenvjMdI']);
  });
  assert.ok(validateDraft(draft, context).some(message => message.includes('composition originale exige')));
});

test('un morceau non confirmé ne peut pas porter des crédits ou un statut reprise confirmés', () => {
  const draft = draftWith('wYbC0r8Vc68', record => {
    record.claims.song.status = 'hypothesis'; record.claims.song.confidence = 'low';
  });
  assert.ok(validateDraft(draft, context).some(message => message.includes('morceau doit être confirmé')));
});

test('une source ne promeut jamais une hypothèse automatiquement', () => {
  const draft = draftWith('wYbC0r8Vc68', record => { record.claims.writers.status = 'hypothesis'; record.claims.writers.confidence = 'medium'; });
  const result = build(draft);
  assert.equal(result.analysis.find(item => item.videoId === 'wYbC0r8Vc68').claims.writers.status, 'hypothesis');
  assert.equal(result.steps.find(item => item.videoId === 'wYbC0r8Vc68').narration.playable, false);
});

test('retirer une vidéo n’invente pas de remplacement et suspend les scripts qui la citent', () => {
  const removed = copy(catalog);
  removed.videos = removed.videos.filter(item => item.videoId !== '-mTxWSZW6ME');
  const result = build(undefined, removed);
  assert.ok(result.warnings.some(message => message.includes('-mTxWSZW6ME')));
  assert.ok(!result.steps.some(step => step.videoId === '-mTxWSZW6ME'));
  const returning = result.steps.find(step => step.videoId === 'VyOYHeLM-9k');
  if (returning) assert.equal(returning.narration.playable, false);
});

test('une modification du titre ou de la publication suspend les relectures liées à ces métadonnées', () => {
  const changed = copy(catalog);
  const item = changed.videos.find(item => item.videoId === 'wYbC0r8Vc68');
  item.title = 'Autre titre après synchronisation';
  const step = build(undefined, changed).steps.find(step => step.videoId === item.videoId);
  assert.equal(step.claims.song.status, 'hypothesis');
  assert.equal(step.claims.writers.status, 'hypothesis');
  assert.equal(step.claims.theme.status, 'hypothesis');
  assert.equal(step.narration.playable, false);
  assert.match(step.narration.reviewReasons.join(' '), /titre ou la publication/);
});

test('les métadonnées YouTube périmées ne sont pas jouées comme des faits frais', () => {
  const result = build(undefined, catalog, new Date('2026-11-10T00:00:00Z'));
  assert.ok(result.analysis.every(item => item.title.status === 'hypothesis'));
  assert.ok(result.steps.every(item => !item.narration.playable));
  assert.ok(result.steps.some(item => item.narration.reviewReasons.some(reason => reason.includes('rafraîchir'))));
});

test('corriger le morceau invalide les anciens crédits et le script qui en dépend', () => {
  const id = 'wYbC0r8Vc68';
  const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const next = copy(previous);
  next.claims.song.value = 'Un autre morceau';
  const prepared = prepareRecordForSave(next, previous, video(id), { reviewer: 'Éditeur', consulted: true, now: NOW });
  assert.equal(prepared.claims.writers.status, 'hypothesis');
  assert.equal(prepared.claims.theme.status, 'hypothesis');
  assert.equal(prepared.claims.classification.status, 'hypothesis');
  assert.deepEqual(prepared.themeTags, []);
  const draft = emptyDraft(seed.identityId, NOW); draft.records[id] = prepared;
  assert.equal(build(draft).steps.find(step => step.videoId === id).narration.playable, false);
});

test('le script est indépendant de l’audio et une modification non relue bloque la lecture automatique', () => {
  const id = 'XgKcenvjMdI';
  const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const next = copy(previous); next.narration.text = 'Un nouveau texte original à relire.';
  const prepared = prepareRecordForSave(next, previous, video(id), { now: NOW });
  assert.equal(prepared.narration.status, 'draft');
  const draft = emptyDraft(seed.identityId, NOW); draft.records[id] = prepared;
  assert.equal(build(draft).steps[0].narration.playable, false);
  assert.equal(prepared.narration.text, next.narration.text);
  assert.ok(!Object.hasOwn(prepared, 'audio'));
});

test('une relecture explicite autorise un nouveau script sans y injecter les souvenirs', () => {
  const id = 'XgKcenvjMdI';
  const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const next = copy(previous); next.narration.text = 'Une porte vers les archives, avec leurs limites.';
  next.claims.memory = claimed('Une anecdote personnelle', [], { status: 'hypothesis', confidence: 'low' });
  const prepared = prepareRecordForSave(next, previous, video(id), { scriptReviewed: true, reviewer: 'Éditeur', consulted: true, now: NOW });
  assert.equal(prepared.narration.status, 'reviewed');
  assert.ok(!Object.hasOwn(prepared.narration.claimBindings, 'memory'));
  assert.ok(!prepared.narration.text.includes('anecdote'));
  const draft = emptyDraft(seed.identityId, NOW); draft.records[id] = prepared;
  assert.equal(build(draft).steps[0].narration.playable, true);
});

test('confirmer sans consultation, nom, date ou justification est refusé', () => {
  const id = 'wYbC0r8Vc68';
  const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const changed = copy(previous); changed.claims.writers.value = 'Un nouveau crédit non attesté';
  assert.throws(() => prepareRecordForSave(changed, previous, video(id), { consulted: false }), /attestez/);
  for (const field of ['reviewedBy', 'reviewedAt', 'note']) {
    const draft = draftWith(id, record => { record.claims.writers[field] = field === 'reviewedAt' ? null : ''; });
    assert.ok(validateDraft(draft, context).length > 0);
  }
});

test('une nouvelle sélection reste triée sur la publication et requiert un script relu', () => {
  const item = catalog.videos.find(item => !Object.hasOwn(seed.records, item.videoId));
  const record = baseRecord(item); record.selected = true; record.selectionReason = 'Nouvelle sélection à travailler.';
  const draft = emptyDraft(seed.identityId, NOW); draft.records[item.videoId] = record;
  const result = build(draft);
  assert.ok(result.steps.some(step => step.videoId === item.videoId));
  assert.equal(result.steps.find(step => step.videoId === item.videoId).narration.playable, false);
  assert.deepEqual(result.steps.map(step => step.id), chronologicalOrder(result.steps.map(step => step.entry), 'publication').dated.map(entry => entry.id));
});

test('les imports sont fermés aux métadonnées, aux paroles intégrales et aux secrets', () => {
  for (const key of ['title', 'publishedAt', 'channelId', 'lyrics', 'apiKey', '__proto__']) {
    const draft = draftWith('XgKcenvjMdI', record => { Object.defineProperty(record, key, { value: 'Contenu refusé', enumerable: true }); });
    assert.ok(validateDraft(draft, context).some(message => message.includes('champ interdit')));
  }
  const invalid = emptyDraft(seed.identityId, NOW); invalid.identityId = 'relia:person:autre';
  assert.throws(() => parseDraft(JSON.stringify(invalid), context), /autre identité/);
  assert.throws(() => parseDraft('{', context), /JSON valide/);
  assert.throws(() => parseDraft('é'.repeat(500001), context), /1 Mo/);
});

test('les liens de sources refusent HTTP, javascript, credentials et paramètres secrets', () => {
  for (const url of ['javascript:alert(1)', 'http://example.org', 'https://user:password@example.org', 'https://example.org?api_key=test', 'https://example.org?token=test', 'https://example.org?access_token=test', 'https://example.org?client_secret=test', 'https://example.org?key=test']) assert.equal(sourceURL(url), null);
  assert.equal(sourceURL('https://www.youtube.com/watch?v=XgKcenvjMdI'), 'https://www.youtube.com/watch?v=XgKcenvjMdI');
});

test('une source de brouillon ne peut pas écraser une source musicale ou se prétendre capture API', () => {
  const draft = emptyDraft(seed.identityId, NOW);
  draft.sources.push({ ...source(), id: 'music:flowers:alfred' });
  assert.ok(validateDraft(draft, context).some(message => message.includes('remplacer une autre source')));
  draft.sources[0] = { ...source(), kind: 'catalog' };
  assert.ok(validateDraft(draft, context).some(message => message.includes('Type de source')));
});

test('les extraits sont bornés sans prétendre que la durée choisie vient du catalogue', () => {
  assert.deepEqual(excerptFor({ durationSeconds: 24 }, { startSeconds: 10, durationSeconds: 20 }), { startSeconds: 10, durationSeconds: 14, endSeconds: 24, adjusted: true });
  assert.equal(excerptFor({ durationSeconds: 5 }, { startSeconds: 90, durationSeconds: 20 }).startSeconds, 4);
  assert.equal(excerptFor({ durationSeconds: null }, { startSeconds: 0, durationSeconds: 20 }).endSeconds, 20);
  assert.notEqual(catalogFingerprint(video('XgKcenvjMdI')), catalogFingerprint({ ...video('XgKcenvjMdI'), title: 'Titre modifié' }));
});


test('un souvenir ne reconfirme ni ne redate les faits musicaux inchangés', () => {
  const id = 'wYbC0r8Vc68'; const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const next = copy(previous); next.claims.memory = { ...next.claims.memory, value: 'Souvenir à corroborer', status: 'hypothesis', confidence: 'low' };
  const prepared = prepareRecordForSave(next, previous, video(id), { now: NOW });
  assert.deepEqual(prepared.claims.writers, previous.claims.writers);
  assert.deepEqual(prepared.claims.song, previous.claims.song);
  assert.deepEqual(prepared.narration, previous.narration);
});

test('un simple enregistrement ne reconfirme pas des faits dont les métadonnées ont changé', () => {
  const id = 'wYbC0r8Vc68'; const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const changedVideo = { ...video(id), title: 'Titre modifié après relecture' };
  assert.throws(() => prepareRecordForSave(previous, previous, changedVideo, { now: NOW }), /attestez/);
  assert.notEqual(previous.reviewFingerprint, catalogFingerprint(changedVideo));
});

test('relire un script conserve aussi les sources de ses vidéos voisines', () => {
  for (const [id, dependency] of [['VyOYHeLM-9k', 'catalog:-mTxWSZW6ME'], ['1X3dI1w3qTY', 'catalog:VyOYHeLM-9k'], ['mdqILjZhhw0', 'catalog:By6BUKObbNs']]) {
    const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
    assert.ok(previous.narration.sourceIds.includes(dependency));
    const prepared = prepareRecordForSave(previous, previous, video(id), { scriptReviewed: true, consulted: true, reviewer: 'Éditeur', catalog, now: NOW });
    assert.ok(prepared.narration.sourceIds.includes(dependency));
  }
});

test('retirer une source du script sans relecture bloque sa lecture automatique', () => {
  const id = 'VyOYHeLM-9k'; const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const next = copy(previous); next.narration.sourceIds = [`catalog:${id}`];
  const prepared = prepareRecordForSave(next, previous, video(id), { now: NOW });
  assert.equal(prepared.narration.status, 'draft');
  const draft = emptyDraft(seed.identityId, NOW); draft.records[id] = prepared;
  assert.deepEqual(validateDraft(draft, context), []);
});

test('un ID valide nommé constructor ne récupère pas les propriétés héritées des brouillons', () => {
  const data = copy(catalog); const item = { ...data.videos[0], videoId: 'constructor', thumbnail: 'https://i.ytimg.com/vi/constructor/hqdefault.jpg', link: 'https://www.youtube.com/watch?v=constructor', provenance: data.videos[0].provenance.map(source => ({ ...source, sourceId: 'constructor', url: 'https://www.youtube.com/watch?v=constructor' })) };
  data.videos = [item];
  const result = build(undefined, data);
  assert.equal(result.analysis[0].claims.song.status, 'unknown');
  assert.equal(result.analysis[0].record.selected, false);
});


test('réordonner les citations dans un formulaire ne constitue pas une nouvelle relecture', () => {
  const id = 'mdqILjZhhw0'; const previous = recordFor(video(id), seed, emptyDraft(seed.identityId, NOW));
  const next = copy(previous); next.narration.sourceIds.reverse();
  Object.values(next.claims).forEach(claim => claim.sourceIds.reverse());
  const prepared = prepareRecordForSave(next, previous, video(id), { now: NOW });
  assert.equal(prepared.narration.status, 'reviewed');
  assert.equal(prepared.claims.originalArtist.reviewedAt, previous.claims.originalArtist.reviewedAt);
});


test('changer une vidéo citée dans une transition suspend aussi le récit de sa voisine', () => {
  const changed = copy(catalog); changed.videos.find(item => item.videoId === '-mTxWSZW6ME').title = 'Titre désormais différent';
  const result = build(undefined, changed); const item = result.steps.find(step => step.videoId === 'VyOYHeLM-9k');
  assert.equal(item.narration.playable, false); assert.match(item.narration.reviewReasons.join(' '), /vidéo citée/);
});

test('le brouillon conserve une référence croisée retirée, mais ne la traite plus comme une preuve', () => {
  const id = 'VyOYHeLM-9k'; const draft = draftWith(id, record => { record.selectionReason = 'Ma correction conservée.'; });
  const changed = copy(catalog); changed.videos = changed.videos.filter(video => video.videoId !== '-mTxWSZW6ME');
  assert.deepEqual(validateDraft(draft, { catalog: changed, seed }), []);
  const result = build(draft, changed); const item = result.steps.find(step => step.videoId === id);
  assert.equal(item.record.selectionReason, 'Ma correction conservée.'); assert.equal(item.narration.playable, false);
  assert.throws(() => prepareRecordForSave(draft.records[id], draft.records[id], video(id), { scriptReviewed: true, consulted: true, reviewer: 'Éditeur', catalog: changed, now: NOW }), /indisponible/);
});

test('un ancien script sans empreintes croisées reste importable mais doit être relu', () => {
  const id = 'VyOYHeLM-9k'; const draft = draftWith(id, record => { delete record.narration.catalogBindings; });
  assert.deepEqual(validateDraft(draft, context), []);
  assert.equal(build(draft).steps.find(step => step.videoId === id).narration.playable, false);
});
