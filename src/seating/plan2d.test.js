import test from 'node:test';
import assert from 'node:assert/strict';
import { createSeatingGraph } from './model.js';
import { solvePlan } from './solver.js';
import { OVERLAYS, filterEdges, layoutPlan2D } from './plan2d.js';
import { DEMO_GUESTS, DEMO_META, DEMO_RELATIONS, DEMO_SOURCES } from './fixtures.js';

const built = () => createSeatingGraph({ guests: DEMO_GUESTS, relations: DEMO_RELATIONS, sources: DEMO_SOURCES, meta: DEMO_META });
const scene = (options = {}) => {
  const graph = built();
  return { graph, plan: solvePlan(graph, options), layout: layoutPlan2D(solvePlan(graph, options), graph) };
};

test('la vue 2D pose chaque personne exactement à la table du solveur', () => {
  const { plan, layout } = scene();
  assert.equal(layout.nodes.length, plan.tables.reduce((sum, table) => sum + table.guests.length, 0));
  for (const node of layout.nodes) {
    const table = plan.tables.find(item => item.guests.includes(node.guestId));
    assert.equal(node.tableId, table.id);
    assert.ok(node.x >= 0 && node.x <= layout.width, `${node.label} hors cadre en x`);
    assert.ok(node.y >= 0 && node.y <= layout.height, `${node.label} hors cadre en y`);
    assert.ok(Number.isFinite(node.labelX) && Number.isFinite(node.labelY));
  }
});

test('un lien sans source reste visible mais jamais codé comme une contrainte', () => {
  const { layout } = scene();
  const hypothesis = layout.edges.filter(edge => edge.tone === 'hypothesis');
  assert.ok(hypothesis.length >= 3, 'les bruits de la démo doivent rester dessinés');
  assert.equal(hypothesis.some(edge => edge.usable), false);
  assert.equal(hypothesis.some(edge => edge.binding), false);
  const apart = layout.edges.filter(edge => edge.tone === 'apart');
  assert.ok(apart.length >= 3);
  assert.equal(apart.every(edge => edge.usable && edge.binding), true);
});

test('les filtres de lecture sont explicites et ne suppriment aucune donnée du modèle', () => {
  const { layout } = scene();
  assert.deepEqual(Object.keys(OVERLAYS), ['all', 'apart', 'binding', 'none']);
  assert.equal(filterEdges(layout.edges, 'none').length, 0);
  assert.equal(layout.edges.length, filterEdges(layout.edges, 'all').length);
  const apartOnly = filterEdges(layout.edges, 'apart');
  assert.ok(apartOnly.length > 0 && apartOnly.every(edge => edge.tone === 'apart' && edge.usable));
  const looseApart = layout.edges.filter(edge => edge.effect === 'apart' && !edge.usable);
  assert.ok(looseApart.length > 0, 'la démo contient bien des séparations non confirmées à exclure');
  assert.equal(apartOnly.some(edge => !edge.usable), false, 'un bruit ne doit jamais passer pour une séparation');
  assert.ok(filterEdges(layout.edges, 'binding').length <= layout.edges.length);
  assert.equal(filterEdges(layout.edges, 'inexistant').length, layout.edges.length, 'un filtre inconnu ne doit rien masquer');
});

test('une table au-dessus de sa capacité est marquée, pas présentée comme normale', () => {
  const { plan, layout } = scene({ tables: 3, targetSize: 4 });
  assert.ok(layout.tables.some(table => table.guests > table.capacity));
  assert.ok(plan.limitations.some(limitation => /au-dessus de/.test(limitation)));
});

test('deux rendus successifs posent les personnes aux mêmes coordonnées', () => {
  const { graph, plan } = scene();
  const left = layoutPlan2D(plan, graph);
  const right = layoutPlan2D(plan, graph);
  assert.deepEqual(left.nodes.map(node => [node.guestId, node.x, node.y]), right.nodes.map(node => [node.guestId, node.x, node.y]));
  assert.deepEqual(left.edges.map(edge => edge.path), right.edges.map(edge => edge.path));
});

test('les prénoms trop longs sont tronqués sans perdre l’identifiant complet', () => {
  const { layout } = scene();
  const anne = layout.nodes.find(node => node.guestId === 'annesophie');
  assert.ok(anne.short.length <= 12);
  assert.equal(anne.label, 'Anne-Sophie Carnel');
});
