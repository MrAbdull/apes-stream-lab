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

  // Returns the vertical hip offset for this frame.
  // speed in m/s; turnRate in rad/s (for leaning into turns); air = true while jumping/falling.
  update(dt, speed, t, { talking = false, turnRate = 0, air = false, carrying = false } = {}) {
    const moving = speed > 0.15;
    this.blend += ((moving ? 1 : 0) - this.blend) * Math.min(1, dt * 7);
    this.gesture += ((talking ? 1 : 0) - this.gesture) * Math.min(1, dt * 5);
    this.airK = (this.airK || 0) + ((air ? 1 : 0) - (this.airK || 0)) * Math.min(1, dt * 10);
    this.carryK = (this.carryK || 0) + ((carrying ? 1 : 0) - (this.carryK || 0)) * Math.min(1, dt * 6);
    this.lean = (this.lean || 0) + (Math.max(-0.25, Math.min(0.25, turnRate * speed * 0.03)) - (this.lean || 0)) * Math.min(1, dt * 6);
    const run = Math.min(1, Math.max(0, (speed - WALK) / (RUN - WALK)));
    // One full cycle = two steps. Matching phase to distance keeps the feet from sliding.
    const cycle = 1.5 + 1.1 * run;
    if (!air) this.phase += (dt * speed / cycle) * Math.PI * 2;
    const p = this.phase, k = this.blend * (1 - this.airK), s = Math.sin(p), c = Math.cos(p);
    const A = (0.42 + 0.3 * run) * k; // thigh swing
    for (const [n, b] of Object.entries(this.bones)) b.quaternion.copy(this.rest[n]);

    // Hips sway and twist with each step; the chest twists the other way.
    this.turn('Hips', 'y', 0.12 * s * k);
    this.turn('Hips', 'z', -0.04 * s * k + this.lean);
    this.turn('Chest', 'y', -0.1 * s * k);
    this.turn('Abdomen', 'x', (0.06 + 0.16 * run) * k);

    // Legs: thigh swings; the knee bends while the leg swings forward (cos > 0 for the left leg)
    // and stays nearly straight while the foot is planted; the foot stays roughly level.
    const knee = (0.95 + 0.6 * run) * k;
    const thighL = -A * s, thighR = A * s;
    const kneeL = 0.08 * k + knee * Math.max(0, c) ** 1.4, kneeR = 0.08 * k + knee * Math.max(0, -c) ** 1.4;
    this.turn('UpperLegL', 'x', thighL - this.airK * 0.9);
    this.turn('UpperLegR', 'x', thighR - this.airK * 0.5);
    this.turn('LowerLegL', 'x', kneeL + this.airK * 1.3);
    this.turn('LowerLegR', 'x', kneeR + this.airK * 0.8);
    this.turn('FootL', 'x', -(thighL + kneeL) * 0.75 + this.airK * 0.3);
    this.turn('FootR', 'x', -(thighR + kneeR) * 0.75 + this.airK * 0.3);

    // Arms hang at the sides and swing opposite the legs; elbows bend more when running.
    const g = this.gesture * (0.6 + 0.25 * Math.sin(t * 3));
    const carry = this.carryK;
    this.turn('UpperArmL', 'z', -1.25 + this.airK * 0.5);
    this.turn('UpperArmR', 'z', 1.25 - g * 0.5 - this.airK * 0.5);
    this.turn('UpperArmL', 'x', A * 0.75 * s * (1 - carry) - carry * 0.7);
    this.turn('UpperArmR', 'x', -A * 0.75 * s * (1 - carry) + g * 0.9 - carry * 0.7);
    this.turn('LowerArmL', 'x', -(0.2 + 1.1 * run * k) - carry * 0.9);
    this.turn('LowerArmR', 'x', -(0.2 + 1.1 * run * k) - g * 0.8 - carry * 0.9);

    // Idle: breathing, a slow weight shift and glances around.
    const idle = 1 - this.blend;
    this.turn('Chest', 'x', idle * 0.025 * Math.sin(t * 1.6));
    this.turn('Hips', 'z', idle * 0.02 * Math.sin(t * 0.5));
    this.turn('Head', 'y', idle * (talking ? 0.12 : 0.3) * Math.sin(t * (talking ? 1.3 : 0.31)) - 0.1 * s * k);
    this.turn('Head', 'x', talking ? 0.05 * Math.sin(t * 5) : -0.04 * run * k);
    // Two bounces per cycle: hips are highest as the legs pass each other, lowest at full stride.
    return ((1 - Math.abs(s)) * (0.04 + 0.04 * run) - 0.035 - 0.02 * run) * k;
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
  constructor(stage, { ground, clamp, occluders, joystick, colliders, start = { x: 0, z: 0, facing: 0 } }) {
    this.stage = stage;
    this.ground = ground;
    this.clamp = clamp || (() => {});
    this.colliders = colliders;
    this.radius = 0.35;
    this.y = ground(start.x, start.z);
    this.vy = 0;
    this.air = false;
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
    let turnRate = 0;
    if (len > 0.05) {
      let diff = Math.atan2(mx, mz) - this.facing;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      const step = diff * Math.min(1, dt * 10);
      this.facing += step;
      turnRate = dt > 0 ? step / dt : 0;
      const ml = Math.hypot(mx, mz);
      const nx = this.pos.x + (mx / ml) * this.speed * dt, nz = this.pos.z + (mz / ml) * this.speed * dt;
      // Too steep to walk up? (about 40°) Then stay put on that axis.
      const rise = this.ground(nx, nz) - this.ground(this.pos.x, this.pos.z), run2d = Math.hypot(nx - this.pos.x, nz - this.pos.z);
      if (this.air || run2d < 1e-6 || rise / run2d < 0.85) { this.pos.x = nx; this.pos.z = nz; }
    }
    if (this.colliders?.resolve(this.pos, this.radius)) this.speed *= 0.92; // brush against obstacles
    this.clamp(this.pos);

    // Gravity and jumping (Space). Small ledges are stepped down smoothly.
    const groundY = this.ground(this.pos.x, this.pos.z);
    if (!this.air && this.inputEnabled && this.keys.has('Space')) { this.vy = 4.6; this.air = true; this.keys.delete('Space'); }
    if (this.air || this.y > groundY + 0.35) {
      this.air = true;
      this.vy -= 13 * dt;
      this.y += this.vy * dt;
      if (this.y <= groundY) { this.y = groundY; this.vy = 0; this.air = false; }
    } else {
      this.y += (groundY - this.y) * Math.min(1, dt * 18);
    }
    const footY = this.y;

    const bob = this.walker ? this.walker.update(dt, this.speed, t, { turnRate, air: this.air, carrying: !!this.carrying }) : 0;
    if (this.character) {
      this.character.position.set(this.pos.x, footY + bob, this.pos.z);
      this.character.rotation.y = this.facing;
    }
    this.onMoved?.(dt);

    // At an experiment station the camera glides to a fixed view of the bench.
    if (this.focus) {
      this.camPos.lerp(this.focus.pos, Math.min(1, dt * 4));
      this.lookAt ||= this.focus.target.clone();
      this.lookAt.lerp(this.focus.target, Math.min(1, dt * 4));
      this.stage.camera.position.copy(this.camPos);
      this.stage.camera.lookAt(this.lookAt);
      return;
    }
    // Camera behind and above; moves in when an occluder is in the way.
    const target = new THREE.Vector3(this.pos.x, footY + 1.45, this.pos.z);
    if (this.lookAt) { this.lookAt = null; this.snap = false; }
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
    this.y = this.ground(x, z); this.vy = 0; this.air = false;
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
    this.y = this.ground(p.x, p.z); this.vy = 0; this.air = false;
    this.snap = true;
  }
}
