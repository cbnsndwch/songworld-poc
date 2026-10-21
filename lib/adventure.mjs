import { hash, random } from './world.mjs';
export const MOVEMENT = Object.freeze({ walk: 6.2, sprint: 9.4, jump: 11.8, gravity: 25, radius: .32 });
export function compileAdventure(plan, seed) {
  const rng = random(hash(seed));
  const count = Math.max(10, Math.min(20, Math.round(plan.duration / 6)));
  const islands = [{ x: 0, z: 0, y: 0, radius: 12, index: 0, checkpoint: true }];
  for (let i = 1; i < count; i++) {
    const previous = islands[i - 1], radius = 7.5 + rng() * 2, angle = Math.sin(i * .85) * .65;
    const gap = plan.difficulty === 'chill' ? 1.6 : plan.difficulty === 'intense' ? 3.5 : 2.5;
    const spacing = previous.radius + radius + gap;
    islands.push({ x: previous.x + Math.sin(angle) * spacing, z: previous.z - Math.cos(angle) * spacing, y: previous.y + .65 + rng() * .45, radius, index: i, checkpoint: i % 3 === 0 });
  }
  const sparks = [];
  islands.forEach((island, i) => {
    const next = islands[i + 1] || island, dx = next.x - island.x, dz = next.z - island.z, length = Math.hypot(dx, dz) || 1;
    for (const factor of [-.35, .05, .45]) sparks.push({ x: island.x + dx / length * island.radius * factor, z: island.z + dz / length * island.radius * factor, y: island.y + .95, collected: false });
  });
  const branches = islands.filter((_, i) => i > 1 && i % 3 === 2).map((island, i) => ({ x: island.x + (i % 2 ? -1 : 1) * (island.radius + 6), z: island.z + 1, y: island.y + 1.3, radius: 4.3, index: count + i, branch: true }));
  branches.forEach(island => { for (let i = 0; i < 3; i++) sparks.push({ x: island.x + Math.cos(i * 2.1) * 1.5, z: island.z + Math.sin(i * 2.1) * 1.5, y: island.y + 1, collected: false }); });
  return { islands: [...islands, ...branches], route: islands, sparks, portal: islands.at(-1), required: plan.difficulty === 'chill' ? 6 : 12 };
}
export function groundAt(islands, x, z, ceiling = Infinity) {
  let floor = null;
  for (const island of islands) if (island.y <= ceiling && Math.hypot(x - island.x, z - island.z) < island.radius * .96) if (!floor || island.y > floor.y) floor = island;
  return floor;
}
