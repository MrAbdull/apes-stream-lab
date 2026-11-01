// The student's profile and progress across all worlds, kept in this browser
// (no server). Mission checkpoints carry a fingerprint of the mission file, so a
// checkpoint from an older version of a mission is discarded instead of misapplied.

import { hashString } from '../../js/rng.js';

const KEY = 'earthlab:profile:v1';
const SCHEMA = 1;

export function loadProfile() {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) || 'null');
    return p && p.schema === SCHEMA ? p : null;
  } catch { return null; }
}

export function saveProfile(p) {
  try { localStorage.setItem(KEY, JSON.stringify(p)); return true; } catch { return false; }
}

export function newProfile({ name, email, avatar }) {
  const id = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, '0')).join('');
  return { schema: SCHEMA, id, name, email: (email || '').trim().toLowerCase(), avatar, createdAt: Date.now(), worlds: {}, badges: [], log: [] };
}

// Seed for a student's own data, so every student's field data differs but stays the same for them.
export const seedFor = (p) => p.email || p.id;

export const fingerprint = (mission) => hashString(JSON.stringify(mission)).toString(36);

export function missionRecord(p, worldId, missionId) {
  p.worlds[worldId] ||= { missions: {} };
  return (p.worlds[worldId].missions[missionId] ||= { status: 'new', attempts: 0, best: null, checkpoint: null });
}

export function saveCheckpoint(p, worldId, missionId, fp, state) {
  const r = missionRecord(p, worldId, missionId);
  r.status = r.status === 'complete' ? 'complete' : 'in-progress';
  r.checkpoint = { fp, state, at: Date.now() };
  saveProfile(p);
}

export function getCheckpoint(p, worldId, missionId, fp) {
  const cp = p.worlds[worldId]?.missions[missionId]?.checkpoint;
  return cp && cp.fp === fp ? cp.state : null;
}

export function gradeFor(pct) {
  return pct >= 90 ? 'A' : pct >= 80 ? 'B' : pct >= 70 ? 'C' : pct >= 60 ? 'D' : 'F';
}

export function recordResult(p, worldId, missionId, result) {
  const r = missionRecord(p, worldId, missionId);
  r.attempts += 1;
  r.status = 'complete';
  r.checkpoint = null;
  r.last = result;
  if (!r.best || result.pct > r.best.pct) r.best = { score: result.score, max: result.max, pct: result.pct, grade: result.grade, at: result.finishedAt };
  if (result.badge && !p.badges.some((b) => b.id === result.badge.id)) p.badges.push({ ...result.badge, at: Date.now() });
  p.log.push({ t: Date.now(), msg: `Completed ${worldId}/${missionId}: ${result.score}/${result.max} (${result.grade})` });
  saveProfile(p);
}

export function exportProfile(p) {
  const blob = new Blob([JSON.stringify(p, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `EarthLab-progress-${p.name.replace(/[^a-z0-9]+/gi, '-')}-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

export async function readProfileFile(file) {
  const p = JSON.parse(await file.text());
  if (!p || p.schema !== SCHEMA || !p.name || !p.worlds) throw new Error('That file is not an EarthLab progress file.');
  return p;
}

// Status of the Stream Health Lab (a separate app with its own saves) for this student.
export function streamLabStatus(email) {
  if (!email) return null;
  let best = null;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k.startsWith('vlab:stream:v1:') || !k.includes(':' + email)) continue;
      const s = JSON.parse(localStorage.getItem(k));
      const sites = Object.values(s.sites || {}).filter((x) => x.kicked && Object.keys(x.tests || {}).length >= 7).length;
      const cand = { finished: !!s.finishedAt, sites, updatedAt: s.updatedAt || 0 };
      if (!best || cand.updatedAt > best.updatedAt) best = cand;
    }
  } catch { /* storage unavailable */ }
  return best;
}
