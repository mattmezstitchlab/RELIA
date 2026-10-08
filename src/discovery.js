import { eligible } from './data.js';

export const DISCOVERY_SCHEMA = 'relia.discovery.snapshot.v1';
const REGISTRY_SCHEMA = 'relia.discovery.registry.v1';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function hash(value) {
  let result = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(canonical(value))) {
    result ^= BigInt(byte);
    result = BigInt.asUintN(64, result * 0x100000001b3n);
  }
  return result.toString(16).padStart(16, '0');
}

function ordered(values) {
  return [...new Set(values)].sort();
}

function serializableEdge(edge) {
  return structuredClone(edge);
}

function referenceKey(reference) {
  const documents = ordered(reference.documents || []);
  const urls = ordered(reference.urls || []);
  if (!documents.length && !urls.length) return null;
  return canonical({ documents, urls });
}

function edgeKey(edge, aliases = new Map()) {
  const from = aliases.get(edge.from) || edge.from;
  const to = aliases.get(edge.to) || edge.to;
  return canonical([from, edge.property || '', to]);
}

function pathKey(path, aliases = new Map()) {
  return canonical({
    nodes: (path.nodes || []).map(id => aliases.get(id) || id),
    relations: (path.edges || []).map(edge => edgeKey(edge, aliases)),
  });
}

function pathRecord(graph, from, to) {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  const queue = [from], previous = new Map([[from, null]]), adjacency = new Map();
  for (const edge of graph.edges.values()) {
    if (!eligible(edge) || !graph.nodes.has(edge.from) || !graph.nodes.has(edge.to)) continue;
    for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push({ id: b, edge });
    }
  }
  for (const neighbors of adjacency.values()) neighbors.sort((a, b) => edgeKey(a.edge).localeCompare(edgeKey(b.edge)) || a.id.localeCompare(b.id));
  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    if (current === to) {
      const nodes = [to], edges = [];
      while (previous.get(nodes.at(-1))) {
        const step = previous.get(nodes.at(-1));
        edges.unshift(step.edge); nodes.push(step.parent);
      }
      nodes.reverse();
      return { nodes, edges };
    }
    for (const { id, edge } of adjacency.get(current) || []) {
      if (!previous.has(id)) { previous.set(id, { parent: current, edge }); queue.push(id); }
    }
  }
  return null;
}

export function createSnapshot({
  graph, roots, sources, parameters, origin = 'real', retrievedAt = new Date().toISOString(),
  paths = [], errors = [], limitations = [], search = null,
}) {
  if (!graph?.nodes || !graph?.edges || !['real', 'simulated'].includes(origin)) throw new TypeError('Graphe ou origine de snapshot invalide.');
  const identities = ordered(roots || []);
  if (identities.length < 2 || identities.some(id => typeof id !== 'string' || !id)) throw new TypeError('Deux identités exactes sont nécessaires.');
  const sourceIds = ordered(sources || []);
  if (!sourceIds.length || sourceIds.some(source => typeof source !== 'string' || !source.trim())) throw new TypeError('Les sources interrogées doivent être indiquées.');
  const nodes = [...graph.nodes.values()].map(node => ({
    id: node.id, label: node.label || node.id, type: node.type || 'unknown',
    externalIds: structuredClone(node.externalIds || []),
    sourceIds: ordered(node.sourceIds || []),
  })).sort((a, b) => a.id.localeCompare(b.id));
  const edges = [...graph.edges.values()].map(edge => ({
    ...serializableEdge(edge), sourceIds: ordered(edge.sourceIds || (sourceIds.length === 1 ? sourceIds : [])),
  })).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const pathPairs = paths.map(path => ({ nodes: [...path.nodes], edges: path.edges.map(serializableEdge) }));
  if (!pathPairs.length && identities.length === 2) {
    const path = pathRecord(graph, identities[0], identities[1]);
    if (path) pathPairs.push(path);
  }
  const snapshot = {
    schema: DISCOVERY_SCHEMA, origin, identities, sources: sourceIds, retrievedAt,
    parameters: structuredClone(parameters || {}),
    nodes, edges, paths: pathPairs,
    collection: {
      complete: !graph.partial && !graph.capped && !(search?.incomplete || search?.bounded) && !errors.length,
      partial: Boolean(graph.partial), capped: Boolean(graph.capped),
      expanded: ordered(graph.expanded || []), search: search ? structuredClone(search) : null,
      errors: [...errors], limitations: ordered([...limitations, ...(graph.partial ? ['Exploration ou récupération partielle.'] : []),
        ...(graph.capped ? ['Limite de taille du graphe atteinte.'] : []),
        ...(search?.bounded ? ['Limite d’exploration atteinte.'] : [])]),
    },
  };
  snapshot.snapshotId = `RDS-${hash(snapshot)}`;
  return snapshot;
}

