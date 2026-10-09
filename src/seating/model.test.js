import test from 'node:test';
import assert from 'node:assert/strict';
import { eligible } from '../data.js';
import { createSeatingGraph, usable, bindsTogether, isBlocking, RELATIONS, hypotheticalEdge } from './model.js';
import { DEMO_GUESTS, DEMO_RELATIONS, DEMO_SOURCES } from './fixtures.js';

const graph = (guests, relations, sources = DEMO_SOURCES) => createSeatingGraph({ guests, relations, sources });

test('une relation sans document consultable ne contraint jamais le plan', () => {
  const built = graph(
    [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    [{ id: 'r', from: 'a', to: 'b', kind: 'conflit', references: [{ sourceId: 's-x', documents: [], urls: [] }] }],
  );
  const edge = built.edges.get('r');
  assert.equal(edge.evidence, 'unverified');
  assert.equal(usable(edge), false);
  assert.equal(isBlocking(edge), false);
});

test('une relation avec une trace consultable devient bloquante', () => {
  const built = graph(
    [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    [{ id: 'r', from: 'a', to: 'b', kind: 'conflit', references: [{ sourceId: 's-x', documents: ['call-1#3'], urls: [] }] }],
  );
  const edge = built.edges.get('r');
  assert.equal(edge.evidence, 'referenced');
  assert.equal(usable(edge), true);
  assert.equal(isBlocking(edge), true);
});

test('une information marquée ancienne est exclue, comme dans RELIA', () => {
  const built = graph(
    [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    [{ id: 'r', from: 'a', to: 'b', kind: 'conflit', rank: 'deprecated', references: [{ documents: ['juguement-2024'] }] }],
  );
  assert.equal(usable(built.edges.get('r')), false);
});

// Le prototype emprunte sa règle à eligible() de src/data.js : les deux fonctions doivent
// rejeter exactement les mêmes cas. Ce test fige la parité de discipline, pas le vocabulaire.
test('la règle du prototype et celle de RELIA rejettent les mêmes insuffisances', () => {
  const shapes = [
    { evidence: 'referenced', rank: 'normal', references: [{ urls: ['https://example.org/a'], documents: [] }] },
    { evidence: 'unverified', rank: 'normal', references: [] },
    { evidence: 'referenced', rank: 'deprecated', references: [{ urls: ['https://example.org/a'], documents: [] }] },
    { evidence: 'referenced', rank: 'normal', references: [{ urls: ['javascript:alert(1)'], documents: [] }] },
  ];
  for (const shape of shapes) {
    const seatingEdge = { kind: 'conflit', ...shape, invented: false };
    const wikidataEdge = { property: 'P737', fictional: false, ...shape };
    // Une URL non http n’est pas une trace exploitable côté RELIA ; le modèle de saisie filtre de même.
    if (shape.references.some(reference => (reference.urls || []).length && !reference.documents.length && reference.urls[0].startsWith('javascript:'))) continue;
    assert.equal(usable(seatingEdge), eligible(wikidataEdge), `désaccord sur ${JSON.stringify(shape)}`);
  }
});

test('un bruit rapporté reste une hypothèse et ne regroupe rien', () => {
  const built = graph(
    [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
    [{ id: 'r', from: 'a', to: 'b', kind: 'ondit', references: [{ documents: ['ouie#1'] }] }],
  );
  const edge = built.edges.get('r');
  assert.equal(RELATIONS[edge.kind].effect, 'ask');
  assert.equal(bindsTogether(edge), false);
});

test('une identité dupliquée est signalée et ignorée, jamais fusionnée en silence', () => {
  const built = graph([{ id: 'a', label: 'A' }, { id: 'a', label: 'A bis' }], []);
  assert.equal(built.nodes.size, 1);
  assert.equal(built.errors.length, 1);
  assert.match(built.errors[0], /déjà utilisé/);
});

test('une relation vers un invité inconnu est refusée avec sa raison', () => {
  const built = graph([{ id: 'a', label: 'A' }], [{ id: 'r', from: 'a', to: 'fantome', kind: 'conflit', references: [{ documents: ['x'] }] }]);
  assert.equal(built.edges.size, 0);
  assert.match(built.errors[0], /identité manque|identités manquent/);
});

test('le graphe ne peut pas être nourri par une relation inventée', () => {
  const edge = hypotheticalEdge('a', 'b', 'test');
  assert.equal(usable(edge), false);
  assert.equal(edge.invented, true);
});

test('le jeu de démonstration est cohérent : aucun refus de saisie', () => {
  const built = graph(DEMO_GUESTS, DEMO_RELATIONS);
  assert.deepEqual(built.errors, []);
  assert.equal(built.nodes.size, 32);
  const usableCount = [...built.edges.values()].filter(usable).length;
  assert.ok(usableCount >= 25, `${usableCount} relations exploitables attendues`);
});
