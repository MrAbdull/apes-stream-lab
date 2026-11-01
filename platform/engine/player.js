// The student's character: procedural walk animation, keyboard/joystick/drag controls
// and a third-person camera that moves in when something blocks the view.

import * as THREE from 'three';
import { loadCharacter } from './assets.js';

export const WALK = 5, RUN = 10;

// Animates the Quaternius modular rig in code: bones are turned about WORLD axes
// (x = swing forward/back, z = raise/lower sideways), so one walk cycle fits every outfit.
export class Walker {
  constructor(root) {
    this.bones = {};
    root.traverse((o) => { if (o.isBone) this.bones[o.name] = o; });
    root.updateMatrixWorld(true);
    this.rest = {};
    this.axes = {};
    for (const [n, b] of Object.entries(this.bones)) {
      this.rest[n] = b.quaternion.clone();
      const inv = b.parent.getWorldQuaternion(new THREE.Quaternion()).invert();
      this.axes[n] = {
        x: new THREE.Vector3(1, 0, 0).applyQuaternion(inv),
        y: new THREE.Vector3(0, 1, 0).applyQuaternion(inv),
        z: new THREE.Vector3(0, 0, 1).applyQuaternion(inv),
      };
    }
    this.q = new THREE.Quaternion();
    this.phase = 0;
    this.blend = 0;
    this.gesture = 0; // 0..1 arm raised (talking / pointing)
  }

  turn(name, axis, angle) {
    const b = this.bones[name];
    if (!b || !angle) return;
    this.q.setFromAxisAngle(this.axes[name][axis], angle);
    b.quaternion.premultiply(this.q);
  }

  update(dt, speed, t, { talking = false } = {}) {
    const moving = speed > 0.2;
    this.blend += ((moving ? 1 : 0) - this.blend) * Math.min(1, dt * 8);
    this.gesture += ((talking ? 1 : 0) - this.gesture) * Math.min(1, dt * 5);
    this.phase += dt * speed * 2.1;
    const p = this.phase, k = this.blend, run = Math.min(1, Math.max(0, (speed - WALK) / (RUN - WALK)));
    const A = (0.45 + 0.25 * run) * k;
    for (const [n, b] of Object.entries(this.bones)) b.quaternion.copy(this.rest[n]);

    const g = this.gesture * (0.6 + 0.25 * Math.sin(t * 3));
    this.turn('UpperArmL', 'z', -1.3);
    this.turn('UpperArmR', 'z', 1.3 - g * 0.5);
    this.turn('UpperArmR', 'x', g * 0.9);
    this.turn('LowerArmL', 'x', -(0.15 + 0.6 * run * k));
    this.turn('LowerArmR', 'x', -(0.15 + 0.6 * run * k) - g * 0.8);
    this.turn('UpperLegL', 'x', -A * Math.sin(p));
    this.turn('UpperLegR', 'x', A * Math.sin(p));
    this.turn('LowerLegL', 'x', (0.9 + 0.5 * run) * k * Math.max(0, -Math.cos(p)));
    this.turn('LowerLegR', 'x', (0.9 + 0.5 * run) * k * Math.max(0, Math.cos(p)));
    this.turn('UpperArmL', 'x', A * 0.8 * Math.sin(p));
    this.turn('UpperArmR', 'x', -A * 0.8 * Math.sin(p));
    this.turn('Abdomen', 'x', 0.12 * run * k);
    this.turn('Chest', 'x', (1 - k) * 0.025 * Math.sin(t * 1.6));
    this.turn('Head', 'y', (1 - k) * (talking ? 0.12 : 0.25) * Math.sin(t * (talking ? 1.3 : 0.35)));
    this.turn('Head', 'x', talking ? 0.05 * Math.sin(t * 5) : 0);
    return Math.abs(Math.sin(p)) * 0.05 * k;
  }
}

