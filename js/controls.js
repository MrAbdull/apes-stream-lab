// "How to move" screen shown the first time a student enters each world.

const SEEN_KEY = 'earthlab:controls-seen';

export function controlsSeen(id) {
  try { return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]').includes(id); } catch { return true; }
}

export function markControlsSeen(id) {
  try {
    const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
    if (!seen.includes(id)) localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, id]));
  } catch { /* storage unavailable */ }
}

export function controlsHTML(isTouch, { jump = true } = {}) {
  const rows = isTouch ? [
    ['🕹️', 'Walk', 'Drag the joystick in the bottom-left corner.'],
    ['🏃', 'Run', 'Push the joystick all the way to the edge.'],
    ['👆', 'Look around', 'Drag anywhere else on the screen.'],
    ['🟩', 'Use or talk', 'Walk up close, then tap the green button that appears.'],
  ] : [
    ['⌨️', 'Walk', 'W A S D or the arrow keys.'],
    ['🏃', 'Run', 'Hold Shift while you walk.'],
    ...(jump ? [['⬆️', 'Jump', 'Space bar.']] : []),
    ['🖱️', 'Look around', 'Click and drag. Scroll to zoom in or out.'],
    ['🟩', 'Use or talk', 'Walk up close, then press E (or click the green button).'],
  ];
  return `
    <p class="lead">Here's how to get around. You can see this again any time with ❔ Controls.</p>
    <div class="pf-controls">${rows.map(([icon, what, how]) => `<div><span class="ic">${icon}</span><strong>${what}</strong><span>${how}</span></div>`).join('')}</div>
    <h3>Finding your way</h3>
    <ul>
      <li>A <strong>yellow arrow</strong> floats over your next target.</li>
      <li>The <strong>compass</strong> at the top shows which way to go and how far.</li>
      <li>Your <strong>mission panel</strong> lists the current task. Tap 📘 How to do this for step-by-step help.</li>
    </ul>`;
}
