import { eligible } from './data.js';

export const DISCOVERY_SCHEMA = 'relia.discovery.snapshot.v1';
const REGISTRY_SCHEMA = 'relia.discovery.registry.v1';

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(item => item === undefined ? 'null' : canonical(item)).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).filter(key => value[key] !== undefined).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  }
  if (value === undefined) return 'null';
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

function compareText(a, b) {
  return a < b ? -1 : a > b ? 1 : 0;
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
  for (const neighbors of adjacency.values()) neighbors.sort((a, b) => compareText(edgeKey(a.edge), edgeKey(b.edge)) || compareText(a.id, b.id));
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
  const identities = [...new Set(roots || [])];
  if (identities.length < 2 || identities.some(id => typeof id !== 'string' || !id)) throw new TypeError('Deux identités exactes sont nécessaires.');
  const sourceIds = ordered(sources || []);
  if (!sourceIds.length || sourceIds.some(source => typeof source !== 'string' || !source.trim())) throw new TypeError('Les sources interrogées doivent être indiquées.');
  const nodes = [...graph.nodes.values()].map(node => ({
    id: node.id, label: node.label || node.id, type: node.type || 'unknown',
    externalIds: structuredClone(node.externalIds || []),
    sourceIds: ordered(node.sourceIds || (sourceIds.length === 1 ? sourceIds : [])),
  })).sort((a, b) => compareText(a.id, b.id));
  if (identities.some(id => !nodes.some(node => node.id === id))) throw new TypeError('Les deux identités exactes doivent figurer dans le graphe capturé.');
  const edges = [...graph.edges.values()].map(edge => ({
    ...serializableEdge(edge), sourceIds: ordered(edge.sourceIds || (sourceIds.length === 1 ? sourceIds : [])),
  })).sort((a, b) => compareText(String(a.id), String(b.id)));
  const edgesById = new Map(edges.map(edge => [edge.id, edge]));
  if (nodes.length > 100 || edges.length > 180) throw new RangeError('Le snapshot dépasse les limites RELIA de 100 entités et 180 relations.');
  const pathPairs = paths.map(path => ({
    nodes: [...path.nodes], edges: path.edges.map(edge => edgesById.get(edge.id) || serializableEdge(edge)),
  }));
  if (!pathPairs.length && identities.length === 2) {
    const path = pathRecord(graph, identities[0], identities[1]);
    if (path) pathPairs.push({ ...path, edges: path.edges.map(edge => edgesById.get(edge.id) || serializableEdge(edge)) });
  }
  if (pathPairs.length > 20) throw new RangeError('Le snapshot dépasse 20 chemins conservés.');
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
        ...(search?.bounded ? ['Limite d’exploration atteinte.'] : []),
        ...(search?.incomplete ? ['Recherche ou source incomplète.'] : [])]),
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
    typeof snapshot.retrievedAt === 'string' && snapshot.parameters && typeof snapshot.parameters === 'object' &&
    !Array.isArray(snapshot.parameters))) return false;
  const { snapshotId, ...content } = snapshot;
  return snapshotId === `RDS-${hash(content)}` &&
    snapshot.identities.every(id => typeof id === 'string') && new Set(snapshot.identities).size === snapshot.identities.length &&
    snapshot.sources.every(source => typeof source === 'string') &&
    snapshot.nodes.length <= 100 && snapshot.edges.length <= 180 && snapshot.paths.length <= 20 &&
    snapshot.collection.complete === Boolean(snapshot.collection.complete) &&
    typeof snapshot.collection.partial === 'boolean' && typeof snapshot.collection.capped === 'boolean' &&
    Array.isArray(snapshot.collection.expanded) && snapshot.collection.expanded.every(id => typeof id === 'string') &&
    Array.isArray(snapshot.collection.errors) && snapshot.collection.errors.every(error => typeof error === 'string') &&
    Array.isArray(snapshot.collection.limitations) && snapshot.collection.limitations.every(item => typeof item === 'string') &&
    snapshot.collection.complete === (!snapshot.collection.partial && !snapshot.collection.capped &&
      !snapshot.collection.errors.length && !snapshot.collection.search?.incomplete && !snapshot.collection.search?.bounded) &&
    snapshot.nodes.every(node => typeof node.id === 'string' && typeof node.label === 'string' &&
      Array.isArray(node.externalIds) && node.externalIds.every(identifier => identifier && typeof identifier.namespace === 'string' &&
        typeof identifier.value === 'string' && typeof identifier.reliable === 'boolean') &&
      Array.isArray(node.sourceIds) && node.sourceIds.every(source => typeof source === 'string')) &&
    new Set(snapshot.nodes.map(node => node.id)).size === snapshot.nodes.length &&
    snapshot.edges.every(edge => typeof edge.id === 'string' && typeof edge.from === 'string' && typeof edge.to === 'string' &&
      Array.isArray(edge.references || []) && (edge.references || []).every(reference => reference &&
        Array.isArray(reference.urls || []) && (reference.urls || []).every(url => typeof url === 'string') &&
        Array.isArray(reference.documents || []) && (reference.documents || []).every(id => typeof id === 'string')) &&
      Array.isArray(edge.sourceIds || []) && (edge.sourceIds || []).every(source => typeof source === 'string')) &&
    new Set(snapshot.edges.map(edge => edge.id)).size === snapshot.edges.length &&
    snapshot.paths.every(path => Array.isArray(path.nodes) && path.nodes.every(id => typeof id === 'string' && snapshot.nodes.some(node => node.id === id)) &&
      Array.isArray(path.edges) &&
      path.nodes.length === path.edges.length + 1 && path.edges.every((edge, index) => eligible(edge) &&
        [[path.nodes[index], path.nodes[index + 1]], [path.nodes[index + 1], path.nodes[index]]]
          .some(([from, to]) => edge.from === from && edge.to === to)));
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