// Load a character model, apply a skin tone, and size it to about 1.7 m.
export async function makeCharacter({ id, skin }) {
  const g = await loadCharacter(id);
  const root = g.scene;
  root.scale.setScalar(0.9);
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.frustumCulled = false;
    (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => {
      if (skin && m.name === 'Skin') m.color.set(skin);
      if (skin && m.name === 'Skin_Darker') m.color.set(skin).multiplyScalar(0.88);
    });
  });
  return root;
}

export class Player {
  // ground(x, z) -> height; clamp(pos) keeps the student inside the world;
  // occluders() -> meshes that may block the camera.
  constructor(stage, { ground, clamp, occluders, joystick, start = { x: 0, z: 0, facing: 0 } }) {
    this.stage = stage;
    this.ground = ground;
    this.clamp = clamp || (() => {});
    this.occluders = occluders || (() => []);
    this.pos = { x: start.x, z: start.z };
    this.facing = start.facing ?? 0;
    this.speed = 0;
    this.camYaw = this.facing + Math.PI;
    this.camPitch = 0.32;
    this.camDist = 5.2;
    this.camPos = new THREE.Vector3();
    this.snap = true;
    this.inputEnabled = true;
    this.keys = new Set();
    this.joy = { x: 0, y: 0 };
    this.raycaster = new THREE.Raycaster();
    this.setupInput(joystick);
  }

  async setAvatar(avatar) {
    const root = await makeCharacter(avatar);
    if (this.character) this.stage.scene.remove(this.character);
    this.character = root;
    this.walker = new Walker(root);
    this.stage.scene.add(root);
  }

  setupInput(joystick) {
    const isTyping = (e) => /^(INPUT|TEXTAREA|SELECT)$/.test(e.target?.tagName || '');
    const capture = (el, id) => { try { el.setPointerCapture(id); } catch { /* pointer already gone */ } };
    window.addEventListener('keydown', (e) => { if (!isTyping(e)) this.keys.add(e.code); });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    const el = this.stage.renderer.domElement;
    el.style.touchAction = 'none';
    el.addEventListener('pointerdown', (e) => {
      if (!this.inputEnabled) return;
      this.look = { id: e.pointerId, x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY, touch: e.pointerType === 'touch' };
      capture(el, e.pointerId);
    });
    el.addEventListener('pointermove', (e) => {
      if (!this.look || this.look.id !== e.pointerId || !this.inputEnabled) return;
      const k = this.look.touch ? 0.0065 : 0.0045;
      this.camYaw -= (e.clientX - this.look.x) * k;
      this.camPitch = Math.max(-0.15, Math.min(1.1, this.camPitch + (e.clientY - this.look.y) * k));
      this.look.x = e.clientX; this.look.y = e.clientY;
    });
    const endLook = (e) => {
      if (!this.look || this.look.id !== e.pointerId) return;
      const moved = Math.hypot(e.clientX - this.look.sx, e.clientY - this.look.sy);
      this.look = null;
      if (moved < 6 && this.inputEnabled) this.onTap?.(e); // a tap, not a drag
    };
    el.addEventListener('pointerup', endLook);
    el.addEventListener('pointercancel', (e) => { if (this.look?.id === e.pointerId) this.look = null; });
    el.addEventListener('wheel', (e) => { this.camDist = Math.max(2.5, Math.min(12, this.camDist + e.deltaY * 0.005)); }, { passive: true });

    if (joystick) {
      const knob = joystick.querySelector('.knob');
      let id = null;
      const set = (e) => {
        const r = joystick.getBoundingClientRect();
        let dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        const max = r.width / 2 - 10, len = Math.hypot(dx, dy);
        if (len > max) { dx *= max / len; dy *= max / len; }
        knob.style.transform = `translate(${dx}px, ${dy}px)`;
        this.joy = { x: dx / max, y: dy / max };
      };
      joystick.addEventListener('pointerdown', (e) => { id = e.pointerId; capture(joystick, id); set(e); e.preventDefault(); });
      joystick.addEventListener('pointermove', (e) => { if (e.pointerId === id) set(e); });
      const end = (e) => { if (e.pointerId !== id) return; id = null; this.joy = { x: 0, y: 0 }; knob.style.transform = ''; };
      joystick.addEventListener('pointerup', end);
      joystick.addEventListener('pointercancel', end);
    }
  }

