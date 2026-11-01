// Student app: join → briefing → 3D field site → site stations → notebook → report.
// All progress is saved in this browser after every action (no server).

import { decodeClass, describeClass, normalizeCode, normalizeEmail, randomGroupCode, seedKeyFor, labFingerprint } from './codes.js';
import { GROUPS, TAXA, TAXON, TESTS, ROLES, RATINGS, generateLab, siteDisplayName, siteObservations } from './model.js';
import { bugSVG } from './bugs.js';
import { barChart } from './charts.js';
import { saveKey, readSave, writeSave, removeSave, requestPersistence, downloadFile, readFileAsText } from './storage.js';
import { summarize, buildPDF, buildCSV, mailtoLink, fmtTest } from './report.js';
import { checkTeammateFile, mergeTeam } from './team.js';
import { AVATARS, SKIN_TONES, DEFAULT_AVATAR } from './avatars.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const isTouch = navigator.maxTouchPoints > 0 || matchMedia('(pointer: coarse)').matches;

let S = null;      // the student's saved state
let LAB = null;    // their generated stream (organisms, chemistry, questions)
let CLS = null;    // decoded class settings
let KEY = null;    // localStorage key
let world = null;
let near = null;
let panel = null;
let inLab = false;

// ---------- helpers ----------

function show(id) {
  $$('.screen').forEach((s) => s.classList.toggle('hidden', s.id !== id));
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  layoutHUD();
  clearTimeout(toastTimer);
  // Long messages stay up longer so students can finish reading them.
  toastTimer = setTimeout(() => t.classList.remove('show'), Math.min(9000, 2600 + msg.length * 55));
}

// Keep the site button and messages above the buttons and joystick, measured on every change,
// so nothing overlaps on phones, iPads or laptops.
function layoutHUD() {
  const lab = $('#screen-lab');
  if (!lab || (lab.classList.contains('hidden') && $('#panel-backdrop').classList.contains('hidden'))) return;
  const vh = window.innerHeight, gap = 10;
  const shown = (el) => el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
  let floor = vh;
  for (const el of [$('.hud-actions'), $('#joystick')]) if (shown(el)) floor = Math.min(floor, el.getBoundingClientRect().top);
  const bottom = Math.round(vh - floor + gap);
  const btn = $('#btn-interact');
  btn.style.bottom = `${bottom}px`;
  let topBottom = 0;
  for (const el of [$('.hud-top'), $('#minimap')]) if (shown(el)) topBottom = Math.max(topBottom, el.getBoundingClientRect().bottom);
  const t = $('#toast');
  const above = bottom + (shown(btn) ? btn.getBoundingClientRect().height + gap : 0);
  t.style.maxWidth = ''; t.style.left = '';
  const th = t.getBoundingClientRect().height || 48;
  // A window is open: put messages above or below it, or (phones) over its title bar, clear of the ✕.
  if (!$('#panel-backdrop').classList.contains('hidden')) {
    const pr = $('#panel').getBoundingClientRect(), hr = $('#panel header').getBoundingClientRect();
    t.style.left = `${pr.left + pr.width / 2}px`;
    t.style.bottom = 'auto';
    if (pr.top - 6 >= th + 4) t.style.top = `${Math.round(pr.top - th - 6)}px`;
    else if (vh - pr.bottom - 6 >= th + 4) t.style.top = `${Math.round(pr.bottom + 6)}px`;
    else {
      t.style.maxWidth = `${Math.max(160, pr.width - 120)}px`;
      t.style.top = `${Math.round(Math.max(4, hr.top + (hr.height - t.getBoundingClientRect().height) / 2))}px`;
    }
  } else if (vh - above - th < topBottom + gap) { t.style.top = `${Math.round(topBottom + gap)}px`; t.style.bottom = 'auto'; }
  else { t.style.bottom = `${above}px`; t.style.top = 'auto'; }
}
window.addEventListener('resize', layoutHUD);

const me = () => S.student.name;

function log(msg) {
  S.log.push({ t: Date.now(), msg, by: me() });
}

function persist() {
  if (!S) return;
  const pose = world?.getPose();
  if (pose) S.pose = pose;
  S.updatedAt = Date.now();
  const ok = writeSave(KEY, S);
  $('#save-warning')?.classList.toggle('hidden', ok);
}

let persistTimer;
function persistSoon() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(persist, 600);
}

function fileSafe(s) {
  return String(s).replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').slice(0, 40) || 'student';
}

function downloadSaveFile() {
  persist();
  const date = new Date().toISOString().slice(0, 10);
  downloadFile(`StreamLab-save-${fileSafe(S.student.name)}-${date}.json`, JSON.stringify(S), 'application/json');
  log('Downloaded a save file');
  persist();
  toast('Save file downloaded. Keep it somewhere safe.');
}

function runSteps(el, steps, ms, done) {
  el.classList.remove('hidden');
  const bar = $('.bar', el), label = $('span', el);
  const start = performance.now();
  const tick = (now) => {
    const p = Math.min(1, (now - start) / ms);
    bar.style.width = `${p * 100}%`;
    label.textContent = steps[Math.min(steps.length - 1, Math.floor(p * steps.length))];
    if (p < 1) requestAnimationFrame(tick); else done();
  };
  requestAnimationFrame(tick);
}

// ---------- panel (modal) ----------

function openPanel(title, render, { wide = false } = {}) {
  panel = { render };
  $('#panel-title').textContent = title;
  $('#panel').classList.toggle('wide', wide);
  $('#panel-backdrop').classList.remove('hidden');
  requestAnimationFrame(layoutHUD);
  $('#btn-interact').classList.add('hidden');
  world?.setInputEnabled(false);
  rerender();
  $('#panel-body').scrollTop = 0;
}

function rerender() {
  if (!panel) return;
  const body = $('#panel-body');
  const scroll = body.scrollTop;
  body.innerHTML = '';
  panel.render(body);
  body.scrollTop = scroll;
}

function closePanel() {
  panel = null;
  $('#panel-backdrop').classList.add('hidden');
  requestAnimationFrame(layoutHUD);
  world?.setInputEnabled(true);
  refreshHUD();
}

// ---------- join ----------

function campusProfile() {
  try { return JSON.parse(localStorage.getItem('earthlab:profile:v1') || 'null'); } catch { return null; }
}

