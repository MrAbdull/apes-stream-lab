// Biodiversity Field Station: quadrat sampling in a meadow, a forest and a disturbed lot.
// Every student's plots are generated from their own seed, so their data (and the
// correct answers) differ from their classmates'.

import * as THREE from 'three';
import { makeRng, mulberry32 } from '../../../js/rng.js';
import { SKIN_TONES } from '../../../js/avatars.js';
import { esc } from '../../engine/hud.js';

export const SPECIES = [
  { id: 'grass', name: 'Meadow grass', model: 'grass2', h: 0.36, color: '#4f8a3a', look: 'Clump of thin, upright green blades.' },
  { id: 'poppy', name: 'Red poppy', model: 'flower1', h: 0.55, color: '#c62828', look: 'One red, cup-shaped flower on a tall, thin stem.' },
  { id: 'coneflower', name: 'Purple coneflower', model: 'flower2', h: 0.55, color: '#c2185b', look: 'Pink-purple petals around a dark center.' },
  { id: 'susan', name: 'Black-eyed Susan', model: 'flower3', h: 0.55, color: '#e0a800', look: 'Bright yellow petals around a dark brown center.' },
  { id: 'fern', name: 'Lady fern', model: 'plant2', h: 0.42, color: '#2f6f3c', tint: '#2d6a39', look: 'Long, arching, dark-green fronds.' },
  { id: 'raspberry', name: 'Wild raspberry', model: 'berries', h: 0.42, color: '#8e244d', look: 'Small, rounded leafy shrub dotted with red berries.' },
  { id: 'mustard', name: 'Garlic mustard (invasive)', model: 'plant3', h: 0.4, color: '#9bb83a', tint: '#a9c43c', invasive: true, look: 'Broad, bright yellow-green, heart-shaped leaves.' },
  { id: 'fungi', name: 'Mushrooms (fungi)', model: 'mush', h: 0.22, color: '#7b2fa0', look: 'Cluster of purple-capped mushrooms.' },
];
const SP = Object.fromEntries(SPECIES.map((s) => [s.id, s]));

const HABITATS = {
  meadow: { label: 'Meadow', plots: ['A1', 'A2'], weights: { grass: 24, poppy: 14, coneflower: 17, susan: 17, raspberry: 8, fern: 4, mustard: 8, fungi: 2 } },
  forest: { label: 'Forest', plots: ['B1', 'B2'], weights: { fern: 34, fungi: 22, raspberry: 16, grass: 8, mustard: 10, coneflower: 4, susan: 2, poppy: 2 } },
  disturbed: { label: 'Disturbed lot', plots: ['C1', 'C2'], weights: { mustard: 55, grass: 33, poppy: 6, susan: 4, coneflower: 2 } },
};
const PLOTS = {
  P: { x: 7, z: 9, habitat: 'meadow', practice: true },
  A1: { x: -10, z: -48, habitat: 'meadow' }, A2: { x: 12, z: -58, habitat: 'meadow' },
  B1: { x: 48, z: -8, habitat: 'forest' }, B2: { x: 58, z: 14, habitat: 'forest' },
  C1: { x: -46, z: 6, habitat: 'disturbed' }, C2: { x: -58, z: -14, habitat: 'disturbed' },
};

const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ground = (x, z) => 0.6 * Math.sin(x * 0.04) * Math.cos(z * 0.05) + 0.4 * Math.sin(x * 0.09 + z * 0.06) + smooth(100, 150, Math.hypot(x, z)) * 8;
const zoneOf = (x, z) => (Math.hypot(x, z) < 22 ? 'station' : x < -26 && Math.abs(z) < 60 ? 'disturbed' : x > 26 ? 'forest' : z < -24 ? 'meadow' : 'edge');
const round2 = (v) => Math.round(v * 100) / 100;

