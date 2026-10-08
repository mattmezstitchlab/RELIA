import test from 'node:test';
import assert from 'node:assert/strict';
import { compareSnapshots, createSnapshot, exportRegistry, validateSnapshot } from './discovery.js';

const sourceIds = ['fixture:baseline'];
const params = { depth: 4, maxNodes: 100, maxEdges: 180, period: { from: null, to: null, undated: true } };
const reference = url => ({ id: `ref:${url}`, urls: [url], documents: [], retrievedAt: '2026-10-01T00:00:00.000Z' });
const relation = (id, from, to, extra = {}) => ({
  id, from, to, property: 'P108', label: 'employeur', rank: 'normal', fictional: false,
  evidence: 'referenced', claimStatus: 'assertion', references: [reference(`https://fixtures.invalid/${id}`)], ...extra,
});
function graph(nodes = [], edges = [], { partial = false, capped = false, expanded = [] } = {}) {
  return { nodes: new Map(nodes.map(node => [node.id, node])), edges: new Map(edges.map(edge => [edge.id, edge])),
    partial, capped, expanded: new Set(expanded) };
}
function pair(number, beforeGraph, afterGraph, options = {}) {
  const identities = options.identities || [`SYN-${number}-A`, `SYN-${number}-B`];
  const before = createSnapshot({
    graph: beforeGraph, roots: identities, sources: sourceIds, parameters: params,
    origin: options.beforeOrigin || 'simulated', retrievedAt: `2026-10-01T00:00:${String(number).padStart(2, '0')}Z`,
    errors: options.beforeErrors || [], limitations: options.beforeLimitations || [],
  });
  const after = createSnapshot({
    graph: afterGraph, roots: identities,
    sources: options.afterSources || [...sourceIds, 'fixture:enrichment'],
    parameters: options.afterParameters || params, origin: options.afterOrigin || 'simulated',
    retrievedAt: `2026-10-02T00:00:${String(number).padStart(2, '0')}Z`,
    errors: options.afterErrors || [], limitations: options.afterLimitations || [],
  });
  return { before, after };
}

