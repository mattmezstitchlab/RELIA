// Recherche de chaînes dans le graphe des invités : mêmes règles que findRemotePath de RELIA
// (parcours borné, adjacence limitée aux relations exploitables, résultat incomplet signalé
// comme tel). « Aucun chemin » veut dire « aucun chemin dans ce qui a été déclaré », jamais
// « aucune relation entre ces deux personnes ».
import { usable } from './model.js';

export function adjacency(graph, { onlyUsable = true } = {}) {
  const map = new Map();
  for (const node of graph.nodes.keys()) map.set(node, []);
  for (const edge of graph.edges.values()) {
    if (onlyUsable && !usable(edge)) continue;
    if (!map.has(edge.from) || !map.has(edge.to)) continue;
    map.get(edge.from).push({ id: edge.to, edge });
    map.get(edge.to).push({ id: edge.from, edge });
  }
  return map;
}

export function findChain(graph, from, to, { onlyUsable = true, maxDepth = 6 } = {}) {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return { path: null, incomplete: true, bounded: false, reason: 'identité absente du graphe' };
  if (from === to) return { path: null, incomplete: false, bounded: false, reason: 'même invité' };
  const adjacencyMap = adjacency(graph, { onlyUsable });
  const previous = new Map([[from, null]]);
  let frontier = [from];
  let bounded = false;
  for (let depth = 0; depth < maxDepth && frontier.length; depth++) {
    const nextFrontier = [];
    for (const current of frontier) {
      for (const { id: next, edge } of adjacencyMap.get(current) || []) {
        if (previous.has(next)) continue;
        previous.set(next, { parent: current, edge });
        if (next === to) {
          const nodes = [to], edges = [];
          while (previous.get(nodes.at(-1))) {
            const step = previous.get(nodes.at(-1));
            edges.unshift(step.edge);
            nodes.push(step.parent);
          }
          return { path: { nodes: nodes.reverse(), edges }, incomplete: false, bounded: false, reason: null };
        }
        nextFrontier.push(next);
      }
    }
    frontier = nextFrontier;
    if (depth === maxDepth - 1 && frontier.length) bounded = true;
  }
  return { path: null, incomplete: false, bounded, reason: bounded ? `aucun chemin en ${maxDepth} étapes : recherche bornée` : null };
}

export function components(adjacencyMap, ids) {
  const seen = new Set();
  const groups = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const queue = [id], group = [];
    seen.add(id);
    for (let index = 0; index < queue.length; index++) {
      group.push(queue[index]);
      for (const next of adjacencyMap.get(queue[index]) || []) {
        if (seen.has(next.id)) continue;
        seen.add(next.id);
        queue.push(next.id);
      }
    }
    groups.push(group.sort());
  }
  return groups;
}

// Points d’articulation (DFS low-link) : invités sans qui deux groupes se perdent de vue.
// Récursion assumée : le graphe est borné à LIMITS.guests invités, la profondeur reste petite.
export function articulationPoints(adjacencyMap, ids) {
  const wanted = new Set(ids);
  const neighborsOf = id => (adjacencyMap.get(id) || []).filter(neighbor => wanted.has(neighbor.id)).map(neighbor => neighbor.id);
  const order = new Map();
  const low = new Map();
  const found = new Set();
  let tick = 0;
  const run = (id, parent) => {
    order.set(id, tick); low.set(id, tick); tick++;
    let children = 0;
    for (const next of neighborsOf(id)) {
      if (next === parent) continue;
      if (order.has(next)) { low.set(id, Math.min(low.get(id), order.get(next))); continue; }
      children++;
      run(next, id);
      low.set(id, Math.min(low.get(id), low.get(next)));
      if (parent !== null && low.get(next) >= order.get(id)) found.add(id);
    }
    if (parent === null && children > 1) found.add(id);
  };
  for (const id of ids) if (!order.has(id)) run(id, null);
  return [...found].sort();
}

export function degreeOf(adjacencyMap, id) {
  return (adjacencyMap.get(id) || []).length;
}

// Comparaison de deux plans, sur le modèle de discovery.js : un changement doit pouvoir être
// rattaché à une déclaration explicite, sinon il est posé comme question, jamais comme vérité.
export function diffPlans(before, after) {
  if (!before || !after) return null;
  const tableOf = plan => {
    const map = new Map();
    for (const table of plan.tables) for (const seat of table.seats) map.set(seat.guestId, table.id);
    return map;
  };
  const previous = tableOf(before), current = tableOf(after);
  const moved = [];
  for (const [guestId, table] of current) {
    const was = previous.get(guestId);
    if (!was) moved.push({ guestId, added: true, to: table });
    else if (was !== table) moved.push({ guestId, from: was, to: table });
  }
  for (const [guestId, table] of previous) if (!current.has(guestId)) moved.push({ guestId, removed: true, from: table });
  const declared = new Set((after.declaredMoves || []).map(move => `${move.guestId}:${move.to}`));
  const explained = moved.filter(move => !move.added && !move.removed && declared.has(`${move.guestId}:${move.to}`));
  const unexplained = moved.filter(move => !explained.includes(move));
  return {
    moved,
    explained: explained.map(move => ({ ...move, note: 'déplacement demandé et tracé' })),
    unexplained: unexplained.map(move => ({
      ...move,
      question: move.added ? 'Invité ajouté depuis la dernière version : côté et contraintes à déclarer.'
        : move.removed ? 'Invité retiré depuis la dernière version : vérifier avec les mariés.'
          : 'Table modifiée sans déclaration : la raison est à demander, pas à deviner.',
    })),
    tablesBefore: before.tables.length,
    tablesAfter: after.tables.length,
  };
}
