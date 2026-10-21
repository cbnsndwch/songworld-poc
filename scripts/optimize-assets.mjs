import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, prune, dedup } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
await MeshoptSimplifier.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const [name, ratio] of [['island_tree_03', .025], ['coastal_cliff_01', .12]]) {
  const doc = await io.read(`public/assets/${name}/${name}.gltf`);
  await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio, error: .002 }), prune(), dedup());
  await io.write(`public/assets/${name}.glb`, doc);
  console.log(`${name} optimized for real-time rendering`);
}
