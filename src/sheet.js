// Logique pure de la feuille mobile : trois positions d’arrêt et aimantation après un glissement.
export const SNAPS = Object.freeze(['peek', 'half', 'full']);

// Hauteurs en pixels : « peek » = barre de recherche seule, « half » = environ la moitié de l’écran, « full » = presque tout l’écran.
export function snapTargets(viewportHeight, { peek = 120, topInset = 0 } = {}) {
  const full = Math.max(peek, Math.round(viewportHeight - topInset));
  const half = Math.min(full, Math.max(peek, Math.round(viewportHeight * 0.5)));
  return { peek: Math.min(peek, full), half, full };
}

export function clampHeight(height, targets) {
  return Math.min(targets.full, Math.max(targets.peek, height));
}

export function nearestSnap(height, targets) {
  return SNAPS.reduce((best, name) => (
    Math.abs(targets[name] - height) < Math.abs(targets[best] - height) ? name : best
  ), 'peek');
}

// velocity : variation de hauteur en pixels par milliseconde (positive vers le haut).
// La position projetée tient compte de l’élan du geste, pour qu’un glissement rapide change de position.
export function settleSnap(height, velocity, targets, horizon = 160) {
  const projected = clampHeight(height + (Number.isFinite(velocity) ? velocity * horizon : 0), targets);
  return nearestSnap(projected, targets);
}

// Un simple tap sur la poignée bascule entre « half » et « full » ; depuis « peek », il ouvre à « half ».
export function nextSnap(current) {
  if (current === 'full') return 'half';
  return current === 'half' ? 'full' : 'half';
}
