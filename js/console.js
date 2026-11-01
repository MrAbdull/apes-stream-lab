// EarthLab teacher console: classes (roster, PINs, lab locks, timer, class link and
// lab code) and the gradebook (built from students' progress files).
// Everything stays in this browser. The password stops students who use the teacher's
// computer; it is not server security (there is no server).

import { LAB_IDS, newClassId, randomPin, shortName, encodeClassLink, encodeLabCode } from './classlink.js';
import { gradeFor } from '../platform/engine/progress.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const PW_KEY = 'earthlab:teacher:pw';
const CLASSES_KEY = 'earthlab:teacher:classes:v1';
const filesKey = (id) => `earthlab:teacher:files:${id}`;
const gradesKey = (id) => `earthlab:teacher:grades:${id}`;

const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) ?? d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { toast('This browser is out of storage space.'); return false; } };

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), Math.min(9000, 2600 + msg.length * 55));
}

// Some browsers (and in-app browsers) block the clipboard; fall back to the old copy
// command, and if that fails too, show the text selected so it can be copied by hand.
async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); return; } catch { /* blocked */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
  document.body.appendChild(ta); ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch { /* blocked */ }
  ta.remove();
  if (ok) { toast('Copied'); return; }
  const d = document.createElement('div');
  d.className = 'qr-full';
  d.innerHTML = `<div class="copy-box"><h2>Copy this link</h2><p>Your browser blocked automatic copying. The link is selected below: press ${/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'}+C to copy it.</p>
    <textarea readonly rows="5"></textarea><div class="row"><button class="primary big">Done</button></div></div>`;
  document.body.appendChild(d);
  const box = $('textarea', d);
  box.value = text; box.focus(); box.select();
  $('button', d).onclick = () => d.remove();
}

async function sha(text) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

const timeStr = (ms) => new Date(ms).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
const dateStr = (ms) => new Date(ms).toLocaleDateString([], { month: 'short', day: 'numeric' });

// ---------- password ----------

async function gate() {
  const saved = load(PW_KEY, null);
  if (sessionStorage.getItem('earthlab:teacher:open') === saved?.hash && saved) return start();
  const first = !saved;
  $('#console').innerHTML = `
    <section class="card login">
      <h1>🌍 EarthLab Teacher Console</h1>
      <p class="hint">${first ? 'First time on this computer: choose a password for the teacher console. Students never see this page.' : 'Enter your teacher password.'}</p>
      <label>Password<input id="pw" type="password" autocomplete="${first ? 'new-password' : 'current-password'}"></label>
      ${first ? '<label>Type it again<input id="pw2" type="password" autocomplete="new-password"></label>' : ''}
      <p class="error" id="pw-err"></p>
      <div class="row"><button class="primary big" id="pw-go">${first ? 'Set password' : 'Sign in'}</button></div>
      ${first ? '' : '<details class="hint"><summary>Forgot your password?</summary><p>Your classes are stored only in this browser. Resetting removes the password <em>and</em> every class and gradebook on this computer. Restore them afterwards from a backup file if you made one.</p><button class="secondary" id="pw-reset">Reset the console</button></details>'}
    </section>`;
  const go = async () => {
    const pw = $('#pw').value;
    if (pw.length < 6) { $('#pw-err').textContent = 'Use at least 6 characters.'; return; }
    if (first) {
      if (pw !== $('#pw2').value) { $('#pw-err').textContent = "The two passwords don't match."; return; }
      const salt = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
      store(PW_KEY, { salt, hash: await sha(salt + pw) });
    } else if (await sha(saved.salt + pw) !== saved.hash) { $('#pw-err').textContent = 'Wrong password.'; return; }
    sessionStorage.setItem('earthlab:teacher:open', load(PW_KEY).hash);
    start();
  };
  $('#pw-go').onclick = go;
  $('#console').addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.tagName === 'INPUT') go(); });
  $('#pw-reset')?.addEventListener('click', () => {
    if (!confirm('Erase the password and ALL classes and gradebooks stored on this computer?')) return;
    Object.keys(localStorage).filter((k) => k.startsWith('earthlab:teacher:')).forEach((k) => localStorage.removeItem(k));
    gate();
  });
  setTimeout(() => $('#pw')?.focus(), 50);
}

