import { MOVEMENT } from './adventure.mjs';
export function surfaceAt(colliders, x, z, ceiling = Infinity) {
  let floor = null;
  for (const c of colliders) {
    const radius = Math.hypot(x - c.x, z - c.z);
    const inside = c.shape === 'round' ? radius <= c.w / 2 : Math.abs(x - c.x) <= c.w / 2 && Math.abs(z - c.z) <= c.d / 2;
    const y = c.y + (c.hill ? c.hill * (1 - (radius / (c.w / 2)) ** 2) ** 2 : 0);
    if (inside && y <= ceiling && (!floor || y > floor.y)) floor = { ...c, y };
  }
  return floor;
}
function damp(a, b, strength, dt) { return b + (a - b) * Math.exp(-strength * dt); }
export function stepCharacter(state, control, colliders, dt) {
  const p = state.position, v = state.velocity;
  const length = Math.hypot(control.horizontal, control.forward) || 1;
  const localX = control.horizontal / length, localZ = -control.forward / length, yaw = control.yaw || 0;
  const dx = localX * Math.cos(yaw) + localZ * Math.sin(yaw), dz = -localX * Math.sin(yaw) + localZ * Math.cos(yaw);
  const tuning = control.tuning || {};
  const speed = (control.sprint ? MOVEMENT.sprint : MOVEMENT.walk) * (tuning.moveSpeed ?? 1);
  const acceleration = state.grounded ? (control.horizontal || control.forward ? tuning.acceleration ?? 18 : tuning.braking ?? 28) : tuning.airControl ?? 8;
  v.x = damp(v.x, dx * speed, acceleration, dt); v.z = damp(v.z, dz * speed, acceleration, dt);
  state.jumpBuffer = Math.max(0, state.jumpBuffer - dt); state.coyote = state.grounded ? .12 : Math.max(0, state.coyote - dt);
  let jumped = false;
  if (state.jumpBuffer > 0 && state.coyote > 0) { v.y = MOVEMENT.jump; state.grounded = false; state.coyote = 0; state.jumpBuffer = 0; jumped = true; }
  const old = { x: p.x, y: p.y, z: p.z };
  v.y -= MOVEMENT.gravity * dt; p.x += v.x * dt; p.y += v.y * dt; p.z += v.z * dt;
  const floor = surfaceAt(colliders, p.x, p.z, old.y + .25);
  if (floor && v.y <= 0 && p.y <= floor.y && old.y >= floor.y - .25) { p.y = floor.y; v.y = 0; state.grounded = true; } else state.grounded = false;
  for (const c of colliders) {
    if (c.hill || c.y <= p.y + .3 || (c.bottom ?? c.y - 1) >= p.y + 1.65) continue;
    const inside = (x, z) => c.shape === 'round' ? Math.hypot(x - c.x, z - c.z) < c.w / 2 + MOVEMENT.radius : Math.abs(x - c.x) < c.w / 2 + MOVEMENT.radius && Math.abs(z - c.z) < c.d / 2 + MOVEMENT.radius;
    if (inside(p.x, p.z) && !inside(old.x, old.z)) { p.x = old.x; p.z = old.z; v.x *= .2; v.z *= .2; }
  }
  return { jumped };
}
