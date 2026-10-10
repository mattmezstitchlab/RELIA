// Couche éditoriale au-dessus du catalogue : aucun tri, aucune date devinée,
// aucun appel réseau et aucune écriture dans les métadonnées YouTube.
import { orderedChronology, validateCatalog } from '../youtube/catalog.js';
import { chronologicalOrder, makeDatedEntry, parseDate } from '../dates.js';
import { createProvenance, isIsoTimestamp, isStale } from '../provenance.js';
import { isVideoId } from '../youtube/client.js';

export const DRAFT_SCHEMA_VERSION = 1;
export const MAX_DRAFT_BYTES = 1_000_000;
export const CLAIM_FIELDS = Object.freeze({
  song: 'Morceau musical',
  originalArtist: 'Artiste de l’œuvre originale',
  versionArtist: 'Interprétation de référence (pas nécessairement l’originale)',
  writers: 'Auteurs / compositeurs crédités',
  classification: 'Reprise ou composition originale',
  theme: 'Sens du morceau · résumé original, sans paroles',
  eventDate: 'Date réelle de l’événement',
  memory: 'Souvenir associé · jamais déduit de la chanson',
});
export const STATUS_LABELS = Object.freeze({ unknown: 'Non documenté', hypothesis: 'À confirmer · hypothèse', confirmed: 'Confirmé · relecture déclarée' });
export const CONFIDENCE_LABELS = Object.freeze({ unknown: 'Non évaluée', low: 'Faible', medium: 'Modérée', high: 'Élevée' });
export const SOURCE_KINDS = Object.freeze({
  catalog: 'Métadonnées YouTube',
  licensed_music: 'Éditeur musical / plateforme autorisée',
  official_artist: 'Source officielle de l’artiste',
  document: 'Document de l’événement',
  personal_memory: 'Souvenir personnel déclaré · non corroboré',
});
export const THEME_TAGS = Object.freeze(['amour', 'séparation', 'transmission', 'liberté', 'espoir', 'mémoire', 'rencontre', 'autonomie', 'distance']);
const MUSIC_SOURCE_KINDS = new Set(['licensed_music', 'official_artist']);
const CREDIT_FIELDS = new Set(['originalArtist', 'versionArtist', 'writers', 'theme']);
const RECORD_KEYS = ['selected', 'selectionReason', 'reviewFingerprint', 'claims', 'narration', 'excerpt', 'themeTags'];
const CLAIM_KEYS = ['value', 'status', 'confidence', 'sourceIds', 'note', 'reviewedBy', 'reviewedAt'];
const SCRIPT_KEYS = ['text', 'transition', 'status', 'sourceIds', 'catalogFingerprint', 'claimBindings', 'catalogBindings'];
const SOURCE_KEYS = ['id', 'kind', 'label', 'url', 'checkedAt', 'access', 'note', 'rights'];
const FINGERPRINT = /^v1:[a-f0-9]{8}$/;
const clone = value => structuredClone(value);
const recordObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const nonempty = value => typeof value === 'string' && Boolean(value.trim());
const boundedString = (value, max) => typeof value === 'string' && value.length <= max;
const isCatalogSourceId = id => typeof id === 'string' && id.startsWith('catalog:') && isVideoId(id.slice(8));
const sameIds = (left, right) => JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
const sameClaim = (left, right) => CLAIM_KEYS.every(key => key === 'sourceIds' ? sameIds(left[key], right[key]) : left[key] === right[key]);