function renderJoin(prefill = '') {
  $('#screen-join').innerHTML = `
    <div class="join-card card">
      <div class="brand">
        <div class="logo" aria-hidden="true">${bugSVG('mayfly', 54)}</div>
        <div><h1>Stream Health Lab</h1><p class="sub">Macroinvertebrate field survey · AP Environmental Science</p></div>
      </div>
      <label>Class code
        <input id="j-class" autocomplete="off" autocapitalize="characters" spellcheck="false" placeholder="e.g. 3E3R-J0Z" value="${esc(prefill)}">
      </label>
      <p id="j-class-info" class="hint"></p>
      <div id="j-rest" class="hidden">
        <label>Your name<input id="j-name" autocomplete="name"></label>
        <label>Your school email<input id="j-email" type="email" autocomplete="email" inputmode="email" autocapitalize="off" spellcheck="false"></label>
        <div id="j-group" class="hidden">
          <label>Group code<input id="j-gcode" autocomplete="off" autocapitalize="characters" spellcheck="false" maxlength="5"></label>
          <p id="j-ghint" class="hint"></p>
          <button type="button" id="j-newgroup" class="link hidden">Make a new group code</button>
          <label>Your role
            <select id="j-role"><option value="">Choose your role…</option>${Object.entries(ROLES).map(([k, r]) => `<option value="${k}">${esc(r.name)}: ${esc(r.does)}</option>`).join('')}</select>
          </label>
        </div>
        <p id="j-error" class="error" role="alert"></p>
        <button id="j-start" class="primary big">Continue</button>
        <div class="divider"><span>or</span></div>
        <label class="file-btn">📂 Continue from a save file<input type="file" id="j-file" accept=".json,application/json"></label>
      </div>
    </div>`;

  const update = () => {
    const cls = decodeClass($('#j-class').value);
    const raw = normalizeCode($('#j-class').value);
    $('#j-class-info').textContent = cls ? describeClass(cls) : raw.length >= 7 ? 'That code doesn\'t look right. Check it with your teacher.' : '';
    $('#j-class-info').className = cls ? 'hint good' : 'hint error';
    $('#j-rest').classList.toggle('hidden', !cls);
    $('#j-group').classList.toggle('hidden', !cls || cls.mode !== 'group');
    if (cls?.mode === 'group') {
      const self = cls.formation === 'students';
      $('#j-newgroup').classList.toggle('hidden', !self);
      $('#j-ghint').textContent = self
        ? 'One teammate makes a new group code and shares it. Everyone in the group enters the same code.'
        : 'Enter the group code your teacher gave you.';
    }
  };
  $('#j-class').addEventListener('input', update);
  update();
  // Students arriving from the EarthLab campus don't retype their name and email.
  const campus = campusProfile();
  if (campus) {
    $('#j-name').value = campus.name || '';
    $('#j-email').value = campus.email || '';
  }
  $('#j-newgroup').onclick = () => {
    $('#j-gcode').value = randomGroupCode();
    toast('New group code made. Share it with your teammates.');
  };
  $('#j-start').onclick = onStart;
  $('#j-file').onchange = (e) => e.target.files[0] && loadOwnSaveFile(e.target.files[0]);
  $('#screen-join').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') onStart(); });
}

function joinError(msg) {
  $('#j-error').textContent = msg;
}