// ---------- shell ----------

let registry = [];
let view = { tab: 'classes', classId: null };

async function start() {
  registry = await (await fetch('platform/worlds/registry.json')).json();
  const classes = load(CLASSES_KEY, []);
  view.classId ||= classes[0]?.id || null;
  render();
}

const labsList = () => registry.filter((w) => w.status === 'open' && LAB_IDS.includes(w.id));
const getClass = (id) => load(CLASSES_KEY, []).find((c) => c.id === id);
function saveClassObj(cls) {
  const all = load(CLASSES_KEY, []);
  const i = all.findIndex((c) => c.id === cls.id);
  if (i >= 0) all[i] = cls; else all.unshift(cls);
  store(CLASSES_KEY, all);
}

function render() {
  const classes = load(CLASSES_KEY, []);
  $('#console').innerHTML = `
    <header class="console-head no-print">
      <div><h1>🌍 EarthLab Teacher Console</h1><p class="hint">Bookmark this page. Everything here stays on this computer.</p></div>
      <div class="row"><a class="btn secondary" href="stream-teacher.html">Stream Lab answer keys</a><button class="secondary" id="lock">🔒 Lock console</button></div>
    </header>
    <nav class="tabs no-print">
      <button class="tab ${view.tab === 'classes' ? 'active' : ''}" data-tab="classes">Classes &amp; labs</button>
      <button class="tab ${view.tab === 'grades' ? 'active' : ''}" data-tab="grades">Gradebook</button>
      <button class="tab ${view.tab === 'backup' ? 'active' : ''}" data-tab="backup">Backup</button>
    </nav>
    ${view.tab !== 'backup' ? `<div class="row no-print class-pick">
      ${classes.map((c) => `<button class="${c.id === view.classId ? 'primary' : 'secondary'}" data-class="${c.id}">${esc(c.name)}</button>`).join('')}
      <button class="link" id="new-class">＋ New class</button></div>` : ''}
    <div id="tab-body"></div>`;
  $$('[data-tab]').forEach((b) => (b.onclick = () => { view.tab = b.dataset.tab; render(); }));
  $$('[data-class]').forEach((b) => (b.onclick = () => { view.classId = b.dataset.class; render(); }));
  $('#new-class')?.addEventListener('click', newClassForm);
  $('#lock').onclick = () => { sessionStorage.removeItem('earthlab:teacher:open'); gate(); };
  const body = $('#tab-body');
  if (view.tab === 'backup') return renderBackup(body);
  const cls = getClass(view.classId);
  if (!cls) return newClassForm();
  if (view.tab === 'classes') renderClass(body, cls);
  else renderGradebook(body, cls);
}

// ---------- classes ----------

function newClassForm() {
  view.tab = 'classes';
  $('#tab-body').innerHTML = `
    <section class="card">
      <h2>New class</h2>
      <label>Class name<input id="nc-name" placeholder="e.g. APES Period 3" maxlength="40"></label>
      <label>Students, one per line (up to 40)
        <textarea id="nc-roster" rows="10" placeholder="Jordan Lee&#10;Maria Gonzalez&#10;…"></textarea></label>
      <p class="hint">Only first name and last initial are kept (for example "Jordan L."). Each student gets a 4-digit PIN.</p>
      <p class="error" id="nc-err"></p>
      <div class="row"><button class="primary big" id="nc-go">Create class</button></div>
    </section>`;
  $('#nc-go').onclick = () => {
    const name = $('#nc-name').value.trim();
    const names = $('#nc-roster').value.split('\n').map(shortName).filter(Boolean);
    if (!name) return ($('#nc-err').textContent = 'Give the class a name.');
    if (!names.length) return ($('#nc-err').textContent = 'Add at least one student.');
    if (names.length > 40) return ($('#nc-err').textContent = 'A class can have up to 40 students.');
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length) return ($('#nc-err').textContent = `Two students would both appear as "${dupes[0]}". Add a middle initial to one, e.g. "Jordan M Lee".`);
    const cls = { id: newClassId(), name, created: Date.now(), roster: names.map((n) => ({ name: n, pin: randomPin() })), open: [], end: 0, stream: '' };
    saveClassObj(cls);
    view.classId = cls.id;
    render();
    toast('Class created. All labs start locked: open the ones you want below.');
  };
}

