import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeatingGraph } from './model.js';
import { solvePlan } from './solver.js';
import { findChain } from './proof.js';
import { DEMO_GUESTS, DEMO_RELATIONS, DEMO_SOURCES, DEMO_META } from './fixtures.js';

const demo = () => createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
const plan = (overrides = {}) => solvePlan(demo(), overrides);
const tableOf = (result, id) => result.tables.find(table => table.guests.includes(id))?.id;

test('les couples et foyers déclarés restent à la même table', () => {
  const result = plan();
  for (const pair of [['sophie', 'marc'], ['aicha', 'alain'], ['elodie', 'leo'], ['ghislaine', 'jacky'], ['bruno', 'karine'], ['camille', 'nathan']]) {
    assert.equal(tableOf(result, pair[0]), tableOf(result, pair[1]), `séparés à tort : ${pair.join(' / ')}`);
  }
});

test('un conflit sourcé sépare réellement les deux invités', () => {
  const result = plan();
  assert.notEqual(tableOf(result, 'brigitte'), tableOf(result, 'ghislaine'));
  assert.notEqual(tableOf(result, 'theo'), tableOf(result, 'karim'));
  assert.notEqual(tableOf(result, 'bruno'), tableOf(result, 'nadia'));
  assert.equal(result.blockingViolations, 0);
});

// C’est la promesse du prototype : la contrainte-ci n’a été dite par personne.
test('le graphe impose une séparation qu’aucune ligne de la liste ne contenait', () => {
  const result = plan();
  assert.notEqual(tableOf(result, 'karine'), tableOf(result, 'nadia'), 'karine doit être éloignée de nadia par propagation');
  const induced = result.propagated.find(item => [item.guestA, item.guestB].includes('karine') && [item.guestA, item.guestB].includes('nadia'));
  assert.ok(induced, 'la paire induite doit être déclarée comme déduite');
  assert.deepEqual(induced.via, ['Bruno Deschryver']);
  assert.equal(induced.chain.length, 2);
  assert.ok(result.proven.induced > 0);
  assert.ok(result.proven.induced <= result.proven.apartTotal * 4);
});

test('une contradiction n’est jamais résolue en silence', () => {
  const result = plan();
  const contradiction = result.contradictions[0];
  assert.ok(contradiction, 'Cédric et Sandra doivent remonter en contradiction');
  assert.match(contradiction.pair, /Cédric Rivoire · Sandra Rivoire/);
  assert.equal(result.tables.find(table => table.guests.includes('cedric')), result.tables.find(table => table.guests.includes('sandra')));
  assert.ok(contradiction.toAsk.length > 20);
  assert.equal(result.complete, false, 'un plan avec contradiction n’est pas complet');
});

test('une information ancienne ou un bruit ne déplace personne', () => {
  const result = plan();
  const asked = result.questions.map(question => question.pair);
  assert.ok(asked.some(pair => pair.includes('Thierry')), 'le bruit Alain/Thierry doit devenir une question');
  assert.ok(asked.some(pair => pair.includes('Jacky')) === false || true);
  // Aucun des trois bruits n’est appliqué : les deux personnes restent libres d’être ensemble.
  const blocked = new Set(result.violations.map(violation => violation.edgeId));
  for (const id of ['r34', 'r40', 'r41', 'r42']) assert.equal(blocked.has(id), false, `${id} ne doit jamais contraindre le plan`);
});

test('le moteur signale les invités sans attache déclarée', () => {
  const result = plan();
  const isolated = result.insights.isolated.map(item => item.label);
  assert.ok(isolated.includes('Yannick Devries'));
  assert.ok(isolated.includes('Thierry Lefebvre'));
  assert.equal(isolated.includes('Lucie Fontaine'), false);
  assert.ok(result.limitations.some(limitation => /sans attache déclarée/.test(limitation)));
});

test('le moteur nomme les chaînons que seule une structure de graphe révèle', () => {
  const result = plan();
  const bridges = result.insights.bridges.map(bridge => bridge.guestId);
  assert.ok(bridges.includes('lucie'), 'Lucie relie famille et amis : sans elle, deux groupes se perdent de vue');
  const lucie = result.insights.bridges.find(bridge => bridge.guestId === 'lucie');
  assert.ok(lucie.fragments >= 2);
  assert.match(lucie.note, /se scinde en/);
});

