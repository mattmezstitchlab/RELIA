// Résolution du plan de table. Deux règles héritées de RELIA :
// 1. une contrainte n’existe que si elle est exploitable (voir model.js) ;
// 2. ce que le moteur déduit est étiqueté comme déduit, avec la chaîne qui le prouve,
//    et ce qu’il n’a pas pu vérifier est posé comme question, jamais comme réponse.
import { RELATIONS, usable, bindsTogether, isBlocking, sourceLabel, EVIDENCE_LABELS } from './model.js';
import { adjacency, articulationPoints, components, findChain, degreeOf } from './proof.js';

const TABLE_LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const HARD_PENALTY = 1e6;
const PIN_PENALTY = 1e5;

function pairKey(a, b) { return [a, b].sort().join('¦'); }

// Les prestataires ne se répartissent pas entre les tables sociales : ils ont leur propre
// table, déclarée comme telle. Le solveur travaille donc sur le sous-graphe des invités.
export function guestSubgraph(graph) {
  const service = [...graph.nodes.keys()].filter(id => graph.nodes.get(id).service);
  const active = new Set([...graph.nodes.keys()].filter(id => !graph.nodes.get(id).service));
  const nodes = new Map([...graph.nodes].filter(([id]) => active.has(id)));
  const edges = new Map([...graph.edges].filter(([, edge]) => active.has(edge.from) && active.has(edge.to)));
  return { graph: { ...graph, nodes, edges }, service, serviceCount: service.length };
}

export function buildBlocks(graph) {
  const parentOf = new Map([...graph.nodes.keys()].map(id => [id, id]));
  const find = id => {
    let root = id;
    while (parentOf.get(root) !== root) root = parentOf.get(root);
    while (parentOf.get(id) !== root) { const next = parentOf.get(id); parentOf.set(id, root); id = next; }
    return root;
  };
  const union = (a, b) => {
    const ra = find(a), rb = find(b);
    if (ra !== rb) parentOf.set(rb, ra);
  };
  for (const edge of graph.edges.values()) if (bindsTogether(edge)) union(edge.from, edge.to);
  const members = new Map();
  for (const id of graph.nodes.keys()) {
    const root = find(id);
    if (!members.has(root)) members.set(root, []);
    members.get(root).push(id);
  }
  const blocks = [...members.entries()]
    .map(([id, ids]) => ({ id, ids: ids.sort(), pinnedTable: null }))
    .sort((a, b) => a.id.localeCompare(b.id));
  return { find, blocks, byID: new Map(blocks.map(block => [block.id, block])) };
}

// Contraintes entre blocs : ce qui doit rester ensemble, ce qui doit être séparé, et ce qui se contredit.
function blockRelations(graph, blocks) {
  const apart = new Map();
  const together = new Map();
  const contradictions = [];
  for (const edge of graph.edges.values()) {
    if (!usable(edge)) continue;
    const definition = RELATIONS[edge.kind];
    const left = blocks.find(edge.from), right = blocks.find(edge.to);
    if (definition.effect === 'apart') {
      if (left === right) {
        contradictions.push({
          edgeId: edge.id, kind: edge.kind, pairIds: [edge.from, edge.to],
          pair: `${graph.nodes.get(edge.from).label} · ${graph.nodes.get(edge.to).label}`,
          block: left,
          explanation: `${graph.nodes.get(edge.from).label} et ${graph.nodes.get(edge.to).label} sont solidaires d’une même contrainte de regroupement (couple ou foyer) et déclarés incompatibles.`,
          toAsk: 'Les deux ne peuvent pas être vrais. À trancher avec les mariés avant impression : le plan ne peut pas arbitrer une déclaration contre elle-même.',
          evidence: EVIDENCE_LABELS[edge.evidence],
          source: edge.declaredBy ? sourceLabel(graph.sources, edge.declaredBy) : null,
        });
        continue;
      }
      const key = pairKey(left, right);
      const entry = apart.get(key) || { key, blocks: [left, right].sort(), edges: [] };
      entry.edges.push(edge);
      apart.set(key, entry);
      continue;
    }
    if (definition.effect === 'together' || definition.effect === 'prefer' || definition.effect === 'avoid') {
      if (left === right) continue;
      const key = pairKey(left, right);
      const entry = together.get(key) || { key, blocks: [left, right].sort(), weight: 0, penalty: 0, edges: [] };
      if (definition.effect === 'avoid') entry.penalty += definition.weight;
      else entry.weight += definition.weight;
      entry.edges.push(edge);
      together.set(key, entry);
    }
  }
  return { apart, together, contradictions };
}

