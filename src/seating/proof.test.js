import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeatingGraph } from './model.js';
import { adjacency, components, findChain, diffPlans, degreeOf, articulationPoints } from './proof.js';

const build = (guests, relations) => createSeatingGraph({
  guests,
  relations: relations.map((relation, index) => ({
    id: `e${index}`, references: [{ documents: ['form#1'] }], declaredBy: 's-mariee', ...relation,
  })),
  sources: { 's-mariee': { label: 'Mariée', reliable: true } },
});

const CHAIN = () => build(
  ['a', 'b', 'c', 'd', 'e'].map(id => ({ id, label: id.toUpperCase() })),
  [
    { from: 'a', to: 'b', kind: 'famille' },
    { from: 'b', to: 'c', kind: 'affinite' },
    { from: 'c', to: 'd', kind: 'affinite' },
    { from: 'd', to: 'e', kind: 'famille' },
  ],
);

test('la recherche de chaîne respecte la profondeur demandée', () => {
  const graph = CHAIN();
  assert.equal(findChain(graph, 'a', 'e', { maxDepth: 6 }).path.nodes.join('>'), 'a>b>c>d>e');
  const bounded = findChain(graph, 'a', 'e', { maxDepth: 2 });
  assert.equal(bounded.path, null);
  assert.equal(bounded.bounded, true);
  assert.match(bounded.reason, /recherche bornée/);
});

test('une relation sans source n’ouvre aucune chaîne', () => {
  const graph = build([{ id: 'a' }, { id: 'b' }], [{ from: 'a', to: 'b', kind: 'conflit', references: [] }]);
  assert.equal(findChain(graph, 'a', 'b').path, null);
  assert.equal(degreeOf(adjacency(graph, { onlyUsable: true }), 'a'), 0);
  assert.equal(findChain(graph, 'a', 'b', { onlyUsable: false }).path.nodes.length, 2);
});

test('les composantes comptent les groupes réels, pas les rapprochements par nom', () => {
  const graph = build(['a', 'b', 'c'].map(id => ({ id })), [{ from: 'a', to: 'b', kind: 'famille' }]);
  const groups = components(adjacency(graph, { onlyUsable: true }), ['a', 'b', 'c']);
  assert.deepEqual(groups, [['a', 'b'], ['c']]);
});

test('un point d’articulation est détecté, un simple voisin non', () => {
  const graph = CHAIN();
  const points = articulationPoints(adjacency(graph, { onlyUsable: true }), ['a', 'b', 'c', 'd', 'e']);
  assert.deepEqual(points, ['b', 'c', 'd']);
});

test('une table déplacée sans déclaration devient une question', () => {
  const before = { tables: [{ id: 'A', seats: [{ guestId: 'a' }, { guestId: 'b' }] }, { id: 'B', seats: [{ guestId: 'c' }] }], declaredMoves: [] };
  const after = {
    tables: [{ id: 'A', seats: [{ guestId: 'a' }] }, { id: 'B', seats: [{ guestId: 'b' }, { guestId: 'c' }] }],
    declaredMoves: [],
  };
  const diff = diffPlans(before, after);
  assert.equal(diff.moved.length, 1);
  assert.equal(diff.explained.length, 0);
  assert.match(diff.unexplained[0].question, /sans déclaration/);

  const declared = { ...after, declaredMoves: [{ guestId: 'b', to: 'B' }] };
  const second = diffPlans(before, declared);
  assert.equal(second.explained.length, 1);
  assert.equal(second.unexplained.length, 0);
});

test('un invité ajouté ou retiré est signalé comme tel', () => {
  const before = { tables: [{ id: 'A', seats: [{ guestId: 'a' }, { guestId: 'z' }] }], declaredMoves: [] };
  const after = { tables: [{ id: 'A', seats: [{ guestId: 'a' }, { guestId: 'n' }] }], declaredMoves: [] };
  const diff = diffPlans(before, after);
  assert.equal(diff.moved.length, 2);
  assert.ok(diff.unexplained.some(item => item.added));
  assert.ok(diff.unexplained.some(item => item.removed));
});
