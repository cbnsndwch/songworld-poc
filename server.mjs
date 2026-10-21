import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { normalizePlan } from './lib/world.mjs';
import { requestJSON, makeStory, makeMusic, makeWorld } from './lib/models.mjs';
import { chooseBiome } from './lib/biomes.mjs';
import { readBiomeBank, persistWorld } from './lib/asset-cache.mjs';
const root = path.dirname(fileURLToPath(import.meta.url));
try { process.loadEnvFile(path.join(root, '.env')); } catch (e) { if (e.code !== 'ENOENT') throw e; }
const dataDir = path.join(root, 'data');
await fs.mkdir(path.join(dataDir, 'audio'), { recursive: true });
await fs.mkdir(path.join(dataDir, 'covers'), { recursive: true });
const assetDir = path.join(dataDir, 'generated-assets');
await fs.mkdir(assetDir, { recursive: true });
let settings = {};
try { settings = JSON.parse(await fs.readFile(path.join(dataDir, 'settings.json'), 'utf8')); } catch { }
const config = () => ({
    nemotronSleep: settings.nemotronSleep ?? process.env.NEMOTRON_SLEEP === 'true',
    nemotronURL: settings.nemotronURL || process.env.NEMOTRON_URL || 'http://127.0.0.1:8000/v1',
    nemotronModel: settings.nemotronModel || process.env.NEMOTRON_MODEL || 'nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4',
    acestepURL: settings.acestepURL || process.env.ACESTEP_URL || 'http://127.0.0.1:8001',
    hunyuanURL: settings.hunyuanURL ?? process.env.HUNYUAN_URL ?? ''
});
const cache = new Map(), jobs = new Map();
let generationQueue = Promise.resolve(), mbQueue = Promise.resolve();
const demoSong = { id: 'demo-jungle', title: 'Welcome to the Jungle', artist: "Guns N’ Roses", duration: 273, genre: 'hard rock', source: 'Saved demo metadata', bpm: 109, tempoSource: 'Demo estimate; not measured', releaseTitle: 'Appetite for Destruction', palette: ['#f6b53f', '#5ddcc8', '#d75446', '#253443', '#0b131d'] };
const send = (res, status, body) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
async function body(req) {
    let text = '';
    for await (const part of req) { text += part; if (text.length > 100000) throw new Error('Request too large.'); }
    return JSON.parse(text || '{}');
}
async function cached(key, fn, ttl = 3600000) {
    const existing = cache.get(key);
    if (existing && Date.now() - existing.time < ttl) return existing.value;
    const value = await fn(); cache.set(key, { value, time: Date.now() }); return value;
}
function musicbrainz(suffix) {
    const request = mbQueue.then(async () => {
        try { return await requestJSON(`https://musicbrainz.org/ws/2/${suffix}`, { timeout: 14000, headers: { 'User-Agent': 'Songworld/0.1 (personal hackathon prototype; music metadata lookup)', Accept: 'application/json' } }); }
        finally { await new Promise(resolve => setTimeout(resolve, 1100)); }
    });
    mbQueue = request.catch(() => { });
    return request;
}
const cleanSearch = value => String(value || '').replace(/["\\:]/g, ' ').replace(/[’‘]/g, "'").trim().slice(0, 150);
async function search(title, artist) {
    return cached(`search:${title}:${artist}`, async () => {
        const query = `recording:"${cleanSearch(title)}"${artist ? ` AND artist:"${cleanSearch(artist)}"` : ''}`;
    let result = await musicbrainz(`recording/?query=${encodeURIComponent(query + ' AND status:official AND NOT secondarytype:live')}&fmt=json&limit=30`);
    if (!result.recordings?.length) result = await musicbrainz(`recording/?query=${encodeURIComponent(query)}&fmt=json&limit=30`);
        const unique = new Map();
    const releaseRank = release => Number(release.status === 'Official') * 5 + Number(release['release-group']?.['primary-type'] === 'Album') * 8 + Number(!(release['release-group']?.['secondary-types'] || []).length) * 10 - Number(/live|broadcast|demos/i.test(release.title || '')) * 20;
    const candidates = [...(result.recordings || [])].sort((a, b) => Math.max(0, ...(b.releases || []).map(releaseRank)) - Math.max(0, ...(a.releases || []).map(releaseRank)) || Number(!!b.length) - Number(!!a.length));
    for (const r of candidates) {
            const credit = r['artist-credit'] || [], name = credit.map(a => (a.name || a.artist?.name || '') + (a.joinphrase || '')).join('');
      const releases = [...(r.releases || [])].sort((a, b) => releaseRank(b) - releaseRank(a) || String(a.date || '9999').localeCompare(String(b.date || '9999')));
      const release = releases[0];
            const key = `${r.title.toLowerCase()}:${name.toLowerCase()}`;
            if (!unique.has(key)) unique.set(key, { id: r.id, title: r.title, artist: name, artistId: credit[0]?.artist?.id, duration: Math.round((r.length || 0) / 1000), releaseId: release?.id, releaseTitle: release?.title, source: 'MusicBrainz', score: r.score, genre: 'unknown' });
        }
        return { songs: [...unique.values()].slice(0, 8), source: 'MusicBrainz' };
    });
}
async function enrich(song) {
    const [lyrics, artist] = await Promise.allSettled([
        cached(`lyrics:${song.artist}:${song.title}`, async () => {
            const params = new URLSearchParams({ track_name: song.title, artist_name: song.artist });
            if (song.duration) params.set('duration', song.duration);
            try { return await requestJSON(`https://lrclib.net/api/get?${params}`, { timeout: 10000 }); }
            catch { const found = await requestJSON(`https://lrclib.net/api/search?${new URLSearchParams({ track_name: song.title, artist_name: song.artist })}`, { timeout: 10000 }); return found.find(x => x.trackName?.toLowerCase() === song.title.toLowerCase()) || {}; }
        }),
        song.artistId ? cached(`artist:${song.artistId}`, () => musicbrainz(`artist/${song.artistId}?inc=tags&fmt=json`)) : Promise.resolve({ tags: [{ name: song.genre || 'hard rock' }] })
    ]);
    const l = lyrics.status === 'fulfilled' ? lyrics.value : {};
    const a = artist.status === 'fulfilled' ? artist.value : {};
    return { lyrics: l.plainLyrics || l.syncedLyrics || '', lyricsAvailable: !!(l.plainLyrics || l.syncedLyrics), artistContext: { name: song.artist, type: a.type, country: a.country, genres: (a.tags || []).slice(0, 8).map(t => t.name) } };
}
async function serviceHealth() {
    const c = config();
    const targets = [['nemotron', `${c.nemotronURL}/models`, process.env.NEMOTRON_API_KEY], ['music', `${c.acestepURL}/health`, process.env.ACESTEP_API_KEY], ['world', c.hunyuanURL ? `${c.hunyuanURL}/health` : '', '']];
    const checks = await Promise.all(targets.map(async ([name, url, key]) => {
        if (!url) return [name, { ready: false, configured: false }];
        try { const result = await requestJSON(url, { timeout: 2000, headers: key ? { Authorization: `Bearer ${key}` } : {} }); return [name, { ready: result.ready !== false && result.installed !== false, configured: true, models: name === 'nemotron' ? result.data?.map?.(x => x.id) : undefined }]; }
        catch { return [name, { ready: false, configured: true }]; }
    }));
    return Object.fromEntries(checks);
}
async function generate(job, input) {
    const update = (stage, message, progress) => Object.assign(job, { stage, message, progress });
    try {
        const c = config(), song = input.song, profile = input.profile || {};
        if (!song?.title || !song?.artist) throw new Error('Choose a song first.');
        update('context', 'Finding lyric themes and artist context', 10);
        const context = await enrich(song);
        update('story', 'Nemotron is writing your world', 25);
        const plan = await makeStory(c, song, profile, context, { onPlan: plan => fs.writeFile(path.join(dataDir, `${job.id}-story.json`), JSON.stringify({ song, plan, model: c.nemotronModel, createdAt: new Date().toISOString() }, null, 2)) });
        plan.biome = chooseBiome({ ...song, genre: plan.genre }, profile.biome || plan.biome).id;
        update('music', 'ACE-Step is composing an original soundtrack', 45);
        const music = await makeMusic(c, plan, message => update('music', message, 50));
        await fs.writeFile(path.join(dataDir, 'audio', `${job.id}.mp3`), music.bytes);
        update('world', c.hunyuanURL ? 'Generating Hunyuan scenery' : 'Building playable 3D scenery', 80);
        let world = null, worldWarning = null;
        try {
            const biome = chooseBiome({ genre: plan.genre, title: plan.title }, plan.biome);
            world = await readBiomeBank(assetDir, biome.id);
            if (world) update('world', 'Loading your locally saved biome bank', 90);
            else if (c.hunyuanURL) world = await persistWorld(assetDir, biome.id, await makeWorld(c, plan), c.hunyuanURL);
        } catch (e) { worldWarning = e.message; }
        const result = { id: job.id, song, plan, audioUrl: `/audio/${job.id}.mp3`, world, createdAt: new Date().toISOString(), provenance: { story: c.nemotronModel, music: music.model, world: world?.model || 'Procedural preview scenery', lyrics: context.lyricsAvailable ? 'LRCLIB themes' : 'Unavailable; metadata used', tempo: 'Nemotron estimate; generated soundtrack target', worldWarning } };
        await fs.writeFile(path.join(dataDir, `${job.id}.json`), JSON.stringify(result, null, 2));
        Object.assign(job, { status: 'ready', stage: 'ready', message: 'Your world is ready', progress: 100, result });
    } catch (e) { Object.assign(job, { status: 'failed', message: e.message, stage: 'failed' }); }
}
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.json': 'application/json', '.glb': 'model/gltf-binary' };
async function serveFile(req, res, file) {
    const stat = await fs.stat(file);
    const type = mime[path.extname(file)] || 'application/octet-stream';
    const range = req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
    if (range) {
        const start = Number(range[1]), end = Math.min(range[2] ? Number(range[2]) : stat.size - 1, stat.size - 1);
        if (start > end) { res.writeHead(416); res.end(); return; }
        const handle = await fs.open(file); const buffer = Buffer.alloc(end - start + 1);
        try { await handle.read(buffer, 0, buffer.length, start); } finally { await handle.close(); }
        res.writeHead(206, { 'Content-Type': type, 'Content-Range': `bytes ${start}-${end}/${stat.size}`, 'Accept-Ranges': 'bytes', 'Content-Length': buffer.length }); res.end(buffer);
    } else { res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache' }); res.end(await fs.readFile(file)); }
}
const server = http.createServer(async (req, res) => {
    try {
        const url = new URL(req.url, 'http://localhost');
        // This application owns local model credentials. Keep write APIs same-origin.
        if (req.method === 'POST' && req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return send(res, 403, { error: 'Use this app from its own origin.' });
        if (url.pathname === '/api/search') {
            const title = url.searchParams.get('title') || '', artist = url.searchParams.get('artist') || '';
            if (!title.trim()) return send(res, 400, { error: 'Enter a track title.' });
            try { return send(res, 200, await search(title, artist)); }
            catch (e) { return send(res, 200, { songs: /jungle/i.test(title) ? [demoSong] : [], source: 'Catalog unavailable', warning: 'MusicBrainz could not be reached. You can enter a song manually.', error: e.message }); }
        }
        if (url.pathname === '/api/demo') return send(res, 200, { song: demoSong, plan: normalizePlan({}, demoSong), provenance: { story: 'Handcrafted playtest story', music: 'Browser-synthesized test loop', world: 'Procedural 3D preview; Hunyuan pending' } });
        if (url.pathname === '/api/biome-assets') {
            const biome = url.searchParams.get('biome') || 'jungle-ruins';
            return send(res, 200, { world: await readBiomeBank(assetDir, biome, { requireComplete: false }) });
        }
        if (url.pathname === '/api/health') return send(res, 200, await serviceHealth());
        if (url.pathname === '/api/settings' && req.method === 'GET') return send(res, 200, config());
        if (url.pathname === '/api/settings' && req.method === 'POST') {
            const input = await body(req);
            for (const key of ['nemotronURL', 'acestepURL', 'hunyuanURL']) if (input[key]) { const u = new URL(input[key]); if (!['http:', 'https:'].includes(u.protocol)) throw new Error('Model URLs must use HTTP or HTTPS.'); }
            settings = { ...settings, ...Object.fromEntries(['nemotronURL', 'nemotronModel', 'acestepURL', 'hunyuanURL'].map(key => [key, String(input[key] || '').replace(/\/$/, '')])) };
            await fs.writeFile(path.join(dataDir, 'settings.json'), JSON.stringify(settings, null, 2)); return send(res, 200, { saved: true });
        }
        if (url.pathname === '/api/generate' && req.method === 'POST') {
            const input = await body(req), id = randomUUID();
            const job = { id, status: 'working', stage: 'queued', message: 'Queued for the VM', progress: 0 };
            jobs.set(id, job); generationQueue = generationQueue.catch(() => { }).then(() => generate(job, input));
            return send(res, 202, { id });
        }
        if (url.pathname.startsWith('/api/jobs/')) {
            const job = jobs.get(url.pathname.split('/').pop()); return send(res, job ? 200 : 404, job || { error: 'Job not found.' });
        }
        if (url.pathname === '/api/history') {
            const names = (await fs.readdir(dataDir)).filter(n => /^[0-9a-f-]{36}\.json$/.test(n));
            const results = await Promise.all(names.map(async n => JSON.parse(await fs.readFile(path.join(dataDir, n), 'utf8'))));
            return send(res, 200, results.sort((a, b) => b.createdAt.localeCompare(a.createdAt)));
        }
        if (url.pathname.startsWith('/api/cover/')) {
            const id = url.pathname.split('/').pop();
            if (!/^[0-9a-f-]{36}$/.test(id)) return send(res, 400, { error: 'Invalid release ID.' });
            const file = path.join(dataDir, 'covers', `${id}.jpg`);
            try { return await serveFile(req, res, file); } catch { }
            const image = await fetch(`https://coverartarchive.org/release/${id}/front-250`, { signal: AbortSignal.timeout(12000) });
            if (!image.ok) return send(res, 404, { error: 'This release has no available cover.' });
            await fs.writeFile(file, Buffer.from(await image.arrayBuffer())); return serveFile(req, res, file);
        }
        const decoded = decodeURIComponent(url.pathname);
        const base = decoded.startsWith('/generated-assets/') ? assetDir : decoded.startsWith('/audio/') ? path.join(dataDir, 'audio') : decoded.startsWith('/vendor/') ? path.join(root, 'node_modules', 'three') : decoded.startsWith('/lib/') ? path.join(root, 'lib') : path.join(root, 'public');
        const relative = decoded === '/' ? 'index.html' : decoded.replace(/^\/(generated-assets|audio|vendor|lib)\//, '').replace(/^\//, '');
        const target = path.resolve(base, relative);
        if (!target.startsWith(base + path.sep)) return send(res, 403, { error: 'Invalid path.' });
        await serveFile(req, res, target);
    } catch (e) { send(res, e.code === 'ENOENT' ? 404 : 500, { error: e.code === 'ENOENT' ? 'Not found' : e.message }); }
});
const port = Number(process.env.PORT || 4310);
server.listen(port, '127.0.0.1', () => console.log(`Songworld ready at http://127.0.0.1:${port}`));