function renderClass(body, cls) {
  const link = encodeClassLink(cls, location.href);
  const code = encodeLabCode(cls.id, cls.open, cls.end > Date.now() ? cls.end : 0);
  const endVal = cls.end > Date.now() ? new Date(cls.end).toTimeString().slice(0, 5) : '';
  body.innerHTML = `
    <section class="card">
      <h2>${esc(cls.name)}: labs</h2>
      <p class="hint">Students only see labs you open. Locked portals show a padlock.</p>
      <div class="lab-grid">${labsList().map((w) => `
        <label class="lab-toggle" style="--c:${w.color}"><input type="checkbox" data-lab="${w.id}" ${cls.open.includes(w.id) ? 'checked' : ''}>
          <span><strong>${esc(w.title)}</strong><small>${esc(w.subject)}</small></span></label>`).join('')}</div>
      <div class="row">
        <button class="secondary" id="all-open">Open all</button><button class="secondary" id="all-lock">Lock all</button>
        <label class="inline">⏱ Lab ends at <input type="time" id="end" value="${endVal}"></label>
        <button class="link" id="end-clear">No timer</button>
      </div>
      <label class="inline">Stream Lab class code <input id="stream" value="${esc(cls.stream)}" placeholder="e.g. 3E3R-J0Z" size="10" autocapitalize="characters">
        <span class="hint">Optional. Make one in <a href="stream-teacher.html">Stream Lab tools</a> so students skip typing it.</span></label>
    </section>

    <section class="card share">
      <h2>Get students in</h2>
      <div class="share-grid">
        <div>
          <h3>1. First time: class link</h3>
          <p class="hint">Students scan the QR code or open the link once on their device, pick their name and type their PIN.</p>
          <div id="qr" class="qr"></div>
          <div class="row"><button class="primary" id="copy-link">Copy class link</button><button class="secondary" id="show-qr">Show QR full screen</button></div>
          <label class="hint">Or select the link here:<input class="link-box" readonly value="${esc(link)}"></label>
        </div>
        <div>
          <h3>2. Later: lab code</h3>
          <p class="hint">Changed which labs are open or the timer? Put this code on the board. Students tap 🔑 Lab code on the campus and type it.</p>
          <div class="code-big">${esc(code)}</div>
          <p class="hint">${cls.open.length ? `Opens: ${esc(cls.open.map((id) => registry.find((w) => w.id === id)?.title || id).join(', '))}` : 'All labs locked.'}${cls.end > Date.now() ? ` · Ends ${timeStr(cls.end)} today` : ''}</p>
          <p class="hint">The timer in a lab code only counts down on the day it was made.</p>
        </div>
      </div>
    </section>

    <section class="card">
      <h2>Roster (${cls.roster.length})</h2>
      <p class="hint">Changing names or PINs needs a new class link: students who already joined just open the new link again.</p>
      <table class="data roster"><thead><tr><th>#</th><th>Student</th><th>PIN</th><th title="Paste into Stream Lab answer keys in place of an email">Stream Lab ID</th><th></th></tr></thead><tbody>
        ${cls.roster.map((s, i) => `<tr><td>${i + 1}</td><td>${esc(s.name)}</td><td><code>${esc(s.pin)}</code></td><td><small class="muted">${esc(`${cls.id.toLowerCase()}.${i}@class.earthlab`)}</small></td>
          <td><button class="link" data-repin="${i}">New PIN</button></td></tr>`).join('')}
      </tbody></table>
      <div class="row">
        <input id="add-name" placeholder="Add a student (first and last name)" size="28"><button class="secondary" id="add">Add</button>
        <button class="primary" id="print">🖨️ Print PIN slips</button>
      </div>
      <details><summary class="hint">Rename or delete this class</summary>
        <div class="row"><input id="rename" value="${esc(cls.name)}" maxlength="40"><button class="secondary" id="do-rename">Rename</button>
        <button class="secondary danger" id="delete">Delete class</button></div></details>
    </section>`;

  const update = (patch, msg) => { Object.assign(cls, patch); saveClassObj(cls); renderClass(body, cls); if (msg) toast(msg); };
  $$('[data-lab]', body).forEach((c) => (c.onchange = () => update({ open: $$('[data-lab]', body).filter((x) => x.checked).map((x) => x.dataset.lab) }, 'Saved. Give students the new lab code.')));
  $('#all-open').onclick = () => update({ open: labsList().map((w) => w.id) }, 'All labs open. Give students the new lab code.');
  $('#all-lock').onclick = () => update({ open: [] }, 'All labs locked. Give students the new lab code.');
  $('#end').onchange = (e) => {
    if (!e.target.value) return update({ end: 0 });
    const [h, m] = e.target.value.split(':').map(Number);
    const d = new Date(); d.setHours(h, m, 0, 0);
    if (d.getTime() <= Date.now()) { toast('Pick a time later today.'); return renderClass(body, cls); }
    update({ end: d.getTime() }, `Timer set for ${timeStr(d)}. Give students the new lab code.`);
  };
  $('#end-clear').onclick = () => update({ end: 0 }, 'Timer removed.');
  $('#stream').onchange = (e) => update({ stream: e.target.value.trim().toUpperCase() }, 'Saved. Students need the new class link for this.');
  $('#copy-link').onclick = () => copy(link);
  $('.link-box', body).onfocus = (e) => e.target.select();
  $('#show-qr').onclick = () => showBigQR(link, cls.name);
  drawQR($('#qr'), link, 220);
  $$('[data-repin]', body).forEach((b) => (b.onclick = () => {
    cls.roster[+b.dataset.repin].pin = randomPin();
    update({}, `New PIN for ${cls.roster[+b.dataset.repin].name}. They need the new class link.`);
  }));
  $('#add').onclick = () => {
    const n = shortName($('#add-name').value);
    if (!n) return;
    if (cls.roster.some((s) => s.name === n)) return toast(`"${n}" is already on the roster. Add a middle initial.`);
    if (cls.roster.length >= 40) return toast('A class can have up to 40 students.');
    cls.roster.push({ name: n, pin: randomPin() });
    update({}, `${n} added. Students need the new class link.`);
  };
  $('#print').onclick = () => printSlips(cls, link);
  $('#do-rename').onclick = () => { const n = $('#rename').value.trim(); if (n) { update({ name: n }); render(); } };
  $('#delete').onclick = () => {
    if (!confirm(`Delete ${cls.name}, its roster and its gradebook from this computer?`)) return;
    store(CLASSES_KEY, load(CLASSES_KEY, []).filter((c) => c.id !== cls.id));
    localStorage.removeItem(filesKey(cls.id)); localStorage.removeItem(gradesKey(cls.id));
    view.classId = null; start();
  };
}