const fixtures = [];
for (let number = 1; number <= 10; number++) {
  const [a, b, middle] = [`SYN-${number}-A`, `SYN-${number}-B`, `SYN-${number}-M`];
  fixtures.push({
    number, expected: ['NEW_ENTITY', 'NEW_PATH', 'NEW_RELATION'],
    pair: pair(number, graph([{ id: a }, { id: b }]), graph(
      [{ id: a }, { id: b }, { id: middle }],
      [relation(`fixture-${number}-1`, a, middle), relation(`fixture-${number}-2`, middle, b)],
    )),
  });
}
{
  const [a, b] = ['SYN-11-A', 'SYN-11-B'];
  fixtures.push({
    number: 11, expected: ['NEW_EVIDENCE'],
    pair: pair(11, graph([{ id: a }, { id: b }], [relation('fixture-11', a, b)]),
      graph([{ id: a }, { id: b }], [relation('fixture-11', a, b, { references: [
        reference('https://fixtures.invalid/fixture-11'), reference('https://fixtures.invalid/independent-proof-11'),
      ] })])),
  });
}
{
  const [a, b, oldId, newId] = ['SYN-12-A', 'SYN-12-B', 'SYN-12-OLD', 'SYN-12-NEW'];
  fixtures.push({
    number: 12, expected: ['IDENTITY_RECONCILED'],
    pair: pair(12, graph([{ id: a }, { id: b }, { id: oldId, externalIds: [{ namespace: 'isni', value: '0000000123456789', reliable: true }] }],
      [relation('fixture-12-1', a, oldId), relation('fixture-12-2', oldId, b)]),
    graph([{ id: a }, { id: b }, { id: newId, externalIds: [{ namespace: 'isni', value: '0000000123456789', reliable: true }] }],
      [relation('fixture-12-1', a, newId), relation('fixture-12-2', newId, b)])),
  });
}
{
  const [a, b] = ['SYN-13-A', 'SYN-13-B'];
  fixtures.push({
    number: 13, expected: ['HYPOTHESIS'],
    pair: pair(13, graph([{ id: a }, { id: b }]), graph([{ id: a }, { id: b }], [
      relation('fixture-13', a, b, { evidence: 'unverified', claimStatus: 'hypothesis', references: [] }),
    ])),
  });
}
{
  const [a, b, mid] = ['SYN-14-A', 'SYN-14-B', 'SYN-14-M'];
  fixtures.push({
    number: 14, expected: ['INCOMPARABLE'],
    pair: pair(14, graph([{ id: a }, { id: b }], [], { partial: true }), graph(
      [{ id: a }, { id: b }, { id: mid }], [relation('fixture-14-1', a, mid), relation('fixture-14-2', mid, b)])),
  });
}
{
  const [a, b] = ['SYN-15-A', 'SYN-15-B'];
  fixtures.push({
    number: 15, expected: [],
    pair: pair(15, graph([{ id: a }, { id: b }]), graph([{ id: a }, { id: b }], [], { partial: true }),
      { afterErrors: ['fixture API unavailable'] }),
  });
}
{
  const [a, b] = ['SYN-16-A', 'SYN-16-B'];
  fixtures.push({
    number: 16, expected: ['INCOMPARABLE'],
    pair: pair(16, graph([{ id: a }, { id: b }]), graph([{ id: a }, { id: b }]),
      { afterParameters: { ...params, depth: 5 } }),
  });
}
{
  const [a, b, beforeId, afterId] = ['SYN-17-A', 'SYN-17-B', 'SYN-17-X1', 'SYN-17-X2'];
  fixtures.push({
    number: 17, expected: ['NEW_ENTITY'],
    pair: pair(17, graph([{ id: a }, { id: b }, { id: beforeId, label: 'Alex Martin' }]),
      graph([{ id: a }, { id: b }, { id: beforeId, label: 'Alex Martin' }, { id: afterId, label: 'Alex Martin' }])),
  });
}
{
  const [a, b] = ['SYN-18-A', 'SYN-18-B'];
  fixtures.push({
    number: 18, expected: ['NEW_PATH', 'NEW_RELATION'],
    pair: pair(18, graph([{ id: a }, { id: b }]), graph([{ id: a }, { id: b }], [relation('fixture-18', b, a)])),
  });
}
{
  const [a, b, c] = ['SYN-19-A', 'SYN-19-B', 'SYN-19-C'];
  fixtures.push({
    number: 19, expected: ['CONTRADICTION'],
    pair: pair(19, graph([{ id: a }, { id: b }, { id: c }], [relation('fixture-19-claim', a, b)]),
      graph([{ id: a }, { id: b }, { id: c }], [relation('fixture-19-claim', a, c)])),
  });
}
{
  const [a, b] = ['SYN-20-A', 'SYN-20-B'];
  fixtures.push({
    number: 20, expected: ['INCOMPARABLE'],
    pair: pair(20, graph([{ id: a }, { id: b }]), graph([{ id: a }, { id: b }]), { afterOrigin: 'real' }),
  });
}

test('the 20 reproducible identity-pair fixtures keep simulated results explicit', () => {
  assert.equal(fixtures.length, 20);
  for (const fixture of fixtures) {
    const result = compareSnapshots(fixture.pair.before, fixture.pair.after);
    assert.equal(fixture.pair.before.origin, 'simulated', `fixture ${fixture.number}`);
    assert.deepEqual([...new Set(result.entries.map(entry => entry.type))].sort(), [...fixture.expected].sort(), `fixture ${fixture.number}`);
  }
});

test('documented paths retain assertion direction and reverse traversal is not rewritten', () => {
  const fixture = fixtures[17], result = compareSnapshots(fixture.pair.before, fixture.pair.after);
  const path = result.entries.find(entry => entry.type === 'NEW_PATH').path;
  assert.deepEqual(path.nodes, ['SYN-18-A', 'SYN-18-B']);
  assert.equal(path.edges[0].from, 'SYN-18-B');
  assert.equal(path.edges[0].to, 'SYN-18-A');
});

test('incomplete reference collection never turns a missing edge into a confirmed novelty', () => {
  const result = compareSnapshots(fixtures[13].pair.before, fixtures[13].pair.after);
  assert.equal(result.status, 'incomplete');
  assert.ok(result.entries.every(entry => entry.type !== 'NEW_RELATION' && entry.type !== 'NEW_PATH'));
  assert.ok(result.entries.some(entry => entry.type === 'INCOMPARABLE' && entry.details.candidateType === 'NEW_RELATION'));
});

