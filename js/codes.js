// Class codes, group codes and teacher keys.
// A class code packs the teacher's settings (lab, individual/group, how groups
// form, standard/mystery, group size) plus a random "salt" into 7 characters,
// so no server is needed: the code itself carries the settings.

import { hashString } from './rng.js';

const ALPH = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford base32 (no I, L, O, U)
const FORMATIONS = ['teacher', 'random', 'students'];
const LABS = { 1: 'stream' };
const SALT_SPACE = 1048576; // 20 bits

export function normalizeCode(s) {
  return String(s || '')
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    .replace(/O/g, '0')
    .replace(/[IL]/g, '1')
    .replace(/U/g, 'V');
}

function toB32(n, len) {
  let s = '';
  for (let i = 0; i < len; i++) { s = ALPH[n % 32] + s; n = Math.floor(n / 32); }
  return s;
}

function fromB32(s) {
  let n = 0;
  for (const ch of s) {
    const v = ALPH.indexOf(ch);
    if (v < 0) return null;
    n = n * 32 + v;
  }
  return n;
}

function checksum(body) {
  let c = 0;
  for (let i = 0; i < body.length; i++) c = (c + (ALPH.indexOf(body[i]) + 1) * (i + 3)) % 32;
  return c;
}

const pretty = (raw) => raw.slice(0, 4) + '-' + raw.slice(4);

export function encodeClass({ labId = 1, mode, formation, scenario, groupSize, salt }) {
  let n = labId;
  n = n * 2 + (mode === 'group' ? 1 : 0);
  n = n * 4 + FORMATIONS.indexOf(formation);
  n = n * 2 + (scenario === 'mystery' ? 1 : 0);
  n = n * 4 + (groupSize - 2);
  n = n * SALT_SPACE + salt;
  const body = toB32(n, 6);
  return pretty(body + ALPH[checksum(body)]);
}

export function decodeClass(code) {
  const s = normalizeCode(code);
  if (s.length !== 7) return null;
  const body = s.slice(0, 6);
  if (ALPH[checksum(body)] !== s[6]) return null;
  let n = fromB32(body);
  if (n === null) return null;
  const salt = n % SALT_SPACE; n = Math.floor(n / SALT_SPACE);
  const groupSize = (n % 4) + 2; n = Math.floor(n / 4);
  const scenario = n % 2 ? 'mystery' : 'standard'; n = Math.floor(n / 2);
  const formation = FORMATIONS[n % 4]; n = Math.floor(n / 4);
  const mode = n % 2 ? 'group' : 'individual'; n = Math.floor(n / 2);
  const labId = n;
  if (!LABS[labId] || !formation) return null;
  return { labId, lab: LABS[labId], mode, formation, scenario, groupSize, salt, code: pretty(s) };
}

export function randomSalt() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0] % SALT_SPACE;
}

// Group codes made by the teacher page are derived from the class salt, so the
// teacher can always regenerate the same list.
export function teacherGroupCode(salt, index) {
  return toB32(hashString(`grp|${salt}|${index}`) % SALT_SPACE, 4);
}

// Group codes made by students ("students pick") are just random.
export function randomGroupCode() {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return toB32(a[0] % SALT_SPACE, 4);
}

// Unlocks the answer key on the teacher page. This is a deterrent, not real
// security: with no server, a determined student could work it out from the code.
export function teacherKeyFor(salt) {
  return toB32(hashString(`tk|${salt}`) % 33554432, 5);
}

export function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

// The seed that decides a student's (or group's) stream.
export function seedKeyFor(cls, email, groupCode) {
  return cls.mode === 'group'
    ? `stream|${cls.salt}|g|${normalizeCode(groupCode)}`
    : `stream|${cls.salt}|s|${normalizeEmail(email)}`;
}

// Short ID printed on the report so the teacher can match it to the answer key.
export function labFingerprint(seedKey) {
  return toB32(hashString('fp|' + seedKey) % 33554432, 5);
}

export function describeClass(cls) {
  const mode = cls.mode === 'group'
    ? `Group lab (groups of ${cls.groupSize}, ${{ teacher: 'chosen by your teacher', random: 'randomly assigned', students: 'you pick your own group' }[cls.formation]})`
    : 'Individual lab';
  const scen = cls.scenario === 'mystery' ? 'Mystery mode' : 'Standard mode';
  return `${mode} · ${scen}`;
}
