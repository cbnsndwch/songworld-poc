import test from 'node:test';
import assert from 'node:assert/strict';
import { BIOMES, chooseBiome } from '../lib/biomes.mjs';
import { collapseWorld, connectionsMatch, TILE_CATALOG } from '../lib/wfc.mjs';
test('24 biome buckets, each with 128 stable tile briefs', () => { assert.equal(BIOMES.length, 24); assert.equal(new Set(BIOMES.map(b => b.id)).size, 24); assert.equal(TILE_CATALOG.length, 128); });
test('WFC satisfies all adjacent edge sockets and keeps relics reachable in all biomes', () => {
  for (const biome of BIOMES) for (let seed = 0; seed < 8; seed++) {
    const world = collapseWorld(seed, biome);
    for (const tile of world.tiles) {
      if (tile.gx < world.size - 1) assert.ok(connectionsMatch(tile, world.tiles[tile.index + 1], 1));
      if (tile.gz < world.size - 1) assert.ok(connectionsMatch(tile, world.tiles[tile.index + world.size], 2));
    }
    assert.ok(world.reachable.length >= 24);
    for (const goal of world.goals) assert.ok(world.reachable.includes(goal));
    assert.equal(new Set(world.goals.map(g => g.index)).size, 3);
  }
});
test('song bucket and player biome override are deterministic', () => { assert.equal(chooseBiome({ title: 'Welcome to the Jungle' }).id, 'jungle-ruins'); assert.equal(chooseBiome({}, 'coral').id, 'coral'); assert.equal(chooseBiome({ artist: 'Example' }).id, chooseBiome({ artist: 'Example' }).id); });