function drawQR(el, text, size) {
  el.innerHTML = '';
  if (!window.QRCode) { el.innerHTML = '<p class="hint">QR code unavailable offline. Use the link.</p>'; return; }
  try { new window.QRCode(el, { text, width: size, height: size, correctLevel: window.QRCode.CorrectLevel.L }); }
  catch { el.innerHTML = '<p class="hint">This class link is too long for a QR code. Share the link instead.</p>'; }
}

function showBigQR(link, name) {
  const d = document.createElement('div');
  d.className = 'qr-full';
  d.innerHTML = `<div><h2>${esc(name)}</h2><p>Scan to join EarthLab</p><div class="qr"></div><button class="primary big">Close</button></div>`;
  document.body.appendChild(d);
  drawQR($('.qr', d), link, Math.min(innerWidth, innerHeight) - 220);
  $('button', d).onclick = () => d.remove();
}

function printSlips(cls, link) {
  const area = $('#print-area');
  area.innerHTML = `<div class="slips">${cls.roster.map((s) => `
    <div class="slip"><strong>EarthLab · ${esc(cls.name)}</strong>
      <p>Name: <b>${esc(s.name)}</b><br>PIN: <b class="pin">${esc(s.pin)}</b></p>
      <p class="small">Open the class link from your teacher, choose your name and type this PIN. Keep it private.</p></div>`).join('')}</div>`;
  window.print();
  setTimeout(() => (area.innerHTML = ''), 1000);
}

