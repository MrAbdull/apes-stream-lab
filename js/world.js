// The explorable 3D field site (Three.js).
// Scenery: flo-bit Low Poly Nature Pack, Quaternius characters/animals/crops,
// KayKit City Builder Bits (all CC0; see CREDITS.md).
// The landscape is the same for everyone; the WATER COLOR at each site comes from
// that student's/group's own chemistry, so the world visually matches their data.
// Controls: WASD / arrows + drag on laptops, joystick + drag on iPads (third-person camera).

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js';
import { SITES } from './model.js';
import { mulberry32 } from './rng.js';
import { DEFAULT_AVATAR } from './avatars.js';
import { Walker } from '../platform/engine/player.js';
import { Colliders } from '../platform/engine/physics.js';

const ASSET = (p) => new URL(`../assets/${p}`, import.meta.url).href;

export const streamX = (z) => 18 * Math.sin(z * 0.018) + 7 * Math.sin(z * 0.047 + 1.3);
const baseY = (z) => -z * 0.05;
export const waterY = (z) => baseY(z) - 0.55;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

export function groundY(x, z) {
  const d = Math.abs(x - streamX(z));
  let h = baseY(z);
  if (d < 4.5) h -= 1.3 * (1 - (d / 4.5) ** 2);
  h += Math.min(d, 90) ** 2 * 0.0016;
  const hills = (Math.sin(x * 0.045) * Math.cos(z * 0.038) + 0.6 * Math.sin(x * 0.11 + z * 0.07)) * 1.6;
  return h + hills * smooth(12, 35, d);
}

const zoneAt = (z) => (z < -95 ? 'forest' : z < 0 ? 'farm' : z < 100 ? 'town' : 'buffer');
const PIPE_Z = 38;
const SITE_POS = SITES.map((s) => ({ id: s.id, x: streamX(s.z) + 7.5, z: s.z }));
const START = { x: streamX(-205) + 6, z: -205 };
const NEAR_DIST = 10;
const CHUNK = 60;
const WALK = 2.4, RUN = 5.2; // human walking and running speeds (m/s)

const MODELS = {
  oak1: 'nature/common_tree_1.glb', oak2: 'nature/common_tree_2.glb', oak3: 'nature/common_tree_3.glb',
  pine1: 'nature/pine_tree_1.glb', pine2: 'nature/pine_tree_2.glb', pine3: 'nature/pine_tree_3.glb',
  bush1: 'nature/bush_1.glb', bush3: 'nature/bush_3.glb', berries: 'nature/bush_berries_1.glb',
  stone1: 'nature/stone_1.glb', stone2: 'nature/stone_2.glb', stone3: 'nature/stone_3.glb', stone4: 'nature/stone_4.glb', stone5: 'nature/stone_5.glb',
  grass1: 'nature/grass_1.glb', grass2: 'nature/grass_2.glb', grass3: 'nature/grass_3.glb',
  flower1: 'nature/flower_1.glb', flower2: 'nature/flower_2.glb', flower3: 'nature/flower_3.glb',
  plant1: 'nature/plant_1.glb', plant2: 'nature/plant_2.glb', stump: 'nature/tree_stump_1.glb', deadtree: 'nature/dead_tree_1.glb',
  cloud1: 'nature/cloud_1.glb', cloud2: 'nature/cloud_2.glb', cloud3: 'nature/cloud_3.glb',
  cow: 'farm/cow.glb', corn: 'farm/corn_3.glb', wheat: 'farm/wheat_4.glb',
  bA: 'town/building_A.gltf', bB: 'town/building_B.gltf', bC: 'town/building_C.gltf', bD: 'town/building_D.gltf',
  bE: 'town/building_E.gltf', bF: 'town/building_F.gltf', bG: 'town/building_G.gltf', bH: 'town/building_H.gltf',
  carA: 'town/car_hatchback.gltf', carB: 'town/car_sedan.gltf', carC: 'town/car_stationwagon.gltf', carD: 'town/car_taxi.gltf',
  lamp: 'town/streetlight.gltf', bench: 'town/bench.gltf',
};

export function waterColorFromChem(c) {
  const base = new THREE.Color('#2f7d96');
  const green = new THREE.Color('#5d8f3a');
  const brown = new THREE.Color('#8a6a3c');
  const t = Math.min(c.turbidity / 140, 1) * 0.85;
  const g = Math.min(c.phosphate / 0.7, 1) * 0.65;
  return base.lerp(green, g).lerp(brown, t);
}

function makeLabel(lines, { bg = 'rgba(255,255,255,0.92)', fg = '#1d2b22', accent = '#2e7d32', scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = 22;
  const fontFor = (i) => `${i ? '500 32px' : 'bold 44px'} system-ui, sans-serif`;
  const w = Math.max(...lines.map((l, i) => { ctx.font = fontFor(i); return ctx.measureText(l).width; })) + pad * 2;
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(44 + (lines.length - 1) * 40 + pad * 2);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, canvas.width, canvas.height, 18); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 10, canvas.height);
  lines.forEach((l, i) => { ctx.font = fontFor(i); ctx.fillStyle = fg; ctx.fillText(l, pad, pad + 40 + i * 40 - (i ? 4 : 0)); });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const s = 0.012 * scale;
  sprite.scale.set(canvas.width * s, canvas.height * s, 1);
  return sprite;
}

