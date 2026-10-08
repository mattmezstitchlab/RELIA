import test from 'node:test';
import assert from 'node:assert/strict';
import { pickRevelation, revelationSource } from './savoir.js';

const edge = (id, from, to, property, extra = {}) => ({
  id, from, to, property, label: property, fictional: false, rank: 'normal', evidence: 'referenced',
  references: [{ urls: ['https://www.wikidata.org/wiki/Q1#P800'], documents: [], usable: true }], ...extra,
});
const nodes = new Map([
  ['Q1', { id: 'Q1', label: 'Marie Curie', type: 'person' }],
  ['Q2', { id: 'Q2', label: 'Radioactivité', type: 'work' }],
  ['Q3', { id: 'Q3', label: 'Varsovie', type: 'place' }],
  ['Q4', { id: 'Q4', label: 'Prix Nobel', type: 'event' }],
]);

test('no revelation without a documented relation on the focused identity', () => {
  assert.equal(pickRevelation('Q1', [], nodes), null);
  const undocumented = edge('e1', 'Q1', 'Q3', 'P19', { evidence: 'unverified', references: [] });
  assert.equal(pickRevelation('Q1', [undocumented], nodes), null);
});

test('a creation link to a work beats an award link to an event', () => {
  const edges = [edge('e1', 'Q1', 'Q4', 'P166'), edge('e2', 'Q1', 'Q2', 'P800')];
  const found = pickRevelation('Q1', edges, nodes);
  assert.equal(found.edge.id, 'e2');
  assert.equal(found.other.label, 'Radioactivité');
  assert.equal(found.focusFirst, true);
  assert.equal(found.relation, 'œuvre notable');
});

test('the focus can be the target of the documented edge', () => {
  const found = pickRevelation('Q2', [edge('e3', 'Q1', 'Q2', 'P800')], nodes);
  assert.equal(found.focusFirst, false);
  assert.equal(found.other.label, 'Marie Curie');
});

test('ties are resolved deterministically by edge id', () => {
  // Même propriété, même cible, même nombre de références : l’identifiant départage.
  const edges = [edge('e9', 'Q1', 'Q4', 'P166'), edge('e5', 'Q1', 'Q4', 'P166')];
  const found = pickRevelation('Q1', edges, nodes);
  assert.equal(found.edge.id, 'e5');
});

test('an edge whose other end has no label is ignored', () => {
  const found = pickRevelation('Q1', [edge('e7', 'Q1', 'Q9', 'P800')], nodes);
  assert.equal(found, null);
});

test('source prefers a cited URL, then falls back to a Wikidata reference document', () => {
  assert.deepEqual(revelationSource(edge('a', 'Q1', 'Q2', 'P800')), { url: 'https://www.wikidata.org/wiki/Q1#P800', label: 'Source citée' });
  const byDocument = edge('b', 'Q1', 'Q2', 'P800', { references: [{ urls: [], documents: ['Q42'], usable: true }] });
  assert.deepEqual(revelationSource(byDocument), { url: 'https://www.wikidata.org/wiki/Q42', label: 'Référence Wikidata' });
  assert.equal(revelationSource(edge('c', 'Q1', 'Q2', 'P800', { references: [] })), null);
});
