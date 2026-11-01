// NPC teachers and guides: an animated character with a name tag that turns to
// face the student and talks through the shared dialogue box.

import { makeCharacter, Walker } from './player.js';
import { makeLabel } from './stage.js';

export class NPC {
  // opts: { id, name, role, avatar: {id, skin}, x, z, facing, greeting, dialogue }
  constructor(stage, interactions, hud, ground, opts) {
    Object.assign(this, opts);
    this.stage = stage;
    this.hud = hud;
    this.ground = ground;
    this.interactions = interactions;
    this.talking = false;
    this.handlers = [];
  }

  async load() {
    this.root = await makeCharacter(this.avatar);
    this.walker = new Walker(this.root);
    this.root.position.set(this.x, this.ground(this.x, this.z), this.z);
    this.root.rotation.y = this.facing ?? 0;
    this.stage.scene.add(this.root);
    const tag = makeLabel([this.name, this.role], { accent: '#2b6cb0', scale: 0.55 });
    tag.position.set(0, 2.35 / 0.9, 0);
    tag.scale.multiplyScalar(1 / 0.9);
    this.root.add(tag);
    this.interactions.add({
      id: this.id, label: this.name, action: 'Talk to', position: { x: this.x, y: this.ground(this.x, this.z), z: this.z },
      radius: 3.5, height: 2.2, object: this.root, onUse: () => this.talk(),
    });
  }

  // Missions can replace what the NPC says at each step.
  setScript(fn) { this.script = fn; }

  async talk() {
    this.talking = true;
    const nodes = this.script ? this.script() : this.dialogue;
    await this.hud.dialogue(this, nodes);
    this.talking = false;
    this.interactions.emit('talk', this.id);
  }

  update(dt, t, player) {
    const dx = player.pos.x - this.x, dz = player.pos.z - this.z;
    const d = Math.hypot(dx, dz);
    if (d < 9) {
      let diff = Math.atan2(dx, dz) - this.root.rotation.y;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      this.root.rotation.y += diff * Math.min(1, dt * 4);
    }
    this.walker.update(dt, 0, t + this.x, { talking: this.talking });
  }
}
