// Mode de la barre de recherche unique : aucune personne, une identité explorée, ou une relation entre deux personnes.
export function resolveMode({ a = null, b = null } = {}) {
  if (!a) return 'home';
  return b ? 'relation' : 'identity';
}

// Une seconde personne ne peut être ajoutée qu’à partir d’une personne confirmée (instance humaine).
export function canAddSecond(a) {
  return Boolean(a && a.type === 'person' && !a.placeholder);
}

// Un lien ne se cherche qu’entre deux personnes distinctes.
export function relationReady(a, b) {
  return Boolean(
    a && b && a.id !== b.id &&
    a.type === 'person' && b.type === 'person',
  );
}