function readJoinForm() {
  const cls = decodeClass($('#j-class').value);
  if (!cls) return joinError('That class code isn\'t valid. Check it with your teacher.');
  const name = $('#j-name').value.trim().replace(/\s+/g, ' ');
  const email = normalizeEmail($('#j-email').value);
  if (!name) return joinError('Enter your name.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return joinError('Enter a valid email address.');
  let group = null;
  if (cls.mode === 'group') {
    const code = normalizeCode($('#j-gcode').value);
    if (code.length !== 4) return joinError('Enter your 4-character group code.');
    const role = $('#j-role').value;
    if (!role) return joinError('Choose your role.');
    group = { code, role };
  }
  joinError('');
  return { cls, name, email, group };
}

function onStart() {
  const f = readJoinForm();
  if (!f) return;
  CLS = f.cls;
  KEY = saveKey(f.cls.code, f.email, f.group?.code);
  const existing = readSave(KEY);
  if (existing) askResume(existing, f);
  else askFirstTime(f);
}

function progressLine(state) {
  const lab = generateLab(state.seedKey, state.settings);
  const sum = summarize(state, lab);
  return `${sum.sitesComplete} of 4 sites complete · ${sum.answered} of ${lab.questions.length} questions answered`;
}

function askResume(existing, f) {
  openPanel('Welcome back!', (body) => {
    body.innerHTML = `
      <p class="lead">Hi <strong>${esc(existing.student.name)}</strong>, you started this lab on ${esc(new Date(existing.createdAt).toLocaleDateString())}.</p>
      <p>${esc(progressLine(existing))}</p>
      <div class="row">
        <button class="primary big" id="r-continue">Continue where I left off</button>
        <button class="secondary" id="r-over">Start over</button>
      </div>`;
    $('#r-continue').onclick = () => {
      S = existing;
      if (f.group && S.group) S.group.role = f.group.role;
      closePanel();
      enterLab();
    };
    $('#r-over').onclick = () => {
      if (!confirm('Start over? This erases your saved progress for this lab on this device.')) return;
      removeSave(KEY);
      closePanel();
      createNew(f);
    };
  });
}

function askFirstTime(f) {
  openPanel('Have you started this lab before?', (body) => {
    body.innerHTML = `
      <p class="lead">We didn't find saved progress for <strong>${esc(f.email)}</strong> on this device.</p>
      <div class="row">
        <button class="primary big" id="f-new">No, this is my first time</button>
        <button class="secondary big" id="f-before">Yes, I started before</button>
      </div>
      <div id="f-more" class="hidden callout">
        <p>Your progress is saved in the browser you used last time. Try these:</p>
        <ul>
          <li>Use the <strong>same device and browser</strong> you started on.</li>
          <li>Check that you typed the <strong>same email</strong>${f.group ? ' and <strong>group code</strong>' : ''} as before.</li>
          <li>If you downloaded a <strong>save file</strong>, load it here:</li>
        </ul>
        <label class="file-btn">📂 Load my save file<input type="file" id="f-file" accept=".json,application/json"></label>
        <button class="link" id="f-new2">Start a new lab anyway</button>
      </div>`;
    $('#f-new').onclick = () => { closePanel(); createNew(f); };
    $('#f-new2').onclick = () => { closePanel(); createNew(f); };
    $('#f-before').onclick = () => $('#f-more').classList.remove('hidden');
    $('#f-file').onchange = (e) => { if (e.target.files[0]) { closePanel(); loadOwnSaveFile(e.target.files[0], f.email); } };
  });
}

function emptySite() {
  return { kicked: null, ids: {}, tests: {}, notes: '', index: null, rating: null };
}

function createNew(f) {
  const { cls, name, email, group } = f;
  S = {
    v: 1, lab: 'stream',
    classCode: cls.code,
    settings: { labId: cls.labId, mode: cls.mode, formation: cls.formation, scenario: cls.scenario, groupSize: cls.groupSize, salt: cls.salt },
    student: { name, email },
    group,
    seedKey: seedKeyFor(cls, email, group?.code),
    createdAt: Date.now(), updatedAt: Date.now(), finishedAt: null,
    activeMs: 0, tabSwitches: 0, briefed: false, pose: null,
    visited: {}, sites: { 1: emptySite(), 2: emptySite(), 3: emptySite(), 4: emptySite() },
    answers: {}, log: [],
    team: [{ name, email, role: group?.role || null }], merged: [],
  };
  log('Started the lab');
  persist();
  enterLab();
}

async function loadOwnSaveFile(file, expectedEmail) {
  try {
    const data = JSON.parse(await readFileAsText(file));
    const cls = data && data.lab === 'stream' && decodeClass(data.classCode);
    if (!cls || !data.student?.email) throw new Error('That file is not a Stream Health Lab save file.');
    const typed = expectedEmail || normalizeEmail($('#j-email')?.value);
    if (typed && typed !== data.student.email) throw new Error(`That save file belongs to ${data.student.name} (${data.student.email}).`);
    CLS = cls;
    KEY = saveKey(data.classCode, data.student.email, data.group?.code);
    S = data;
    log('Continued from a save file');
    persist();
    toast(`Welcome back, ${S.student.name}! Your progress was loaded.`);
    enterLab();
  } catch (e) {
    show('screen-join');
    joinError(e.message || 'Could not read that file.');
    toast(e.message || 'Could not read that file.');
  }
}

// ---------- briefing ----------

function enterLab() {
  LAB = generateLab(S.seedKey, S.settings);
  requestPersistence();
  inLab = true;
  if (!S.briefed) renderBrief();
  else startWorld();
}

function renderBrief() {
  show('screen-brief');
  const role = S.group ? ROLES[S.group.role] : null;
  $('#screen-brief').innerHTML = `
    <div class="brief card">
      <h1>Your mission</h1>
      <p class="lead">A town wants to know how healthy its stream is, and why it changes from place to place. You'll survey four sites along the stream, collect and identify macroinvertebrates (aquatic insects and other small animals without backbones), test the water, and use your data to explain what's happening.</p>
      ${LAB.mystery ? '<p class="callout"><strong>Mystery mode:</strong> Something is entering the stream from a pipe at Site 3, and nobody knows what it is. Use your evidence to work out the most likely pollution source.</p>' : ''}
      <div class="brief-grid">
        <div>
          <h3>At each site</h3>
          <ol>
            <li><strong>Kick-net sample:</strong> collect organisms into the sorting tray.</li>
            <li><strong>Identify</strong> each specimen with the ID Guide.</li>
            <li><strong>Water tests:</strong> temperature, dissolved oxygen, pH, nitrate, phosphate, turbidity and flow.</li>
          </ol>
          <h3>Then, in your Notebook</h3>
          <ol>
            <li>Calculate the <strong>water-quality index</strong> for each site.</li>
            <li>Answer the analysis questions using your data.</li>
            <li>Press <strong>Finish</strong> to download your report.</li>
          </ol>
        </div>
        <div>
          <h3>Controls</h3>
          ${isTouch
            ? '<p><strong>Move:</strong> use the joystick (bottom left).<br><strong>Look around:</strong> drag anywhere on the screen.<br><strong>Open a site:</strong> tap the green button when you reach a site.</p>'
            : '<p><strong>Move:</strong> W A S D or arrow keys (hold Shift to run).<br><strong>Look around:</strong> click and drag.<br><strong>Open a site:</strong> press E or click the green button.</p>'}
          <p>Follow the stream downhill. Each site has a <strong>yellow beacon</strong> that turns <strong>green</strong> when you've finished that site.</p>
          ${role ? `<h3>Your role: ${esc(role.name)}</h3><p>${esc(role.does)} Everyone can help with every task. Your work is credited to you, and at the end your team combines files into one group report.</p>` : ''}
          <h3>Saving</h3>
          <p>Your progress saves automatically on this device. To switch devices, use <strong>💾 Save file</strong> and load it on the new device.</p>
          <p class="hint">Your Lab ID: <strong>${labFingerprint(S.seedKey)}</strong>. Your stream's data is unique to you${S.group ? 'r group' : ''}.</p>
        </div>
      </div>
      <h3>Choose your field scientist</h3>
      <div id="b-avatar"></div>
      <button class="primary big" id="b-go">Enter the field site →</button>
    </div>`;
  let avatar = S.avatar || campusProfile()?.avatar || DEFAULT_AVATAR;
  avatarPicker($('#b-avatar'), avatar, (p) => { avatar = p; });
  $('#b-go').onclick = () => {
    S.avatar = avatar;
    S.briefed = true;
    log('Read the briefing');
    persist();
    startWorld();
  };
}

// ---------- world + HUD ----------

function siteSummary(id) {
  return summarize(S, LAB).sites[id - 1];
}

function siteStatus(id) {
  if (siteSummary(id).complete) return 'done';
  return S.visited[id] ? 'visited' : 'new';
}

async function startWorld() {
  show('screen-lab');
  $('#joystick').classList.toggle('hidden', !isTouch);
  if (!world) {
    const loading = $('#world .world-loading');
    try {
      const { StreamWorld } = await import('./world.js');
      const w = new StreamWorld($('#world'), {
        chems: LAB.sites.map((s) => s.chem),
        mystery: LAB.mystery,
        onNear,
        minimap: $('#minimap'),
        joystick: isTouch ? $('#joystick') : null,
        siteStatus,
        avatar: S.avatar || DEFAULT_AVATAR,
        onProgress: (f) => { if (loading) loading.textContent = `Loading the field site… ${Math.round(f * 100)}%`; },
      });
      await w.ready;
      world = w;
      loading?.remove();
      if (S.pose) world.setPose(S.pose);
      if (panel) world.setInputEnabled(false);
    } catch (e) {
      console.error(e);
      $('#world').innerHTML = '<div class="world-error card"><h3>The 3D field site couldn\'t load.</h3><p>Check your internet connection and reload the page. Meanwhile, you can open each site station from the site buttons at the top.</p></div>';
    }
  }
  refreshHUD();
}

// ---------- character picker ----------

function avatarPicker(el, current, onChange) {
  let pick = { ...current };
  const draw = () => {
    el.innerHTML = `
      <div class="avatar-grid">${AVATARS.map((a) => `
        <button class="avatar ${pick.id === a.id ? 'sel' : ''}" data-id="${a.id}" aria-pressed="${pick.id === a.id}">
          <img src="assets/characters/thumbs/${a.id}.jpg" alt="${esc(a.label)}" width="90" height="120"><span>${esc(a.label)}</span>
        </button>`).join('')}</div>
      <div class="skin-row"><span>Skin tone</span>${SKIN_TONES.map((c) => `<button class="skin ${pick.skin === c ? 'sel' : ''}" data-skin="${c}" style="background:${c}" aria-label="Skin tone" aria-pressed="${pick.skin === c}"></button>`).join('')}</div>`;
    $$('.avatar', el).forEach((b) => (b.onclick = () => { pick = { ...pick, id: b.dataset.id }; onChange(pick); draw(); }));
    $$('.skin', el).forEach((b) => (b.onclick = () => { pick = { ...pick, skin: b.dataset.skin }; onChange(pick); draw(); }));
  };
  draw();
}

function openCharacter() {
  openPanel('Change my character', (body) => {
    let choice = S.avatar || DEFAULT_AVATAR;
    body.innerHTML = '<div id="pick"></div><div class="row"><button class="primary big" id="pick-save">Use this character</button></div>';
    avatarPicker($('#pick', body), choice, (p) => { choice = p; });
    $('#pick-save', body).onclick = async (e) => {
      e.target.disabled = true;
      S.avatar = choice;
      persist();
      await world?.setAvatar(choice);
      closePanel();
    };
  });
}

function onNear(id) {
  near = id;
  if (id && !S.visited[id]) {
    S.visited[id] = true;
    log(`Arrived at Site ${id}`);
    persist();
    toast(`You reached Site ${id}: ${siteDisplayName(LAB, id)}`);
  }
  refreshHUD();
}

function refreshHUD() {
  requestAnimationFrame(layoutHUD);
  if (!S || !LAB) return;
  $('#hud-who').textContent = S.group
    ? `${S.student.name} · Group ${S.group.code} · ${ROLES[S.group.role]?.name || ''}`
    : S.student.name;
  $('#hud-sites').innerHTML = LAB.sites.map((s) => {
    const st = siteStatus(s.id);
    return `<button class="chip ${st}" data-site="${s.id}" title="Site ${s.id}: ${esc(siteDisplayName(LAB, s.id))}">${st === 'done' ? '✓' : s.id}<span>${esc(siteDisplayName(LAB, s.id))}</span></button>`;
  }).join('');
  $$('#hud-sites .chip').forEach((b) => (b.onclick = () => onChip(+b.dataset.site)));
  for (const s of LAB.sites) world?.setSiteDone(s.id, siteStatus(s.id) === 'done');
  const btn = $('#btn-interact');
  btn.classList.toggle('hidden', !near || !!panel);
  if (near) btn.textContent = `Open Site ${near} station${isTouch ? '' : ' (E)'}`;
}

function onChip(id) {
  if (!world) return openSite(id);
  if (S.visited[id]) {
    world.teleport(id);
    toast(`Traveled to Site ${id}.`);
  } else {
    toast(`Walk to Site ${id} first: follow the stream and look for the yellow beacon. After your first visit you can tap here to travel.`);
  }
}

// ---------- site station ----------

let siteView = { id: 1, tab: 'bugs', specimen: null };

function openSite(id) {
  siteView = { id, tab: siteView.id === id ? siteView.tab : 'bugs', specimen: null };
  if (!S.visited[id]) { S.visited[id] = true; log(`Arrived at Site ${id}`); persist(); }
  openPanel(`Site ${id} · ${siteDisplayName(LAB, id)}`, renderSite, { wide: true });
}

function renderSite(body) {
  const id = siteView.id, site = LAB.sites[id - 1], sum = siteSummary(id);
  const badge = (done, total) => `<span class="badge ${done === total ? 'ok' : ''}">${done}/${total}</span>`;
  body.innerHTML = `
    <div class="site-head">
      <p><strong>${esc(site.landUse)}.</strong> ${esc(site.about)}</p>
      <ul class="obs-list">${siteObservations(LAB, id).map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
    </div>
    <div class="tabs" role="tablist">
      <button class="tab ${siteView.tab === 'bugs' ? 'active' : ''}" data-tab="bugs">Macroinvertebrates ${badge(sum.idsCorrect, sum.idsTotal)}</button>
      <button class="tab ${siteView.tab === 'tests' ? 'active' : ''}" data-tab="tests">Water tests ${badge(sum.testsDone, TESTS.length)}</button>
      <button class="tab ${siteView.tab === 'notes' ? 'active' : ''}" data-tab="notes">Notes</button>
    </div>
    <div id="site-tab"></div>`;
  $$('.tab', body).forEach((b) => (b.onclick = () => { siteView.tab = b.dataset.tab; siteView.specimen = null; rerender(); }));
  const tab = $('#site-tab', body);
  if (siteView.tab === 'bugs') renderBugs(tab, id);
  else if (siteView.tab === 'tests') renderTests(tab, id);
  else renderNotes(tab, id);
}

function renderBugs(tab, id) {
  const site = LAB.sites[id - 1], ss = S.sites[id];
  if (!ss.kicked) {
    tab.innerHTML = `
      <div class="procedure">
        <h3>Kick-net sample</h3>
        <ol>
          <li>Find a riffle (shallow, fast water over rocks). Hold the net upright on the bottom, facing upstream.</li>
          <li>Kick and rub the rocks in a 1 m × 1 m area just upstream of the net for 60 seconds.</li>
          <li>Lift the net and rinse everything into the white sorting tray.</li>
        </ol>
        <button class="primary big" id="kick">Take the kick-net sample</button>
        <div class="progress hidden" id="kick-prog"><div class="bar"></div><span></span></div>
      </div>`;
    $('#kick', tab).onclick = (e) => {
      e.target.disabled = true;
      runSteps($('#kick-prog', tab), ['Placing the net…', 'Kicking the rocks for 60 seconds…', 'Rinsing the net into the tray…'], 2600, () => {
        ss.kicked = { by: me(), at: Date.now() };
        log(`Took the kick-net sample at Site ${id}`);
        persist();
        rerender();
      });
    };
    return;
  }
  if (siteView.specimen != null) return renderIdView(tab, id, siteView.specimen);
  const done = site.organisms.filter((o) => ss.ids[o.taxonId]?.correct).length;
  tab.innerHTML = `
    <p class="hint">Your sorting tray holds ${site.organisms.length} kinds of organisms. Tap each specimen to identify it. Compare with the 🔎 ID Guide. Identified: <strong>${done} of ${site.organisms.length}</strong>.</p>
    <div class="tray">
      ${site.organisms.map((o, i) => {
        const t = TAXON[o.taxonId], ok = ss.ids[o.taxonId]?.correct;
        return `<button class="specimen ${ok ? 'ok' : ''}" data-i="${i}">
          ${bugSVG(o.taxonId, 88)}
          <span class="count">×${o.count}</span>
          <span class="lbl">${ok ? esc(t.name) : `Specimen ${String.fromCharCode(65 + i)}`}</span>
          ${ok ? `<span class="grp" style="background:${GROUPS[t.group].color}">${GROUPS[t.group].short}</span>` : '<span class="grp unk">Tap to identify</span>'}
        </button>`;
      }).join('')}
    </div>
    <button class="secondary" id="open-guide">🔎 Open the ID Guide</button>`;
  $$('.specimen', tab).forEach((b) => (b.onclick = () => { siteView.specimen = +b.dataset.i; rerender(); }));
  $('#open-guide', tab).onclick = () => openGuide(() => openSite(id));
}

function renderIdView(tab, id, i) {
  const site = LAB.sites[id - 1], ss = S.sites[id];
  const o = site.organisms[i], t = TAXON[o.taxonId], rec = ss.ids[o.taxonId];
  const letter = String.fromCharCode(65 + i);
  tab.innerHTML = `
    <button class="link back" id="back">← Back to the tray</button>
    <div class="id-view">
      <div class="specimen-big">${bugSVG(o.taxonId, 240)}<p class="hint">Actual size: about ${esc(t.size)}. You found ${o.count} of these.</p></div>
      <div class="id-form">
        <h3>Specimen ${letter}</h3>
        ${rec?.correct
          ? `<p class="good">✓ Identified as <strong>${esc(t.name)}</strong></p>
             <p><span class="grp" style="background:${GROUPS[t.group].color}">${GROUPS[t.group].name}</span></p>
             <p>${esc(GROUPS[t.group].desc)}</p>`
          : `<p>Look carefully at the body shape, legs, tails, gills and any shell or case. Then choose a match.</p>
             <label>What is it?
               <select id="id-pick"><option value="">Choose an organism…</option>
                 ${TAXA.slice().sort((a, b) => a.name.localeCompare(b.name)).map((x) => `<option value="${x.id}">${esc(x.name)}</option>`).join('')}
               </select>
             </label>
             <div class="row"><button class="primary" id="id-confirm">Confirm ID</button><button class="secondary" id="id-guide">🔎 ID Guide</button></div>
             <p id="id-fb" class="feedback" role="status"></p>`}
      </div>
    </div>`;
  $('#back', tab).onclick = () => { siteView.specimen = null; rerender(); };
  if (rec?.correct) return;
  $('#id-guide', tab).onclick = () => openGuide(() => { openSite(id); siteView.specimen = i; rerender(); });
  $('#id-confirm', tab).onclick = () => {
    const g = $('#id-pick', tab).value;
    if (!g) return;
    const r = ss.ids[o.taxonId] || { attempts: 0 };
    r.attempts += 1; r.guess = g; r.by = me(); r.at = Date.now();
    r.correct = g === o.taxonId;
    ss.ids[o.taxonId] = r;
    if (r.correct) {
      log(`Identified Specimen ${letter} at Site ${id} as ${t.name}`);
      persist();
      rerender();
      refreshHUD();
    } else {
      log(`Incorrect ID for Specimen ${letter} at Site ${id} (guessed ${TAXON[g].name})`);
      persist();
      const fb = $('#id-fb', tab);
      fb.className = 'feedback bad';
      fb.textContent = `Not quite. Hint: ${t.hint}`;
    }
  };
}

function renderTests(tab, id) {
  const ss = S.sites[id];
  tab.innerHTML = `<div class="tests">${TESTS.map((t) => {
    const rec = ss.tests[t.id];
    return `<div class="test-card ${rec ? 'done' : ''}">
      <div class="t-name">${esc(t.name)}</div>
      <div class="t-tool">${esc(t.tool)}</div>
      ${rec
        ? `<div class="t-val">${esc(fmtTest(t, rec.value))}</div><div class="t-by">Measured by ${esc(rec.by)}</div>`
        : `<p class="t-how">${esc(t.how)}</p><button class="primary" data-test="${t.id}">Run test</button><div class="progress hidden"><div class="bar"></div><span></span></div>`}
    </div>`;
  }).join('')}</div>`;
  $$('[data-test]', tab).forEach((b) => (b.onclick = () => {
    const t = TESTS.find((x) => x.id === b.dataset.test);
    const value = LAB.sites[id - 1].chem[t.id];
    b.disabled = true;
    const prog = b.nextElementSibling;
    const steps = t.id === 'flow'
      ? Array.from({ length: 12 }, (_, k) => `Stopwatch: ${((value * (k + 1)) / 12).toFixed(1)} s`)
      : ['Collecting sample…', 'Measuring…', 'Reading result…'];
    runSteps(prog, steps, t.id === 'flow' ? 2200 : 1500, () => {
      ss.tests[t.id] = { value, by: me(), at: Date.now() };
      log(`${t.name} at Site ${id}: ${fmtTest(t, value)}`);
      persist();
      rerender();
      refreshHUD();
    });
  }));
}

function renderNotes(tab, id) {
  const ss = S.sites[id];
  tab.innerHTML = `
    <label>Field notes for Site ${id}. Record what you see, smell and notice about the surroundings.
      <textarea id="notes" rows="8" placeholder="e.g. Banks are eroded, cattle tracks in the mud, water is cloudy…">${esc(ss.notes)}</textarea>
    </label>
    <p class="hint" id="notes-status">Notes save automatically.</p>`;
  $('#notes', tab).oninput = (e) => {
    ss.notes = e.target.value;
    $('#notes-status', tab).textContent = 'Saving…';
    persistSoon();
    setTimeout(() => { const el = $('#notes-status'); if (el) el.textContent = 'Saved ✓'; }, 700);
  };
}

// ---------- ID guide ----------

function openGuide(back) {
  openPanel('Macroinvertebrate ID Guide', (body) => {
    body.innerHTML = `
      ${back ? '<button class="link back" id="g-back">← Back to the site</button>' : ''}
      <p class="hint">Organisms are grouped by how much pollution they can tolerate. Water-quality index = (number of sensitive TYPES × 3) + (somewhat sensitive TYPES × 2) + (tolerant TYPES × 1).</p>
      ${[1, 2, 3].map((g) => `
        <h3 class="guide-group" style="border-color:${GROUPS[g].color}">${GROUPS[g].name} <small>(× ${GROUPS[g].weight})</small></h3>
        <p class="hint">${esc(GROUPS[g].desc)}</p>
        <div class="guide">${TAXA.filter((t) => t.group === g).map((t) => `
          <div class="guide-card">${bugSVG(t.id, 96)}<div><strong>${esc(t.name)}</strong><p>${esc(t.look)}</p><p class="hint">Size: ${esc(t.size)}</p></div></div>`).join('')}
        </div>`).join('')}`;
    if (back) $('#g-back', body).onclick = back;
  }, { wide: true });
}

// ---------- notebook ----------

let nbTab = 'data';

function openNotebook(tab) {
  if (tab) nbTab = tab;
  openPanel('Lab Notebook', renderNotebook, { wide: true });
}

function renderNotebook(body) {
  const tabs = [['data', 'Data table'], ['graphs', 'Graphs'], ['analysis', 'Index analysis'], ['questions', 'Questions']];
  if (S.group) tabs.push(['team', 'Team']);
  body.innerHTML = `
    <div class="tabs">${tabs.map(([k, l]) => `<button class="tab ${nbTab === k ? 'active' : ''}" data-tab="${k}">${l}</button>`).join('')}</div>
    <div id="nb-tab"></div>`;
  $$('.tab', body).forEach((b) => (b.onclick = () => { nbTab = b.dataset.tab; rerender(); }));
  const el = $('#nb-tab', body);
  ({ data: renderData, graphs: renderGraphs, analysis: renderAnalysis, questions: renderQuestions, team: renderTeam })[nbTab](el);
}

function renderData(el) {
  const sum = summarize(S, LAB);
  const cell = (s, t) => { const r = s.ss.tests[t.id]; return r ? esc(fmtTest(t, r.value)) : '<span class="muted">—</span>'; };
  el.innerHTML = `
    <div class="table-wrap"><table class="data">
      <thead><tr><th>Measurement</th>${LAB.sites.map((s) => `<th>Site ${s.id}<br><small>${esc(siteDisplayName(LAB, s.id))}</small></th>`).join('')}</tr></thead>
      <tbody>
        ${TESTS.map((t) => `<tr><td>${esc(t.name)}</td>${sum.sites.map((s) => `<td>${cell(s, t)}</td>`).join('')}</tr>`).join('')}
        <tr class="sep"><td>Organisms identified</td>${sum.sites.map((s) => `<td>${s.kicked ? `${s.idsCorrect} / ${s.idsTotal}` : '<span class="muted">no sample</span>'}</td>`).join('')}</tr>
        ${[1, 2, 3].map((g) => `<tr><td><span class="dot" style="background:${GROUPS[g].color}"></span>${GROUPS[g].name} types</td>${sum.sites.map((s) => `<td>${s.kicked ? `${s.tally[g].length}${s.tally[g].length ? `<br><small>${esc(s.tally[g].join(', '))}</small>` : ''}` : '<span class="muted">—</span>'}</td>`).join('')}</tr>`).join('')}
      </tbody>
    </table></div>
    <p class="hint">Only correctly identified organisms are counted. Values appear after you run each test at each site.</p>`;
}

function renderGraphs(el) {
  const labels = LAB.sites.map((s) => `Site ${s.id}`);
  const v = (id) => LAB.sites.map((s) => S.sites[s.id].tests[id]?.value ?? null);
  const idx = LAB.sites.map((s) => (S.sites[s.id].index?.correct ? S.sites[s.id].index.value : null));
  el.innerHTML = `
    <div class="charts">
      ${barChart({ title: 'Dissolved oxygen and temperature', labels, series: [{ name: 'DO (mg/L)', color: '#2b6cb0', values: v('do') }, { name: 'Temp (°C)', color: '#dd6b20', values: v('temp') }] })}
      ${barChart({ title: 'Water-quality index (from your analysis)', labels, max: 32, series: [{ name: 'Index', color: '#2f7d96', values: idx }],
        bands: [{ from: 23, to: 32, color: '#2e7d32', label: 'Excellent' }, { from: 17, to: 23, color: '#7cb342', label: 'Good' }, { from: 11, to: 17, color: '#f9a825', label: 'Fair' }, { from: 0, to: 11, color: '#c62828', label: 'Poor' }] })}
      ${barChart({ title: 'Nitrate', labels, unit: 'mg/L', series: [{ name: 'Nitrate', color: '#6b46c1', values: v('nitrate') }] })}
      ${barChart({ title: 'Phosphate', labels, unit: 'mg/L', series: [{ name: 'Phosphate', color: '#9c4221', values: v('phosphate') }] })}
      ${barChart({ title: 'Turbidity', labels, unit: 'NTU', series: [{ name: 'Turbidity', color: '#8a6a3c', values: v('turbidity') }] })}
    </div>
    <p class="hint">A dash (—) means you haven't measured that yet.</p>`;
}

function renderAnalysis(el) {
  const sum = summarize(S, LAB);
  el.innerHTML = `
    <div class="callout">
      <strong>Water-quality index</strong> = (number of <em>sensitive</em> types × 3) + (number of <em>somewhat sensitive</em> types × 2) + (number of <em>tolerant</em> types × 1).
      <br>Count each <strong>type</strong> once, no matter how many individuals you found.
      <br>Rating: <strong>Excellent</strong> above 22 · <strong>Good</strong> 17–22 · <strong>Fair</strong> 11–16 · <strong>Poor</strong> 10 or less.
    </div>
    ${sum.sites.map((s) => {
      const ss = s.ss, id = s.site.id;
      if (!s.kicked || !s.allIds) {
        return `<div class="an-card"><h3>Site ${id}: ${esc(siteDisplayName(LAB, id))}</h3><p class="muted">Identify all organisms at Site ${id} first (${s.idsCorrect} of ${s.idsTotal} done${s.kicked ? '' : ', no kick-net sample yet'}).</p></div>`;
      }
      return `<div class="an-card" data-site="${id}">
        <h3>Site ${id}: ${esc(siteDisplayName(LAB, id))}</h3>
        <div class="tally">${[1, 2, 3].map((g) => `<div><span class="dot" style="background:${GROUPS[g].color}"></span><strong>${GROUPS[g].name}</strong> (× ${GROUPS[g].weight})<ul>${s.tally[g].map((n) => `<li>${esc(n)}</li>`).join('') || '<li class="muted">none</li>'}</ul></div>`).join('')}</div>
        <div class="row an-row">
          <label>Index
            ${ss.index?.correct ? `<span class="good">${ss.index.value} ✓</span>` : `<input type="text" inputmode="numeric" class="an-index" value="${esc(ss.index?.value ?? '')}" size="5">`}
          </label>
          ${ss.index?.correct ? '' : '<button class="primary an-check">Check index</button>'}
          <label>Rating
            ${ss.rating?.correct ? `<span class="good">${ss.rating.value} ✓</span>` : `<select class="an-rating" ${ss.index?.correct ? '' : 'disabled'}><option value="">Choose…</option>${RATINGS.map((r) => `<option ${ss.rating?.value === r ? 'selected' : ''}>${r}</option>`).join('')}</select>`}
          </label>
          ${!ss.rating?.correct && ss.index?.correct ? '<button class="primary an-rate">Check rating</button>' : ''}
        </div>
        <p class="feedback an-fb" role="status"></p>
      </div>`;
    }).join('')}`;

  $$('.an-card[data-site]', el).forEach((card) => {
    const id = +card.dataset.site, ss = S.sites[id], site = LAB.sites[id - 1];
    const fb = $('.an-fb', card);
    $('.an-check', card)?.addEventListener('click', () => {
      const v = parseInt($('.an-index', card).value, 10);
      if (Number.isNaN(v)) { fb.textContent = 'Enter a whole number.'; return; }
      const rec = ss.index || { attempts: 0 };
      rec.attempts += 1; rec.value = v; rec.by = me(); rec.at = Date.now(); rec.correct = v === site.index;
      ss.index = rec;
      log(`Index for Site ${id}: entered ${v} (${rec.correct ? 'correct' : 'incorrect'})`);
      persist();
      if (rec.correct) rerender();
      else { fb.className = 'feedback an-fb bad'; fb.textContent = 'Not quite. Count each type once, multiply each group\'s count by its weight, then add.'; }
    });
    $('.an-rate', card)?.addEventListener('click', () => {
      const v = $('.an-rating', card).value;
      if (!v) return;
      const rec = ss.rating || { attempts: 0 };
      rec.attempts += 1; rec.value = v; rec.by = me(); rec.at = Date.now(); rec.correct = v === site.rating;
      ss.rating = rec;
      log(`Rating for Site ${id}: ${v} (${rec.correct ? 'correct' : 'incorrect'})`);
      persist();
      if (rec.correct) { rerender(); refreshHUD(); }
      else { fb.className = 'feedback an-fb bad'; fb.textContent = 'Check your index against the rating ranges above.'; }
    });
  });
}

const MAX_TRIES = { numeric: 3, mc: 2 };

function renderQuestions(el) {
  el.innerHTML = `
    <p class="hint">Use the data you collected. Calculation and multiple-choice answers are checked right away (limited tries). Written answers are graded by your teacher and save automatically.</p>
    ${LAB.questions.map((q) => {
      const a = S.answers[q.id];
      const left = q.type !== 'text' ? MAX_TRIES[q.type] - (a?.attempts || 0) : 0;
      let input = '';
      if (q.type === 'numeric') {
        input = a?.done
          ? `<p class="${a.correct ? 'good' : 'muted'}">Your answer: <strong>${esc(a.value)} ${esc(q.unit)}</strong> ${a.correct ? '✓ Correct' : '· Recorded. Your teacher will review it.'}</p>`
          : `<div class="row"><input type="text" inputmode="decimal" class="q-num" value="${esc(a?.value ?? '')}" size="10"><span>${esc(q.unit)}</span><button class="primary q-check">Check</button><span class="muted">${left} ${left === 1 ? 'try' : 'tries'} left</span></div>`;
      } else if (q.type === 'mc') {
        input = a?.done
          ? `<p class="${a.correct ? 'good' : 'muted'}">Your answer: <strong>${esc(q.options[a.value])}</strong> ${a.correct ? '✓ Correct' : '· Recorded. Your teacher will review it.'}</p>`
          : `<div class="mc">${q.options.map((o, i) => `<label class="mc-opt"><input type="radio" name="q-${q.id}" value="${i}" ${a?.value === i ? 'checked' : ''}> ${esc(o)}</label>`).join('')}</div>
             <div class="row"><button class="primary q-submit">Submit</button><span class="muted">${left} ${left === 1 ? 'try' : 'tries'} left</span></div>`;
      } else {
        input = `<textarea class="q-text" rows="5" placeholder="Write your answer using evidence from your data…">${esc(a?.value ?? '')}</textarea><p class="hint q-status">${a?.value ? 'Saved ✓' : ''}</p>`;
      }
      return `<div class="q-card" data-q="${q.id}"><p class="q-prompt"><span class="q-num-badge">${q.number}</span>${esc(q.prompt)}</p>${input}<p class="feedback q-fb" role="status"></p></div>`;
    }).join('')}`;

  $$('.q-card', el).forEach((card) => {
    const q = LAB.questions.find((x) => x.id === card.dataset.q);
    const fb = $('.q-fb', card);
    const record = (value, correct) => {
      const a = S.answers[q.id] || { type: q.type, attempts: 0 };
      a.attempts += 1; a.value = value; a.correct = correct; a.by = me(); a.at = Date.now();
      a.done = correct || a.attempts >= MAX_TRIES[q.type];
      S.answers[q.id] = a;
      log(`Question ${q.number}: answered ${q.type === 'mc' ? q.options[value] : value} (${correct ? 'correct' : 'incorrect'})`);
      persist();
      if (a.done) rerender();
      else { fb.className = 'feedback q-fb bad'; fb.textContent = `Not quite. Check your data and your work. ${MAX_TRIES[q.type] - a.attempts} ${MAX_TRIES[q.type] - a.attempts === 1 ? 'try' : 'tries'} left.`; $('.muted', card).textContent = `${MAX_TRIES[q.type] - a.attempts} left`; }
    };
    $('.q-check', card)?.addEventListener('click', () => {
      const raw = $('.q-num', card).value.replace(/,/g, '.').replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, '');
      const v = parseFloat(raw);
      if (Number.isNaN(v)) { fb.textContent = 'Enter a number.'; return; }
      record(v, Math.abs(v - q.answer) <= q.tol + 1e-9);
    });
    $('.q-submit', card)?.addEventListener('click', () => {
      const sel = $(`input[name="q-${q.id}"]:checked`, card);
      if (!sel) { fb.textContent = 'Choose an answer.'; return; }
      record(+sel.value, +sel.value === q.answerIndex);
    });
    $('.q-text', card)?.addEventListener('input', (e) => {
      const a = S.answers[q.id] || { type: 'text', attempts: 0 };
      a.value = e.target.value; a.by = me(); a.at = Date.now();
      S.answers[q.id] = a;
      $('.q-status', card).textContent = 'Saving…';
      persistSoon();
      setTimeout(() => { const s = $('.q-status', card); if (s) s.textContent = 'Saved ✓'; }, 700);
    });
    $('.q-text', card)?.addEventListener('change', () => log(`Question ${q.number}: wrote an answer`));
  });
}

