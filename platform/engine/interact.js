// Interactable objects: walk up and press E / tap the prompt, or tap the object itself.
// A bobbing guide arrow marks the current mission target.

import * as THREE from 'three';

export class Interactions {
  constructor(stage, player, hud) {
    this.stage = stage;
    this.player = player;
    this.hud = hud;
    this.items = new Map();
    this.zones = new Map();
    this.near = null;
    this.listeners = [];

    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.35, 0.8, 4), new THREE.MeshBasicMaterial({ color: '#ffcc33' }));
    arrow.rotation.x = Math.PI;
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.9, 1.15, 32), new THREE.MeshBasicMaterial({ color: '#ffcc33', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2;
    this.guide = new THREE.Group();
    this.guide.add(arrow, ring);
    this.guide.visible = false;
    this.arrow = arrow; this.ring = ring;
    stage.scene.add(this.guide);

    player.onTap = (e) => this.tap(e);
    window.addEventListener('keydown', (e) => {
      if (e.code === 'KeyE' && this.near && this.player.inputEnabled && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) this.use(this.near);
    });
    hud.onPrompt = () => this.near && this.use(this.near);
  }

  // item: { id, label, position: {x,y,z}, radius, gesture, object (Object3D for tapping), height, enabled() }
  add(item) {
    this.items.set(item.id, { radius: 3, gesture: 'interact', height: 1.6, ...item });
    item.object?.traverse?.((o) => { o.userData.interactId = item.id; });
  }

  // zone: { id, x, z, radius } fires a 'go' event when the student walks in.
  addZone(zone) { this.zones.set(zone.id, { ...zone, inside: false }); }

  on(fn) { this.listeners.push(fn); }
  emit(gesture, id, value) { for (const fn of this.listeners) fn(gesture, id, value); }

  use(id) {
    const it = this.items.get(id);
    if (!it || (it.enabled && !it.enabled())) return;
    if (it.onUse) it.onUse(it);
    else this.emit(it.gesture, id);
  }

  tap(e) {
    const ray = this.player.rayFromEvent(e);
    const objs = [];
    for (const it of this.items.values()) if (it.object) objs.push(it.object);
    const hit = ray.intersectObjects(objs, true)[0];
    if (!hit) return;
    let o = hit.object;
    while (o && !o.userData.interactId) o = o.parent;
    const it = o && this.items.get(o.userData.interactId);
    if (!it) return;
    const d = Math.hypot(it.position.x - this.player.pos.x, it.position.z - this.player.pos.z);
    if (d <= Math.max(it.radius, 6)) this.use(it.id);
    else this.hud.toast(`Walk closer to the ${it.label.toLowerCase()} first.`);
  }

  setGuide(id) {
    const it = this.items.get(id) || this.zones.get(id);
    this.guideTarget = it || null;
    this.guide.visible = !!it;
    if (it) {
      const y = it.position ? it.position.y : this.player.ground(it.x, it.z);
      this.guide.position.set(it.position ? it.position.x : it.x, y, it.position ? it.position.z : it.z);
      this.ring.position.y = 0.05;
      this.arrowBase = (it.height ?? 1.6) + 1.2;
    }
  }

  guidePosition() {
    const g = this.guideTarget;
    if (!g) return null;
    return g.position ? { x: g.position.x, z: g.position.z } : { x: g.x, z: g.z };
  }

  update(t) {
    const { x, z } = this.player.pos;
    let best = null, bestD = Infinity;
    for (const it of this.items.values()) {
      if (it.enabled && !it.enabled()) continue;
      const d = Math.hypot(it.position.x - x, it.position.z - z);
      if (d < it.radius && d < bestD) { best = it.id; bestD = d; }
    }
    if (best !== this.near) {
      this.near = best;
      const it = best && this.items.get(best);
      this.hud.setPrompt(it ? `${it.action || 'Use'} ${it.label}` : null);
    }
    for (const zn of this.zones.values()) {
      const inside = Math.hypot(zn.x - x, zn.z - z) < zn.radius;
      if (inside && !zn.inside) this.emit('go', zn.id);
      zn.inside = inside;
    }
    if (this.guide.visible) {
      this.arrow.position.y = this.arrowBase + Math.sin(t * 3) * 0.25;
      this.arrow.rotation.y = t * 1.5;
      this.ring.material.opacity = 0.45 + 0.3 * Math.sin(t * 3);
    }
  }
}
