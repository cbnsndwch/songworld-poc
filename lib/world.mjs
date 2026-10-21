export const PHYSICS = Object.freeze({ speed: 10.4, gravity: 25, jump: 10.8, laneWidth: 3, lanes: [-3, 0, 3] });
export function hash(value) {
  let h = 2166136261;
  for (const c of String(value)) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  return h >>> 0;
}
export function random(seed) {
  let a = seed >>> 0;
  return () => { a += 0x6D2B79F5; let t = a; t = Math.imul(t ^ t >>> 15, t | 1); t ^= t + Math.imul(t ^ t >>> 7, t | 61); return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
export function normalizePlan(input = {}, song = {}, profile = {}) {
  const bpm = Math.max(70, Math.min(180, Number(input.bpm) || Number(song.bpm) || 109));
  const duration = Math.max(30, Math.min(180, Number(input.duration) || 75));
  const defaults = [
    { name: 'Into the wild', objective: 'Find your footing. Follow the light.', energy: 0.35 },
    { name: 'Concrete canopy', objective: 'Collect sparks and jump the fractures.', energy: 0.7 },
    { name: 'Break through', objective: 'Ride the final rush to the portal.', energy: 0.95 }
  ];
  const sections = (Array.isArray(input.sections) && input.sections.length >= 3 ? input.sections.slice(0, 5) : defaults).map((s, i, all) => ({
    name: String(s.name || defaults[i % 3].name).slice(0, 60),
    objective: String(s.objective || defaults[i % 3].objective).slice(0, 180),
    energy: Math.max(.2, Math.min(1, Number(s.energy) || .5)), start: duration * i / all.length
  }));
  return {
    title: String(input.title || 'Electric wilderness').slice(0, 90),
    intro: String(input.intro || 'The city swallowed the sky. Follow the sparks through its concrete jungle, and make your own way out.').slice(0, 350),
    bpm, duration, sections,
    musicPrompt: String(input.musicPrompt || 'Original instrumental hard rock, gritty overdriven guitars, driving live drums, punchy bass, rebellious urban energy, tense opening building into an explosive finale, 109 BPM. No vocals.').slice(0, 1600),
    worldPrompt: String(input.worldPrompt || 'An impossible overgrown city at sunset, jungle vines wrapped around brutalist towers, amber light, electric cyan fireflies, traversable floating stone terraces, cinematic atmospheric depth.').slice(0, 1600),
    genre: String(input.genre || song.genre || 'hard rock').slice(0, 80),
    biome: String(input.biome || profile.biome || 'auto').slice(0, 50),
    difficulty: profile.difficulty === 'chill' ? 'chill' : profile.difficulty === 'intense' ? 'intense' : 'flow',
    palette: Array.isArray(song.palette) && song.palette.length >= 3 ? song.palette.slice(0, 5) : ['#f9ad3b', '#69e8d4', '#e35849', '#343d56', '#111b29']
  };
}
export function compileLevel(plan, seed = 1) {
  const rng = random(hash(seed));
  const beat = 60 / plan.bpm, bar = beat * 4, distance = bar * PHYSICS.speed;
  const maxGap = PHYSICS.speed * PHYSICS.jump * 2 / PHYSICS.gravity * .42;
  const bars = Math.ceil(plan.duration / bar) + 2;
  const platforms = [], obstacles = [], sparks = [], checkpoints = [];
  const multiplier = plan.difficulty === 'chill' ? .6 : plan.difficulty === 'intense' ? 1.25 : 1;
  for (let i = 0; i < bars; i++) {
    const t = i * bar, section = [...plan.sections].reverse().find(s => t >= s.start) || plan.sections[0];
    const gap = i < 4 || i % 8 === 0 ? 0 : Math.min(maxGap, distance * .14 * multiplier);
    const start = i * distance, end = (i + 1) * distance - gap;
    const top = 0; // Controlled collision floor; visual scenery is independent of generated mesh topology.
    platforms.push({ start, end, top, index: i, gap });
    if (i % 8 === 0) checkpoints.push({ distance: start + 2, time: (start + 2) / PHYSICS.speed });
    const safeLane = Math.floor(rng() * 3);
    if (i > 3 && i % 8 !== 0 && rng() < section.energy * multiplier) {
      const lane = (safeLane + 1 + Math.floor(rng() * 2)) % 3;
      obstacles.push({ lane, distance: start + distance * .48, width: 1.8, depth: 1.25, height: 1.45 });
      if (plan.difficulty === 'intense' && rng() > .6) obstacles.push({ lane: (lane + 1) % 3, distance: start + distance * .48, width: 1.8, depth: 1.25, height: 1.45 });
    }
    for (let b = 1; b <= 3; b++) sparks.push({ lane: safeLane, distance: start + b * distance / 4, height: b === 3 && gap > 0 ? 1.65 : .85, collected: false });
  }
  return { platforms, obstacles, sparks, checkpoints, length: PHYSICS.speed * plan.duration, beat, bar, maxGap };
}
export function sectionAt(plan, time) { return [...plan.sections].reverse().find(s => time >= s.start) || plan.sections[0]; }
