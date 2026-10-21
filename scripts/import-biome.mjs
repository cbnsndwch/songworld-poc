import fs from 'node:fs/promises';
import path from 'node:path';
import { persistWorld } from '../lib/asset-cache.mjs';
const input = path.resolve(process.argv[2] || 'data/first-hunyuan-world.json');
const biome = process.argv[3] || 'jungle-ruins';
const world = JSON.parse((await fs.readFile(input, 'utf8')).replace(/^\uFEFF/, ''));
if (!world.model || !world.provenance) throw new Error('Asset response is missing model provenance.');
const result = await persistWorld(path.resolve('data/generated-assets'), biome, world, process.env.HUNYUAN_URL || 'http://127.0.0.1:18002');
console.log(`Saved ${result.tiles?.length || 1} real generated asset(s) locally for ${biome}.`);
