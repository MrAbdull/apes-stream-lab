// The central campus: a plaza with portals to each subject world, a resident
// scientist who welcomes students, first-visit sign-up, and the progress Passport.

import * as THREE from 'three';
import { mulberry32 } from '../../js/rng.js';
import { AVATARS, SKIN_TONES, DEFAULT_AVATAR } from '../../js/avatars.js';
import { esc } from '../engine/hud.js';
import { newProfile, saveProfile, exportProfile, readProfileFile, streamLabStatus, streamIdFor } from '../engine/progress.js';
import { loadClass, labOpen, applyLabCode, pinCheck } from '../../js/classlink.js';
import { controlsSeen } from '../../js/controls.js';

const PORTAL_R = 30;
const smooth = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const ground = (x, z) => {
  const r = Math.hypot(x, z);
  return smooth(60, 140, r) * (6 + 3 * Math.sin(x * 0.05) * Math.cos(z * 0.04)) + 0.4 * Math.sin(x * 0.11 + z * 0.07) * smooth(45, 70, r);
};

const MODELS = {
  oak1: 'nature/common_tree_1.glb', oak2: 'nature/common_tree_2.glb', oak3: 'nature/common_tree_3.glb',
  pine1: 'nature/pine_tree_1.glb', pine2: 'nature/pine_tree_2.glb',
  bush1: 'nature/bush_1.glb', bush3: 'nature/bush_3.glb', berries: 'nature/bush_berries_1.glb',
  flower1: 'nature/flower_1.glb', flower2: 'nature/flower_2.glb', flower3: 'nature/flower_3.glb',
  grass2: 'nature/grass_2.glb', grass3: 'nature/grass_3.glb', stone4: 'nature/stone_4.glb',
  bA: 'town/building_A.gltf', bC: 'town/building_C.gltf', bD: 'town/building_D.gltf', bE: 'town/building_E.gltf',
  bF: 'town/building_F.gltf', bG: 'town/building_G.gltf', lamp: 'town/streetlight.gltf', bench: 'town/bench.gltf',
  cloud1: 'nature/cloud_1.glb', cloud2: 'nature/cloud_2.glb',
};

