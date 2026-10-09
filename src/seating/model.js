// Modèle de données du prototype « plan de table ».
// Le vocabulaire change (des invités au lieu d’œuvres), la discipline reste celle de RELIA :
// une relation n’est exploitable que si elle est typée, non obsolète et rattachée à une source
// consultable. Une rumeur sans source ne contraint jamais le plan : elle devient une question.

export const SEATING_SCHEMA = 'relia.seating.input.v1';
export const PLAN_SCHEMA = 'relia.seating.plan.v1';

export const LIMITS = Object.freeze({ guests: 400, relations: 1500, depth: 6, tables: 40 });

export const SIDES = Object.freeze({
  mariee: { label: 'Côté mariée', icon: 'person' },
  marie: { label: 'Côté marié', icon: 'person' },
  commun: { label: 'En commun', icon: 'link' },
  prestataire: { label: 'Prestataire', icon: 'building' },
  inconnu: { label: 'Côté non déclaré', icon: 'dot' },
});

// Effet réel du type de relation sur le plan. « ask » ne contraint jamais : c’est une question.
export const RELATIONS = Object.freeze({
  couple: { label: 'couple', effect: 'together', bind: 'hard', weight: 0 },
  foyer: { label: 'vient et repart ensemble', effect: 'together', bind: 'hard', weight: 0 },
  famille: { label: 'famille proche', effect: 'together', bind: 'soft', weight: 26 },
  affinite: { label: 's’entend bien avec', effect: 'prefer', bind: 'none', weight: 7 },
  tension: { label: 'tension à surveiller', effect: 'avoid', bind: 'none', weight: 12 },
  conflit: { label: 'conflit déclaré', effect: 'apart', bind: 'hard', weight: 0 },
  rupture: { label: 'séparation récente', effect: 'apart', bind: 'hard', weight: 0 },
  ondit: { label: 'bruit non confirmé', effect: 'ask', bind: 'none', weight: 0 },
});

export const EVIDENCE_LABELS = Object.freeze({
  referenced: 'Source consultable',
  unverified: 'Sans source',
  deprecated: 'Information ancienne',
});

export function safeURL(value) {
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) ? url.href : null;
  } catch { return null; }
}

export function sourceLabel(sources, id) {
  return sources?.[id]?.label || (id ? `Source ${id}` : 'Source non nommée');
}

function referenceUsable(reference) {
  const urls = (reference?.urls || []).map(safeURL).filter(Boolean);
  const documents = (reference?.documents || []).filter(id => typeof id === 'string' && id.trim());
  return urls.length > 0 || documents.length > 0;
}

// Miroir de eligible() de src/data.js, sur le vocabulaire du mariage : une arête compte
// seulement si elle est réelle, typée, fraîche et sourcée.
export function usable(edge) {
  return !edge.invented
    && Boolean(edge.kind) && Boolean(RELATIONS[edge.kind])
    && edge.evidence === 'referenced'
    && edge.rank !== 'deprecated'
    && (edge.references || []).some(referenceUsable);
}

export function isBlocking(edge) {
  return usable(edge) && RELATIONS[edge.kind].effect === 'apart';
}

// « bind: hard » qualifie la force de la contrainte, pas son sens : un conflit est dur
// et il sépare. Regrouper exige l’effet « together ».
export function bindsTogether(edge) {
  return usable(edge) && RELATIONS[edge.kind].bind === 'hard' && RELATIONS[edge.kind].effect === 'together';
}

function evidenceFor(references, rank) {
  if (rank === 'deprecated') return 'deprecated';
  return references.some(referenceUsable) ? 'referenced' : 'unverified';
}

function takeID(value, taken, errors, what) {
  const id = String(value || '').trim();
  if (!id) { errors.push(`${what} : identifiant manquant, élément ignoré.`); return null; }
  if (taken.has(id)) { errors.push(`${what} : identifiant « ${id} » déjà utilisé, doublon ignoré.`); return null; }
  taken.add(id);
  return id;
}

