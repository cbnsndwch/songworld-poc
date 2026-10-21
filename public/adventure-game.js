import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { Soundtrack } from './audio.js';
import { random, hash } from '/lib/world.mjs';
import { collapseWorld, TILE_SIZE } from '/lib/wfc.mjs';
import { chooseBiome } from '/lib/biomes.mjs';
import { terrainProfile, tileElevation } from '/lib/terrain-profiles.mjs';
import { MOVEMENT } from '/lib/adventure.mjs';
import { surfaceAt, stepCharacter } from '/lib/platform-physics.mjs';
import { createMeshCollider, resolveMeshCollisions, meshSurfaceAt } from '/lib/mesh-collision.mjs';
import { normalizeControls } from '/lib/gameplay-settings.mjs';
import { smoothOrbit } from '/lib/camera-motion.mjs';

export class Runner {
  constructor(canvas, events = {}) {
    this.tuning = normalizeControls(); this.cameraDirection = new THREE.Vector3(); this.events = events; this.canvas = canvas; this.mode = 'home'; this.sound = new Soundtrack(); this.input = new Set(); this.velocity = new THREE.Vector3(); this.lastFrame = 0; this.score = 0; this.deaths = 0; this.distance = 0; this.cameraYaw = 0; this.cameraPitch = .38; this.cameraDistance = 9; this.jumpBuffer = 0; this.coyote = 0; this.grounded = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' }); this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2('#a6c1bd', .008);
    this.camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, .1, 600);
    this.orbitTarget = { yaw: 0, pitch: .38, distance: this.tuning.cameraDistance };
    this.cameraFocus = new THREE.Vector3(0, 1.2, 1.5); this.lookMatrix = new THREE.Matrix4(); this.lookQuaternion = new THREE.Quaternion();
    this.scene.add(new THREE.HemisphereLight('#d5edff', '#788e62', 2.1));
    this.sun = new THREE.DirectionalLight('#fff0d3', 3.5); this.sun.position.set(-25, 70, 25); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.camera.left = -75; this.sun.shadow.camera.right = 75; this.sun.shadow.camera.top = 75; this.sun.shadow.camera.bottom = -75; this.sun.shadow.camera.far = 180; this.sun.shadow.normalBias = .035; this.scene.add(this.sun, this.sun.target);
    this.scene.add(new THREE.AmbientLight('#b4c8ba', .3));
    this.composer = new EffectComposer(this.renderer); this.composer.addPass(new RenderPass(this.scene, this.camera));
    this.bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), .28, .5, 1.2); this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.makeSky(); this.makePlayer(); this.assets = {}; this.assetPromise = this.loadAssets(); this.controls(); this.resize();
    window.addEventListener('resize', () => this.resize()); this.frame = this.frame.bind(this); requestAnimationFrame(this.frame);
  }
  setControls(value) { this.tuning = normalizeControls(value); this.orbitTarget.distance = this.tuning.cameraDistance; this.input.clear(); this.dragging = null; }
  makeSky() {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(400, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { top: { value: new THREE.Color('#5e9db9') }, horizon: { value: new THREE.Color('#d7e7cc') } }, vertexShader: 'varying vec3 v;void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}', fragmentShader: 'varying vec3 v;uniform vec3 top;uniform vec3 horizon;void main(){vec3 d=normalize(v);vec3 c=mix(horizon,top,smoothstep(-.05,.7,d.y));float s=max(0.,dot(d,normalize(vec3(-.4,.6,.3))));c+=vec3(.7,.5,.2)*pow(s,120.);gl_FragColor=vec4(c,1.);}' })); this.scene.add(this.sky);
    const cloudMat = new THREE.MeshStandardMaterial({ color: '#fff9e5', roughness: 1, transparent: true, opacity: .8, flatShading: false });
    this.clouds = new THREE.Group(); const rng = random(554);
    for (let i = 0; i < 38; i++) { const cloud = new THREE.Mesh(new THREE.SphereGeometry(1, 10, 7), cloudMat); cloud.position.set((rng() - .5) * 400, 45 + rng() * 28, (rng() - .5) * 400); cloud.scale.set(10 + rng() * 20, 2 + rng() * 3, 5 + rng() * 10); this.clouds.add(cloud); } this.scene.add(this.clouds);
  }
  makePlayer() {
    this.player = new THREE.Group(); this.scene.add(this.player); this.avatarRoot = new THREE.Group(); this.player.add(this.avatarRoot);
    const placeholder = new THREE.Mesh(new THREE.CapsuleGeometry(.28, .65, 5, 12), new THREE.MeshStandardMaterial({ color: '#fff1c2', roughness: .4 })); placeholder.position.y = .9; this.avatarRoot.add(placeholder);
    this.shadow = new THREE.Mesh(new THREE.CircleGeometry(.42, 24), new THREE.MeshBasicMaterial({ color: '#142a20', transparent: true, opacity: .18, depthWrite: false })); this.shadow.rotation.x = -Math.PI / 2; this.scene.add(this.shadow);
  }
  async loadAssets() {
    const loader = new GLTFLoader();
    await Promise.allSettled([
      loader.loadAsync('/assets/explorer.glb').then(gltf => {
        this.avatarRoot.clear(); this.avatar = gltf.scene; const bounds = new THREE.Box3().setFromObject(this.avatar), height = bounds.max.y - bounds.min.y;
        this.avatar.scale.setScalar(1.75 / height); this.avatar.position.y = -bounds.min.y * 1.75 / height;
        this.avatar.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } }); this.avatarRoot.add(this.avatar);
        this.mixer = new THREE.AnimationMixer(this.avatar); this.actions = Object.fromEntries(gltf.animations.map(clip => [clip.name.toLowerCase(), this.mixer.clipAction(clip)])); this.animate('idle');
      }),
      loader.loadAsync('/assets/island_tree_03.glb').then(gltf => { this.assets.tree = gltf.scene; }),
      loader.loadAsync('/assets/coastal_cliff_01.glb').then(gltf => { this.assets.cliff = gltf.scene; })
    ]);
    if (this.world) this.populateAssets();
  }
  animate(name) {
    if (!this.actions) return;
    const action = this.actions[name] || this.actions[name === 'run' ? 'running' : name === 'walk' ? 'walking' : name === 'jump' ? 'jump' : 'idle'];
    if (!action || action === this.action) return;
    this.action?.fadeOut(.17); action.reset().fadeIn(.17).play(); this.action = action;
  }
  controls() {
    window.addEventListener('keydown', e => { if (['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return; this.input.add(e.code); });
    window.addEventListener('keyup', e => this.input.delete(e.code)); window.addEventListener('blur', () => this.input.clear());
    this.canvas.addEventListener('pointerdown', e => { if (this.mode !== 'playing') return; this.dragging = { x: e.clientX, y: e.clientY }; this.canvas.setPointerCapture(e.pointerId); });
    this.canvas.addEventListener('pointermove', e => { if (!this.dragging) return; this.orbitTarget.yaw -= (e.clientX - this.dragging.x) * .0024 * this.tuning.sensitivity; this.orbitTarget.pitch = THREE.MathUtils.clamp(this.orbitTarget.pitch + (e.clientY - this.dragging.y) * .0018 * this.tuning.sensitivity * (this.tuning.invertY ? -1 : 1), .18, .8); this.dragging = { x: e.clientX, y: e.clientY }; });
    this.canvas.addEventListener('pointerup', () => this.dragging = null);
    this.canvas.addEventListener('pointercancel', () => this.dragging = null);
    this.canvas.addEventListener('wheel', e => { if (this.mode !== 'playing') return; e.preventDefault(); this.orbitTarget.distance = THREE.MathUtils.clamp(this.orbitTarget.distance + e.deltaY * .004, 6, 14); }, { passive: false });
  }
  disposeWorld() {
    if (!this.world) return; this.scene.remove(this.world);
    // Shared downloaded asset resources are retained across worlds.
    const geometries = new Set(), materials = new Set(), textures = new Set();
    this.world.traverse(o => {
      if (!o.userData.owned) return;
      if (o.geometry) geometries.add(o.geometry);
      for (const material of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) materials.add(material);
    });
    for (const material of materials) { for (const value of Object.values(material)) if (value?.isTexture) textures.add(value); material.dispose(); }
    geometries.forEach(geometry => geometry.dispose()); textures.forEach(texture => texture.dispose());
    this.meshColliders?.splice(0);
  }
  build(plan, seed) {
    this.plan = plan; this.seed = seed;
    const baseBiome = chooseBiome({ ...this.result?.song, genre: plan.genre }, plan.biome || this.selectedBiome);
    const paletteAccent = new THREE.Color(plan.palette?.[0] || baseBiome.accent);
    this.biome = { ...baseBiome, accent: new THREE.Color(baseBiome.accent).lerp(paletteAccent, .65).getStyle(), sky: new THREE.Color(baseBiome.sky).lerp(paletteAccent, .12).getStyle() };
    this.terrain = terrainProfile(this.biome.id); this.map = collapseWorld(seed, this.biome); this.map.tiles.forEach(tile => tile.baseHeight = tileElevation(this.terrain, tile)); this.disposeWorld();
    this.world = new THREE.Group(); this.scene.add(this.world); this.colliders = []; this.meshColliders = []; this.sparks = []; this.stars = []; this.tileRoots = new Map(); this.generatedTiles = new Map(); this.assetPopulated = false;
    const rng = random(hash(seed)), biome = this.biome;
    this.sky.material.uniforms.horizon.value.set(biome.sky); this.scene.fog.color.set(biome.sky).lerp(new THREE.Color('#95c8c4'), .5);
    const grass = new THREE.MeshStandardMaterial({ color: biome.ground, roughness: .95 });
    const rock = new THREE.MeshStandardMaterial({ color: biome.rock, roughness: .85, flatShading: false });
    const terrainTexture = new THREE.TextureLoader().load('/assets/terrain-diff.jpg'); terrainTexture.wrapS = terrainTexture.wrapT = THREE.RepeatWrapping; terrainTexture.repeat.set(2, 2); terrainTexture.colorSpace = THREE.SRGBColorSpace; terrainTexture.anisotropy = Math.min(8, this.renderer.capabilities.getMaxAnisotropy());
    const normalTexture = new THREE.TextureLoader().load('/assets/terrain-normal.jpg'); normalTexture.wrapS = normalTexture.wrapT = THREE.RepeatWrapping; normalTexture.repeat.set(2, 2);
    grass.map = terrainTexture; grass.normalMap = normalTexture; grass.normalScale = new THREE.Vector2(.35, .35); rock.map = terrainTexture; rock.normalMap = normalTexture;
    const path = new THREE.MeshStandardMaterial({ color: '#c0ad86', roughness: .95, map: terrainTexture, normalMap: normalTexture, normalScale: new THREE.Vector2(.2, .2) });
    const trim = new THREE.MeshStandardMaterial({ color: '#b9bbaa', roughness: .85, map: terrainTexture, normalMap: normalTexture, normalScale: new THREE.Vector2(.25, .25) });
    this.glow = new THREE.MeshStandardMaterial({ color: biome.accent, emissive: biome.accent, emissiveIntensity: 1.25, roughness: .35, metalness: .25 });
    const add = (geometry, material, x, y, z, parent = this.world) => { const mesh = new THREE.Mesh(geometry, material); mesh.position.set(x, y, z); mesh.castShadow = true; mesh.receiveShadow = true; mesh.userData.owned = true; parent.add(mesh); return mesh; };
    const platform = (x, z, y, w, d, shape = 'box', parent = this.world, material = grass) => {
      const geometry = shape === 'round' ? new THREE.CylinderGeometry(w / 2, w * .48, 1, 32) : new THREE.BoxGeometry(w, 1, d, 2, 1, 2);
      const mesh = add(geometry, material, x, y - .5, z, parent);
      this.colliders.push({ x, z, y: y + parent.position.y, bottom: y === 0 && this.terrain.continuous ? -1.5 : y + parent.position.y - 1, w, d, shape, mesh }); return mesh;
    };
    this.buildTerrainFoundation(add, platform, grass, rock, path, trim, rng);
    this.map.tiles.forEach(tile => {
      const root = new THREE.Group(); this.world.add(root); this.tileRoots.set(tile.index, root); tile.root = root; root.position.y = tile.baseHeight;
      const radius = this.terrain.continuous ? 5.8 : this.terrain.kind === 'archipelago' ? 5.25 : 4.6 + rng() * .35;
      if (tile.mask === 0) return;
      // Sculpted islands, paths, terraces and arches form a compact explorable world.
      const hill = ['forest', 'meadow', 'dunes', 'archipelago', 'sky'].includes(this.terrain.kind) && ['garden', 'grove'].includes(tile.variant) && tile.index !== this.map.spawn.index ? 1.1 : 0;
      if (hill) {
        const vertices = [], uvs = [], indices = [], segments = 48, rings = 10;
        for (let ring = 0; ring <= rings; ring++) for (let side = 0; side <= segments; side++) { const fraction = ring / rings, angle = side / segments * Math.PI * 2, x = Math.cos(angle) * radius * fraction, z = Math.sin(angle) * radius * fraction; vertices.push(x, hill * (1 - fraction * fraction) ** 2, z); uvs.push(x / 8 + .5, z / 8 + .5); }
        for (let ring = 0; ring < rings; ring++) for (let side = 0; side < segments; side++) { const a = ring * (segments + 1) + side, b = a + segments + 1; indices.push(a, a + 1, b, b, a + 1, b + 1); }
        const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3)); geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2)); geometry.setIndex(indices); geometry.computeVertexNormals(); const mesh = add(geometry, grass, tile.x, 0, tile.z, root);
        this.colliders.push({ x: tile.x, z: tile.z, y: tile.baseHeight, w: radius * 2, d: radius * 2, shape: 'round', hill, mesh });
      } else platform(tile.x, tile.z, 0, radius * 2, radius * 2, ['city', 'courtyard', 'canyon', 'mountain', 'basin'].includes(this.terrain.kind) ? 'box' : 'round', root);
      const cliffHeight = this.terrain.kind === 'sky' ? 10 + rng() * 7 : this.terrain.kind === 'archipelago' ? 3 : 1 + tile.baseHeight;
      const cliff = new THREE.CylinderGeometry(radius * .98, radius * .55, cliffHeight, 24, 5);
      const pos = cliff.attributes.position;
      for (let i = 0; i < pos.count; i++) { const y = pos.getY(i), angle = Math.atan2(pos.getZ(i), pos.getX(i)); const noise = 1 + Math.sin(angle * 7 + y * .7) * .055 + Math.cos(angle * 11 - y) * .035; pos.setX(i, pos.getX(i) * noise); pos.setZ(i, pos.getZ(i) * noise); } cliff.computeVertexNormals();
      add(cliff, rock, tile.x, -cliffHeight / 2 - .5, tile.z, root);
      for (let side = 0; side < 4; side++) if ((tile.mask >> side) & 1) {
        const dx = [0, 1, 0, -1][side], dz = [-1, 0, 1, 0][side];
        const bridge = platform(tile.x + dx * 4.4, tile.z + dz * 4.4, .025, dx ? 3.2 : 2.8, dz ? 3.2 : 2.8, 'box', root, path); bridge.userData.connection = true;
        // Small stone edge markers signal the traversable connections.
        for (const sign of [-1, 1]) add(new THREE.CylinderGeometry(.16, .2, .7, 8), trim, tile.x + dx * 5.7 + dz * sign * 1.1, .35, tile.z + dz * 5.7 + dx * sign * 1.1, root);
      }
      if (tile.index === this.map.spawn.index) {
        const ring = add(new THREE.TorusGeometry(2.4, .1, 8, 48), this.glow, 0, .12, 0, root); ring.rotation.x = -Math.PI / 2;
      } else if (['terraces', 'tower', 'sanctuary'].includes(tile.variant)) {
        const levels = tile.variant === 'tower' ? 4 : 2;
        for (let step = 0; step < levels; step++) {
          const angle = step * 1.6, x = tile.x + Math.cos(angle) * (2.8 - step * .4), z = tile.z + Math.sin(angle) * (2.8 - step * .4), y = (step + 1) * 1.4;
          platform(x, z, y, 2.8, 2.8, 'round', root, trim);
          add(new THREE.CylinderGeometry(.7, 1.05, y, 12), rock, x, y / 2 - .5, z, root);
          this.addSpark(x, y + 1, z, false, root);
        }
      } else if (tile.variant === 'arch' || tile.variant === 'ruins') {
        for (const sign of [-1, 1]) { const pillar = add(new THREE.CylinderGeometry(.48, .65, 4.2, 12), trim, tile.x + sign * 2.8, 2.1, tile.z - 1, root); pillar.rotation.z = sign * .04; }
        const arch = add(new THREE.TorusGeometry(2.8, .55, 8, 24, Math.PI), trim, tile.x, 4.1, tile.z - 1, root); arch.rotation.z = 0;
        platform(tile.x, tile.z - 1, 6.95, 2.4, 1.7, 'box', root, trim);
        for (let step = 1; step <= 4; step++) platform(tile.x - 3 + step * 1.1, tile.z + 2.4, step * 1.4, 1.7, 1.7, 'round', root, trim);
      } else if (tile.variant === 'pond') {
        add(new THREE.CylinderGeometry(1.8, 1.8, .08, 32), new THREE.MeshStandardMaterial({ color: '#77c9c0', roughness: .15, metalness: .3 }), tile.x, .035, tile.z, root);
      }
      if (this.map.reachable.some(t => t.index === tile.index)) this.addSpark(tile.x + 1.7, .9 + hill * .65, tile.z + 1.7, false, root);
      for (let i = 0; i < 7; i++) {
        const angle = rng() * Math.PI * 2, radius = 2 + rng() * 2.2, x = tile.x + Math.cos(angle) * radius, z = tile.z + Math.sin(angle) * radius;
        const flower = add(new THREE.SphereGeometry(.12 + rng() * .1, 6, 5), i % 3 ? this.glow : new THREE.MeshStandardMaterial({ color: '#f5d6a2', roughness: .7 }), x, .18, z, root); flower.scale.y = .5;
      }
    });
    this.map.goals.forEach((tile, i) => {
      const height = tile.variant === 'tower' ? 6.6 : tile.variant === 'arch' || tile.variant === 'ruins' ? 7.9 : tile.variant === 'terraces' || tile.variant === 'sanctuary' ? 3.8 : 1.8;
      this.addSpark(tile.x, height, tile.z, true, tile.root, i);
      // Each relic always has a connected, reachable staircase, independent of its skin.
      const rise = plan.difficulty === 'chill' ? 1 : plan.difficulty === 'intense' ? 1.65 : 1.35;
      const stairCount = Math.ceil((height - 1) / rise), stairWidth = plan.difficulty === 'chill' ? 2.9 : plan.difficulty === 'intense' ? 2.1 : 2.6;
      for (let j = 1; j <= stairCount; j++) {
        const angle = j * 1.15, r = 3.5 - j * .35;
        platform(tile.x + Math.cos(angle) * r, tile.z + Math.sin(angle) * r, j * (height - 1) / stairCount, stairWidth, stairWidth, 'round', tile.root, trim);
      }
      if (height > 3) platform(tile.x, tile.z, height - 1, 3, 3, 'round', tile.root, trim);
    });
    this.portal = add(new THREE.TorusGeometry(1.7, .16, 12, 48), this.glow, 0, 2, 0); this.portal.visible = false;
    this.makeWater(); this.populateAssets(); this.player.position.set(0, 0, 1.5); this.camera.position.set(38, 28, 47); this.camera.lookAt(0, 2, 0); this.mode = 'home'; this.goalCount = 0; this.score = 0; this.distance = 0;
    this.level = { sparks: this.sparks, platforms: this.colliders, maxGap: 0 };
    this.events.biome?.({ ...this.biome, terrainLabel: this.terrain.label });
  }
  buildTerrainFoundation(add, platform, grass, rock, path, trim, rng) {
    const kind = this.terrain.kind, extent = this.map.size * TILE_SIZE / 2 + 7;
    if (this.terrain.continuous) {
      platform(0, 0, -.08, extent * 2, extent * 2, 'box', this.world, kind === 'city' ? path : grass);
      // One solid landmass under every district; no floating gaps between tiles.
      add(new THREE.BoxGeometry(extent * 2, 12, extent * 2), rock, 0, -6.6, 0);
    }
    if (kind === 'city') {
      for (const tile of this.map.tiles.filter(t => t.gx < this.map.size - 1 && t.gz < this.map.size - 1 && (t.gx + t.gz) % 2 === 0)) {
        const height = 8 + rng() * 15;
        const x = tile.x + 6, z = tile.z + 6;
        platform(x, z, height, 4.8, 4.8, 'box', this.world, trim);
        add(new THREE.BoxGeometry(4.8, height, 4.8), rock, x, height / 2, z);
        this.colliders.push({ x, z, y: height, bottom: 0, w: 4.8, d: 4.8, shape: 'box' });
        for (let y = 2; y < height; y += 2) add(new THREE.BoxGeometry(4.85, .13, 4.85), this.glow, x, y, z);
      }
      for (let i = -3; i <= 3; i++) {
        add(new THREE.BoxGeometry(1.6, .025, extent * 2), path, i * 12, -.045, 0);
        add(new THREE.BoxGeometry(extent * 2, .025, 1.6), path, 0, -.045, i * 12);
      }
    }
    if (kind === 'courtyard') {
      for (const side of [-1, 1]) {
        platform(side * extent, 0, 7, 2, extent * 2, 'box', this.world, trim);
        platform(0, side * extent, 7, extent * 2, 2, 'box', this.world, trim);
        add(new THREE.BoxGeometry(2, 7, extent * 2), rock, side * extent, 3, 0);
        add(new THREE.BoxGeometry(extent * 2, 7, 2), rock, 0, 3, side * extent);
        this.colliders.push({ x: side * extent, z: 0, y: 7, bottom: 0, w: 2, d: extent * 2, shape: 'box' }, { x: 0, z: side * extent, y: 7, bottom: 0, w: extent * 2, d: 2, shape: 'box' });
      }
    }
    if (kind === 'cavern') {
      const ceiling = new THREE.MeshStandardMaterial({ color: this.biome.rock, roughness: 1, side: THREE.BackSide, map: rock.map });
      const dome = add(new THREE.SphereGeometry(extent * 1.5, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), ceiling, 0, 0, 0); dome.scale.y = .3;
      for (const tile of this.map.tiles.filter(t => t.gx < this.map.size - 1 && t.gz < this.map.size - 1)) {
        const x = tile.x + 6, z = tile.z + 6, height = 2 + rng() * 5;
        const crystal = add(new THREE.ConeGeometry(.7, height, 5), this.glow, x, height / 2, z); crystal.rotation.z = .15;
        if ((tile.gx + tile.gz) % 3 === 0) { const light = new THREE.PointLight(this.biome.accent, 12, 17, 2); light.position.set(x, 3, z); this.world.add(light); }
      }
      for (let i = 0; i < 20; i++) {
        const angle = i / 20 * Math.PI * 2, radius = extent + 3;
        add(new THREE.CylinderGeometry(1.5, 3.5, 18, 7), rock, Math.cos(angle) * radius, 8, Math.sin(angle) * radius);
      }
      this.sun.intensity = .9; this.bloom.strength = .5;
    } else { this.sun.intensity = kind === 'city' ? 1.8 : 3.5; this.bloom.strength = .28; }
    if (['forest', 'meadow', 'dunes', 'mountain', 'basin', 'canyon'].includes(kind)) {
      for (let i = 0; i < 26; i++) {
        const angle = i / 26 * Math.PI * 2, radius = extent + 8 + rng() * 12;
        const height = kind === 'mountain' ? 18 + rng() * 24 : kind === 'canyon' ? 14 + rng() * 14 : kind === 'basin' ? 14 + rng() * 9 : 4 + rng() * 10;
        const geometry = kind === 'canyon' ? new THREE.CylinderGeometry(5 + rng() * 5, 9, height, 6) : new THREE.ConeGeometry(9 + rng() * 9, height, kind === 'dunes' ? 32 : 8);
        const mesh = add(geometry, kind === 'dunes' || kind === 'meadow' ? grass : rock, Math.cos(angle) * radius, height / 2 - .5, Math.sin(angle) * radius); mesh.rotation.y = rng() * Math.PI;
      }
    }
    if (kind === 'canyon') {
      for (const tile of this.map.tiles.filter(t => !t.mask)) {
        const height = 8 + rng() * 12;
        add(new THREE.BoxGeometry(10, height, 10), rock, tile.x, height / 2 - .5, tile.z);
        this.colliders.push({ x: tile.x, z: tile.z, y: height - .5, bottom: -.5, w: 10, d: 10, shape: 'box' });
      }
    }
  }
  addSpark(x, y, z, relic, parent, index) {
    const geometry = relic ? new THREE.IcosahedronGeometry(.5, 1) : new THREE.OctahedronGeometry(.2, 0);
    const mesh = new THREE.Mesh(geometry, this.glow); mesh.position.set(x, y, z); mesh.userData.owned = true; mesh.userData.gameplay = true; parent.add(mesh);
    const item = { x, y: y + parent.position.y, localY: y, z, mesh, relic, index, collected: false }; this.sparks.push(item); if (relic) this.stars.push(item);
    if (relic) { const halo = new THREE.Mesh(new THREE.TorusGeometry(.85, .025, 6, 48), this.glow); halo.position.copy(mesh.position); halo.rotation.x = Math.PI / 2; halo.userData.gameplay = true; parent.add(halo); item.halo = halo; }
    if (relic) { const beam = new THREE.Mesh(new THREE.CylinderGeometry(.08, .4, 15, 12, 1, true), new THREE.MeshBasicMaterial({ color: this.biome.accent, transparent: true, opacity: .12, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending })); beam.position.set(x, y + 7.5, z); beam.userData.gameplay = true; parent.add(beam); item.beam = beam; }
  }
  populateAssets() {
    if (!this.world || this.assetPopulated || !this.assets.tree) return; this.assetPopulated = true;
    const rng = random(hash(this.seed));
    for (const tile of this.map.tiles) if (!['city', 'cavern'].includes(this.terrain.kind) && tile.mask && ['grove', 'garden', 'pond'].includes(tile.variant)) {
      const tree = this.assets.tree.clone(true); const bounds = new THREE.Box3().setFromObject(tree), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3()), scale = (4 + rng() * 3) / Math.max(size.y, 1);
      tree.scale.setScalar(scale); tree.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      const pivot = new THREE.Group(); pivot.add(tree); pivot.position.set(tile.x - 2.5, -.1, tile.z - 2.3); pivot.rotation.y = rng() * Math.PI * 2;
      tree.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); tile.root.add(pivot);
    }
    if (this.assets.cliff && ['archipelago', 'sky'].includes(this.terrain.kind)) for (let i = 0; i < 8; i++) {
      const cliff = this.assets.cliff.clone(true), bounds = new THREE.Box3().setFromObject(cliff), size = bounds.getSize(new THREE.Vector3()), center = bounds.getCenter(new THREE.Vector3()), scale = 30 / Math.max(size.x, size.z);
      cliff.scale.setScalar(scale); cliff.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
      const pivot = new THREE.Group(); pivot.add(cliff); pivot.position.set(Math.cos(i * Math.PI / 4) * 70, -14, Math.sin(i * Math.PI / 4) * 70); pivot.rotation.y = -i * Math.PI / 4; this.world.add(pivot);
    }
  }
  makeWater() {
    this.water = new THREE.Mesh(new THREE.PlaneGeometry(600, 600, 80, 80), new THREE.ShaderMaterial({ transparent: true, uniforms: { time: { value: 0 }, tint: { value: new THREE.Color('#468f9d') } }, vertexShader: 'uniform float time;varying vec3 v;void main(){vec3 p=position;p.z+=sin(p.x*.12+time)*.22+cos(p.y*.09+time*.7)*.28;v=p;gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);}', fragmentShader: 'uniform float time;uniform vec3 tint;varying vec3 v;void main(){float r=sin(v.x*.28+v.y*.24+time)*sin(v.x*.13-v.y*.31-time*.5);vec3 c=tint+vec3(.18,.25,.22)*pow(max(r,0.),9.);gl_FragColor=vec4(c,.92);}' })); this.water.rotation.x = -Math.PI / 2; this.water.position.y = this.terrain.waterY; this.water.material.uniforms.tint.value.set(this.terrain.water); this.water.visible = !['sky', 'cavern', 'city', 'courtyard'].includes(this.terrain.kind); this.water.userData.owned = true; this.world.add(this.water);
  }
  async loadGeneratedWorld(world) {
    if (!world) return;
    const loader = new GLTFLoader();
    if (world.tiles?.length) {
      for (const asset of world.tiles) {
        const gltf = await loader.loadAsync(asset.glbUrl);
        gltf.scene.traverse(o => { if (o.isMesh) o.userData.owned = true; });
        this.generatedTiles.set(asset.variant, gltf.scene);
        const template = new THREE.Group(); template.add(gltf.scene.clone(true));
        const templateBounds = new THREE.Box3().setFromObject(template), templateSize = templateBounds.getSize(new THREE.Vector3()), center = templateBounds.getCenter(new THREE.Vector3());
        const scale = 4.5 / Math.max(templateSize.x, templateSize.z);
        template.scale.setScalar(scale); template.position.set(-center.x * scale, -templateBounds.min.y * scale, -center.z * scale);
        const collider = createMeshCollider(template);
        for (const tile of this.map.tiles.filter(t => t.variant === asset.variant)) {
          const mesh = template.clone(true);
          // Until its collision layout is validated, present the real generated asset
          // as a landmark alongside visible playable platforms. Never hide stairs
          // while retaining their invisible colliders.
          const offset = new THREE.Vector3(tile.x - 2.3, tile.baseHeight, tile.z - 2.3);
          mesh.position.add(offset); this.meshColliders.push({ collider, offset });
          mesh.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
          this.world.add(mesh);
        }
      }
    } else if (world.glbUrl) {
      const gltf = await loader.loadAsync(world.glbUrl); gltf.scene.traverse(o => { if (o.isMesh) o.userData.owned = true; }); const size = new THREE.Box3().setFromObject(gltf.scene).getSize(new THREE.Vector3()); gltf.scene.scale.setScalar(90 / Math.max(size.x, size.z)); gltf.scene.position.y = -3;
      this.meshColliders.push({ collider: createMeshCollider(gltf.scene), offset: new THREE.Vector3() }); this.world.add(gltf.scene);
    }
  }
  resetAssets() { this.sky.visible = true; }
  async start(result) {
    const previousCamera = this.camera.position.clone();
    this.result = result; this.sound.stop(); this.build(result.plan, result.id || `${result.song.title}:${result.song.artist}`); this.camera.position.copy(previousCamera); this.mode = 'loading'; await this.assetPromise;
    if (result.world) { try { await this.loadGeneratedWorld(result.world); } catch (e) { this.events.toast?.(`Generated assets could not load: ${e.message}`); } }
    await this.sound.load(result.audioUrl, this.plan.bpm); if (this.sound.audio) this.sound.audio.loop = true;
    this.score = 0; this.deaths = 0; this.goalCount = 0; this.input.clear(); this.velocity.set(0, 0, 0); this.player.position.set(0, this.floorAt(0, 1.5)?.y ?? 0, 1.5); this.checkpoint = this.player.position.clone(); this.grounded = true; this.coyote = .12; this.cameraYaw = 0; this.cameraPitch = .38; this.orbitTarget = { yaw: 0, pitch: .38, distance: this.tuning.cameraDistance }; this.mode = 'playing'; this.lastSection = ''; this.runTime = 0;
    await this.sound.play(); this.events.toast?.(this.plan.intro || 'WASD to explore · SPACE to jump · drag to look around'); this.showChapter();
  }
  showChapter() {
    const section = this.plan.sections[Math.min(this.goalCount, this.plan.sections.length - 1)];
    this.events.chapter?.({ name: section?.name || this.biome.name, objective: this.goalCount === 3 ? 'Return your three resonance relics to the glowing central shrine.' : `${section?.objective || 'Explore the islands and climb the terraces.'} · ${this.goalCount}/3 resonance relics found` });
  }
  steer(direction) { this.input.add(direction < 0 ? 'KeyA' : 'KeyD'); setTimeout(() => this.input.delete(direction < 0 ? 'KeyA' : 'KeyD'), 180); }
  jump() { if (this.mode === 'playing') this.jumpBuffer = .16; }
  async pause() { if (this.mode !== 'playing') return; this.mode = 'paused'; this.input.clear(); await this.sound.pause(); }
  async resume() { await this.sound.resume(); this.mode = 'playing'; this.lastFrame = performance.now(); }
  home() { this.mode = 'home'; this.sound.stop(); this.input.clear(); this.player.position.set(0, 0, 1.5); }
  async restart() { return this.start(this.result); }
  floorAt(x, z, ceiling = Infinity) {
    const base = surfaceAt(this.colliders, x, z, ceiling), mesh = meshSurfaceAt(this.meshColliders, x, z, Number.isFinite(ceiling) ? ceiling : 10000);
    return mesh && (!base || mesh.y > base.y) ? mesh : base;
  }
  respawn() { this.deaths++; this.player.position.copy(this.checkpoint); this.velocity.set(0, 0, 0); this.grounded = true; this.sound.fall(); this.events.toast?.('Back at your last relic. Keep exploring.'); }
  update(dt, now) {
    this.runTime += dt;
    if (this.input.has('KeyQ')) this.orbitTarget.yaw += dt * this.tuning.orbitSpeed; if (this.input.has('KeyE')) this.orbitTarget.yaw -= dt * this.tuning.orbitSpeed;
    const orbit = smoothOrbit({ yaw: this.cameraYaw, pitch: this.cameraPitch, distance: this.cameraDistance }, this.orbitTarget, dt, this.tuning.cameraResponse);
    this.cameraYaw = orbit.yaw; this.cameraPitch = orbit.pitch; this.cameraDistance = orbit.distance;
    const horizontal = Number(this.input.has('KeyD') || this.input.has('ArrowRight')) - Number(this.input.has('KeyA') || this.input.has('ArrowLeft'));
    const forward = Number(this.input.has('KeyW') || this.input.has('ArrowUp')) - Number(this.input.has('KeyS') || this.input.has('ArrowDown'));
    const state = { position: this.player.position, velocity: this.velocity, grounded: this.grounded, jumpBuffer: this.jumpBuffer, coyote: this.coyote };
    const control = { horizontal, forward, yaw: Math.atan2(-this.camera.getWorldDirection(this.cameraDirection).x, -this.cameraDirection.z), tuning: this.tuning, sprint: this.input.has('ShiftLeft') || this.input.has('ShiftRight') };
    const steps = this.meshColliders.length ? Math.max(1, Math.ceil(dt * 120)) : 1;
    let jumped = false;
    for (let step = 0; step < steps; step++) { const moved = stepCharacter(state, control, this.colliders, dt / steps); jumped = jumped || moved.jumped; resolveMeshCollisions(state, this.meshColliders); }
    this.grounded = state.grounded; this.jumpBuffer = state.jumpBuffer; this.coyote = state.coyote; if (jumped) this.sound.jump();
    if (this.player.position.y < -19) this.respawn();
    const moving = Math.hypot(this.velocity.x, this.velocity.z);
    if (horizontal || forward || moving > .2) {
      const localAngle = Math.atan2(horizontal, -forward);
      const targetAngle = horizontal || forward ? localAngle + control.yaw : Math.atan2(this.velocity.x, this.velocity.z), delta = Math.atan2(Math.sin(targetAngle - this.avatarRoot.rotation.y), Math.cos(targetAngle - this.avatarRoot.rotation.y));
      this.avatarRoot.rotation.y += delta * (1 - Math.exp(-dt * this.tuning.turnResponse));
    }
    this.animate(!this.grounded ? 'jump' : moving > 6 ? 'run' : moving > .3 ? 'walk' : 'idle'); this.mixer?.update(dt);
    const currentFloor = this.floorAt(this.player.position.x, this.player.position.z, this.player.position.y + .1); this.shadow.visible = !!currentFloor;
    if (currentFloor) { this.shadow.position.set(this.player.position.x, currentFloor.y + .025, this.player.position.z); this.shadow.material.opacity = .2 / (1 + (this.player.position.y - currentFloor.y) * .35); }
    for (const spark of this.sparks) {
      if (spark.collected) continue;
      spark.mesh.rotation.y = now * .001; spark.mesh.rotation.z = Math.sin(now * .001) * .15; spark.mesh.position.y = spark.localY + Math.sin(now * .003 + spark.x) * .13;
      if (this.player.position.distanceTo(new THREE.Vector3(spark.x, spark.y - .6, spark.z)) < (spark.relic ? 1.1 : .9)) {
        spark.collected = true; spark.mesh.visible = false; if (spark.halo) spark.halo.visible = false; if (spark.beam) spark.beam.visible = false; this.score += spark.relic ? 10 : 1; this.sound.collect();
        if (spark.relic) { this.goalCount++; this.checkpoint.set(spark.x, this.player.position.y, spark.z); this.events.toast?.(`${this.goalCount} / 3 resonance relics found`); this.showChapter(); }
      }
    }
    this.portal.visible = this.goalCount === 3; this.portal.rotation.z += dt * .3;
    if (this.goalCount === 3 && Math.hypot(this.player.position.x, this.player.position.z) < 2.4 && this.player.position.y < 2) { this.mode = 'finished'; this.sound.pause(); this.events.finish?.({ score: this.score, deaths: this.deaths, total: this.sparks.length, result: this.result }); }
    const time = this.sound.time; this.distance += moving * dt;
    const remaining = this.stars.filter(s => !s.collected).sort((a, b) => Math.hypot(a.x - this.player.position.x, a.z - this.player.position.z) - Math.hypot(b.x - this.player.position.x, b.z - this.player.position.z));
    const target = remaining[0] || { x: 0, z: 0 };
    this.events.update?.({ time, score: this.score, duration: this.plan.duration, beat: Math.floor(time * this.plan.bpm / 60) % 4, distance: this.distance, grounded: this.grounded, y: this.player.position.y, goals: this.goalCount, bearing: Math.atan2(target.x - this.player.position.x, -(target.z - this.player.position.z)) + this.cameraYaw, targetDistance: Math.hypot(target.x - this.player.position.x, target.z - this.player.position.z) });
  }
  frame(now) {
    const dt = Math.min((now - (this.lastFrame || now)) / 1000, .04); this.lastFrame = now;
    if (this.mode === 'playing') this.update(dt, now); else this.mixer?.update(Math.min(dt, .03));
    if (this.mode === 'home') { const angle = now * .000025; this.camera.position.lerp(new THREE.Vector3(Math.sin(angle) * 46, 30, Math.cos(angle) * 46), 1 - Math.exp(-dt * 1.5)); this.cameraFocus.lerp(new THREE.Vector3(0, 1, 0), 1 - Math.exp(-dt * 4)); }
    else {
      const focus = this.player.position.clone().add(new THREE.Vector3(0, 1.2, 0));
      this.cameraFocus.x = THREE.MathUtils.lerp(this.cameraFocus.x, focus.x, 1 - Math.exp(-dt * this.tuning.cameraResponse)); this.cameraFocus.z = THREE.MathUtils.lerp(this.cameraFocus.z, focus.z, 1 - Math.exp(-dt * this.tuning.cameraResponse)); this.cameraFocus.y = THREE.MathUtils.lerp(this.cameraFocus.y, focus.y, 1 - Math.exp(-dt * 4));
      const offset = new THREE.Vector3(Math.sin(this.cameraYaw) * Math.cos(this.cameraPitch), Math.sin(this.cameraPitch), Math.cos(this.cameraYaw) * Math.cos(this.cameraPitch)).multiplyScalar(this.cameraDistance);
      const target = this.cameraFocus.clone().add(offset); const floor = this.floorAt(target.x, target.z, target.y + 2); if (floor && target.y < floor.y + .7) target.y = floor.y + .7;
      this.camera.position.lerp(target, 1 - Math.exp(-dt * this.tuning.cameraResponse));
    }
    this.lookMatrix.lookAt(this.camera.position, this.cameraFocus, this.camera.up); this.lookQuaternion.setFromRotationMatrix(this.lookMatrix); this.camera.quaternion.slerp(this.lookQuaternion, 1 - Math.exp(-dt * this.tuning.cameraResponse * 1.5));
    this.sky.position.copy(this.camera.position); if (this.water) this.water.material.uniforms.time.value = now * .001;
    this.composer.render(); requestAnimationFrame(this.frame);
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); this.composer.setSize(innerWidth, innerHeight); }
  snapshot() { return { mode: this.mode, position: this.player.position.toArray(), velocity: this.velocity.toArray(), score: this.score, goals: this.goalCount, grounded: this.grounded, biome: this.biome?.id, tiles: this.map?.tiles.length, reachable: this.map?.reachable.length }; }
}
