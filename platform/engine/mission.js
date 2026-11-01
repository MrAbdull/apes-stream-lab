// Mission engine. Missions are plain JSON (no code): steps made of actions, each with
// a target, a gesture, an instruction, a hint, a validator, feedback and effects.
// Design inspired by the VossLab protocol simulation's YAML step/validator model
// (re-implemented here; no code copied). Progress checkpoints after every action.

import { esc } from './hud.js';
import { fingerprint, saveCheckpoint, getCheckpoint, recordResult, gradeFor } from './progress.js';

const MAX_TRIES = { numeric: 3, choice: 2, text: 99 };

export class MissionRunner {
  constructor({ mission, world, hud, interactions, profile, worldId, npcs = [], onExit }) {
    Object.assign(this, { m: mission, world, hud, ix: interactions, profile, worldId, npcs, onExit });
    this.fp = fingerprint(mission);
    this.actions = [];
    mission.steps.forEach((step, si) => step.sequence.forEach((action, ai) => this.actions.push({ si, ai, step, action })));
    this.max = this.actions.reduce((s, c) => s + (c.action.points ?? 10), 0);
    this.state = { i: 0, score: 0, hints: {}, tries: {}, answers: {}, results: {}, startedAt: Date.now() };
    this.unsub = interactions.on((g, id, v) => this.handle(g, id, v));
  }

  key(c) { return `${c.si}.${c.ai}`; }
  get cur() { return this.actions[this.state.i]; }

  start() {
    const saved = getCheckpoint(this.profile, this.worldId, this.m.id, this.fp);
    if (saved) {
      this.state = saved;
      // Re-apply the world changes made by completed actions (e.g. placed equipment).
      for (const c of this.actions.slice(0, this.state.i)) for (const e of c.action.effects || []) this.world.effects?.[e.name]?.(e.args || {}, { silent: true });
      this.world.restore?.(saved.worldState);
      this.hud.toast('Welcome back! Your mission progress was restored.');
    }
    this.refresh();
  }

  // Does the current action expect this gesture on this target? Worlds use this before opening tools.
  expects(gesture, id) {
    const a = this.cur?.action;
    return !!a && a.gesture === gesture && (!a.target || a.target === id);
  }

  currentInstruction() {
    const c = this.cur;
    return c ? `${c.action.instruction}${this.state.hints[this.key(c)] && c.action.hint ? ` Hint: ${c.action.hint}` : ''}` : 'Mission complete!';
  }

  handle(gesture, id, value) {
    const c = this.cur;
    if (!c || this.done) return;
    const a = c.action;
    if (a.gesture !== gesture || (a.target && a.target !== id) || gesture === 'answer') return;
    if (this.validate(a, value)) this.succeed(c, value);
    else this.fail(c);
  }

  expected(v) {
    return v.expected && typeof v.expected === 'object' && v.expected.fn ? this.world.compute(v.expected.fn, v.expected.args || {}) : v.expected;
  }

  validate(a, value) {
    const v = a.validator || { preset: 'correct_target' };
    switch (v.preset) {
      case 'correct_target': return true;
      case 'value_within': return Number.isFinite(Number(value)) && Math.abs(Number(value) - this.expected(v)) <= (v.tolerance ?? 0) + 1e-9;
      case 'choice': return String(value) === String(v.answer ?? this.expected(v));
      case 'count_at_least': return Number(value) >= v.min;
      case 'free_text': return String(value || '').trim().split(/\s+/).filter(Boolean).length >= (v.minWords ?? 8);
      case 'custom': return !!this.world.validate?.(v.fn, v.args || {}, value);
      default: return false;
    }
  }

  succeed(c, value, { gaveUp = false } = {}) {
    const a = c.action, k = this.key(c), pts = a.points ?? 10;
    const tries = this.state.tries[k] || 0;
    const mistakes = this.state.mistakes?.[k] || 0;
    let earned = gaveUp ? 0 : pts * (this.state.hints[k] ? 0.7 : 1) * Math.max(0.25, 1 - 0.25 * tries) * Math.max(0.4, 1 - 0.1 * mistakes);
    earned = Math.round(earned);
    this.state.score += earned;
    this.state.results[k] = { earned, max: pts, tries, mistakes, hint: !!this.state.hints[k], gaveUp };
    if (value !== undefined) this.state.answers[k] = value;
    if (!gaveUp && a.feedback?.correct) this.hud.toast('✓ ' + a.feedback.correct, 'good');
    for (const e of a.effects || []) this.world.effects?.[e.name]?.(e.args || {}, { silent: false });
    this.state.i++;
    this.checkpoint();
    if (this.state.i >= this.actions.length) return this.finish();
    const next = this.cur;
    if (next.si !== c.si) setTimeout(() => this.hud.toast(`Step ${next.si + 1}: ${next.step.title}`), gaveUp || !a.feedback?.correct ? 0 : 1800);
    this.refresh();
  }

