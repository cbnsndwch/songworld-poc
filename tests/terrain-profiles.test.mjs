import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES } from '../lib/biomes.mjs';
import { terrainProfile, tileElevation } from '../lib/terrain-profiles.mjs';
import { collapseWorld } from '../lib/wfc.mjs';
import { stepCharacter } from '../lib/platform-physics.mjs';

test('mountain and sky route elevation changes remain jumpable at 30 and 60 fps', () => {
  for (const biome of BIOMES) {
    const profile = terrainProfile(biome.id), map = collapseWorld('terrain-traversal', biome);
    assert.equal(tileElevation(profile, map.spawn), 0);
    for (const tile of map.reachable) for (const next of map.reachable) {
      if (Math.abs(tile.x - next.x) + Math.abs(tile.z - next.z) !== 12) continue;
      assert.ok(Math.abs(tileElevation(profile, tile) - tileElevation(profile, next)) <= 1.35 + 1e-9);
    }
    if (!profile.rise) continue;
    for (const fps of [30, 60]) {
      const s = { position: { x: 0, y: 0, z: 0 }, velocity: { x: 0, y: 0, z: 0 }, grounded: true, coyote: .12, jumpBuffer: 0 };
      const colliders = [{ x: 0, z: 0, y: 0, w: 100, d: 100, shape: 'box' }, { x: 0, z: -4, y: profile.rise, bottom: -1.5, w: 3, d: 3, shape: 'box' }];
      for (let i = 0; i < fps * 2; i++) {
        if (i === Math.round(fps * .15)) s.jumpBuffer = .16;
        stepCharacter(s, { horizontal: 0, forward: i < fps * .58 ? 1 : 0 }, colliders, 1 / fps);
      }
      assert.equal(s.position.y, profile.rise, `${biome.id} at ${fps} fps`);
      assert.ok(s.grounded);
    }
  }
});

test('city layouts produce more intersections than canyon routes across seeds', () => {
  const intersections = id => Array.from({ length: 12 }, (_, seed) => collapseWorld(`layout-${seed}`, { id }).tiles.filter(t => [7, 11, 13, 14, 15].includes(t.mask)).length).reduce((a, b) => a + b, 0);
  assert.ok(intersections('neon') > intersections('canyon') * 1.2);
});
