// Tests de la recherche locale : correspondance stricte, insensible à la casse et aux accents.
import test from 'node:test';
import assert from 'node:assert/strict';
import { matchLocalIdentities, verificationLabel } from './local-search.js';

test('an exact name match comes first, accent and case insensitive', () => {
  const hits = matchLocalIdentities('Matt Mez Sax');
  assert.equal(hits.length, 1);
  assert.equal(hits[0].id, 'relia:person:matt-mez-sax');
  assert.equal(hits[0].local, true);
  assert.equal(hits[0].type, 'person');
  assert.deepEqual(matchLocalIdentities('matt mez sax').map(hit => hit.id), ['relia:person:matt-mez-sax']);
});

test('prefix and inclusion matches still find the identity', () => {
  assert.equal(matchLocalIdentities('matt me')[0]?.id, 'relia:person:matt-mez-sax');
  assert.equal(matchLocalIdentities('mez sax')[0]?.id, 'relia:person:matt-mez-sax');
});

test('no match, or too short a term, returns nothing', () => {
  assert.deepEqual(matchLocalIdentities('Marie Curie'), []);
  assert.deepEqual(matchLocalIdentities('zzzz'), []);
  assert.deepEqual(matchLocalIdentities('m'), []);
  assert.deepEqual(matchLocalIdentities(''), []);
  assert.deepEqual(matchLocalIdentities(null), []);
});

test('verification labels stay explicit', () => {
  assert.equal(verificationLabel({ verification: 'unverified' }), 'Fiche locale · non vérifiée');
  assert.equal(verificationLabel({ verification: 'owner_confirmed' }), 'Fiche locale · confirmée par le propriétaire');
  assert.equal(verificationLabel(null), 'Fiche locale · non vérifiée');
});
