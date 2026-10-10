// Dates documentées de RELIA.
// Trois axes restent distincts : date de l’événement, date de publication d’un média, date de découverte par RELIA.
// Une date porte sa précision et son incertitude. Une date absente reste absente : elle n’est jamais devinée.
import { isIsoTimestamp, validateProvenance } from './provenance.js';

export const PRECISIONS = Object.freeze(['day', 'month', 'year', 'decade', 'century']);
export const ENTRY_KINDS = Object.freeze(['life', 'relation', 'event', 'content']);
export const AXES = Object.freeze(['event', 'publication']);

const MONTHS = Object.freeze(['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre']);
const ISO_DATE = /^(~)?([+-]?\d{1,4})(?:-(\d{2})(?:-(\d{2}))?)?$/;
// Précisions Wikidata (propriété « precision » d’une valeur temporelle). Les précisions plus grossières sont refusées.
const WIKIDATA_PRECISION = Object.freeze({ 11: 'day', 10: 'month', 9: 'year', 8: 'decade', 7: 'century' });

function isLeap(year) {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function daysIn(year, month) {
  return [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
}

// Construit une date validée. Années astronomiques : 0 et négatives désignent les années avant J.-C.
export function makeDate({ year, month = null, day = null, precision, approximate = false } = {}) {
  const resolved = precision ?? (day != null ? 'day' : month != null ? 'month' : 'year');
  if (!Number.isInteger(year) || Math.abs(year) > 9999) throw new RangeError('Année invalide.');
  if (!PRECISIONS.includes(resolved)) throw new RangeError('Précision de date inconnue.');
  const keepMonth = resolved === 'day' || resolved === 'month';
  const keepDay = resolved === 'day';
  if (keepMonth && !(Number.isInteger(month) && month >= 1 && month <= 12)) throw new RangeError('Mois invalide.');
  if (keepDay && !(Number.isInteger(day) && day >= 1 && day <= daysIn(year, month))) throw new RangeError('Jour invalide.');
  if (resolved === 'decade' && year % 10 !== 0) throw new RangeError('Une décennie commence sur une année multiple de 10.');
  if (resolved === 'century' && year % 100 !== 0) throw new RangeError('Un siècle commence sur une année multiple de 100.');
  return Object.freeze({
    year,
    month: keepMonth ? month : null,
    day: keepDay ? day : null,
    precision: resolved,
    approximate: Boolean(approximate),
  });
}

// Formats acceptés : AAAA, AAAA-MM, AAAA-MM-JJ, précédés éventuellement de « ~ » pour une date approximative.
export function parseDate(value) {
  const match = ISO_DATE.exec(String(value ?? '').trim());
  if (!match) return null;
  const [, tilde, year, month, day] = match;
  try {
    return makeDate({
      year: Number(year),
      month: month == null ? null : Number(month),
      day: day == null ? null : Number(day),
      approximate: Boolean(tilde),
    });
  } catch {
    return null;
  }
}

// Valeur temporelle Wikidata ({ time, precision }) vers notre modèle. Précision non prise en charge : null (« inconnue »).
export function dateFromWikidataTime(value) {
  const precision = WIKIDATA_PRECISION[value?.precision];
  const match = /^([+-]\d+)-(\d{2})-(\d{2})T/.exec(value?.time || '');
  if (!precision || !match) return null;
  try {
    return makeDate({
      year: Number(match[1]),
      month: precision === 'day' || precision === 'month' ? Number(match[2]) : null,
      day: precision === 'day' ? Number(match[3]) : null,
      precision,
    });
  } catch {
    return null;
  }
}

export function dateFromISO(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T/.exec(String(iso ?? ''));
  if (!match || !isIsoTimestamp(iso)) return null;
  return parseDate(`${match[1]}-${match[2]}-${match[3]}`);
}

export function isDate(value) {
  if (!value || typeof value !== 'object' || !PRECISIONS.includes(value.precision)) return false;
  try {
    makeDate(value);
    return true;
  } catch {
    return false;
  }
}

function yearLabel(year) {
  return year <= 0 ? `${1 - year} av. J.-C.` : String(year);
}

function roman(number) {
  const table = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let rest = number, out = '';
  for (const [value, symbol] of table) while (rest >= value) { out += symbol; rest -= value; }
  return out;
}

function centuryLabel(year) {
  if (year <= 0) return `siècle de ${yearLabel(year)}`;
  // Convention : une valeur de siècle à 1800 désigne le XIXe siècle (1800-1899), comme dans Wikidata.
  const index = Math.floor(year / 100) + 1;
  return `${index === 1 ? 'Ier' : `${roman(index)}e`} siècle`;
}

function body(date) {
  switch (date.precision) {
    case 'day': return `${date.day} ${MONTHS[date.month - 1]} ${yearLabel(date.year)}`;
    case 'month': return `${MONTHS[date.month - 1]} ${yearLabel(date.year)}`;
    case 'year': return yearLabel(date.year);
    case 'decade': return `années ${yearLabel(date.year)}`;
    case 'century': return centuryLabel(date.year);
    default: return 'Date inconnue';
  }
}

export function formatDate(date) {
  if (!date) return 'Date inconnue';
  const text = body(date);
  return date.approximate ? `vers ${text}` : text;
}

// Clé de tri croissante. Une date approximative se trie sur sa valeur documentée ; son incertitude ne change pas l’ordre.
export function dateSortKey(date) {
  if (!date) return null;
  return date.year * 10000 + (date.month ?? 0) * 100 + (date.day ?? 0);
}

function nonEmpty(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

// Une entrée datée. « content » = média publié : il porte une date de publication, jamais une date d’événement.
export function validateDatedEntry(entry) {
  if (!entry || typeof entry !== 'object') return ['Entrée absente.'];
  const errors = [];
  if (!nonEmpty(entry.id)) errors.push('Identifiant requis.');
  if (!nonEmpty(entry.subjectId)) errors.push('Sujet requis.');
  if (!nonEmpty(entry.title)) errors.push('Titre requis.');
  if (!ENTRY_KINDS.includes(entry.kind)) errors.push('Type d’entrée inconnu.');
  const eventDate = entry.eventDate ?? null;
  const publishedAt = entry.publishedAt ?? null;
  if (eventDate !== null && !isDate(eventDate)) errors.push('Date de l’événement invalide.');
  if (publishedAt !== null && !isDate(publishedAt)) errors.push('Date de publication invalide.');
  if (!isIsoTimestamp(entry.discoveredAt)) errors.push('Date de découverte par RELIA requise (horodatage ISO).');
  if (entry.kind === 'content') {
    if (publishedAt === null) errors.push('Un contenu doit avoir une date de publication.');
    if (eventDate !== null) errors.push('Un contenu publié ne porte pas de date d’événement : un événement documenté est une entrée distincte.');
  } else if (publishedAt !== null) {
    errors.push('Seul un contenu porte une date de publication.');
  }
  if (!Array.isArray(entry.provenance) || entry.provenance.length === 0) {
    errors.push('Provenance requise.');
  } else {
    for (const provenance of entry.provenance) errors.push(...validateProvenance(provenance));
  }
  return errors;
}

export function makeDatedEntry({ id, subjectId, kind, title, eventDate = null, publishedAt = null, discoveredAt, provenance = [] } = {}) {
  const entry = {
    id, subjectId, kind, title,
    eventDate: eventDate ?? null,
    publishedAt: publishedAt ?? null,
    discoveredAt,
    provenance: [...(provenance || [])],
  };
  const errors = validateDatedEntry(entry);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.freeze(entry);
}

// Libellés explicites pour l’interface : chaque date est nommée selon son axe.
export function datesOf(entry) {
  const rows = [];
  if (entry.kind !== 'content') {
    rows.push({ role: 'event', label: 'Date de l’événement', display: formatDate(entry.eventDate), undated: !entry.eventDate });
  }
  if (entry.publishedAt) {
    rows.push({ role: 'publication', label: 'Publié le', display: formatDate(entry.publishedAt), undated: false });
  }
  rows.push({ role: 'discovery', label: 'Découvert par RELIA le', display: formatDate(dateFromISO(entry.discoveredAt)), undated: false });
  return rows;
}

// Tri chronologique ascendant sur l’axe demandé. Les entrées sans date sur cet axe sont séparées, jamais placées au hasard.
// Les égalités se départagent par identifiant : le résultat est déterministe.
export function chronologicalOrder(entries, axis = 'event') {
  if (!AXES.includes(axis)) throw new RangeError('Axe chronologique inconnu.');
  const keyOf = entry => dateSortKey(axis === 'event' ? entry.eventDate : entry.publishedAt);
  const compareIds = (a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const dated = [], undated = [];
  for (const entry of entries) {
    const key = keyOf(entry);
    if (key === null) undated.push(entry);
    else dated.push({ entry, key });
  }
  dated.sort((a, b) => a.key - b.key || compareIds(a.entry, b.entry));
  undated.sort(compareIds);
  return { dated: dated.map(item => item.entry), undated };
}
