import { random, hash } from './world.mjs';
import { terrainProfile } from './terrain-profiles.mjs';
export const TILE_SIZE = 12;
// 16 edge topologies × 8 interior arrangements = 128 tile briefs per biome.
// Concrete Hunyuan GLBs are cached against these stable semantic IDs.
export const TILE_VARIANTS = ['garden', 'terraces', 'arch', 'tower', 'grove', 'ruins', 'pond', 'sanctuary'];
export const TILE_CATALOG = Array.from({ length: 128 }, (_, id) => ({ id, mask: Math.floor(id / 8), variant: TILE_VARIANTS[id % 8], weight: Math.floor(id / 8) === 15 ? 1.5 : .7 }));
const directions = [[0, -1, 0, 2], [1, 0, 1, 3], [0, 1, 2, 0], [-1, 0, 3, 1]];
const bit = (mask, side) => (mask >> side) & 1;
export function collapseWorld(seed, biome, size = 7) {
  const rng = random(hash(`${seed}:${biome.id}`));
  const kind = terrainProfile(biome.id).kind;
  const weight = id => {
    const tile = TILE_CATALOG[id], exits = [0, 1, 2, 3].reduce((n, side) => n + bit(tile.mask, side), 0);
    const desired = kind === 'city' ? 4 : ['canyon', 'cavern', 'mountain'].includes(kind) ? 2 : 3;
    return tile.weight * (exits === desired ? 5 : exits === 0 ? .3 : 1);
  };
  for (let attempt = 0; attempt < 30; attempt++) {
    const cells = Array.from({ length: size * size }, (_, index) => {
      const x = index % size, z = Math.floor(index / size);
      return TILE_CATALOG.filter(t => !(z === 0 && bit(t.mask, 0)) && !(x === size - 1 && bit(t.mask, 1)) && !(z === size - 1 && bit(t.mask, 2)) && !(x === 0 && bit(t.mask, 3))).map(t => t.id);
    });
    const middle = Math.floor(size / 2), spawn = middle * size + middle;
    cells[spawn] = [15 * 8];
    const propagate = starts => {
      const queue = [...starts];
      while (queue.length) {
        const index = queue.pop(), x = index % size, z = Math.floor(index / size);
        for (const [dx, dz, side, otherSide] of directions) {
          const nx = x + dx, nz = z + dz; if (nx < 0 || nz < 0 || nx >= size || nz >= size) continue;
          const next = nz * size + nx, allowed = new Set(cells[index].map(id => bit(TILE_CATALOG[id].mask, side)));
          const filtered = cells[next].filter(id => allowed.has(bit(TILE_CATALOG[id].mask, otherSide)));
          if (!filtered.length) return false;
          if (filtered.length !== cells[next].length) { cells[next] = filtered; queue.push(next); }
        }
      }
      return true;
    };
    if (!propagate([spawn])) continue;
    let contradiction = false;
    while (true) {
      let index = -1, entropy = Infinity;
      for (let i = 0; i < cells.length; i++) if (cells[i].length > 1) { const value = cells[i].length + rng() * .1; if (value < entropy) { entropy = value; index = i; } }
      if (index < 0) break;
      const domain = cells[index], total = domain.reduce((n, id) => n + weight(id), 0); let pick = rng() * total, selected = domain[0];
      for (const id of domain) { pick -= weight(id); if (pick <= 0) { selected = id; break; } }
      cells[index] = [selected]; if (!propagate([index])) { contradiction = true; break; }
    }
    if (contradiction) continue;
    const tiles = cells.map(([id], index) => ({ ...TILE_CATALOG[id], index, gx: index % size, gz: Math.floor(index / size), x: (index % size - middle) * TILE_SIZE, z: (Math.floor(index / size) - middle) * TILE_SIZE, assetKey: `${biome.id}/${TILE_CATALOG[id].variant}/${TILE_CATALOG[id].mask}` }));
    const visited = new Set([spawn]), queue = [spawn], distances = new Map([[spawn, 0]]);
    while (queue.length) {
      const index = queue.shift(), tile = tiles[index];
      for (const [dx, dz, side] of directions) if (bit(tile.mask, side)) { const next = (tile.gz + dz) * size + tile.gx + dx; if (!visited.has(next)) { visited.add(next); distances.set(next, distances.get(index) + 1); queue.push(next); } }
    }
    if (visited.size < size * size * .48) continue;
    const reachable = tiles.filter(t => visited.has(t.index));
    const farthest = [...reachable].sort((a, b) => distances.get(b.index) - distances.get(a.index));
    return { tiles, reachable, spawn: tiles[spawn], goals: [farthest[0], farthest[Math.floor(farthest.length * .25)], farthest[Math.floor(farthest.length * .5)]], size, biome, seed };
  }
  throw new Error('Could not assemble a connected world. Try a new seed.');
}
export function connectionsMatch(a, b, side) { return bit(a.mask, side) === bit(b.mask, (side + 2) % 4); }
