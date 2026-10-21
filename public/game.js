import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { PHYSICS, compileLevel, random, hash, sectionAt } from '/lib/world.mjs';
import { Soundtrack } from './audio.js';
export class Runner {
  constructor(canvas, events = {}) {
    this.events = events; this.canvas = canvas; this.mode = 'home'; this.sound = new Soundtrack(); this.distance = 0; this.score = 0; this.deaths = 0; this.lane = 1; this.velocity = 0; this.grounded = true; this.jumpBuffer = 0; this.coyote = .12; this.lastFrame = 0; this.falling = false; this.respawnAt = 0;
    this.scene = new THREE.Scene(); this.scene.fog = new THREE.FogExp2('#1b3038', .011);
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, 1.7)); this.renderer.outputColorSpace = THREE.SRGBColorSpace; this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, .1, 700);
    this.camera.position.set(17, 12, 22);
    this.scene.add(new THREE.HemisphereLight('#b8d5cf', '#253335', 2.3));
    this.sun = new THREE.DirectionalLight('#ffd292', 3.6); this.sun.position.set(-30, 70, -60); this.scene.add(this.sun);
    this.sun.castShadow = true; this.sun.shadow.mapSize.set(1024, 1024); this.sun.shadow.camera.left = -30; this.sun.shadow.camera.right = 30; this.sun.shadow.camera.top = 35; this.sun.shadow.camera.bottom = -35; this.sun.shadow.camera.far = 180; this.sun.shadow.bias = -.001; this.scene.add(this.sun.target);
    const rim = new THREE.DirectionalLight('#62cecf', 1.7); rim.position.set(30, 20, 20); this.scene.add(rim);
    this.makeSky(); this.makePlayer(); this.resize(); window.addEventListener('resize', () => this.resize());
    this.frame = this.frame.bind(this); requestAnimationFrame(this.frame);
  }
  makeSky() {
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(500, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { topColor: { value: new THREE.Color('#102334') }, horizonColor: { value: new THREE.Color('#c99565') } }, vertexShader: 'varying vec3 vDirection; void main(){vDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}', fragmentShader: 'varying vec3 vDirection; uniform vec3 topColor; uniform vec3 horizonColor; void main(){vec3 d=normalize(vDirection); float h=smoothstep(-0.08,0.65,d.y); vec3 c=mix(horizonColor,topColor,h); float s=dot(d,normalize(vec3(-0.4,0.15,-1.0))); c+=vec3(1.0,0.56,0.18)*pow(max(s,0.0),80.0)*0.6; c+=vec3(1.0,0.7,0.28)*smoothstep(0.998,0.999,s)*0.8; gl_FragColor=vec4(c,1.0);}' }));
    this.sky.frustumCulled = false; this.scene.add(this.sky);
  }
  makePlayer() {
    this.player = new THREE.Group();
    const bodyMaterial = new THREE.MeshStandardMaterial({ color: '#e9e0bf', roughness: .5, metalness: .3 });
    const dark = new THREE.MeshStandardMaterial({ color: '#182934', roughness: .7 });
    const glow = new THREE.MeshStandardMaterial({ color: '#72f6d7', emissive: '#41ccb0', emissiveIntensity: 1.5 });
    const torso = new THREE.Mesh(new THREE.CapsuleGeometry(.25, .4, 4, 8), bodyMaterial); torso.position.y = .95; torso.castShadow = true; this.player.add(torso);
    const head = new THREE.Mesh(new THREE.BoxGeometry(.42, .37, .35), dark); head.position.set(0, 1.51, 0); head.castShadow = true; this.player.add(head);
    const visor = new THREE.Mesh(new THREE.BoxGeometry(.34, .09, .05), glow); visor.position.set(0, 1.54, -.19); this.player.add(visor);
    this.legs = [];
    for (const x of [-.15, .15]) { const limb = new THREE.Mesh(new THREE.CapsuleGeometry(.09, .38, 3, 5), dark); limb.position.set(x, .35, 0); this.player.add(limb); this.legs.push(limb); }
    this.arms = [];
    for (const x of [-.36, .36]) { const arm = new THREE.Mesh(new THREE.CapsuleGeometry(.075, .4, 3, 5), bodyMaterial); arm.position.set(x, .95, 0); arm.rotation.z = x > 0 ? -.15 : .15; this.player.add(arm); this.arms.push(arm); }
    const pack = new THREE.Mesh(new THREE.BoxGeometry(.34, .36, .16), glow); pack.position.set(0, .98, .25); this.player.add(pack);
    this.scene.add(this.player);
  }
  clearWorld() {
    if (!this.world) return;
    const geometries = new Set(), materials = new Set();
    this.world.traverse(o => { if (o.geometry) geometries.add(o.geometry); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => materials.add(m)); });
    geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); this.scene.remove(this.world);
  }
  build(plan, seed) {
    this.plan = plan; this.seed = seed; this.level = compileLevel(plan, seed); this.clearWorld(); this.world = new THREE.Group(); this.scene.add(this.world);
    const palette = plan.palette, rng = random(hash(seed));
    this.accent = new THREE.Color(palette[0]); this.cool = new THREE.Color(palette[1]);
    this.sky.material.uniforms.horizonColor.value.copy(this.accent).lerp(new THREE.Color('#bc9c7a'), .55);
    const stone = new THREE.MeshStandardMaterial({ color: '#3d5153', roughness: .85, metalness: .15 });
    const edge = new THREE.MeshStandardMaterial({ color: this.accent, emissive: this.accent, emissiveIntensity: .65, roughness: .5 });
    const cyan = new THREE.MeshStandardMaterial({ color: this.cool, emissive: this.cool, emissiveIntensity: .8, roughness: .2, metalness: .4 });
    const box = new THREE.BoxGeometry(1, 1, 1);
    const addBox = (x, y, z, sx, sy, sz, mat, shadow = false) => { const mesh = new THREE.Mesh(box, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); mesh.receiveShadow = true; mesh.castShadow = shadow; this.world.add(mesh); return mesh; };
    this.platformMeshes = [];
    for (const p of this.level.platforms) {
      const length = p.end - p.start;
      this.platformMeshes.push(addBox(0, -.6, -(p.start + p.end) / 2, 11.8, 1.2, length, stone));
      for (const x of [-5.82, 5.82]) addBox(x, .035, -(p.start + p.end) / 2, .11, .07, length, edge);
      for (const x of [-1.5, 1.5]) addBox(x, .008, -(p.start + p.end) / 2, .025, .015, length, cyan);
      if (p.gap > 0) for (const z of [-p.end + .4, -p.start - .4]) addBox(0, .02, z, 11.5, .04, .16, edge);
      if (p.index % 8 === 0 && p.index > 0) { for (const x of [-5.6, 5.6]) addBox(x, 2.5, -p.start - 2, .14, 5, .14, cyan); addBox(0, 5, -p.start - 2, 11.4, .15, .15, cyan); }
      for (const x of [-4.8, 4.8]) addBox(x, -5, -(p.start + p.end) / 2, .6, 9, .8, stone);
    }
    const obstacleMat = new THREE.MeshStandardMaterial({ color: '#9e5741', roughness: .45, metalness: .4 });
    this.level.obstacles.forEach(o => { o.mesh = addBox(PHYSICS.lanes[o.lane], o.height / 2, -o.distance, o.width, o.height, o.depth, obstacleMat, true); addBox(PHYSICS.lanes[o.lane], o.height + .03, -o.distance, o.width + .05, .08, o.depth, edge); });
    const gem = new THREE.OctahedronGeometry(.25), sparkMat = new THREE.MeshStandardMaterial({ color: this.cool, emissive: this.cool, emissiveIntensity: 1.8, metalness: .5, roughness: .2 });
    this.level.sparks.forEach(s => { s.mesh = new THREE.Mesh(gem, sparkMat); s.mesh.position.set(PHYSICS.lanes[s.lane], s.height, -s.distance); this.world.add(s.mesh); });
    // Instanced skyline keeps a long generated course inexpensive to render.
    const count = Math.ceil(this.level.length / 12) * 2 + 60;
    const towers = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: '#314c50', roughness: .8, metalness: .15 }), count);
    const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: '#385846', roughness: 1 }), count);
    const windows = new THREE.InstancedMesh(box, new THREE.MeshStandardMaterial({ color: this.accent, emissive: this.accent, emissiveIntensity: .5 }), count * 3);
    const dummy = new THREE.Object3D(), color = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const side = i % 2 ? 1 : -1, x = side * (10 + rng() * 65), z = -i / 2 * 12 + 45, h = 5 + rng() ** 2 * 70, w = 3 + rng() * 10, d = 4 + rng() * 8;
      dummy.position.set(x, h / 2 - 15, z); dummy.scale.set(w, h, d); dummy.rotation.y = rng() * .2; dummy.updateMatrix(); towers.setMatrixAt(i, dummy.matrix);
      color.set('#29434a').lerp(new THREE.Color('#5d6556'), rng() * .65); towers.setColorAt(i, color);
      dummy.position.set(x, h - 15, z); dummy.scale.set(w * .85, 4 + rng() * 6, d * .85); dummy.updateMatrix(); crowns.setMatrixAt(i, dummy.matrix);
      for (let k = 0; k < 3; k++) { dummy.position.set(x, h * (.28 + k * .22) - 15, z + d * .51); dummy.scale.set(w * .72, .12, .04); dummy.updateMatrix(); windows.setMatrixAt(i * 3 + k, dummy.matrix); }
    }
    towers.castShadow = false; this.world.add(towers, crowns, windows);
    const vines = new THREE.InstancedMesh(new THREE.CylinderGeometry(.09, .16, 1, 5), new THREE.MeshStandardMaterial({ color: '#5c7952', roughness: 1 }), 140);
    for (let i = 0; i < 140; i++) { const x = (i % 2 ? -1 : 1) * (6.8 + rng() * 4); dummy.position.set(x, 1 + rng() * 4, -rng() * this.level.length); dummy.scale.set(1, 4 + rng() * 10, 1); dummy.rotation.set(rng() * .4, 0, (i % 2 ? -1 : 1) * (.2 + rng() * .6)); dummy.updateMatrix(); vines.setMatrixAt(i, dummy.matrix); }
    this.world.add(vines);
    const leafCount = 200, leaves = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: '#456c4d', roughness: 1 }), leafCount);
    for (let i = 0; i < leafCount; i++) { dummy.position.set((i % 2 ? 1 : -1) * (6.5 + rng() * 5), .4 + rng() * 5, -rng() * this.level.length); dummy.scale.set(1.5 + rng(), .3 + rng(), .8 + rng()); dummy.rotation.set(rng(), rng(), rng()); dummy.updateMatrix(); leaves.setMatrixAt(i, dummy.matrix); }
    this.world.add(leaves);
    const moteCount = 240, positions = new Float32Array(moteCount * 3);
    for (let i = 0; i < moteCount; i++) { positions[i * 3] = (rng() - .5) * 30; positions[i * 3 + 1] = rng() * 12; positions[i * 3 + 2] = -rng() * this.level.length; }
    const motesGeometry = new THREE.BufferGeometry(); motesGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    this.motes = new THREE.Points(motesGeometry, new THREE.PointsMaterial({ color: this.cool, size: .09, transparent: true, opacity: .7 })); this.world.add(this.motes);
    const portalMaterial = new THREE.MeshStandardMaterial({ color: this.cool, emissive: this.cool, emissiveIntensity: 2 });
    this.portal = new THREE.Mesh(new THREE.TorusGeometry(4.8, .15, 8, 48), portalMaterial); this.portal.position.set(0, 3.7, -this.level.length - 3); this.world.add(this.portal);
    this.player.position.set(0, 0, -7); this.camera.position.set(17, 12, 22); this.camera.lookAt(0, 3, -50);
    this.distance = 0; this.mode = 'home';
  }
  async loadGeneratedWorld(world) {
    if (!world) return;
    if (world.panoramaUrl) {
      const texture = await new THREE.TextureLoader().loadAsync(world.panoramaUrl); texture.mapping = THREE.EquirectangularReflectionMapping; texture.colorSpace = THREE.SRGBColorSpace;
      this.sky.visible = false; this.scene.background = texture;
    }
    if (world.glbUrl) {
      const gltf = await new GLTFLoader().loadAsync(world.glbUrl); gltf.scene.position.set(0, -4, -35); this.world.add(gltf.scene);
    }
  }
  resetAssets() { this.sky.visible = true; this.scene.background?.dispose?.(); this.scene.background = null; }
  async start(result) {
    this.sound.stop(); this.resetAssets(); this.build(result.plan, result.id || `${result.song.title}:${result.song.artist}`); this.result = result;
    if (result.world) { try { await this.loadGeneratedWorld(result.world); } catch (e) { this.events.toast?.(`Generated scenery could not load: ${e.message}`); } }
    await this.sound.load(result.audioUrl, this.plan.bpm);
    if (this.sound.audio && Number.isFinite(this.sound.audio.duration) && this.sound.audio.duration < this.plan.duration) this.plan.duration = Math.max(1, this.sound.audio.duration - .2);
    this.distance = 0; this.score = 0; this.deaths = 0; this.lane = 1; this.velocity = 0; this.player.position.set(0, 0, 0); this.grounded = true; this.coyote = .12; this.falling = false; this.lastSection = ''; this.checkpoint = 0;
    this.camera.position.set(0, 5, 12); this.camera.lookAt(0, 1.7, -18); this.mode = 'playing'; await this.sound.play(0);
    this.events.toast?.('Follow the sparks. SPACE to jump.');
  }
  steer(direction) { if (this.mode !== 'playing' || this.falling) return; this.lane = Math.max(0, Math.min(2, this.lane + direction)); }
  jump() { if (this.mode === 'playing' && !this.falling) this.jumpBuffer = .15; }
  async pause() { if (this.mode !== 'playing') return; this.mode = 'paused'; await this.sound.pause(); }
  async resume() { if (this.mode !== 'paused') return; await this.sound.resume(); this.mode = 'playing'; this.lastFrame = performance.now(); }
  home() { this.mode = 'home'; this.sound.stop(); this.distance = 0; this.player.position.set(0, 0, -7); }
  async restart() { return this.start(this.result); }
  async respawn() {
    const cp = this.level.checkpoints.filter(c => c.distance < this.distance - 2).at(-1);
    const time = cp?.time || 0; this.distance = time * PHYSICS.speed; this.player.position.set(0, 0, -this.distance); this.lane = 1; this.velocity = 0; this.grounded = true; this.coyote = .12; this.falling = false; this.respawning = true;
    await this.sound.seek(time); this.respawning = false; this.events.toast?.('Back in the flow. Your sparks are safe.');
  }
  hit() { if (this.falling) return; this.falling = true; this.deaths++; this.respawnAt = performance.now() + 750; this.sound.fall(); this.sound.pause(); this.events.toast?.('A little offbeat. Try that section again.'); }
  update(dt, now) {
    if (this.respawning) return;
    if (this.falling) { this.player.position.y -= dt * 6; if (now > this.respawnAt) this.respawn(); return; }
    const time = this.sound.time;
    this.distance = time * PHYSICS.speed; this.player.position.z = -this.distance;
    const previousY = this.player.position.y;
    this.player.position.x = THREE.MathUtils.damp(this.player.position.x, PHYSICS.lanes[this.lane], 14, dt);
    this.jumpBuffer -= dt; this.coyote = this.grounded ? .12 : this.coyote - dt;
    if (this.jumpBuffer > 0 && this.coyote > 0) { this.velocity = PHYSICS.jump; this.grounded = false; this.coyote = 0; this.jumpBuffer = 0; this.sound.jump(); }
    this.velocity -= PHYSICS.gravity * dt; this.player.position.y += this.velocity * dt;
    const floor = this.level.platforms.find(p => this.distance >= p.start - .15 && this.distance <= p.end + .15);
    if (floor && previousY >= floor.top - .1 && this.player.position.y <= floor.top && this.velocity <= 0) { this.player.position.y = floor.top; this.velocity = 0; this.grounded = true; } else this.grounded = false;
    if (this.player.position.y < -4) this.hit();
    for (const obstacle of this.level.obstacles) if (Math.abs(obstacle.distance - this.distance) < .7 && Math.abs(PHYSICS.lanes[obstacle.lane] - this.player.position.x) < 1.04 && this.player.position.y < obstacle.height - .12 && this.player.position.y > -1) { this.hit(); break; }
    for (const spark of this.level.sparks) if (!spark.collected && Math.abs(spark.distance - this.distance) < .75 && Math.abs(PHYSICS.lanes[spark.lane] - this.player.position.x) < .85 && Math.abs(spark.height - (this.player.position.y + .8)) < 1.1) { spark.collected = true; spark.mesh.visible = false; this.score++; this.sound.collect(); }
    this.level.sparks.forEach(s => { if (Math.abs(s.distance - this.distance) < 100) { s.mesh.rotation.y = now * .0015; s.mesh.position.y = s.height + Math.sin(now * .003 + s.distance) * .08; } });
    const stride = this.grounded ? Math.sin(time * 19) * .65 : .28;
    this.legs[0].rotation.x = stride; this.legs[1].rotation.x = -stride; this.arms[0].rotation.x = -stride; this.arms[1].rotation.x = stride;
    this.player.rotation.z = (PHYSICS.lanes[this.lane] - this.player.position.x) * -.06;
    const section = sectionAt(this.plan, time);
    if (section.name !== this.lastSection) { this.lastSection = section.name; this.events.chapter?.(section); }
    this.events.update?.({ time, score: this.score, duration: this.plan.duration, beat: Math.floor(time * this.plan.bpm / 60) % 4, distance: this.distance, grounded: this.grounded, y: this.player.position.y });
    if (time >= this.plan.duration || this.sound.audio?.ended) { this.mode = 'finished'; this.sound.pause(); this.events.finish?.({ score: this.score, deaths: this.deaths, total: this.level.sparks.length, result: this.result }); }
  }
  frame(now) {
    const dt = Math.min((now - (this.lastFrame || now)) / 1000, .045); this.lastFrame = now;
    if (this.mode === 'playing') this.update(dt, now);
    if (this.mode === 'home') {
      this.camera.position.set(18 + Math.sin(now * .00012) * 2.5, 11 + Math.sin(now * .00018) * .6, 21); this.camera.lookAt(-1, 2, -52);
      this.player.rotation.y = 0; this.sky.position.copy(this.camera.position);
    } else {
      const target = new THREE.Vector3(this.player.position.x * .4, Math.max(4.6, this.player.position.y * .35 + 4.6), -this.distance + 11.3);
      this.camera.position.lerp(target, 1 - Math.exp(-dt * 7)); this.camera.lookAt(this.player.position.x * .15, 1.3 + Math.max(0, this.player.position.y) * .2, -this.distance - 18);
      this.sun.position.set(-30, 70, -this.distance - 60); this.sun.target.position.set(0, 0, -this.distance - 15); this.sun.target.updateMatrixWorld(); this.sky.position.copy(this.camera.position);
    }
    if (this.portal) { this.portal.rotation.z = now * .0002; this.portal.material.emissiveIntensity = 1.5 + Math.sin(now * .003) * .4; }
    this.renderer.render(this.scene, this.camera); requestAnimationFrame(this.frame);
  }
  resize() { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); this.renderer.setSize(innerWidth, innerHeight); }
  snapshot() { return { mode: this.mode, distance: this.distance, lane: this.lane, score: this.score, deaths: this.deaths, grounded: this.grounded, y: this.player.position.y, time: this.sound.time, platforms: this.level?.platforms.length, gap: this.level?.maxGap }; }
}