export function validateSnapshot(snapshot) {
  if (!(snapshot && snapshot.schema === DISCOVERY_SCHEMA &&
    ['real', 'simulated'].includes(snapshot.origin) &&
    typeof snapshot.snapshotId === 'string' &&
    Array.isArray(snapshot.identities) && snapshot.identities.length >= 2 &&
    Array.isArray(snapshot.sources) && snapshot.sources.length > 0 &&
    Array.isArray(snapshot.nodes) && Array.isArray(snapshot.edges) &&
    Array.isArray(snapshot.paths) && snapshot.collection &&
    snapshot.parameters && typeof snapshot.parameters === 'object')) return false;
  const { snapshotId, ...content } = snapshot;
  return snapshotId === `RDS-${hash(content)}` &&
    snapshot.nodes.every(node => typeof node.id === 'string') &&
    snapshot.edges.every(edge => typeof edge.id === 'string' && typeof edge.from === 'string' && typeof edge.to === 'string') &&
    snapshot.paths.every(path => Array.isArray(path.nodes) && Array.isArray(path.edges) && path.edges.every(eligible));
}

function makeEntry(type, before, after, details, explanation, limitations = []) {
  const content = {
    type, before: before?.snapshotId || null, after: after?.snapshotId || null,
    details, explanation, limitations: ordered(limitations),
  };
  return {
    id: `RDE-${hash(content)}`, type, entities: ordered(details.entities || []),
    relation: details.relation || null, path: details.path || null,
    sources: ordered(details.sources || []), references: details.references || [],
    retrievedAt: after?.retrievedAt || before?.retrievedAt || null,
    initialSnapshot: before?.snapshotId || null, enrichedSnapshot: after?.snapshotId || null,
    explanation, verificationStatus: 'unreviewed', limitations: ordered(limitations),
    details,
  };
}

function edgeSources(edge, references = edge.references || []) {
  return ordered([...(edge.sourceIds || []), ...references.map(reference => reference.sourceId).filter(Boolean)]);
}

function incomparability(before, after) {
  const reasons = [];
  if (before.origin !== after.origin) reasons.push('Les états fictifs et réels ne peuvent pas être comparés.');
  if (canonical(before.identities) !== canonical(after.identities)) reasons.push('Les identifiants exacts des identités racines diffèrent.');
  if (canonical(before.parameters) !== canonical(after.parameters)) reasons.push('Les paramètres ou le périmètre d’exploration diffèrent.');
  if (!before.sources.every(source => after.sources.includes(source))) reasons.push('Les sources de référence ne sont pas toutes présentes dans l’état enrichi.');
  if (!after.sources.some(source => !before.sources.includes(source))) reasons.push('Aucune nouvelle source documentaire n’est déclarée dans l’état enrichi.');
  return reasons;
}

function nodeAliases(before, after, entries) {
  const oldByExternalId = new Map();
  for (const node of before.nodes) {
    for (const identifier of node.externalIds || []) {
      if (!identifier.reliable || !identifier.namespace || !identifier.value) continue;
      const key = canonical([identifier.namespace, identifier.value]);
      if (!oldByExternalId.has(key)) oldByExternalId.set(key, new Set());
      oldByExternalId.get(key).add(node.id);
    }
  }
  const aliases = new Map();
  const oldIDs = new Set(before.nodes.map(node => node.id));
  for (const node of after.nodes) {
    if (oldIDs.has(node.id)) continue;
    const matches = new Set();
    for (const identifier of node.externalIds || []) {
      if (!identifier.reliable || !identifier.namespace || !identifier.value) continue;
      for (const id of oldByExternalId.get(canonical([identifier.namespace, identifier.value])) || []) matches.add(id);
    }
    if (matches.size === 1) {
      const id = [...matches][0];
      aliases.set(node.id, id);
      entries.push(makeEntry('IDENTITY_RECONCILED', before, after, {
        entities: [id, node.id], identifiers: (node.externalIds || []).filter(value => value.reliable),
      }, `Les notices distinctes sont reliées par un identifiant externe déclaré fiable; les libellés ne sont pas utilisés.`));
    }
  }
  return aliases;
}

