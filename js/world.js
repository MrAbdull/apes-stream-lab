// The explorable 3D field site (Three.js).
// The landscape is the same for everyone; the WATER COLOR at each site comes from
// that student's/group's own chemistry, so the world visually matches their data.
// Controls: WASD / arrow keys + mouse drag on laptops, joystick + drag on iPads.

import * as THREE from 'three';
import { SITES } from './model.js';
import { mulberry32 } from './rng.js';

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
const NEAR_DIST = 10;

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
  ctx.font = 'bold 44px system-ui, sans-serif';
  const w = Math.max(...lines.map((l, i) => { ctx.font = `${i ? '500 32px' : 'bold 44px'} system-ui, sans-serif`; return ctx.measureText(l).width; })) + pad * 2;
  const h = 44 + (lines.length - 1) * 40 + pad * 2;
  canvas.width = Math.ceil(w); canvas.height = Math.ceil(h);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, canvas.width, canvas.height, 18); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 10, canvas.height);
  lines.forEach((l, i) => {
    ctx.font = `${i ? '500 32px' : 'bold 44px'} system-ui, sans-serif`;
    ctx.fillStyle = fg;
    ctx.fillText(l, pad, pad + 40 + i * 40 - (i ? 4 : 0));
  });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const s = 0.012 * scale;
  sprite.scale.set(canvas.width * s, canvas.height * s, 1);
  return sprite;
}

export class StreamWorld {
  constructor(container, { chems, mystery, onNear, minimap, joystick, siteStatus }) {
    this.container = container;
    this.onNear = onNear || (() => {});
    this.minimap = minimap;
    this.siteStatus = siteStatus || (() => 'new');
    this.inputEnabled = true;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.near = null;
    this.frame = 0;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color('#bfe0f2');
    scene.fog = new THREE.Fog('#bfe0f2', 70, 330);
    this.scene = scene;

    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 600);
    this.camera.rotation.order = 'YXZ';

    scene.add(new THREE.HemisphereLight('#e4f3ff', '#4a5a3a', 1.6));
    const sun = new THREE.DirectionalLight('#fff4e0', 1.6);
    sun.position.set(80, 120, 40);
    scene.add(sun);

    this.waterKeys = [
      [-160, chems[0]], [-95, chems[0]], [-45, chems[1]], [PIPE_Z - 2, chems[1]],
      [PIPE_Z + 8, chems[2]], [160, chems[3]],
    ].map(([z, c]) => [z, waterColorFromChem(c)]);
    this.flowSpeed = chems.map((c) => 10 / c.flow);

    this.buildTerrain();
    this.buildWater();
    this.buildTrees();
    this.buildFarm();
    this.buildTown(mystery);
    this.buildSites();
    this.buildParticles();

    this.pos = { x: streamX(-205) + 6, z: -205 };
    this.yaw = Math.PI;
    this.pitch = -0.08;
    this.eyeY = groundY(this.pos.x, this.pos.z) + 1.7;