// ---------- gradebook ----------

let missionDefs = null; // [{ world, worldTitle, id, title, actions: [{ k, gesture, instruction, question, points }] }]

async function loadMissionDefs() {
  if (missionDefs) return missionDefs;
  missionDefs = [];
  for (const w of registry.filter((x) => x.type === 'world' && x.status === 'open')) {
    const man = await (await fetch(`platform/worlds/${w.id}/manifest.json`)).json();
    for (const m of man.missions) {
      const def = await (await fetch(`platform/worlds/${w.id}/${m.file}`)).json();
      const actions = [];
      def.steps.forEach((s, si) => s.sequence.forEach((a, ai) => actions.push({ k: `${si}.${ai}`, step: s.title, gesture: a.gesture, instruction: a.instruction, question: a.question, points: a.points ?? 10 })));
      missionDefs.push({ world: w.id, worldTitle: w.title, id: m.id, title: m.title, actions, max: actions.reduce((t, a) => t + a.points, 0) });
    }
  }
  return missionDefs;
}

// What one student did in one mission: the latest finished attempt, or the in-progress checkpoint.
function attempt(p, m) {
  const r = p?.worlds?.[m.world]?.missions?.[m.id];
  if (!r) return null;
  if (r.status === 'complete' && r.last) return { done: true, score: r.last.score, max: r.last.max, results: r.last.results || {}, answers: r.last.answers || {}, best: r.best };
  const st = r.checkpoint?.state;
  if (st) return { done: false, score: st.score, max: m.max, results: st.results || {}, answers: st.answers || {}, at: st.i };
  return null;
}

// Teacher scores for written answers replace the automatic points.
function adjusted(att, m, grades, who) {
  if (!att) return null;
  let score = att.score;
  for (const a of m.actions.filter((x) => x.question?.type === 'text')) {
    const g = grades[`${who}|${m.world}/${m.id}|${a.k}`];
    if (g !== undefined && att.results[a.k]) score += g - (att.results[a.k].earned || 0);
  }
  return score;
}

