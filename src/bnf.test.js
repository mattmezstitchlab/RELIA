import test from 'node:test';
import assert from 'node:assert/strict';
import { bnfQuery, getBnfEnrichment, normalizeBnfResults } from './bnf.js';

const record = 'http://data.bnf.fr/ark:/12148/cb11931374m';
const rows = [
  { record: { value: record }, predicate: { value: 'http://www.w3.org/2004/02/skos/core#prefLabel' }, object: { type: 'literal', 'xml:lang': 'fr', value: 'Nom contrôlé' } },
  { record: { value: record }, predicate: { value: 'http://www.w3.org/2004/02/skos/core#altLabel' }, object: { type: 'literal', 'xml:lang': 'fr', value: 'Variante de nom' } },
  { record: { value: record }, predicate: { value: 'http://www.w3.org/2000/01/rdf-schema#label' }, object: { type: 'literal', 'xml:lang': 'en', value: 'Authority label' } },
];

test('BnF query targets one exact Wikidata identity and never searches by name', () => {
  const query = bnfQuery('Q42');
  assert.match(query, /owl#sameAs/);
  assert.match(query, /http:\/\/www\.wikidata\.org\/entity\/Q42/);
  assert.match(query, /LIMIT 20/);
  assert.doesNotMatch(query, /FILTER\s*\(\s*CONTAINS|label\s*\(/i);
  assert.throws(() => bnfQuery('not-a-qid'), /Identifiant Wikidata invalide/);
});

test('normalization retains exact BnF ARK, allowed labels, attribution, and retrieval time', () => {
  const result = normalizeBnfResults({ results: { bindings: rows } }, '2026-10-08T00:00:00.000Z');
  assert.equal(result.recordUrl, 'https://data.bnf.fr/ark:/12148/cb11931374m');
  assert.deepEqual(result.labels, { fr: ['Nom contrôlé', 'Variante de nom'], en: ['Authority label'] });
  assert.equal(result.attribution, 'Bibliothèque nationale de France');
  assert.equal(result.license, 'Licence Ouverte');
  assert.equal(result.licenseUrl, 'https://api.bnf.fr/fr/node/2763');
  assert.equal(result.retrievedAt, '2026-10-08T00:00:00.000Z');
  assert.equal(result.alignment, 'owl:sameAs');
});

test('normalization ignores unknown predicates, non-literals, and non-BnF ARKs', () => {
  const bindings = [
    ...rows,
    { record: { value: 'https://example.org/ark:/12148/cb12345678x' }, predicate: rows[0].predicate, object: rows[0].object },
    { record: { value: record }, predicate: { value: 'https://example.org/relationship' }, object: rows[0].object },
    { record: { value: record }, predicate: rows[0].predicate, object: { type: 'uri', value: 'https://example.org/person' } },
  ];
  assert.equal(normalizeBnfResults({ results: { bindings } }).labels.fr.length, 2);
  assert.equal(normalizeBnfResults({ results: { bindings: [] } }), null);
});

test('BnF enrichment issues a bounded JSON query, caches results, and degrades on network failure', async t => {
  let calls = 0;
  let offline = false;
  t.mock.method(globalThis, 'fetch', async url => {
    calls++;
    if (offline) throw new Error('offline');
    const parsed = new URL(url);
    assert.equal(parsed.origin + parsed.pathname, 'https://data.bnf.fr/sparql');
    assert.equal(parsed.searchParams.get('format'), 'application/sparql-results+json');
    assert.match(parsed.searchParams.get('query'), /entity\/Q987654/);
    return { ok: true, json: async () => ({ results: { bindings: rows } }) };
  });
  const first = await getBnfEnrichment('Q987654');
  await getBnfEnrichment('Q987654');
  assert.equal(first.recordUrl, 'https://data.bnf.fr/ark:/12148/cb11931374m');
  assert.equal(calls, 1);

  offline = true;
  await assert.rejects(getBnfEnrichment('Q987655'), /service SPARQL BnF est indisponible/);
});

test('cancelled BnF requests stop before network access', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; });
  const controller = new AbortController();
  controller.abort(new Error('selection changed'));
  await assert.rejects(getBnfEnrichment('Q987656', { signal: controller.signal }), /selection changed/);
  assert.equal(calls, 0);
});
