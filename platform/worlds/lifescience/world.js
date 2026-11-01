// Life Science Lab: an indoor experiment room in the style of Maroon's lab (stations marked
// by floor rings; whiteboard and ceiling lights from Maroon's licensed 3D models), running
// biology simulations ported from ScienceLab 3D with their science and timing fixed.

import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { SKIN_TONES } from '../../../js/avatars.js';
import { mulberry32 } from '../../../js/rng.js';
import { esc } from '../../engine/hud.js';
import { assetUrl } from '../../engine/assets.js';
import { foodWebRun, FOODWEB_BALANCE, selectionRun, BACKGROUNDS, bubbleTrial, lightIntensity } from './sims.js';

const ROOM = { w: 32, d: 22, h: 4.4 };
const LEVELS = [ // ScienceLab 3D's trophic color scheme
  { key: 'P', name: 'Plants (producers)', color: '#22c55e', per: 3 },
  { key: 'H', name: 'Herbivores', color: '#3b82f6', per: 1 },
  { key: 'C', name: 'Carnivores', color: '#f59e0b', per: 1 },
  { key: 'A', name: 'Apex predators', color: '#ef4444', per: 1 },
];
const STATIONS = {
  foodweb: { x: -9, title: 'Food Web & Energy Flow', label: 'Food web station' },
  selection: { x: 0, title: 'Natural Selection', label: 'Natural selection station' },
  photo: { x: 9, title: 'Photosynthesis', label: 'Photosynthesis station' },
};
const BENCH_Z = -3.2;

// Small SVG line chart for station panels.
function lineChart(series, { yMax, xMax, xLabel = '', yLabel = '' }) {
  const W = 360, H = 170, L = 36, B = 26, T = 8, Rr = 8;
  const x = (v) => L + (v / xMax) * (W - L - Rr), y = (v) => T + (1 - Math.min(v, yMax) / yMax) * (H - T - B);
  let s = `<svg viewBox="0 0 ${W} ${H}" class="chart">`;
  for (let i = 0; i <= 4; i++) { const v = (yMax / 4) * i; s += `<line x1="${L}" x2="${W - Rr}" y1="${y(v)}" y2="${y(v)}" class="chart-grid"/><text x="${L - 4}" y="${y(v) + 4}" text-anchor="end" class="chart-axis">${+v.toFixed(1)}</text>`; }
  for (const se of series) {
    if (se.points.length < 2) continue;
    s += `<polyline fill="none" stroke="${se.color}" stroke-width="2.5" points="${se.points.map(([a, b]) => `${x(a).toFixed(1)},${y(b).toFixed(1)}`).join(' ')}"/>`;
  }
  s += `<text x="${(L + W) / 2}" y="${H - 4}" text-anchor="middle" class="chart-axis">${esc(xLabel)}</text>`;
  s += `<text x="10" y="${(T + H - B) / 2}" transform="rotate(-90 10 ${(T + H - B) / 2})" text-anchor="middle" class="chart-axis">${esc(yLabel)}</text>`;
  return s + '</svg>';
}