const MODELS = {
  grass2: 'nature/grass_2.glb', grass3: 'nature/grass_3.glb', grass1: 'nature/grass_1.glb',
  flower1: 'nature/flower_1.glb', flower2: 'nature/flower_2.glb', flower3: 'nature/flower_3.glb',
  plant2: 'nature/plant_2.glb', plant3: 'nature/plant_3.glb', plant1: 'nature/plant_1.glb', berries: 'nature/bush_berries_1.glb',
  mush: 'nature/mushroom_group_1.glb', bush1: 'nature/bush_1.glb', bush3: 'nature/bush_3.glb',
  oak1: 'nature/common_tree_1.glb', oak2: 'nature/common_tree_2.glb', oak3: 'nature/common_tree_3.glb',
  pine1: 'nature/pine_tree_1.glb', pine2: 'nature/pine_tree_2.glb', pine3: 'nature/pine_tree_3.glb',
  stump: 'nature/tree_stump_1.glb', deadtree: 'nature/dead_tree_1.glb', stone4: 'nature/stone_4.glb',
  station: 'town/building_B.gltf', car: 'town/car_stationwagon.gltf', dumpster: 'town/dumpster.gltf', lamp: 'town/streetlight.gltf',
  cloud1: 'nature/cloud_1.glb', cloud2: 'nature/cloud_2.glb',
};

// ---------- field data ----------

function generateData(seed) {
  const pickSpecies = (rng, weights) => {
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let r = rng.next() * total;
    for (const [id, w] of Object.entries(weights)) { if ((r -= w) < 0) return id; }
    return Object.keys(weights)[0];
  };
  const makePlot = (id, attempt) => {
    const p = PLOTS[id];
    const rng = makeRng(`${seed}|bio|${id}|${attempt}`);
    const n = p.practice ? rng.int(8, 10) : rng.int(12, 18);
    const plants = [];
    for (let i = 0; i < n; i++) {
      let pos = null;
      for (let t = 0; t < 60 && !pos; t++) {
        const c = { x: (rng.next() - 0.5) * 1.7, z: (rng.next() - 0.5) * 1.7 };
        if (plants.every((q) => Math.hypot(q.x - c.x, q.z - c.z) > 0.34)) pos = c;
      }
      if (!pos) break;
      plants.push({ species: pickSpecies(rng, HABITATS[p.habitat].weights), ...pos, rot: rng.next() * 6.28, s: 0.85 + rng.next() * 0.3 });
    }
    return plants;
  };
  const counts = (plants) => plants.reduce((m, q) => ((m[q.species] = (m[q.species] || 0) + 1), m), {});
  const pooled = (data, hab) => HABITATS[hab].plots.reduce((m, id) => { for (const [s, n] of Object.entries(counts(data[id]))) m[s] = (m[s] || 0) + n; return m; }, {});
  const simpson = (c) => { const ns = Object.values(c), N = ns.reduce((a, b) => a + b, 0); return N < 2 ? 0 : 1 - ns.reduce((a, n) => a + n * (n - 1), 0) / (N * (N - 1)); };

  // Re-draw until the story holds: garlic mustard dominates the lot, and the lot is clearly less diverse than the meadow.
  for (let attempt = 0; attempt < 40; attempt++) {
    const data = {};
    for (const id of Object.keys(PLOTS)) data[id] = makePlot(id, attempt);
    const lot = pooled(data, 'disturbed'), meadow = pooled(data, 'meadow');
    const dominant = Object.entries(lot).sort((a, b) => b[1] - a[1])[0][0];
    const ds = Object.keys(HABITATS).map((h) => simpson(pooled(data, h))).sort((a, b) => b - a);
    const clearWinner = ds[0] - ds[1] >= 0.03; // so "most diverse" can't flip on rounding
    if (dominant === 'mustard' && simpson(lot) < simpson(meadow) - 0.12 && Object.keys(meadow).length >= 5 && clearWinner) return { data, pooled: (h) => pooled(data, h), counts, simpson };
  }
  const data = {};
  for (const id of Object.keys(PLOTS)) data[id] = makePlot(id, 0);
  return { data, pooled: (h) => pooled(data, h), counts, simpson };
}

