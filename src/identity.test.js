import test from 'node:test';
import assert from 'node:assert/strict';
import { AUTOMATIC_WIKIDATA_EXPORT, createLocalIdentity, findDuplicateIds, identityKind, isLocalId, localIdFor, sameIdentity, slugify, validateIdentity } from './identity.js';
import { LOCAL_IDENTITIES, MATT_MEZ_SAX, findLocalIdentity } from './local-identities.js';

const JULES_VERNE = { id: 'Q33977', kind: 'wikidata', type: 'person', label: 'Jules Verne', description: 'écrivain français' };

test('Wikidata identities are real QIDs and stay unchanged by the local layer', () => {
  assert.deepEqual(validateIdentity(JULES_VERNE), []);
  assert.equal(identityKind('Q33977'), 'wikidata');
  assert.equal(identityKind('relia:person:jules-verne'), 'local');
  assert.equal(identityKind('Q0'), null);
});

test('local identifiers never imitate a QID and carry their type', () => {
  assert.equal(isLocalId('relia:person:matt-mez-sax'), true);
  for (const id of ['Q33977', 'relia:person:Matt', 'relia:unknown:x', 'relia:person:', 'relia:person:matt--sax', 'RELIA:person:x', 'person:matt']) {
    assert.equal(isLocalId(id), false, id);
  }
  assert.throws(() => localIdFor('person', 'Matt Mez Sax'), /Identifiant local invalide/);
  assert.equal(localIdFor('person', 'matt-mez-sax'), 'relia:person:matt-mez-sax');
  const mismatch = { id: 'relia:work:matt-mez-sax', kind: 'local', type: 'person', label: 'Matt Mez Sax', verification: 'unverified' };
  assert.ok(validateIdentity(mismatch).some(message => message.includes('ne correspond pas')));
});

test('a local identity can never carry a Wikidata QID', () => {
  const withQid = { ...MATT_MEZ_SAX, wikidataId: 'Q33977' };
  assert.ok(validateIdentity(withQid).includes('Une identité locale ne porte jamais de QID Wikidata.'));
  assert.equal(AUTOMATIC_WIKIDATA_EXPORT, false);
});

test('slugify removes accents and keeps ligatures readable', () => {
  assert.equal(slugify('Matt Mez Sax'), 'matt-mez-sax');
  assert.equal(slugify('  Jules   Verne  '), 'jules-verne');
  assert.equal(slugify('Œuvre éclatée, n°2'), 'oeuvre-eclatee-n-2');
  assert.equal(slugify('!!!'), '');
});

test('Matt Mez Sax: first local example, without biography, dates or relations', () => {
  assert.equal(MATT_MEZ_SAX.id, 'relia:person:matt-mez-sax');
  assert.equal(MATT_MEZ_SAX.kind, 'local');
  assert.equal(MATT_MEZ_SAX.verification, 'unverified');
  assert.equal(MATT_MEZ_SAX.wikidataId, undefined);
  for (const forbidden of ['born', 'died', 'claims', 'events', 'relations', 'videos', 'channels', 'image']) {
    assert.equal(Object.hasOwn(MATT_MEZ_SAX, forbidden), false, forbidden);
  }
  assert.equal(findLocalIdentity('relia:person:matt-mez-sax'), MATT_MEZ_SAX);
  assert.equal(findLocalIdentity('relia:person:unknown'), null);
  assert.equal(LOCAL_IDENTITIES.length, 1);
  assert.ok(Object.isFrozen(MATT_MEZ_SAX));
});

test('same name does not mean same identity: homonyms need distinct identifiers', () => {
  const homonymA = createLocalIdentity({ type: 'person', label: 'Matt Mez Sax' });
  const homonymB = createLocalIdentity({ type: 'person', label: 'Matt Mez Sax', slug: 'matt-mez-sax-2' });
  assert.equal(sameIdentity(homonymA, homonymB), false);
  assert.equal(sameIdentity(homonymA, { ...homonymA }), true);
  assert.equal(sameIdentity(homonymA, JULES_VERNE), false);
});

test('duplicate identifiers are reported, never merged silently', () => {
  const a = createLocalIdentity({ type: 'person', label: 'Ada Lovelace' });
  const b = createLocalIdentity({ type: 'person', label: 'Ada Lovelace' });
  assert.deepEqual(findDuplicateIds([a, b, MATT_MEZ_SAX]), [a.id]);
  assert.deepEqual(findDuplicateIds([MATT_MEZ_SAX, JULES_VERNE]), []);
});

test('created identities are validated, deduplicated in aliases and frozen', () => {
  const record = createLocalIdentity({ type: 'person', label: 'Matt Mez Sax', aliases: ['Matt Mez Sax', ' Mez Sax ', 'Mez Sax'] });
  assert.deepEqual([...record.aliases], ['Mez Sax']);
  assert.ok(Object.isFrozen(record));
  assert.throws(() => createLocalIdentity({ type: 'person', label: '   ' }), /Libellé requis/);
  assert.throws(() => createLocalIdentity({ type: 'animal', label: 'Rex' }), /Identifiant local invalide/);
  assert.throws(() => createLocalIdentity({ type: 'person', label: 'X', verification: 'confirmed' }), /Niveau de vérification inconnu/);
});