export async function createWorld(ctx) {
  const { stage, registry, makeTerrain, Scatter } = ctx;
  const scene = stage.scene;
  const models = await ctx.loadModels(MODELS);
  const portals = registry.map((w, i) => ({ ...w, angle: (i / registry.length) * Math.PI * 2 - Math.PI / 2 }));
  portals.forEach((p) => { p.x = Math.cos(p.angle) * PORTAL_R; p.z = Math.sin(p.angle) * PORTAL_R; });

  // Ground: paved plaza, paths out to every portal, lawns and meadow beyond.
  const C = (h) => new THREE.Color(h);
  const P = { paving: C('#c9c2b2'), paving2: C('#b9b1a0'), path: C('#b7a98c'), lawn: C('#7fb05a'), lawn2: C('#6a9f4b'), meadow: C('#8db15a'), hill: C('#6f8f45') };
  const onPath = (x, z) => portals.some((p) => {
    const t = Math.max(0, Math.min(1, (x * p.x + z * p.z) / (PORTAL_R * PORTAL_R)));
    return Math.hypot(x - p.x * t, z - p.z * t) < 2.2;
  });
  scene.add(makeTerrain(320, 220, ground, (x, z, c) => {
    const r = Math.hypot(x, z);
    const n = Math.sin(x * 0.3) * Math.cos(z * 0.27) * 0.5 + 0.5;
    if (r < 15) c.copy(Math.floor(r / 2.5) % 2 ? P.paving : P.paving2);
    else if (r < PORTAL_R + 4 && onPath(x, z)) c.copy(P.path);
    else if (Math.abs(r - PORTAL_R) < 4.5) c.copy(P.paving2);
    else if (r < 60) c.copy(P.lawn).lerp(P.lawn2, n);
    else c.copy(P.meadow).lerp(P.hill, smooth(70, 140, r));
  }));

  // Fountain
  const stone = new THREE.MeshStandardMaterial({ color: '#d8d2c4', roughness: 0.8 });
  const basin = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.4, 0.8, 40), stone);
  basin.position.y = 0.4;
  const water = new THREE.Mesh(new THREE.CylinderGeometry(3.9, 3.9, 0.1, 40), new THREE.MeshStandardMaterial({ color: '#4d9fc2', roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85 }));
  water.position.y = 0.72;
  const column = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.7, 2.6, 16), stone);
  column.position.y = 1.3;
  const globe = new THREE.Mesh(new THREE.IcosahedronGeometry(1.1, 2), new THREE.MeshStandardMaterial({ color: '#3b82c4', roughness: 0.4, flatShading: true }));
  globe.position.y = 3.4;
  const land = new THREE.Mesh(new THREE.IcosahedronGeometry(1.13, 1), new THREE.MeshStandardMaterial({ color: '#5fa04a', roughness: 0.8, flatShading: true, transparent: true, opacity: 0.9 }));
  land.position.y = 3.4;
  land.scale.set(1, 0.85, 1);
  scene.add(basin, water, column, globe, land);

  const scatter = new Scatter(scene, models, ground, ctx.colliders);
  const rnd = mulberry32(2024);
  const pick = (a) => a[Math.floor(rnd() * a.length)];
  const nearPortal = (x, z, r) => portals.some((p) => Math.hypot(x - p.x, z - p.z) < r);
  const bag = {};
  const put = (k, p) => (bag[k] ||= []).push(p);
  for (let i = 0; i < 2600; i++) {
    const a = rnd() * Math.PI * 2, r = 16 + rnd() * 130;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    if (onPath(x, z) || nearPortal(x, z, 7) || Math.abs(r - PORTAL_R) < 5) continue;
    const u = rnd();
    // Heights in meters: oaks 8–12, pines 9–14, shrubs ~1, grass and wildflowers knee height or lower.
    if (r > 58 && u < 0.32) { const k = pick(['oak1', 'oak2', 'oak3', 'pine1', 'pine2']); put(k, { x, z, rot: rnd() * 6.28, height: k.startsWith('pine') ? 9 + rnd() * 5 : 8 + rnd() * 4 }); }
    else if (r < 58 && r > 36 && u < 0.03) put(pick(['oak1', 'oak3']), { x, z, rot: rnd() * 6.28, height: 8 + rnd() * 3 });
    else if (u < 0.55) put(pick(['grass2', 'grass3']), { x, z, rot: rnd() * 6.28, height: 0.3 + rnd() * 0.35 });
    else if (u < 0.7) put(pick(['flower1', 'flower2', 'flower3']), { x, z, rot: rnd() * 6.28, height: 0.35 + rnd() * 0.25 });
    else if (u < 0.78) put(pick(['bush1', 'bush3', 'berries']), { x, z, rot: rnd() * 6.28, height: 0.7 + rnd() * 0.7 });
  }
  for (const [k, list] of Object.entries(bag)) {
    const tree = /oak|pine/.test(k);
    scatter.add(k, list, tree ? { near: 80, lod: k.startsWith('pine') ? 'pine' : 'oak', occludes: true, collide: 0.04 } : { near: 50, collide: /bush|berries/.test(k) ? 0.35 : 0 });
  }

  // Campus buildings behind the portals, lamps and benches around the plaza.
  const place = (key, x, z, scale, rot) => { const o = models[key].scene.clone(); o.position.set(x, ground(x, z), z); o.scale.setScalar(scale); o.rotation.y = rot; scene.add(o); return o; };
  const bkeys = ['bA', 'bC', 'bD', 'bE', 'bF', 'bG'];
  const col = ctx.colliders;
  portals.forEach((p, i) => {
    const r = PORTAL_R + 15, x = Math.cos(p.angle) * r, z = Math.sin(p.angle) * r, rot = -p.angle - Math.PI / 2;
    place(bkeys[i % bkeys.length], x, z, 6, rot);
    col.addBox(x, z, 5.4, 5.4, rot); // KayKit tiles are 2×2 units → 12 m buildings at scale 6
  });
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    place('lamp', Math.cos(a) * 15.5, Math.sin(a) * 15.5, 5, -a + Math.PI / 2);
    col.addCircle(Math.cos(a) * 15.5, Math.sin(a) * 15.5, 0.25);
    place('bench', Math.cos(a) * 12, Math.sin(a) * 12, 3.6, -a - Math.PI / 2);
    col.addBox(Math.cos(a) * 12, Math.sin(a) * 12, 0.9, 0.35, -a - Math.PI / 2);
  }
  col.addCircle(0, 0, 4.4); // fountain basin
  for (let i = 0; i < 10; i++) {
    const o = models[i % 2 ? 'cloud1' : 'cloud2'].scene.clone();
    o.scale.setScalar(5 + rnd() * 4); o.position.set(-160 + rnd() * 320, 70 + rnd() * 30, -160 + rnd() * 320);
    scene.add(o);
  }

  // Portals
  const portalMeshes = [];
  for (const p of portals) {
    const open = p.status === 'open';
    const g = new THREE.Group();
    g.position.set(p.x, ground(p.x, p.z), p.z);
    g.rotation.y = -p.angle - Math.PI / 2;
    const frame = new THREE.MeshStandardMaterial({ color: open ? p.color : '#9aa1a6', roughness: 0.5, metalness: 0.2 });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(2.2, 0.28, 12, 40), frame);
    ring.position.y = 2.6;
    const base = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.7, 0.4, 24), stone);
    base.position.y = 0.2;
    const pillarL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 1.4, 0.35), frame); pillarL.position.set(-1.6, 0.9, 0);
    const pillarR = pillarL.clone(); pillarR.position.x = 1.6;
    const surface = new THREE.Mesh(new THREE.CircleGeometry(2.0, 40), new THREE.MeshBasicMaterial({ color: open ? p.color : '#c9ced2', transparent: true, opacity: open ? 0.55 : 0.25, side: THREE.DoubleSide, depthWrite: false }));
    surface.position.y = 2.6;
    g.add(ring, base, pillarL, pillarR, surface);
    // Solid pillars on either side of the portal opening
    for (const side of [-1, 1]) {
      const lx = side * 1.6, c = Math.cos(g.rotation.y), s = Math.sin(g.rotation.y);
      ctx.colliders.addCircle(p.x + lx * c, p.z - lx * s, 0.3);
    }
    scene.add(g);
    p.group = g; p.surface = surface; p.frame = frame;
    portalMeshes.push(g);
  }

  // Labs the teacher hasn't opened look grey with a padlock. Re-run after a lab code changes them.
  const usable = (p) => p.status === 'open' && labOpen(p.id);
  function applyLocks() {
    for (const p of portals) {
      const open = p.status === 'open', ok = usable(p);
      p.frame.color.set(ok ? p.color : '#9aa1a6');
      p.surface.material.color.set(ok ? p.color : '#c9ced2');
      if (!ok) p.surface.material.opacity = 0.25;
      if (p.label) p.group.remove(p.label);
      p.label = ctx.makeLabel([p.title, !open ? 'Coming soon' : ok ? p.subject : '🔒 Locked by your teacher'], { accent: ok ? p.color : '#9aa1a6', scale: 0.75 });
      p.label.position.y = 5.6;
      p.group.add(p.label);
    }
  }
  applyLocks();

  const world = {
    ground,
    clamp: (pos) => { const r = Math.hypot(pos.x, pos.z); if (r > 135) { pos.x *= 135 / r; pos.z *= 135 / r; } },
    start: { x: 0, z: 22, facing: Math.PI },
    occluders: () => scatter.occluders(),
    update(dt, t, frame) {
      if (frame % 5 === 0) scatter.update(ctx.player.pos.x, ctx.player.pos.z);
      for (const p of portals) if (usable(p)) p.surface.material.opacity = 0.45 + 0.15 * Math.sin(t * 2 + p.angle);
      globe.rotation.y += dt * 0.3; land.rotation.y += dt * 0.3;
    },

    async populate(c) {
      for (const p of portals) {
        c.interactions.add({ id: `portal:${p.id}`, label: p.title, action: 'Enter', position: { x: p.x, y: ground(p.x, p.z), z: p.z }, radius: 4, height: 5, object: p.group, onUse: () => openPortal(p) });
      }
      world.guide = await c.addNPC({
        id: 'rivera', name: 'Dr. Rivera', role: 'Campus Director', avatar: { id: 'npc_scientist', skin: SKIN_TONES[2] },
        x: 3.5, z: 10, facing: Math.PI, idle: 'Welcome back to EarthLab!',
        dialogue: () => riveraDialogue(),
      });
      world.guide.setScript(() => riveraDialogue());
      // After talking to Dr. Rivera, point the way to a good first field station.
      c.interactions.on((g, id) => {
        if (g !== 'talk' || id !== 'rivera') return;
        const target = portals.find((p) => p.id === 'biodiversity' && usable(p)) || portals.find(usable);
        if (target) c.interactions.setGuide(`portal:${target.id}`);
      });
    },

    async onReady(c) {
      const cls = loadClass();
      const locked = c.params.get('locked');
      if (cls && (!c.profile || c.profile.classId !== cls.id)) await classSignIn(cls);
      else if (!c.profile) await signUp();
      else c.hud.toast(locked ? `${portals.find((p) => p.id === locked)?.title || 'That lab'} is locked. Your teacher will open it when it's time.` : `Welcome back, ${c.profile.name}!`);
      if (!controlsSeen('campus')) await c.showControls();
    },

    addActions(hud) {
      if (loadClass()) hud.addAction('🔑 <span>Lab code</span>', enterLabCode);
      hud.addAction('🪪 <span>Passport</span>', openPassport, { primary: true });
    },
    labelFor: (id) => (id?.startsWith('portal:') ? portals.find((p) => `portal:${p.id}` === id)?.title : null),
  };

  // ---------- dialogue ----------
  function riveraDialogue() {
    const name = ctx.profile?.name?.split(' ')[0] || 'there';
    const open = portals.filter(usable).length ? portals.filter(usable) : portals.filter((p) => p.status === 'open');
    return [
      `Hi ${name}! I'm Dr. Rivera. Welcome to the EarthLab campus, where you'll work as a field scientist.`,
      {
        text: 'Each glowing portal around the plaza leads to a field station. What would you like to know?',
        choices: [
          { label: 'Where should I start?', then: [`Try the ${open[1]?.title || open[0].title}. It's a great first mission. I've marked it for you.`], value: 'start' },
          { label: 'How do missions work?', then: ['Inside each station, open Missions. A guide arrow and the compass at the top lead you to each task.', 'You earn points for every task. Hints cost a few points, so try first! Score 70% or more to earn a badge for your Passport.'] },
          { label: 'How is my progress saved?', then: ['It saves automatically on this device. Open your Passport to see your scores, or download a progress file to switch devices or hand in to your teacher.'] },
          { label: "I'm ready, thanks!", end: true },
        ],
      },
    ];
  }


  // ---------- portals ----------
  function missionStatusHTML(p) {
    if (p.type === 'external' || p.id === 'cellbio') return '<p class="muted">This lab saves its own progress in your browser.</p>';
    if (p.id === 'stream') {
      const s = streamLabStatus(streamIdFor(ctx.profile));
      return s ? `<p class="muted">${s.finished ? '✅ Finished' : `⏳ In progress: ${s.sites} of 4 sites complete`}</p>` : '<p class="muted">Not started</p>';
    }
    const ms = ctx.profile?.worlds[p.id]?.missions || {};
    const done = Object.values(ms).filter((m) => m.status === 'complete');
    return done.length ? `<p class="muted">✅ ${done.length} mission${done.length > 1 ? 's' : ''} complete</p>` : '<p class="muted">Not started</p>';
  }

  function openPortal(p) {
    ctx.hud.openPanel(p.title, (body) => {
      body.innerHTML = `
        <div class="pf-portal" style="--c:${p.status === 'open' ? p.color : '#9aa1a6'}">
          <p class="pf-subject">${esc(p.subject)} · ${esc(p.units)}</p>
          <p>${esc(p.blurb)}</p>
          ${p.status !== 'open' ? '<p class="callout">This field station is still being built. Check back soon!</p>'
            : !usable(p) ? '<p class="callout warn">🔒 Your teacher hasn\'t opened this lab yet. When they do, they\'ll give you a lab code: tap 🔑 Lab code and type it.</p>' : missionStatusHTML(p)}
        </div>
        ${usable(p) ? `<div class="row"><button class="primary big" id="pf-enter">${p.type === 'external' ? 'Open in a new tab ↗' : 'Enter field station →'}</button></div>` : ''}`;
      body.querySelector('#pf-enter')?.addEventListener('click', () => {
        world.savePose?.();
        if (p.type === 'external') { window.open(p.url, '_blank', 'noopener'); return; }
        const code = p.id === 'stream' ? loadClass()?.stream : '';
        location.href = p.type === 'app' ? p.url + (code ? `?class=${encodeURIComponent(code)}` : '') : `world.html?w=${p.id}`;
      });
    });
  }

  // ---------- sign up / passport ----------
  function avatarPicker(el, current, onChange) {
    let pick = { ...current };
    const draw = () => {
      el.innerHTML = `
        <div class="avatar-grid">${AVATARS.map((a) => `<button class="avatar ${pick.id === a.id ? 'sel' : ''}" data-id="${a.id}"><img src="assets/characters/thumbs/${a.id}.jpg" alt="${esc(a.label)}" width="90" height="120"><span>${esc(a.label)}</span></button>`).join('')}</div>
        <div class="skin-row"><span>Skin tone</span>${SKIN_TONES.map((c) => `<button class="skin ${pick.skin === c ? 'sel' : ''}" data-skin="${c}" style="background:${c}" aria-label="Skin tone"></button>`).join('')}</div>`;
      el.querySelectorAll('.avatar').forEach((b) => (b.onclick = () => { pick = { ...pick, id: b.dataset.id }; onChange(pick); draw(); }));
      el.querySelectorAll('.skin').forEach((b) => (b.onclick = () => { pick = { ...pick, skin: b.dataset.skin }; onChange(pick); draw(); }));
    };
    draw();
  }

  function signUp() {
    return new Promise((resolve) => {
      let avatar = { ...DEFAULT_AVATAR };
      ctx.hud.openPanel('Welcome to EarthLab', (body) => {
        body.innerHTML = `
          <p class="callout">Joining your class? Open the <strong>class link</strong> your teacher gave you (or scan the QR code). Otherwise, practice on your own here.</p>
          <p class="lead">Create your field-scientist profile. Everything stays on this device.</p>
          <label>Your name<input id="su-name" autocomplete="name"></label>
          <label>Your school email <span class="hint">(links your work across labs; optional)</span><input id="su-email" type="email" inputmode="email" autocapitalize="off"></label>
          <h3>Choose your field scientist</h3><div id="su-avatar"></div>
          <p class="error" id="su-err"></p>
          <div class="row"><button class="primary big" id="su-go">Start exploring →</button>
          <label class="file-btn">📂 I have a progress file<input type="file" id="su-file" accept=".json,application/json"></label></div>`;
        avatarPicker(body.querySelector('#su-avatar'), avatar, (a) => { avatar = a; });
        body.querySelector('#su-go').onclick = async () => {
          const name = body.querySelector('#su-name').value.trim();
          const email = body.querySelector('#su-email').value.trim();
          if (!name) { body.querySelector('#su-err').textContent = 'Please enter your name.'; return; }
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { body.querySelector('#su-err').textContent = 'That email doesn\'t look right.'; return; }
          ctx.setProfile(newProfile({ name, email, avatar }));
          await ctx.player.setAvatar(avatar);
          ctx.hud.closePanel();
          ctx.hud.toast(`Welcome, ${name}! Go say hello to Dr. Rivera.`);
          ctx.interactions.setGuide('rivera');
          if (!controlsSeen('campus')) await ctx.showControls();
          resolve();
        };
        body.querySelector('#su-file').onchange = async (e) => {
          try {
            const p = await readProfileFile(e.target.files[0]);
            ctx.setProfile(p);
            await ctx.player.setAvatar(p.avatar || DEFAULT_AVATAR);
            ctx.hud.closePanel();
            ctx.hud.toast(`Welcome back, ${p.name}! Your progress was loaded.`);
            resolve();
          } catch (err) { body.querySelector('#su-err').textContent = err.message; }
        };
      }, { wide: true, locked: true });
    });
  }

  // Roster sign-in: pick your name, type your PIN.
  function classSignIn(cls, { switching = false } = {}) {
    return new Promise((resolve) => {
      const old = ctx.profile && !switching && ctx.profile.classId !== cls.id ? ctx.profile : null;
      let avatar = { ...(ctx.profile?.avatar || DEFAULT_AVATAR) }, fails = 0, waitUntil = 0, fromFile = null;
      ctx.hud.openPanel(`Join ${cls.name}`, (body) => {
        body.innerHTML = `
          <p class="lead">Choose your name and type the 4-digit PIN your teacher gave you.</p>
          <label>Your name<select id="si-name"><option value="">Choose your name…</option>${cls.roster.map((s, i) => `<option value="${i}">${esc(s.name)}</option>`).join('')}</select></label>
          <label>PIN<input id="si-pin" type="password" inputmode="numeric" maxlength="4" autocomplete="off" placeholder="••••"></label>
          ${old ? `<label class="pf-check"><input type="checkbox" id="si-keep"> Keep the progress already on this device (from ${esc(old.name)})</label>` : ''}
          <h3>Choose your field scientist</h3><div id="si-avatar"></div>
          <p class="error" id="si-err"></p>
          <div class="row"><button class="primary big" id="si-go">Join class →</button>
            <label class="file-btn">📂 I have a progress file<input type="file" id="si-file" accept=".json,application/json"></label>
            ${switching ? '<button class="secondary" id="si-cancel">Cancel</button>' : ''}</div>
          <p class="hint">Forgot your PIN? Ask your teacher.</p>`;
        avatarPicker(body.querySelector('#si-avatar'), avatar, (a) => { avatar = a; });
        const err = (m) => { body.querySelector('#si-err').textContent = m; };
        body.querySelector('#si-cancel')?.addEventListener('click', () => { ctx.hud.closePanel(); resolve(); });
        body.querySelector('#si-file').onchange = async (e) => {
          try {
            const p = await readProfileFile(e.target.files[0]);
            if (p.classId !== cls.id || !cls.roster[p.rosterIdx]) throw new Error('That progress file is from a different class.');
            fromFile = p;
            body.querySelector('#si-name').value = String(p.rosterIdx);
            err(''); ctx.hud.toast(`Progress file for ${p.name} loaded. Type your PIN to continue.`);
          } catch (x) { err(x.message); }
        };
        body.querySelector('#si-go').onclick = async () => {
          const idx = body.querySelector('#si-name').value, pin = body.querySelector('#si-pin').value.trim();
          if (idx === '') return err('Choose your name.');
          if (!/^\d{4}$/.test(pin)) return err('Type your 4-digit PIN.');
          if (Date.now() < waitUntil) return err(`Too many tries. Wait ${Math.ceil((waitUntil - Date.now()) / 1000)} seconds.`);
          const s = cls.roster[+idx];
          if (pinCheck(cls.id, +idx, pin) !== s.check) {
            fails++;
            if (fails >= 5) { waitUntil = Date.now() + 30000; fails = 0; }
            return err("That PIN doesn't match. Check it with your teacher.");
          }
          let p;
          if (fromFile && fromFile.rosterIdx === +idx) p = fromFile;
          else if (old && body.querySelector('#si-keep')?.checked) p = old;
          else if (ctx.profile?.classId === cls.id && ctx.profile.rosterIdx === +idx) p = ctx.profile;
          else p = newProfile({ name: s.name, avatar });
          Object.assign(p, { name: s.name, classId: cls.id, rosterIdx: +idx, avatar });
          ctx.setProfile(p);
          await ctx.player.setAvatar(avatar);
          ctx.hud.closePanel();
          ctx.hud.toast(`Welcome, ${s.name.split(' ')[0]}! Go say hello to Dr. Rivera.`);
          ctx.interactions.setGuide('rivera');
          if (!switching && !controlsSeen('campus')) await ctx.showControls();
          resolve();
        };
      }, { wide: true, locked: !switching });
    });
  }

  function enterLabCode() {
    ctx.hud.openPanel('Lab code', (body) => {
      body.innerHTML = `
        <p>Type the lab code your teacher shows on the board. It opens labs and sets the lab timer.</p>
        <label>Lab code<input id="lc-code" autocapitalize="characters" autocomplete="off" spellcheck="false" placeholder="XXXX-XXXX" maxlength="9"></label>
        <p class="error" id="lc-err"></p>
        <div class="row"><button class="primary big" id="lc-go">Apply</button></div>`;
      const go = () => {
        const cls = applyLabCode(body.querySelector('#lc-code').value);
        if (!cls) { body.querySelector('#lc-err').textContent = "That code doesn't work for your class. Check each letter and number."; return; }
        applyLocks();
        ctx.hud.closePanel();
        const names = portals.filter(usable).map((p) => p.title);
        ctx.hud.toast(names.length ? `Open now: ${names.join(', ')}` : 'All labs are locked for now.');
      };
      body.querySelector('#lc-go').onclick = go;
      body.querySelector('#lc-code').onkeydown = (e) => { if (e.key === 'Enter') go(); };
      setTimeout(() => body.querySelector('#lc-code')?.focus(), 50);
    });
  }

  function openPassport() {
    const p = ctx.profile;
    ctx.hud.openPanel('My Passport', (body) => {
      const rows = portals.filter((w) => w.status === 'open' && w.type !== 'external' && w.id !== 'cellbio').map((w) => {
        if (w.id === 'stream') {
          const s = streamLabStatus(streamIdFor(p));
          return `<tr><td>${esc(w.title)}</td><td>Stream Health Lab</td><td>${s ? (s.finished ? 'Finished' : `${s.sites}/4 sites`) : 'Not started'}</td><td>See PDF report</td></tr>`;
        }
        const ms = p.worlds[w.id]?.missions || {};
        const entries = Object.entries(ms);
        if (!entries.length) return `<tr><td>${esc(w.title)}</td><td>—</td><td>Not started</td><td>—</td></tr>`;
        return entries.map(([id, m]) => `<tr><td>${esc(w.title)}</td><td>${esc(id)}</td><td>${m.status === 'complete' ? `Complete (${m.attempts}×)` : 'In progress'}</td><td>${m.best ? `${m.best.score}/${m.best.max} · <strong>${m.best.grade}</strong>` : '—'}</td></tr>`).join('');
      }).join('');
      body.innerHTML = `
        <div class="pf-passport-head"><div><h3>${esc(p.name)}</h3><p class="muted">${esc(loadClass()?.id === p.classId ? loadClass().name : p.email || 'Practice (no class)')} · Joined ${new Date(p.createdAt).toLocaleDateString()}</p></div>
          <div class="pf-badges">${p.badges.length ? p.badges.map((b) => `<span class="pf-badge" title="${esc(b.name)}">${esc(b.icon || '🏅')} ${esc(b.name)}</span>`).join('') : '<span class="muted">No badges yet. Complete a mission with 70% or more!</span>'}</div></div>
        <table class="data"><thead><tr><th>Field station</th><th>Mission</th><th>Status</th><th>Best score</th></tr></thead><tbody>${rows}</tbody></table>
        <h3>Your character</h3><div id="pp-avatar"></div>
        <div class="row">
          <button class="primary" id="pp-export">💾 Download my progress file</button>
          <label class="file-btn">📂 Load a progress file<input type="file" id="pp-file" accept=".json,application/json"></label>
        </div>
        <p class="hint">Turn in your progress file when your teacher asks, or use it to continue on another device.</p>
        ${loadClass() ? '<button class="link" id="pp-switch">Not you? Sign in as a different student</button>' : ''}`;
      body.querySelector('#pp-switch')?.addEventListener('click', () => classSignIn(loadClass(), { switching: true }));
      let av = p.avatar || DEFAULT_AVATAR;
      avatarPicker(body.querySelector('#pp-avatar'), av, async (a) => { p.avatar = a; saveProfile(p); await ctx.player.setAvatar(a); });
      body.querySelector('#pp-export').onclick = () => exportProfile(p);
      body.querySelector('#pp-file').onchange = async (e) => {
        try {
          const np = await readProfileFile(e.target.files[0]);
          if (!confirm(`Replace the progress on this device with ${np.name}'s progress file?`)) return;
          ctx.setProfile(np); await ctx.player.setAvatar(np.avatar || DEFAULT_AVATAR); ctx.hud.rerender();
        } catch (err) { ctx.hud.toast(err.message, 'bad'); }
      };
    }, { wide: true });
  }

  // Remember where the student was standing on the campus.
  world.savePose = () => { try { sessionStorage.setItem('earthlab:campusPose', JSON.stringify(ctx.player.getPose())); } catch { /* ignore */ } };
  try {
    const pose = JSON.parse(sessionStorage.getItem('earthlab:campusPose') || 'null');
    if (pose) world.start = { x: pose.x, z: pose.z, facing: pose.facing };
  } catch { /* ignore */ }

  return world;
}
