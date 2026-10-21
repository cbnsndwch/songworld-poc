import fs from 'node:fs/promises';
import path from 'node:path';
const base = path.resolve('public/assets'); await fs.mkdir(base, { recursive: true });
async function download(url, file) {
  try { await fs.access(file); return; } catch {}
  const response = await fetch(url); if (!response.ok) throw new Error(`${response.status}: ${url}`);
  await fs.mkdir(path.dirname(file), { recursive: true }); await fs.writeFile(file, Buffer.from(await response.arrayBuffer()));
}
for (const name of ['coastal_cliff_01', 'island_tree_03']) {
  const manifest = await (await fetch(`https://api.polyhaven.com/files/${name}`)).json();
  const model = manifest.gltf['1k'].gltf;
  const files = [[`${name}.gltf`, model], ...Object.entries(model.include)];
  await Promise.all(files.map(([relative, file]) => download(file.url, path.join(base, name, relative))));
  console.log(`${name}: downloaded ${files.length} files`);
}
await download('https://threejs.org/examples/models/gltf/RobotExpressive/RobotExpressive.glb', path.join(base, 'explorer.glb'));
const texture = await (await fetch('https://api.polyhaven.com/files/rocky_terrain_02')).json();
await Promise.all([['diff', texture.diffuse || texture.Diffuse], ['normal', texture.nor_gl]].filter(([, value]) => value).map(([name, value]) => download(value['1k'].jpg.url, path.join(base, `terrain-${name}.jpg`))));
console.log('Explorer and terrain textures ready');