// Coût unique et déterministe : plus il est bas, meilleur est le plan.
function costOf(placement, context) {
  const { graph, blocks, apart, together, targetSize, tableIDs } = context;
  let cost = 0;
  const byTable = new Map(tableIDs.map(id => [id, []]));
  for (const block of blocks) {
    const table = placement.get(block.id);
    if (!table) continue;
    for (const guestId of block.ids) byTable.get(table).push(guestId);
    for (const guestId of block.ids) {
      const pinned = graph.nodes.get(guestId).pinnedTable;
      if (pinned && pinned !== table) cost += PIN_PENALTY;
    }
  }
  for (const entry of apart.values()) {
    const left = placement.get(entry.blocks[0]), right = placement.get(entry.blocks[1]);
    if (left && left === right) cost += HARD_PENALTY;
  }
  for (const entry of together.values()) {
    const left = placement.get(entry.blocks[0]), right = placement.get(entry.blocks[1]);
    if (!left || !right) continue;
    if (left === right) cost += entry.penalty;
    else cost += entry.weight * 1.4;
  }
  for (const id of tableIDs) {
    const guests = byTable.get(id);
    const spread = guests.length - targetSize;
    cost += spread * spread * 3;
    // Une table a un nombre de chaises, pas une suggestion : au-delà, c’est une infraction
    // pesée avec le même sérieux qu’une séparation obligatoire.
    const overflow = Math.max(0, guests.length - context.capacity);
    if (overflow) cost += overflow * overflow * 4000;
    let bride = 0, groom = 0;
    for (const guestId of guests) {
      const side = graph.nodes.get(guestId).side;
      if (side === 'mariee') bride++;
      else if (side === 'marie') groom++;
    }
    if (bride && groom) cost += Math.abs(bride - groom) * 4;
    for (const guestId of guests) {
      const neighbors = context.adjacency.get(guestId) || [];
      if (!neighbors.length) { cost += 6; continue; }
      const known = neighbors.filter(neighbor => guests.includes(neighbor.id)).length;
      if (!known) cost += 5;
    }
  }
  return { cost, byTable };
}

function apartDegree(apart, blockID) {
  let count = 0;
  for (const entry of apart.values()) if (entry.blocks.includes(blockID)) count++;
  return count;
}

function adjacencyWithout(adjacencyMap, removed) {
  const map = new Map();
  for (const [id, list] of adjacencyMap) {
    if (id === removed) continue;
    map.set(id, list.filter(neighbor => neighbor.id !== removed));
  }
  return map;
}