function renderGradebook(body, cls) {
  const files = load(filesKey(cls.id), {});
  const grades = load(gradesKey(cls.id), {});
  const students = cls.roster.map((s, i) => ({ who: `r${i}`, name: s.name, p: files[`r${i}`] }));
  const extras = Object.entries(files).filter(([k]) => !k.startsWith('r')).map(([who, p]) => ({ who, name: `${p.name} (not on roster)`, p }));
  const all = [...students, ...extras];
  const sub = view.gb || 'overview';
  body.innerHTML = `
    <section class="card no-print">
      <h2>${esc(cls.name)}: gradebook</h2>
      <p class="hint">Students download their progress file from their 🪪 Passport (or when a mission or the timer ends) and turn it in. Drop all the files here at once. A newer file replaces an older one from the same student.</p>
      <label class="drop" id="drop">📂 Drop progress files here, or click to choose<input type="file" id="gb-files" multiple accept=".json,application/json" hidden></label>
      <p class="hint">${students.filter((s) => s.p).length} of ${students.length} students have turned in a file.${extras.length ? ` ${extras.length} file(s) are from students not on this roster.` : ''}</p>
    </section>
    <nav class="tabs no-print">${[['overview', 'Overview'], ['heat', 'Step heatmap'], ['missed', 'Most-missed questions'], ['written', 'Written answers']]
      .map(([id, l]) => `<button class="tab ${sub === id ? 'active' : ''}" data-gb="${id}">${l}</button>`).join('')}
      <button class="secondary" id="csv" style="margin-left:auto">⬇️ Export CSV</button></nav>
    <section class="card" id="gb-view"><p class="hint">Loading missions…</p></section>`;
  $$('[data-gb]', body).forEach((b) => (b.onclick = () => { view.gb = b.dataset.gb; renderGradebook(body, cls); }));
  const input = $('#gb-files');
  input.onchange = () => importFiles(cls, [...input.files]);
  const drop = $('#drop');
  drop.ondragover = (e) => { e.preventDefault(); drop.classList.add('over'); };
  drop.ondragleave = () => drop.classList.remove('over');
  drop.ondrop = (e) => { e.preventDefault(); drop.classList.remove('over'); importFiles(cls, [...e.dataTransfer.files]); };

  loadMissionDefs().then((defs) => {
    const out = $('#gb-view');
    if (!out) return;
    $('#csv').onclick = () => exportCSV(cls, all, defs, grades);
    if (sub === 'overview') out.innerHTML = overviewHTML(all, defs, grades);
    if (sub === 'heat') heatmap(out, all, defs);
    if (sub === 'missed') out.innerHTML = missedHTML(all, defs);
    if (sub === 'written') written(out, cls, all, defs, grades);
  });
}

async function importFiles(cls, list) {
  const files = load(filesKey(cls.id), {});
  let ok = 0, bad = 0, other = 0;
  for (const f of list) {
    try {
      const p = JSON.parse(await f.text());
      if (!p?.worlds || !p.name) throw new Error();
      // Keep only what the gradebook needs.
      const slim = { name: p.name, classId: p.classId, rosterIdx: p.rosterIdx, worlds: p.worlds, stream: p.stream || null, exportedAt: p.exportedAt || f.lastModified };
      let who = p.classId === cls.id && Number.isInteger(p.rosterIdx) && cls.roster[p.rosterIdx] ? `r${p.rosterIdx}` : null;
      if (!who) { who = `x:${p.name}`; other++; }
      if (!files[who] || (files[who].exportedAt || 0) <= slim.exportedAt) files[who] = slim;
      ok++;
    } catch { bad++; }
  }
  store(filesKey(cls.id), files);
  toast(`${ok} file(s) added.${other ? ` ${other} came from outside this class's roster.` : ''}${bad ? ` ${bad} file(s) weren't EarthLab progress files.` : ''}`);
  render();
}

function overviewHTML(all, defs, grades) {
  if (!all.some((s) => s.p)) return '<p class="muted">No progress files yet.</p>';
  return `<div class="table-wrap"><table class="data gb"><thead><tr><th>Student</th>${defs.map((m) => `<th>${esc(m.title)}<small>${esc(m.worldTitle)}</small></th>`).join('')}<th>Stream Lab</th><th>File</th></tr></thead><tbody>
    ${all.map((s) => `<tr><td>${esc(s.name)}</td>${defs.map((m) => {
      const a = attempt(s.p, m);
      if (!a) return `<td class="muted">${s.p ? 'Not started' : '—'}</td>`;
      if (!a.done) return `<td class="prog">⏳ Task ${a.at + 1} of ${m.actions.length}</td>`;
      const pct = Math.round((adjusted(a, m, grades, s.who) / a.max) * 100);
      return `<td class="g g-${gradeFor(pct)}">${pct}% <b>${gradeFor(pct)}</b></td>`;
    }).join('')}<td>${s.p?.stream ? (s.p.stream.finished ? '✅ Finished' : `${s.p.stream.sites}/4 sites`) : '—'}</td>
    <td class="muted">${s.p ? dateStr(s.p.exportedAt) : 'No file yet'}</td></tr>`).join('')}
  </tbody></table></div>
  <p class="hint">Scores use your marks for written answers where you've given them. ⏳ means the student turned in a file mid-mission.</p>`;
}