// A tileable ripple normal map drawn in code (no image download needed).
function makeWaterNormals(size = 256) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const ctx = c.getContext('2d');
  const img = ctx.createImageData(size, size);
  const TAU = Math.PI * 2;
  const h = (x, y) => {
    const u = (x / size) * TAU, v = (y / size) * TAU;
    return 0.5 * Math.sin(3 * u + 2 * v) + 0.35 * Math.sin(5 * u - 4 * v + 1.3) + 0.25 * Math.sin(-7 * u + 9 * v + 0.7)
      + 0.15 * Math.sin(11 * u + 13 * v + 2.1) + 0.12 * Math.sin(2 * u + 17 * v);
  };
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * 6, dy = (h(x, y + 1) - h(x, y - 1)) * 6;
      const len = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx / len * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy / len * 0.5 + 0.5) * 255;
      img.data[i + 2] = (1 / len * 0.5 + 0.5) * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

export class StreamWorld {
  constructor(container, opts) {
    this.container = container;
    this.onNear = opts.onNear || (() => {});
    this.minimap = opts.minimap;
    this.siteStatus = opts.siteStatus || (() => 'new');
    this.inputEnabled = true;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.near = null;
    this.frame = 0;
    this.mixers = [];
    this.lodChunks = [];
    this.colliders = new Colliders();
    this.native = {};
    if (new URLSearchParams(location.search).has('debug')) window.streamWorld = this; // for checking render stats
    this.ready = this.init(opts);
  }

  async init({ chems, mystery, joystick, avatar, onProgress }) {
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    this.renderer = renderer;

    const scene = new THREE.Scene();
    this.scene = scene;
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
    this.camera.rotation.order = 'YXZ';

    this.waterKeys = [
      [-160, chems[0]], [-95, chems[0]], [-45, chems[1]], [PIPE_Z - 2, chems[1]],
      [PIPE_Z + 8, chems[2]], [160, chems[3]],
    ].map(([z, c]) => [z, waterColorFromChem(c)]);
    this.flowSpeed = chems.map((c) => 10 / c.flow);

    // Load all models (about 4 MB) with progress.
    const loader = new GLTFLoader();
    const entries = Object.entries(MODELS);
    let done = 0;
    const total = entries.length + 1;
    const tick = () => onProgress?.(++done / total);
    this.models = {};
    await Promise.all(entries.map(([k, p]) => loader.loadAsync(ASSET(p)).then((g) => { this.models[k] = g; tick(); })));
    await this.loadAvatar(avatar || DEFAULT_AVATAR);
    tick();
    // The pack's stones are near-white; give them wet streambed colors.
    ['stone1', 'stone2', 'stone3', 'stone4', 'stone5'].forEach((k, i) => this.models[k].scene.traverse((o) => {
      if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(['#8a8578', '#7a776e', '#948c7c', '#6f6c64', '#857c6c'][i]); }
    }));

    this.buildSky();
    this.buildTerrain();
    this.buildWater();
    this.buildParticles();
    this.buildVegetation();
    this.buildFarm();
    this.buildTown(mystery);
    this.buildSites();
    this.buildClouds();

    this.player = { x: START.x, z: START.z, facing: 0, speed: 0 };
    this.camYaw = Math.PI;
    this.camPitch = 0.32;
    this.camDist = 5.2;
    this.camPos = new THREE.Vector3();
    this.snapCamera = true;
    this.snapLOD = true;

    this.setupInput(joystick);
    this.container.appendChild(renderer.domElement);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(this.container);