function closedKeys(value, allowed, context, errors) {
  if (!recordObject(value)) { errors.push(`${context} : objet requis.`); return false; }
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${context} : champ interdit « ${key} ».`);
  return true;
}

// URL de citation, jamais une URL avec identifiants ou secrets. Pas de HTML ni d’URL javascript.
export function sourceURL(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return null;
    if ([...url.searchParams.keys()].some(key => /^(?:key|(?:x[-_]?)?api[-_]?key|(?:access[-_]?|refresh[-_]?|oauth[-_]?)?token|(?:client[-_]?)?secret|authorization|password|credentials?|signature|sig)$/i.test(key))) return null;
    return url.href;
  } catch { return null; }
}

// Détecteur de changement, non un mécanisme cryptographique : pas de copie durable du titre
// ou de la publication dans les fichiers éditoriaux / brouillons.
export function catalogFingerprint(video) {
  const value = `${video.videoId}\n${video.title}\n${video.publishedAt}`;
  let hash = 2166136261;
  for (const char of value) { hash ^= char.codePointAt(0); hash = Math.imul(hash, 16777619); }
  return `v1:${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function unknownClaim() {
  return { value: null, status: 'unknown', confidence: 'unknown', sourceIds: [], note: '', reviewedBy: '', reviewedAt: null };
}

export function baseRecord(video) {
  return {
    selected: false,
    selectionReason: '',
    reviewFingerprint: catalogFingerprint(video),
    claims: Object.fromEntries(Object.keys(CLAIM_FIELDS).map(key => [key, unknownClaim()])),
    narration: { text: '', transition: '', status: 'draft', sourceIds: [], catalogFingerprint: catalogFingerprint(video), claimBindings: {}, catalogBindings: {} },
    excerpt: { startSeconds: 0, durationSeconds: 20 },
    themeTags: [],
  };
}

export function emptyDraft(identityId, updatedAt = new Date().toISOString()) {
  return { schemaVersion: DRAFT_SCHEMA_VERSION, identityId, updatedAt, records: {}, sources: [] };
}

export function catalogSource(video, catalog) {
  const provenance = video.provenance[0];
  const channel = catalog.channels.find(item => item.channelId === video.channelId);
  const handle = channel?.url.match(/\/@([^/]+)/)?.[1];
  return {
    id: `catalog:${video.videoId}`, kind: 'catalog',
    label: `YouTube Data API · ${video.title} · ${video.publishedAt.slice(0, 10)} · ${handle ? `@${handle}` : video.channelTitle}`,
    url: video.link, checkedAt: provenance.capturedAt, access: 'api',
    note: 'Titre, publication et durée de la vidéo. Une mention « Cover » atteste une déclaration de reprise, pas les crédits de l’œuvre ni la date du tournage.',
    rights: 'Lecture via le lecteur officiel uniquement. Aucun téléchargement, aucune extraction audio.',
    refreshBy: provenance.refreshBy, fingerprint: catalogFingerprint(video),
  };
}

export function sourcesFor(catalog, seed, draft = null) {
  return [
    ...catalog.videos.map(video => catalogSource(video, catalog)),
    ...clone(seed.sources),
    ...clone(draft?.sources || []),
  ];
}

function validateSource(source, errors) {
  if (!closedKeys(source, SOURCE_KEYS, 'Source', errors)) return;
  if (!nonempty(source.id) || !/^local:[A-Za-z0-9:_-]{1,100}$/.test(source.id)) errors.push('Une source de brouillon doit avoir un identifiant local:… (les sources publiques sont en lecture seule).');
  if (!Object.hasOwn(SOURCE_KINDS, source.kind) || source.kind === 'catalog') errors.push('Type de source de brouillon invalide.');
  if (!nonempty(source.label) || !boundedString(source.label, 250)) errors.push('Libellé de source requis (250 caractères maximum).');
  if (source.kind === 'personal_memory') {
    if (source.url !== null) errors.push('Un souvenir privé ne prétend pas être une source externe.');
  } else if (!sourceURL(source.url)) errors.push('Une source documentaire requiert un lien HTTPS sans identifiants ni secrets.');
  if (!isIsoTimestamp(source.checkedAt)) errors.push('Date de consultation de source invalide.');
  if (source.access !== 'user_declared') errors.push('La consultation d’une source ajoutée est déclarée par l’éditeur, jamais vérifiée automatiquement.');
  if (!nonempty(source.note) || !boundedString(source.note, 600)) errors.push('Préciser ce que la source permet de vérifier (600 caractères maximum).');
  if (!boundedString(source.rights, 300)) errors.push('Mention de droits invalide.');
}

function validateClaim(claim, key, sourceMap, videoId, errors) {
  const label = CLAIM_FIELDS[key];
  if (!closedKeys(claim, CLAIM_KEYS, label, errors)) return;
  if (!Object.hasOwn(STATUS_LABELS, claim.status)) errors.push(`${label} : statut inconnu.`);
  if (!Object.hasOwn(CONFIDENCE_LABELS, claim.confidence)) errors.push(`${label} : confiance inconnue.`);
  const max = key === 'theme' ? 400 : key === 'memory' ? 1200 : 500;
  if (claim.value !== null && (!nonempty(claim.value) || !boundedString(claim.value, max))) errors.push(`${label} : valeur trop longue ou vide (${max} caractères maximum).`);
  if (!boundedString(claim.note, 600) || !boundedString(claim.reviewedBy, 100)) errors.push(`${label} : note ou nom de relecteur invalide.`);
  if (claim.reviewedAt !== null && !isIsoTimestamp(claim.reviewedAt)) errors.push(`${label} : date de relecture invalide.`);
  if (!Array.isArray(claim.sourceIds) || claim.sourceIds.length > 8 || claim.sourceIds.some(id => !nonempty(id))) {
    errors.push(`${label} : références de sources invalides.`);
    return;
  }
  for (const id of claim.sourceIds) if (!sourceMap.has(id) && !isCatalogSourceId(id)) errors.push(`${label} : source inconnue « ${id} ».`);
  if (claim.status === 'unknown') {
    if (claim.value !== null || claim.confidence !== 'unknown' || claim.sourceIds.length) errors.push(`${label} : une information inconnue reste vide, sans attribution.`);
    return;
  }
  if (!nonempty(claim.value)) errors.push(`${label} : valeur requise.`);
  if (claim.confidence === 'unknown') errors.push(`${label} : choisir un degré de confiance.`);
  if (claim.status === 'hypothesis' && claim.confidence === 'high') errors.push(`${label} : une hypothèse ne peut pas avoir une confiance élevée.`);
  if (key === 'classification' && !['cover', 'original'].includes(claim.value)) errors.push('Classification : choisir reprise ou composition originale, ou laisser inconnue.');
  if (key === 'eventDate' && !parseDate(claim.value)) errors.push('Date d’événement : utiliser AAAA, AAAA-MM ou AAAA-MM-JJ (préfixe ~ si documentée comme approximative).');
  if (claim.status !== 'confirmed') return;
  if (!claim.sourceIds.length || !nonempty(claim.note) || !nonempty(claim.reviewedBy) || !isIsoTimestamp(claim.reviewedAt)) errors.push(`${label} : confirmer exige une source, une justification et une relecture datée et nommée.`);
  if (!['medium', 'high'].includes(claim.confidence)) errors.push(`${label} : confiance trop faible pour une confirmation.`);
  // Une référence au catalogue peut survivre dans un brouillon après retrait de la vidéo,
  // mais elle ne sera pas résolue ni utilisée comme preuve au moment de la lecture.
  const sources = claim.sourceIds.map(id => sourceMap.get(id) || (isCatalogSourceId(id) ? { kind: 'catalog' } : null)).filter(Boolean);
  if (CREDIT_FIELDS.has(key) && !sources.some(source => MUSIC_SOURCE_KINDS.has(source.kind))) errors.push(`${label} : une source musicale autorisée est requise ; le titre YouTube seul ne suffit pas.`);
  if (['eventDate', 'memory'].includes(key) && !sources.some(source => source.kind === 'document')) errors.push(`${label} : un document de l’événement est requis ; ni publication, ni paroles, ni souvenir seul ne confirment un événement.`);
  if (key === 'classification' && claim.value === 'original' && !sources.some(source => MUSIC_SOURCE_KINDS.has(source.kind))) errors.push('Une composition originale exige une confirmation par une source musicale, pas « Official Video » dans le titre.');
}

function validateRecord(record, videoId, sourceMap, errors) {
  if (!closedKeys(record, RECORD_KEYS, `Vidéo ${videoId}`, errors)) return;
  if (typeof record.selected !== 'boolean') errors.push('Sélection documentaire invalide.');
  if (!boundedString(record.selectionReason, 600) || (record.selected && !nonempty(record.selectionReason))) errors.push('Une sélection doit être justifiée (600 caractères maximum).');
  if (!FINGERPRINT.test(record.reviewFingerprint || '')) errors.push('Empreinte de relecture invalide.');
  if (closedKeys(record.claims, Object.keys(CLAIM_FIELDS), 'Informations', errors)) {
    for (const key of Object.keys(CLAIM_FIELDS)) validateClaim(record.claims[key], key, sourceMap, videoId, errors);
    if (record.claims.song?.status !== 'confirmed') {
      for (const key of [...CREDIT_FIELDS, 'classification']) if (record.claims[key]?.status === 'confirmed') errors.push(`${CLAIM_FIELDS[key]} : le morceau doit être confirmé d’abord.`);
    }
  }
  if (closedKeys(record.excerpt, ['startSeconds', 'durationSeconds'], 'Extrait', errors)) {
    if (!Number.isInteger(record.excerpt.startSeconds) || record.excerpt.startSeconds < 0 || record.excerpt.startSeconds > 86400) errors.push('Début d’extrait invalide.');
    if (!Number.isInteger(record.excerpt.durationSeconds) || record.excerpt.durationSeconds < 5 || record.excerpt.durationSeconds > 120) errors.push('Durée d’extrait : de 5 à 120 secondes.');
  }
  if (!Array.isArray(record.themeTags) || record.themeTags.length > THEME_TAGS.length || record.themeTags.some(tag => !THEME_TAGS.includes(tag))) errors.push('Thèmes : choisir les catégories prévues.');
  if (record.themeTags?.length && record.claims?.theme?.status !== 'confirmed') errors.push('Les thèmes musicaux ne sont affichés qu’avec un résumé confirmé.');
  const script = record.narration;
  if (!closedKeys(script, SCRIPT_KEYS, 'Script', errors)) return;
  if (!boundedString(script.text, 2500) || !boundedString(script.transition, 1000)) errors.push('Script trop long (2500 caractères ; transition 1000).');
  if (!['draft', 'reviewed'].includes(script.status)) errors.push('Statut du script invalide.');
  if (!FINGERPRINT.test(script.catalogFingerprint || '')) errors.push('Empreinte du script invalide.');
  if (!Array.isArray(script.sourceIds) || script.sourceIds.length > 20 || script.sourceIds.some(id => !sourceMap.has(id) && !isCatalogSourceId(id))) errors.push('Sources du script inconnues.');
  if (script.status === 'reviewed' && (!nonempty(script.text) || !script.sourceIds?.length)) errors.push('Un script relu doit avoir un texte et des sources.');
  if (script.catalogBindings !== undefined) {
    if (!recordObject(script.catalogBindings) || Object.keys(script.catalogBindings).length > 20) errors.push('Empreintes des sources vidéo invalides (20 maximum).');
    else for (const [id, fingerprint] of Object.entries(script.catalogBindings)) {
      if (!isVideoId(id) || !FINGERPRINT.test(fingerprint || '') || !script.sourceIds?.includes(`catalog:${id}`)) errors.push('Une empreinte doit correspondre à une source vidéo citée.');
    }
  }
  if (closedKeys(script.claimBindings, Object.keys(CLAIM_FIELDS), 'Informations citées par le script', errors)) {
    for (const value of Object.values(script.claimBindings)) if (!nonempty(value) || !boundedString(value, 1200)) errors.push('Lien de script invalide.');
  }
}

// Validation transactionnelle, à clés fermées. Les souvenirs de vidéos retirées sont conservés
// dans le brouillon mais jamais joués. Aucun champ title/publishedAt/channel/secret n’est accepté.
export function validateDraft(draft, { catalog, seed } = {}) {
  const errors = [];
  if (!closedKeys(draft, ['schemaVersion', 'identityId', 'updatedAt', 'records', 'sources'], 'Brouillon', errors)) return errors;
  if (draft.schemaVersion !== DRAFT_SCHEMA_VERSION) errors.push('Version de brouillon inconnue.');
  if (draft.identityId !== catalog?.identityId || draft.identityId !== seed?.identityId) errors.push('Le brouillon appartient à une autre identité.');
  if (!isIsoTimestamp(draft.updatedAt)) errors.push('Date du brouillon invalide.');
  const sourceMap = new Map(sourcesFor(catalog, seed).map(source => [source.id, source]));
  if (!Array.isArray(draft.sources) || draft.sources.length > 1000) errors.push('Liste de sources invalide ou trop grande.');
  else for (const source of draft.sources) {
    validateSource(source, errors);
    if (sourceMap.has(source?.id)) errors.push('Une source ne peut pas remplacer une autre source.');
    else sourceMap.set(source?.id, source);
  }
  if (!recordObject(draft.records) || Object.keys(draft.records).length > 1000) errors.push('Liste de corrections invalide ou trop grande.');
  else for (const [id, record] of Object.entries(draft.records)) {
    if (!isVideoId(id)) errors.push(`Identifiant vidéo invalide « ${id} ».`);
    validateRecord(record, id, sourceMap, errors);
  }
  return errors;
}

export function parseDraft(text, context) {
  if (typeof text !== 'string' || new TextEncoder().encode(text).length > MAX_DRAFT_BYTES) throw new Error('Brouillon refusé : limite de 1 Mo.');
  let draft;
  try { draft = JSON.parse(text); } catch { throw new Error('Le fichier n’est pas un JSON valide.'); }
  const errors = validateDraft(draft, context);
  if (errors.length) throw new Error(errors.join('\n'));
  return clone(draft);
}

export function recordFor(video, seed, draft) {
  if (Object.hasOwn(draft?.records || {}, video.videoId)) return clone(draft.records[video.videoId]);
  if (Object.hasOwn(seed.records, video.videoId)) return clone(seed.records[video.videoId]);
  return baseRecord(video);
}

function resolveClaims(record, video, sourceMap, now) {
  const claims = clone(record.claims);
  const warnings = [];
  for (const [key, claim] of Object.entries(claims)) {
    if (claim.status !== 'confirmed') continue;
    const unavailable = claim.sourceIds.some(id => !sourceMap.has(id) || isStale(sourceMap.get(id), now));
    const changedTitle = claim.sourceIds.includes(`catalog:${video.videoId}`) && record.reviewFingerprint !== catalogFingerprint(video);
    if (unavailable || changedTitle) {
      claim.status = 'hypothesis'; claim.confidence = 'low';
      warnings.push(`${CLAIM_FIELDS[key]} : source absente, périmée ou métadonnées modifiées ; confirmation suspendue.`);
    }
  }
  if (claims.song.status !== 'confirmed') {
    for (const key of [...CREDIT_FIELDS, 'classification']) if (claims[key].status === 'confirmed') {
      claims[key].status = 'hypothesis'; claims[key].confidence = 'low';
      warnings.push(`${CLAIM_FIELDS[key]} : dépend d’un morceau à reconfirmer.`);
    }
  }
  return { claims, warnings };
}

export function reviewNarration(record, video, claims, sourceMap, now) {
  const reasons = [];
  const script = record.narration;
  if (script.status !== 'reviewed' || !script.text.trim()) reasons.push('Script en brouillon : relire avant une lecture automatique.');
  if (script.catalogFingerprint !== catalogFingerprint(video)) reasons.push('Le titre ou la publication a changé depuis la relecture du script.');
  if (!script.sourceIds.length || script.sourceIds.some(id => !sourceMap.has(id) || isStale(sourceMap.get(id), now))) reasons.push('Une source du script est absente ou à rafraîchir.');
  for (const id of script.sourceIds.filter(id => isCatalogSourceId(id) && id !== `catalog:${video.videoId}`)) {
    const source = sourceMap.get(id);
    if (source && (!Object.hasOwn(script.catalogBindings || {}, id.slice(8)) || script.catalogBindings[id.slice(8)] !== source.fingerprint)) reasons.push(`Une vidéo citée par le récit ou sa transition (${id.slice(8)}) a changé ou n’a pas été relue : adapter le script.`);
  }
  for (const [key, value] of Object.entries(script.claimBindings)) {
    if (claims[key]?.status !== 'confirmed' || claims[key].value !== value) reasons.push(`${CLAIM_FIELDS[key]} a changé ou n’est plus confirmé : adapter le script.`);
  }
  return { ...clone(script), playable: reasons.length === 0, reviewReasons: reasons };
}

// Une correction du morceau invalide les anciens crédits et thèmes, à moins de les réviser
// explicitement aussi. Le texte libre ne constitue jamais une vérification automatique.
export function prepareRecordForSave(next, previous, video, { reviewer, consulted = false, scriptReviewed = false, catalog = null, now = new Date().toISOString() } = {}) {
  const record = clone(next);
  const changedSong = record.claims.song.value !== previous.claims.song.value;
  const metadataChanged = previous.reviewFingerprint !== catalogFingerprint(video);
  for (const [key, claim] of Object.entries(record.claims)) {
    if (changedSong && [...CREDIT_FIELDS, 'classification'].includes(key) && sameClaim(claim, previous.claims[key]) && claim.status === 'confirmed') {
      claim.status = 'hypothesis'; claim.confidence = 'low';
      claim.note = 'Morceau modifié : attribution à relire.';
    }
    // Un souvenir ou un choix de montage ne redate pas la relecture des faits inchangés.
    // En revanche, aucun fait confirmé ne peut être reconfirmé sur des métadonnées
    // différentes sans une nouvelle attestation explicite.
    if (claim.status === 'confirmed' && (metadataChanged || !sameClaim(claim, previous.claims[key]))) {
      if (!consulted || !nonempty(reviewer)) throw new Error('Indiquez votre nom de relecture et attestez avoir consulté les sources pour confirmer.');
      claim.reviewedBy = reviewer.trim(); claim.reviewedAt = now;
    }
  }
  if (record.claims.theme.status !== 'confirmed') record.themeTags = [];
  record.reviewFingerprint = catalogFingerprint(video);
  const scriptChanged = record.narration.text !== previous.narration.text || record.narration.transition !== previous.narration.transition || !sameIds(record.narration.sourceIds, previous.narration.sourceIds);
  record.narration.catalogBindings = Object.fromEntries(Object.entries(record.narration.catalogBindings || {}).filter(([id]) => record.narration.sourceIds.includes(`catalog:${id}`)));
  if (scriptReviewed) {
    if (!consulted || !nonempty(reviewer)) throw new Error('Relire le script exige une relecture nommée et une attestation de consultation.');
    record.narration.status = 'reviewed';
    record.narration.catalogFingerprint = catalogFingerprint(video);
    record.narration.claimBindings = Object.fromEntries(Object.entries(record.claims).filter(([, claim]) => claim.status === 'confirmed').map(([key, claim]) => [key, claim.value]));
    record.narration.sourceIds = [...new Set([...record.narration.sourceIds, `catalog:${video.videoId}`, ...Object.values(record.claims).filter(claim => claim.status === 'confirmed').flatMap(claim => claim.sourceIds)])];
    record.narration.catalogBindings = Object.fromEntries(record.narration.sourceIds.filter(isCatalogSourceId).map(id => {
      const referenced = id === `catalog:${video.videoId}` ? video : catalog?.videos.find(item => item.videoId === id.slice(8));
      if (!referenced) throw new Error(`Vidéo citée ${id.slice(8)} indisponible : retirer sa référence et adapter le texte, ou attendre le rafraîchissement du catalogue.`);
      return [referenced.videoId, catalogFingerprint(referenced)];
    }));
  } else if (scriptChanged) record.narration.status = 'draft';
  return record;
}

export function excerptFor(video, excerpt) {
  if (!Number.isInteger(video.durationSeconds) || video.durationSeconds <= 0) return { ...excerpt, endSeconds: excerpt.startSeconds + excerpt.durationSeconds, adjusted: false };
  const startSeconds = Math.min(excerpt.startSeconds, Math.max(0, video.durationSeconds - 1));
  const endSeconds = Math.min(video.durationSeconds, startSeconds + excerpt.durationSeconds);
  return { startSeconds, durationSeconds: endSeconds - startSeconds, endSeconds, adjusted: startSeconds !== excerpt.startSeconds || endSeconds - startSeconds !== excerpt.durationSeconds };
}

export function readingSeconds(value) {
  const words = String(value || '').trim().split(/\s+/).filter(Boolean).length;
  return Math.max(3, Math.ceil(words * 60 / 150));
}

// Les chapitres sont des fenêtres éditoriales de la chronologie existante, jamais des étapes
// biographiques déduites. L’ordre de sélection vient uniquement de orderedChronology().
export function buildDocumentary(catalog, seed, draft = emptyDraft(seed.identityId), { now = new Date() } = {}) {
  const catalogErrors = validateCatalog(catalog);
  if (catalogErrors.length) throw new Error(`Catalogue invalide : ${catalogErrors.join(' ')}`);
  if (catalog.identityId !== seed.identityId) throw new Error('Identité du documentaire différente du catalogue.');
  const draftErrors = validateDraft(draft, { catalog, seed });
  if (draftErrors.length) throw new Error(`Brouillon invalide : ${draftErrors.join(' ')}`);
  const sources = sourcesFor(catalog, seed, draft);
  const sourceMap = new Map(sources.map(source => [source.id, source]));
  const warnings = [];
  const analysis = orderedChronology(catalog).rows.map(({ video, entry }) => {
    const record = recordFor(video, seed, draft);
    const resolved = resolveClaims(record, video, sourceMap, now);
    const narration = reviewNarration(record, video, resolved.claims, sourceMap, now);
    const publicationSource = sourceMap.get(`catalog:${video.videoId}`);
    const metadataStatus = isStale(publicationSource, now) ? 'hypothesis' : 'confirmed';
    // Un événement documenté reste une entrée DISTINCTE du contenu, conformément à dates.js.
    const eventClaim = resolved.claims.eventDate;
    const eventEntry = eventClaim.status === 'confirmed' ? makeDatedEntry({
      id: `documentary-event:${video.videoId}`, subjectId: catalog.identityId,
      kind: 'event', title: `Événement associé à la vidéo ${video.videoId}`,
      eventDate: parseDate(eventClaim.value), discoveredAt: eventClaim.reviewedAt,
      provenance: eventClaim.sourceIds.map(id => {
        const source = sourceMap.get(id);
        return createProvenance({ method: 'human_review', url: source.url, sourceId: id, capturedAt: eventClaim.reviewedAt, note: eventClaim.note });
      }),
    }) : null;
    return {
      video, entry, videoId: video.videoId, record,
      title: { value: video.title, status: metadataStatus, confidence: metadataStatus === 'confirmed' ? 'high' : 'low', sourceIds: [publicationSource.id] },
      publication: { value: entry.publishedAt, status: metadataStatus, confidence: metadataStatus === 'confirmed' ? 'high' : 'low', sourceIds: [publicationSource.id] },
      claims: resolved.claims, narration, eventEntry, warnings: resolved.warnings,
      excerpt: excerptFor(video, record.excerpt),
      themeTags: resolved.claims.theme.status === 'confirmed' ? record.themeTags : [],
    };
  });
  const availableIds = new Set(analysis.map(item => item.videoId));
  for (const [id, record] of Object.entries({ ...seed.records, ...draft.records })) if (record.selected && !availableIds.has(id)) warnings.push(`Vidéo ${id} indisponible dans le catalogue : séquence omise, brouillon conservé.`);
  const chapters = seed.chapters.map(chapter => ({ ...clone(chapter), steps: [], archiveCount: 0, missingYears: [] }));
  const steps = [];
  for (const item of analysis) {
    const year = item.entry.publishedAt.year;
    const chapter = chapters.find(candidate => year >= candidate.from && year <= candidate.to);
    if (!chapter) {
      if (item.record.selected) warnings.push(`Vidéo ${item.videoId} hors du périmètre ${seed.from}–${seed.to} : non jouée.`);
      continue;
    }
    chapter.archiveCount += 1;
    if (!item.record.selected) continue;
    const step = { ...item, id: `youtube:${item.videoId}`, chapterId: chapter.id, index: steps.length };
    chapter.steps.push(step);
    steps.push(step);
  }
  for (const chapter of chapters) {
    const years = new Set(analysis.map(item => item.entry.publishedAt.year));
    for (let year = chapter.from; year <= chapter.to; year += 1) if (!years.has(year)) chapter.missingYears.push(year);
  }
  const events = chronologicalOrder(analysis.map(item => item.eventEntry).filter(Boolean), 'event');
  const estimatedSeconds = steps.reduce((sum, step) => sum + readingSeconds(step.narration.text) + step.excerpt.durationSeconds + readingSeconds(step.narration.transition), 0);
  return { identityId: seed.identityId, title: seed.title, from: seed.from, to: seed.to, catalogCount: analysis.length, analysis, chapters, steps, events, sources, warnings, estimatedSeconds };
}
