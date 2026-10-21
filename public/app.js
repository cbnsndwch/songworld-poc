import { CONTROL_FIELDS, DEFAULT_CONTROLS, normalizeControls } from '/lib/gameplay-settings.mjs';
import { Runner } from './adventure-game.js';
import { normalizePlan, hash, random } from '/lib/world.mjs';
import { BIOMES, chooseBiome } from '/lib/biomes.mjs';
const $ = id => document.getElementById(id);
const show = id => $(id).hidden = false, hide = id => $(id).hidden = true;
const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
const write = (key, value) => localStorage.setItem(key, JSON.stringify(value));
const profile = read('songworld-profile', { difficulty: 'flow', bests: {}, runs: [], favoriteGenres: [] });
let song, current, generated, health, toastTimer, polling = false;
const timeLabel = time => `${Math.floor(time / 60)}:${String(Math.floor(time % 60)).padStart(2, '0')}`;
async function api(url, options) { const response = await fetch(url, options); const value = await response.json(); if (!response.ok || value.error && !('songs' in value)) throw new Error(value.error || 'Something went wrong.'); return value; }
function toast(message) { $('toast').textContent = message; $('toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 2700); }
let game;
try {
  game = new Runner($('world'), {
    toast,
    biome: biome => { $('scene-name').textContent = biome.name; $('scene-description').textContent = (biome.terrainLabel || 'EXPLORE · CLIMB · DISCOVER').toUpperCase(); },
    chapter: section => { $('chapter-label').textContent = section.name.toUpperCase(); $('objective').textContent = section.objective; },
    update: info => {
      $('sparks').textContent = info.score; $('elapsed').textContent = timeLabel(info.time); $('total-time').textContent = timeLabel(info.duration);
      $('run-progress').style.width = `${Math.min(100, info.time / info.duration * 100)}%`;
      document.querySelectorAll('.beat-meter i').forEach((node, i) => node.classList.toggle('active', i === info.beat));
      $('relic-count').textContent = Array.from({ length: 3 }, (_, i) => i < info.goals ? '◆' : '◇').join(' '); $('relic-distance').textContent = `${info.goals === 3 ? 'SHRINE' : 'NEAREST RELIC'} · ${Math.round(info.targetDistance || 0)} M`; $('relic-arrow').style.transform = `rotate(${info.bearing || 0}rad)`;
    },
    finish: finishRun
  });
} catch (error) { $('search-status').textContent = `3D rendering unavailable: ${error.message}. Try a browser with WebGL enabled.`; $('play-button').disabled = true; }
let controls = normalizeControls(read('songworld-controls', DEFAULT_CONTROLS));
let controlsReturn = 'home';
function applyControls() {
  game?.setControls(controls); write('songworld-controls', controls);
  for (const [key] of CONTROL_FIELDS) { const input = $('control-' + key); if (input) { input.value = controls[key]; $('value-' + key).value = Number(controls[key].toFixed(2)); } }
  $('control-invert').checked = controls.invertY;
}
for (const [key, title, min, max, step] of CONTROL_FIELDS) {
  const label = document.createElement('label'); label.className = 'control-slider';
  const text = document.createElement('span'); text.textContent = title;
  const output = document.createElement('output'); output.id = 'value-' + key;
  const input = document.createElement('input'); input.type = 'range'; input.id = 'control-' + key; input.min = min; input.max = max; input.step = step; input.setAttribute('aria-label', title);
  input.addEventListener('input', () => { controls[key] = Number(input.value); applyControls(); });
  label.append(text, output, input); $('control-sliders').append(label);
}
applyControls();
async function openControls() {
  controlsReturn = game?.mode || 'home';
  if (controlsReturn === 'playing') await game.pause();
  hide('pause-overlay'); show('controls-overlay'); $('controls-close').focus();
}
async function closeControls() {
  hide('controls-overlay');
  if (controlsReturn === 'playing') await game.resume();
  else if (controlsReturn === 'paused') show('pause-overlay');
  (controlsReturn === 'home' ? $('controls-button') : $('pause-button')).focus();
}
$('controls-button').addEventListener('click', openControls);
$('pause-controls-button').addEventListener('click', openControls);
$('controls-close').addEventListener('click', closeControls);
$('controls-done').addEventListener('click', closeControls);
$('controls-reset').addEventListener('click', () => { controls = normalizeControls(DEFAULT_CONTROLS); applyControls(); });
$('control-invert').addEventListener('change', event => { controls.invertY = event.target.checked; applyControls(); });
document.querySelectorAll('[data-preset]').forEach(button => button.addEventListener('click', () => {
  controls = normalizeControls(button.dataset.preset === 'gentle' ? { ...DEFAULT_CONTROLS, cameraResponse: 10, sensitivity: .7, orbitSpeed: 1.3, turnResponse: 20, acceleration: 12, moveSpeed: .85 } : DEFAULT_CONTROLS); applyControls();
}));
window.songworld = { snapshot: () => game?.snapshot() };
$('difficulty').value = profile.difficulty;
BIOMES.forEach(biome => { const option = document.createElement('option'); option.value = biome.id; option.textContent = biome.name; $('biome').append(option); });
const linkedBiome = new URLSearchParams(location.search).get('biome');
$('biome').value = BIOMES.some(biome => biome.id === linkedBiome) ? linkedBiome : profile.biome || 'auto';
$('biome').addEventListener('change', () => { profile.biome = $('biome').value; write('songworld-profile', profile); updatePreview(); });
function paletteFor(track) {
  if (track.palette) return track.palette;
  const r = random(hash(track.title + track.artist)), hue = Math.floor(r() * 360);
  return [`hsl(${hue}, 75%, 65%)`, `hsl(${(hue + 150) % 360}, 65%, 65%)`, `hsl(${(hue + 30) % 360}, 55%, 45%)`, '#35434a', '#121d28'];
}
function renderPalette(colors) {
  $('palette').replaceChildren(...colors.map(color => { const el = document.createElement('i'); el.style.backgroundColor = color; return el; }));
  document.documentElement.style.setProperty('--amber', colors[0]); document.documentElement.style.setProperty('--cyan', colors[1]);
}
function previewResult() {
  const plan = normalizePlan({ bpm: Number($('tempo').value), difficulty: profile.difficulty }, song, profile);
  plan.biome = $('biome')?.value || 'auto';
  plan.title = chooseBiome(song, plan.biome).name;
  if (!/welcome to the jungle/i.test(song.title)) {
    plan.title = `${song.title.split(/\s+/).slice(0, 3).join(' ')} / Afterglow`;
    plan.intro = `A new route through the sound of ${song.artist}. Follow the sparks, find the gaps, and make this frequency your own.`;
  }
  return { id: `preview-${hash(song.title + song.artist)}`, song: { ...song }, plan, provenance: { story: 'Handcrafted playtest story', music: 'Browser synth test loop', world: 'Procedural 3D preview' }, preview: true };
}
function updatePreview() {
  generated = null; current = previewResult();
  // A late cover download may update colors, but must not rebuild an active run.
  if (game?.mode === 'home') { game.result = current; game.resetAssets(); game.build(current.plan, current.id); }
  $('scene-name').textContent = game?.biome?.name || current.plan.title; $('scene-description').textContent = (game?.terrain?.label || 'EXPLORE · CLIMB · DISCOVER').toUpperCase();
  $('play-button').firstChild.textContent = 'Enter playtest ';
  $('tempo-label').textContent = `${current.plan.bpm} BPM EST.`;
  renderPalette(song.palette);
}
async function selectTrack(track) {
  song = { ...track, palette: paletteFor(track) }; $('track-title').value = song.title; $('artist-name').value = song.artist;
  $('selected-title').textContent = song.title; $('selected-artist').textContent = song.artist; $('genre-label').textContent = (song.genre === 'unknown' ? 'YOUR FREQUENCY' : song.genre).toUpperCase();
  $('track-source').textContent = `${song.source.toUpperCase()} · INSPIRATION ONLY`;
  $('tempo').value = song.bpm || 109; $('cover-image').hidden = true; $('cover-placeholder').hidden = false;
  $('cover-placeholder').querySelector('span').textContent = song.artist.split(/\s+/).map(w => w[0]).slice(0, 5).join(' ');
  $('cover-placeholder').querySelector('b').textContent = song.title.split(/\s+/).slice(0, 4).join(' ');
  hide('search-results'); updatePreview(); write('songworld-last-song', song);
  if (song.releaseId) {
    const selectedId = song.id, img = new Image();
    img.onload = () => {
      if (song.id !== selectedId) return;
      $('cover-image').src = img.src; $('cover-image').alt = `${song.releaseTitle || song.title} cover`; $('cover-image').hidden = false; $('cover-placeholder').hidden = true;
      try { song.palette = extractPalette(img); updatePreview(); write('songworld-last-song', song); $('track-source').textContent = 'COVER ART ARCHIVE · COLORS EXTRACTED'; } catch {}
    };
    img.onerror = () => { if (song.id === selectedId) $('track-source').textContent = 'MUSICBRAINZ · COVER UNAVAILABLE · SEEDED COLORS'; };
    img.src = `/api/cover/${song.releaseId}`;
  }
}
function extractPalette(image) {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 64;
  const context = canvas.getContext('2d', { willReadFrequently: true }); context.drawImage(image, 0, 0, 64, 64);
  const pixels = context.getImageData(0, 0, 64, 64).data, buckets = new Map();
  for (let i = 0; i < pixels.length; i += 4) {
    const r = pixels[i], g = pixels[i + 1], b = pixels[i + 2], max = Math.max(r, g, b), min = Math.min(r, g, b);
    if (max < 50 || min > 220 || max - min < 20) continue;
    const key = `${Math.round(r / 40)},${Math.round(g / 40)},${Math.round(b / 40)}`;
    const existing = buckets.get(key) || { sum: [0, 0, 0], count: 0 }; existing.sum[0] += r; existing.sum[1] += g; existing.sum[2] += b; existing.count++; buckets.set(key, existing);
  }
  const colors = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, 12).map(v => v.sum.map(n => Math.round(n / v.count)));
  const selected = [];
  for (const color of colors) { if (selected.every(other => color.reduce((s, v, i) => s + (v - other[i]) ** 2, 0) > 6000)) selected.push(color); if (selected.length === 3) break; }
  const hex = selected.map(rgb => { const max = Math.max(...rgb); const boost = max < 170 ? 180 / Math.max(max, 1) : 1; return '#' + rgb.map(n => Math.min(255, Math.round(n * boost)).toString(16).padStart(2, '0')).join(''); });
  return [...hex, '#70dcca', '#f2b74e', '#30443f', '#111c28'].slice(0, 5);
}
$('search-form').addEventListener('submit', async event => {
  event.preventDefault(); $('search-button').disabled = true; $('search-status').textContent = 'Searching the music catalog…';
  try {
    const result = await api(`/api/search?${new URLSearchParams({ title: $('track-title').value, artist: $('artist-name').value })}`);
    $('search-results').replaceChildren();
    for (const track of result.songs) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'search-result'; button.textContent = track.title;
      const small = document.createElement('small'); small.textContent = `${track.artist} · ${track.releaseTitle || 'Recording'}`; button.append(small); button.addEventListener('click', () => { selectTrack(track); $('search-status').textContent = 'Inspiration selected. Adjust the target tempo if you like.'; }); $('search-results').append(button);
    }
    if (result.songs.length) show('search-results'); else hide('search-results');
    $('search-status').textContent = result.warning || (result.songs.length ? `${result.songs.length} matching recording${result.songs.length === 1 ? '' : 's'} · choose one below` : 'No matches. Try another spelling or use the entered track.');
  } catch (error) { $('search-status').textContent = error.message; } finally { $('search-button').disabled = false; }
});
$('manual-track').addEventListener('click', () => {
  const title = $('track-title').value.trim(), artist = $('artist-name').value.trim();
  if (!title || !artist) { $('search-status').textContent = 'Enter both a title and artist.'; return; }
  selectTrack({ id: `manual-${hash(title + artist)}`, title, artist, genre: 'unknown', source: 'Your track entry' }); $('search-status').textContent = 'Using your track entry. Catalog colors will be available after a matching search.';
});
$('difficulty').addEventListener('change', () => { profile.difficulty = $('difficulty').value; write('songworld-profile', profile); updatePreview(); });
$('tempo').addEventListener('change', () => { $('tempo').value = Math.max(70, Math.min(180, Number($('tempo').value) || 109)); updatePreview(); });
async function startRun(result) {
  await game.sound.unlock();
  result = { ...result };
  if (result.preview) {
    const biome = chooseBiome({ ...result.song, genre: result.plan.genre }, result.plan.biome).id;
    try { result.world = (await api(`/api/biome-assets?biome=${encodeURIComponent(biome)}`)).world; } catch { }
  }
  hide('generation-overlay'); hide('library-overlay'); hide('finish-overlay'); hide('pause-overlay'); hide('home'); show('hud'); document.body.classList.add('playing');
  $('run-title').textContent = result.plan.title; $('beat-label').textContent = `${result.plan.bpm} BPM`; $('sparks').textContent = '0';
  $('audio-provenance').textContent = result.preview ? `LOCAL SYNTH PLAYTEST · ${result.world ? 'HUNYUAN3D LANDMARKS' : 'PROCEDURAL SCENERY'}` : `${result.provenance.music.toUpperCase()} · ${result.world ? result.world.model.toUpperCase() : 'PROCEDURAL SCENERY'}`;
  $('play-button').disabled = true;
  try { await game.start(result); rememberWorld(result); }
  catch (error) { goHome(); $('search-status').textContent = error.message; }
  finally { $('play-button').disabled = false; }
}
$('play-button').addEventListener('click', () => startRun(generated || current));
function goHome() { game.home(); hide('hud'); hide('pause-overlay'); hide('finish-overlay'); show('home'); document.body.classList.remove('playing'); game.resetAssets(); updatePreview(); }
async function pauseRun() { if (game.mode !== 'playing') return; await game.pause(); show('pause-overlay'); }
$('pause-button').addEventListener('click', pauseRun);
$('resume-button').addEventListener('click', async () => { hide('pause-overlay'); await game.resume(); });
$('restart-button').addEventListener('click', () => startRun(game.result));
$('exit-button').addEventListener('click', goHome);
$('again-button').addEventListener('click', () => startRun(game.result));
$('finish-home').addEventListener('click', goHome);
document.addEventListener('keydown', event => {
  if (!$('controls-overlay').hidden) { if (event.code === 'Escape') { event.preventDefault(); closeControls(); } return; }
  if (['INPUT', 'SELECT', 'TEXTAREA'].includes(event.target.tagName)) return;
  if (game?.mode === 'playing' && ['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD', 'KeyW', 'KeyS', 'Escape', 'KeyP'].includes(event.code)) event.preventDefault();
  if (event.repeat) return;
  if (event.code === 'Space') game?.jump();
  if (['Escape', 'KeyP'].includes(event.code)) { if (game?.mode === 'playing') pauseRun(); else if (game?.mode === 'paused') $('resume-button').click(); }
});
document.addEventListener('visibilitychange', () => { if (document.hidden && game?.mode === 'playing') pauseRun(); });
for (const [id, action] of [['touch-left', () => game.steer(-1)], ['touch-right', () => game.steer(1)], ['touch-jump', () => game.jump()]]) $(id).addEventListener('pointerdown', event => { event.preventDefault(); action(); });
function rememberWorld(result) {
  const worlds = read('songworld-worlds', []), index = worlds.findIndex(w => w.id === result.id);
  if (index >= 0) worlds.splice(index, 1); worlds.unshift({ ...result, lastPlayed: Date.now() }); write('songworld-worlds', worlds.slice(0, 30)); $('world-count').textContent = worlds.length;
}
function finishRun({ score, deaths, result }) {
  const key = `${result.song.artist}:${result.song.title}`; profile.bests[key] = Math.max(profile.bests[key] || 0, score);
  profile.runs.unshift({ song: result.song.title, artist: result.song.artist, score, deaths, difficulty: result.plan.difficulty, at: new Date().toISOString() }); profile.runs = profile.runs.slice(0, 50);
  profile.favoriteGenres = [...new Set([result.plan.genre, ...profile.favoriteGenres])].slice(0, 8); write('songworld-profile', profile);
  $('finish-sparks').textContent = score; $('finish-best').textContent = profile.bests[key]; $('finish-summary').textContent = `${result.plan.title} · ${deaths === 0 ? 'A flawless run.' : `${deaths} second chance${deaths === 1 ? '' : 's'}. You kept going.`}`; show('finish-overlay');
}
async function checkHealth() {
  health = await api('/api/health'); const connected = health.nemotron.ready && health.music.ready;
  $('connection').classList.toggle('ready', connected); $('connection').lastChild.textContent = connected ? ' VM CONNECTED' : ' LOCAL PLAYTEST';
  $('service-status').replaceChildren(...[['nemotron', 'Nemotron storytelling'], ['music', 'ACE-Step soundtrack'], ['world', 'Hunyuan scenery']].map(([key, label]) => { const line = document.createElement('div'); line.textContent = `${health[key].ready ? '●' : '○'} ${label} — ${health[key].ready ? 'connected' : health[key].configured ? 'not reachable' : 'not configured'}`; if (!health[key].ready) line.className = 'offline'; return line; }));
  return connected;
}
async function openSettings() {
  const settings = await api('/api/settings'); for (const [key, value] of Object.entries(settings)) if ($('settings-form').elements[key]) $('settings-form').elements[key].value = value;
  show('settings-overlay'); $('service-status').textContent = 'Checking your services…'; await checkHealth();
}
$('settings-button').addEventListener('click', openSettings);
$('settings-form').addEventListener('submit', async event => {
  event.preventDefault(); const button = event.submitter; button.disabled = true;
  try { await api('/api/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(Object.fromEntries(new FormData(event.target))) }); await checkHealth(); }
  catch (error) { $('service-status').textContent = error.message; } finally { button.disabled = false; }
});
document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => hide(button.dataset.close)));
document.querySelectorAll('.overlay').forEach(overlay => overlay.addEventListener('click', event => { if (event.target === overlay && !['pause-overlay', 'finish-overlay', 'controls-overlay'].includes(overlay.id)) hide(overlay.id); }));
$('generate-button').addEventListener('click', async () => {
  if (polling) { show('generation-overlay'); return; }
  $('generate-button').disabled = true;
  try {
    if (!await checkHealth()) { await openSettings(); return; }
    $('generation-title').textContent = 'Building your world.'; $('generation-bar').style.width = '0%'; $('generation-message').textContent = 'Gathering your inspiration…'; hide('generation-play'); show('generation-overlay');
    const { id } = await api('/api/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ song: { ...song, bpm: Number($('tempo').value) }, profile }) });
    localStorage.setItem('songworld-active-job', id); pollJob(id);
  } catch (error) { $('search-status').textContent = error.message; } finally { $('generate-button').disabled = false; }
});
async function pollJob(id) {
  if (polling) return; polling = true;
  try {
    while (true) {
      const job = await api(`/api/jobs/${id}`); $('generation-message').textContent = job.message; $('generation-bar').style.width = `${job.progress || 0}%`;
      if (job.status === 'ready') {
        generated = job.result; current = generated; rememberWorld(generated); $('generation-title').textContent = generated.plan.title; show('generation-play');
        $('generation-message').textContent = generated.world ? 'Your story, soundtrack, and generated scenery are ready.' : generated.provenance.worldWarning ? `Your story and soundtrack are ready. Hunyuan could not complete: ${generated.provenance.worldWarning}. This playtest uses procedural scenery.` : 'Your AI story and original soundtrack are ready. Scenery is procedural; Hunyuan is not connected.';
        $('play-button').firstChild.textContent = 'Enter your world '; localStorage.removeItem('songworld-active-job'); break;
      }
      if (job.status === 'failed') { $('generation-title').textContent = 'The engine needs a tune-up.'; localStorage.removeItem('songworld-active-job'); break; }
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  } catch (error) { $('generation-message').textContent = error.message; localStorage.removeItem('songworld-active-job'); } finally { polling = false; }
}
$('generation-close').addEventListener('click', () => hide('generation-overlay'));
$('generation-play').addEventListener('click', () => startRun(generated));
$('library-button').addEventListener('click', async () => {
  show('library-overlay'); const local = read('songworld-worlds', []); let server = []; try { server = await api('/api/history'); } catch {}
  const worlds = [...new Map([...local, ...server].map(w => [w.id, w])).values()]; $('library-content').replaceChildren();
  if (!worlds.length) { const empty = document.createElement('div'); empty.className = 'library-empty'; empty.textContent = 'Your first world is one run away. Play a track to save it here.'; $('library-content').append(empty); }
  worlds.forEach(world => {
    const card = document.createElement('div'); card.className = 'library-item'; const title = document.createElement('h3'); title.textContent = world.plan.title;
    const text = document.createElement('p'); text.textContent = `${world.song.title} · ${world.song.artist} · ${world.preview ? 'Local playtest' : 'AI soundtrack'} · Best ${profile.bests[`${world.song.artist}:${world.song.title}`] || 0}`;
    const play = document.createElement('button'); play.textContent = 'Run it again ↗'; play.addEventListener('click', () => startRun(world)); card.append(title, text, play); $('library-content').append(card);
  });
});
const demo = await api('/api/demo'); await selectTrack(read('songworld-last-song', demo.song));
$('world-count').textContent = read('songworld-worlds', []).length;
checkHealth().catch(() => {});
const activeJob = localStorage.getItem('songworld-active-job'); if (activeJob) { show('generation-overlay'); pollJob(activeJob); }
