export const CONTROL_FIELDS = [
  ['sensitivity', 'Mouse sensitivity', .5, 2.5, .1, 1],
  ['orbitSpeed', 'Q / E camera speed', .7, 3.5, .1, 2.2],
  ['cameraResponse', 'Camera response', 6, 30, 1, 18],
  ['cameraDistance', 'Camera distance', 6, 14, .5, 9],
  ['turnResponse', 'Character turn response', 10, 40, 1, 28],
  ['acceleration', 'Movement response', 8, 30, 1, 18],
  ['braking', 'Stopping response', 10, 40, 1, 28],
  ['airControl', 'Air control', 3, 15, 1, 8],
  ['moveSpeed', 'Movement speed', .7, 1.3, .05, 1],
];
export const DEFAULT_CONTROLS = Object.fromEntries(CONTROL_FIELDS.map(([key, , , , , value]) => [key, value]));
DEFAULT_CONTROLS.invertY = false;
export function normalizeControls(value = {}) {
  return { ...Object.fromEntries(CONTROL_FIELDS.map(([key, , min, max, , fallback]) => [key, Number.isFinite(Number(value[key])) ? Math.max(min, Math.min(max, Number(value[key]))) : fallback])), invertY: value.invertY === true };
}
