const ENDPOINT = 'https://data.bnf.fr/sparql';
const WIKIDATA = 'http://www.wikidata.org/entity/';
const SAME_AS = 'http://www.w3.org/2002/07/owl#sameAs';
const LABEL_PREDICATES = new Set([
  'http://www.w3.org/2004/02/skos/core#prefLabel',
  'http://www.w3.org/2000/01/rdf-schema#label',
  'http://www.w3.org/2004/02/skos/core#altLabel',
]);
const cache = new Map();

export function bnfQuery(qid) {
  if (!/^Q[1-9]\d*$/.test(qid || '')) throw new Error('Identifiant Wikidata invalide.');
  return `SELECT DISTINCT ?record ?predicate ?object WHERE {
  ?record <${SAME_AS}> <${WIKIDATA}${qid}> ;
    ?predicate ?object .
  VALUES ?predicate {
    <http://www.w3.org/2004/02/skos/core#prefLabel>
    <http://www.w3.org/2000/01/rdf-schema#label>
    <http://www.w3.org/2004/02/skos/core#altLabel>
  }
} LIMIT 20`;
}

function bnfRecordURL(value) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.hostname !== 'data.bnf.fr' ||
        !/^\/ark:\/12148\/cb[\w-]+\/?$/.test(url.pathname)) return null;
    url.protocol = 'https:';
    return url.href;
  } catch { return null; }
}

export function normalizeBnfResults(data, retrievedAt = new Date().toISOString()) {
  const records = new Map();
  for (const binding of data?.results?.bindings || []) {
    const url = bnfRecordURL(binding.record?.value);
    const predicate = binding.predicate?.value;
    const value = binding.object?.value?.trim();
    if (!url || !LABEL_PREDICATES.has(predicate) || !value || binding.object.type !== 'literal') continue;
    if (!records.has(url)) records.set(url, new Map());
    const labels = records.get(url);
    const language = binding.object['xml:lang'] || 'und';
    if (!labels.has(language)) labels.set(language, []);
    if (!labels.get(language).includes(value)) labels.get(language).push(value);
  }
  const [recordUrl, labels] = records.entries().next().value || [];
  if (!recordUrl) return null;
  return {
    source: 'Bibliothèque nationale de France · data.bnf.fr',
    attribution: 'Bibliothèque nationale de France',
    license: 'Licence Ouverte',
    licenseUrl: 'https://api.bnf.fr/fr/node/2763',
    recordUrl,
    labels: Object.fromEntries([...labels].map(([language, values]) => [language, values])),
    retrievedAt,
    alignment: 'owl:sameAs',
  };
}

export async function getBnfEnrichment(qid, { signal } = {}) {
  const query = bnfQuery(qid);
  signal?.throwIfAborted();
  const key = `${ENDPOINT}?${new URLSearchParams({ query, format: 'application/sparql-results+json' })}`;
  const cached = cache.get(key);
  if (cached && Date.now() - cached.time < 300000) return structuredClone(cached.value);

  const controller = new AbortController();
  const abort = () => controller.abort(signal.reason);
  signal?.addEventListener('abort', abort, { once: true });
  const timer = setTimeout(() => controller.abort(new Error('Délai BnF dépassé')), 8000);
  try {
    const response = await fetch(key, {
      signal: controller.signal,
      headers: { Accept: 'application/sparql-results+json, application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const value = normalizeBnfResults(await response.json());
    cache.set(key, { value, time: Date.now() });
    while (cache.size > 40) cache.delete(cache.keys().next().value);
    return structuredClone(value);
  } catch (error) {
    if (signal?.aborted) throw signal.reason || error;
    throw new Error('Le service SPARQL BnF est indisponible ou trop lent.', { cause: error });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abort);
  }
}