// ---------- world ----------

export async function createWorld(ctx) {
  const { stage, makeTerrain, Scatter, hud } = ctx;
  const scene = stage.scene;
  const models = await ctx.loadModels(MODELS);
  const field = generateData(ctx.seed);
  const state = { kit: false, placed: new Set(), counted: {}, partial: {} };

  // Terrain
  const C = (h) => new THREE.Color(h);
  const P = { meadow: C('#8fbb5c'), meadow2: C('#a4c467'), forest: C('#4b7a3a'), forest2: C('#3a6530'), dirt: C('#a2906c'), gravel: C('#8d877a'),
    lot: C('#a6a46a'), path: C('#b39f7c'), station: C('#93b866'), edge: C('#7fab55'), road: C('#6d6a63') };
  const onPath = (x, z) => Object.values(PLOTS).some((p) => {
    const L = Math.hypot(p.x, p.z), t = Math.max(0, Math.min(1, (x * p.x + z * p.z) / (L * L)));
    return Math.hypot(x - p.x * t, z - p.z * t) < 1.4;
  });
  scene.add(makeTerrain(320, 220, ground, (x, z, c) => {
    const n = Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.5 + 0.5, n2 = Math.sin(x * 0.07 + 2) * Math.cos(z * 0.06) * 0.5 + 0.5;
    if (Math.abs(x + 74) < 3) return c.copy(P.road);
    if (onPath(x, z) && Math.hypot(x, z) > 6) return c.copy(P.path);
    switch (zoneOf(x, z)) {
      case 'station': return c.copy(P.station).lerp(P.path, smooth(8, 0, Math.hypot(x, z)) * 0.6);
      case 'meadow': return c.copy(P.meadow).lerp(P.meadow2, n);
      case 'forest': return c.copy(P.forest).lerp(P.forest2, n);
      case 'disturbed': return c.copy(P.lot).lerp(n2 > 0.55 ? P.dirt : P.gravel, n * 0.7);
      default: return c.copy(P.edge).lerp(P.meadow, n2);
    }
  }));

  // Scenery (kept away from the plots so quadrats contain only the survey organisms)
  const scatter = new Scatter(scene, models, ground, ctx.colliders);
  const col = ctx.colliders;
  const rnd = mulberry32(77);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const nearPlot = (x, z, r) => Object.values(PLOTS).some((p) => Math.hypot(x - p.x, z - p.z) < r);
  const bag = {};
  const put = (k, p) => (bag[k] ||= []).push(p);
  for (let i = 0; i < 9000; i++) {
    const x = -140 + rnd() * 280, z = -140 + rnd() * 280;
    const r = Math.hypot(x, z);
    if (r > 140 || r < 14 || onPath(x, z) || Math.abs(x + 74) < 5) continue;
    const zone = zoneOf(x, z), u = rnd();
    const treeOK = !nearPlot(x, z, 8);
    // Real-world heights (m), so plants in the survey plots match the scenery around them.
    const H = { flower1: [0.4, 0.65], flower2: [0.4, 0.65], flower3: [0.45, 0.7], grass1: [0.25, 0.45], grass2: [0.3, 0.55], grass3: [0.3, 0.55],
      plant1: [0.45, 0.8], plant2: [0.4, 0.75], plant3: [0.3, 0.55], mush: [0.15, 0.25], berries: [0.5, 0.9], bush1: [0.8, 1.4], bush3: [0.8, 1.3] };
    const h = (k) => H[k][0] + rnd() * (H[k][1] - H[k][0]);
    const plant = (k) => put(k, { x, z, rot: rnd() * 6.28, height: h(k) });
    if (!nearPlot(x, z, 3.5)) {
      if (zone === 'forest' && treeOK && u < 0.06) { const k = pick(['oak1', 'oak2', 'oak3', 'pine1', 'pine2']); put(k, { x, z, rot: rnd() * 6.28, height: k.startsWith('pine') ? 10 + rnd() * 6 : 9 + rnd() * 5 }); }
      else if (r > 100 && treeOK && u < 0.05) { const k = pick(['oak1', 'oak2', 'pine1', 'pine2', 'pine3']); put(k, { x, z, rot: rnd() * 6.28, height: k.startsWith('pine') ? 10 + rnd() * 6 : 9 + rnd() * 5 }); }
      else if (zone === 'meadow' && u < 0.18) plant(pick(['flower1', 'flower2', 'flower3', 'flower3', 'flower2', 'grass2', 'grass3']));
      else if (zone === 'forest' && u < 0.16) plant(pick(['plant2', 'plant1', 'mush', 'berries', 'bush1', 'grass1']));
      else if (zone === 'disturbed' && u < 0.07) plant(pick(['plant3', 'plant3', 'grass1', 'grass2']));
      else if ((zone === 'edge' || zone === 'station') && u < 0.06) plant(pick(['grass2', 'grass3', 'bush3', 'flower2']));
    }
  }
  for (const [k, list] of Object.entries(bag)) {
    const tree = /oak|pine/.test(k);
    scatter.add(k, list, tree ? { near: 75, lod: k.startsWith('pine') ? 'pine' : 'oak', occludes: true, collide: 0.04 } : { near: 45, collide: /bush/.test(k) ? 0.35 : 0 });
  }

  const place = (key, x, z, scale, rot = 0) => { const o = models[key].scene.clone(); o.position.set(x, ground(x, z), z); o.scale.setScalar(scale); o.rotation.y = rot; scene.add(o); return o; };
  place('station', 0, -6, 5.5, 0); col.addBox(0, -6, 5.1, 5.1);
  for (const [x, z, rot] of [[-62, 20, 0.4], [-50, 26, 2.1]]) { place('stump', x, z, 1.2, rot); col.addCircle(x, z, 0.45); }
  place('deadtree', -38, -26, 1.6, 1.2); col.addCircle(-38, -26, 0.4);
  place('car', -70, 2, 4.3, 0); col.addBox(-70, 2, 0.95, 2.05);
  place('dumpster', -66, -6, 4, Math.PI / 2); col.addBox(-66, -6, 1.2, 0.8, Math.PI / 2);
  for (const z of [-30, 0, 30]) { place('lamp', -70.5, z, 5, -Math.PI / 2); col.addCircle(-70.5, z, 0.25); }
  for (let i = 0; i < 8; i++) {
    const o = models[i % 2 ? 'cloud1' : 'cloud2'].scene.clone();
    o.scale.setScalar(5 + rnd() * 4); o.position.set(-150 + rnd() * 300, 70 + rnd() * 30, -150 + rnd() * 300); scene.add(o);
  }

  // Field table with the quadrat kit
  const wood = new THREE.MeshStandardMaterial({ color: '#8a6a45', roughness: 0.9 });
  const white = new THREE.MeshStandardMaterial({ color: '#f4f4f0', roughness: 0.5 });
  const table = new THREE.Group();
  const top = new THREE.Mesh(new THREE.BoxGeometry(2, 0.1, 1), wood); top.position.y = 0.9;
  table.add(top);
  for (const [lx, lz] of [[-0.9, -0.4], [0.9, -0.4], [-0.9, 0.4], [0.9, 0.4]]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.9, 0.08), wood); l.position.set(lx, 0.45, lz); table.add(l); }
  const kit = new THREE.Group();
  for (const [w, d, x, z] of [[0.7, 0.04, 0, -0.33], [0.7, 0.04, 0, 0.33], [0.04, 0.7, -0.33, 0], [0.04, 0.7, 0.33, 0]]) { const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.04, d), white); b.position.set(x - 0.4, 0, z); kit.add(b); }
  const board = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.03, 0.45), new THREE.MeshStandardMaterial({ color: '#6b4f2e' })); board.position.set(0.55, 0, 0); kit.add(board);
  kit.position.y = 0.97; // resting on the table top
  table.add(kit);
  table.position.set(4.5, ground(4.5, 4), 4);
  scene.add(table);
  col.addBox(4.5, 4, 1.05, 0.55);

  // Plots: flag, sign, hidden quadrat frame and the survey organisms
  const flagMat = new THREE.MeshStandardMaterial({ color: '#f57c00', side: THREE.DoubleSide });
  const protos = {};
  for (const s of SPECIES) {
    const o = models[s.model].scene.clone(true);
    o.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(o);
    const k = s.h / Math.max(0.01, box.getSize(new THREE.Vector3()).y);
    o.scale.multiplyScalar(k);
    if (s.tint) o.traverse((m) => { if (m.isMesh) { m.material = m.material.clone(); m.material.color.set(s.tint); } });
    protos[s.id] = o;
  }
  const plots = {};
  for (const [id, p] of Object.entries(PLOTS)) {
    const gy = ground(p.x, p.z);
    const g = new THREE.Group();
    g.position.set(p.x, gy, p.z);
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.3, 6), wood); post.position.set(1.35, 0.65, -1.35);
    const flag = new THREE.Mesh(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.45, -0.12, 0), new THREE.Vector3(0, -0.25, 0)]), flagMat);
    flag.geometry.computeVertexNormals(); flag.position.set(1.37, 1.28, -1.35);
    const label = ctx.makeLabel([`Plot ${id}`, p.practice ? 'Practice plot' : HABITATS[p.habitat].label], { accent: '#f57c00', scale: 0.5 });
    label.position.set(1.35, 2.0, -1.35);
    const frame = new THREE.Group();
    for (const [w, d, x, z] of [[2.04, 0.05, 0, -1], [2.04, 0.05, 0, 1], [0.05, 2.04, -1, 0], [0.05, 2.04, 1, 0]]) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 0.05, d), white); b.position.set(x, 0.06, z); frame.add(b);
    }
    frame.visible = false;
    const plants = new THREE.Group();
    field.data[id].forEach((q) => {
      const o = protos[q.species].clone();
      o.position.set(q.x, ground(p.x + q.x, p.z + q.z) - gy, q.z);
      o.rotation.y = q.rot;
      o.scale.multiplyScalar(q.s);
      plants.add(o);
    });
    g.add(post, flag, label, frame, plants);
    scene.add(g);
    plots[id] = { ...p, id, gy, group: g, frame, label };
  }

  const world = {
    ground,
    clamp: (pos) => { pos.x = Math.max(-135, Math.min(135, pos.x)); pos.z = Math.max(-135, Math.min(135, pos.z)); },
    start: { x: 0, z: 18, facing: Math.PI },
    occluders: () => scatter.occluders(),
    update(dt, t, frame) { if (frame % 5 === 0) scatter.update(ctx.player.pos.x, ctx.player.pos.z); },

    async populate(c) {
      const ix = c.interactions;
      ix.add({ id: 'kit', label: 'Quadrat kit', action: 'Pick up', position: { x: 4.5, y: ground(4.5, 4), z: 4 }, radius: 3, height: 1.2, object: table,
        enabled: () => !state.kit,
        onUse: () => { if (world.runner?.expects('collect', 'kit')) ix.emit('collect', 'kit'); else world.effects.giveKit(); } });
      for (const p of Object.values(plots)) {
        ix.add({ id: p.id, label: `Plot ${p.id}`, action: 'Lay quadrat', position: { x: p.x, y: p.gy, z: p.z }, radius: 3.2, height: 1.4, object: p.group, onUse: () => usePlot(p) });
      }
      world.ranger = await c.addNPC({
        id: 'ranger', name: 'Ranger Okafor', role: 'Reserve Ecologist', avatar: { id: 'npc_ranger', skin: SKIN_TONES[4] },
        x: -3.5, z: 6, facing: 0, idle: 'Our reserve needs good data!',
        dialogue: ['Hi! Open Missions (top-right list) to start a survey. Start with Field Orientation if this is your first time.'],
      });
    },

    // Mission effects (named in mission files)
    effects: {
      giveKit() { state.kit = true; if (ctx.carrier.held !== kit) ctx.carrier.pickUp(kit); refreshPrompts(); },
      placeQuadrat({ plot }) { state.placed.add(plot); plots[plot].frame.visible = true; refreshPrompts(); },
    },

    resetForMission() {
      state.kit = false; returnKit(); state.placed.clear(); state.counted = {}; state.partial = {};
      for (const p of Object.values(plots)) p.frame.visible = false;
      refreshPrompts();
    },
    snapshot: () => ({ kit: state.kit, placed: [...state.placed], counted: state.counted, partial: state.partial }),
    restore(s) {
      if (!s) return;
      state.kit = s.kit; if (s.kit) world.effects.giveKit(); else returnKit();
      state.placed = new Set(s.placed || []);
      for (const p of Object.values(plots)) p.frame.visible = state.placed.has(p.id);
      state.counted = s.counted || {}; state.partial = s.partial || {};
      refreshPrompts();
    },

    // Values that mission validators ask for
    compute(fn, args) {
      switch (fn) {
        case 'richness': return Object.keys(field.pooled(args.habitat)).length;
        case 'simpson': return round2(field.simpson(field.pooled(args.habitat)));
        case 'habitatOptions': return Object.entries(HABITATS).map(([value, h]) => ({ value, label: h.label }));
        case 'mostDiverse': return Object.keys(HABITATS).sort((a, b) => field.simpson(field.pooled(b)) - field.simpson(field.pooled(a)))[0];
        case 'speciesOptions': return SPECIES.map((s) => ({ value: s.id, label: s.name.replace(' (invasive)', '') }));
        case 'dominant': return Object.entries(field.pooled(args.habitat)).sort((a, b) => b[1] - a[1])[0][0];
        default: throw new Error(`Unknown compute function ${fn}`);
      }
    },

    dataHTML,
    openNotebook() { hud.openPanel('Field data', (body) => { body.innerHTML = world.dataHTML() + fieldGuideHTML(); }, { wide: true }); },
    labelFor: (id) => (plots[id] ? `Plot ${id}` : null),
  };

  // Put the kit back on the field table (new mission or restart).
  function returnKit() {
    if (ctx.carrier?.held === kit) { ctx.carrier.held = null; ctx.player.carrying = null; }
    table.add(kit);
    kit.position.set(0, 0.97, 0); kit.rotation.set(0, 0, 0);
  }

  // ---------- plots ----------
  function refreshPrompts() {
    for (const p of Object.values(plots)) {
      const it = ctx.interactions?.items.get(p.id);
      if (!it) continue;
      it.action = state.counted[p.id] ? 'Review' : state.placed.has(p.id) ? 'Count organisms in' : 'Lay quadrat at';
    }
    if (ctx.interactions) ctx.interactions.near = undefined; // re-evaluate the prompt next frame
  }

  function usePlot(p) {
    const r = world.runner;
    if (!state.kit) { hud.toast('You need a quadrat kit first. Pick one up from the table by the field station.'); return; }
    if (state.counted[p.id]) { hud.toast(`Plot ${p.id} is already recorded: ${Object.values(state.counted[p.id]).reduce((a, b) => a + b, 0)} organisms. See 📓 Data.`); return; }
    if (!state.placed.has(p.id)) {
      if (r && !r.done && !r.expects('place', p.id)) { hud.toast(`Not yet. Current task: ${r.currentInstruction()}`); return; }
      if (r && !r.done) ctx.interactions.emit('place', p.id); else world.effects.placeQuadrat({ plot: p.id });
      return;
    }
    if (r && !r.done && !r.expects('measure', p.id)) { hud.toast(`Not yet. Current task: ${r.currentInstruction()}`); return; }
    openTally(p);
  }

  // Tap-to-tally: choose a species from the field guide, then tap each organism of that species.
  function openTally(p) {
    const plants = field.data[p.id];
    const counted = new Set(state.partial[p.id] || []);
    let selected = null, flash = null;
    const W = 800, H = 600;
    const cam = new THREE.PerspectiveCamera(42, W / H, 0.05, 50);
    cam.position.set(p.x, p.gy + 2.5, p.z + 1.9);
    cam.lookAt(p.x, p.gy + 0.05, p.z + 0.1);
    cam.updateMatrixWorld();

    // Photograph the quadrat from above using the main renderer.
    const shot = document.createElement('canvas');
    shot.width = W; shot.height = H;
    const r = stage.renderer, size = r.getSize(new THREE.Vector2());
    const hidden = [ctx.player.character, ctx.interactions.guide, p.label];
    hidden.forEach((o) => o && (o.userData.wasVisible = o.visible, o.visible = false));
    r.setSize(W, H, false);
    r.render(scene, cam);
    shot.getContext('2d').drawImage(r.domElement, 0, 0, W, H);
    r.setSize(size.x, size.y, false);
    hidden.forEach((o) => o && (o.visible = o.userData.wasVisible));

    const screen = plants.map((q) => {
      const v = new THREE.Vector3(p.x + q.x, ground(p.x + q.x, p.z + q.z) + SP[q.species].h * 0.55 * q.s, p.z + q.z).project(cam);
      return { x: (v.x * 0.5 + 0.5) * W, y: (-v.y * 0.5 + 0.5) * H };
    });
    if (window.earthlab) window.earthlab.tally = { plants, screen, W, H }; // debug mode only

    hud.openPanel(`Plot ${p.id}: ${p.practice ? 'Practice plot' : HABITATS[p.habitat].label}`, (body) => {
      const tally = {};
      counted.forEach((i) => { tally[plants[i].species] = (tally[plants[i].species] || 0) + 1; });
      body.innerHTML = `
        <div class="pf-tally">
          <div><canvas width="${W}" height="${H}" aria-label="Photo of the quadrat. Tap each organism to tally it."></canvas>
            <p class="hint">${counted.size} of ${plants.length} organisms tallied. Each organism counts once.</p></div>
          <div class="pf-species">
            <p class="hint"><strong>1.</strong> Choose a species. <strong>2.</strong> Tap every one you see in the photo.</p>
            ${SPECIES.map((s) => `<button class="pf-sp ${selected === s.id ? 'sel' : ''}" data-sp="${s.id}"><span><span class="sw" style="background:${s.color}"></span>${esc(s.name)}</span><span class="n">${tally[s.id] || 0}</span></button>`).join('')}
            ${selected ? `<p class="hint">${esc(SP[selected].look)}</p>` : ''}
          </div>
        </div>`;
      const cv = body.querySelector('canvas'), g = cv.getContext('2d');
      g.drawImage(shot, 0, 0);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
      plants.forEach((q, i) => {
        const s = screen[i];
        if (counted.has(i)) {
          g.fillStyle = 'rgba(46,125,50,.85)'; g.beginPath(); g.arc(s.x, s.y, 13, 0, Math.PI * 2); g.fill();
          g.fillStyle = '#fff'; g.font = 'bold 16px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✓', s.x, s.y + 1);
        }
      });
      if (flash) { g.strokeStyle = '#e53935'; g.lineWidth = 4; g.beginPath(); g.arc(flash.x, flash.y, 20, 0, Math.PI * 2); g.stroke(); }
      body.querySelectorAll('.pf-sp').forEach((b) => (b.onclick = () => { selected = b.dataset.sp; flash = null; hud.rerender(); }));
      cv.onclick = (e) => {
        const rect = cv.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * W, y = ((e.clientY - rect.top) / rect.height) * H;
        let best = -1, bd = 34;
        screen.forEach((s, i) => { const d = Math.hypot(s.x - x, s.y - y); if (d < bd) { bd = d; best = i; } });
        if (best < 0) { hud.toast('Tap directly on an organism.'); return; }
        if (!selected) { hud.toast('First choose a species from the field guide list.'); return; }
        if (counted.has(best)) { hud.toast('Already tallied. Each organism counts once.'); return; }
        if (plants[best].species !== selected) {
          flash = screen[best];
          world.runner?.addMistake?.();
          hud.toast(`That isn't a ${SP[selected].name.replace(' (invasive)', '').toLowerCase()}. Compare it with the field guide.`, 'bad');
          hud.rerender();
          return;
        }
        counted.add(best);
        flash = null;
        state.partial[p.id] = [...counted];
        if (counted.size === plants.length) {
          state.counted[p.id] = field.counts(plants);
          delete state.partial[p.id];
          hud.closePanel();
          refreshPrompts();
          if (world.runner && !world.runner.done) ctx.interactions.emit('measure', p.id, state.counted[p.id]);
          else hud.toast(`Plot ${p.id} recorded.`, 'good');
          return;
        }
        hud.rerender();
      };
    }, { wide: true });
    hud.onPanelClose = () => { if (!state.counted[p.id]) { state.partial[p.id] = [...counted]; world.runner?.checkpoint(); } };
  }

  function dataHTML() {
    const ids = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];
    const cell = (id, s) => (state.counted[id] ? state.counted[id][s] || 0 : '—');
    const habTotal = (h, s) => HABITATS[h].plots.every((id) => state.counted[id]) ? HABITATS[h].plots.reduce((t, id) => t + (state.counted[id][s] || 0), 0) : '—';
    const N = (id) => (state.counted[id] ? Object.values(state.counted[id]).reduce((a, b) => a + b, 0) : '—');
    const habN = (h) => HABITATS[h].plots.every((id) => state.counted[id]) ? HABITATS[h].plots.reduce((t, id) => t + N(id), 0) : '—';
    return `
      <div class="table-wrap"><table class="data">
        <thead><tr><th>Species</th>${ids.map((id) => `<th>${id}</th>`).join('')}<th>Meadow total</th><th>Forest total</th><th>Lot total</th></tr></thead>
        <tbody>
          ${SPECIES.map((s) => `<tr><td><span class="dot" style="background:${s.color}"></span>${esc(s.name)}</td>${ids.map((id) => `<td>${cell(id, s.id)}</td>`).join('')}
            <td><strong>${habTotal('meadow', s.id)}</strong></td><td><strong>${habTotal('forest', s.id)}</strong></td><td><strong>${habTotal('disturbed', s.id)}</strong></td></tr>`).join('')}
          <tr class="sep"><td>Total organisms (N)</td>${ids.map((id) => `<td>${N(id)}</td>`).join('')}<td><strong>${habN('meadow')}</strong></td><td><strong>${habN('forest')}</strong></td><td><strong>${habN('disturbed')}</strong></td></tr>
        </tbody></table></div>
      <p class="hint">Simpson's diversity index: D = 1 − Σ n(n−1) / N(N−1). Use the habitat totals (both plots combined). — means not surveyed yet.</p>`;
  }

  function fieldGuideHTML() {
    return `<h3>Field guide</h3><ul>${SPECIES.map((s) => `<li><span class="dot" style="background:${s.color}"></span><strong>${esc(s.name)}</strong>: ${esc(s.look)}</li>`).join('')}</ul>`;
  }

  return world;
}
