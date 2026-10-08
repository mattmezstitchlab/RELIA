import test from 'node:test';
import assert from 'node:assert/strict';
import { canAddSecond, relationReady, resolveMode } from './mode.js';

const person = (id, extra = {}) => ({ id, label: id, type: 'person', ...extra });

test('le mode suit le nombre d’identités dans la barre de recherche', () => {
  assert.equal(resolveMode({ a: null, b: null }), 'home');
  assert.equal(resolveMode({ a: person('D1') }), 'identity');
  assert.equal(resolveMode({ a: person('D1'), b: person('D2') }), 'relation');
  assert.equal(resolveMode({}), 'home');
});

test('une seconde personne ne s’ajoute qu’à une personne confirmée', () => {
  assert.equal(canAddSecond(person('D1')), true);
  assert.equal(canAddSecond({ id: 'Q1', label: 'Œuvre', type: 'work' }), false, 'une œuvre ne peut pas être reliée à une personne');
  assert.equal(canAddSecond({ id: 'Q2', label: 'En attente', placeholder: true }), false, 'une identité en cours de chargement attend son type');
  assert.equal(canAddSecond(null), false);
});

test('un lien ne se cherche qu’entre deux personnes distinctes', () => {
  assert.equal(relationReady(person('D1'), person('D2')), true);
  assert.equal(relationReady(person('D1'), person('D1')), false);
  assert.equal(relationReady(person('D1'), { id: 'P1', label: 'Lieu', type: 'place' }), false);
  assert.equal(relationReady(person('D1'), null), false);
});