    this.clock = new THREE.Clock();
    this.perf = { t: 0, frames: 0 };
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1); // cap avoids big jumps after a pause, but keeps slow devices moving
      this.update(dt);
      renderer.render(scene, this.camera);
      this.watchPerformance(dt);
    };
    loop();
  }

  // Drop the resolution once if the device is struggling (older iPads).
  watchPerformance(dt) {
    if (this.perf.done) return;
    this.perf.t += dt; this.perf.frames++;
    if (this.perf.t > 3) {
      const fps = this.perf.frames / this.perf.t;
      if (fps < 28 && this.pixelRatio > 1) { this.pixelRatio = 1; this.renderer.setPixelRatio(1); this.resize(); }
      this.perf.done = true;
    }
  }

  // ---------- character ----------

  async loadAvatar({ id, skin }) {
    const g = await new GLTFLoader().loadAsync(ASSET(`characters/${id}.glb`));
    const root = g.scene;
    root.scale.setScalar(0.9);
    root.traverse((o) => {
      if (!o.isMesh) return;
      o.frustumCulled = false;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach((m) => {
        if (m.name === 'Skin') m.color.set(skin);
        if (m.name === 'Skin_Darker') m.color.set(skin).multiplyScalar(0.88);
      });
    });
    if (this.character) this.scene.remove(this.character);
    this.character = root;
    this.walker = new Walker(root);
    this.scene.add(root);
  }

  setAvatar(avatar) {
    return this.loadAvatar(avatar);
  }

  // ---------- scene building ----------

  buildSky() {
    const sky = new Sky();
    sky.scale.setScalar(1200);
    const u = sky.material.uniforms;
    u.turbidity.value = 5;
    u.rayleigh.value = 1.2;
    u.mieCoefficient.value = 0.004;
    u.mieDirectionalG.value = 0.8;
    const sun = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(55), THREE.MathUtils.degToRad(150));
    u.sunPosition.value.copy(sun);
    this.scene.add(sky);

    // Soft reflections for water and gentle fill light, from a plain sky-to-ground
    // gradient (the Sky shader's sun is far too bright to use for this).
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    const envScene = new THREE.Scene();
    const dome = new THREE.SphereGeometry(10, 32, 16);
    const top = new THREE.Color('#8fbde0'), horizon = new THREE.Color('#dfeaf0'), ground = new THREE.Color('#5d6b48');
    const cols = [], pos = dome.attributes.position, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y > 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6)); else c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
      cols.push(c.r, c.g, c.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.6;

    this.scene.fog = new THREE.Fog('#c9dde9', 70, 270);
    this.scene.add(new THREE.HemisphereLight('#e8f4ff', '#56653f', 0.75));
    const light = new THREE.DirectionalLight('#fff1dc', 1.7);
    light.position.copy(sun).multiplyScalar(100);
    this.scene.add(light);
  }

  terrainColor(x, z, c, P) {
    const sx = streamX(z);
    const d = Math.abs(x - sx);
    const zone = zoneAt(z);
    const n = Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.5 + 0.5;
    const n2 = Math.sin(x * 0.07 + 1) * Math.cos(z * 0.05) * 0.5 + 0.5;
    if (d < 5.2) { c.copy(zone === 'farm' ? P.sand : P.mud).lerp(P.pebble, n * 0.4); return; }
    switch (zone) {
      case 'forest': c.copy(P.forest).lerp(P.forest2, n).lerp(P.moss, n2 * 0.3); break;
      case 'buffer': c.copy(P.buffer).lerp(P.forest2, n * 0.5).lerp(P.moss, n2 * 0.3); break;
      case 'farm':
        if (d < 9) c.copy(P.sand).lerp(P.pasture, (d - 5.2) / 3.8);
        else if (x > sx && d < 55) c.copy(P.pasture).lerp(P.moss, n * 0.3);
        else c.copy(Math.floor((x + 400) / 12) % 2 ? P.crop : P.soil).lerp(P.crop2, n2 * 0.3);
        break;
      default: {
        const rd = Math.abs(x - (sx + 30));
        if (rd < 3.4) c.copy(P.road);
        else if (rd < 4.4) c.copy(P.curb);
        else c.copy(P.lawn).lerp(P.pasture, n * 0.4);
      }
    }
  }

  buildTerrain() {
    const P = {
      forest: new THREE.Color('#4d7a3a'), forest2: new THREE.Color('#3a6530'), moss: new THREE.Color('#6f8f3e'),
      mud: new THREE.Color('#6b5638'), sand: new THREE.Color('#9a8259'), pebble: new THREE.Color('#857d6c'),
      crop: new THREE.Color('#c9b862'), crop2: new THREE.Color('#a9a24f'), soil: new THREE.Color('#7b6142'),
      pasture: new THREE.Color('#8db659'), lawn: new THREE.Color('#86b16a'), road: new THREE.Color('#4f5156'),
      curb: new THREE.Color('#a7a59e'), buffer: new THREE.Color('#4f8240'),
    };
    const SIZE = 520, SEG = 300;
    const g = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    g.rotateX(-Math.PI / 2);
    const p = g.attributes.position;
    const colors = new Float32Array(p.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i);
      p.setY(i, groundY(x, z));
      this.terrainColor(x, z, c, P);
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    g.computeVertexNormals();
    this.scene.add(new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 })));
  }

  waterColorAt(z) {
    const k = this.waterKeys;
    if (z <= k[0][0]) return k[0][1].clone();
    for (let i = 0; i < k.length - 1; i++) {
      if (z <= k[i + 1][0]) return k[i][1].clone().lerp(k[i + 1][1], (z - k[i][0]) / (k[i + 1][0] - k[i][0]));
    }
    return k[k.length - 1][1].clone();
  }

  buildWater() {
    const pos = [], col = [], uv = [], idx = [];
    const W = 4.2;
    let n = 0;
    for (let z = -260; z <= 260; z += 2) {
      const sx = streamX(z);
      const dxdz = streamX(z + 0.5) - streamX(z - 0.5);
      const len = Math.hypot(dxdz, 1);
      const px = 1 / len, pz = -dxdz / len;
      const y = waterY(z);
      pos.push(sx - px * W, y, z - pz * W, sx + px * W, y, z + pz * W);
      const c = this.waterColorAt(z);
      col.push(c.r, c.g, c.b, c.r, c.g, c.b);
      uv.push(0, z / 12, 1, z / 12);
      if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    this.waterNormals = makeWaterNormals();
    this.waterNormals.repeat.set(1, 1);
    const m = new THREE.MeshStandardMaterial({
      vertexColors: true, transparent: true, opacity: 0.9, roughness: 0.12, metalness: 0.05,
      normalMap: this.waterNormals, normalScale: new THREE.Vector2(0.22, 0.22), side: THREE.DoubleSide, envMapIntensity: 0.7,
    });
    this.scene.add(new THREE.Mesh(g, m));
  }

  buildParticles() {
    const N = 500;
    const rnd = mulberry32(99);
    this.pz = new Float32Array(N);
    this.poff = new Float32Array(N);
    for (let i = 0; i < N; i++) { this.pz[i] = -260 + rnd() * 520; this.poff[i] = (rnd() * 2 - 1) * 3; }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.14, transparent: true, opacity: 0.7, depthWrite: false }));
    this.scene.add(this.particles);
  }

  flowAt(z) {
    const zs = SITES.map((s) => s.z);
    if (z <= zs[0]) return this.flowSpeed[0];
    for (let i = 0; i < zs.length - 1; i++) {
      if (z <= zs[i + 1]) return this.flowSpeed[i] + (this.flowSpeed[i + 1] - this.flowSpeed[i]) * (z - zs[i]) / (zs[i + 1] - zs[i]);
    }
    return this.flowSpeed[3];
  }

  nearAnySite(x, z, r) {
    return SITE_POS.some((p) => Math.hypot(p.x - x, p.z - z) < r);
  }

  // Many copies of one model as instanced meshes, grouped in a grid of chunks.
  // The GPU skips off-screen chunks, and each frame chunks far from the student
  // are hidden (small plants) or swapped for a simple stand-in shape (trees).
  nativeHeight(key) {
    if (!this.native[key]) {
      const box = new THREE.Box3().setFromObject(this.models[key].scene, true);
      this.native[key] = Math.max(0.01, box.max.y - Math.max(0, box.min.y));
    }
    return this.native[key];
  }

  addInstances(key, placements, { near = 75, lod = null, collide = 0 } = {}) {
    if (!placements.length) return;
    const nh = this.nativeHeight(key);
    for (const p of placements) {
      if (p.height) p.scale = p.height / nh;
      if (collide) this.colliders.addCircle(p.x, p.z, Math.max(0.15, collide * nh * (p.scale ?? 1)));
    }
    const root = this.models[key].scene;
    root.updateMatrixWorld(true);
    const parts = [];
    root.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
    const chunks = new Map();
    for (const p of placements) {
      const c = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
      if (!chunks.has(c)) chunks.set(c, []);
      chunks.get(c).push(p);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const fill = (im, list, extra) => {
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot ?? 0);
        v.set(p.x, p.y ?? groundY(p.x, p.z), p.z);
        s.setScalar(p.scale ?? 1);
        m.compose(v, q, s);
        if (extra) m.multiply(extra);
        im.setMatrixAt(i, m);
      });
      im.computeBoundingSphere();
    };
    for (const [c, list] of chunks) {
      const [cx, cz] = c.split(',').map(Number);
      const detail = new THREE.Group();
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        fill(im, list, part.matrix);
        detail.add(im);
      }
      this.scene.add(detail);
      let proxy = null;
      if (lod) {
        proxy = new THREE.InstancedMesh(this.proxyGeometry(lod), this.proxyMaterial, list.length);
        fill(proxy, list);
        this.scene.add(proxy);
      }
      this.lodChunks.push({ x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK, near, detail, proxy, tree: !!lod });
    }
  }

  // Simple low-poly stand-ins for distant trees (a few dozen triangles each).
  proxyGeometry(kind) {
    this.proxies ||= {};
    if (this.proxies[kind]) return this.proxies[kind];
    const trunkColor = new THREE.Color('#5b4330');
    const leafColor = new THREE.Color(kind === 'pine' ? '#2f5b33' : '#3f6e33');
    const paint = (g, color) => {
      const n = g.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return g.index ? g.toNonIndexed() : g;
    };
    const trunk = paint(new THREE.CylinderGeometry(0.15, 0.22, kind === 'pine' ? 1.6 : 2.6, 5).translate(0, kind === 'pine' ? 0.8 : 1.3, 0), trunkColor);
    const crown = kind === 'pine'
      ? paint(new THREE.ConeGeometry(1.15, 4.2, 6).translate(0, 3.4, 0), leafColor)
      : paint(new THREE.IcosahedronGeometry(2.1, 0).scale(1, 0.85, 1).translate(0, 4.2, 0), leafColor);
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const a = trunk.attributes[name].array, b = crown.attributes[name].array;
      const arr = new Float32Array(a.length + b.length); arr.set(a); arr.set(b, a.length);
      merged.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    this.proxyMaterial ||= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    return (this.proxies[kind] = merged);
  }

  // Distance to the first nearby tree between the student and the camera (or null).
  treeBetween(origin, dir, far) {
    this.raycaster ||= new THREE.Raycaster();
    this.raycaster.set(origin, dir);
    this.raycaster.far = far + 0.5;
    const meshes = [];
    for (const c of this.lodChunks) if (c.tree && c.detail.visible) meshes.push(...c.detail.children);
    const hit = this.raycaster.intersectObjects(meshes, false)[0];
    return hit ? Math.max(1.6, hit.distance - 0.6) : null;
  }

  updateLOD() {
    const { x, z } = this.player;
    for (const c of this.lodChunks) {
      const d = Math.hypot(c.x - x, c.z - z) - CHUNK * 0.7;
      const close = d < c.near;
      c.detail.visible = close;
      if (c.proxy) c.proxy.visible = !close;
    }
  }

  placeModel(key, x, z, { scale = 1, rot = 0, y } = {}) {
    const o = this.models[key].scene.clone();
    o.scale.setScalar(scale);
    o.rotation.y = rot;
    o.position.set(x, y ?? groundY(x, z), z);
    this.scene.add(o);
    return o;
  }

  buildVegetation() {
    const rnd = mulberry32(7);
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const bag = {};
    const put = (key, p) => (bag[key] ||= []).push(p);
    const blocked = (x, z, r) => this.nearAnySite(x, z, r) || Math.hypot(x - START.x, z - START.z) < 9;

    // Trees: dense along the stream corridor, thinning out toward the hills
    for (let i = 0; i < 9000; i++) {
      const z = -255 + rnd() * 510;
      const sx = streamX(z);
      const x = sx + (rnd() * 2 - 1) * 170;
      const d = Math.abs(x - sx);
      const zone = zoneAt(z);
      const falloff = d < 45 ? 1 : d < 90 ? 0.45 : 0.18;
      let type = null;
      if (zone === 'forest' && d > 7 && rnd() < 0.3 * falloff) type = rnd() < 0.65 ? pick(['pine1', 'pine2', 'pine3']) : pick(['oak1', 'oak2', 'oak3']);
      else if (zone === 'buffer' && d > 6.5 && rnd() < (d < 35 ? 0.45 : 0.12 * falloff)) type = rnd() < 0.7 ? pick(['oak1', 'oak2', 'oak3']) : pick(['pine1', 'pine2']);
      else if (zone === 'farm' && x > sx + 58 && rnd() < 0.05) type = pick(['oak1', 'oak2']);
      else if (zone === 'town' && d > 9 && rnd() < 0.025 && Math.abs(x - (sx + 30)) > 14 && !(x < sx && Math.abs(z - PIPE_Z) < 24)) type = pick(['oak1', 'oak3']);
      if (!type || blocked(x, z, 22)) continue;
      const big = type.startsWith('pine') ? 1.5 + rnd() * 1.1 : 1.1 + rnd() * 0.6;
      put(type, { x, z, y: groundY(x, z) - 0.2, rot: rnd() * 6.28, height: type.startsWith('pine') ? 10 + rnd() * 6 : 9 + rnd() * 5 });
    }

    // Ground cover near the stream and in natural areas
    for (let i = 0; i < 7000; i++) {
      const z = -255 + rnd() * 510;
      const sx = streamX(z);
      const side = rnd() < 0.5 ? -1 : 1;
      const d = 4.6 + Math.abs(rnd() * rnd()) * 70;
      const x = sx + side * d;
      const zone = zoneAt(z);
      if (zone === 'town' && Math.abs(x - (sx + 30)) < 6) continue;
      if (zone === 'farm' && x < sx - 10) continue; // crops there
      if (blocked(x, z, 3)) continue;
      const natural = zone === 'forest' || zone === 'buffer';
      const r = rnd() * (natural ? 1 : 0.62); // farm and town get grass only
      if (r < 0.55) put(pick(['grass1', 'grass2', 'grass3']), { x, z, rot: rnd() * 6.28, height: 0.3 + rnd() * 0.35 });
      else if (r < 0.65 && natural) put(pick(['flower1', 'flower2', 'flower3']), { x, z, rot: rnd() * 6.28, height: 0.35 + rnd() * 0.3 });
      else if (r < 0.78 && natural && !blocked(x, z, 13)) put(pick(['bush1', 'bush3', 'berries', 'plant1', 'plant2']), { x, z, rot: rnd() * 6.28, height: 0.6 + rnd() * 0.7 });
      else if (r < 0.8 && natural) { const k = pick(['stump', 'deadtree']); put(k, { x, z, rot: rnd() * 6.28, height: k === 'stump' ? 0.5 + rnd() * 0.3 : 4 + rnd() * 2 }); }
    }

    // Rocks along the banks and riffles in the stream
    for (let i = 0; i < 1100; i++) {
      const z = -258 + rnd() * 516;
      const sx = streamX(z);
      const inStream = rnd() < 0.3;
      const x = sx + (rnd() < 0.5 ? -1 : 1) * (inStream ? rnd() * 3.6 : 3.4 + rnd() * 3);
      if (zoneAt(z) === 'farm' && inStream && rnd() < 0.5) continue; // silty farm reach has fewer rocks
      const y = Math.max(groundY(x, z), waterY(z) - 0.75) - 0.15;
      put(pick(['stone1', 'stone2', 'stone3', 'stone4', 'stone5']), { x, z, y, rot: rnd() * 6.28, scale: inStream ? 0.2 + rnd() * 0.3 : 0.25 + rnd() * 0.55 });
    }

    for (const [key, list] of Object.entries(bag)) {
      if (key.startsWith('pine')) this.addInstances(key, list, { near: 70, lod: 'pine', collide: 0.04 });
      else if (key.startsWith('oak')) this.addInstances(key, list, { near: 70, lod: 'oak', collide: 0.04 });
      else this.addInstances(key, list, { near: key.startsWith('stone') ? 60 : 45, collide: /stump|deadtree/.test(key) ? 0.12 : 0 });
    }
  }

  buildFarm() {
    // Barn and silo (simple shapes keep the classic red-barn look)
    const bz = -70, bx = streamX(bz) + 48;
    const box = (w, h, d, color, x, z) => {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ color, roughness: 0.9 }));
      m.position.set(x, groundY(x, z) + h / 2, z);
      this.scene.add(m);
    };
    box(12, 7, 18, '#a8322d', bx, bz);
    const roof = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 9.5, 4, 4, 1), new THREE.MeshStandardMaterial({ color: '#4a4a4a', roughness: 0.8 }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(0.95, 1, 1.4);
    roof.position.set(bx, groundY(bx, bz) + 9, bz);
    this.scene.add(roof);
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 14, 18), new THREE.MeshStandardMaterial({ color: '#c9c9c4', roughness: 0.6, metalness: 0.2 }));
    silo.position.set(bx + 10, groundY(bx + 10, bz - 4) + 7, bz - 4);
    this.colliders.addBox(bx, bz, 6, 9);
    this.colliders.addCircle(bx + 10, bz - 4, 2.6);
    this.scene.add(silo);

    // Crop fields planted right up to the stream bank (no buffer: a nonpoint source!)
    const rnd = mulberry32(55);
    const corn = [], wheat = [];
    for (let z = -92; z < -4; z += 1.6) {
      const sx = streamX(z);
      for (let x = sx - 11; x > sx - 62; x -= 3) {
        const p = { x: x + (rnd() - 0.5) * 0.4, z: z + (rnd() - 0.5) * 0.4, rot: rnd() * 6.28, scale: 1.6 + rnd() * 0.5 };
        (z < -48 ? corn : wheat).push(p);
      }
    }
    this.addInstances('corn', corn.map((p) => ({ ...p, scale: p.scale * 1.15 })));
    this.addInstances('wheat', wheat);

    // Grazing cattle, some standing in the stream
    const cowSrc = this.models.cow;
    const clips = cowSrc.animations;
    const clip = (name) => clips.find((a) => a.name.endsWith(name));
    for (let i = 0; i < 9; i++) {
      const z = -88 + rnd() * 70;
      const x = streamX(z) + (i < 3 ? 1.5 + rnd() * 2 : 9 + rnd() * 28);
      const cow = cloneSkinned(cowSrc.scene);
      cow.scale.setScalar(0.36);
      cow.position.set(x, Math.max(groundY(x, z), waterY(z) - 0.6), z);
      this.colliders.addCircle(x, z, 0.9);
      cow.rotation.y = rnd() * Math.PI * 2;
      this.scene.add(cow);
      const mixer = new THREE.AnimationMixer(cow);
      const action = mixer.clipAction(clip(i % 3 === 0 ? 'Idle' : 'Eating') || clips[0]);
      action.time = rnd() * 3;
      action.play();
      this.mixers.push(mixer);
    }
  }

  buildTown(mystery) {
    const rnd = mulberry32(33);
    const types = ['bA', 'bB', 'bC', 'bD', 'bE', 'bF', 'bG', 'bH'];
    for (let z = 12; z <= 94; z += 12) {
      const rx = streamX(z) + 30;
      for (const side of [-1, 1]) {
        if (rnd() < 0.12) continue;
        if (side < 0 && Math.abs(z - 45) < 20) continue; // keep open ground around the Site 3 station
        const x = rx + side * 11;
        this.placeModel(types[Math.floor(rnd() * types.length)], x, z, { scale: 5.2, rot: side > 0 ? -Math.PI / 2 : Math.PI / 2 });
        this.colliders.addBox(x, z, 4.8, 4.8);
      }
    }
    for (let z = 8; z <= 96; z += 16) {
      const rx = streamX(z) + 30;
      this.placeModel('lamp', rx + 4.2, z, { scale: 5, rot: Math.PI });
      this.placeModel('lamp', rx - 4.2, z + 8, { scale: 5 });
      this.colliders.addCircle(rx + 4.2, z, 0.25); this.colliders.addCircle(rx - 4.2, z + 8, 0.25);
    }
    const cars = ['carA', 'carB', 'carC', 'carD'];
    for (let i = 0; i < 7; i++) {
      const z = 14 + rnd() * 78;
      const rx = streamX(z) + 30;
      const side = rnd() < 0.5 ? -1 : 1;
      this.placeModel(cars[i % cars.length], rx + side * 2.2, z, { scale: 4.3, rot: side > 0 ? 0 : Math.PI, y: groundY(rx, z) + 0.25 });
      this.colliders.addBox(rx + side * 2.2, z, 0.95, 2.05);
    }
    this.placeModel('bench', streamX(60) + 12, 60, { scale: 4, rot: -Math.PI / 2 });

    // The facility and its outfall pipe on the far bank
    const fz = PIPE_Z, fx = streamX(fz) - 30;
    const mat = (color, metal = 0.2) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: metal });
    const building = new THREE.Mesh(new THREE.BoxGeometry(16, 6, 12), mat('#9ea7ad'));
    building.position.set(fx, groundY(fx, fz) + 3, fz);
    this.colliders.addBox(fx, fz, 8, 6);
    this.scene.add(building);
    for (const [ox, oz] of [[-4, 12], [6, 12]]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3, 24), mat('#b9c2c7', 0.4));
      tank.position.set(fx + ox, groundY(fx + ox, fz + oz) + 1.5, fz + oz);
      this.colliders.addCircle(fx + ox, fz + oz, 4);
      this.scene.add(tank);
    }
    const sx = streamX(fz);
    const x0 = fx + 8, x1 = sx - 3.0, py = waterY(fz) + 0.9;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, x1 - x0, 16), mat('#7d8387', 0.5));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set((x0 + x1) / 2, py, fz);
    this.scene.add(pipe);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.7), new THREE.MeshBasicMaterial({ color: '#d7e3e8', transparent: true, opacity: 0.55 }));
    spout.position.set(x1 + 0.4, py - 0.45, fz);
    this.scene.add(spout);
    const sign = makeLabel(mystery ? ['Facility', 'No sign posted'] : ['Riverton Wastewater', 'Treatment Plant'], { accent: '#607d8b', scale: 0.9 });
    sign.position.set(fx, groundY(fx, fz) + 9.5, fz);
    this.scene.add(sign);
  }

  buildSites() {
    this.beacons = {};
    const postMat = new THREE.MeshStandardMaterial({ color: '#6d5236', roughness: 0.9 });
    for (const s of SITES) {
      const p = SITE_POS.find((q) => q.id === s.id);
      const gy = groundY(p.x, p.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), postMat);
      post.position.set(p.x, gy + 1.2, p.z);
      this.colliders.addCircle(p.x, p.z, 0.2);
      this.scene.add(post);
      const label = makeLabel([`SITE ${s.id}`, s.landUse]);
      label.position.set(p.x, gy + 3.6, p.z);
      this.scene.add(label);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.set(p.x, gy + 20, p.z);
      this.scene.add(beacon);
      this.beacons[s.id] = beacon;
      // Field kit at the station: bucket and sorting tray
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 14), new THREE.MeshStandardMaterial({ color: '#f5f5f5', roughness: 0.5 }));
      bucket.position.set(p.x + 1.2, gy + 0.3, p.z + 0.6);
      const tray = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.12, 0.6), new THREE.MeshStandardMaterial({ color: '#ffffff', roughness: 0.4 }));
      tray.position.set(p.x + 1.1, gy + 0.06, p.z - 0.6);
      this.scene.add(bucket, tray);
    }
  }

  buildClouds() {
    const rnd = mulberry32(12);
    this.clouds = [];
    for (let i = 0; i < 14; i++) {
      const o = this.models[['cloud1', 'cloud2', 'cloud3'][i % 3]].scene.clone();
      o.scale.setScalar(4 + rnd() * 5);
      o.position.set(-220 + rnd() * 440, 70 + rnd() * 35, -260 + rnd() * 520);
      o.rotation.y = rnd() * 6.28;
      this.scene.add(o);
      this.clouds.push(o);
    }
  }

  setSiteDone(id, done) {
    const b = this.beacons?.[id];
    if (b) b.material.color.set(done ? '#3cc46a' : '#ffcc33');
  }

  // ---------- input ----------

  setupInput(joystick) {
    const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
    const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };
    window.addEventListener('keydown', (e) => { if (!isTyping(e)) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const el = this.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!this.inputEnabled) return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, touch: e.pointerType === 'touch' };
      capture(el, e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.look || this.look.id !== e.pointerId || !this.inputEnabled) return;
      const k = this.look.touch ? 0.0065 : 0.0045;
      this.camYaw -= (e.clientX - this.look.x) * k;
      this.camPitch = Math.max(-0.15, Math.min(1.1, this.camPitch + (e.clientY - this.look.y) * k));
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    const endLook = (e) => { if (this.look && this.look.id === e.pointerId) this.look = null; };
    el.addEventListener('pointerup', endLook);
    el.addEventListener('pointercancel', endLook);
    el.addEventListener('wheel', (e) => { this.camDist = Math.max(2.5, Math.min(12, this.camDist + e.deltaY * 0.005)); }, { passive: true });

    if (joystick) {
      const knob = joystick.querySelector('.knob');
      let id = null;
      const set = (e) => {
        const r = joystick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2 - 10, len = Math.hypot(dx, dy);
        if (len > max) { dx *= max / len; dy *= max / len; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy = { x: dx / max, y: dy / max };
      };
      joystick.addEventListener('pointerdown', (e) => { id = e.pointerId; capture(joystick, id); set(e); e.preventDefault(); });
      joystick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; this.joy = { x: 0, y: 0 }; knob.style.transform = ''; };
      joystick.addEventListener('pointerup', end);
      joystick.addEventListener('pointercancel', end);
    }
  }

  setInputEnabled(on) {
    this.inputEnabled = on;
    if (!on) { this.keys.clear(); this.look = null; }
  }

  // ---------- per-frame ----------

  update(dt) {
    const t = performance.now() / 1000;
    let f = 0, s = 0, turn = 0;
    if (this.inputEnabled) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
      if (k.has('KeyD')) s += 1;
      if (k.has('KeyA')) s -= 1;
      if (k.has('ArrowLeft')) turn += 1;
      if (k.has('ArrowRight')) turn -= 1;
      f -= this.joy.y; s += this.joy.x;
    }
    this.camYaw += turn * 1.8 * dt;
    let len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; len = 1; }
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    const wading = waterY(this.player.z) - groundY(this.player.x, this.player.z) > 0.15;
    const targetSpeed = len * (running ? RUN : WALK) * (wading ? 0.55 : 1);
    const pl = this.player;
    pl.speed += (targetSpeed - pl.speed) * Math.min(1, dt * (targetSpeed > pl.speed ? 5 : 8));

    // Move relative to where the camera looks; the character turns to face its path.
    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    const mx = -sin * f + cos * s, mz = -cos * f - sin * s;
    if (len > 0.05) {
      const want = Math.atan2(mx, mz);
      let diff = want - pl.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = Math.sign(diff) * Math.min(Math.abs(diff), (6 + 4 * Math.abs(diff)) * dt);
      pl.facing += step;
      this.turnRate = dt > 0 ? step / dt : 0;
      const ml = Math.hypot(mx, mz);
      const nx = pl.x + (mx / ml) * pl.speed * dt, nz = pl.z + (mz / ml) * pl.speed * dt;
      const rise = groundY(nx, nz) - groundY(pl.x, pl.z), run2d = Math.hypot(nx - pl.x, nz - pl.z);
      if (run2d < 1e-6 || rise / run2d < 0.85) { pl.x = nx; pl.z = nz; } // too steep (about 40°) to climb
    } else this.turnRate = 0;
    if (this.colliders.resolve(pl, 0.35)) pl.speed *= 0.92;
    pl.z = Math.max(-235, Math.min(235, pl.z));
    const sx = streamX(pl.z);
    pl.x = Math.max(sx - 160, Math.min(sx + 160, pl.x));

    const floorY = Math.max(groundY(pl.x, pl.z), waterY(pl.z) - 0.6);
    pl.y = pl.y === undefined ? floorY : pl.y + (floorY - pl.y) * Math.min(1, dt * 18);
    const footY = pl.y;
    const inWater = waterY(pl.z) - groundY(pl.x, pl.z) > 0.15;
    const bob = this.walker.update(dt, pl.speed * (inWater ? 0.85 : 1), t, { turnRate: this.turnRate });
    this.character.position.set(pl.x, footY + bob, pl.z);
    this.character.rotation.y = pl.facing;

    // Third-person camera behind and above the student; it moves in when a tree is in the way.
    const target = new THREE.Vector3(pl.x, footY + 1.45, pl.z);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dir = new THREE.Vector3(sin * cp, sp, cos * cp);
    if (this.frame % 3 === 0 || this.snapCamera) this.blockedDist = this.treeBetween(target, dir, this.camDist);
    const dist = Math.min(this.camDist, this.blockedDist ?? Infinity);
    const want = target.clone().addScaledVector(dir, dist);
    want.y = Math.max(want.y, groundY(want.x, want.z) + 0.6, waterY(want.z) + 0.4);
    if (this.snapCamera) { this.camPos.copy(want); this.snapCamera = false; }
    else this.camPos.lerp(want, Math.min(1, dt * 8));
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(target);

    // Water ripples drift downstream; bubbles show the current.
    this.waterNormals.offset.y -= dt * 0.35;
    const arr = this.particles.geometry.attributes.position.array;
    for (let i = 0; i < this.pz.length; i++) {
      this.pz[i] += this.flowAt(this.pz[i]) * 2.2 * dt;
      if (this.pz[i] > 260) this.pz[i] = -260;
      const z = this.pz[i];
      arr[i * 3] = streamX(z) + this.poff[i];
      arr[i * 3 + 1] = waterY(z) + 0.04;
      arr[i * 3 + 2] = z;
    }
    this.particles.geometry.attributes.position.needsUpdate = true;

    for (const m of this.mixers) m.update(dt);
    for (const c of this.clouds) { c.position.z += dt * 1.2; if (c.position.z > 280) c.position.z = -280; }
    for (const b of Object.values(this.beacons)) b.material.opacity = 0.2 + 0.1 * Math.sin(t * 2);

    let near = null;
    for (const p of SITE_POS) if (Math.hypot(p.x - pl.x, p.z - pl.z) < NEAR_DIST) near = p.id;
    if (near !== this.near) { this.near = near; this.onNear(near); }

    this.frame++;
    if (this.frame % 5 === 0 || this.snapLOD) { this.updateLOD(); this.snapLOD = false; }
    if (this.minimap && this.frame % 6 === 0) this.drawMinimap();
  }

  drawMinimap() {
    const cv = this.minimap, ctx = cv.getContext('2d');
    const W = cv.width, H = cv.height, sc = (H - 20) / 480;
    const mx = (x) => W / 2 + x * sc, mz = (z) => 10 + (z + 240) * sc;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath(); ctx.roundRect(0, 0, W, H, 10); ctx.fill();
    const bands = [[-240, -95, '#cfe3c6'], [-95, 0, '#efe6b8'], [0, 100, '#dedede'], [100, 240, '#cfe3c6']];
    for (const [a, b, c] of bands) { ctx.fillStyle = c; ctx.fillRect(4, mz(a), W - 8, mz(b) - mz(a)); }
    ctx.strokeStyle = '#2f7d96'; ctx.lineWidth = 3; ctx.beginPath();
    for (let z = -240; z <= 240; z += 6) { const x = mx(streamX(z)), y = mz(z); z === -240 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.stroke();
    for (const p of SITE_POS) {
      const st = this.siteStatus(p.id);
      ctx.fillStyle = st === 'done' ? '#2e9e57' : st === 'visited' ? '#2b6cb0' : '#f0b429';
      ctx.beginPath(); ctx.arc(mx(p.x), mz(p.z), 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = 'bold 10px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(p.id), mx(p.x), mz(p.z) + 0.5);
    }
    const pl = this.player;
    ctx.save(); ctx.translate(mx(pl.x), mz(pl.z)); ctx.rotate(-pl.facing + Math.PI);
    ctx.fillStyle = '#d64545'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h || !this.renderer) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  getPose() {
    const pl = this.player;
    return pl ? { x: pl.x, z: pl.z, yaw: this.camYaw, pitch: this.camPitch, facing: pl.facing } : null;
  }

  setPose(p) {
    if (!p || !this.player) return;
    this.player.x = p.x; this.player.z = p.z; this.player.y = undefined;
    this.camYaw = p.yaw ?? this.camYaw;
    this.camPitch = Math.max(-0.15, Math.min(1.1, p.facing === undefined ? 0.32 : p.pitch)); // old saves stored first-person pitch
    this.player.facing = p.facing ?? this.camYaw + Math.PI;
    this.snapCamera = true;
    this.snapLOD = true;
  }

  teleport(siteId) {
    const p = SITE_POS.find((q) => q.id === siteId);
    this.player.x = p.x + 4; this.player.z = p.z - 9;
    this.player.y = undefined; // snap to the ground at the new spot
    const dx = p.x - this.player.x, dz = p.z - this.player.z;
    this.camYaw = Math.atan2(-dx, -dz);
    this.player.facing = Math.atan2(dx, dz);
    this.camPitch = 0.32;
    this.snapCamera = true;
    this.snapLOD = true;
  }
}