export function compareSnapshots(before, after) {
  if (!validateSnapshot(before) || !validateSnapshot(after)) throw new TypeError('Format de snapshot RELIA Discovery invalide.');
  const reasons = incomparability(before, after);
  const entries = [];
  const oldNodes = new Map(before.nodes.map(node => [node.id, node]));
  const newNodes = new Map(after.nodes.map(node => [node.id, node]));
  const aliases = nodeAliases(before, after, entries);
  const baselineIncomplete = !before.collection.complete;
  const incomplete = baselineIncomplete || !after.collection.complete;
  if (reasons.length) {
    entries.push(makeEntry('INCOMPARABLE', before, after, { entities: before.identities, reasons },
      reasons.join(' '), [...before.collection.limitations, ...after.collection.limitations]));
    return { schema: REGISTRY_SCHEMA, status: 'incomparable', comparable: false, before: before.snapshotId, after: after.snapshotId, entries };
  }

  const commonLimitations = [...before.collection.limitations, ...after.collection.limitations];
  for (const node of after.nodes) {
    if (oldNodes.has(node.id) || aliases.has(node.id)) continue;
    const details = { entities: [node.id], entity: node };
    if (baselineIncomplete) {
      entries.push(makeEntry('INCOMPARABLE', before, after, { ...details, candidateType: 'NEW_ENTITY' },
        'Cette entité apparaît dans l’état enrichi, mais l’état de référence est incomplet; sa nouveauté ne peut pas être conclue.', commonLimitations));
    } else {
      entries.push(makeEntry('NEW_ENTITY', before, after, details,
        'Identifiant exact absent de l’état de référence complet; aucun rapprochement par nom n’est effectué.'));
    }
  }

  const oldByClaimId = new Map(before.edges.map(edge => [edge.id, edge]));
  const oldRelations = new Map();
  for (const edge of before.edges) {
    const key = edgeKey(edge);
    if (!oldRelations.has(key)) oldRelations.set(key, []);
    oldRelations.get(key).push(edge);
  }
  const newRelations = new Map();
  for (const edge of after.edges) {
    const key = edgeKey(edge, aliases);
    if (!newRelations.has(key)) newRelations.set(key, []);
    newRelations.get(key).push(edge);
  }

  for (const edge of after.edges) {
    const key = edgeKey(edge, aliases), previous = oldRelations.get(key) || [];
    if (!eligible(edge)) {
      if (edge.claimStatus === 'hypothesis' || edge.evidence === 'unverified') {
        entries.push(makeEntry('HYPOTHESIS', before, after, {
          entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
          relation: edge, sources: after.sources,
        }, 'Relation sans preuve documentaire exploitable; conservée hors des relations et chemins admissibles.'));
      }
      continue;
    }
    if (!previous.some(eligible)) {
      const sameClaim = oldByClaimId.get(edge.id);
      if (sameClaim && edgeKey(sameClaim) !== key) {
        entries.push(makeEntry('CONTRADICTION', before, after, {
          entities: [sameClaim.from, sameClaim.to, edge.from, edge.to], relation: { before: sameClaim, after: edge },
          sources: ordered([...edgeSources(sameClaim), ...edgeSources(edge)]),
          references: (edge.references || []).flatMap(reference => referenceKey(reference) ? [reference] : []),
        }, 'Un identifiant d’assertion conservé porte désormais une cible ou une propriété différente; vérifier l’historique et les deux provenances.', commonLimitations));
        continue;
      }
      const type = previous.length ? 'NEW_EVIDENCE' : 'NEW_RELATION';
      if (baselineIncomplete && type === 'NEW_RELATION') {
        entries.push(makeEntry('INCOMPARABLE', before, after, {
          entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
          relation: edge, candidateType: type, sources: after.sources,
          references: (edge.references || []).flatMap(reference => referenceKey(reference) ? [reference] : []),
        }, 'Relation nouvellement observée dans l’état enrichi, mais un état incomplet interdit de conclure à sa nouveauté.', commonLimitations));
        continue;
      }
      const refs = (edge.references || []).filter(reference => referenceKey(reference));
      entries.push(makeEntry(type, before, after, {
        entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
        relation: edge, sources: edgeSources(edge, refs), references: refs,
      }, type === 'NEW_EVIDENCE'
        ? 'La relation figurait déjà dans l’état initial; une ou plusieurs références documentaires supplémentaires sont présentes.'
        : 'Relation admissible absente du graphe initial complet et présente dans l’état enrichi.', type === 'NEW_RELATION' ? [] : commonLimitations));
    } else {
      const priorReferences = new Set(previous.flatMap(item => (item.references || []).map(referenceKey).filter(Boolean)));
      const additional = (edge.references || []).filter(reference => {
        const key = referenceKey(reference);
        return key && !priorReferences.has(key);
      });
      if (additional.length) entries.push(makeEntry('NEW_EVIDENCE', before, after, {
        entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
        relation: edge, sources: edgeSources(edge, additional), references: additional,
      }, 'Relation déjà connue; de nouvelles références documentaires indépendantes sont conservées.'));
    }
  }

  const oldPathKeys = new Set(before.paths.map(path => pathKey(path)));
  for (const path of after.paths) {
    if (oldPathKeys.has(pathKey(path, aliases))) continue;
    if (!path.edges.every(eligible)) continue;
    if (baselineIncomplete) {
      entries.push(makeEntry('INCOMPARABLE', before, after, {
        entities: path.nodes.map(id => aliases.get(id) || id), path, candidateType: 'NEW_PATH', sources: after.sources,
      }, 'Chemin observé dans l’état enrichi, mais l’état incomplet ne permet pas de conclure qu’il était absent.', commonLimitations));
    } else {
      entries.push(makeEntry('NEW_PATH', before, after, {
        entities: path.nodes.map(id => aliases.get(id) || id), path, sources: ordered(path.edges.flatMap(edge => edgeSources(edge))),
        references: path.edges.flatMap(edge => (edge.references || []).filter(reference => referenceKey(reference))),
      }, 'Chemin admissible documenté dans l’état enrichi et absent des chemins conservés dans l’état initial.'));
    }
  }

  for (const node of after.nodes) {
    for (const identifier of node.externalIds || []) {
      if (!identifier.reliable || !identifier.namespace || !identifier.value) continue;
      const duplicates = after.nodes.filter(candidate => candidate.id !== node.id &&
        (candidate.externalIds || []).some(other => other.reliable && other.namespace === identifier.namespace && other.value === identifier.value));
      if (duplicates.length) entries.push(makeEntry('IDENTITY_RECONCILED', before, after, {
        entities: [node.id, ...duplicates.map(candidate => candidate.id)], identifiers: [identifier], ambiguity: true,
      }, 'Un identifiant déclaré fiable est partagé par plusieurs notices; rapprochement ambigu, vérification humaine requise.'));
    }
  }
  entries.sort((a, b) => a.type.localeCompare(b.type) || a.id.localeCompare(b.id));
  return {
    schema: REGISTRY_SCHEMA, status: incomplete ? 'incomplete' : 'comparable', comparable: !incomplete,
    before: before.snapshotId, after: after.snapshotId, entries,
  };
}

export function exportRegistry({ snapshots = [], comparisons = [] } = {}) {
  const payload = {
    schema: REGISTRY_SCHEMA,
    disclaimer: 'Export RELIA Discovery. Résultats simulés et réels sont séparés; une nouveauté RELIA ne signifie pas une découverte historique inédite.',
    snapshots: [...snapshots].sort((a, b) => a.snapshotId.localeCompare(b.snapshotId)),
    comparisons: [...comparisons].sort((a, b) => `${a.before}:${a.after}`.localeCompare(`${b.before}:${b.after}`)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