test('hypotheses never enter paths; exact identifiers keep homonyms separate', () => {
  const hypothesis = compareSnapshots(fixtures[12].pair.before, fixtures[12].pair.after);
  assert.ok(hypothesis.entries.some(entry => entry.type === 'HYPOTHESIS'));
  assert.equal(hypothesis.entries.some(entry => entry.type === 'NEW_PATH'), false);
  const homonyms = compareSnapshots(fixtures[16].pair.before, fixtures[16].pair.after);
  assert.ok(homonyms.entries.some(entry => entry.type === 'NEW_ENTITY' && entry.entities.includes('SYN-17-X2')));
  assert.equal(homonyms.entries.some(entry => entry.type === 'IDENTITY_RECONCILED'), false);
});

test('reconciliation requires unique declared reliable external identifiers, never labels', () => {
  const ambiguous = fixtures[11].pair;
  const before = createSnapshot({
    graph: graph([{ id: 'SYN-12-A' }, { id: 'SYN-12-B' }, { id: 'OLD-1', externalIds: [{ namespace: 'isni', value: 'duplicate', reliable: true }] },
      { id: 'OLD-2', externalIds: [{ namespace: 'isni', value: 'duplicate', reliable: true }] }]),
    roots: ['SYN-12-A', 'SYN-12-B'], sources: sourceIds, parameters: params, origin: 'simulated', retrievedAt: '2026-10-01T00:00:00Z',
  });
  const after = createSnapshot({
    graph: graph([{ id: 'SYN-12-A' }, { id: 'SYN-12-B' }, { id: 'NEW-1', externalIds: [{ namespace: 'isni', value: 'duplicate', reliable: true }] }]),
    roots: ['SYN-12-A', 'SYN-12-B'], sources: [...sourceIds, 'fixture:enrichment'], parameters: params, origin: 'simulated', retrievedAt: '2026-10-02T00:00:00Z',
  });
  const result = compareSnapshots(before, after);
  assert.equal(result.entries.some(entry => entry.type === 'IDENTITY_RECONCILED'), false);
  assert.ok(result.entries.some(entry => entry.type === 'NEW_ENTITY' && entry.entities.includes('NEW-1')));
  assert.equal(ambiguous.before.origin, 'simulated');
});

test('new proof is detected by independent reference identity, not retrieval timestamps', () => {
  const result = compareSnapshots(fixtures[10].pair.before, fixtures[10].pair.after);
  const proof = result.entries.find(entry => entry.type === 'NEW_EVIDENCE');
  assert.ok(proof);
  assert.deepEqual(proof.references.map(item => item.urls[0]), ['https://fixtures.invalid/independent-proof-11']);
  const alteredRetrieval = createSnapshot({
    graph: graph([{ id: 'SYN-11-A' }, { id: 'SYN-11-B' }], [relation('fixture-11', 'SYN-11-A', 'SYN-11-B', {
      references: [reference('https://fixtures.invalid/fixture-11')],
    })]),
    roots: ['SYN-11-A', 'SYN-11-B'], sources: [...sourceIds, 'fixture:enrichment'], parameters: params,
    origin: 'simulated', retrievedAt: '2026-10-03T00:00:00Z',
  });
  assert.equal(compareSnapshots(fixtures[10].pair.before, alteredRetrieval).entries.some(entry => entry.type === 'NEW_EVIDENCE'), false);
});

test('snapshot integrity, incompatible scopes, and reproducible JSON export are enforced', () => {
  const { before, after } = fixtures[0].pair;
  assert.equal(validateSnapshot(before), true);
  assert.equal(validateSnapshot({ ...before, identities: ['changed', 'roots'] }), false);
  const mismatch = compareSnapshots(fixtures[15].pair.before, fixtures[15].pair.after);
  assert.equal(mismatch.comparable, false);
  assert.equal(mismatch.entries[0].type, 'INCOMPARABLE');
  const first = exportRegistry({ snapshots: [before, after], comparisons: [compareSnapshots(before, after)] });
  const second = exportRegistry({ snapshots: [before, after], comparisons: [compareSnapshots(before, after)] });
  assert.equal(first, second);
  assert.match(first, /une découverte historique inédite/);
});

test('changed assertion under a stable claim identifier is flagged as contradiction', () => {
  const result = compareSnapshots(fixtures[18].pair.before, fixtures[18].pair.after);
  assert.equal(result.entries.filter(entry => entry.type === 'CONTRADICTION').length, 1);
  assert.equal(result.entries.some(entry => entry.type === 'NEW_RELATION'), false);
});
