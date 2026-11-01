// EarthLab classes without a server.
// The teacher console makes a *class link* that carries the class name, the roster
// (names plus a check value for each student's PIN), which labs are open, and a
// timer. Students open it once; it is saved on their device. Later the teacher can
// change locks or the timer with a short *lab code* shown on the board.
// PIN checks happen on the student's device, so they stop casual sign-ins as a
// classmate; they are not bank-grade security.

import { hashString } from './rng.js';

const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)
// Fixed order: a lab's position here is its bit in a lab code. Only ever append.
export const LAB_IDS = ['stream', 'biodiversity', 'lifescience', 'cellbio', 'lake', 'reef', 'climate', 'farm', 'energy'];
const STATE_KEY = 'earthlab:class:v1';

const b64url = (s) => btoa(unescape(encodeURIComponent(s))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64url = (s) => decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/'))));

export function newClassId() {
  const a = crypto.getRandomValues(new Uint8Array(5));
  return Array.from(a, (b) => ALPH[b % 32]).join('');
}

export function randomPin() {
  return String(crypto.getRandomValues(new Uint32Array(1))[0] % 10000).padStart(4, '0');
}

export const pinCheck = (classId, idx, pin) => (hashString(`pin|${classId}|${idx}|${pin}`) % 1679616).toString(36);

// Students are stored as "First L." so full names never travel in links or files.
export function shortName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '';
  return parts.length > 1 ? `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.` : parts[0];
}

// ---------- class links ----------

// Links for students always point at the public site. A console opened from a copy on this
// computer (localhost, a file) would otherwise hand out links that only work on this computer.
const LIVE = 'https://mrabdull.github.io/apes-stream-lab/';
export const studentBase = () => (/^(localhost|127\.0\.0\.1|\[::1\]|)$/.test(location.hostname) || location.protocol === 'file:' ? LIVE : location.href);

export function encodeClassLink(cls, base) {
  const data = {
    v: 1, i: cls.id, n: cls.name,
    r: cls.roster.map((s, k) => [s.name, pinCheck(cls.id, k, s.pin)]),
    o: maskOf(cls.open), e: cls.end || 0, s: cls.stream || '',
  };
  return new URL(`index.html#join=${b64url(JSON.stringify(data))}`, base).href;
}

export function decodeClassLink(hash) {
  try {
    const m = /join=([A-Za-z0-9_-]+)/.exec(hash || '');
    if (!m) return null;
    const d = JSON.parse(unb64url(m[1]));
    if (d.v !== 1 || !d.i || !Array.isArray(d.r)) return null;
    return { id: d.i, name: d.n || 'Class', roster: d.r.map(([name, check]) => ({ name, check })), open: openOf(d.o), end: d.e || 0, stream: d.s || '' };
  } catch { return null; }
}

// ---------- lab codes ----------
// 35 bits: class check (8) · open labs (9) · end time in 5-minute slots after midnight (9) · day of year (9), plus a check character.

const maskOf = (ids) => (ids || []).reduce((m, id) => (LAB_IDS.includes(id) ? m | (1 << LAB_IDS.indexOf(id)) : m), 0);
const openOf = (mask) => LAB_IDS.filter((_, i) => mask & (1 << i));
const classCheck = (id) => hashString(`cc|${id}`) % 256;
const dayOfYear = (d) => Math.floor((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(d.getFullYear(), 0, 0)) / 864e5);
const checkChar = (body) => ALPH[[...body].reduce((c, ch, i) => (c + (ALPH.indexOf(ch) + 1) * (i + 5)) % 32, 0)];

export function encodeLabCode(classId, open, end) {
  let slot = 0, day = 0;
  if (end) { const d = new Date(end); slot = Math.min(287, Math.round((d.getHours() * 60 + d.getMinutes()) / 5)); day = dayOfYear(d); }
  let n = classCheck(classId);
  n = n * 512 + maskOf(open);
  n = n * 512 + slot;
  n = n * 512 + day;
  let body = '';
  for (let i = 0; i < 7; i++) { body = ALPH[n % 32] + body; n = Math.floor(n / 32); }
  const raw = body + checkChar(body);
  return raw.slice(0, 4) + '-' + raw.slice(4);
}

export function decodeLabCode(classId, code) {
  const s = String(code || '').toUpperCase().replace(/[^0-9A-Z]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1').replace(/U/g, 'V');
  if (s.length !== 8 || checkChar(s.slice(0, 7)) !== s[7]) return null;
  let n = 0;
  for (const ch of s.slice(0, 7)) n = n * 32 + ALPH.indexOf(ch);
  const day = n % 512; n = Math.floor(n / 512);
  const slot = n % 512; n = Math.floor(n / 512);
  const mask = n % 512; n = Math.floor(n / 512);
  if (n !== classCheck(classId)) return null;
  let end = 0;
  const now = new Date();
  if (slot && day === dayOfYear(now)) end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, slot * 5).getTime();
  return { open: openOf(mask), end };
}

// ---------- the class saved on a student's device ----------

export function loadClass() {
  try { return JSON.parse(localStorage.getItem(STATE_KEY) || 'null'); } catch { return null; }
}

export function saveClass(cls) {
  try { localStorage.setItem(STATE_KEY, JSON.stringify(cls)); } catch { /* storage unavailable */ }
}

export function applyLabCode(code) {
  const cls = loadClass();
  if (!cls) return null;
  const r = decodeLabCode(cls.id, code);
  if (!r) return null;
  Object.assign(cls, r);
  saveClass(cls);
  return cls;
}

// Labs are open when the student isn't in a class (practice), or the teacher opened them.
export function labOpen(labId) {
  const cls = loadClass();
  return !cls || cls.open.includes(labId);
}

export function timeLeft() {
  const cls = loadClass();
  return cls?.end ? cls.end - Date.now() : null;
}
