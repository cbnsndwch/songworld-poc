import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { makeMusic, makeStory } from '../lib/models.mjs';
import { normalizePlan } from '../lib/world.mjs';

test('storytelling wakes the GPU and releases it even when the model response is invalid', async t => {
  const calls = [];
  const server = http.createServer(async (req, res) => {
    calls.push(req.url); for await (const chunk of req) { }
    if (req.url === '/is_sleeping') res.end(JSON.stringify({ is_sleeping: true }));
    else if (req.url === '/v1/chat/completions') res.end(JSON.stringify({ choices: [{ message: { content: 'invalid plan' } }] }));
    else res.end();
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  await assert.rejects(makeStory({ nemotronURL: `http://127.0.0.1:${server.address().port}/v1`, nemotronModel: 'test', nemotronSleep: true }, {}, {}, {}), /did not return/);
  assert.deepEqual(calls, ['/is_sleeping', '/wake_up', '/v1/chat/completions', '/sleep?level=1']);
});

test('ACE-Step adapter submits, polls and downloads official async response format', async t => {
  let submitted; const paths = [];
  const server = http.createServer(async (req, res) => {
    paths.push(req.url); let raw = ''; for await (const b of req) raw += b;
    res.setHeader('Content-Type', 'application/json');
    if (req.url === '/release_task') { submitted = JSON.parse(raw); res.end(JSON.stringify({ data: { task_id: 'task-1' }, code: 200 })); }
    else if (req.url === '/query_result') { assert.deepEqual(JSON.parse(raw), { task_id_list: ['task-1'] }); res.end(JSON.stringify({ data: [{ task_id: 'task-1', status: 1, result: JSON.stringify([{ file: '/v1/audio?path=song.mp3', dit_model: 'acestep-v15-turbo', metas: { bpm: 109 } }]) }] })); }
    else { res.setHeader('Content-Type', 'audio/mpeg'); res.end(Buffer.from('test-audio-bytes')); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const track = await makeMusic({ acestepURL: `http://127.0.0.1:${server.address().port}` }, normalizePlan(), () => {}, { pollMs: 1, maxPolls: 2 });
  assert.equal(submitted.task_type, 'text2music'); assert.equal(submitted.lyrics, '[Instrumental]'); assert.equal(submitted.batch_size, 1);
  assert.equal(track.bytes.toString(), 'test-audio-bytes'); assert.equal(track.model, 'acestep-v15-turbo'); assert.equal(paths.length, 3);
});

test('a successful story is saved before GPU cleanup can fail', async t => {
  let saved;
  const server = http.createServer(async (req, res) => {
    for await (const chunk of req) { }
    if (req.url === '/is_sleeping') res.end(JSON.stringify({ is_sleeping: false }));
    else if (req.url === '/v1/chat/completions') res.end(JSON.stringify({ choices: [{ message: { content: '{"title":"Preserved story"}' } }] }));
    else { res.statusCode = 503; res.end(); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  await assert.rejects(makeStory({ nemotronURL: `http://127.0.0.1:${server.address().port}/v1`, nemotronSleep: true }, {}, {}, {}, { onPlan: plan => { saved = plan; } }), /sleep failed/);
  assert.equal(saved.title, 'Preserved story');
});
test('Nemotron adapter carries player preferences and lyric context into a bounded plan', async t => {
  let submitted;
  const server = http.createServer(async (req, res) => { let raw = ''; for await (const b of req) raw += b; submitted = JSON.parse(raw); res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify({ choices: [{ message: { content: '```json\n{"title":"Wild escape","bpm":123,"duration":75}\n```' } }] })); });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const plan = await makeStory({ nemotronURL: `http://127.0.0.1:${server.address().port}`, nemotronModel: 'Nemotron' }, { title: 'Test', artist: 'Test' }, { difficulty: 'chill' }, { lyrics: 'Original test context', artistContext: { genres: ['rock'] } });
  assert.equal(plan.title, 'Wild escape'); assert.equal(plan.bpm, 123); assert.equal(plan.difficulty, 'chill');
  assert.equal(submitted.chat_template_kwargs.enable_thinking, false); assert.equal(JSON.parse(submitted.messages[1].content).profile.difficulty, 'chill');
});
