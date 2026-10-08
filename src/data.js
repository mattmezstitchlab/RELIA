export const LIMITS = Object.freeze({ nodes: 100, edges: 180, expansions: 12, queries: 40, depth: 4 });
export const PROPERTIES = Object.freeze({
  P50: ['auteur ou autrice', 'work', 'person', 'création'], P57: ['réalisation', 'work', 'person', 'création'],
  P86: ['composition', 'work', 'person', 'création'], P161: ['distribution', 'work', 'person', 'création'],
  P170: ['création', 'work', 'person', 'création'], P175: ['interprétation', 'work', 'person', 'création'],
  P108: ['employeur', 'person', 'institution', 'parcours professionnel'], P69: ['formation', 'person', 'institution', 'parcours professionnel'],
  P463: ['membre de', 'person', 'institution', 'parcours professionnel'], P166: ['distinction', 'person', 'event', 'parcours professionnel'],
  P800: ['œuvre notable', 'person', 'work', 'création'], P737: ['influence déclarée', 'person', 'person', 'influence'],
  P159: ['siège', 'institution', 'place', 'contexte géographique'], P276: ['lieu', 'work', 'place', 'contexte géographique'],
  P131: ['localisation administrative', 'place', 'place', 'contexte géographique'], P19: ['lieu de naissance', 'person', 'place', 'contexte géographique'],
  P20: ['lieu de décès', 'person', 'place', 'contexte géographique'], P123: ['publication par', 'work', 'institution', 'édition'],
  P664: ['organisation', 'event', 'institution', 'événement'], P1344: ['participation à', 'person', 'event', 'événement'],
  P793: ['événement significatif', 'person', 'event', 'événement'],
});
export const PATH_PROPERTIES = new Set(Object.keys(PROPERTIES).filter(property => !['P19', 'P20', 'P131'].includes(property)));
const API = 'https://www.wikidata.org/w/api.php';
const cache = new Map();
export class RemoteError extends Error {
  constructor(message, cause) { super(message, { cause }); this.name = 'RemoteError'; }
}
export function safeURL(value) {
  try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) ? u.href : null; } catch { return null; }
}
export function isQID(id) { return /^Q[1-9]\d*$/.test(id || ''); }
export function bestLabel(labels, fallback) {
  return labels?.fr?.value || labels?.en?.value || Object.values(labels || {})[0]?.value || fallback;
}
async function request(url, { signal, budget } = {}) {
  signal?.throwIfAborted();
  const cached = cache.get(url);
  if (cached && Date.now() - cached.time < 300000) return structuredClone(cached.value);
  if (budget) {
    if (budget.queries >= LIMITS.queries) throw new RemoteError('Limite de requêtes atteinte. Recherche incomplète.');
    budget.queries++;
  }
  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Délai dépassé')), 11000);
  try {
    const response = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = await response.json();
    if (value.error) throw new Error(value.error.info || value.error.code);
    cache.set(url, { value, time: Date.now() });
    while (cache.size > 80) cache.delete(cache.keys().next().value);
    return structuredClone(value);
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    throw new RemoteError('Les sources distantes sont indisponibles ou trop lentes. Réessayez.', error);
  } finally {
    clearTimeout(timer); signal?.removeEventListener('abort', abort);
  }
}
function apiURL(params) {
  return `${API}?${new URLSearchParams({ format: 'json', origin: '*', ...params })}`;
}
export async function searchEntities(term, options = {}) {
  if (term.trim().length < 2) return [];
  const run = language => request(apiURL({ action: 'wbsearchentities', search: term.trim(), language, uselang: 'fr', type: 'item', limit: '8' }), options);
  let data = await run('fr');
  if (!data.search?.length) data = await run('en');
  return (data.search || []).filter(item => isQID(item.id)).map(item => ({
    id: item.id, label: item.label || item.id, description: item.description || 'Description indisponible',
  }));
}
export async function getEntities(ids, options = {}) {
  const unique = [...new Set(ids)].filter(isQID).slice(0, 50);
  if (!unique.length) return {};
  const data = await request(apiURL({ action: 'wbgetentities', ids: unique.join('|'), props: 'labels|descriptions|claims|sitelinks', languages: 'fr|en', languagefallback: '1' }), options);
  return data.entities || {};
}
export async function getWikipediaSummary(entity, options = {}) {
  if (entity.fictional || !entity.wikiTitle || !['fr', 'en'].includes(entity.wikiLang)) return null;
  const url = `https://${entity.wikiLang}.wikipedia.org/w/api.php?${new URLSearchParams({
    action: 'query', format: 'json', formatversion: '2', origin: '*', prop: 'extracts',
    exintro: '1', explaintext: '1', exsentences: '4', redirects: '1', titles: entity.wikiTitle,
  })}`;
  const response = await request(url, options);
  options.signal?.throwIfAborted();
  const page = response.query?.pages?.[0];
  if (!page || page.missing !== undefined || typeof page.extract !== 'string' || !page.extract.trim()) return null;
  return {
    text: page.extract.trim().slice(0, 1800), title: page.title || entity.wikiTitle, language: entity.wikiLang,
    url: `https://${entity.wikiLang}.wikipedia.org/wiki/${encodeURIComponent(page.title || entity.wikiTitle)}`,
    retrievedAt: new Date().toISOString(),
  };
}
function values(claims, property) {
  return (claims?.[property] || []).filter(c => c.rank !== 'deprecated').map(c => c.mainsnak?.datavalue?.value).filter(v => v !== undefined);
}
export function dateValue(value) {
  const match = /^([+-]?\d+)-(\d{2})-(\d{2})T/.exec(value?.time || '');
  if (!match || (value.precision ?? 0) < 9) return null;
  const year = Number(match[1]);
  const display = value.precision >= 11 ? `${match[3]}/${match[2]}/${year}` : value.precision === 10 ? `${match[2]}/${year}` : String(year);
  return { year, display, raw: value.time, precision: value.precision };
}
export function entityFromRaw(raw, hint = 'unknown') {
  const claims = raw.claims || {};
  const classes = values(claims, 'P31').map(v => v.id);
  const explicitType = classes.includes('Q5') ? 'person' : classes.some(id => ['Q11424', 'Q571', 'Q7725634', 'Q482994', 'Q838948', 'Q15416', 'Q7889'].includes(id)) ? 'work' :
    classes.some(id => ['Q515', 'Q6256', 'Q2221906', 'Q486972', 'Q17334923'].includes(id)) ? 'place' :
    classes.some(id => ['Q43229', 'Q4830453', 'Q3918', 'Q18127', 'Q2085381', 'Q163740'].includes(id)) ? 'institution' :
    classes.some(id => ['Q1656682', 'Q132241', 'Q815962', 'Q618779'].includes(id)) ? 'event' : null;
  const inferredType = ['P50', 'P57', 'P86', 'P161', 'P170', 'P175', 'P123'].some(property => claims[property]?.length) ? 'work' :
    claims.P664?.length ? 'event' : claims.P159?.length ? 'institution' : hint === 'person' ? 'unknown' : hint;
  const type = explicitType || inferredType;
  const image = values(claims, 'P18')[0];
  const wiki = raw.sitelinks?.frwiki || raw.sitelinks?.enwiki;
  const wikiLang = raw.sitelinks?.frwiki ? 'fr' : 'en';
  return {
    id: raw.id, label: bestLabel(raw.labels, raw.id), description: bestLabel(raw.descriptions, ''),
    type, typeBasis: explicitType ? 'wikidata' : type === 'unknown' ? 'unknown' : 'relationship',
    fictional: false, raw, occupations: values(claims, 'P106').map(v => v.id).filter(isQID),
    born: dateValue(values(claims, 'P569')[0]), died: dateValue(values(claims, 'P570')[0]),
    image: typeof image === 'string' ? `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(image)}?width=320` : null,
    wiki: wiki ? `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(wiki.title)}` : null,
    wikiTitle: wiki?.title, wikiLang,
  };
}
function snakValue(snak) { return snak?.datavalue?.value; }
export function referencesFor(claim, retrievedAt) {
  return (claim.references || []).map((ref, index) => {
    const snaks = ref.snaks || {};
    const urls = (snaks.P854 || []).map(s => safeURL(snakValue(s))).filter(Boolean);
    const documents = (snaks.P248 || []).map(s => snakValue(s)?.id).filter(isQID);
    const sourceDates = property => (snaks[property] || []).map(s => dateValue(snakValue(s))).filter(Boolean);
    return {
      id: `${claim.id}:reference:${ref.hash || index}`, hash: ref.hash || null, urls, documents,
      retrieved: sourceDates('P813'), published: sourceDates('P577'), retrievedAt,
      provenance: Object.entries(snaks).map(([property, entries]) => ({
        property, values: entries.map(s => ({ datatype: s.datatype, snaktype: s.snaktype, value: snakValue(s) })),
      })),
      usable: urls.length > 0 || documents.length > 0,
    };
  });
}
export function relationshipsFromRaw(raw, retrievedAt = new Date().toISOString()) {
  const edges = [];
  for (const [property, definition] of Object.entries(PROPERTIES)) {
    for (const claim of raw.claims?.[property] || []) {
      const target = claim.mainsnak?.datavalue?.value?.id;
      if (!isQID(target) || target === raw.id) continue;
      const refs = referencesFor(claim, retrievedAt);
      const dates = {};
      for (const dateProperty of ['P580', 'P582', 'P585', 'P577']) {
        dates[dateProperty] = (claim.qualifiers?.[dateProperty] || []).map(s => dateValue(snakValue(s))).filter(Boolean);
      }
      edges.push({
        id: claim.id || `${raw.id}:${property}:${target}`, from: raw.id, to: target, property,
        label: definition[0], fromType: definition[1], toType: definition[2], classification: definition[3], rank: claim.rank || 'normal',
        references: refs, dates, qualifiers: claim.qualifiers || {}, retrievedAt, fictional: false,
        claimStatus: claim.rank === 'deprecated' ? 'deprecated' : refs.some(r => r.usable) ? 'assertion' : 'hypothesis',
        evidence: claim.rank === 'deprecated' ? 'deprecated' : refs.some(r => r.usable) ? 'referenced' : 'unverified',
      });
    }
  }
  return edges;
}
export function eligible(edge) {
  return !edge.fictional && PATH_PROPERTIES.has(edge.property) && edge.evidence === 'referenced' && edge.rank !== 'deprecated' &&
    (edge.references || []).some(reference => (reference.urls || []).some(url => safeURL(url)) || (reference.documents || []).some(isQID));
}
export function inPeriod(edge, { from = null, to = null, undated = true } = {}) {
  const start = edge.dates?.P580?.[0]?.year;
  const end = edge.dates?.P582?.[0]?.year;
  const points = (edge.dates?.P585 || []).map(d => d.year);
  if (start == null && end == null && !points.length) return undated;
  const lo = from ?? -Infinity, hi = to ?? Infinity;
  if (start != null || end != null) return (start ?? -Infinity) <= hi && (end ?? Infinity) >= lo;
  return points.some(year => year >= lo && year <= hi);
}
export function shortestPath(graph, from, to, period = {}, allowFictional = false) {
  if (!graph.nodes.has(from) || !graph.nodes.has(to)) return null;
  const queue = [from], previous = new Map([[from, null]]);
  const adjacency = new Map();
  for (const edge of graph.edges.values()) {
    if ((!eligible(edge) && !(allowFictional && edge.fictional)) || !inPeriod(edge, period)) continue;
    if (!graph.nodes.has(edge.from) || !graph.nodes.has(edge.to)) continue;
    for (const [a, b] of [[edge.from, edge.to], [edge.to, edge.from]]) {
      if (!adjacency.has(a)) adjacency.set(a, []);
      adjacency.get(a).push({ node: b, edge });
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current === to) {
      const nodes = [to], edges = [];
      while (previous.get(nodes.at(-1))) {
        const step = previous.get(nodes.at(-1)); edges.unshift(step.edge); nodes.push(step.parent);
      }
      nodes.reverse();
      return {
        nodes, edges,
        directions: edges.map((edge, index) => edge.from === nodes[index] ? 'forward' : 'reverse'),
      };
    }
    for (const { node, edge } of adjacency.get(current) || []) {
      if (!previous.has(node)) { previous.set(node, { parent: current, edge }); queue.push(node); }
    }
  }
  return null;
}
export function emptyGraph() { return { nodes: new Map(), edges: new Map(), expanded: new Set(), partialExpanded: new Set(), partialLabels: new Set(), partial: false, capped: false }; }
async function incomingIDs(id, options) {
  const props = Object.keys(PROPERTIES).map(p => `p:${p}`).join(' ');
  const query = `SELECT DISTINCT ?item WHERE { VALUES ?predicate { ${props} } ?item ?predicate ?statement . ?statement ?value wd:${id} . FILTER(STRSTARTS(STR(?value), "http://www.wikidata.org/prop/statement/P")) } LIMIT 12`;
  const url = `https://query.wikidata.org/sparql?${new URLSearchParams({ query, format: 'json' })}`;
  const data = await request(url, options);
  return (data.results?.bindings || []).map(row => row.item?.value?.split('/').at(-1)).filter(isQID);
}
export async function expandEntity(graph, id, options = {}) {
  if (!isQID(id)) throw new Error('Identité Wikidata invalide.');
  if (graph.expanded.has(id) && !graph.partialExpanded.has(id) && !graph.partialLabels.has(id)) return;
  const source = await getEntities([id], options);
  if (!source[id] || source[id].missing !== undefined) throw new RemoteError('Cette identité Wikidata n’est plus disponible.');
  let incoming = [], partial = false;
  try { incoming = await incomingIDs(id, options); }
  catch (error) { if (options.signal?.aborted) throw error; partial = true; }
  let rawIncoming = {};
  try { rawIncoming = await getEntities(incoming, options); }
  catch (error) { if (options.signal?.aborted) throw error; partial = true; }
  const candidates = [...relationshipsFromRaw(source[id]), ...Object.values(rawIncoming).flatMap(raw => relationshipsFromRaw(raw).filter(e => e.to === id))];
  const rawByID = { ...rawIncoming, ...source };
  const targets = [...new Set(candidates.flatMap(e => [e.from, e.to]))].filter(qid => !rawByID[qid] && !graph.nodes.has(qid)).slice(0, Math.max(0, LIMITS.nodes - graph.nodes.size - 1));
  const targetRaw = await getEntities(targets.slice(0, 50), options);
  Object.assign(rawByID, targetRaw);
  options.signal?.throwIfAborted();
  if (graph.nodes.size < LIMITS.nodes || graph.nodes.has(id)) graph.nodes.set(id, entityFromRaw(source[id], graph.nodes.get(id)?.type || 'unknown'));
  for (const edge of candidates) {
    for (const [qid, hint] of [[edge.from, edge.fromType], [edge.to, edge.toType]]) {
      if (!graph.nodes.has(qid) && graph.nodes.size < LIMITS.nodes && rawByID[qid] && rawByID[qid].missing === undefined) graph.nodes.set(qid, entityFromRaw(rawByID[qid], hint));
    }
    if (graph.nodes.has(edge.from) && graph.nodes.has(edge.to) && graph.edges.size < LIMITS.edges) graph.edges.set(edge.id, edge);
    else graph.capped = true;
  }
  graph.expanded.add(id);
  if (partial) graph.partialExpanded.add(id); else graph.partialExpanded.delete(id);
  graph.partial = graph.partialExpanded.size > 0 || graph.partialLabels.size > 0;
  const occupationIDs = graph.nodes.get(id)?.occupations || [];
  if (occupationIDs.length) {
    graph.partialLabels.add(id); graph.partial = true;
    try {
      const labels = await getEntities(occupationIDs.slice(0, 8), options);
      options.signal?.throwIfAborted();
      graph.nodes.get(id).occupationLabels = Object.values(labels).map(raw => bestLabel(raw.labels, raw.id));
      graph.partialLabels.delete(id);
    } catch (error) { if (options.signal?.aborted) throw error; graph.partialLabels.add(id); }
  }
  graph.partial = graph.partialExpanded.size > 0 || graph.partialLabels.size > 0;
}
export async function findRemotePath(graph, from, to, period, { signal, onProgress = () => {} } = {}) {
  const budget = { queries: 0 };
  let expansions = 0;
  // Breadth first, alternating the two endpoints; reference-backed adjacency only.
  const queues = [[{ id: from, depth: 0 }], [{ id: to, depth: 0 }]];
  const seen = [new Set([from]), new Set([to])];
  let incomplete = false;
  while (queues.some(q => q.length) && expansions < LIMITS.expansions) {
    for (let side = 0; side < 2; side++) {
      const next = queues[side].shift();
      if (!next || next.depth >= LIMITS.depth) continue;
      signal?.throwIfAborted();
      if (!graph.expanded.has(next.id) || graph.partialExpanded.has(next.id) || graph.partialLabels.has(next.id)) {
        try { await expandEntity(graph, next.id, { signal, budget }); }
        catch (error) { if (signal?.aborted) throw error; incomplete = true; }
        expansions++;
        onProgress({ expansions, queries: budget.queries, graph });
      }
      for (const edge of graph.edges.values()) {
        if (!eligible(edge) || !inPeriod(edge, period)) continue;
        const neighbor = edge.from === next.id ? edge.to : edge.to === next.id ? edge.from : null;
        if (neighbor && graph.nodes.has(neighbor) && !seen[side].has(neighbor)) {
          seen[side].add(neighbor); queues[side].push({ id: neighbor, depth: next.depth + 1 });
        }
      }
      const found = shortestPath(graph, from, to, period);
      if (found) {
        return { path: found, incomplete: incomplete || graph.partial, bounded: graph.capped, expansions, queries: budget.queries };
      }
      if (expansions >= LIMITS.expansions || budget.queries >= LIMITS.queries) break;
    }
    if (budget.queries >= LIMITS.queries) { incomplete = true; break; }
  }
  const path = shortestPath(graph, from, to, period);
  return { path, incomplete: incomplete || graph.partial, bounded: graph.capped || expansions >= LIMITS.expansions, expansions, queries: budget.queries };
}
export function demoGraph() {
  const graph = emptyGraph();
  const records = [
    ['D1', 'Lila Vesper', 'person', 'Autrice imaginaire · Démonstration fictive'],
    ['D2', 'Noé Sillage', 'person', 'Compositeur imaginaire · Démonstration fictive'],
    ['D3', 'Les heures bleues', 'work', 'Roman imaginaire · Démonstration fictive'],
    ['D4', 'Le bruit des étoiles', 'work', 'Film imaginaire · Démonstration fictive'],
    ['D5', 'Maison des marées', 'institution', 'Éditeur imaginaire · Démonstration fictive'],
    ['D6', 'Port d’Ambrelune', 'place', 'Ville imaginaire · Démonstration fictive'],
    ['D7', 'Festival des lueurs', 'event', 'Festival imaginaire · Démonstration fictive'],
    ['D8', 'Alma Brume', 'person', 'Cinéaste imaginaire · Démonstration fictive'],
    ['D9', 'Atelier du passage', 'institution', 'Collectif imaginaire · Démonstration fictive'],
    ['D10', 'Jardin des échos', 'place', 'Lieu imaginaire · Démonstration fictive'],
    ['D11', 'Éclats de nuit', 'work', 'Album imaginaire · Démonstration fictive'],
    ['D12', 'Milo Aube', 'person', 'Artiste imaginaire · Démonstration fictive'],
    ['D13', 'Rencontres du silence', 'event', 'Événement imaginaire · Démonstration fictive'],
    ['D14', 'Institut des horizons', 'institution', 'Institut imaginaire · Démonstration fictive'],
    ['D15', 'La traversée', 'work', 'Œuvre imaginaire · Démonstration fictive'],
    ['D16', 'Île de Sélune', 'place', 'Lieu imaginaire · Démonstration fictive'],
  ];
  records.forEach(([id, label, type, description]) => graph.nodes.set(id, { id, label, type, description, fictional: true }));
  const links = [
    ['D1', 'D3', 'écrit', 2018], ['D3', 'D5', 'publié par', 2018], ['D5', 'D6', 'installé à', null],
    ['D1', 'D4', 'scénario', 2021], ['D2', 'D4', 'musique', 2021], ['D8', 'D4', 'réalisation', 2021],
    ['D4', 'D7', 'présenté à', 2022], ['D7', 'D6', 'se déroule à', 2022], ['D2', 'D11', 'compose', 2020],
    ['D12', 'D11', 'interprète', 2020], ['D8', 'D9', 'membre de', 2016], ['D9', 'D10', 'installé à', 2016],
    ['D1', 'D13', 'participe à', 2023], ['D13', 'D10', 'se déroule à', 2023], ['D12', 'D14', 'formation', 2014],
    ['D14', 'D6', 'installé à', null], ['D8', 'D15', 'crée', 2024], ['D15', 'D16', 'présenté à', 2024],
    ['D2', 'D13', 'participe à', 2023], ['D12', 'D7', 'participe à', 2022],
  ];
  links.forEach(([from, to, label, year], index) => graph.edges.set(`demo-${index}`, {
    id: `demo-${index}`, from, to, label, fictional: true, evidence: 'fictional', rank: 'normal',
    references: [], dates: { P585: year ? [{ year, display: String(year) }] : [] },
  }));
  return graph;
}
