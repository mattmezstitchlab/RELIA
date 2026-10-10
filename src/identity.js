// Identités RELIA : une identité est soit un QID Wikidata réel, soit un identifiant local « relia:… ».
// Un identifiant local n’imite jamais un QID, ne porte jamais de QID et n’est jamais exporté automatiquement vers Wikidata.
import { isQID } from './data.js';

export const LOCAL_PREFIX = 'relia:';
export const IDENTITY_TYPES = Object.freeze(['person', 'work', 'place', 'institution', 'event']);
// Niveaux de vérification d’une identité locale. Homonyme et « sans correspondance » concernent les candidats (étape suivante).
export const VERIFICATION_LEVELS = Object.freeze(['unverified', 'probable', 'registry_referenced', 'owner_confirmed']);
export const AUTOMATIC_WIKIDATA_EXPORT = false;

const LOCAL_ID = /^relia:(person|work|place|institution|event):([a-z0-9]+(?:-[a-z0-9]+)*)$/;

export function isLocalId(id) {
  return typeof id === 'string' && LOCAL_ID.test(id);
}

export function identityKind(id) {
  if (isQID(id)) return 'wikidata';
  if (isLocalId(id)) return 'local';
  return null;
}

// Minuscules, sans accents, séparateurs en tirets. Un nom ne fournit qu’un identifiant de travail, pas une identité prouvée.
export function slugify(value) {
  return String(value ?? '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function localIdFor(type, slug) {
  const id = `${LOCAL_PREFIX}${type}:${slug}`;
  if (!isLocalId(id)) throw new Error(`Identifiant local invalide : ${id}`);
  return id;
}

export function validateIdentity(record) {
  if (!record || typeof record !== 'object') return ['Identité absente.'];
  const errors = [];
  if (!IDENTITY_TYPES.includes(record.type)) errors.push('Type d’identité inconnu.');
  if (typeof record.label !== 'string' || !record.label.trim()) errors.push('Libellé requis.');
  if (record.kind === 'wikidata') {
    if (!isQID(record.id)) errors.push('Identifiant Wikidata invalide.');
    if (record.verification !== undefined && !VERIFICATION_LEVELS.includes(record.verification)) errors.push('Niveau de vérification inconnu.');
  } else if (record.kind === 'local') {
    if (!isLocalId(record.id)) {
      errors.push('Identifiant local invalide.');
    } else if (record.id.split(':')[1] !== record.type) {
      errors.push('Le type de l’identifiant local ne correspond pas au type déclaré.');
    }
    if (record.wikidataId != null) errors.push('Une identité locale ne porte jamais de QID Wikidata.');
    if (!VERIFICATION_LEVELS.includes(record.verification)) errors.push('Niveau de vérification inconnu.');
  } else {
    errors.push('Origine d’identité inconnue.');
  }
  return errors;
}

export function createLocalIdentity({ type, label, slug, description = '', aliases = [], verification = 'unverified' } = {}) {
  const cleanLabel = typeof label === 'string' ? label.trim() : '';
  if (!cleanLabel) throw new Error('Libellé requis.');
  const id = localIdFor(type, slug ?? slugify(cleanLabel));
  const cleanAliases = [...new Set((aliases || []).map(alias => String(alias).trim()).filter(alias => alias && alias !== cleanLabel))];
  const record = {
    id,
    kind: 'local',
    type,
    label: cleanLabel,
    description: String(description ?? '').trim(),
    aliases: cleanAliases,
    verification,
  };
  const errors = validateIdentity(record);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.freeze({ ...record, aliases: Object.freeze(cleanAliases) });
}

// Deux identités sont la même seulement si leur identifiant est le même. Un libellé identique ne suffit jamais.
export function sameIdentity(a, b) {
  return Boolean(a && b && a.id === b.id);
}

// Identifiants présents plus d’une fois : signale une collision à résoudre explicitement (aucune fusion automatique).
export function findDuplicateIds(records) {
  const seen = new Set(), duplicates = new Set();
  for (const record of records) {
    if (seen.has(record.id)) duplicates.add(record.id);
    seen.add(record.id);
  }
  return [...duplicates];
}
