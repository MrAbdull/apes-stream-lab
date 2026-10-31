// Progress lives only in the student's own browser (no server).
// Save files let a student move to another device or share with teammates.

const PREFIX = 'vlab:stream:v1:';

export function saveKey(classCode, email, groupCode) {
  const who = String(email || '').trim().toLowerCase();
  return PREFIX + classCode + ':' + who + (groupCode ? ':' + groupCode : '');
}

export function readSave(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function writeSave(key, state) {
  try {
    localStorage.setItem(key, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

export function removeSave(key) {
  try { localStorage.removeItem(key); } catch { /* storage unavailable */ }
}

// Ask the browser not to clear our data (helps on Safari; harmless elsewhere).
export function requestPersistence() {
  try { navigator.storage?.persist?.(); } catch { /* not supported */ }
}

export function downloadFile(name, content, mime = 'application/octet-stream') {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file);
  });
}

export function localJSON(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

export function setLocalJSON(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
}
