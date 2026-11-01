// Ideas from HandsOn (MIT, VietTung0801), rebuilt for the browser:
// - Carrier: pick up a piece of equipment and carry it in front of you (HandsOn's GrabObject);
//   dropped objects fall under gravity and settle on the ground (its Rigidbody physics).
// - FieldNotes: leave a note anywhere in the world (HandsOn's "take notes anywhere in the
//   environment"); notes are saved with the student's progress and listed in their data.

import * as THREE from 'three';
import { makeLabel } from './stage.js';
import { saveProfile } from './progress.js';
import { esc } from './hud.js';

export class Carrier {
  constructor(stage, player, ground) {
    this.stage = stage; this.player = player; this.ground = ground;
    this.falling = [];
  }

  // Take an object into the student's hands (it is moved into the scene root).
  pickUp(obj) {
    obj.updateMatrixWorld(true);
    this.stage.scene.attach(obj);
    this.held = obj;
    this.player.carrying = obj;
  }

  // Drop in front of the student; it falls and settles on the ground.
  drop() {
    const o = this.held;
    if (!o) return null;
    this.held = null; this.player.carrying = null;
    this.falling.push({ o, vy: 0 });
    return o;
  }

  update(dt) {
    const o = this.held, p = this.player;
    if (o) {
      const f = p.facing, y = (p.character?.position.y ?? p.y) + 1.0;
      o.position.set(p.pos.x + Math.sin(f) * 0.42, y, p.pos.z + Math.cos(f) * 0.42);
      o.rotation.set(0, f, 0);
    }
    for (const fall of this.falling) {
      const g = this.ground(fall.o.position.x, fall.o.position.z);
      fall.vy -= 9.8 * dt;
      fall.o.position.y += fall.vy * dt;
      if (fall.o.position.y <= g) { fall.o.position.y = g; fall.vy = -fall.vy * 0.25; if (Math.abs(fall.vy) < 0.4) fall.done = true; }
    }
    this.falling = this.falling.filter((f) => !f.done);
  }
}

export class FieldNotes {
  constructor(stage, player, hud, profile, worldId, interactions) {
    Object.assign(this, { stage, player, hud, profile, worldId, interactions });
    this.markers = [];
    for (const n of this.list()) this.addMarker(n);
  }

  list() {
    this.profile.notes ||= {};
    return (this.profile.notes[this.worldId] ||= []);
  }

  addMarker(n) {
    const sprite = makeLabel(['📝 Note', n.text.length > 26 ? n.text.slice(0, 25) + '…' : n.text], { accent: '#e0a800', bg: 'rgba(255,248,214,0.95)', scale: 0.45 });
    sprite.position.set(n.x, n.y + 1.9, n.z);
    this.stage.scene.add(sprite);
    const id = `note:${n.t}`;
    this.interactions.add({ id, label: 'field note', action: 'Read', position: { x: n.x, y: n.y, z: n.z }, radius: 1.6, height: 1.9,
      onUse: () => this.hud.openPanel('Field note', (body) => {
        body.innerHTML = `<p class="lead">${esc(n.text)}</p><p class="hint">Written ${new Date(n.t).toLocaleString()}</p><div class="row"><button class="secondary" id="fn-del">Delete note</button></div>`;
        body.querySelector('#fn-del').onclick = () => { this.remove(n, sprite, id); this.hud.closePanel(); };
      }) });
    this.markers.push({ n, sprite, id });
  }

  remove(n, sprite, id) {
    const list = this.list();
    list.splice(list.indexOf(n), 1);
    saveProfile(this.profile);
    this.stage.scene.remove(sprite);
    this.interactions.items.delete(id);
    this.interactions.near = undefined;
  }

  write() {
    this.hud.openPanel('Leave a field note', (body) => {
      body.innerHTML = `
        <p class="hint">Your note appears here in the world and in your data. Use it for observations, questions or reminders.</p>
        <textarea id="fn-text" rows="4" maxlength="280" placeholder="e.g. Water looks cloudy below the pipe. Check turbidity!"></textarea>
        <div class="row"><button class="primary" id="fn-save">Place note here</button></div>`;
      setTimeout(() => body.querySelector('#fn-text')?.focus(), 50);
      body.querySelector('#fn-save').onclick = () => {
        const text = body.querySelector('#fn-text').value.trim();
        if (!text) return;
        const p = this.player;
        const n = { x: p.pos.x + Math.sin(p.facing) * 1.2, y: p.y ?? 0, z: p.pos.z + Math.cos(p.facing) * 1.2, text, t: Date.now() };
        this.list().push(n);
        saveProfile(this.profile);
        this.addMarker(n);
        this.hud.closePanel();
        this.hud.toast('Note placed.');
      };
    });
  }

  html() {
    const list = this.list();
    return list.length ? `<h3>Field notes</h3><ul>${list.map((n) => `<li>${esc(n.text)} <span class="hint">(${new Date(n.t).toLocaleDateString()})</span></li>`).join('')}</ul>` : '';
  }
}