function boardTexture(lines) {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#fbfbf8'; g.fillRect(0, 0, c.width, c.height);
  g.fillStyle = '#1f4e8c'; g.font = 'bold 56px system-ui, sans-serif'; g.fillText(lines[0], 48, 90);
  g.fillStyle = '#26302a'; g.font = '38px system-ui, sans-serif';
  lines.slice(1).forEach((l, i) => g.fillText(l, 60, 170 + i * 64));
  g.strokeStyle = '#c62828'; g.lineWidth = 6; g.beginPath(); g.moveTo(48, 112); g.lineTo(600, 112); g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export async function createWorld(ctx) {
  const { stage, hud } = ctx;
  const scene = stage.scene;
  const col = ctx.colliders;
  const seed = ctx.seed;
  const state = { runs: { foodweb: [], selection: [], photo: [] } };
  scene.fog = new THREE.Fog('#dfe6ea', 40, 90);
  scene.background = new THREE.Color('#dfe6ea');

  // ---------- room ----------
  const mat = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, ...o });
  const floorTex = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#e8e4da'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#d9d3c6';
    g.fillRect(0, 0, 128, 128); g.fillRect(128, 128, 128, 128);
    g.strokeStyle = '#c8c1b2'; g.lineWidth = 2; g.strokeRect(0, 0, 256, 256);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(ROOM.w / 2, ROOM.d / 2); return t;
  })();
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.7 }));
  floor.rotation.x = -Math.PI / 2;
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.w, ROOM.d), new THREE.MeshBasicMaterial({ color: '#e9ebe8' }));
  ceiling.rotation.x = Math.PI / 2; ceiling.position.y = ROOM.h;
  scene.add(floor, ceiling);
  const wallMat = mat('#eef1ee');
  const addWall = (w, x, z, rot) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, ROOM.h), wallMat); m.position.set(x, ROOM.h / 2, z); m.rotation.y = rot; scene.add(m); };
  addWall(ROOM.w, 0, -ROOM.d / 2, 0); addWall(ROOM.w, 0, ROOM.d / 2, Math.PI); addWall(ROOM.d, -ROOM.w / 2, 0, Math.PI / 2); addWall(ROOM.d, ROOM.w / 2, 0, -Math.PI / 2);
  // Windows with daylight along the side walls, and a teal stripe like Maroon's lab
  const glow = new THREE.MeshBasicMaterial({ color: '#cfe8f6' });
  for (const side of [-1, 1]) for (let z = -7; z <= 7; z += 4.6) {
    const w = new THREE.Mesh(new THREE.PlaneGeometry(3, 1.8), glow);
    w.position.set(side * (ROOM.w / 2 - 0.02), 2.3, z); w.rotation.y = -side * Math.PI / 2; scene.add(w);
  }
  const stripe = new THREE.Mesh(new THREE.BoxGeometry(ROOM.w, 0.25, 0.02), mat('#1f8a8a'));
  stripe.position.set(0, 1.0, -ROOM.d / 2 + 0.02); scene.add(stripe);
  scene.add(new THREE.AmbientLight('#ffffff', 0.35));
  for (const x of [-9, 0, 9]) { const l = new THREE.PointLight('#fff4e6', 14, 16, 1.6); l.position.set(x, ROOM.h - 0.4, BENCH_Z + 1); scene.add(l); }

  // ---------- Maroon models (CC0 ceiling light, CC-BY 3.0 whiteboard) ----------
  const fbx = new FBXLoader();
  const fit = (obj, width) => {
    const box = new THREE.Box3().setFromObject(obj); const s = box.getSize(new THREE.Vector3());
    obj.scale.multiplyScalar(width / Math.max(s.x, s.z)); obj.updateMatrixWorld(true);
    const b2 = new THREE.Box3().setFromObject(obj); return b2;
  };
  const recolor = (obj, map, fallback) => obj.traverse((o) => {
    if (!o.isMesh) return;
    const mats = Array.isArray(o.material) ? o.material : [o.material];
    o.material = mats.map((m) => {
      const key = Object.keys(map).find((k) => (m.name || '').toLowerCase().includes(k));
      return new THREE.MeshStandardMaterial({ color: key ? map[key] : fallback, roughness: 0.5, metalness: key === 'allum' ? 0.6 : 0.05 });
    });
    if (o.material.length === 1) o.material = o.material[0];
  });
  try {
    const light = await fbx.loadAsync(assetUrl('lab/ceilinglight.fbx'));
    recolor(light, { white: '#ffffff', wood: '#c9a77c' }, '#f0f0f0');
    const b = fit(light, 1.3);
    for (const x of [-10, -3.4, 3.4, 10]) for (const z of [-6, 2]) {
      const l = light.clone(); l.position.set(x, ROOM.h - (b.max.y - b.min.y) - 0.02 - b.min.y, z); scene.add(l);
    }
  } catch (e) { console.warn('ceiling light', e); }
  try {
    const board = await fbx.loadAsync(assetUrl('lab/whiteboard.fbx'));
    recolor(board, { lavagna: '#ffffff', allum: '#b8bcc0', plastica_scura: '#333', blu: '#1f5fbf', rossa: '#c62828', feltro: '#555', pennarello: '#222' }, '#9aa0a4');
    const b = fit(board, 2.6);
    board.position.set(-4, -b.min.y, -ROOM.d / 2 + 1.6);
    scene.add(board);
    col.addBox(-4, -ROOM.d / 2 + 1.6, 1.4, 0.5);
    // Lesson notes on the board (our own text, drawn on a canvas)
    const notes = new THREE.Mesh(new THREE.PlaneGeometry(2.1, 1.05), new THREE.MeshBasicMaterial({ map: boardTexture(['Today in the lab', '1. Food webs & energy flow', '2. Natural selection', '3. Photosynthesis & light']) }));
    const bb = new THREE.Box3().setFromObject(board);
    notes.position.set(-4, bb.min.y + (bb.max.y - bb.min.y) * 0.64, bb.max.z + 0.01);
    scene.add(notes);
  } catch (e) { console.warn('whiteboard', e); }

  // ---------- benches and station markers ----------
  const top = mat('#f7f7f5', { roughness: 0.35 }), base = mat('#5f6b73');
  const stationObjs = {};
  for (const [id, s] of Object.entries(STATIONS)) {
    const g = new THREE.Group(); g.position.set(s.x, 0, BENCH_Z);
    const cab = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.86, 1.3), base); cab.position.y = 0.43;
    const t = new THREE.Mesh(new THREE.BoxGeometry(3.5, 0.06, 1.4), top); t.position.y = 0.89;
    g.add(cab, t);
    // Maroon-style circular station marker on the floor
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.75, 0.95, 48), new THREE.MeshBasicMaterial({ color: '#1f8a8a', side: THREE.DoubleSide }));
    ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.01, 2.3);
    const disc = new THREE.Mesh(new THREE.CircleGeometry(0.75, 48), new THREE.MeshBasicMaterial({ color: '#7fd1cf', transparent: true, opacity: 0.5 }));
    disc.rotation.x = -Math.PI / 2; disc.position.set(0, 0.012, 2.3);
    const label = ctx.makeLabel([s.title, 'Step on the ring to start'], { accent: '#1f8a8a', scale: 0.6 });
    label.position.set(0, 3.0, 0);
    g.add(ring, disc, label);
    scene.add(g);
    col.addBox(s.x, BENCH_Z, 1.75, 0.7);
    stationObjs[id] = { group: g, ring, disc };
  }

  // ---------- Station 1: food web terrarium ----------
  const fw = { counts: { ...FOODWEB_BALANCE }, play: null };
  {
    const g = stationObjs.foodweb.group;
    const glass = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.7, 1.0), new THREE.MeshPhysicalMaterial({ color: '#dff3ff', transparent: true, opacity: 0.18, roughness: 0.05, transmission: 0.3, side: THREE.DoubleSide }));
    glass.position.y = 0.92 + 0.35;
    const soil = new THREE.Mesh(new THREE.BoxGeometry(2.36, 0.08, 0.96), mat('#6d8f43'));
    soil.position.y = 0.96;
    g.add(glass, soil);
    const geo = { P: new THREE.ConeGeometry(0.035, 0.12, 6), H: new THREE.SphereGeometry(0.035, 10, 8), C: new THREE.SphereGeometry(0.05, 10, 8), A: new THREE.SphereGeometry(0.07, 12, 10) };
    const max = { P: 90, H: 30, C: 30, A: 8 };
    fw.mesh = {};
    fw.agents = {};
    const rnd = mulberry32(3);
    for (const L of LEVELS) {
      const im = new THREE.InstancedMesh(geo[L.key], mat(L.color, { roughness: 0.5 }), max[L.key]);
      im.count = 0; g.add(im); fw.mesh[L.key] = im;
      fw.agents[L.key] = Array.from({ length: max[L.key] }, () => ({ x: (rnd() - 0.5) * 2.2, z: (rnd() - 0.5) * 0.85, a: rnd() * 6.28 }));
    }
  }
  const fwM = new THREE.Matrix4(), fwQ = new THREE.Quaternion(), fwV = new THREE.Vector3(), fwS = new THREE.Vector3(1, 1, 1);
  function fwDraw(dt) {
    const speed = { P: 0, H: 0.12, C: 0.18, A: 0.22 };
    for (const L of LEVELS) {
      const n = Math.min(fw.agents[L.key].length, Math.round(fw.counts[{ P: 'plants', H: 'herbivores', C: 'carnivores', A: 'apex' }[L.key]] / L.per));
      const im = fw.mesh[L.key];
      im.count = n;
      for (let i = 0; i < n; i++) {
        const a = fw.agents[L.key][i];
        if (speed[L.key]) { // wander, bouncing off the glass (time-based, not frame-based)
          a.a += (Math.sin(a.x * 7 + a.z * 5 + performance.now() / 900) * 1.8) * dt;
          a.x += Math.cos(a.a) * speed[L.key] * dt; a.z += Math.sin(a.a) * speed[L.key] * dt;
          if (Math.abs(a.x) > 1.1) { a.x = Math.sign(a.x) * 1.1; a.a = Math.PI - a.a; }
          if (Math.abs(a.z) > 0.42) { a.z = Math.sign(a.z) * 0.42; a.a = -a.a; }
        }
        const y = 1.0 + (L.key === 'P' ? 0.06 : L.key === 'H' ? 0.035 : L.key === 'C' ? 0.05 : 0.07);
        fwV.set(a.x, y, a.z); fwM.compose(fwV, fwQ, fwS); im.setMatrixAt(i, fwM);
      }
      im.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- Station 2: natural selection tray ----------
  const sel = { background: 'dirt', startGreen: 50, mutation: 2, generations: 10, play: null, green: 30, N: 60 };
  {
    const g = stationObjs.selection.group;
    sel.ground = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.06, 1.0), mat(BACKGROUNDS.dirt.color));
    sel.ground.position.y = 0.95;
    const rim = new THREE.Mesh(new THREE.BoxGeometry(2.5, 0.05, 1.1), mat('#8c7a5f'));
    rim.position.y = 0.935;
    g.add(rim, sel.ground);
    const bug = new THREE.SphereGeometry(0.035, 10, 8); bug.scale(1, 0.6, 1.5);
    sel.meshG = new THREE.InstancedMesh(bug, mat('#3f8f3a', { roughness: 0.4 }), 60);
    sel.meshB = new THREE.InstancedMesh(bug, mat('#6b4a2b', { roughness: 0.4 }), 60);
    g.add(sel.meshG, sel.meshB);
    const rnd = mulberry32(11);
    sel.spots = Array.from({ length: 60 }, () => ({ x: (rnd() - 0.5) * 2.2, z: (rnd() - 0.5) * 0.85, r: rnd() * 6.28 }));
    // A bird (simple shapes) that swoops over the tray each generation
    const bird = new THREE.Group();
    const body = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 10), mat('#3b3f45')); body.scale.set(1, 0.8, 1.8);
    const wing = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.015, 0.14), mat('#2b2f34'));
    const beak = new THREE.Mesh(new THREE.ConeGeometry(0.025, 0.07, 6), mat('#e0a800')); beak.rotation.x = Math.PI / 2; beak.position.z = 0.17;
    bird.add(body, wing, beak); bird.visible = false; bird.position.y = 1.6;
    g.add(bird); sel.bird = bird; sel.wing = wing;
  }
  function selDraw(t) {
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(1, 1, 1);
    let gi = 0, bi = 0;
    for (let i = 0; i < sel.N; i++) {
      const sp = sel.spots[i];
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), sp.r);
      v.set(sp.x, 1.0, sp.z); m.compose(v, q, s);
      if (i < sel.green) sel.meshG.setMatrixAt(gi++, m); else sel.meshB.setMatrixAt(bi++, m);
    }
    sel.meshG.count = gi; sel.meshB.count = bi;
    sel.meshG.instanceMatrix.needsUpdate = sel.meshB.instanceMatrix.needsUpdate = true;
    sel.ground.material.color.set(BACKGROUNDS[sel.background].color);
    if (sel.bird.visible) { sel.wing.rotation.z = Math.sin(t * 18) * 0.5; }
  }

  // ---------- Station 3: Elodea and lamp ----------
  const ph = { distance: 20, co2: 1, temp: 25, play: null, bubbles: [] };
  {
    const g = stationObjs.photo.group;
    const beaker = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.42, 32, 1, true), new THREE.MeshPhysicalMaterial({ color: '#e6f4ff', transparent: true, opacity: 0.25, roughness: 0.05, side: THREE.DoubleSide }));
    beaker.position.set(0.4, 0.92 + 0.21, 0);
    const water = new THREE.Mesh(new THREE.CylinderGeometry(0.155, 0.155, 0.34, 32), new THREE.MeshStandardMaterial({ color: '#7cc0e8', transparent: true, opacity: 0.45 }));
    water.position.set(0.4, 0.92 + 0.17, 0);
    const plant = new THREE.Group();
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.01, 0.3, 6), mat('#2f7d32'));
    stem.position.y = 0.15; plant.add(stem);
    for (let i = 0; i < 22; i++) {
      const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.085, 4), mat('#3fa047'));
      const a = i * 2.4;
      leaf.position.set(Math.sin(a) * 0.025, 0.03 + i * 0.012, Math.cos(a) * 0.025); leaf.rotation.set(Math.cos(a) * 1.1, 0, -Math.sin(a) * 1.1); plant.add(leaf);
    }
    plant.position.set(0.4, 0.94, 0);
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.7, 8), mat('#666', { metalness: 0.6 }));
    const lampHead = new THREE.Group();
    const shade = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.14, 24, 1, true), mat('#2c2f33', { side: THREE.DoubleSide }));
    shade.rotation.z = Math.PI / 2;
    const bulb = new THREE.Mesh(new THREE.CircleGeometry(0.09, 24), new THREE.MeshBasicMaterial({ color: '#fff3c4' }));
    bulb.rotation.y = Math.PI / 2; bulb.position.x = 0.07;
    lampHead.add(shade, bulb);
    const lamp = new THREE.PointLight('#fff1c9', 2.5, 1.2, 2);
    lampHead.add(lamp);
    ph.lampGroup = new THREE.Group(); ph.lampGroup.add(stand, lampHead);
    stand.scale.y = 0.45; stand.position.set(0, 0.92 + 0.16, -0.12); lampHead.position.y = 1.1;
    g.add(beaker, water, plant, ph.lampGroup);
    ph.lampLight = lamp;
    const bubbleGeo = new THREE.SphereGeometry(0.014, 8, 6);
    ph.bubbleMesh = new THREE.InstancedMesh(bubbleGeo, new THREE.MeshStandardMaterial({ color: '#f4fbff', roughness: 0.1, metalness: 0.3, emissive: '#9fd4f2', emissiveIntensity: 0.35 }), 60);
    ph.bubbleMesh.count = 0; g.add(ph.bubbleMesh);
    const ruler = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.005, 0.04), mat('#f2d58a'));
    ruler.position.set(0.1, 0.925, 0.25); g.add(ruler);
  }
  function phDraw(dt) {
    ph.lampGroup.position.x = 0.4 - ph.distance / 100; // lamp sits `distance` cm from the plant
    ph.lampLight.intensity = 2.5 * Math.min(4, lightIntensity(ph.distance));
    const m = new THREE.Matrix4(), v = new THREE.Vector3(), q = new THREE.Quaternion(), s = new THREE.Vector3(1, 1, 1);
    ph.bubbles = ph.bubbles.filter((b) => (b.y += dt * 0.18) < 1.24);
    ph.bubbleMesh.count = Math.min(60, ph.bubbles.length);
    ph.bubbles.slice(0, 60).forEach((b, i) => { v.set(0.4 + b.x, b.y, b.z); m.compose(v, q, s); ph.bubbleMesh.setMatrixAt(i, m); });
    ph.bubbleMesh.instanceMatrix.needsUpdate = true;
  }

  // ---------- world object ----------
  const world = {
    ground: () => 0,
    clamp: (p) => { p.x = Math.max(-ROOM.w / 2 + 0.5, Math.min(ROOM.w / 2 - 0.5, p.x)); p.z = Math.max(-ROOM.d / 2 + 0.5, Math.min(ROOM.d / 2 - 0.5, p.z)); },
    start: { x: 0, z: 7.5, facing: Math.PI },

    async populate(c) {
      for (const [id, s] of Object.entries(STATIONS)) {
        c.interactions.add({ id, label: s.label, action: 'Use', position: { x: s.x, y: 0, z: BENCH_Z + 2.3 }, radius: 1.6, height: 0.2, object: stationObjs[id].group, onUse: () => openStation(id) });
      }
      world.hale = await c.addNPC({
        id: 'hale', name: 'Dr. Hale', role: 'Life Science Instructor', avatar: { id: 'npc_scientist', skin: SKIN_TONES[3] },
        x: -1.9, z: -8.6, facing: 0.35, idle: 'Experiments are how we find out!',
        dialogue: ['Welcome to the Life Science Lab! Open Missions to start an investigation. Each bench has a live experiment. Step on its ring to use it.'],
      });
    },

    update(dt, t) {
      if (fw.play) {
        fw.play.t += dt * fw.play.rate;
        const i = Math.min(fw.play.series.length - 1, Math.floor(fw.play.t));
        const e = fw.play.series[i];
        fw.counts = { plants: e.P, herbivores: e.H, carnivores: e.C, apex: e.A };
        if (i !== fw.play.last) { fw.play.last = i; if (hud.dock?.classList.contains('open') && currentStation === 'foodweb') hud.redock(); }
        if (i >= fw.play.series.length - 1) finishFoodWeb();
      }
      fwDraw(dt);
      if (sel.play) stepSelection(dt);
      selDraw(t);
      if (ph.play) stepPhoto(dt);
      phDraw(dt);
      for (const o of Object.values(stationObjs)) o.disc.material.opacity = 0.35 + 0.2 * Math.sin(t * 2.5);
    },

    effects: {},
    snapshot: () => JSON.parse(JSON.stringify({ runs: state.runs })),
    restore(s) { if (s?.runs) state.runs = s.runs; },
    resetForMission() { state.runs = { foodweb: [], selection: [], photo: [] }; },

    validate(fn, args, runId) {
      if (fn === 'fwRun') {
        const r = state.runs.foodweb[runId]; if (!r) return false;
        return Object.entries(args).every(([k, v]) => (v === 'present' ? r.start[k] > 0 : v === 0 ? r.start[k] === 0 : true));
      }
      if (fn === 'selRun') { const r = state.runs.selection[runId]; return !!r && r.background === args.background && r.generations >= (args.minGen || 1); }
      if (fn === 'photoTrial') { const r = state.runs.photo[runId]; return !!r && r.distance === args.distance && r.co2 === args.co2 && (args.temp === undefined || r.temp === args.temp); }
      return false;
    },

    compute(fn, args = {}) {
      const R = state.runs;
      switch (fn) {
        case 'fwPlantChange': {
          const base = [...R.foodweb].reverse().find((r) => r.start.apex > 0 && r.start.carnivores > 0);
          const noA = [...R.foodweb].reverse().find((r) => r.start.apex === 0 && r.start.carnivores > 0);
          if (!base || !noA) return 'increased';
          return noA.final.P > base.final.P * 1.05 ? 'increased' : noA.final.P < base.final.P * 0.95 ? 'decreased' : 'same';
        }
        case 'fwFinal': { const r = [...R.foodweb].reverse().find((x) => (args.apex === 0 ? x.start.apex === 0 : x.start.apex > 0)); return r ? Math.round(r.final[args.level]) : 0; }
        case 'selFinalBrown': { const r = [...R.selection].reverse().find((x) => x.background === args.background); return r ? Math.round(100 - r.series[r.series.length - 1].pctGreen) : 0; }
        case 'trialCount': { const r = [...R.photo].reverse().find((x) => x.distance === args.distance && x.co2 === args.co2); return r ? r.count : 0; }
        case 'relIntensity': return Math.round(lightIntensity(args.distance) * 1000) / 1000;
        default: throw new Error(`Unknown compute ${fn}`);
      }
    },

    openNotebook() { hud.openPanel('Lab data', (body) => { body.innerHTML = world.dataHTML(); }, { wide: true }); },
    dataHTML,
    labelFor: (id) => STATIONS[id]?.label,
  };

  // ---------- stations ----------
  let currentStation = null;
  const views = {
    foodweb: { pos: new THREE.Vector3(-9, 2.3, BENCH_Z + 2.4), target: new THREE.Vector3(-9, 1.05, BENCH_Z) },
    selection: { pos: new THREE.Vector3(0, 2.4, BENCH_Z + 2.1), target: new THREE.Vector3(0, 0.98, BENCH_Z) },
    photo: { pos: new THREE.Vector3(9.15, 1.45, BENCH_Z + 1.05), target: new THREE.Vector3(9.15, 1.1, BENCH_Z) },
  };
  const isMobileDock = () => window.innerWidth <= 760;

  function openStation(id) {
    currentStation = id;
    const v = views[id];
    // Step to the side of the bench so the student doesn't block the camera.
    ctx.player.teleport(STATIONS[id].x + 1.9, BENCH_Z + 1.5, { x: STATIONS[id].x, z: BENCH_Z });
    // Shift the view so the experiment isn't hidden behind the side panel.
    const shift = isMobileDock() ? new THREE.Vector3(0, -0.5, 0.6) : new THREE.Vector3(0.55, 0, 0);
    ctx.player.focus = { pos: v.pos.clone().add(shift), target: v.target.clone().add(shift.clone().multiplyScalar(isMobileDock() ? 0.2 : 1)) };
    hud.openDock(STATIONS[id].title, (body) => renderStation[id](body), { onClose: () => { ctx.player.focus = null; currentStation = null; } });
  }

  const slider = (id, label, value, min, max, step, unit = '') =>
    `<div class="pf-ctrl"><label for="${id}">${esc(label)}</label><output id="${id}-o">${value}${unit}</output><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${value}"></div>`;
  const bindSlider = (body, id, unit, fn) => {
    const el = body.querySelector('#' + id), out = body.querySelector(`#${id}-o`);
    el.oninput = () => { out.textContent = el.value + unit; fn(Number(el.value)); };
  };

  const renderStation = {
    foodweb(body) {
      const running = !!fw.play;
      const c = fw.counts;
      const st = fw.start || FOODWEB_BALANCE;
      const last = fw.play?.series.slice(0, Math.floor(fw.play.t) + 1) || state.runs.foodweb[state.runs.foodweb.length - 1]?.series || [];
      body.innerHTML = `
        <p class="hint">A model habitat at its natural balance. Change who lives here at the start, then run 120 days. Each level turns only about <strong>10%</strong> of the energy it eats into new growth.</p>
        ${slider('fw-h', 'Starting herbivores', +st.herbivores.toFixed(1), 0, 20, 0.5)}
        ${slider('fw-c', 'Starting carnivores', +st.carnivores.toFixed(1), 0, 8, 0.1)}
        ${slider('fw-a', 'Starting apex predators', +st.apex.toFixed(1), 0, 4, 0.1)}
        <div class="row"><button class="primary" id="fw-run" ${running ? 'disabled' : ''}>${running ? `Running… day ${Math.floor(fw.play.t)}` : '▶ Run 120 days'}</button>
          <button class="secondary" id="fw-reset" ${running ? 'disabled' : ''}>Reset to balance</button>${running ? '<button class="link" id="fw-skip">Skip to end</button>' : ''}</div>
        <div class="pf-legend">${LEVELS.map((L) => `<span style="--c:${L.color}">${esc(L.name)}: <strong>${L.key === 'P' ? Math.round(c.plants) : (c[{ H: 'herbivores', C: 'carnivores', A: 'apex' }[L.key]]).toFixed(1)}</strong></span>`).join('')}</div>
        ${lineChart([
          { color: LEVELS[0].color, points: last.map((e) => [e.t, e.P / 10]) },
          { color: LEVELS[1].color, points: last.map((e) => [e.t, e.H]) },
          { color: LEVELS[2].color, points: last.map((e) => [e.t, e.C]) },
          { color: LEVELS[3].color, points: last.map((e) => [e.t, e.A]) },
        ], { yMax: 25, xMax: 120, xLabel: 'Day', yLabel: 'Population (plants ÷ 10)' })}
        <p class="hint">In the tank, each green cone stands for 3 plants.</p>
        ${runsTable('foodweb')}`;
      bindSlider(body, 'fw-h', '', (v) => { fw.start = { ...(fw.start || FOODWEB_BALANCE), herbivores: v }; fw.counts = { ...fw.start }; });
      bindSlider(body, 'fw-c', '', (v) => { fw.start = { ...(fw.start || FOODWEB_BALANCE), carnivores: v }; fw.counts = { ...fw.start }; });
      bindSlider(body, 'fw-a', '', (v) => { fw.start = { ...(fw.start || FOODWEB_BALANCE), apex: v }; fw.counts = { ...fw.start }; });
      body.querySelector('#fw-run').onclick = () => {
        const start = { ...(fw.start || FOODWEB_BALANCE) };
        fw.play = { series: foodWebRun(start), t: 0, rate: 6, last: -1, start };
        hud.redock();
      };
      body.querySelector('#fw-reset').onclick = () => { fw.start = { ...FOODWEB_BALANCE }; fw.counts = { ...FOODWEB_BALANCE }; hud.redock(); };
      body.querySelector('#fw-skip')?.addEventListener('click', () => { fw.play.t = fw.play.series.length; });
    },

    selection(body) {
      const running = !!sel.play;
      const last = sel.play?.series.slice(0, sel.play.gen + 1) || state.runs.selection[state.runs.selection.length - 1]?.series || [];
      body.innerHTML = `
        <p class="hint">Green and brown beetles live on the ground. Birds catch the beetles they can see; survivors reproduce and pass on their color. Watch each generation.</p>
        <strong>Habitat ground</strong>
        <div class="pf-seg">${Object.entries(BACKGROUNDS).map(([k, b]) => `<button data-bg="${k}" class="${sel.background === k ? 'sel' : ''}" ${running ? 'disabled' : ''}>${esc(b.label)}</button>`).join('')}</div>
        ${slider('sel-g', 'Starting % green', sel.startGreen, 0, 100, 5, '%')}
        ${slider('sel-m', 'Mutation rate', sel.mutation, 0, 10, 1, '%')}
        ${slider('sel-n', 'Generations', sel.generations, 5, 20, 1)}
        <div class="row"><button class="primary" id="sel-run" ${running ? 'disabled' : ''}>${running ? `Generation ${sel.play.gen}…` : '▶ Run selection'}</button>${running ? '<button class="link" id="sel-skip">Skip to end</button>' : ''}</div>
        <div class="pf-legend"><span style="--c:#3f8f3a">Green: <strong>${sel.green}</strong></span><span style="--c:#6b4a2b">Brown: <strong>${sel.N - sel.green}</strong></span></div>
        ${lineChart([{ color: '#3f8f3a', points: last.map((e) => [e.gen, e.pctGreen]) }, { color: '#6b4a2b', points: last.map((e) => [e.gen, 100 - e.pctGreen]) }], { yMax: 100, xMax: Math.max(5, sel.play?.series.length - 1 || last.length - 1 || 10), xLabel: 'Generation', yLabel: '% of beetles' })}
        ${runsTable('selection')}`;
      body.querySelectorAll('[data-bg]').forEach((b) => (b.onclick = () => { sel.background = b.dataset.bg; hud.redock(); }));
      bindSlider(body, 'sel-g', '%', (v) => { sel.startGreen = v; sel.green = Math.round(sel.N * v / 100); });
      bindSlider(body, 'sel-m', '%', (v) => { sel.mutation = v; });
      bindSlider(body, 'sel-n', '', (v) => { sel.generations = v; });
      body.querySelector('#sel-run').onclick = () => {
        const run = state.runs.selection.length;
        const series = selectionRun({ background: sel.background, startGreen: sel.startGreen, generations: sel.generations, mutation: sel.mutation, seed, run });
        sel.play = { series, gen: 0, t: 0, run };
        sel.green = series[0].green;
        hud.redock();
      };
      body.querySelector('#sel-skip')?.addEventListener('click', () => { sel.play.skip = true; });
    },

    photo(body) {
      const running = !!ph.play;
      body.innerHTML = `
        <p class="hint">Elodea is a water plant. Its leaves release oxygen bubbles as it photosynthesizes. Count the bubbles in one minute (the timer runs 10× faster).</p>
        ${slider('ph-d', 'Lamp distance', ph.distance, 10, 50, 5, ' cm')}
        <strong>Sodium bicarbonate (CO₂ source)</strong>
        <div class="pf-seg">${[0, 0.5, 1].map((v) => `<button data-co2="${v}" class="${ph.co2 === v ? 'sel' : ''}" ${running ? 'disabled' : ''}>${v}%</button>`).join('')}</div>
        ${slider('ph-t', 'Water temperature', ph.temp, 15, 35, 5, ' °C')}
        <div class="row"><button class="primary" id="ph-run" ${running ? 'disabled' : ''}>${running ? `Counting… ${Math.min(60, Math.floor(ph.play.t * 10))} s · ${ph.play.shown} bubbles` : '▶ Run 1-minute trial'}</button></div>
        <details><summary><strong>How photosynthesis makes these bubbles</strong></summary>
          <p>In the <strong>light reactions</strong>, chlorophyll absorbs light energy and splits water: 2H₂O → O₂ + 4H⁺ + 4e⁻. The oxygen escapes as the bubbles you count. The energy is stored in ATP and NADPH.</p>
          <p>In the <strong>Calvin cycle</strong>, the plant uses ATP and NADPH to fix CO₂ from the water into sugar (6CO₂ + 6H₂O → C₆H₁₂O₆ + 6O₂ overall). Less light, less CO₂ or the wrong temperature slows it down: whichever is scarcest is the <em>limiting factor</em>.</p>
          <p class="hint">Adapted from ScienceLab 3D's photosynthesis explanation (MIT).</p></details>
        ${runsTable('photo')}`;
      bindSlider(body, 'ph-d', ' cm', (v) => { ph.distance = v; });
      bindSlider(body, 'ph-t', ' °C', (v) => { ph.temp = v; });
      body.querySelectorAll('[data-co2]').forEach((b) => (b.onclick = () => { ph.co2 = Number(b.dataset.co2); hud.redock(); }));
      body.querySelector('#ph-run').onclick = () => {
        const params = { distance: ph.distance, co2: ph.co2, temp: ph.temp };
        const trial = state.runs.photo.filter((r) => r.distance === params.distance && r.co2 === params.co2 && r.temp === params.temp).length;
        const count = bubbleTrial(params, seed, trial);
        ph.play = { params, count, t: 0, shown: 0, times: Array.from({ length: count }, (_, i) => ((i + 0.5) / count) * 6 + (Math.sin(i * 12.9) * 0.08)) };
        hud.redock();
      };
    },
  };

  function runsTable(id) {
    const R = state.runs[id];
    if (!R.length) return '<p class="muted">No runs yet.</p>';
    if (id === 'foodweb') return `<h3>Your runs</h3><table class="data pf-runs"><thead><tr><th>#</th><th>Start H / C / A</th><th>Day 120 plants</th><th>H</th><th>C</th><th>A</th></tr></thead><tbody>${R.map((r, i) => `<tr><td>${i + 1}</td><td>${r.start.herbivores.toFixed(1)} / ${r.start.carnivores.toFixed(1)} / ${r.start.apex.toFixed(1)}</td><td>${Math.round(r.final.P)}</td><td>${r.final.H.toFixed(1)}</td><td>${r.final.C.toFixed(1)}</td><td>${r.final.A.toFixed(1)}</td></tr>`).join('')}</tbody></table>`;
    if (id === 'selection') return `<h3>Your runs</h3><table class="data pf-runs"><thead><tr><th>#</th><th>Ground</th><th>Start green</th><th>Gens</th><th>Final green</th><th>Final brown</th></tr></thead><tbody>${R.map((r, i) => { const e = r.series[r.series.length - 1]; return `<tr><td>${i + 1}</td><td>${BACKGROUNDS[r.background].label}</td><td>${r.startGreen}%</td><td>${r.generations}</td><td>${Math.round(e.pctGreen)}%</td><td>${Math.round(100 - e.pctGreen)}%</td></tr>`; }).join('')}</tbody></table>`;
    return `<h3>Your trials</h3><table class="data pf-runs"><thead><tr><th>#</th><th>Lamp</th><th>Bicarbonate</th><th>Temp</th><th>Bubbles/min</th></tr></thead><tbody>${R.map((r, i) => `<tr><td>${i + 1}</td><td>${r.distance} cm</td><td>${r.co2}%</td><td>${r.temp} °C</td><td><strong>${r.count}</strong></td></tr>`).join('')}</tbody></table>`;
  }

  function dataHTML() { return ['foodweb', 'selection', 'photo'].map((id) => `<h3>${STATIONS[id].title}</h3>${runsTable(id)}`).join(''); }

  function record(id, data) {
    state.runs[id].push(data);
    const runId = state.runs[id].length - 1;
    world.runner?.checkpoint?.();
    if (world.runner && !world.runner.done) ctx.interactions.emit('measure', id, runId);
    if (currentStation === id) hud.redock();
  }

  function finishFoodWeb() {
    const p = fw.play; fw.play = null;
    const final = p.series[p.series.length - 1];
    record('foodweb', { start: p.start, final, series: p.series.filter((_, i) => i % 2 === 0 || i === p.series.length - 1) });
  }

  function stepSelection(dt) {
    const p = sel.play;
    p.t += dt * (p.skip ? 20 : 1);
    const genDur = 1.4;
    const phase = p.t / genDur;
    const gen = Math.floor(phase);
    // Bird swoop during each generation
    const f = phase - gen;
    sel.bird.visible = gen < p.series.length - 1 && f < 0.6;
    sel.bird.position.set(-1.4 + f * 4.6, 1.15 + Math.sin(f * Math.PI) * -0.12 + 0.25, Math.sin(f * 6) * 0.25);
    sel.bird.rotation.y = Math.PI / 2;
    if (gen !== p.gen && gen < p.series.length) {
      p.gen = gen;
      sel.green = p.series[gen].green;
      if (currentStation === 'selection') hud.redock();
    }
    if (gen >= p.series.length - 1 && f > 0.2) {
      sel.play = null; sel.bird.visible = false;
      record('selection', { background: sel.background, startGreen: sel.startGreen, generations: sel.generations, mutation: sel.mutation, series: p.series });
    }
  }

  function stepPhoto(dt) {
    const p = ph.play;
    p.t += dt;
    const before = p.shown;
    p.shown = p.times.filter((tt) => tt <= p.t).length;
    for (let i = before; i < p.shown; i++) ph.bubbles.push({ x: (Math.random() - 0.5) * 0.03, y: 1.12 + Math.random() * 0.05, z: (Math.random() - 0.5) * 0.03 });
    if (Math.floor(p.t * 10) !== Math.floor((p.t - dt) * 10) && currentStation === 'photo') {
      const b = hud.dock.querySelector('#ph-run');
      if (b) b.textContent = `Counting… ${Math.min(60, Math.floor(p.t * 10))} s · ${p.shown} bubbles`;
    }
    if (p.t >= 6.2) { ph.play = null; record('photo', { ...p.params, count: p.count }); }
  }

  return world;
}