function reasonsFor(graph, guestId, seats, adjacencyMap) {
  const reasons = [];
  const myTable = seats.get(guestId);
  for (const edge of graph.edges.values()) {
    if (edge.from !== guestId && edge.to !== guestId) continue;
    if (!usable(edge)) continue;
    const other = edge.from === guestId ? edge.to : edge.from;
    const otherTable = seats.get(other);
    const label = graph.nodes.get(other).label;
    const definition = RELATIONS[edge.kind];
    const sourced = edge.sourceIds.length ? 'sourcé' : 'non sourcé';
    const shape = { otherId: other, relation: edge.kind, sameTable: otherTable === myTable };
    if (definition.effect === 'together' && otherTable === myTable) reasons.push({ ...shape, tone: 'ok', kind: 'together', text: `à la même table que ${label} (${definition.label})` });
    if (definition.effect === 'together' && otherTable !== myTable) reasons.push({ ...shape, tone: 'warn', kind: 'together', text: `séparé de ${label} (${definition.label}) : une séparation obligatoire passait avant` });
    if (definition.effect === 'prefer' && otherTable === myTable) reasons.push({ ...shape, tone: 'ok', kind: 'prefer', text: `à côté de ${label} (affinité)` });
    if (definition.effect === 'apart' && otherTable !== myTable) reasons.push({ ...shape, tone: 'ok', kind: 'apart', text: `séparé de ${label} (${definition.label} · ${sourced})` });
    if (definition.effect === 'avoid' && otherTable === myTable) reasons.push({ ...shape, tone: 'warn', kind: 'avoid', text: `côtoie ${label} (tension surveillée) : acceptable, à observer` });
  }
  if (!degreeOf(adjacencyMap, guestId)) reasons.push({ tone: 'ask', kind: 'alone', text: 'aucune attache déclarée : à présenter en début de soirée' });
  return reasons;
}