function usableIdentifier(identifier) {
  const namespace = String(identifier?.namespace || '').trim().toLowerCase();
  return Boolean(identifier?.reliable && namespace && String(identifier.value || '').trim() &&
    !['bnf', 'data.bnf.fr', 'ark:12148'].includes(namespace));
}

function identifierKey(identifier) {
  return canonical([String(identifier.namespace).trim().toLowerCase(), String(identifier.value).trim()]);
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
  const newByExternalId = new Map();
  for (const node of before.nodes) {
    for (const identifier of node.externalIds || []) {
      if (!usableIdentifier(identifier)) continue;
      const key = identifierKey(identifier);
      if (!oldByExternalId.has(key)) oldByExternalId.set(key, new Set());
      oldByExternalId.get(key).add(node.id);
    }
  }
  for (const node of after.nodes) {
    for (const identifier of node.externalIds || []) {
      if (!usableIdentifier(identifier)) continue;
      const key = identifierKey(identifier);
      if (!newByExternalId.has(key)) newByExternalId.set(key, new Set());
      newByExternalId.get(key).add(node.id);
    }
  }
  const aliases = new Map();
  const oldIDs = new Set(before.nodes.map(node => node.id));
  for (const node of after.nodes) {
    if (oldIDs.has(node.id)) continue;
    const matches = new Set();
    for (const identifier of node.externalIds || []) {
      if (!usableIdentifier(identifier)) continue;
      const key = identifierKey(identifier);
      if (newByExternalId.get(key)?.size !== 1) continue;
      for (const id of oldByExternalId.get(key) || []) matches.add(id);
    }
    if (matches.size === 1) {
      const id = [...matches][0];
      aliases.set(node.id, id);
      const identifiers = (node.externalIds || []).filter(usableIdentifier);
      entries.push(makeEntry('IDENTITY_RECONCILED', before, after, {
        entities: [id, node.id], identifiers,
        sources: ordered([...identifiers.map(value => value.sourceId), ...(node.sourceIds || [])].filter(Boolean)),
      }, `Les notices distinctes sont reliées par un identifiant externe déclaré fiable; les libellés ne sont pas utilisés.`));
    }
  }
  return aliases;
}