function cellState(a, k) {
  const r = a?.results[k];
  if (!r) return a && !a.done && a.at !== undefined ? 'todo' : 'none';
  if (r.gaveUp) return 'bad';
  if (r.earned >= r.max) return 'full';
  return 'part';
}

function missionSelect(defs) {
  view.mission ||= `${defs[0].world}/${defs[0].id}`;
  const m = defs.find((d) => `${d.world}/${d.id}` === view.mission) || defs[0];
  return { m, html: `<label class="inline">Mission <select id="m-pick">${defs.map((d) => `<option value="${d.world}/${d.id}" ${d === m ? 'selected' : ''}>${esc(d.worldTitle)}: ${esc(d.title)}</option>`).join('')}</select></label>` };
}

function heatmap(out, all, defs) {
  const { m, html } = missionSelect(defs);
  out.innerHTML = `${html}
    <p class="hint">Each column is one task. <span class="hm full">■</span> full points <span class="hm part">■</span> used a hint, extra tries or mistakes <span class="hm bad">■</span> ran out of tries <span class="hm todo">■</span> not reached yet. Hover a column number to see the task.</p>
    <div class="table-wrap"><table class="heat"><thead><tr><th>Student</th>${m.actions.map((a, i) => `<th title="${esc(`${a.step}: ${a.instruction}`)}">${i + 1}</th>`).join('')}</tr></thead><tbody>
      ${all.filter((s) => s.p).map((s) => { const a = attempt(s.p, m); return `<tr><td>${esc(s.name)}</td>${m.actions.map((x) => `<td class="hm ${cellState(a, x.k)}"></td>`).join('')}</tr>`; }).join('')}
    </tbody></table></div>
    <ol class="task-key">${m.actions.map((a) => `<li><span class="muted">${esc(a.step)}:</span> ${esc(a.instruction)}</li>`).join('')}</ol>`;
  $('#m-pick').onchange = (e) => { view.mission = e.target.value; heatmap(out, all, defs); };
}

