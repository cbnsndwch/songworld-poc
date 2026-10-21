import fs from 'node:fs/promises';
import { makeMusic, requestJSON } from '../lib/models.mjs';
import { normalizePlan } from '../lib/world.mjs';
const config = JSON.parse(await fs.readFile('data/settings.json', 'utf8'));
const benchmark = process.argv.includes('--benchmark');
const story = benchmark ? { plan: normalizePlan({ bpm: 109, duration: 75, musicPrompt: 'Original instrumental adventure music, warm marimba, airy synth pads, light hand percussion, playful exploration mood, 109 BPM, no vocals.' }) } : JSON.parse(await fs.readFile('data/first-nemotron-story.json', 'utf8'));
let ready = false;
for (let attempt = 0; attempt < 180; attempt++) {
  try {
    const result = await requestJSON(`${config.acestepURL}/health`, { timeout: 3000 });
    // Official API lazy-loads weights on the first task, not on /health.
    ready = result.data?.status === 'ok';
    if (ready) break;
  } catch { }
  if (attempt % 15 === 0) console.log('Waiting for the existing ACE-Step startup…');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!ready) throw new Error('ACE-Step has not initialized; inspect its existing process and logs.');
const music = await makeMusic(config, story.plan, message => console.log(message));
await fs.writeFile(`data/audio/${benchmark ? 'benchmark' : 'first-ai'}-soundtrack.mp3`, music.bytes);
await fs.writeFile(`data/${benchmark ? 'benchmark' : 'first'}-acestep-music.json`, JSON.stringify({ model: music.model, seed: music.seed, metadata: music.metadata, planSource: benchmark ? 'Handwritten hardware benchmark prompt; not Nemotron output' : 'Verified Nemotron output', bytes: music.bytes.length, createdAt: new Date().toISOString() }, null, 2));
console.log(`Real ACE-Step generation completed: ${music.bytes.length} audio bytes.`);