export function solvePlan(input, { tables = null, targetSize = 8, iterations = 900, pins = new Map() } = {}) {
  const { graph, service, serviceCount } = guestSubgraph(input);
  const guestIDs = [...graph.nodes.keys()];
  const limitations = [];
  const blocks = buildBlocks(graph);
  const { apart, together, contradictions } = blockRelations(graph, blocks);
  const adjacencyMap = adjacency(graph, { onlyUsable: true });

  for (const block of blocks.blocks) {
    for (const id of block.ids) {
      const pinned = pins.get(id) || graph.nodes.get(id).pinnedTable;
      if (pinned) block.pinnedTable = pinned.toUpperCase().slice(0, 1);
    }
  }

  const wantedTables = tables || Math.max(2, Math.ceil(guestIDs.length / Math.max(4, targetSize)));
  const pinnedIndex = blocks.blocks.reduce((max, block) => (block.pinnedTable ? Math.max(max, TABLE_LETTERS.indexOf(block.pinnedTable) + 1) : max), 0);
  const spread = Math.max(1, Math.round(wantedTables / 3));
  const tableIDs = Array.from({ length: Math.min(26, Math.max(wantedTables, Math.min(wantedTables + spread, pinnedIndex))) }, (_, index) => TABLE_LETTERS[index]);
  for (const block of blocks.blocks) {
    if (block.pinnedTable && !tableIDs.includes(block.pinnedTable)) {
      limitations.push(`Table « ${block.pinnedTable} » demandée pour ${graph.nodes.get(block.ids[0]).label} hors portée : contrainte de fixation ignorée.`);
      block.pinnedTable = null;
    }
  }

  const capacity = Math.max(2, tables ? targetSize : targetSize);
  const context = { graph, blocks: blocks.blocks, apart, together, targetSize, capacity, tableIDs, adjacency: adjacencyMap };
  const declaredApart = new Set();
  for (const edge of input.edges.values()) if (isBlocking(edge)) declaredApart.add(pairKey(edge.from, edge.to));

  const sizeOf = new Map(tableIDs.map(id => [id, 0]));
  const placement = new Map();
  const ordered = [...blocks.blocks].sort((a, b) =>
    (apartDegree(apart, b.id) - apartDegree(apart, a.id)) || (b.ids.length - a.ids.length) || a.id.localeCompare(b.id));

  for (const block of ordered) {
    const candidates = block.pinnedTable ? [block.pinnedTable] : tableIDs;
    let best = null;
    for (const table of candidates) {
      placement.set(block.id, table);
      const value = costOf(placement, context).cost + (sizeOf.get(table) || 0) * 0.5;
      if (!best || value < best.value) best = { table, value };
      placement.delete(block.id);
    }
    placement.set(block.id, best.table);
    sizeOf.set(best.table, (sizeOf.get(best.table) || 0) + block.ids.length);
  }

  // Ascension de colline déterministe : déplacement d’un bloc, puis échange de deux blocs.
  let iterationsUsed = 0, improved = true;
  while (improved && iterationsUsed < iterations) {
    improved = false;
    for (const block of ordered) {
      if (iterationsUsed >= iterations) break;
      if (block.pinnedTable) continue;
      const start = placement.get(block.id);
      let best = { table: start, value: costOf(placement, context).cost };
      for (const table of tableIDs) {
        if (table === start) continue;
        placement.set(block.id, table);
        const value = costOf(placement, context).cost;
        if (value < best.value - 1e-9) best = { table, value };
        else placement.set(block.id, start);
      }
      if (best.table !== start) { placement.set(block.id, best.table); improved = true; }
      iterationsUsed++;
      for (const other of ordered) {
        if (other.id === block.id || other.pinnedTable) continue;
        if (placement.get(other.id) === placement.get(block.id)) continue;
        const before = costOf(placement, context).cost;
        const mine = placement.get(block.id), theirs = placement.get(other.id);
        placement.set(block.id, theirs); placement.set(other.id, mine);
        const after = costOf(placement, context).cost;
        if (after < before - 1e-9) improved = true;
        else { placement.set(block.id, mine); placement.set(other.id, theirs); }
        iterationsUsed++;
        if (iterationsUsed >= iterations) break;
      }
    }
  }

  const final = costOf(placement, context);
  const solvedTables = tableIDs.map(id => ({ id, label: `Table ${id}`, guests: [], seats: [], sides: {}, notes: null }));
  const tableByID = new Map(solvedTables.map(table => [table.id, table]));
  for (const block of ordered) for (const guestId of block.ids) tableByID.get(placement.get(block.id)).guests.push(guestId);

  const violations = [];
  for (const entry of apart.values()) {
    if (placement.get(entry.blocks[0]) && placement.get(entry.blocks[0]) === placement.get(entry.blocks[1])) {
      for (const edge of entry.edges) violations.push(edge);
    }
  }

  const propagated = [];
  for (const entry of apart.values()) {
    const [blockA, blockB] = entry.blocks;
    const membersA = blocks.byID.get(blockA)?.ids || [];
    const membersB = blocks.byID.get(blockB)?.ids || [];
    for (const a of membersA) for (const b of membersB) {
      if (declaredApart.has(pairKey(a, b))) continue;
      const chain = findChain(graph, a, b, { maxDepth: 6 });
      if (!chain.path) continue;
      propagated.push({
        guestA: a, guestB: b,
        labelA: graph.nodes.get(a).label, labelB: graph.nodes.get(b).label,
        tableA: placement.get(blocks.find(a)), tableB: placement.get(blocks.find(b)),
        via: chain.path.nodes.slice(1, -1).map(id => graph.nodes.get(id).label),
        chain: chain.path.edges.map(edge => `${graph.nodes.get(edge.from).label} — ${RELATIONS[edge.kind].label} — ${graph.nodes.get(edge.to).label}`),
        sources: [...new Set(entry.edges.flatMap(edge => edge.sourceIds))],
      });
    }
  }

  const isolated = guestIDs
    .filter(id => degreeOf(adjacencyMap, id) === 0 && !graph.nodes.get(id).service)
    .map(id => ({ guestId: id, label: graph.nodes.get(id).label, side: graph.nodes.get(id).side, table: placement.get(blocks.find(id)) }));

  const bridges = articulationPoints(adjacencyMap, guestIDs).flatMap(id => {
    const neighbors = (adjacencyMap.get(id) || []).map(neighbor => neighbor.id);
    const fragments = components(adjacencyWithout(adjacencyMap, id), guestIDs.filter(guest => guest !== id))
      .filter(group => group.some(member => neighbors.includes(member))).length;
    if (fragments < 2) return [];
    return [{
      guestId: id, label: graph.nodes.get(id).label, neighbors: neighbors.length, fragments,
      table: placement.get(blocks.find(id)),
      note: `Sans ${graph.nodes.get(id).label}, ce groupe se scinde en ${fragments} sous-groupes qui n’ont aucun lien déclaré entre eux.`,
    }];
  });

  const oversized = components(adjacencyMap, guestIDs).filter(group => group.length > targetSize).map(group => {
    const used = [...new Set(group.map(id => placement.get(blocks.find(id))))].filter(Boolean).sort();
    const spanning = guestIDs.length ? group.length / guestIDs.length : 0;
    return {
      members: group, size: group.length, tables: used, spanning: Math.round(spanning * 100) / 100,
      note: spanning >= 0.8
        ? `Tout le monde tient presque dans un seul réseau (${group.length} personnes reliées de près ou de loin) : aucune coupure ne peut suivre les liens familiaux. Ce sont les affinités et les capacités qui décident, pas les clans.`
        : `Ce groupe déclaré compte ${group.length} personnes : il ne tient pas à une table de ${targetSize}. Coupure retenue : ${used.join(', ') || 'à arbitrer'}.`,
    };
  });

  const questions = [];
  for (const edge of input.edges.values()) {
    if (usable(edge)) continue;
    questions.push({
      edgeId: edge.id, kind: edge.kind, pairIds: [edge.from, edge.to], from: edge.from, to: edge.to,
      pair: `${graph.nodes.get(edge.from).label} · ${graph.nodes.get(edge.to).label}`,
      reason: edge.rank === 'deprecated' ? 'information marquée ancienne'
        : edge.references.length ? 'consignée mais sans document consultable' : 'déclaration sans source',
      evidence: EVIDENCE_LABELS[edge.evidence],
      effect: RELATIONS[edge.kind].effect,
      toAsk: RELATIONS[edge.kind].effect === 'apart'
        ? `Faut-il réellement séparer ${graph.nodes.get(edge.from).label} et ${graph.nodes.get(edge.to).label} ?`
        : `${RELATIONS[edge.kind].label} entre ${graph.nodes.get(edge.from).label} et ${graph.nodes.get(edge.to).label} est-il confirmé par l’un des deux mariés ?`,
      declaredBy: edge.declaredBy ? sourceLabel(graph.sources, edge.declaredBy) : 'origine non indiquée',
      note: edge.note,
    });
  }

  for (const table of solvedTables) {
    table.sides = table.guests.reduce((count, guestId) => {
      const side = graph.nodes.get(guestId).side;
      count[side] = (count[side] || 0) + 1;
      return count;
    }, {});
    table.seats = table.guests.map(guestId => ({
      guestId,
      label: graph.nodes.get(guestId).label,
      side: graph.nodes.get(guestId).side,
      role: graph.nodes.get(guestId).role,
      diet: graph.nodes.get(guestId).diet,
      service: graph.nodes.get(guestId).service,
      blockId: blocks.find(guestId),
      pinned: Boolean(graph.nodes.get(guestId).pinnedTable),
      reasons: reasonsFor(graph, guestId, new Map(solvedTables.flatMap(item => item.guests.map(guest => [guest, item.id]))), adjacencyMap),
    }));
    const diets = table.seats.filter(seat => seat.diet).length;
    table.notes = diets ? `${diets} régime(s) à signaler au traiteur` : null;
    table.conflicts = table.guests.flatMap(guestId => (adjacencyMap.get(guestId) || [])
      .filter(neighbor => table.guests.includes(neighbor.id) && RELATIONS[neighbor.edge.kind].effect === 'avoid')
      .map(neighbor => ({ guestId, other: neighbor.id, edgeId: neighbor.edge.id })));
  }

  if (serviceCount) {
    solvedTables.push({
      id: 'P', label: 'Table des prestataires', guests: service, seats: service.map(id => ({
        guestId: id, label: input.nodes.get(id).label, side: input.nodes.get(id).side, role: input.nodes.get(id).role,
        diet: input.nodes.get(id).diet, service: true, blockId: id, pinned: false,
        reasons: [{ tone: 'info', text: 'hors plan invités : présent pour la prestation, pas pour le repas' }],
      })),
      sides: { prestataire: serviceCount }, notes: `${serviceCount} personne(s) à prévoir avec l’équipe technique`,
      conflicts: [], prestataires: true,
    });
  }

  const overflows = solvedTables.filter(table => !table.prestataires && table.guests.length > capacity);
  const issues = [
    ...(overflows.length ? [{ code: 'over', count: overflows.length, capacity }] : []),
    ...(violations.length ? [{ code: 'apart', count: violations.length, tables: tableIDs.length }] : []),
    ...(isolated.length ? [{ code: 'alone', count: isolated.length }] : []),
    ...(serviceCount ? [{ code: 'work', count: serviceCount }] : []),
    { code: 'own' },
  ];
  if (overflows.length) limitations.push(`${overflows.length} table(s) au-dessus de ${capacity} places : le lieu ne peut pas être respecté tel quel, les liens familiaux déclarés pèsent plus lourd que l’égalité des tables.`);
  if (violations.length) limitations.push(`${violations.length} séparation(s) impossible(s) à satisfaire avec ${tableIDs.length} tables : ajouter une table ou arbitrer.`);
  if (contradictions.length) limitations.push(`${contradictions.length} contradiction(s) à trancher : un même bloc est solidaire et déclaré incompatible.`);
  if (isolated.length) limitations.push(`${isolated.length} invité(s) sans attache déclarée : le plan les place, il ne devine pas à qui les présenter.`);
  if (graph.errors.length) limitations.push('Saisie incomplète : des lignes ont été ignorées (voir le détail de la saisie).');
  limitations.push('Ce plan est calculé sur les seules relations déclarées ici. Un conflit absent de cette liste ne prouve pas son absence réelle.');
  if (serviceCount) limitations.push(`${serviceCount} prestataire(s) écarté(s) de la répartition sociale : leur table est séparée par convention, non par contrainte.`);

  return {
    schema: 'relia.seating.plan.v1',
    computedAt: new Date().toISOString(),
    deterministic: true,
    iterations: iterationsUsed,
    cost: Math.round(final.cost),
    tables: solvedTables,
    tablesUsed: tableIDs.length,
    guestTables: solvedTables.filter(table => !table.prestataires).length,
    targetSize,
    capacity,
    capacityExceeded: overflows.map(table => ({ table: table.id, seats: table.guests.length })),
    blockingViolations: violations.length,
    violations: [
      ...violations.map(edge => ({ edgeId: edge.id, kind: edge.kind, pair: `${graph.nodes.get(edge.from).label} · ${graph.nodes.get(edge.to).label}`, note: edge.note || null, table: placement.get(blocks.find(edge.from)), type: 'capacité' })),
      ...contradictions.map(item => ({ ...item, table: placement.get(item.block), type: 'contradiction' })),
    ],
    contradictions,
    propagated,
    questions,
    insights: { isolated, bridges, oversized },
    proven: {
      apartTotal: apart.size,
      apartSatisfied: [...apart.values()].filter(entry => placement.get(entry.blocks[0]) !== placement.get(entry.blocks[1])).length,
      induced: propagated.length,
      declared: declaredApart.size,
      blocks: blocks.blocks.length,
    },
    limitations: [...new Set([...limitations, ...graph.limitations])],
    issues,
    complete: violations.length === 0 && contradictions.length === 0,
    partial: graph.errors.length > 0 || violations.length > 0 || contradictions.length > 0,
    placement,
    blocks,
  };
}
