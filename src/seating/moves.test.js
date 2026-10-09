import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createSeatingGraph } from './model.js';
import { solvePlan } from './solver.js';
import { canSitAt, groupOf } from './moves.js';
import { DEMO_GUESTS, DEMO_META, DEMO_RELATIONS, DEMO_SOURCES } from './fixtures.js';

function fixture() {
  const graph = createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
  return { graph, plan: solvePlan(graph, { targetSize: DEMO_META.event.targetSize || 8, iterations: 900 }) };
}
const tableOf = (plan, id) => plan.tables.find(table => table.guests.includes(id))?.id;

test('un couple se déplace avec son partenaire, jamais à moitié', () => {
  const { graph, plan } = fixture();
  const group = groupOf(graph, 'karine');
  assert.ok(group.ids.includes('bruno'), 'Karine et Bruno forment un seul bloc à déplacer');
  assert.ok(group.hard);
  const alone = groupOf(graph, 'yanick');
  assert.deepEqual(alone.ids, ['yanick'], 'un invité sans attache bouge seul');
  assert.equal(alone.hard, false);
});

test('déposer quelqu’un chez la personne qu’il fuit est refusé, et le motif est nommable', () => {
  const { graph, plan } = fixture();
  const nadiaTable = tableOf(plan, 'nadia');
  const brunoTable = tableOf(plan, 'bruno');
  assert.notEqual(nadiaTable, brunoTable, 'sur le plan résolu, Nadia et Bruno sont bien séparés');
  const answer = canSitAt(graph, plan, 'nadia', brunoTable);
  assert.equal(answer.ok, false);
  assert.equal(answer.code, 'apart');
  const pair = [answer.blocked[0].guestId, answer.blocked[0].otherId].sort();
  assert.deepEqual(pair, ['bruno', 'nadia'].sort(), 'le refus porte les deux personnes concernées, pas un numéro de ligne');
});

test('une rumeur non confirmée n’interdit aucune table', () => {
  const { graph, plan } = fixture();
  // thierry n’est lié à personne par une ligne confirmée : on peut le poser n’importe où.
  for (const table of plan.tables) {
    const answer = canSitAt(graph, plan, 'thierry', table.id);
    if (tableOf(plan, 'thierry') === table.id) continue;
    assert.notEqual(answer.code, 'apart', `un bruit ne doit jamais bloquer la ${table.id}`);
  }
});

test('le refus peut être passé outre, et alors la seule règle qui reste est celle des chaises', () => {
  const { graph, plan } = fixture();
  const brunoTable = tableOf(plan, 'bruno');
  const forced = canSitAt(graph, plan, 'nadia', brunoTable, { force: true });
  assert.notEqual(forced.code, 'apart', 'forcer lève le blocage entre personnes');
  assert.ok(forced.ok || forced.code === 'over', `il ne reste que la place disponible (code ${forced.code})`);
});

test('une chaise libre autorise le dépôt, une table pleine le refuse en donnant les nombres', () => {
  const graph = createSeatingGraph({
    guests: Array.from({ length: 11 }, (_, index) => ({ id: `g${index}`, label: `Personne ${index}`, side: 'commun' })),
    relations: [], sources: {}, meta: { event: { targetSize: 4 } },
  });
  const plan = solvePlan(graph, { targetSize: 4, iterations: 300 });
  assert.equal(plan.capacity, 4, 'quatre chaises par table dans ce jeu');
  const empty = plan.tables.find(table => table.guests.length < plan.capacity);
  const full = plan.tables.find(table => table.guests.length === plan.capacity && !table.guests.includes('g0'));
  assert.ok(empty && full, 'le jeu doit contenir une table avec une chaise libre et une table pleine');
  assert.ok(canSitAt(graph, plan, 'g0', empty.id).ok, 'là où il reste une chaise, on peut poser quelqu’un');
  const crowded = canSitAt(graph, plan, 'g0', full.id);
  assert.equal(crowded.code, 'over');
  assert.equal(crowded.need, plan.capacity + 1, 'on dit combien il y aura de personnes');
  assert.equal(crowded.capacity, plan.capacity, 'et combien il y a de chaises');
  assert.ok(!('blocked' in crowded), 'une table pleine n’est pas un conflit entre personnes : ce n’est pas le même message');
});

test('déposer quelqu’un sur sa propre table n’est pas un déplacement', () => {
  const { graph, plan } = fixture();
  const here = tableOf(plan, 'camille');
  assert.equal(canSitAt(graph, plan, 'camille', here).code, 'already');
});

test('le module ne rédige pas : que des identifiants et des nombres', () => {
  const { graph, plan } = fixture();
  const answer = canSitAt(graph, plan, 'nadia', tableOf(plan, 'bruno'));
  for (const value of Object.values(answer)) {
    if (Array.isArray(value)) for (const item of value) assert.ok(!('text' in item) && !('message' in item));
    else assert.ok(typeof value !== 'string' || value.length <= 8, 'aucune phrase dans la règle');
  }
});
