// La règle d’un déplacement, écrite une seule fois et testée sans écran : qu’est-ce qui se passe
// si on pose quelqu’un sur une autre table. Deux choses comptent : on ne sépare pas ce qui est
// solidaire, on ne réunit pas ce qui s’évite. Le module ne rédige aucune phrase — c’est words.js
// qui parle, et le test vérifie qu’ici il n’y a que des identifiants et des chiffres.

import { isBlocking } from './model.js';
import { buildBlocks } from './solver.js';

// Le bloc d’un invité : lui et tous ceux qui doivent bouger avec lui (couple, foyer).
// On réutilise le découpage du solveur, sinon l’interface et le calcul n’auraient pas la même
// idée de « qui ne se quitte pas ».
export function groupOf(graph, guestId) {
  const blocks = buildBlocks(graph);
  const own = blocks.blocks.find(block => block.ids.includes(guestId));
  return { ids: own ? own.ids.slice() : [guestId], blockId: own ? own.id : null, hard: own ? own.ids.length > 1 : false };
}

// Table de destination possible ? On répond en codes, jamais en texte.
export function canSitAt(graph, plan, guestId, tableId, { force = false } = {}) {
  const table = plan.tables.find(item => item.id === tableId);
  if (!table) return { ok: false, code: 'nowhere' };
  const group = groupOf(graph, guestId);
  const at = plan.tables.find(item => item.guests.includes(guestId));
  if (at?.id === tableId) return { ok: false, code: 'already', group };

  const seated = new Map();
  for (const item of plan.tables) for (const id of item.guests) seated.set(id, item.id);

  const blocked = [];
  if (!force) {
    for (const edge of graph.edges.values()) {
      if (!isBlocking(edge)) continue; // une séparation confirmée : c’est la seule chose qui interdit une table
      const movedIn = group.ids.includes(edge.from) ? edge.to : group.ids.includes(edge.to) ? edge.from : null;
      if (!movedIn) continue;
      if (seated.get(movedIn) !== tableId) continue;
      const insideGroup = group.ids.includes(edge.from) && group.ids.includes(edge.to);
      blocked.push({
        guestId: group.ids.includes(edge.from) ? edge.from : edge.to,
        otherId: movedIn,
        relation: edge.kind,
        // Deux personnes d’un même foyer qui se fuient : c’est le moteur qui a déjà posé la
        // question, on ne l’invente pas ici.
        sameBlock: insideGroup,
      });
    }
  }
  if (blocked.filter(item => !item.sameBlock).length) {
    return { ok: false, code: 'apart', blocked: blocked.filter(item => !item.sameBlock), group };
  }

  // Le nombre de personnes une fois le groupe posé là : ce qui reste à la table de départ n’a
  // pas de plafond, seul le départ qui vide une table à zéro mérite un avertissement.
  const after = table.guests.filter(id => !group.ids.includes(id)).length + group.ids.length;
  if (after > plan.capacity) return { ok: false, code: 'over', over: true, need: after, capacity: plan.capacity, group };
  return { ok: true, group, after };
}
