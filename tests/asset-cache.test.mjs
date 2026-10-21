import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { persistWorld, readBiomeBank } from '../lib/asset-cache.mjs';
import { TILE_VARIANTS } from '../lib/wfc.mjs';

test('a complete biome bank remains local after its GPU asset service stops', async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'songworld-assets-'));
  const json = Buffer.from('{"asset":{"version":"2.0"}}  ');
  const glb = Buffer.alloc(20 + json.length);
  glb.write('glTF'); glb.writeUInt32LE(2, 4); glb.writeUInt32LE(glb.length, 8); glb.writeUInt32LE(json.length, 12); glb.write('JSON', 16); json.copy(glb, 20);
  const server = http.createServer((req, res) => res.end(glb));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  try {
    const world = { model: 'test transport fixture; no inference', provenance: { test: true }, tiles: TILE_VARIANTS.map(variant => ({ variant, glbUrl: `${origin}/${variant}.glb` })) };
    await assert.rejects(persistWorld(directory, 'jungle-ruins', { ...world, tiles: [{ variant: 'arch', glbUrl: 'http://example.com/asset.glb' }] }, origin), /unexpected asset origin/);
    const saved = await persistWorld(directory, 'jungle-ruins', world, origin);
    await new Promise(resolve => server.close(resolve));
    assert.equal(saved.cachedLocally, true);
    const cached = await readBiomeBank(directory, 'jungle-ruins');
    assert.equal(cached.tiles.length, 8);
    for (const tile of cached.tiles) assert.deepEqual(await fs.readFile(path.join(directory, path.basename(tile.glbUrl))), glb);
    await fs.unlink(path.join(directory, path.basename(cached.tiles[0].glbUrl)));
    assert.equal(await readBiomeBank(directory, 'jungle-ruins'), null);
  } finally { server.close(); await fs.rm(directory, { recursive: true, force: true }); }
});