function missedHTML(all, defs) {
  const rows = [];
  for (const m of defs) for (const a of m.actions.filter((x) => x.gesture === 'answer' && x.question?.type !== 'text')) {
    let n = 0, first = 0, gave = 0;
    for (const s of all) {
      const r = attempt(s.p, m)?.results[a.k];
      if (!r) continue;
      n++; if (!r.tries && !r.gaveUp) first++; if (r.gaveUp) gave++;
    }
    if (n) rows.push({ m, a, n, first, gave, rate: first / n });
  }
  if (!rows.length) return '<p class="muted">No answered questions in the files yet.</p>';
  rows.sort((x, y) => x.rate - y.rate);
  return `<p class="hint">Questions sorted from hardest to easiest for this class: good candidates for reteaching.</p>
    <table class="data"><thead><tr><th>Question</th><th>Right first try</th><th>Ran out of tries</th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><small class="muted">${esc(r.m.title)}</small><br>${esc(r.a.question.prompt)}</td>
      <td><div class="bar"><span style="width:${Math.round(r.rate * 100)}%"></span></div>${r.first} of ${r.n} (${Math.round(r.rate * 100)}%)</td><td>${r.gave}</td></tr>`).join('')}
    </tbody></table>`;
}

function written(out, cls, all, defs, grades) {
  const { m, html } = missionSelect(defs);
  const qs = m.actions.filter((a) => a.question?.type === 'text');
  out.innerHTML = `${html}
    ${qs.length ? qs.map((a) => `<div class="wq"><h3>${esc(a.question.prompt)}</h3><p class="hint">Worth ${a.points} points. Students get full points automatically for a long-enough answer; your mark replaces that.</p>
      ${all.filter((s) => attempt(s.p, m)?.answers[a.k]).map((s) => {
        const att = attempt(s.p, m), key = `${s.who}|${m.world}/${m.id}|${a.k}`;
        return `<div class="wa"><div><strong>${esc(s.name)}</strong><p>${esc(att.answers[a.k])}</p></div>
          <label class="inline">Score <input type="number" min="0" max="${a.points}" step="1" data-g="${esc(key)}" value="${grades[key] ?? att.results[a.k]?.earned ?? ''}"> / ${a.points}</label></div>`;
      }).join('') || '<p class="muted">No answers yet.</p>'}</div>`).join('') : '<p class="muted">This mission has no written questions.</p>'}`;
  $('#m-pick').onchange = (e) => { view.mission = e.target.value; written(out, cls, all, defs, grades); };
  $$('[data-g]', out).forEach((inp) => (inp.onchange = () => {
    const v = Math.max(0, Math.min(+inp.max, Math.round(+inp.value)));
    inp.value = v;
    grades[inp.dataset.g] = v;
    store(gradesKey(cls.id), grades);
    toast('Score saved');
  }));
}

function exportCSV(cls, all, defs, grades) {
  const q = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const head = ['Student', ...defs.flatMap((m) => [`${m.title} score`, `${m.title} max`, `${m.title} %`, `${m.title} grade`]), 'Stream Lab', 'File date'];
  const rows = all.map((s) => [s.name, ...defs.flatMap((m) => {
    const a = attempt(s.p, m);
    if (!a) return ['', '', '', ''];
    if (!a.done) return ['in progress', m.max, '', ''];
    const sc = adjusted(a, m, grades, s.who), pct = Math.round((sc / a.max) * 100);
    return [sc, a.max, pct, gradeFor(pct)];
  }), s.p?.stream ? (s.p.stream.finished ? 'finished' : `${s.p.stream.sites}/4 sites`) : '', s.p ? new Date(s.p.exportedAt).toLocaleDateString() : 'no file']);
  download(`EarthLab-${cls.name.replace(/[^a-z0-9]+/gi, '-')}-grades-${new Date().toISOString().slice(0, 10)}.csv`, [head, ...rows].map((r) => r.map(q).join(',')).join('\r\n'), 'text/csv');
}

// ---------- backup ----------

function renderBackup(body) {
  body.innerHTML = `
    <section class="card">
      <h2>Back up your classes</h2>
      <p class="hint">Rosters, PINs and gradebooks live only in this browser. Download a backup now and then, and to move to another computer.</p>
      <div class="row"><button class="primary" id="bk-down">💾 Download backup</button>
        <label class="file-btn">📂 Restore from a backup<input type="file" id="bk-up" accept=".json,application/json" hidden></label></div>
    </section>`;
  $('#bk-down').onclick = () => {
    const data = {};
    Object.keys(localStorage).filter((k) => k.startsWith('earthlab:teacher:') && k !== PW_KEY).forEach((k) => (data[k] = localStorage.getItem(k)));
    download(`EarthLab-teacher-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify({ earthlabTeacherBackup: 1, data }), 'application/json');
  };
  $('#bk-up').onchange = async (e) => {
    try {
      const b = JSON.parse(await e.target.files[0].text());
      if (!b.earthlabTeacherBackup) throw new Error();
      if (!confirm('Replace the classes and gradebooks on this computer with this backup?')) return;
      Object.entries(b.data).forEach(([k, v]) => { if (k.startsWith('earthlab:teacher:') && k !== PW_KEY) localStorage.setItem(k, v); });
      view.classId = null; view.tab = 'classes'; start();
      toast('Backup restored.');
    } catch { toast("That isn't an EarthLab teacher backup file."); }
  };
}

gate();
