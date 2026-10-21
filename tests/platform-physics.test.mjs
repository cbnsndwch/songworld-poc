import test from 'node:test';
import assert from 'node:assert/strict';
import { stepCharacter } from '../lib/platform-physics.mjs';
const floor = [{ x: 0, z: 0, y: 0, w: 100, d: 100, shape: 'box' }];
const state = () => ({ position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true, coyote: .12, jumpBuffer: 0 });
const input = (extra = {}) => ({ horizontal: 0, forward: 0, ...extra });
test('standing still does not advance through the world', () => { const s = state(); for (let i = 0; i < 600; i++) stepCharacter(s, input(), floor, 1 / 60); assert.deepEqual(s.position, { x: 0, y: 0, z: 0 }); });
test('full jump reaches the expected height and lands at different frame rates', () => {
  for (const fps of [30, 60, 120]) { const s = state(); s.jumpBuffer = .16; let highest = 0; for (let i = 0; i < fps * 2; i++) { stepCharacter(s, input(), floor, 1 / fps); highest = Math.max(highest, s.position.y); } assert.ok(highest > 2.5 && highest < 2.85); assert.equal(s.position.y, 0); assert.ok(s.grounded); }
});
test('diagonal movement is normalized and is camera-relative', () => {
  const straight = state(), diagonal = state(), rotated = state();
  for (let i = 0; i < 120; i++) { stepCharacter(straight, input({ forward: 1 }), floor, 1 / 60); stepCharacter(diagonal, input({ forward: 1, horizontal: 1 }), floor, 1 / 60); stepCharacter(rotated, input({ forward: 1, yaw: Math.PI / 2 }), floor, 1 / 60); }
  assert.ok(Math.abs(Math.hypot(diagonal.position.x, diagonal.position.z) - Math.abs(straight.position.z)) < .001); assert.ok(rotated.position.x < -10); assert.ok(Math.abs(rotated.position.z) < .001);
});
test('a raised terrace blocks walking through its side', () => {
  const s = state(), colliders = [...floor, { x: 0, z: -4, y: 1.4, w: 3, d: 3, shape: 'box' }];
  for (let i = 0; i < 120; i++) stepCharacter(s, input({ forward: 1 }), colliders, 1 / 60);
  assert.ok(s.position.z > -2.3); assert.equal(s.position.y, 0);
});
test('jumping reaches a raised terrace while walking cannot', () => {
  const s = state(), colliders = [...floor, { x: 0, z: -4, y: 1.4, w: 3, d: 3, shape: 'box' }];
  for (let i = 0; i < 100; i++) { if (i === 9) s.jumpBuffer = .16; stepCharacter(s, input({ forward: i < 35 ? 1 : 0 }), colliders, 1 / 60); }
  assert.equal(s.position.y, 1.4); assert.ok(s.grounded);
});
test('camera and movement can cross a smooth hill without falling through', () => {
  const s = state(); s.position.z = 4.8; const hills = [{ x: 0, z: 0, y: 0, w: 10, d: 10, shape: 'round', hill: 1.1 }]; let highest = 0;
  for (let i = 0; i < 50; i++) { stepCharacter(s, input({ forward: 1, sprint: true }), hills, 1 / 60); highest = Math.max(highest, s.position.y); }
  assert.ok(highest > 1); assert.ok(s.position.y > -1);
});