function renderTeam(el) {
  const role = ROLES[S.group.role];
  el.innerHTML = `
    <div class="callout">
      <strong>Group ${esc(S.group.code)}</strong> · Your role: <strong>${esc(role?.name)}</strong>: ${esc(role?.does)}
    </div>
    <h3>Team members combined so far</h3>
    <ul>${S.team.map((m) => `<li>${esc(m.name)}${m.role ? ` (${esc(ROLES[m.role]?.name)})` : ''}${m.email === S.student.email ? ' (you)' : ''}</li>`).join('')}</ul>
    <h3>How to combine your team's work</h3>
    <ol>
      <li>Each teammate taps <strong>Download my save file</strong> below.</li>
      <li>Send the file to one teammate (AirDrop works well on iPads and Macs, or use email or a shared drive).</li>
      <li>That teammate taps <strong>Import teammate files</strong> and selects the files. Everyone's samples, IDs, tests and answers are combined, with credit to whoever did each part.</li>
    </ol>
    <div class="row">
      <button class="secondary" id="t-save">💾 Download my save file</button>
      <label class="file-btn primary-file">📥 Import teammate files<input type="file" id="t-import" accept=".json,application/json" multiple></label>
    </div>
    <p class="feedback" id="t-fb" role="status"></p>`;
  $('#t-save', el).onclick = downloadSaveFile;
  $('#t-import', el).onchange = async (e) => {
    const msgs = [];
    for (const file of e.target.files) {
      try {
        const other = JSON.parse(await readFileAsText(file));
        const err = checkTeammateFile(S, other);
        if (err) { msgs.push(`${file.name}: ${err}`); continue; }
        mergeTeam(S, other);
        log(`Imported teammate data from ${other.student.name}`);
        msgs.push(`Combined ${other.student.name}'s work ✓`);
      } catch {
        msgs.push(`${file.name}: could not read this file.`);
      }
    }
    persist();
    rerender();
    refreshHUD();
    const fb = $('#t-fb');
    if (fb) fb.textContent = msgs.join(' · ');
    toast(msgs.join(' · '));
  };
}

