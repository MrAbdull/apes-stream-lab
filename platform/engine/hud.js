// Shared on-screen interface for every world: title bar, mission tracker, guide compass,
// interaction prompt, dialogue box, toasts and modal panels.

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (s, r = document) => r.querySelector(s);

export class HUD {
  constructor(root, { title, subtitle, isTouch }) {
    this.root = root;
    this.isTouch = isTouch;
    root.innerHTML = `
      <div class="pf-top">
        <div class="pf-title"><strong>${esc(title)}</strong><span>${esc(subtitle || '')}</span></div>
        <div class="pf-compass hidden"><span class="pf-arrow">➤</span><span class="pf-compass-text"></span></div>
      </div>
      <div class="pf-tracker hidden" aria-live="polite"></div>
      <button class="pf-prompt hidden"></button>
      <div class="pf-actions"></div>
      <div class="pf-dialogue hidden" role="dialog" aria-live="polite">
        <div class="pf-speaker"><strong></strong><span></span></div>
        <p class="pf-line"></p>
        <div class="pf-choices"></div>
      </div>
      <div id="joystick" class="${isTouch ? '' : 'hidden'}" aria-hidden="true"><div class="knob"></div></div>`;
    this.tracker = $('.pf-tracker', root);
    this.promptBtn = $('.pf-prompt', root);
    this.actions = $('.pf-actions', root);
    this.dlg = $('.pf-dialogue', root);
    this.compass = $('.pf-compass', root);
    this.promptBtn.onclick = () => this.onPrompt?.();
    this.panelDepth = 0;

    this.backdrop = document.createElement('div');
    this.backdrop.className = 'pf-backdrop hidden';
    this.backdrop.innerHTML = '<div class="pf-panel" role="dialog" aria-modal="true"><header><h2></h2><button class="pf-close" aria-label="Close">✕</button></header><div class="pf-body"></div></div>';
    document.body.appendChild(this.backdrop);
    $('.pf-close', this.backdrop).onclick = () => this.closePanel();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !this.backdrop.classList.contains('hidden') && !this.panelLocked) this.closePanel(); });

    this.toastEl = document.createElement('div');
    this.toastEl.className = 'pf-toast';
    this.toastEl.setAttribute('role', 'status');
    document.body.appendChild(this.toastEl);

    // Re-flow the interface whenever the screen or anything on it changes, so pieces never overlap.
    window.addEventListener('resize', () => this.relayout());
    window.visualViewport?.addEventListener('resize', () => this.relayout());
    new ResizeObserver(() => this.relayout()).observe(root);
    this.relayout();
  }

  // Layout manager. Top items stack downward (title/compass, then the tracker); bottom items
  // stack upward (buttons and joystick, then the prompt or dialogue, then any message), and a
  // message moves to the top when the bottom is full. Everything is measured, not guessed.
  relayout() {
    if (this.layoutQueued) return;
    this.layoutQueued = true;
    requestAnimationFrame(() => { this.layoutQueued = false; this.layout(); });
  }

  layout() {
    const vw = window.innerWidth, vh = window.innerHeight, gap = 10;
    const shown = (el) => el && !el.classList.contains('hidden') && getComputedStyle(el).display !== 'none' && el.getBoundingClientRect().height > 0;
    const narrow = vw < 700;
    this.root.classList.toggle('pf-narrow', narrow);
    const docked = !!this.dock?.classList.contains('open');
    const dockW = docked && !narrow ? this.dock.getBoundingClientRect().width : 0;
    const dockTop = docked && narrow ? this.dock.getBoundingClientRect().top : vh;

    // Top: the tracker goes below the title and compass.
    const title = $('.pf-title', this.root);
    let topBottom = title.getBoundingClientRect().bottom;
    if (shown(this.compass)) topBottom = Math.max(topBottom, this.compass.getBoundingClientRect().bottom);
    this.tracker.style.top = `${Math.round(topBottom + gap)}px`;
    const trackerBottom = shown(this.tracker) ? this.tracker.getBoundingClientRect().bottom : topBottom;

    // Bottom: everything centered sits above the buttons and the joystick.
    let floor = Math.min(vh, dockTop);
    if (shown(this.actions) && !docked) floor = Math.min(floor, this.actions.getBoundingClientRect().top);
    const joy = this.joystick;
    if (shown(joy) && !docked) floor = Math.min(floor, joy.getBoundingClientRect().top);
    const stackBottom = Math.round(vh - floor + gap);
    const centerLeft = docked && !narrow ? (vw - dockW) / 2 : vw / 2;
    for (const el of [this.promptBtn, this.dlg]) { el.style.bottom = `${stackBottom}px`; el.style.left = `${centerLeft}px`; }
    this.dlg.style.maxWidth = `${Math.min(640, (docked ? vw - dockW : vw) - 24)}px`;
    this.dlg.style.maxHeight = `${Math.max(140, floor - trackerBottom - 2 * gap)}px`;

    // Message: just above the prompt/dialogue, or under the tracker if there isn't room.
    const t = this.toastEl;
    t.style.maxWidth = `${Math.min(560, (docked ? vw - dockW : vw) - 32)}px`;
    t.style.left = `${centerLeft}px`;
    let above = stackBottom;
    if (shown(this.dlg)) above += this.dlg.getBoundingClientRect().height + gap;
    else if (shown(this.promptBtn)) above += this.promptBtn.getBoundingClientRect().height + gap;
    const th = t.getBoundingClientRect().height || 48;
    // A window is open: put messages above or below it, or (phones) over its title bar, clear of the ✕.
    if (!this.backdrop.classList.contains('hidden')) {
      const pr = $('.pf-panel', this.backdrop).getBoundingClientRect(), hr = $('header', this.backdrop).getBoundingClientRect();
      t.style.left = `${pr.left + pr.width / 2}px`;
      t.style.bottom = 'auto';
      if (pr.top - 6 >= th + 4) t.style.top = `${Math.round(pr.top - th - 6)}px`;
      else if (vh - pr.bottom - 6 >= th + 4) t.style.top = `${Math.round(pr.bottom + 6)}px`;
      else {
        t.style.maxWidth = `${Math.max(160, pr.width - 120)}px`;
        t.style.top = `${Math.round(Math.max(4, hr.top + (hr.height - t.getBoundingClientRect().height) / 2))}px`;
      }
    }
    // Phones with a station open: keep messages at the top so the experiment stays visible.
    else if ((docked && narrow) || vh - above - th < trackerBottom + gap) { t.style.top = `${Math.round(trackerBottom + gap)}px`; t.style.bottom = 'auto'; }
    else { t.style.bottom = `${above}px`; t.style.top = 'auto'; }
  }

  get joystick() { return $('#joystick', this.root); }

  addAction(label, fn, { primary = false } = {}) {
    const b = document.createElement('button');
    b.innerHTML = label;
    if (primary) b.className = 'primary';
    b.onclick = fn;
    this.actions.appendChild(b);
    return b;
  }

  busy() { return !this.backdrop.classList.contains('hidden') || !this.dlg.classList.contains('hidden') || !!this.dock?.classList.contains('open'); }
  notify() { this.onBusyChange?.(this.busy()); }

  setPrompt(text) {
    this.promptText = text;
    this.promptBtn.classList.toggle('hidden', !text || this.busy());
    if (text) this.promptBtn.textContent = text + (this.isTouch ? '' : '  (E)');
    this.relayout();
  }

  setCompass(text, angle) {
    this.compass.classList.toggle('hidden', !text);
    if (!text) return;
    $('.pf-compass-text', this.compass).textContent = text;
    $('.pf-arrow', this.compass).style.transform = `rotate(${angle - Math.PI / 2}rad)`;
    if (this.compassText !== text.replace(/\d+ m/, '')) { this.compassText = text.replace(/\d+ m/, ''); this.relayout(); }
  }

  // The tracker can be minimized to one line (button in its corner) so it never hides the view.
  setTracker(html) {
    this.tracker.classList.toggle('hidden', !html);
    if (html) {
      this.tracker.innerHTML = `<button class="pf-tr-min" aria-label="${this.trackerMin ? 'Expand' : 'Minimize'} mission panel" title="${this.trackerMin ? 'Show' : 'Hide'} details">${this.trackerMin ? '▾' : '▴'}</button>${html}`;
      this.tracker.classList.toggle('min', !!this.trackerMin);
      this.tracker.querySelector('.pf-tr-min').onclick = () => { this.trackerMin = !this.trackerMin; this.setTracker(html); };
    }
    this.relayout();
  }

  toast(msg, kind = '') {
    this.toastEl.textContent = msg;
    this.toastEl.className = `pf-toast show ${kind}`;
    this.layout();
    clearTimeout(this.toastTimer);
    // Long messages stay up longer so students can finish reading them.
    this.toastTimer = setTimeout(() => (this.toastEl.className = 'pf-toast'), Math.min(9000, 2600 + msg.length * 55));
  }

  // nodes: array of strings or { text, choices: [{ label, value }] }. Resolves with the last choice value.
  dialogue(npc, nodes) {
    return new Promise((resolve) => {
      const list = (Array.isArray(nodes) ? nodes : [nodes]).map((n) => (typeof n === 'string' ? { text: n } : n));
      let i = 0, result;
      $('.pf-speaker strong', this.dlg).textContent = npc.name;
      $('.pf-speaker span', this.dlg).textContent = npc.role || '';
      this.dlg.classList.remove('hidden');
      this.relayout();
      this.promptBtn.classList.add('hidden');
      this.notify();
      const line = $('.pf-line', this.dlg), choices = $('.pf-choices', this.dlg);
      const finish = () => {
        this.dlg.classList.add('hidden');
        this.relayout();
        this.notify();
        this.setPrompt(this.promptText);
        resolve(result);
      };
      const show = () => {
        const n = list[i];
        line.textContent = n.text;
        choices.innerHTML = '';
        const opts = n.choices || [{ label: i < list.length - 1 ? 'Continue ›' : 'Got it', value: undefined }];
        opts.forEach((c, k) => {
          const b = document.createElement('button');
          b.className = k === 0 ? 'primary' : 'secondary';
          b.textContent = c.label;
          b.onclick = () => {
            if (c.value !== undefined) result = c.value;
            if (c.then) list.splice(i + 1, 0, ...c.then.map((x) => (typeof x === 'string' ? { text: x } : x)));
            i++;
            if (i >= list.length || c.end) finish(); else show();
          };
          choices.appendChild(b);
        });
        this.relayout();
        choices.querySelector('button')?.focus();
      };
      show();
    });
  }

  openPanel(title, render, { wide = false, locked = false } = {}) {
    this.panelRender = render;
    this.panelLocked = locked;
    $('h2', this.backdrop).textContent = title;
    $('.pf-panel', this.backdrop).classList.toggle('wide', wide);
    $('.pf-close', this.backdrop).classList.toggle('hidden', locked);
    this.backdrop.classList.remove('hidden');
    this.relayout();
    this.promptBtn.classList.add('hidden');
    this.rerender();
    $('.pf-body', this.backdrop).scrollTop = 0;
    this.notify();
  }

  rerender() {
    const body = $('.pf-body', this.backdrop);
    const top = body.scrollTop;
    body.innerHTML = '';
    this.panelRender(body, this);
    body.scrollTop = top;
  }

  // A side panel that leaves the 3D view visible (used at experiment stations).
  openDock(title, render, { onClose } = {}) {
    if (!this.dock) {
      this.dock = document.createElement('aside');
      this.dock.className = 'pf-dock';
      this.dock.innerHTML = '<header><h2></h2><button class="secondary pf-dock-close">Leave station</button></header><div class="pf-dock-body"></div>';
      this.root.appendChild(this.dock);
      this.dock.querySelector('.pf-dock-close').onclick = () => this.closeDock();
    }
    this.dockRender = render;
    this.onDockClose = onClose;
    this.dock.querySelector('h2').textContent = title;
    this.dock.classList.add('open');
    setTimeout(() => this.relayout(), 320); // after the slide-in
    this.root.classList.add('docked');
    this.promptBtn.classList.add('hidden');
    this.redock();
    this.notify();
  }

  redock() {
    const body = this.dock.querySelector('.pf-dock-body');
    const top = body.scrollTop;
    body.innerHTML = '';
    this.dockRender(body, this);
    body.scrollTop = top;
  }

  closeDock() {
    if (!this.dock?.classList.contains('open')) return;
    this.dock.classList.remove('open');
    this.relayout();
    this.root.classList.remove('docked');
    const fn = this.onDockClose;
    this.onDockClose = null;
    fn?.();
    this.notify();
    this.setPrompt(this.promptText);
  }

  closePanel() {
    this.backdrop.classList.add('hidden');
    this.relayout();
    this.panelRender = null;
    this.onPanelClose?.();
    this.onPanelClose = null;
    this.notify();
    this.setPrompt(this.promptText);
  }
}
