import test from 'node:test';
import assert from 'node:assert/strict';
import { PHYSICS, normalizePlan, compileLevel } from '../lib/world.mjs';

test('every gap remains jumpable across tempos, difficulties and seeds', () => {
  for (const bpm of [70, 109, 140, 180]) for (const difficulty of ['chill', 'flow', 'intense']) for (let seed = 0; seed < 50; seed++) {
    const level = compileLevel(normalizePlan({ bpm }, {}, { difficulty }), seed);
    const flightRange = PHYSICS.speed * 2 * PHYSICS.jump / PHYSICS.gravity;
    for (const platform of level.platforms) {
      assert.ok(platform.end > platform.start);
      assert.ok(platform.gap < flightRange * .5, `gap ${platform.gap} exceeds generous timing margin`);
    }
    // At least one lane always clears each obstacle cluster.
    const clusters = new Map();
    for (const o of level.obstacles) { const lanes = clusters.get(o.distance) || new Set(); lanes.add(o.lane); clusters.set(o.distance, lanes); }
    for (const lanes of clusters.values()) assert.ok(lanes.size <= 2);
  }
});
test('platforms and checkpoints cover the complete soundtrack', () => {
  const plan = normalizePlan({ duration: 180, bpm: 70 }); const level = compileLevel(plan, 'long');
  assert.ok(level.platforms.at(-1).end > level.length);
  for (const cp of level.checkpoints) { const platform = level.platforms.find(p => cp.distance >= p.start && cp.distance <= p.end); assert.ok(platform); assert.equal(platform.gap, 0); }
});
test('model tempo and duration are bounded before compiling physics', () => {
  const plan = normalizePlan({ bpm: -200, duration: 999999, sections: [{ name: 'broken' }] });
  assert.equal(plan.bpm, 70); assert.equal(plan.duration, 180); assert.equal(plan.sections.length, 3);
});
test('saved seed reproduces the same course', () => {
  const plan = normalizePlan(); assert.deepEqual(compileLevel(plan, 'favorite'), compileLevel(plan, 'favorite'));
  assert.notDeepEqual(compileLevel(plan, 'favorite').sparks, compileLevel(plan, 'other').sparks);
});
