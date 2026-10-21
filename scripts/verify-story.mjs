import fs from 'node:fs/promises';
import { makeStory, requestJSON } from '../lib/models.mjs';
const config = JSON.parse(await fs.readFile('data/settings.json', 'utf8'));
let ready = false;
for (let attempt = 0; attempt < 300; attempt++) {
  try {
    const models = await requestJSON(`${config.nemotronURL}/models`, { timeout: 3000 });
    ready = models.data?.some(model => model.id === config.nemotronModel);
    if (ready) break;
  } catch { }
  if (attempt % 15 === 0) console.log('Waiting for the existing Nemotron service startup…');
  await new Promise(resolve => setTimeout(resolve, 2000));
}
if (!ready) throw new Error('Nemotron is still starting; inspect its existing process and logs.');
const song = { title: 'AGUA', artist: 'Maluma & Shakira', genre: 'Latin pop', bpm: 109 };
const plan = await makeStory(config, song, { difficulty: 'flow', biome: 'jungle-ruins' }, { artistContext: { genres: ['Latin pop', 'reggaeton'] } }, { onPlan: plan => fs.writeFile('data/first-nemotron-story.json', JSON.stringify({ song, plan, model: config.nemotronModel, createdAt: new Date().toISOString() }, null, 2)) });
console.log(`Real story inference completed: ${plan.title}. Nemotron GPU sleep requested.`);
