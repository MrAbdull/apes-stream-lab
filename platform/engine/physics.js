// Solid-world physics for walking characters: circle colliders (tree trunks, rocks,
// people, posts) and rotated box colliders (buildings, tables, cars), stored in a
// spatial grid so thousands of obstacles stay cheap. Characters slide along obstacles
// instead of passing through them.

export class Colliders {
  constructor(cell = 8) {
    this.cell = cell;
    this.grid = new Map();
  }

  key(i, j) { return i * 73856093 ^ j * 19349663; }

  insert(shape, minX, maxX, minZ, maxZ) {
    const c = this.cell;
    for (let i = Math.floor(minX / c); i <= Math.floor(maxX / c); i++) {
      for (let j = Math.floor(minZ / c); j <= Math.floor(maxZ / c); j++) {
        const k = this.key(i, j);
        if (!this.grid.has(k)) this.grid.set(k, []);
        this.grid.get(k).push(shape);
      }
    }
  }

  addCircle(x, z, r) {
    const s = { type: 'c', x, z, r };
    this.insert(s, x - r, x + r, z - r, z + r);
    return s;
  }

  // Box centered at (x, z) with half-sizes (hw, hd), rotated by rot around the vertical axis.
  addBox(x, z, hw, hd, rot = 0) {
    const s = { type: 'b', x, z, hw, hd, cos: Math.cos(rot), sin: Math.sin(rot) };
    const R = Math.hypot(hw, hd);
    this.insert(s, x - R, x + R, z - R, z + R);
    return s;
  }

  // Push a character of radius r out of every obstacle it overlaps. Returns true if it hit something.
  resolve(pos, r) {
    let hit = false;
    for (let iter = 0; iter < 3; iter++) {
      const list = this.grid.get(this.key(Math.floor(pos.x / this.cell), Math.floor(pos.z / this.cell)));
      if (!list) return hit;
      let moved = false;
      for (const s of list) {
        if (s.disabled) continue;
        if (s.type === 'c') {
          const dx = pos.x - s.x, dz = pos.z - s.z, d = Math.hypot(dx, dz), min = s.r + r;
          if (d < min) {
            const n = d > 1e-6 ? 1 / d : 0;
            pos.x = s.x + (n ? dx * n : 1) * min;
            pos.z = s.z + (n ? dz * n : 0) * min;
            moved = hit = true;
          }
        } else {
          // into box space
          const dx = pos.x - s.x, dz = pos.z - s.z;
          const lx = dx * s.cos - dz * s.sin, lz = dx * s.sin + dz * s.cos;
          const cx = Math.max(-s.hw, Math.min(s.hw, lx)), cz = Math.max(-s.hd, Math.min(s.hd, lz));
          let ox = lx - cx, oz = lz - cz, d = Math.hypot(ox, oz);
          if (d < r) {
            let nx, nz, push;
            if (d > 1e-6) { nx = ox / d; nz = oz / d; push = r - d; }
            else { // center inside the box: leave by the nearest face
              const px = s.hw - Math.abs(lx), pz = s.hd - Math.abs(lz);
              if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + r; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + r; }
            }
            const nlx = lx + nx * push, nlz = lz + nz * push;
            pos.x = s.x + nlx * s.cos + nlz * s.sin;
            pos.z = s.z - nlx * s.sin + nlz * s.cos;
            moved = hit = true;
          }
        }
      }
      if (!moved) break;
    }
    return hit;
  }
}
