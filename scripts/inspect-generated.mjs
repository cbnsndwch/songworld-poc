import fs from 'node:fs/promises';
import path from 'node:path';
import { NodeIO } from '@gltf-transform/core';
import * as THREE from 'three';
import { createMeshCollider, meshSurfaceAt } from '../lib/mesh-collision.mjs';

const manifest = JSON.parse(await fs.readFile(process.argv[2] || 'data/generated-assets/jungle-ruins-hunyuan21-pbr-v1.json', 'utf8'));
const reports = [];
for (const tile of manifest.tiles) {
  const filename = path.join('data/generated-assets', path.basename(tile.glbUrl));
  const document = await new NodeIO().read(filename), root = new THREE.Group();
  let triangles = 0;
  for (const node of document.getRoot().listNodes()) {
    if (!node.getMesh()) continue;
    for (const primitive of node.getMesh().listPrimitives()) {
      if (primitive.getMode() !== 4) throw new Error('Expected triangle mesh');
      const geometry = new THREE.BufferGeometry();
      const position = primitive.getAttribute('POSITION');
      geometry.setAttribute('position', new THREE.BufferAttribute(position.getArray(), 3));
      if (primitive.getIndices()) geometry.setIndex(new THREE.BufferAttribute(primitive.getIndices().getArray(), 1));
      triangles += (primitive.getIndices()?.getCount() ?? position.getCount()) / 3;
      const mesh = new THREE.Mesh(geometry); mesh.matrix.fromArray(node.getWorldMatrix()); mesh.matrixAutoUpdate = false; root.add(mesh);
    }
  }
  const bounds = new THREE.Box3().setFromObject(root), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3());
  const scale = 4.5 / Math.max(size.x, size.z); root.scale.setScalar(scale); root.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  const started = performance.now(), collider = createMeshCollider(root);
  let upwardSurfaceSamples = 0;
  const instances = [{ collider, offset: new THREE.Vector3() }];
  for (let x = -2.25; x <= 2.25; x += .25) for (let z = -2.25; z <= 2.25; z += .25) {
    if (meshSurfaceAt(instances, x, z)) upwardSurfaceSamples++;
  }
  if (!triangles || !upwardSurfaceSamples) throw new Error('Generated mesh has no upward collision surfaces.');
  reports.push({ variant: tile.variant, sha256: tile.sha256, triangles, embeddedTextures: document.getRoot().listTextures().length, normalizedBounds: { min: collider.bounds.min.toArray(), max: collider.bounds.max.toArray() }, upwardSurfaceSamples, collisionBuildAndSampleMs: Math.round(performance.now() - started), completeLevelTraversabilityVerified: false });
}
await fs.writeFile('artifacts/generated-mesh-inspection.json', JSON.stringify(reports, null, 2));
console.log(JSON.stringify(reports, null, 2));
