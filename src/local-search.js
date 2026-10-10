// Recherche locale : retrouve une fiche locale RELIA par libellé ou alias exacts.
// Cela sert uniquement à ouvrir la fiche : le rattachement des vidéos reste strictement
// fondé sur la chaîne déclarée par le propriétaire, jamais sur une correspondance de nom.
import { LOCAL_IDENTITIES } from './local-identities.js';

export const VERIFICATION_LABELS = Object.freeze({
  unverified: 'Fiche locale · non vérifiée',
  probable: 'Fiche locale · probable',
  registry_referenced: 'Fiche locale · référencée',
  owner_confirmed: 'Fiche locale · confirmée par le propriétaire',
});

function fold(value) {
  return String(value ?? '')
    .replace(/œ/gi, 'oe').replace(/æ/gi, 'ae')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().trim();
}

// Correspondance stricte : égalité, préfixe, ou inclusion entière du terme. Score 0 = exact.
export function matchLocalIdentities(term, { limit = 3 } = {}) {
  const query = fold(term);
  if (query.length < 2) return [];
  const scored = [];
  for (const identity of LOCAL_IDENTITIES) {
    const label = fold(identity.label);
    const aliases = (identity.aliases || []).map(fold);
    let score = null;
    if (label === query || aliases.includes(query)) score = 0;
    else if (label.startsWith(query) || aliases.some(alias => alias.startsWith(query))) score = 1;
    else if (label.includes(query) || aliases.some(alias => alias.includes(query))) score = 2;
    if (score !== null) scored.push({ score, identity });
  }
  scored.sort((a, b) => a.score - b.score || a.identity.label.localeCompare(b.identity.label, 'fr'));
  return scored.slice(0, limit).map(({ identity }) => ({
    id: identity.id,
    label: identity.label,
    description: identity.description,
    type: identity.type,
    local: true,
    verification: identity.verification,
  }));
}

export function verificationLabel(identity) {
  return VERIFICATION_LABELS[identity?.verification] || VERIFICATION_LABELS.unverified;
}