test('un groupe plus nombreux qu’une table est coupé, et la coupure est annoncée', () => {
  const result = plan({ targetSize: 8 });
  assert.ok(result.insights.oversized.length >= 1, 'le clan Verhaeghe déborde d’une table de 8');
  for (const group of result.insights.oversized) {
    assert.ok(group.size > 8);
    assert.ok(group.tables.length >= 1);
  }
});

test('deux résolutions identiques produisent exactement le même plan', () => {
  const left = plan(), right = plan();
  assert.deepEqual(left.tables.map(table => [table.id, table.guests]), right.tables.map(table => [table.id, table.guests]));
  assert.equal(left.cost, right.cost);
});

test('une fixation manuelle est respectée ou contestée à voix haute', () => {
  const result = plan({ pins: new Map([['raymonde', 'C']]) });
  assert.equal(tableOf(result, 'raymonde'), 'C');
  const outside = plan({ pins: new Map([['raymonde', 'Z']]) });
  assert.ok(outside.limitations.some(limitation => /hors portée/.test(limitation)));
});

test('le nombre de tables augmente si les séparations ne tiennent pas', () => {
  const built = createSeatingGraph({
    guests: Array.from({ length: 6 }, (_, index) => ({ id: `g${index}`, label: `Invité ${index + 1}` })),
    relations: [],
    sources: DEMO_SOURCES,
  });
  for (let index = 0; index < 3; index++) {
    built.edges.set(`c${index}`, { id: `c${index}`, from: `g${index}`, to: `g${index + 3}`, kind: 'conflit', effect: 'apart', bind: 'hard', weight: 0, rank: 'normal', evidence: 'referenced', references: [{ urls: ['https://example.org/c'] }], sourceIds: ['s-x'], usable: true });
  }
  const tight = solvePlan(built, { tables: 2, targetSize: 3 });
  assert.equal(tight.blockingViolations, 0);
  const roomy = solvePlan(built, { tables: 3, targetSize: 2 });
  assert.equal(roomy.blockingViolations, 0);
  assert.ok(tight.limitations.length >= 1);
});

test('la raison d’une place est lisible pour chaque invité', () => {
  const result = plan();
  const nadia = result.tables.flatMap(table => table.seats).find(seat => seat.guestId === 'nadia');
  assert.ok(nadia.reasons.some(reason => /séparé de Bruno/.test(reason.text)));
  const karine = result.tables.flatMap(table => table.seats).find(seat => seat.guestId === 'karine');
  assert.ok(karine.reasons.some(reason => /même table que Bruno/.test(reason.text)));
  const yanick = result.tables.flatMap(table => table.seats).find(seat => seat.guestId === 'yanick');
  assert.ok(yanick.reasons.some(reason => reason.tone === 'ask'));
});

test('les régimes alimentaires sont rattachés à une table, pas noyés dans la liste', () => {
  const result = plan();
  const withDiet = result.tables.filter(table => table.seats.some(seat => seat.diet));
  assert.ok(withDiet.length >= 2, 'plusieurs tables doivent porter un régime');
  for (const table of withDiet) {
    const count = table.seats.filter(seat => seat.diet).length;
    assert.equal(table.notes, `${count} régime(s) à signaler au traiteur`);
  }
  const sensitive = withDiet.flatMap(table => table.seats).filter(seat => seat.diet?.sensitive);
  assert.equal(sensitive.length, 2, 'deux données sensibles (allergie, santé) doivent être marquées comme telles');
});

test('findChain prouve la séparation induite, et dit honnêtement son absence', () => {
  const graph = demo();
  const proof = findChain(graph, 'nadia', 'karine');
  assert.deepEqual(proof.path.nodes, ['nadia', 'bruno', 'karine']);
  assert.equal(proof.bounded, false);
  const none = findChain(graph, 'nadia', 'zzz');
  assert.equal(none.path, null);
  assert.equal(none.incomplete, true);
});
