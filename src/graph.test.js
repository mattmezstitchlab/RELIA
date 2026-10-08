import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { AVATAR_LIMIT, NetworkView, emphasizedScale, selectAvatarCandidates, selectVisibleLabels } from './graph.js';

function cameraHarness(reduced = false) {
  const view = Object.create(NetworkView.prototype);
  view.camera = { position: new Vector3(0, 0, 100) };
  view.controls = { target: new Vector3(), update() {}, enableDamping: !reduced };
  view.reduced = { matches: reduced };
  return view;
}
test('camera position and orbit target ease together instead of teleporting', () => {
  const view = cameraHarness();
  view.transitionTo(new Vector3(20, 10, 0), new Vector3(40, 20, 60));
  assert.deepEqual(view.camera.position.toArray(), [0, 0, 100]);
  const start = view.transition.start;
  view.updateTransition(start + 475);
  assert.ok(view.camera.position.distanceTo(new Vector3(20, 10, 80)) < 1e-8);
  assert.ok(view.controls.target.distanceTo(new Vector3(10, 5, 0)) < 1e-8);
  view.updateTransition(start + 1000);
  assert.deepEqual(view.camera.position.toArray(), [40, 20, 60]);
  assert.deepEqual(view.controls.target.toArray(), [20, 10, 0]);
  assert.equal(view.transition, null); assert.equal(view.controls.enableDamping, true);
});
test('interaction cancellation preserves the current view; a new transition starts from there', () => {
  const view = cameraHarness();
  view.transitionTo(new Vector3(20, 0, 0), new Vector3(20, 0, 80));
  view.updateTransition(view.transition.start + 475);
  const current = view.camera.position.clone();
  view.cancelTransition();
  assert.equal(view.transition, null); assert.deepEqual(view.camera.position.toArray(), current.toArray());
  view.transitionTo(new Vector3(), new Vector3(0, 0, 235));
  assert.deepEqual(view.transition.fromCamera.toArray(), current.toArray());
});
test('reduced-motion camera changes are immediate and do not create transitions', () => {
  const view = cameraHarness(true);
  view.transitionTo(new Vector3(20, 0, 0), new Vector3(20, 0, 80));
  assert.equal(view.transition, null);
  assert.deepEqual(view.camera.position.toArray(), [20, 0, 80]);
  assert.deepEqual(view.controls.target.toArray(), [20, 0, 0]);
});
test('a zero-edge path retains its one highlighted node', () => {
  const view = cameraHarness();
  view.highlightPath({ nodes: ['Q1'], edges: [] });
  assert.deepEqual([...view.pathNodes], ['Q1']); assert.equal(view.path.size, 0);
  view.highlightPath(null); assert.equal(view.pathNodes.size, 0);
});

test('avatar candidates are people-only, image-backed, capped, and prioritized without reduced motion', () => {
  const nodes = Array.from({ length: 20 }, (_, index) => ({
    id: `Q${index + 1}`, type: index < 18 ? 'person' : 'work',
    avatarImage: index < 16 ? `https://commons.wikimedia.org/image-${index}` : null,
  }));
  const degree = new Map(nodes.map((node, index) => [node.id, index]));
  const chosen = selectAvatarCandidates(nodes, degree, { focused: 'Q1' });
  assert.equal(chosen.length, AVATAR_LIMIT);
  assert.equal(chosen[0].id, 'Q1');
  assert.ok(chosen.every(node => node.type === 'person' && node.avatarImage));
  assert.deepEqual(selectAvatarCandidates(nodes, degree, { reduced: true }), []);
  assert.deepEqual(selectAvatarCandidates(nodes, degree, { mobile: true }), []);
  assert.deepEqual(selectAvatarCandidates(nodes.slice(0, 14), degree, { mobile: true }).length, AVATAR_LIMIT);
});

test('avatar feature falls back for large graphs and low-memory devices; emphasis remains bounded', () => {
  const nodes = Array.from({ length: 37 }, (_, index) => ({ id: `Q${index}`, type: 'person', image: 'https://commons.wikimedia.org/image' }));
  assert.deepEqual(selectAvatarCandidates(nodes, new Map()), []);
  assert.deepEqual(selectAvatarCandidates(nodes.slice(0, 10), new Map(), { deviceMemory: 1 }), []);
  assert.equal(emphasizedScale(2, true), 2.24);
  assert.equal(emphasizedScale(2, false), 2);
});

test('identity and path labels take precedence while overlapping secondary labels are hidden', () => {
  const label = (id, x, options = {}) => ({
    id, left: x, right: x + 90, top: 10, bottom: 38, degree: 1, ...options,
  });
  const visible = selectVisibleLabels([
    label('crowded', 4, { neighbor: true }),
    label('identity-a', 0, { identity: true }),
    label('identity-b', 5, { identity: true }),
    label('path', 300, { path: true }),
    label('neighbor', 120, { neighbor: true }),
  ], 4);
  assert.deepEqual([...visible].sort(), ['identity-a', 'identity-b', 'neighbor', 'path']);
});