  fail(c) {
    const k = this.key(c);
    this.state.tries[k] = (this.state.tries[k] || 0) + 1;
    this.hud.toast(c.action.feedback?.incorrect || 'Not quite. Check your work and try again.', 'bad');
    this.checkpoint();
    this.refresh();
  }

  // Small in-task errors (e.g. a misidentified organism) each cost 10% of the task, down to 40%.
  addMistake() {
    const c = this.cur;
    if (!c) return;
    this.state.mistakes ||= {};
    const k = this.key(c);
    this.state.mistakes[k] = (this.state.mistakes[k] || 0) + 1;
  }

  useHint() {
    const c = this.cur;
    if (!c?.action.hint) return;
    this.state.hints[this.key(c)] = true;
    this.hud.toast('💡 ' + c.action.hint);
    this.checkpoint();
    this.refresh();
  }

  checkpoint() {
    this.state.worldState = this.world.snapshot?.() ?? null;
    if (!this.done) saveCheckpoint(this.profile, this.worldId, this.m.id, this.fp, this.state);
  }

  refresh() {
    const c = this.cur;
    if (!c) return;
    const a = c.action, k = this.key(c);
    const pct = Math.round((this.state.i / this.actions.length) * 100);
    this.hud.setTracker(`
      <div class="pf-tr-head"><span>${esc(this.m.title)}</span><span class="pf-score">${this.state.score} pts</span></div>
      <div class="pf-bar"><div style="width:${pct}%"></div></div>
      <div class="pf-step">Step ${c.si + 1} of ${this.m.steps.length}: ${esc(c.step.title)}</div>
      <p class="pf-instr">${esc(a.instruction)}</p>
      ${this.state.hints[k] && a.hint ? `<p class="pf-hint">💡 ${esc(a.hint)}</p>` : ''}
      <div class="pf-tr-actions">
        ${a.gesture === 'answer' ? '<button class="primary" data-tr="answer">Answer question</button>' : ''}
        ${a.hint && !this.state.hints[k] ? '<button data-tr="hint">💡 Hint</button>' : ''}
        ${this.world.openNotebook ? '<button data-tr="notebook">📓 Data</button>' : ''}
      </div>`);
    this.hud.tracker.querySelector('[data-tr="answer"]')?.addEventListener('click', () => this.openQuestion(c));
    this.hud.tracker.querySelector('[data-tr="hint"]')?.addEventListener('click', () => this.useHint());
    this.hud.tracker.querySelector('[data-tr="notebook"]')?.addEventListener('click', () => this.world.openNotebook());
    this.ix.setGuide(a.target || null);
    if (a.gesture === 'go' && this.ix.zones.get(a.target)?.inside) setTimeout(() => this.handle('go', a.target), 400);
    for (const npc of this.npcs) {
      npc.setScript(() => (a.gesture === 'talk' && a.target === npc.id && a.npcLines)
        ? a.npcLines
        : [`${npc.idle || 'Keep going!'} Your current task: ${a.instruction}`]);
    }
  }