export function createSeatingGraph({ guests = [], relations = [], sources = {}, meta = {} } = {}) {
  const errors = [];
  const limitations = [];
  const nodeIDs = new Set();
  const nodes = new Map();

  for (const guest of guests) {
    const id = takeID(guest.id, nodeIDs, errors, 'Invité');
    if (!id) continue;
    const side = SIDES[guest.side] ? guest.side : 'inconnu';
    if (side === 'inconnu') limitations.push(`Côté non déclaré pour ${guest.label || id} : l’équilibre des tables ne peut pas être vérifié.`);
    nodes.set(id, {
      id,
      label: (guest.label || id).trim(),
      type: side,
      side,
      role: (guest.role || '').trim() || null,
      household: (guest.household || '').trim() || null,
      pinnedTable: typeof guest.table === 'string' ? guest.table.toUpperCase().slice(0, 2) : null,
      diet: guest.diet && typeof guest.diet === 'object' ? { ...guest.diet } : null,
      service: Boolean(guest.service),
      externalIds: (guest.externalIds || []).filter(item => item && typeof item.value === 'string'),
      sourceIds: [...new Set(guest.sourceIds || [])],
      notes: (guest.notes || '').trim() || null,
      invented: Boolean(guest.invented),
    });
  }

  const edgeIDs = new Set();
  const edges = new Map();
  for (const relation of relations) {
    const kind = relation.kind;
    if (!RELATIONS[kind]) { errors.push(`Relation ${relation.id || ''} : type « ${kind} » inconnu, ignorée.`); continue; }
    const from = String(relation.from || ''), to = String(relation.to || '');
    if (!nodes.has(from) || !nodes.has(to) || from === to) {
      errors.push(`Relation « ${RELATIONS[kind]?.label || kind} » ${from} → ${to} : au moins une identité manque ou se réfère à elle-même.`);
      continue;
    }
    const id = takeID(relation.id || `${from}:${kind}:${to}`, edgeIDs, errors, 'Relation');
    if (!id) continue;
    const rank = relation.rank === 'deprecated' ? 'deprecated' : 'normal';
    const references = (relation.references || []).map((reference, index) => ({
      id: `${id}:reference:${reference.hash || index}`,
      hash: reference.hash || null,
      sourceId: reference.sourceId || null,
      urls: (reference.urls || []).map(safeURL).filter(Boolean),
      documents: (reference.documents || []).filter(Boolean),
      at: reference.at || null,
      note: reference.note || null,
      usable: referenceUsable(reference),
    }));
    const evidence = evidenceFor(references, rank);
    edges.set(id, {
      id, from, to, kind,
      label: RELATIONS[kind].label,
      effect: RELATIONS[kind].effect,
      bind: RELATIONS[kind].bind,
      weight: RELATIONS[kind].weight,
      rank,
      evidence,
      declaredBy: relation.declaredBy || null,
      note: (relation.note || '').trim() || null,
      references,
      sourceIds: [...new Set([...(relation.sourceIds || []), ...references.map(r => r.sourceId).filter(Boolean)])],
      usable: evidence === 'referenced' && rank !== 'deprecated',
    });
  }

  for (const edge of edges.values()) {
    for (const id of [edge.from, edge.to]) {
      const node = nodes.get(id);
      if (usable(edge)) node.degree = (node.degree || 0) + 1;
    }
  }

  if (nodes.size > LIMITS.guests) limitations.push(`Liste tronquée à la limite du prototype (${LIMITS.guests} invités).`);
  if (edges.size > LIMITS.relations) limitations.push(`Relations tronquées à la limite du prototype (${LIMITS.relations}).`);

  return {
    schema: SEATING_SCHEMA,
    nodes,
    edges,
    sources,
    meta: { ...meta },
    errors,
    limitations: [...new Set([...limitations, ...(meta.limitations || [])])],
    partial: errors.length > 0,
    capped: nodes.size > LIMITS.guests || edges.size > LIMITS.relations,
  };
}

// Le plan ne doit jamais inventer une relation pour compléter une fiche : cette fabrique
// n’est utilisée que par les tests de parcours, et le résultat est marqué comme non exploitable.
export function hypotheticalEdge(from, to, note) {
  return { id: `hyp:${from}:${to}`, from, to, kind: 'ondit', label: 'supposition de test', effect: 'ask', bind: 'none',
    weight: 0, rank: 'normal', evidence: 'unverified', references: [], sourceIds: [], usable: false, invented: true, note };
}

export function edgesOf(graph, id) {
  return [...graph.edges.values()].filter(edge => edge.from === id || edge.to === id);
}

export function neighborID(edge, id) { return edge.from === id ? edge.to : edge.from; }

export function planToJSON(plan, graph) {
  return {
    schema: PLAN_SCHEMA,
    event: graph.meta?.event || null,
    computedAt: plan.computedAt,
    seed: plan.seed,
    iterations: plan.iterations,
    tables: plan.tables.map(table => ({
      id: table.id,
      label: table.label,
      seats: table.seats.map(seat => ({
        guestId: seat.guestId,
        label: seat.label,
        side: seat.side,
        role: seat.role,
        blockId: seat.blockId,
        reasons: seat.reasons,
        pinned: seat.pinned,
      })),
    })),
    cost: plan.cost,
    blockingViolations: plan.blockingViolations,
    contradictions: plan.contradictions,
    questions: plan.questions,
    insights: plan.insights,
    proven: plan.proven,
    limitations: plan.limitations,
    complete: plan.complete,
  };
}
