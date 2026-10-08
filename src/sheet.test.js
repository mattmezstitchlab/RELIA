import test from 'node:test';
import assert from 'node:assert/strict';
import { clampHeight, nearestSnap, nextSnap, settleSnap, snapTargets } from './sheet.js';

test('les trois positions de la feuille tiennent dans l’écran', () => {
  const targets = snapTargets(844, { peek: 150, topInset: 72 });
  assert.deepEqual(targets, { peek: 150, half: 422, full: 772 });
  const tiny = snapTargets(300, { peek: 200, topInset: 72 });
  assert.ok(tiny.peek <= tiny.half && tiny.half <= tiny.full, 'l’ordre des positions est conservé sur petit écran');
});

test('une hauteur libre s’aimante sur la position la plus proche', () => {
  const targets = snapTargets(844, { peek: 150, topInset: 72 });
  assert.equal(nearestSnap(180, targets), 'peek');
  assert.equal(nearestSnap(500, targets), 'half');
  assert.equal(nearestSnap(700, targets), 'full');
  assert.equal(clampHeight(2000, targets), targets.full);
  assert.equal(clampHeight(10, targets), targets.peek);
});

test('un glissement rapide projette la feuille plus loin', () => {
  const targets = snapTargets(844, { peek: 150, topInset: 72 });
  assert.equal(settleSnap(422, 0, targets), 'half');
  assert.equal(settleSnap(422, 1.2, targets), 'full', 'élan vers le haut');
  assert.equal(settleSnap(422, -1.2, targets), 'peek', 'élan vers le bas');
  assert.equal(settleSnap(422, Number.NaN, targets), 'half', 'vitesse invalide ignorée');
});

test('le tap sur la poignée bascule entre demi-hauteur et plein écran', () => {
  assert.equal(nextSnap('peek'), 'half');
  assert.equal(nextSnap('half'), 'full');
  assert.equal(nextSnap('full'), 'half');
});