  setInputEnabled(on) {
    this.inputEnabled = on;
    if (!on) { this.keys.clear(); this.look = null; }
  }

  // Ray from the screen point into the scene (for tapping objects).
  rayFromEvent(e) {
    const r = this.stage.renderer.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.stage.camera);
    this.raycaster.far = 60;
    return this.raycaster;
  }

  update(dt, t) {
    let f = 0, s = 0, turn = 0;
    if (this.inputEnabled) {
      const k = this.keys;
      if (k.has('KeyW') || k.has('ArrowUp')) f += 1;
      if (k.has('KeyS') || k.has('ArrowDown')) f -= 1;
      if (k.has('KeyD')) s += 1;
      if (k.has('KeyA')) s -= 1;
      if (k.has('ArrowLeft')) turn += 1;
      if (k.has('ArrowRight')) turn -= 1;
      f -= this.joy.y; s += this.joy.x;
    }
    this.camYaw += turn * 1.8 * dt;
    let len = Math.hypot(f, s);
    if (len > 1) { f /= len; s /= len; len = 1; }
    const running = this.keys.has('ShiftLeft') || this.keys.has('ShiftRight') || Math.hypot(this.joy.x, this.joy.y) > 0.95;
    this.speed += (len * (running ? RUN : WALK) - this.speed) * Math.min(1, dt * 10);

    const sin = Math.sin(this.camYaw), cos = Math.cos(this.camYaw);
    const mx = -sin * f + cos * s, mz = -cos * f - sin * s;
    if (len > 0.05) {
      let diff = Math.atan2(mx, mz) - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.facing += diff * Math.min(1, dt * 10);
      const ml = Math.hypot(mx, mz);
      this.pos.x += (mx / ml) * this.speed * dt;
      this.pos.z += (mz / ml) * this.speed * dt;
    }
    this.clamp(this.pos);

    const footY = this.ground(this.pos.x, this.pos.z);
    const bob = this.walker ? this.walker.update(dt, this.speed, t) : 0;
    if (this.character) {
      this.character.position.set(this.pos.x, footY + bob, this.pos.z);
      this.character.rotation.y = this.facing;
    }

    // Camera behind and above; moves in when an occluder is in the way.
    const target = new THREE.Vector3(this.pos.x, footY + 1.45, this.pos.z);
    const cp = Math.cos(this.camPitch), sp = Math.sin(this.camPitch);
    const dir = new THREE.Vector3(sin * cp, sp, cos * cp);
    if (this.stage.frame % 3 === 0 || this.snap) {
      this.raycaster.set(target, dir);
      this.raycaster.far = this.camDist + 0.5;
      const hit = this.raycaster.intersectObjects(this.occluders(), false)[0];
      this.blocked = hit ? Math.max(1.6, hit.distance - 0.6) : null;
    }
    const want = target.clone().addScaledVector(dir, Math.min(this.camDist, this.blocked ?? Infinity));
    want.y = Math.max(want.y, this.ground(want.x, want.z) + 0.6);
    if (this.snap) { this.camPos.copy(want); this.snap = false; } else this.camPos.lerp(want, Math.min(1, dt * 8));
    this.stage.camera.position.copy(this.camPos);
    this.stage.camera.lookAt(target);
  }

  teleport(x, z, lookAt) {
    this.pos.x = x; this.pos.z = z;
    if (lookAt) {
      const dx = lookAt.x - x, dz = lookAt.z - z;
      this.facing = Math.atan2(dx, dz);
      this.camYaw = Math.atan2(-dx, -dz);
    }
    this.camPitch = 0.32;
    this.snap = true;
  }

  getPose() { return { x: this.pos.x, z: this.pos.z, facing: this.facing, yaw: this.camYaw }; }

  setPose(p) {
    if (!p) return;
    this.pos.x = p.x; this.pos.z = p.z; this.facing = p.facing ?? 0; this.camYaw = p.yaw ?? this.facing + Math.PI;
    this.snap = true;
  }
}