export function compareSnapshots(before, after) {
  if (!validateSnapshot(before) || !validateSnapshot(after)) throw new TypeError('Format de snapshot RELIA Discovery invalide.');
  const reasons = incomparability(before, after);
  const entries = [];
  const addedSources = new Set(after.sources.filter(source => !before.sources.includes(source)));
  const baselineIncomplete = !before.collection.complete;
  const incomplete = baselineIncomplete || !after.collection.complete;
  if (reasons.length) {
    entries.push(makeEntry('INCOMPARABLE', before, after, { entities: before.identities, reasons },
      reasons.join(' '), [...before.collection.limitations, ...after.collection.limitations]));
    return { schema: REGISTRY_SCHEMA, status: 'incomparable', comparable: false, before: before.snapshotId, after: after.snapshotId, entries };
  }

  const oldNodes = new Map(before.nodes.map(node => [node.id, node]));
  const aliases = nodeAliases(before, after, entries);
  const commonLimitations = [...before.collection.limitations, ...after.collection.limitations];
  for (const node of after.nodes) {
    if (oldNodes.has(node.id) || aliases.has(node.id)) continue;
    const details = { entities: [node.id], entity: node, sources: node.sourceIds || [] };
    const observedByAddedSource = (node.sourceIds || []).some(source => addedSources.has(source));
    if (baselineIncomplete || !observedByAddedSource) {
      entries.push(makeEntry('INCOMPARABLE', before, after, { ...details, candidateType: 'NEW_ENTITY' },
        baselineIncomplete
          ? 'Cette entité apparaît dans l’état enrichi, mais l’état de référence est incomplet; sa nouveauté ne peut pas être conclue.'
          : 'Entité observée dans l’état enrichi sans provenance explicite de la source ajoutée; une mise à jour de la source initiale ne peut être exclue.',
        commonLimitations));
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
    const sameClaim = oldByClaimId.get(edge.id);
    if (sameClaim && edgeKey(sameClaim) !== key) {
      entries.push(makeEntry('CONTRADICTION', before, after, {
        entities: [sameClaim.from, sameClaim.to, edge.from, edge.to], relation: { before: sameClaim, after: edge },
        sources: ordered([...edgeSources(sameClaim), ...edgeSources(edge)]),
        references: (edge.references || []).flatMap(reference => referenceKey(reference) ? [reference] : []),
      }, 'Un identifiant d’assertion conservé porte désormais une cible ou une propriété différente; vérifier l’historique et les deux provenances.', commonLimitations));
      continue;
    }
    if (!eligible(edge)) {
      if (edge.claimStatus === 'hypothesis' || edge.evidence === 'unverified') {
        entries.push(makeEntry('HYPOTHESIS', before, after, {
          entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
          relation: edge, sources: edgeSources(edge),
        }, 'Relation sans preuve documentaire exploitable; conservée hors des relations et chemins admissibles.'));
      }
      continue;
    }
    if (!newRelations.has(key)) newRelations.set(key, []);
    newRelations.get(key).push(edge);
  }

  for (const [key, relations] of newRelations) {
    const edge = relations[0], previous = oldRelations.get(key) || [];
    const eligibleRelations = relations.filter(eligible);
    if (!eligibleRelations.length) continue;
    const references = new Map();
    for (const relation of eligibleRelations) {
      for (const reference of relation.references || []) {
        const id = referenceKey(reference);
        if (id && !references.has(id)) references.set(id, reference);
      }
    }
    const refs = [...references.values()];
    const sources = ordered(eligibleRelations.flatMap(item => edgeSources(item, item.references || [])));
    if (!previous.some(eligible)) {
      const type = previous.length ? 'NEW_EVIDENCE' : 'NEW_RELATION';
      const observedByAddedSource = eligibleRelations.some(item => (item.sourceIds || []).some(source => addedSources.has(source)));
      const additionalSourceProof = observedByAddedSource || refs.some(reference => addedSources.has(reference.sourceId));
      if (type === 'NEW_RELATION' && (baselineIncomplete || !observedByAddedSource)) {
        entries.push(makeEntry('INCOMPARABLE', before, after, {
          entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
          relation: edge, relations: eligibleRelations, candidateType: type, sources, references: refs,
        }, baselineIncomplete
          ? 'Relation observée dans l’état enrichi, mais l’état de référence est incomplet; sa nouveauté ne peut pas être conclue.'
          : 'Relation observée, mais sa provenance ne désigne pas explicitement la nouvelle source; une mise à jour de la source initiale ne peut être exclue.',
        commonLimitations));
        continue;
      }
      if (type === 'NEW_EVIDENCE' && !additionalSourceProof) {
        entries.push(makeEntry('INCOMPARABLE', before, after, {
          entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
          relation: edge, relations: eligibleRelations, candidateType: type, sources, references: refs,
        }, 'Référence ajoutée détectée, mais sans provenance explicite de la nouvelle source; une mise à jour de la source initiale ne peut être exclue.', commonLimitations));
        continue;
      }
      entries.push(makeEntry(type, before, after, {
        entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
        relation: edge, relations: eligibleRelations, sources, references: refs,
      }, type === 'NEW_EVIDENCE'
        ? 'La relation figurait déjà dans l’état initial; une ou plusieurs références documentaires supplémentaires sont présentes.'
        : 'Relation admissible absente du graphe initial complet et présente dans l’état enrichi.', type === 'NEW_RELATION' ? [] : commonLimitations));
    } else {
      const priorReferences = new Set(previous.flatMap(item => (item.references || []).map(referenceKey).filter(Boolean)));
      const additional = refs.filter(reference => !priorReferences.has(referenceKey(reference)));
      const relationAttributed = eligibleRelations.some(item => (item.sourceIds || []).some(source => addedSources.has(source)));
      const attributed = additional.filter(reference => relationAttributed || addedSources.has(reference.sourceId));
      const unattributed = additional.filter(reference => !relationAttributed && !addedSources.has(reference.sourceId));
      if (attributed.length) entries.push(makeEntry('NEW_EVIDENCE', before, after, {
        entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
        relation: edge, relations: eligibleRelations, sources, references: attributed,
      }, 'Relation déjà connue; de nouvelles références documentaires indépendantes sont conservées.'));
      if (unattributed.length) entries.push(makeEntry('INCOMPARABLE', before, after, {
        entities: [aliases.get(edge.from) || edge.from, aliases.get(edge.to) || edge.to],
        relation: edge, relations: eligibleRelations, candidateType: 'NEW_EVIDENCE', sources, references: unattributed,
      }, 'Référence supplémentaire observée, mais sa provenance ne désigne pas explicitement la nouvelle source; une mise à jour de la source initiale ne peut être exclue.', commonLimitations));
    }
  }

  const oldPathKeys = new Set(before.paths.map(path => pathKey(path)));
  const seenPathKeys = new Set();
  for (const path of after.paths) {
    const key = pathKey(path, aliases);
    if (oldPathKeys.has(key) || seenPathKeys.has(key)) continue;
    seenPathKeys.add(key);
    if (!path.edges.every(eligible)) continue;
    const sourcedByEnrichment = path.edges.some(edge => (edge.sourceIds || []).some(source => addedSources.has(source)));
    if (baselineIncomplete || !sourcedByEnrichment) {
      entries.push(makeEntry('INCOMPARABLE', before, after, {
        entities: path.nodes.map(id => aliases.get(id) || id), path, candidateType: 'NEW_PATH',
        sources: ordered(path.edges.flatMap(edge => edgeSources(edge))),
      }, baselineIncomplete
        ? 'Chemin observé dans l’état enrichi, mais l’état incomplet ne permet pas de conclure qu’il était absent.'
        : 'Chemin observé sans relation attribuée explicitement à la nouvelle source; une mise à jour des données initiales ne peut être exclue.',
      commonLimitations));
    } else {
      entries.push(makeEntry('NEW_PATH', before, after, {
        entities: path.nodes.map(id => aliases.get(id) || id), path, sources: ordered(path.edges.flatMap(edge => edgeSources(edge))),
        references: path.edges.flatMap(edge => (edge.references || []).filter(reference => referenceKey(reference))),
      }, 'Chemin admissible documenté dans l’état enrichi et absent des chemins conservés dans l’état initial.'));
    }
  }

  for (const node of after.nodes) {
    for (const identifier of node.externalIds || []) {
      if (!usableIdentifier(identifier)) continue;
      const duplicates = after.nodes.filter(candidate => candidate.id !== node.id &&
        (candidate.externalIds || []).some(other => usableIdentifier(other) && identifierKey(other) === identifierKey(identifier)));
      if (duplicates.length) entries.push(makeEntry('IDENTITY_RECONCILED', before, after, {
        entities: [node.id, ...duplicates.map(candidate => candidate.id)], identifiers: [identifier],
        sources: identifier.sourceId ? [identifier.sourceId] : [], ambiguity: true,
      }, 'Un identifiant déclaré fiable est partagé par plusieurs notices; rapprochement ambigu, vérification humaine requise.'));
    }
  }
  entries.sort((a, b) => compareText(a.type, b.type) || compareText(a.id, b.id));
  return {
    schema: REGISTRY_SCHEMA, status: incomplete ? 'incomplete' : 'comparable', comparable: !incomplete,
    before: before.snapshotId, after: after.snapshotId, entries,
  };
}

export function exportRegistry({ snapshots = [], comparisons = [] } = {}) {
  const payload = {
    schema: REGISTRY_SCHEMA,
    disclaimer: 'Export RELIA Discovery. Résultats simulés et réels sont séparés; une nouveauté RELIA ne signifie pas une découverte historique inédite.',
    snapshots: [...snapshots].sort((a, b) => compareText(a.snapshotId, b.snapshotId)),
    comparisons: [...comparisons].sort((a, b) => compareText(`${a.before}:${a.after}`, `${b.before}:${b.after}`)),
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}
