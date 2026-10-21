import test from 'node:test';
import assert from 'node:assert/strict';
import { BoxGeometry, Mesh, MeshBasicMaterial, Vector3 } from 'three';
import { createMeshCollider, resolveMeshCollisions, meshSurfaceAt } from '../lib/mesh-collision.mjs';
import { stepCharacter } from '../lib/platform-physics.mjs';

const character = (x = 0, y = 0, z = 0) => ({ position: new Vector3(x, y, z), velocity: new Vector3(), grounded: false, jumpBuffer: 0, coyote: 0 });
function box(w, h, d, y = 0) {
  const mesh = new Mesh(new BoxGeometry(w, h, d), new MeshBasicMaterial()); mesh.position.y = y;
  return createMeshCollider(mesh);
}
function advance(state, instances, input, seconds) {
  for (let i = 0; i < seconds * 120; i++) { stepCharacter(state, input, [], 1 / 120); resolveMeshCollisions(state, instances); }
}
test('character lands and remains on actual triangle mesh surfaces', () => {
  const instances = [{ collider: box(10, 1, 10, -.5), offset: new Vector3() }], state = character(0, 3, 0);
  advance(state, instances, { horizontal: 0, forward: 0 }, 3);
  assert.ok(Math.abs(state.position.y) < .002); assert.equal(state.grounded, true);
  assert.equal(meshSurfaceAt(instances, 0, 0, 4).y, 0);
});
test('mesh walls block the capsule while leaving tangential movement available', () => {
  const instances = [{ collider: box(12, 1, 12, -.5), offset: new Vector3() }, { collider: box(6, 4, .25, 2), offset: new Vector3(0, 0, -3) }], state = character();
  advance(state, instances, { horizontal: .25, forward: 1 }, .8);
  assert.ok(state.position.z > -2.6); assert.ok(state.position.x > .5);
});
test('one mesh collision tree can be reused at different tile translations', () => {
  const collider = box(4, 2, 4, 1), instances = [{ collider, offset: new Vector3(12, 3, 24) }, { collider, offset: new Vector3(-12, 0, -24) }];
  assert.equal(meshSurfaceAt(instances, 12, 24, 20).y, 5);
  assert.equal(meshSurfaceAt(instances, -12, -24, 20).y, 2);
  assert.equal(meshSurfaceAt(instances, 0, 0, 20), null);
  const state = character(12, 8, 24); advance(state, instances, { horizontal: 0, forward: 0 }, 2);
  assert.ok(Math.abs(state.position.y - 5) < .002);
});
test('a character can jump from a generated mesh and land back on it', () => {
  const instances = [{ collider: box(10, 1, 10, -.5), offset: new Vector3() }], state = character();
  advance(state, instances, { horizontal: 0, forward: 0 }, .1);
  state.jumpBuffer = .16; let highest = 0;
  for (let i = 0; i < 240; i++) { advance(state, instances, { horizontal: 0, forward: 0 }, 1 / 120); highest = Math.max(highest, state.position.y); }
  assert.ok(highest > 2.6); assert.ok(Math.abs(state.position.y) < .002);
});
