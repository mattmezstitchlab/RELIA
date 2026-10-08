import test from 'node:test';
import assert from 'node:assert/strict';
import { demoGraph, emptyGraph, eligible, inPeriod, referencesFor, relationshipsFromRaw, safeURL, shortestPath, entityFromRaw, dateValue, expandEntity, findRemotePath, getEntities, getWikipediaSummary, searchEntities, LIMITS, PROPERTIES } from './data.js';

const claim = (target, references = [], extra = {}) => ({
  id: `Q1$${target}`, rank: 'normal', mainsnak: { datavalue: { value: { id: target } } }, references, ...extra,
});
const source = url => ({ hash: 'reference-hash', snaks: { P854: [{ datavalue: { value: url } }] } });
const date = year => ({ year, display: String(year) });
test('only allowlisted entity relationships are extracted; unsafe and missing references are not eligible', () => {
  const edges = relationshipsFromRaw({ id: 'Q1', claims: {
    P108: [claim('Q2', [source('https://example.org/article')]), claim('Q3'), claim('Q4', [source('javascript:alert(1)')]), claim('Q5', [source('https://example.org')], { rank: 'deprecated' })],
    P31: [claim('Q5')], P22: [claim('Q6')],
  } });
  assert.equal(edges.length, 4);
  assert.deepEqual(edges.map(eligible), [true, false, false, false]);
  assert.equal(edges[0].references[0].hash, 'reference-hash');
  assert.equal(edges[0].classification, 'parcours professionnel');
  assert.deepEqual(edges.map(edge => edge.claimStatus), ['assertion', 'hypothesis', 'hypothesis', 'deprecated']);
  assert.ok(Object.values(PROPERTIES).every(([, , , classification]) => classification));
});
test('professional and cultural allowlist excludes all kinship and intimate properties', () => {
  const excluded = ['P26', 'P40', 'P22', 'P25', 'P451', 'P1038'];
  assert.ok(excluded.every(property => !Object.hasOwn(PROPERTIES, property)));
  const claims = Object.fromEntries(excluded.map(property => [property, [claim('Q2', [source('https://example.org/ref')])]]));
  assert.deepEqual(relationshipsFromRaw({ id: 'Q1', claims }), []);
});
test('all independent reference records and original provenance are retained', () => {
  const refs = referencesFor(claim('Q2', [source('https://example.org/a'), source('https://example.net/b'), { snaks: { P248: [{ datavalue: { value: { id: 'Q99' } } }], P577: [{ datavalue: { value: { time: '+2020-01-01T00:00:00Z', precision: 11 } } }] } }]), '2026-01-01');
  assert.equal(refs.length, 3); assert.equal(refs[2].documents[0], 'Q99');
  assert.equal(refs[2].published[0].year, 2020); assert.equal(refs[2].retrievedAt, '2026-01-01');
  assert.ok(refs[2].provenance.find(p => p.property === 'P248'));
});
test('imported-from P143 alone never qualifies a relationship for a path', () => {
  const imported = { snaks: { P143: [{ datavalue: { value: { id: 'Q8447' } } }] } };
  const document = { snaks: { P248: [{ datavalue: { value: { id: 'Q987650' } } }] } };
  const edges = relationshipsFromRaw({ id: 'Q1', claims: { P108: [claim('Q2', [imported]), claim('Q3', [document])] } });
  assert.equal(eligible(edges[0]), false);
  assert.equal(edges[0].evidence, 'unverified');
  assert.equal(eligible(edges[1]), true);
});
test('period filtering uses overlap, open intervals, point dates and explicit undated policy', () => {
  const period = { from: 2000, to: 2010, undated: false };
  assert.equal(inPeriod({ dates: { P580: [date(1995)], P582: [date(2003)] } }, period), true);
  assert.equal(inPeriod({ dates: { P580: [date(2011)] } }, period), false);
  assert.equal(inPeriod({ dates: { P582: [date(2002)] } }, period), true);
  assert.equal(inPeriod({ dates: { P585: [date(2012), date(2004)] } }, period), true);
  assert.equal(inPeriod({ dates: {} }, period), false);
  assert.equal(inPeriod({ dates: {} }, { ...period, undated: true }), true);
  assert.equal(inPeriod({ dates: { P577: [date(2004)] }, born: date(2004), died: date(2006) }, period), false);
  assert.equal(inPeriod({ dates: { P577: [date(2004)] } }, { ...period, undated: true }), true);
});
test('paths are shortest in the consulted graph, traverse inbound links and exclude unverified claims', () => {
  const graph = emptyGraph();
  for (const id of ['Q1', 'Q2', 'Q3', 'Q4']) graph.nodes.set(id, { id });
  const add = (id, from, to, evidence, year) => graph.edges.set(id, { id, from, to, property: 'P108', evidence, rank: 'normal', dates: { P585: [date(year)] }, references: evidence === 'referenced' ? [{ urls: ['https://example.org/ref'], documents: [] }] : [] });
  add('a', 'Q2', 'Q1', 'referenced', 2002); add('b', 'Q2', 'Q3', 'referenced', 2003); add('c', 'Q1', 'Q3', 'unverified', 2002);
  graph.edges.get('c').label = 'Vérifié — étiquette trompeuse';
  add('d', 'Q3', 'Q4', 'referenced', 2020);
  assert.deepEqual(shortestPath(graph, 'Q1', 'Q3'), {
    nodes: ['Q1', 'Q2', 'Q3'], edges: [graph.edges.get('a'), graph.edges.get('b')], directions: ['reverse', 'forward'],
  });
  assert.equal(shortestPath(graph, 'Q1', 'Q4', { from: 2000, to: 2010 }), null);
  assert.deepEqual(shortestPath(graph, 'Q1', 'Q1'), { nodes: ['Q1'], edges: [], directions: [] });
  assert.equal(eligible({ evidence: 'referenced', rank: 'normal', references: [] }), false);
});
test('shared birthplace, death place and administrative geography cannot form professional paths', () => {
  const graph = emptyGraph();
  for (const id of ['Q1', 'Q2', 'Q3']) graph.nodes.set(id, { id });
  for (const property of ['P19', 'P20', 'P131']) {
    graph.edges.clear();
    graph.edges.set('a', { id: 'a', from: 'Q1', to: 'Q3', property, evidence: 'referenced', references: [{ urls: ['https://example.org/ref'] }], rank: 'normal' });
    graph.edges.set('b', { id: 'b', from: 'Q2', to: 'Q3', property, evidence: 'referenced', references: [{ urls: ['https://example.org/ref'] }], rank: 'normal' });
    assert.equal(shortestPath(graph, 'Q1', 'Q2'), null);
  }
});
test('known consulted paths longer than expansion depth are returned, not reported absent', async () => {
  const graph = emptyGraph();
  for (let i = 0; i <= 6; i++) { graph.nodes.set(`Q9880${i}`, { id: `Q9880${i}` }); graph.expanded.add(`Q9880${i}`); }
  for (let i = 0; i < 6; i++) graph.edges.set(`e${i}`, { id: `e${i}`, from: `Q9880${i}`, to: `Q9880${i + 1}`, property: 'P108', rank: 'normal', evidence: 'referenced', references: [{ documents: ['Q99'] }] });
  const result = await findRemotePath(graph, 'Q98800', 'Q98806', {});
  assert.equal(result.path.edges.length, 6); assert.equal(result.queries, 0);
});
test('demo is explicitly fictional, isolated from real paths, and contains no claimed sources', () => {
  const graph = demoGraph();
  assert.ok([...graph.nodes.values()].every(e => e.fictional && !e.id.startsWith('Q')));
  assert.ok([...graph.edges.values()].every(e => e.fictional && !e.references.length && !eligible(e)));
  assert.equal(shortestPath(graph, 'D1', 'D2'), null);
  assert.ok(shortestPath(graph, 'D1', 'D2', {}, true));
});
test('identity uses human Q5 and exact Wikipedia sitelinks, never name matching', () => {
  const person = entityFromRaw({ id: 'Q1', labels: { fr: { value: 'Nom ambigu' } }, claims: { P31: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q5' } } } }] }, sitelinks: { frwiki: { title: 'Titre exact (personne)' } } });
  assert.equal(person.type, 'person');
  assert.equal(person.wiki, 'https://fr.wikipedia.org/wiki/Titre%20exact%20(personne)');
  assert.equal(entityFromRaw({ id: 'Q2', claims: {} }).wiki, null);
  assert.equal(dateValue({ time: '+2000-00-00T00:00:00Z', precision: 9 }).display, '2000');
  assert.equal(dateValue({ time: '+1900-00-00T00:00:00Z', precision: 7 }), null);
  assert.equal(safeURL('data:text/html,unsafe'), null);
  assert.equal(dateValue({ time: '-0044-03-15T00:00:00Z', precision: 11 }).display, '15/03/-44');
  assert.equal(dateValue({ time: '-0044-00-00T00:00:00Z', precision: 9 }).year, -44);
  assert.equal(inPeriod({ dates: { P585: [date(-44)] } }, { from: -50, to: -40, undated: false }), true);
  assert.equal(entityFromRaw({ id: 'Q6', claims: {} }).type, 'unknown');
  assert.equal(entityFromRaw({ id: 'Q6', claims: {} }, 'person').type, 'unknown');
  assert.equal(entityFromRaw({ id: 'Q6', claims: {} }, 'event').type, 'event');
  assert.equal(entityFromRaw({ id: 'Q6', claims: { P31: [{ rank: 'normal', mainsnak: { datavalue: { value: { id: 'Q1656682' } } } }] } }).typeBasis, 'wikidata');
});
test('remote search falls back to English and does not select or invent an identity', async t => {
  const languages = [];
  t.mock.method(globalThis, 'fetch', async url => {
    const language = new URL(url).searchParams.get('language'); languages.push(language);
    return { ok: true, json: async () => ({ search: language === 'fr' ? [] : [{ id: 'Q987654', label: 'Exact returned label', description: 'Returned description' }, { id: 'not-a-qid', label: 'Invalid' }] }) };
  });
  const results = await searchEntities('unique-fallback-test');
  assert.deepEqual(languages, ['fr', 'en']);
  assert.deepEqual(results.map(e => e.id), ['Q987654']);
});
test('entity requests batch, deduplicate and cache bounded public responses', async t => {
  let requests = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    requests++; assert.equal(new URL(url).searchParams.get('ids'), 'Q987601|Q987602');
    return { ok: true, json: async () => ({ entities: { Q987601: { id: 'Q987601' }, Q987602: { id: 'Q987602' } } }) };
  });
  const entities = await getEntities(['Q987601', 'Q987601', 'Q987602', 'invalid']);
  entities.Q987601.id = 'mutated';
  const cached = await getEntities(['Q987601', 'Q987602']);
  assert.equal(requests, 1); assert.equal(cached.Q987601.id, 'Q987601');
  await assert.rejects(getEntities(['Q987699'], { budget: { queries: LIMITS.queries } }), /Limite de requêtes/);
});
test('incoming source failure is partial, not evidence of absence; outgoing claims remain usable', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url);
    if (parsed.hostname === 'query.wikidata.org') throw new Error('offline');
    const ids = parsed.searchParams.get('ids').split('|');
    return { ok: true, json: async () => ({ entities: Object.fromEntries(ids.map(id => [id, {
      id, labels: { fr: { value: id } }, claims: id === 'Q987610' ? { P108: [claim('Q987611', [source('https://example.org/ref')])] } : {},
    }])) }) };
  });
  const graph = emptyGraph();
  await expandEntity(graph, 'Q987610');
  assert.equal(graph.partial, true); assert.equal(graph.nodes.size, 2);
  assert.ok(shortestPath(graph, 'Q987610', 'Q987611'));
  const result = await findRemotePath(graph, 'Q987610', 'Q987611', {});
  assert.equal(result.incomplete, true); assert.ok(result.path);
});
test('failed incoming expansions remain retryable; success clears partial state and preserves category hints', async t => {
  let incomingCalls = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url);
    if (parsed.hostname === 'query.wikidata.org') {
      incomingCalls++;
      if (incomingCalls === 1) throw new Error('temporary outage');
      return { ok: true, json: async () => ({ results: { bindings: [] } }) };
    }
    return { ok: true, json: async () => ({ entities: { Q987640: { id: 'Q987640', claims: {}, labels: { fr: { value: 'Événement de test' } } } } }) };
  });
  const graph = emptyGraph(); graph.nodes.set('Q987640', { id: 'Q987640', type: 'event' });
  await expandEntity(graph, 'Q987640');
  assert.equal(graph.expanded.has('Q987640'), true); assert.equal(graph.partialExpanded.has('Q987640'), true); assert.equal(graph.partial, true);
  await expandEntity(graph, 'Q987640');
  assert.equal(incomingCalls, 2); assert.equal(graph.partialExpanded.size, 0); assert.equal(graph.partial, false);
  assert.equal(graph.nodes.get('Q987640').type, 'event'); assert.equal(graph.nodes.get('Q987640').typeBasis, 'relationship');
});
test('incoming entity retrieval failure preserves outgoing assertions and remains retryable', async t => {
  t.mock.method(globalThis, 'fetch', async url => {
    const parsed = new URL(url);
    if (parsed.hostname === 'query.wikidata.org') return { ok: true, json: async () => ({ results: { bindings: [{ item: { value: 'http://www.wikidata.org/entity/Q987652' } }] } }) };
    const ids = parsed.searchParams.get('ids').split('|');
    if (ids.includes('Q987652')) throw new Error('incoming entities unavailable');
    return { ok: true, json: async () => ({ entities: Object.fromEntries(ids.map(id => [id, {
      id, claims: id === 'Q987651' ? { P108: [claim('Q987653', [source('https://example.org/ref')])] } : {},
    }])) }) };
  });
  const graph = emptyGraph();
  await expandEntity(graph, 'Q987651');
  assert.equal(graph.partialExpanded.has('Q987651'), true); assert.equal(graph.partial, true);
  assert.ok(shortestPath(graph, 'Q987651', 'Q987653'));
});
test('cancellation never commits an unfinished expansion into the graph', async t => {
  const controller = new AbortController(), graph = emptyGraph();
  t.mock.method(globalThis, 'fetch', async () => {
    controller.abort(new Error('cancelled'));
    return { ok: true, json: async () => ({ entities: { Q987620: { id: 'Q987620', claims: {} } } }) };
  });
  await assert.rejects(expandEntity(graph, 'Q987620', { signal: controller.signal }), /cancelled/);
  assert.equal(graph.nodes.size, 0); assert.equal(graph.expanded.size, 0);
});
test('total remote failure is an incomplete search, never a verified absence', async t => {
  t.mock.method(globalThis, 'fetch', async () => { throw new Error('offline'); });
  const result = await findRemotePath(emptyGraph(), 'Q987630', 'Q987631', {});
  assert.equal(result.path, null); assert.equal(result.incomplete, true);
  assert.ok(result.queries <= LIMITS.queries);
});
test('Wikipedia biography uses the exact French sitelink and caches without name search', async t => {
  let queries = 0;
  t.mock.method(globalThis, 'fetch', async url => {
    queries++;
    const parsed = new URL(url);
    assert.equal(parsed.hostname, 'fr.wikipedia.org');
    assert.equal(parsed.searchParams.get('titles'), 'Titre exact de test (personne)');
    assert.equal(parsed.searchParams.has('search'), false);
    return { ok: true, json: async () => ({ query: { pages: [{ title: 'Titre exact de test (personne)', extract: 'Extrait retourné par la source.' }] } }) };
  });
  const entity = { id: 'Q988100', label: 'Un nom ambigu qui ne doit pas être recherché', wikiTitle: 'Titre exact de test (personne)', wikiLang: 'fr' };
  const summary = await getWikipediaSummary(entity);
  assert.equal(summary.text, 'Extrait retourné par la source.'); assert.equal(summary.language, 'fr');
  await getWikipediaSummary(entity); assert.equal(queries, 1);
  assert.equal(await getWikipediaSummary({ id: 'Q988101', label: entity.label }), null);
  assert.equal(await getWikipediaSummary({ ...entity, fictional: true }), null);
});
test('missing Wikipedia biography and cancellation never trigger a homonym fallback', async t => {
  let calls = 0;
  t.mock.method(globalThis, 'fetch', async () => { calls++; return { ok: true, json: async () => ({ query: { pages: [{ missing: true }] } }) }; });
  assert.equal(await getWikipediaSummary({ id: 'Q988102', wikiTitle: 'Sitelink absent de test', wikiLang: 'en' }), null);
  assert.equal(calls, 1);
  const controller = new AbortController(); controller.abort(new Error('selection changed'));
  await assert.rejects(getWikipediaSummary({ id: 'Q988103', wikiTitle: 'Sitelink annulé de test', wikiLang: 'fr' }, { signal: controller.signal }), /selection changed/);
  assert.equal(calls, 1);
});
