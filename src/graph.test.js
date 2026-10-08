import test from 'node:test';
import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { NetworkView } from './graph.js';

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
