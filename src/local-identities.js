// Identités locales RELIA. Ce sont des fiches sans biographie validée : aucun événement, aucune relation, aucune date.
// Elles seront enrichies uniquement par des sources vérifiées (comptes confirmés par le propriétaire, puis sources).
import { createLocalIdentity } from './identity.js';

export const MATT_MEZ_SAX = createLocalIdentity({
  type: 'person',
  label: 'Matt Mez Sax',
  description: 'Saxophoniste et artiste. Fiche locale : aucune biographie validée.',
  verification: 'unverified',
});

export const LOCAL_IDENTITIES = Object.freeze([MATT_MEZ_SAX]);

export function findLocalIdentity(id) {
  return LOCAL_IDENTITIES.find(record => record.id === id) || null;
}
