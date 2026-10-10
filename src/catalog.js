// Chargement des catalogues YouTube synchronisés (src/data/youtube/*.json).
// Ces fichiers sont écrits par tools/sync-youtube.mjs depuis un environnement autorisé :
// ils ne contiennent que des métadonnées publiques — jamais la clé API, qui ne quitte jamais
// le processus de synchronisation. Un catalogue invalide est ignoré, jamais chargé à moitié.
import { validateCatalog, orderedChronology } from './youtube/catalog.js';

const files = import.meta.glob('./data/youtube/*.json', { eager: true, import: 'default' });

const catalogs = [];
for (const [path, raw] of Object.entries(files)) {
  const errors = validateCatalog(raw);
  if (errors.length) {
    console.warn(`RELIA · catalogue YouTube ignoré (${path}) : ${errors.join(' ')}`);
    continue;
  }
  catalogs.push(Object.freeze(structuredClone(raw)));
}

// Catalogue rattaché à une identité locale (rattachement déclaré par le propriétaire).
export function catalogFor(identityId) {
  return catalogs.find(catalog => catalog.identityId === identityId) || null;
}

export function channelsOf(catalog) {
  return catalog?.channels ?? [];
}

// Chronologie ascendante des vidéos : plus ancienne publication → plus récente.
// Le tri vient du moteur existant (chronologicalOrder, axe « publication »).
export function chronologyRows(catalog) {
  return catalog ? orderedChronology(catalog).rows : [];
}
