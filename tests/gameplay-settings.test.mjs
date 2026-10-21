import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONTROLS, normalizeControls } from '../lib/gameplay-settings.mjs';
import { smoothOrbit } from '../lib/camera-motion.mjs';
test('saved control values are bounded and malformed values use defaults', () => {
  const value = normalizeControls({ cameraResponse: 999, acceleration: 'broken', moveSpeed: -10, invertY: true });
  assert.equal(value.cameraResponse, 30); assert.equal(value.acceleration, DEFAULT_CONTROLS.acceleration);
  assert.equal(value.moveSpeed, .7); assert.equal(value.invertY, true);
});
test('responsive camera catches up faster without frame-rate-dependent jumps', () => {
  for (const fps of [30, 60, 120]) {
    const slow = { yaw: 0, pitch: .3, distance: 9 }, fast = { ...slow }, target = { ...slow, yaw: 1 };
    for (let i = 0; i < fps / 5; i++) { smoothOrbit(slow, target, 1 / fps, 10); smoothOrbit(fast, target, 1 / fps, 18); }
    assert.ok(fast.yaw > slow.yaw); assert.ok(fast.yaw <= 1);
  }
});
