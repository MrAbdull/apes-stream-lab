// Platform host: loads the campus or any subject world from its folder, then wires up
// the student, NPCs, interactions, missions, the assistant and progress.
// Adding a world = a new folder in platform/worlds/ plus one line in registry.json.

import { Stage, makeLabel, makeTerrain } from './engine/stage.js';
import { loadModels } from './engine/assets.js';
import { Scatter } from './engine/scatter.js';
import { HUD, esc } from './engine/hud.js';
import { Player } from './engine/player.js';
import { Interactions } from './engine/interact.js';
import { NPC } from './engine/npc.js';
import { MissionRunner } from './engine/mission.js';
import { Assistant } from './engine/assistant.js';
import { loadProfile, saveProfile, seedFor } from './engine/progress.js';
import { DEFAULT_AVATAR } from '../js/avatars.js';

const isTouch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);

export async function boot({ worldId, isCampus = false }) {
  const app = document.getElementById('app');
  const loading = document.getElementById('loading');
  const setLoading = (t) => { if (loading) loading.querySelector('span').textContent = t; };

  let profile = loadProfile();
  if (!profile && !isCampus) { location.href = 'index.html'; return; }

  const registry = await (await fetch(new URL('./worlds/registry.json', import.meta.url))).json();
  let manifest, mod;
  if (isCampus) {
    manifest = { id: 'campus', title: 'EarthLab Campus', subtitle: 'Choose a field station to explore', glossary: [], missions: [] };
    mod = await import('./campus/campus.js');
  } else {
    const entry = registry.find((w) => w.id === worldId && w.type === 'world');
    if (!entry) { location.href = 'index.html'; return; }
    manifest = await (await fetch(new URL(`./worlds/${worldId}/manifest.json`, import.meta.url))).json();
    mod = await import(`./worlds/${worldId}/world.js`);
  }

  const stage = new Stage(document.getElementById('scene'), manifest.stage || {});
  const hud = new HUD(document.getElementById('hud'), { title: manifest.title, subtitle: manifest.subtitle, isTouch });

  const ctx = {
    stage, hud, registry, manifest, isTouch, params,
    get profile() { return profile; },
    setProfile(p) { profile = p; saveProfile(p); },
    seed: profile ? seedFor(profile) : 'guest',
    loadModels: (map) => loadModels(map, (f) => setLoading(`Loading ${manifest.title}… ${Math.round(f * 100)}%`)),
    makeLabel, makeTerrain, Scatter,
  };

  const world = await mod.createWorld(ctx);
  const player = new Player(stage, {
    ground: world.ground, clamp: world.clamp, start: world.start,
    occluders: () => world.occluders?.() || [], joystick: hud.joystick,
  });
  await player.setAvatar(profile?.avatar || DEFAULT_AVATAR);
  ctx.player = player;
  const interactions = new Interactions(stage, player, hud);
  ctx.interactions = interactions;

  const npcs = [];
  ctx.addNPC = async (opts) => { const n = new NPC(stage, interactions, hud, world.ground, opts); await n.load(); npcs.push(n); return n; };
  await world.populate?.(ctx);
  ctx.npcs = npcs;

  hud.onBusyChange = (busy) => player.setInputEnabled(!busy);
  const assistant = new Assistant(manifest.glossary || []);

  // Missions
  let runner = null;
  ctx.startMission = async (missionId, { fresh = false } = {}) => {
    const meta = manifest.missions.find((m) => m.id === missionId);
    const mission = await (await fetch(new URL(`./worlds/${worldId}/${meta.file}`, import.meta.url))).json();
    if (fresh && profile.worlds[worldId]?.missions[missionId]) { profile.worlds[worldId].missions[missionId].checkpoint = null; saveProfile(profile); }
    world.resetForMission?.(mission, { fresh });
    runner = new MissionRunner({
      mission, world, hud, interactions, profile, worldId, npcs,
      onExit: (what) => {
        if (what === 'campus') location.href = 'index.html';
        else if (what === 'replay') { hud.closePanel(); location.href = `world.html?w=${worldId}&m=${missionId}&fresh=1`; }
      },
    });
    world.runner = runner;
    runner.start();
  };

  const openMissions = () => hud.openPanel('Missions', (body) => {
    const rec = (id) => profile.worlds[worldId]?.missions[id];
    body.innerHTML = `<p class="hint">${esc(manifest.intro || '')}</p>` + manifest.missions.map((m) => {
      const r = rec(m.id);
      const status = r?.status === 'complete' ? `✅ Best: ${r.best.score}/${r.best.max} (${r.best.grade})` : r?.status === 'in-progress' ? '⏳ In progress' : 'Not started';
      return `<div class="pf-mission"><div><h3>${esc(m.title)}</h3><p>${esc(m.summary)}</p><p class="muted">${esc(m.time || '')} · ${status}</p></div>
        <div class="col">${r?.status === 'in-progress' ? `<button class="primary" data-go="${m.id}">Resume</button><button class="secondary" data-fresh="${m.id}">Start over</button>`
          : `<button class="primary" data-fresh="${m.id}">${r?.status === 'complete' ? 'Play again' : 'Start'}</button>`}</div></div>`;
    }).join('') + '<button class="link" id="pf-free">Just explore for now</button>';
    body.querySelectorAll('[data-go]').forEach((b) => (b.onclick = () => { hud.closePanel(); ctx.startMission(b.dataset.go); }));
    body.querySelectorAll('[data-fresh]').forEach((b) => (b.onclick = () => {
      if (runner && !runner.done) { location.href = `world.html?w=${worldId}&m=${b.dataset.fresh}&fresh=1`; return; }
      hud.closePanel(); ctx.startMission(b.dataset.fresh, { fresh: true });
    }));
    body.querySelector('#pf-free').onclick = () => hud.closePanel();
  }, { wide: true });

  const openAsk = () => hud.openPanel('Ask the lab assistant', (body) => {
    body.innerHTML = `
      <p class="hint">Ask about a science idea, a tool, or what to do next. Works offline; nothing you type leaves this device.</p>
      <div class="row"><input id="pf-q" placeholder="e.g. What is Simpson's diversity index?" style="flex:1"><button class="primary" id="pf-ask">Ask</button></div>
      <div id="pf-answers"></div>`;
    const go = () => {
      const q = body.querySelector('#pf-q').value.trim();
      if (!q) return;
      const r = assistant.ask(q, { next: () => runner && !runner.done ? runner.currentInstruction() : 'Open Missions to start one, or explore freely.' });
      body.querySelector('#pf-answers').insertAdjacentHTML('afterbegin', `<div class="pf-qa"><p class="q">You: ${esc(q)}</p><p>${r.term ? `<strong>${esc(r.term)}:</strong> ` : ''}${esc(r.answer)}</p></div>`);
      body.querySelector('#pf-q').value = '';
    };
    body.querySelector('#pf-ask').onclick = go;
    body.querySelector('#pf-q').onkeydown = (e) => { if (e.key === 'Enter') go(); };
    setTimeout(() => body.querySelector('#pf-q')?.focus(), 50);
  });

  if (!isCampus) {
    hud.addAction('🎯 <span>Missions</span>', openMissions);
    if (world.openNotebook) hud.addAction('📓 <span>Data</span>', () => world.openNotebook());
  }
  hud.addAction('💬 <span>Ask</span>', openAsk);
  world.addActions?.(hud);
  if (!isCampus) hud.addAction('🏛️ <span>Campus</span>', () => { location.href = 'index.html'; }, { primary: true });

  // Frame loop
  stage.onFrame((dt, frame) => {
    const t = performance.now() / 1000;
    player.update(dt, t);
    interactions.update(t);
    for (const n of npcs) n.update(dt, t, player);
    world.update?.(dt, t, frame);
    const g = interactions.guidePosition();
    if (g && frame % 4 === 0) {
      const dx = g.x - player.pos.x, dz = g.z - player.pos.z, d = Math.hypot(dx, dz);
      const rel = Math.atan2(dx, dz) - (player.camYaw + Math.PI);
      const label = interactions.guideTarget?.label || world.labelFor?.(interactions.guideTarget?.id) || 'Target';
      hud.setCompass(d < 4 ? `${label}: here` : `${label} · ${Math.round(d)} m`, rel);
    } else if (!g) hud.setCompass(null);
  });
  stage.start();
  loading?.remove();

  await world.onReady?.(ctx);
  if (!isCampus) {
    const m = params.get('m');
    if (m && manifest.missions.some((x) => x.id === m)) ctx.startMission(m, { fresh: params.get('fresh') === '1' });
    else openMissions();
  }
  window.addEventListener('pagehide', () => world.savePose?.(player.getPose()));
  if (params.has('debug')) window.earthlab = { ctx, world, player, interactions, stage, get runner() { return runner; } };
  return ctx;
}
