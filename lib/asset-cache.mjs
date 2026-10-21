import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { TILE_VARIANTS } from './wfc.mjs';

const keyFor = biome => {
  if (!/^[a-z0-9-]{1,64}$/.test(biome)) throw new Error('Invalid biome cache key.');
  return `${biome}-hunyuan21-pbr-v1`;
};
export async function readBiomeBank(directory, biome, { requireComplete = true } = {}) {
  try {
    const world = JSON.parse(await fs.readFile(path.join(directory, `${keyFor(biome)}.json`), 'utf8'));
    if (!world.tiles?.length || requireComplete && !TILE_VARIANTS.every(v => world.tiles?.some(t => t.variant === v))) return null;
    for (const tile of world.tiles) await fs.access(path.join(directory, path.basename(tile.glbUrl)));
    return world;
  } catch { return null; }
}
export async function persistWorld(directory, biome, world, serviceURL) {
  if (!world) return null;
  await fs.mkdir(directory, { recursive: true });
  const origin = new URL(serviceURL).origin;
  const download = async url => {
    const source = new URL(url, serviceURL);
    if (source.origin !== origin) throw new Error('Hunyuan returned an unexpected asset origin.');
    const response = await fetch(source, { signal: AbortSignal.timeout(180000) });
    if (!response.ok) throw new Error(`Generated GLB download failed: HTTP ${response.status}`);
    const bytes = Buffer.from(await response.arrayBuffer());
    if (bytes.length < 20 || bytes.toString('ascii', 0, 4) !== 'glTF' || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) throw new Error('Generated asset is not a complete GLB 2 file.');
    const hash = createHash('sha256').update(bytes).digest('hex');
    const filename = `${hash}.glb`, temporary = path.join(directory, `${filename}.tmp`);
    await fs.writeFile(temporary, bytes);
    await fs.rename(temporary, path.join(directory, filename));
    return { glbUrl: `/generated-assets/${filename}`, sha256: hash };
  };
  const result = { ...world, cachedLocally: true };
  if (world.tiles?.length) {
    result.tiles = [];
    for (const tile of world.tiles) result.tiles.push({ ...tile, ...await download(tile.glbUrl) });
  } else if (world.glbUrl) Object.assign(result, await download(world.glbUrl));
  const manifest = path.join(directory, `${keyFor(biome)}.json`);
  await fs.writeFile(`${manifest}.tmp`, JSON.stringify(result, null, 2));
  await fs.rename(`${manifest}.tmp`, manifest);
  return result;
}