    this.setupInput(joystick);
    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);

    this.clock = new THREE.Clock();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      this.update(Math.min(this.clock.getDelta(), 0.1)); // cap avoids big jumps after a pause, but keeps slow devices moving
      renderer.render(scene, this.camera);
    };
    loop();
  }

  // ---------- scene building ----------

  terrainColor(x, z, c, P) {
    const sx = streamX(z);
    const d = Math.abs(x - sx);
    const zone = zoneAt(z);
    const n = Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.5 + 0.5;
    if (d < 5.2) { c.copy(zone === 'farm' ? P.sand : P.mud); return; }
    switch (zone) {
      case 'forest': c.copy(P.forest).lerp(P.forest2, n); break;
      case 'buffer': c.copy(P.buffer).lerp(P.forest2, n * 0.6); break;
      case 'farm':
        if (d < 9) c.copy(P.sand).lerp(P.pasture, (d - 5.2) / 3.8);
        else if (x > sx && d < 55) c.copy(P.pasture).lerp(P.crop2, n * 0.3);
        else c.copy(Math.floor((x + 400) / 12) % 2 ? P.crop : P.crop2);
        break;
      default: {
        if (Math.abs(x - (sx + 30)) < 3.2) c.copy(P.road);
        else c.copy(P.lawn).lerp(P.pasture, n * 0.4);
      }
    }
  }

  buildTerrain() {
    const P = {
      forest: new THREE.Color('#41703a'), forest2: new THREE.Color('#2f5a2a'), mud: new THREE.Color('#6b5638'),
      sand: new THREE.Color('#8c7550'), crop: new THREE.Color('#c8b455'), crop2: new THREE.Color('#87a84b'),
      pasture: new THREE.Color('#90b25a'), lawn: new THREE.Color('#87a56a'), road: new THREE.Color('#5a5a5a'),
      buffer: new THREE.Color('#4a7a3c'),
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
    this.scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true })));
  }

  waterColorAt(z) {
    const k = this.waterKeys;
    if (z <= k[0][0]) return k[0][1].clone();
    for (let i = 0; i < k.length - 1; i++) {
      if (z <= k[i + 1][0]) {
        const t = (z - k[i][0]) / (k[i + 1][0] - k[i][0]);
        return k[i][1].clone().lerp(k[i + 1][1], t);
      }
    }
    return k[k.length - 1][1].clone();
  }

  buildWater() {
    const pos = [], col = [], idx = [];
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
      if (n > 0) { const a = (n - 1) * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      n++;
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, transparent: true, opacity: 0.86, roughness: 0.15, metalness: 0.05, side: THREE.DoubleSide });
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
    this.particles = new THREE.Points(g, new THREE.PointsMaterial({ color: '#ffffff', size: 0.16, transparent: true, opacity: 0.75, depthWrite: false }));
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

  buildTrees() {
    const rnd = mulberry32(7);
    const spots = [];
    for (let i = 0; i < 6000 && spots.length < 1300; i++) {
      const z = -255 + rnd() * 510;
      const sx = streamX(z);
      const x = sx + (rnd() * 2 - 1) * 200;
      const d = Math.abs(x - sx);
      const zone = zoneAt(z);
      let ok = false;
      if (zone === 'forest') ok = d > 7 && rnd() < 0.85;
      else if (zone === 'buffer') ok = d > 6.5 && (d < 35 ? rnd() < 0.95 : rnd() < 0.35);
      else if (zone === 'farm') ok = x > sx + 55 && rnd() < 0.06;
      else ok = d > 8 && rnd() < 0.05 && Math.abs(x - (sx + 30)) > 6 && !(x < sx && Math.abs(z - PIPE_Z) < 22);
      // Keep trees off the site stations, the travel arrival points and the start.
      const clear = !this.nearAnySite(x, z, 15) && Math.hypot(x - (streamX(-205) + 6), z + 205) > 8;
      if (ok && clear) spots.push({ x, z, s: 0.8 + rnd() * 0.7, hue: rnd() });
    }
    const trunkG = new THREE.CylinderGeometry(0.22, 0.32, 2.6, 6); trunkG.translate(0, 1.3, 0);
    const crownG = new THREE.ConeGeometry(2.1, 5.5, 7); crownG.translate(0, 5.3, 0);
    const trunks = new THREE.InstancedMesh(trunkG, new THREE.MeshLambertMaterial({ color: '#5b4330' }), spots.length);
    const crowns = new THREE.InstancedMesh(crownG, new THREE.MeshLambertMaterial({ color: '#ffffff' }), spots.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
    const dark = new THREE.Color('#25502a'), light = new THREE.Color('#4f8a3e'), tmp = new THREE.Color();
    spots.forEach((t, i) => {
      v.set(t.x, groundY(t.x, t.z) - 0.2, t.z); sc.set(t.s, t.s, t.s);
      m.compose(v, q, sc);
      trunks.setMatrixAt(i, m); crowns.setMatrixAt(i, m);
      crowns.setColorAt(i, tmp.copy(dark).lerp(light, t.hue));
    });
    this.scene.add(trunks, crowns);
  }

  placeBox(w, h, d, color, x, z, yOff = 0) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshLambertMaterial({ color }));
    mesh.position.set(x, groundY(x, z) + h / 2 + yOff, z);
    this.scene.add(mesh);
    return mesh;
  }

  addRoof(x, z, w, d, baseH, color, roofH = 2.6) {
    const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.hypot(w, d) / 2 + 0.3, roofH, 4), new THREE.MeshLambertMaterial({ color }));
    roof.rotation.y = Math.PI / 4;
    roof.scale.set(w / Math.max(w, d), 1, d / Math.max(w, d));
    roof.position.set(x, groundY(x, z) + baseH + roofH / 2, z);
    this.scene.add(roof);
  }

  buildFarm() {
    const bz = -70, bx = streamX(bz) + 48;
    this.placeBox(12, 7, 18, '#a8322d', bx, bz);
    this.addRoof(bx, bz, 12, 18, 7, '#4a4a4a', 4);
    const silo = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 14, 14), new THREE.MeshLambertMaterial({ color: '#c9c9c4' }));
    silo.position.set(bx + 10, groundY(bx + 10, bz - 4) + 7, bz - 4);
    this.scene.add(silo);

    const rnd = mulberry32(21);
    const bodyG = new THREE.BoxGeometry(1.0, 1.0, 2.1), headG = new THREE.BoxGeometry(0.55, 0.55, 0.6), legG = new THREE.BoxGeometry(0.18, 0.8, 0.18);
    for (let i = 0; i < 9; i++) {
      const z = -88 + rnd() * 70;
      const x = streamX(z) + (i < 3 ? 2.5 + rnd() * 2 : 9 + rnd() * 25); // a few cows stand in the stream
      const mat = new THREE.MeshLambertMaterial({ color: rnd() < 0.5 ? '#f2efe8' : '#6b4a33' });
      const cow = new THREE.Group();
      const body = new THREE.Mesh(bodyG, mat); body.position.y = 1.3;
      const head = new THREE.Mesh(headG, mat); head.position.set(0, 1.55, 1.25);
      cow.add(body, head);
      for (const [lx, lz] of [[-0.35, -0.8], [0.35, -0.8], [-0.35, 0.8], [0.35, 0.8]]) {
        const leg = new THREE.Mesh(legG, mat); leg.position.set(lx, 0.4, lz); cow.add(leg);
      }
      cow.position.set(x, Math.max(groundY(x, z), waterY(z) - 0.5), z);
      cow.rotation.y = rnd() * Math.PI * 2;
      this.scene.add(cow);
    }
  }

  buildTown(mystery) {
    const colors = ['#d9c8a9', '#b7c9d6', '#e3d3c3', '#c8b6a6', '#a9b8a0', '#e6e0cf'];
    const roofs = ['#6d3b2f', '#4a4f57', '#7a5a3a'];
    const rnd = mulberry32(33);
    for (let z = 12; z <= 92; z += 11) {
      const rx = streamX(z) + 30;
      for (const side of [-1, 1]) {
        if (rnd() < 0.15) continue;
        const x = rx + side * 9, w = 6 + rnd() * 2, d = 7 + rnd() * 2, h = 3.5 + rnd();
        this.placeBox(w, h, d, colors[Math.floor(rnd() * colors.length)], x, z);
        this.addRoof(x, z, w, d, h, roofs[Math.floor(rnd() * roofs.length)]);
      }
    }

    // The facility and outfall pipe on the far bank.
    const fz = PIPE_Z, fx = streamX(fz) - 30;
    this.placeBox(16, 6, 12, '#9ea7ad', fx, fz);
    for (const [ox, oz] of [[-4, 12], [6, 12]]) {
      const tank = new THREE.Mesh(new THREE.CylinderGeometry(4, 4, 3, 20), new THREE.MeshLambertMaterial({ color: '#b9c2c7' }));
      tank.position.set(fx + ox, groundY(fx + ox, fz + oz) + 1.5, fz + oz);
      this.scene.add(tank);
    }
    const sx = streamX(fz);
    const x0 = fx + 8, x1 = sx - 3.0, py = waterY(fz) + 0.9;
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, x1 - x0, 14), new THREE.MeshLambertMaterial({ color: '#8a8f93' }));
    pipe.rotation.z = Math.PI / 2;
    pipe.position.set((x0 + x1) / 2, py, fz);
    this.scene.add(pipe);
    const spout = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.9, 0.7), new THREE.MeshBasicMaterial({ color: '#d7e3e8', transparent: true, opacity: 0.6 }));
    spout.position.set(x1 + 0.4, py - 0.45, fz);
    this.scene.add(spout);
    const sign = makeLabel(mystery ? ['Facility', 'No sign posted'] : ['Riverton Wastewater', 'Treatment Plant'], { accent: '#607d8b', scale: 0.9 });
    sign.position.set(fx, groundY(fx, fz) + 9.5, fz);
    this.scene.add(sign);
  }

  buildSites() {
    this.beacons = {};
    for (const s of SITES) {
      const p = SITE_POS.find((q) => q.id === s.id);
      const gy = groundY(p.x, p.z);
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 2.4, 8), new THREE.MeshLambertMaterial({ color: '#6d5236' }));
      post.position.set(p.x, gy + 1.2, p.z);
      this.scene.add(post);
      const label = makeLabel([`SITE ${s.id}`, s.landUse]);
      label.position.set(p.x, gy + 3.6, p.z);
      this.scene.add(label);
      const beacon = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 40, 16, 1, true), new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.28, depthWrite: false, side: THREE.DoubleSide }));
      beacon.position.set(p.x, gy + 20, p.z);
      this.scene.add(beacon);
      this.beacons[s.id] = beacon;
      // A bucket and net at the station.
      const bucket = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.28, 0.6, 12), new THREE.MeshLambertMaterial({ color: '#f5f5f5' }));
      bucket.position.set(p.x + 1.2, gy + 0.3, p.z + 0.6);
      this.scene.add(bucket);
    }
  }

  setSiteDone(id, done) {
    const b = this.beacons[id];
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
      this.yaw -= (e.clientX - this.look.x) * k;
      this.pitch = Math.max(-1.2, Math.min(1.2, this.pitch - (e.clientY - this.look.y) * k));
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    const endLook = (e) => { if (this.look && this.look.id === e.pointerId) this.look = null; };
    el.addEventListener('pointerup', endLook);
    el.addEventListener('pointercancel', endLook);

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
    this.yaw += turn * 1.8 * dt;
    const len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; }
    const speed = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') ? 15 : 8;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    this.pos.x += (-sin * f + cos * s) * speed * dt;
    this.pos.z += (-cos * f - sin * s) * speed * dt;
    this.pos.z = Math.max(-235, Math.min(235, this.pos.z));
    const sx = streamX(this.pos.z);
    this.pos.x = Math.max(sx - 160, Math.min(sx + 160, this.pos.x));

    const target = Math.max(groundY(this.pos.x, this.pos.z), waterY(this.pos.z) - 0.3) + 1.7;
    this.eyeY += (target - this.eyeY) * Math.min(1, dt * 10);
    this.camera.position.set(this.pos.x, this.eyeY, this.pos.z);
    this.camera.rotation.set(this.pitch, this.yaw, 0);

    // Drifting bubbles show the current (faster where the student measured faster flow).
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

    const t = performance.now() / 1000;
    for (const b of Object.values(this.beacons)) b.material.opacity = 0.2 + 0.1 * Math.sin(t * 2);

    let near = null;
    for (const p of SITE_POS) if (Math.hypot(p.x - this.pos.x, p.z - this.pos.z) < NEAR_DIST) near = p.id;
    if (near !== this.near) { this.near = near; this.onNear(near); }

    if (this.minimap && this.frame++ % 6 === 0) this.drawMinimap();
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
    const px = mx(this.pos.x), pz = mz(this.pos.z);
    ctx.save(); ctx.translate(px, pz); ctx.rotate(-this.yaw + Math.PI);
    ctx.fillStyle = '#d64545'; ctx.beginPath(); ctx.moveTo(0, -8); ctx.lineTo(5.5, 6); ctx.lineTo(-5.5, 6); ctx.closePath(); ctx.fill();
    ctx.restore();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  getPose() {
    return { x: this.pos.x, z: this.pos.z, yaw: this.yaw, pitch: this.pitch };
  }

  setPose(p) {
    if (!p) return;
    this.pos = { x: p.x, z: p.z };
    this.yaw = p.yaw; this.pitch = p.pitch;
    this.eyeY = groundY(p.x, p.z) + 1.7;
  }

  teleport(siteId) {
    const p = SITE_POS.find((q) => q.id === siteId);
    this.pos = { x: p.x + 4, z: p.z - 9 };
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    this.yaw = Math.atan2(-dx, -dz);
    this.pitch = -0.1;
    this.eyeY = groundY(this.pos.x, this.pos.z) + 1.7;
  }
}
