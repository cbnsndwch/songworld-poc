import { Box3, Ray, Vector3 } from 'three';
import { Octree } from 'three/addons/math/Octree.js';
import { Capsule } from 'three/addons/math/Capsule.js';
import { MOVEMENT } from './adventure.mjs';

// Pad both ends: the upstream min-only padding can exclude max-bound triangles
// after floating point subdivision (for example a box roof exactly at y=2).
class MeshOctree extends Octree {
  calcBox() { this.box = this.bounds.clone().expandByScalar(.01); return this; }
}

// Build once for each normalized asset. Instances reuse the tree with a translation.
export function createMeshCollider(object) {
  object.updateWorldMatrix(true, true);
  const bounds = new Box3().setFromObject(object);
  if (bounds.isEmpty()) throw new Error('Generated model has no collision geometry.');
  return { tree: new MeshOctree().fromGraphNode(object), bounds };
}

const capsule = new Capsule(new Vector3(), new Vector3(), MOVEMENT.radius);
const capsuleBounds = new Box3(), normal = new Vector3();
export function resolveMeshCollisions(state, instances) {
  const p = state.position, v = state.velocity, radius = MOVEMENT.radius;
  let contacts = 0;
  for (let pass = 0; pass < 3; pass++) {
    let changed = false;
    for (const { collider, offset } of instances) {
      capsule.start.set(p.x - offset.x, p.y + radius - offset.y, p.z - offset.z);
      capsule.end.set(p.x - offset.x, p.y + 1.75 - radius - offset.y, p.z - offset.z);
      capsuleBounds.setFromPoints([capsule.start, capsule.end]).expandByScalar(radius);
      if (!capsuleBounds.intersectsBox(collider.bounds)) continue;
      const hit = collider.tree.capsuleIntersect(capsule);
      if (!hit || hit.depth < 1e-7) continue;
      contacts++; changed = true;
      p.x += hit.normal.x * (hit.depth + 1e-5);
      p.y += hit.normal.y * (hit.depth + 1e-5);
      p.z += hit.normal.z * (hit.depth + 1e-5);
      const inward = hit.normal.x * v.x + hit.normal.y * v.y + hit.normal.z * v.z;
      if (hit.normal.y > .55 && v.y <= 0) state.grounded = true;
      if (inward < 0) { v.x -= hit.normal.x * inward; v.y -= hit.normal.y * inward; v.z -= hit.normal.z * inward; }
    }
    if (!changed) break;
  }
  return contacts;
}

const ray = new Ray(new Vector3(), new Vector3(0, -1, 0));
export function meshSurfaceAt(instances, x, z, ceiling = 10000) {
  let floor = null;
  for (const { collider, offset } of instances) {
    const localX = x - offset.x, localZ = z - offset.z, b = collider.bounds;
    if (localX < b.min.x || localX > b.max.x || localZ < b.min.z || localZ > b.max.z) continue;
    ray.origin.set(localX, ceiling - offset.y, localZ);
    const hit = collider.tree.rayIntersect(ray);
    if (!hit || hit.triangle.getNormal(normal).y < .55) continue;
    const y = hit.position.y + offset.y;
    if (!floor || y > floor.y) floor = { x, z, y, shape: 'mesh' };
  }
  return floor;
}