  openQuestion(c) {
    const a = c.action, q = a.question, k = this.key(c);
    const options = q.options && !Array.isArray(q.options) ? this.world.compute(q.options.fn, q.options.args || {}) : q.options;
    const max = MAX_TRIES[q.type] ?? 3;
    this.hud.openPanel(`Question ${c.ai + 1}: ${c.step.title}`, (body) => {
      const tries = this.state.tries[k] || 0;
      body.innerHTML = `
        <p class="q-prompt">${esc(q.prompt)}</p>
        ${q.showData && this.world.dataHTML ? `<div class="pf-data">${this.world.dataHTML()}</div>` : ''}
        ${q.type === 'numeric' ? `<div class="row"><input class="pf-in" inputmode="decimal" placeholder="Your answer"> <span>${esc(q.unit || '')}</span></div>` : ''}
        ${q.type === 'choice' ? `<div class="mc">${options.map((o, i) => `<label class="mc-opt"><input type="radio" name="pfq" value="${esc(o.value ?? o)}"> ${esc(o.label ?? o)}</label>`).join('')}</div>` : ''}
        ${q.type === 'text' ? `<textarea class="pf-in" rows="6" placeholder="Use evidence from your data…">${esc(this.state.answers[k] || '')}</textarea><p class="hint">At least ${a.validator?.minWords ?? 8} words. Your teacher reviews written answers.</p>` : ''}
        <div class="row"><button class="primary" id="pf-submit">Submit</button>${q.type !== 'text' ? `<span class="muted">${max - tries} ${max - tries === 1 ? 'try' : 'tries'} left</span>` : ''}</div>
        <p class="feedback" id="pf-fb"></p>`;
      body.querySelector('#pf-submit').onclick = () => {
        let v;
        if (q.type === 'numeric') v = parseFloat(body.querySelector('.pf-in').value.replace(/,/g, '.').replace(/[−–]/g, '-'));
        else if (q.type === 'choice') v = body.querySelector('input[name="pfq"]:checked')?.value;
        else v = body.querySelector('.pf-in').value;
        if (v === undefined || (q.type === 'numeric' && Number.isNaN(v))) { body.querySelector('#pf-fb').textContent = 'Enter an answer first.'; return; }
        if (this.validate(a, v)) { this.hud.closePanel(); this.succeed(c, v); return; }
        this.state.tries[k] = tries + 1;
        if (q.type !== 'text' && tries + 1 >= max) {
          this.hud.closePanel();
          this.hud.toast(`Recorded. ${a.feedback?.reveal ? a.feedback.reveal : 'Review this with your teacher.'}`, 'bad');
          this.state.answers[k] = v;
          this.succeed(c, v, { gaveUp: true });
          return;
        }
        this.checkpoint();
        this.hud.rerender();
        const fb = this.hud.backdrop.querySelector('#pf-fb');
        fb.className = 'feedback bad';
        fb.textContent = a.feedback?.incorrect || (q.type === 'text' ? `Write at least ${a.validator?.minWords ?? 8} words.` : 'Not quite. Check your data and try again.');
      };
    }, { wide: !!q.showData });
  }

  finish() {
    this.done = true;
    this.ix.setGuide(null);
    this.hud.setTracker(null);
    const pct = Math.round((this.state.score / this.max) * 100);
    const grade = gradeFor(pct);
    const result = {
      score: this.state.score, max: this.max, pct, grade, startedAt: this.state.startedAt, finishedAt: Date.now(),
      answers: this.state.answers, results: this.state.results, badge: pct >= 70 ? this.m.badge : null,
    };
    recordResult(this.profile, this.worldId, this.m.id, result);
    this.world.onMissionComplete?.(this.m, result);
    this.hud.openPanel('Mission complete!', (body) => {
      const rows = this.m.steps.map((s, si) => {
        const acts = this.actions.filter((c) => c.si === si);
        const earned = acts.reduce((t, c) => t + (this.state.results[this.key(c)]?.earned || 0), 0);
        const max = acts.reduce((t, c) => t + (c.action.points ?? 10), 0);
        return `<tr><td>${esc(s.title)}</td><td>${earned} / ${max}</td></tr>`;
      }).join('');
      body.innerHTML = `
        <div class="pf-result"><div class="pf-grade g-${grade}">${grade}</div>
          <div><h3>${esc(this.m.title)}</h3><p>${this.state.score} of ${this.max} points (${pct}%)</p>
          ${result.badge ? `<p class="good">🏅 Badge earned: ${esc(result.badge.name)}</p>` : '<p class="muted">Score 70% or more to earn this mission\'s badge.</p>'}</div></div>
        <h3>What you practiced</h3><ul>${(this.m.objectives || []).map((o) => `<li>${esc(o)}</li>`).join('')}</ul>
        <table class="data"><thead><tr><th>Step</th><th>Points</th></tr></thead><tbody>${rows}</tbody></table>
        <p class="hint">Hints cost 30% of a task's points; each wrong try costs 25%; each misidentified organism costs 10%.</p>
        <div class="row"><button class="primary big" id="pf-campus">Back to campus</button><button class="secondary" id="pf-stay">Keep exploring</button><button class="secondary" id="pf-replay">Replay mission</button></div>`;
      body.querySelector('#pf-campus').onclick = () => this.onExit?.('campus');
      body.querySelector('#pf-stay').onclick = () => this.hud.closePanel();
      body.querySelector('#pf-replay').onclick = () => this.onExit?.('replay');
    }, { wide: true });
  }
}
