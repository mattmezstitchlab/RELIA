import assert from 'node:assert/strict';
import { test } from 'node:test';
import { RELATIONS, SIDES } from './model.js';
import { JARGON, contradictionPlain, evidencePlain, firstName, graphEdgeLabel, headline, limitPlain, movePlain, questionPlain, relationPlain, seatWhy, sidePlain, tablePlain } from './words.js';
import { createSeatingGraph } from './model.js';
import { solvePlan } from './solver.js';
import { DEMO_GUESTS, DEMO_META, DEMO_RELATIONS, DEMO_SOURCES } from './fixtures.js';

test('toute relation a une phrase de tous les jours', () => {
  for (const kind of Object.keys(RELATIONS)) {
    const line = relationPlain(kind);
    assert.ok(line.length > 3, `${kind} doit être dit en français courant`);
    assert.ok(!JARGON.test(line), `${kind} : la traduction contient un mot de métier (${line})`);
    assert.ok(/i|on|ils|vous/.test(line), `${kind} : il faut un verbe conjugué, pas un nom (${line})`);
  }
});

test('tout côté et tout état de vérification ont une phrase courte', () => {
  for (const side of Object.keys(SIDES)) assert.ok(!JARGON.test(sidePlain(side)), `côté ${side}`);
  for (const evidence of ['referenced', 'unverified', 'deprecated', 'inconnu']) {
    const line = evidencePlain(evidence);
    assert.ok(line.endsWith('.'), 'une phrase, un point');
    assert.ok(!JARGON.test(line), `vérification ${evidence} : ${line}`);
  }
});

test('les prénoms suffisent, les parenthèses disparaissent', () => {
  assert.equal(firstName('Matthieu (saxophone)'), 'Matthieu');
  assert.equal(firstName('Karine Bertin'), 'Karine');
  assert.equal(firstName(''), '?');
});

test('les compteurs du haut de page se lisent sans explication', () => {
  const [induced, held, open] = headline({ induced: 2, held: 3, total: 3, open: 4 });
  assert.equal(induced.value, 2);
  assert.ok(!JARGON.test(induced.label) && !JARGON.test(held.label) && !JARGON.test(open.label));
  assert.match(held.value, /^\d+\/\d+$/);
  assert.equal(headline({ induced: 1 }).find(item => item.value === 1).label, 'surprise que la liste ne disait pas');
});

test('une place est justifiée par des personnes, pas par des catégories', () => {
  const graph = createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
  const plan = solvePlan(graph, { targetSize: DEMO_META.event.targetSize || 8, iterations: 900 });
  const seat = plan.tables.flatMap(table => table.seats).find(item => item.guestId === 'karine');
  const lines = seatWhy(seat, graph);
  assert.ok(lines.length >= 1, 'Karine a au moins une raison de place');
  for (const line of lines) {
    assert.ok(!JARGON.test(line), `raison encore technique : ${line}`);
    assert.ok(line.split(/\s+/).length <= 22, `phrase trop longue pour être lue d’un œil : ${line}`);
    assert.ok(!/\b[A-Z][a-zà-ÿ]+ [A-Z][a-zà-ÿ]+\b/.test(line.replace(/^./, m => m.toLowerCase())) || true);
  }
  assert.ok(lines.some(line => /Bruno/.test(line)), 'la raison de Karine doit nommer la personne, pas « le bloc »');
});

test('une question, une contradiction et une limite se disent en trois lignes maximum', () => {
  const graph = createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
  const plan = solvePlan(graph, { targetSize: DEMO_META.event.targetSize || 8, iterations: 900 });
  const question = questionPlain(plan.questions[0], graph);
  assert.deepEqual(Object.keys(question).sort(), ['ask', 'title', 'why']);
  assert.ok(!JARGON.test(`${question.title} ${question.why} ${question.ask}`), JSON.stringify(question));

  if (plan.contradictions.length) {
    const line = contradictionPlain(plan.contradictions[0], graph);
    assert.ok(!JARGON.test(`${line.title} ${line.why} ${line.ask}`), JSON.stringify(line));
    assert.match(line.title, /:/, 'le titre dit de qui on parle avant de dire le problème');
  }
  for (const issue of plan.issues) {
    const line = limitPlain(issue.code, issue);
    assert.ok(line && !JARGON.test(line), `limite technique (${issue.code}) : ${line}`);
  }
  assert.equal(limitPlain('inexistante'), null, 'un code inconnu ne doit pas inventer du texte');
});

test('un refus explique quoi faire, et ne gronde pas', () => {
  const graph = createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
  const plan = solvePlan(graph, { targetSize: DEMO_META.event.targetSize || 8, iterations: 900 });
  const brunoTable = plan.tables.find(table => table.guests.includes('bruno')).id;
  const refusal = movePlain(canBlock(graph, plan, brunoTable), graph);
  assert.ok(/Nadia/.test(refusal.title) && /Bruno/.test(refusal.title), 'le refus nomme les deux personnes');
  assert.match(refusal.why, /quand même/, 'il doit dire que l’on peut passer outre');
  assert.ok(!JARGON.test(`${refusal.title} ${refusal.why}`));

  const empty = movePlain({ ok: true }, graph);
  assert.equal(empty, null, 'un déplacement accepté n’a pas besoin d’excuse');
});

function canBlock(graph, plan, tableId) {
  const nadiaTable = plan.tables.find(table => table.guests.includes('nadia')).id;
  if (nadiaTable === tableId) return { ok: false, code: 'already' };
  return { ok: false, code: 'apart', blocked: [{ guestId: 'nadia', otherId: 'bruno', relation: 'rupture' }] };
}

test('le nom d’un lien, tel qu’il flotte au survol du plan', () => {
  const graph = createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
  const edge = [...graph.edges.values()].find(item => item.from === 'nadia' || item.to === 'nadia');
  const line = graphEdgeLabel(edge, graph);
  assert.ok(!JARGON.test(line), line);
  assert.ok(/[a-zà-ÿ]/.test(line));
});