// ---------- finish + report ----------

function openFinish() {
  openPanel('Finish the lab', (body) => {
    const sum = summarize(S, LAB);
    const item = (ok, text) => `<li class="${ok ? 'ok' : 'todo'}">${ok ? '✓' : '○'} ${text}</li>`;
    const incomplete = sum.sitesComplete < 4 || sum.analysisComplete < 4 || sum.answered < LAB.questions.length;
    body.innerHTML = `
      <ul class="checklist">
        ${sum.sites.map((s) => item(s.complete, `Site ${s.site.id}: sample (${s.kicked ? 'done' : 'not yet'}), IDs ${s.idsCorrect}/${s.idsTotal}, tests ${s.testsDone}/${TESTS.length}`)).join('')}
        ${item(sum.analysisComplete === 4, `Index analysis: ${sum.analysisComplete}/4 sites`)}
        ${item(sum.answered === LAB.questions.length, `Questions answered: ${sum.answered}/${LAB.questions.length}`)}
      </ul>
      ${S.group && S.merged.length === 0 ? '<p class="callout">Group lab: before finishing, the person turning in the report should combine teammates\' files (Notebook → Team).</p>' : ''}
      ${incomplete ? '<p class="callout warn">Some parts aren\'t finished. You can still finish, but missing parts will show as incomplete on your report.</p>' : ''}
      ${S.finishedAt ? `<p class="hint">You finished on ${esc(new Date(S.finishedAt).toLocaleString())}. Finishing again updates your report.</p>` : ''}
      <div class="row">
        <button class="primary big" id="fin-go">Finish and create my report</button>
        <button class="secondary" id="fin-back">Back to the lab</button>
      </div>`;
    $('#fin-back').onclick = closePanel;
    $('#fin-go').onclick = () => {
      S.finishedAt = Date.now();
      log('Finished the lab and created the report');
      persist();
      openReport();
    };
  });
}

