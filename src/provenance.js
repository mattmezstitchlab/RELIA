// Provenance : chaque information garde sa source, sa méthode d’obtention et sa date de capture.
// Une métadonnée externe porte une échéance de rafraîchissement : aucune copie n’est conservée indéfiniment.

export const PROVENANCE_METHODS = Object.freeze(['wikidata_claim', 'youtube_api', 'owner_declared', 'human_review', 'local_record']);
const EXTERNAL_METHODS = new Set(['wikidata_claim', 'youtube_api']);
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:\d{2})$/;

export function isIsoTimestamp(value) {
  return typeof value === 'string' && ISO_TIMESTAMP.test(value) && Number.isFinite(Date.parse(value));
}

export function safeHttpUrl(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

export function validateProvenance(provenance) {
  if (!provenance || typeof provenance !== 'object') return ['Provenance absente.'];
  const errors = [];
  if (!PROVENANCE_METHODS.includes(provenance.method)) errors.push('Méthode de provenance inconnue.');
  if (!isIsoTimestamp(provenance.capturedAt)) errors.push('Date de capture requise (horodatage ISO).');
  if (provenance.sourceId != null && !(typeof provenance.sourceId === 'string' && provenance.sourceId.trim())) {
    errors.push('Identifiant de source invalide.');
  }
  if (provenance.url != null && !safeHttpUrl(provenance.url)) errors.push('URL de source invalide ou non sûre.');
  if (provenance.refreshBy != null) {
    if (!isIsoTimestamp(provenance.refreshBy)) errors.push('Échéance de rafraîchissement invalide.');
    else if (isIsoTimestamp(provenance.capturedAt) && Date.parse(provenance.refreshBy) < Date.parse(provenance.capturedAt)) {
      errors.push('Échéance de rafraîchissement antérieure à la capture.');
    }
  }
  if (EXTERNAL_METHODS.has(provenance.method) && !provenance.url && !provenance.sourceId) {
    errors.push('Une source externe doit avoir un identifiant ou une URL.');
  }
  if (provenance.method === 'youtube_api' && provenance.refreshBy == null) {
    errors.push('Les métadonnées YouTube doivent avoir une échéance de rafraîchissement.');
  }
  if (provenance.method === 'local_record' && (provenance.url != null || provenance.sourceId != null)) {
    errors.push('Une saisie locale ne référence aucune source externe.');
  }
  return errors;
}

export function createProvenance({ method, sourceId = null, url = null, capturedAt, refreshBy = null, note = '' } = {}) {
  const record = { method, sourceId, url, capturedAt, refreshBy, note };
  const errors = validateProvenance(record);
  if (errors.length) throw new Error(errors.join(' '));
  return Object.freeze({ ...record });
}

// Vrai lorsque l’échéance de rafraîchissement est dépassée : la donnée doit être revérifiée ou retirée.
export function isStale(provenance, now = new Date()) {
  return Boolean(provenance?.refreshBy) && Date.parse(provenance.refreshBy) <= now.getTime();
}
