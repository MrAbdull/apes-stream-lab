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

  busy() { return !this.backdrop.classList.contains('hidden') || !this.dlg.classList.contains('hidden'); }
  notify() { this.onBusyChange?.(this.busy()); }

  setPrompt(text) {
    this.promptText = text;
    this.promptBtn.classList.toggle('hidden', !text || this.busy());
    if (text) this.promptBtn.textContent = text + (this.isTouch ? '' : '  (E)');
  }

  setCompass(text, angle) {
    this.compass.classList.toggle('hidden', !text);
    if (!text) return;
    $('.pf-compass-text', this.compass).textContent = text;
    $('.pf-arrow', this.compass).style.transform = `rotate(${angle - Math.PI / 2}rad)`;
  }

  setTracker(html) {
    this.tracker.classList.toggle('hidden', !html);
    if (html) this.tracker.innerHTML = html;
  }

  toast(msg, kind = '') {
    this.toastEl.textContent = msg;
    this.toastEl.className = `pf-toast show ${kind}`;
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => (this.toastEl.className = 'pf-toast'), 3600);
  }

  // nodes: array of strings or { text, choices: [{ label, value }] }. Resolves with the last choice value.
  dialogue(npc, nodes) {
    return new Promise((resolve) => {
      const list = (Array.isArray(nodes) ? nodes : [nodes]).map((n) => (typeof n === 'string' ? { text: n } : n));
      let i = 0, result;
      $('.pf-speaker strong', this.dlg).textContent = npc.name;
      $('.pf-speaker span', this.dlg).textContent = npc.role || '';
      this.dlg.classList.remove('hidden');
      this.promptBtn.classList.add('hidden');
      this.notify();
      const line = $('.pf-line', this.dlg), choices = $('.pf-choices', this.dlg);
      const finish = () => {
        this.dlg.classList.add('hidden');
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

  closePanel() {
    this.backdrop.classList.add('hidden');
    this.panelRender = null;
    this.onPanelClose?.();
    this.onPanelClose = null;
    this.notify();
    this.setPrompt(this.promptText);
  }
}