function openReport() {
  openPanel('Your report', (body) => {
    const sum = summarize(S, LAB);
    body.innerHTML = `
      <p class="lead">Great work, ${esc(S.student.name)}! Download your report and turn it in where your teacher asked (for example Google Classroom or Canvas).</p>
      <div class="report-actions">
        <button class="primary big" id="rp-pdf">📄 Download PDF report</button>
        <button class="secondary big" id="rp-csv">📊 Download data (CSV)</button>
        <a class="secondary big btn" id="rp-mail" href="${esc(mailtoLink(S, LAB))}">✉️ Email a summary to myself</a>
        <button class="secondary big" id="rp-save">💾 Download save file</button>
      </div>
      <p class="hint">The email button opens your email app with a summary already written. Press Send to deliver it to yourself. It can't attach the PDF, so turn in the PDF file separately.</p>
      <div class="summary-grid">
        <div><strong>${sum.sitesComplete}/4</strong><span>sites complete</span></div>
        <div><strong>${sum.analysisComplete}/4</strong><span>index analyses</span></div>
        <div><strong>${sum.answered}/${LAB.questions.length}</strong><span>questions answered</span></div>
        <div><strong>${labFingerprint(S.seedKey)}</strong><span>Lab ID</span></div>
      </div>
      <button class="link" id="rp-back">← Back to the lab</button>`;
    const date = new Date().toISOString().slice(0, 10);
    $('#rp-pdf').onclick = () => {
      if (!window.jspdf) { toast('The PDF tool is still loading. Check your internet connection and try again.'); return; }
      const doc = buildPDF(S, LAB);
      downloadFile(`StreamLab-report-${fileSafe(S.student.name)}-${date}.pdf`, doc.output('blob'), 'application/pdf');
      log('Downloaded the PDF report'); persist();
    };
    $('#rp-csv').onclick = () => {
      downloadFile(`StreamLab-data-${fileSafe(S.student.name)}-${date}.csv`, buildCSV(S, LAB), 'text/csv');
      log('Downloaded the CSV data'); persist();
    };
    $('#rp-mail').onclick = () => { log('Opened the email summary'); persist(); };
    $('#rp-save').onclick = downloadSaveFile;
    $('#rp-back').onclick = closePanel;
  });
}

