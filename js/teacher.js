// Teacher tools: create a class code, make groups, and look up any student's or
// group's answer key. Everything runs in the teacher's browser; rosters never leave it.

import { encodeClass, decodeClass, describeClass, randomSalt, teacherGroupCode, teacherKeyFor, normalizeCode, normalizeEmail, seedKeyFor, labFingerprint } from './codes.js';
import { generateLab, siteDisplayName, TESTS, TAXON, GROUPS, SOURCES } from './model.js';
import { localJSON, setLocalJSON } from './storage.js';
import { fmtTest } from './report.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const CLASSES_KEY = 'vlab:teacher:classes';
const rosterKey = (code) => `vlab:teacher:roster:${code}`;

let current = null; // decoded class currently being worked on

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.t);
  toast.t = setTimeout(() => t.classList.remove('show'), 2800);
}

async function copy(text) {
  try { await navigator.clipboard.writeText(text); toast('Copied'); } catch { prompt('Copy this:', text); }
}

function studentLink(code) {
  return new URL(`stream.html?class=${encodeURIComponent(code)}`, location.href).href;
}

function render() {
  const saved = localJSON(CLASSES_KEY, []);
  $('#teacher').innerHTML = `
    <header class="no-print">
      <p><a href="teacher.html">← EarthLab teacher console</a></p>
      <h1>Stream Health Lab: Teacher Tools</h1>
      <p class="hint">Bookmark this page. Don't share its link with students: it contains the answer keys.</p>
    </header>

    <section class="card no-print">
      <h2>1. Create a class code</h2>
      <div class="opt-grid">
        <fieldset><legend>Lab type</legend>
          <label class="radio"><input type="radio" name="mode" value="individual" checked> Individual: each student gets their own stream</label>
          <label class="radio"><input type="radio" name="mode" value="group"> Group: each group shares one stream</label>
        </fieldset>
        <fieldset id="f-formation" disabled><legend>How groups form</legend>
          <label class="radio"><input type="radio" name="formation" value="teacher" checked> I choose the groups</label>
          <label class="radio"><input type="radio" name="formation" value="random"> Randomly assign students</label>
          <label class="radio"><input type="radio" name="formation" value="students"> Students pick their own groups</label>
          <label>Group size <select id="size">${[2, 3, 4, 5].map((n) => `<option ${n === 4 ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        </fieldset>
        <fieldset><legend>Scenario</legend>
          <label class="radio"><input type="radio" name="scenario" value="standard" checked> Standard: the pipe at Site 3 is a labeled wastewater plant</label>
          <label class="radio"><input type="radio" name="scenario" value="mystery"> Mystery: each student or group gets a hidden pollution source (sewage, thermal, sediment or farm drainage) to identify</label>
        </fieldset>
      </div>
      <div class="row"><button class="primary big" id="create">Create class code</button></div>
    </section>

    <section class="card no-print">
      <h2>Open an existing class</h2>
      <div class="row">
        <input id="open-code" placeholder="Class code" autocapitalize="characters">
        <button class="secondary" id="open">Open</button>
      </div>
      ${saved.length ? `<p class="hint">Classes created on this device:</p><div class="row">${saved.map((c) => `<button class="secondary saved" data-code="${esc(c.code)}">${esc(c.name || c.code)} <small>${esc(c.code)}</small></button>`).join('')}</div>` : ''}
    </section>

    <div id="class-area"></div>

    <section class="card">
      <h2>3. Answer key and lab check</h2>
      <p class="hint no-print">Each student or group has different data. Enter a class code and your teacher key, then a student's email (individual labs; for students who joined through an EarthLab class, use the Stream Lab ID from the console roster) or group code (group labs) to see that stream's correct values and answers. Compare the Lab ID with the one printed on their report.</p>
      <div class="row no-print">
        <input id="k-class" placeholder="Class code" autocapitalize="characters" size="10">
        <input id="k-key" placeholder="Teacher key" autocapitalize="characters" size="8">
        <input id="k-who" placeholder="Student email or group code" size="28" autocapitalize="off">
        <button class="primary" id="k-go">Show answer key</button>
      </div>
      <p class="error" id="k-err"></p>
      <div id="key-out"></div>
    </section>`;

  const syncFormation = () => {
    $('#f-formation').disabled = $('input[name="mode"]:checked').value !== 'group';
  };
  $$('input[name="mode"]').forEach((r) => (r.onchange = syncFormation));
  $('#create').onclick = createClass;
  $('#open').onclick = () => openClass($('#open-code').value);
  $$('.saved').forEach((b) => (b.onclick = () => openClass(b.dataset.code)));
  $('#k-go').onclick = showKey;
}

function createClass() {
  const mode = $('input[name="mode"]:checked').value;
  const cfg = {
    labId: 1,
    mode,
    formation: mode === 'group' ? $('input[name="formation"]:checked').value : 'teacher',
    scenario: $('input[name="scenario"]:checked').value,
    groupSize: +$('#size').value,
    salt: randomSalt(),
  };
  const code = encodeClass(cfg);
  const name = prompt('Optional: name this class (e.g. "APES Period 3"). Only you see this.', '') || '';
  const saved = localJSON(CLASSES_KEY, []);
  saved.unshift({ code, name, created: Date.now() });
  setLocalJSON(CLASSES_KEY, saved.slice(0, 30));
  render();
  openClass(code);
}

function openClass(raw) {
  const cls = decodeClass(raw);
  if (!cls) { toast('That class code isn\'t valid.'); return; }
  current = cls;
  const key = teacherKeyFor(cls.salt);
  const link = studentLink(cls.code);
  $('#k-class').value = cls.code;
  $('#k-key').value = key;
  $('#class-area').innerHTML = `
    <section class="card">
      <h2>Class ${esc(cls.code)}</h2>
      <p>${esc(describeClass(cls))}</p>
      <div class="code-box">
        <div><span>Class code (give to students)</span><div class="code-big">${esc(cls.code)}</div></div>
        <div class="no-print"><span>Teacher key (keep private)</span><div class="code-big">${esc(key)}</div></div>
      </div>
      <div class="row no-print">
        <button class="secondary" id="c-copy-code">Copy class code</button>
        <button class="secondary" id="c-copy-link">Copy student link</button>
        <span class="hint">${esc(link)}</span>
      </div>
      <p class="hint no-print">Students open the link (or the lab page and type the code), then enter their name and email. Write down your teacher key: you need it to open the answer key.</p>
    </section>
    ${cls.mode === 'group' ? groupSection(cls) : ''}`;
  $('#c-copy-code').onclick = () => copy(cls.code);
  $('#c-copy-link').onclick = () => copy(link);
  if (cls.mode === 'group') wireGroups(cls);
  $('#class-area').scrollIntoView({ behavior: 'smooth' });
}

// ---------- groups ----------

function groupSection(cls) {
  if (cls.formation === 'students') {
    return `<section class="card"><h2>2. Groups</h2>
      <p>Students pick their own groups. In each group, one student taps <strong>"Make a new group code"</strong> on the join screen and shares it, and everyone in the group enters that same code. Groups of about ${cls.groupSize}.</p>
      <p class="hint">To check a group's work, ask them for their group code (it's printed on their report) and use the answer key below.</p></section>`;
  }
  const saved = localJSON(rosterKey(cls.code), null);
  return `<section class="card">
    <h2>2. Groups</h2>
    <p class="hint no-print">Paste your class list, one student per line. The list stays on this device and is never uploaded.</p>
    <textarea id="roster" rows="8" class="no-print" placeholder="Ana Lopez&#10;Ben Carter&#10;…">${esc(saved?.names?.join('\n') || '')}</textarea>
    <div class="row no-print">
      <button class="primary" id="g-make">${cls.formation === 'random' ? 'Randomly assign groups' : 'Make groups'}</button>
      ${cls.formation === 'random' ? '<button class="secondary" id="g-reshuffle">Reshuffle</button>' : ''}
      <button class="secondary" id="g-copy">Copy group list</button>
      <button class="secondary" id="g-print">Print</button>
    </div>
    <div id="g-out"></div>
  </section>`;
}

function shuffle(arr) {
  const a = arr.slice();
  const r = new Uint32Array(a.length);
  crypto.getRandomValues(r);
  for (let i = a.length - 1; i > 0; i--) {
    const j = r[i] % (i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function chunk(names, size) {
  const count = Math.max(1, Math.ceil(names.length / size)); // never larger than the chosen size
  const groups = Array.from({ length: count }, () => []);
  names.forEach((n, i) => groups[i % count].push(n));
  return groups;
}

function wireGroups(cls) {
  const state = localJSON(rosterKey(cls.code), null);
  const save = (s) => setLocalJSON(rosterKey(cls.code), s);
  const names = () => $('#roster').value.split('\n').map((s) => s.trim()).filter(Boolean);

  const draw = (s) => {
    if (!s?.assign) { $('#g-out').innerHTML = ''; return; }
    const count = Math.max(...Object.values(s.assign), 0) + 1;
    const groups = Array.from({ length: count }, () => []);
    s.names.forEach((n) => groups[s.assign[n] ?? 0].push(n));
    $('#g-out').innerHTML = `
      <div class="groups">${groups.map((g, i) => `
        <div class="group-card"><h4><span>Group ${i + 1}</span><code>${teacherGroupCode(cls.salt, i)}</code></h4>
          <ul>${g.map((n) => `<li>${esc(n)}</li>`).join('') || '<li class="muted">empty</li>'}</ul></div>`).join('')}
      </div>
      ${cls.formation === 'teacher' ? `
        <h3 class="no-print">Move students between groups</h3>
        <div class="no-print">${s.names.map((n) => `
          <div class="assign-row"><span>${esc(n)}</span>
            <select data-name="${esc(n)}">${Array.from({ length: count + 1 }, (_, i) => `<option value="${i}" ${s.assign[n] === i ? 'selected' : ''}>${i === count ? '+ New group' : `Group ${i + 1}`}</option>`).join('')}</select>
          </div>`).join('')}</div>` : ''}`;
    $$('#g-out select').forEach((sel) => (sel.onchange = () => {
      s.assign[sel.dataset.name] = +sel.value;
      // keep group numbers compact
      const used = [...new Set(Object.values(s.assign))].sort((a, b) => a - b);
      for (const n of Object.keys(s.assign)) s.assign[n] = used.indexOf(s.assign[n]);
      save(s); draw(s);
    }));
  };

  const make = (randomize) => {
    const list = names();
    if (!list.length) { toast('Paste your class list first.'); return; }
    const ordered = randomize ? shuffle(list) : list;
    const groups = chunk(ordered, cls.groupSize);
    const assign = {};
    groups.forEach((g, i) => g.forEach((n) => (assign[n] = i)));
    const s = { names: list, assign };
    save(s); draw(s);
  };

  $('#g-make').onclick = () => make(cls.formation === 'random');
  $('#g-reshuffle')?.addEventListener('click', () => make(true));
  $('#g-copy').onclick = () => {
    const s = localJSON(rosterKey(cls.code), null);
    if (!s?.assign) return toast('Make groups first.');
    const count = Math.max(...Object.values(s.assign)) + 1;
    const lines = [`Stream Health Lab · Class code ${cls.code}`];
    for (let i = 0; i < count; i++) {
      lines.push(`Group ${i + 1} (group code ${teacherGroupCode(cls.salt, i)}): ${s.names.filter((n) => s.assign[n] === i).join(', ')}`);
    }
    copy(lines.join('\n'));
  };
  $('#g-print').onclick = () => window.print();
  draw(state);
}

// ---------- answer key ----------

function showKey() {
  const err = (m) => { $('#k-err').textContent = m; $('#key-out').innerHTML = ''; };
  const cls = decodeClass($('#k-class').value);
  if (!cls) return err('That class code isn\'t valid.');
  if (normalizeCode($('#k-key').value) !== teacherKeyFor(cls.salt)) return err('That teacher key doesn\'t match this class.');
  const who = $('#k-who').value.trim();
  if (!who) return err(cls.mode === 'group' ? 'Enter a group code.' : 'Enter a student email.');
  let seed;
  if (cls.mode === 'group') {
    const g = normalizeCode(who);
    if (g.length !== 4) return err('Group codes are 4 characters.');
    seed = seedKeyFor(cls, null, g);
  } else {
    if (!who.includes('@')) return err('Enter the student\'s email address.');
    seed = seedKeyFor(cls, normalizeEmail(who), null);
  }
  $('#k-err').textContent = '';
  const lab = generateLab(seed, cls);

  $('#key-out').innerHTML = `
    <div class="code-box"><div><span>Lab ID (matches the report)</span><div class="code-big">${labFingerprint(seed)}</div></div>
      <div><span>${cls.mode === 'group' ? 'Group' : 'Student'}</span><strong>${esc(who)}</strong></div>
      <div><span>Pollution source at Site 3</span><strong>${esc(SOURCES[lab.source].label)}</strong></div></div>

    <h3>Water quality</h3>
    <div class="table-wrap"><table class="data key-table">
      <thead><tr><th>Measurement</th>${lab.sites.map((s) => `<th>Site ${s.id}: ${esc(siteDisplayName(lab, s.id))}</th>`).join('')}</tr></thead>
      <tbody>${TESTS.map((t) => `<tr><td>${esc(t.name)}</td>${lab.sites.map((s) => `<td>${esc(fmtTest(t, s.chem[t.id]))}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>

    <h3>Organisms, index and rating</h3>
    <div class="table-wrap"><table class="data key-table">
      <thead><tr><th>Site</th>${[1, 2, 3].map((g) => `<th>${GROUPS[g].name} (×${GROUPS[g].weight})</th>`).join('')}<th>Index</th><th>Rating</th></tr></thead>
      <tbody>${lab.sites.map((s) => `<tr><td>Site ${s.id}</td>${[1, 2, 3].map((g) => `<td>${s.organisms.filter((o) => TAXON[o.taxonId].group === g).map((o, i, arr) => `${esc(TAXON[o.taxonId].name)} ×${o.count}${i < arr.length - 1 ? '<br>' : ''}`).join('') || '—'}</td>`).join('')}<td><strong>${s.index}</strong></td><td>${s.rating}</td></tr>`).join('')}</tbody>
    </table></div>

    <h3>Questions</h3>
    ${lab.questions.map((q) => `
      <div class="q-card"><p class="q-prompt"><span class="q-num-badge">${q.number}</span>${esc(q.prompt)}</p>
        ${q.type === 'numeric' ? `<p><strong>Answer: ${q.answer} ${esc(q.unit)}</strong> (accepted within ±${+q.tol.toFixed(2)}). Work: ${esc(q.work)}</p>` : ''}
        ${q.type === 'mc' ? `<p><strong>Answer: ${esc(q.options[q.answerIndex])}</strong>${q.work ? ` · ${esc(q.work)}` : ''}</p>` : ''}
        ${q.type === 'text' ? `<p><strong>Look for:</strong> ${esc(q.lookFor)}</p>` : ''}
      </div>`).join('')}
    <div class="row no-print"><button class="secondary" onclick="window.print()">Print this answer key</button></div>`;
}

render();
