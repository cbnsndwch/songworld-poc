import test from 'node:test';
import assert from 'node:assert/strict';
import { smoothOrbit } from '../lib/camera-motion.mjs';
test('a large camera drag cannot cause a sudden angular or zoom jump', () => {
  for (const fps of [30, 60, 120]) {
    const current = { yaw: 0, pitch: .3, distance: 9 }, target = { yaw: 2, pitch: .8, distance: 14 };
    smoothOrbit(current, target, 1 / fps);
    assert.ok(current.yaw <= 1.8 / fps + 1e-8); assert.ok(current.pitch - .3 <= .8 / fps + 1e-8); assert.ok(current.distance - 9 <= 8 / fps + 1e-8);
    for (let i = 0; i < fps * 3; i++) smoothOrbit(current, target, 1 / fps);
    assert.ok(Math.abs(current.yaw - target.yaw) < .001); assert.ok(Math.abs(current.distance - target.distance) < .001);
  }
});
test('orbit takes the short path when crossing the angle boundary', () => {
  const current = { yaw: Math.PI - .05, pitch: .3, distance: 9 };
  smoothOrbit(current, { yaw: -Math.PI + .05, pitch: .3, distance: 9 }, 1 / 60);
  assert.ok(current.yaw > Math.PI - .05);
});
