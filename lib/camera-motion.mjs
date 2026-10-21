const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function smoothOrbit(current, target, dt, response = 7) {
  const blend = 1 - Math.exp(-dt * response);
  const rate = response / 7;
  const yawDifference = Math.atan2(Math.sin(target.yaw - current.yaw), Math.cos(target.yaw - current.yaw));
  current.yaw += clamp(yawDifference * blend, -1.8 * rate * dt, 1.8 * rate * dt);
  current.pitch += clamp((target.pitch - current.pitch) * blend, -.8 * rate * dt, .8 * rate * dt);
  current.distance += clamp((target.distance - current.distance) * blend, -8 * dt, 8 * dt);
  return current;
}