function openHelp() {
  openPanel('Controls and tips', (body) => {
    body.innerHTML = `
      <h3>Moving around</h3>
      <p><strong>Laptop:</strong> W A S D or the arrow keys to move (Left and Right arrows turn the camera). Hold Shift to run. Click and drag to look around; scroll to zoom. Press E at a site.</p>
      <p><strong>iPad:</strong> use the joystick in the bottom left to move (push it all the way to run), and drag anywhere else to look around. Tap the green button at a site.</p>
      <button class="secondary" id="h-char">🧑‍🔬 Change my character</button>
      <h3>Finding sites</h3>
      <p>Follow the stream downhill. Yellow beacons mark the sites and turn green when a site is complete. The map in the top right shows where you are (red arrow). After you've visited a site, tap its number at the top to travel back.</p>
      <h3>Saving</h3>
      <p>Progress saves automatically in this browser. To switch devices, use 💾 Save file, then choose "Continue from a save file" on the new device.</p>`;
    $('#h-char', body).onclick = openCharacter;
  });
}

// ---------- wiring ----------

function wire() {
  $('#panel-close').onclick = () => {
    closePanel();
  };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && panel && inLab) closePanel();
    if (e.code === 'KeyE' && near && !panel && inLab && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) openSite(near);
  });
  $('#btn-interact').onclick = () => near && openSite(near);
  $$('#hud [data-act]').forEach((b) => (b.onclick = () => ({
    notebook: () => openNotebook(),
    guide: () => openGuide(),
    save: downloadSaveFile,
    help: openHelp,
    finish: openFinish,
    campus: () => { persist(); location.href = 'index.html'; },
  })[b.dataset.act]()));

  document.addEventListener('visibilitychange', () => {
    if (!S || !inLab || S.finishedAt) return;
    if (document.hidden) {
      S.tabSwitches += 1;
      log('Left the lab page');
      persist();
    }
  });
  window.addEventListener('pagehide', persist);
  setInterval(() => {
    if (S && inLab && !document.hidden) {
      S.activeMs += 5000;
      persist();
    }
  }, 5000);
}

wire();
renderJoin(new URLSearchParams(location.search).get('class') || '');
