import test from 'node:test';
import assert from 'node:assert/strict';
import { buildTimeline, relationDates } from './timeline.js';
import { dateValue, demoGraph, entityFromRaw, relationshipsFromRaw } from './data.js';

const time = (value, precision = 9) => ({ datavalue: { value: { time: value, precision } } });
const claim = (id, target, qualifiers = {}) => ({ id, rank: 'normal', mainsnak: { datavalue: { value: { id: target } } }, qualifiers, references: [] });
const nodes = entries => new Map(entries.map(([id, label, extra = {}]) => [id, { id, label, ...extra }]));

test('only P580/P582/P585 date a relationship; publication-only relations stay undated', () => {
  const edges = relationshipsFromRaw({ id: 'Q1', claims: {
    P108: [claim('a', 'Q2', { P580: [time('+1930-00-00T00:00:00Z')], P582: [time('+1940-00-00T00:00:00Z')] })],
    P50: [claim('b', 'Q3', { P577: [time('+1925-00-00T00:00:00Z')] })],
    P800: [claim('c', 'Q4', { P585: [time('+1910-05-12T00:00:00Z', 11)] })],
    P463: [claim('d', 'Q5')],
  } });
  const timeline = buildTimeline('Q1', edges, nodes([['Q1', 'Sujet'], ['Q2', 'Institut'], ['Q3', 'Livre'], ['Q4', 'Œuvre'], ['Q5', 'Société']]));
  assert.deepEqual(timeline.dated.map(step => step.id), ['c', 'a']);
  assert.deepEqual(timeline.undated.map(step => step.id).sort(), ['b', 'd']);
  assert.equal(timeline.dated[0].when.display, '12/05/1910');
  assert.equal(timeline.dated[1].when.display, '1930 → 1940');
  assert.ok(timeline.dated.every(step => !step.when.display.includes('1925')));
});

test('biographical dates are kept apart from relationship steps', () => {
  const person = entityFromRaw({ id: 'Q1', claims: {
    P31: [{ mainsnak: { datavalue: { value: { id: 'Q5' } } } }],
    P569: [{ mainsnak: { datavalue: { value: { time: '+1880-01-01T00:00:00Z', precision: 11 } } } }],
    P570: [{ mainsnak: { datavalue: { value: { time: '+1950-00-00T00:00:00Z', precision: 9 } } } }],
  } });
  const timeline = buildTimeline('Q1', [], new Map([['Q1', person]]));
  assert.equal(timeline.biography.born.display, '01/01/1880');
  assert.equal(timeline.biography.died.display, '1950');
  assert.deepEqual(timeline.dated, []); assert.deepEqual(timeline.undated, []);
});

test('ordering respects precision, negative years and open intervals without inventing dates', () => {
  const edge = (id, dates) => ({ id, from: 'Q1', to: `T${id}`, dates });
  const edges = [
    edge('late', { P585: [dateValue({ time: '+1920-07-00T00:00:00Z', precision: 10 })] }),
    edge('early', { P585: [dateValue({ time: '+1920-02-00T00:00:00Z', precision: 10 })] }),
    edge('ancient', { P580: [dateValue({ time: '-0044-00-00T00:00:00Z', precision: 9 })] }),
    edge('until', { P582: [dateValue({ time: '+1800-00-00T00:00:00Z', precision: 9 })] }),
    edge('vague', { P585: [dateValue({ time: '+1900-00-00T00:00:00Z', precision: 7 })] }),
    edge('unrelated', { P585: [dateValue({ time: '+1700-00-00T00:00:00Z', precision: 9 })] }),
  ];
  edges[5].from = 'Q9';
  const timeline = buildTimeline('Q1', edges, new Map());
  assert.deepEqual(timeline.dated.map(step => step.id), ['ancient', 'until', 'early', 'late']);
  assert.equal(timeline.dated[0].when.display, 'depuis -44');
  assert.equal(timeline.dated[1].when.display, 'jusqu’à 1800');
  assert.deepEqual(timeline.undated.map(step => step.id), ['vague']);
  assert.equal(relationDates({ dates: { P577: [{ year: 2000, display: '2000' }] } }), null);
});

test('incoming and outgoing relations are both included, with their neighbor', () => {
  const graph = demoGraph();
  const timeline = buildTimeline('D6', [...graph.edges.values()], graph.nodes);
  assert.ok(timeline.dated.length > 0 && timeline.undated.length > 0);
  assert.ok([...timeline.dated, ...timeline.undated].every(step => step.edge.from === 'D6' || step.edge.to === 'D6'));
  assert.ok(timeline.dated.every(step => step.otherId !== 'D6' && step.other));
  assert.deepEqual(timeline.dated.map(step => step.when.anchor.year), [...timeline.dated.map(step => step.when.anchor.year)].sort((a, b) => a - b));
});
