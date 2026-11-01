// Instanced scenery (trees, plants, rocks) grouped into a grid of chunks.
// The GPU skips off-screen chunks; chunks far from the student are hidden (small
// plants) or swapped for simple stand-in shapes (trees) to stay fast on iPads.

import * as THREE from 'three';

const CHUNK = 60;

export class Scatter {
  constructor(scene, models, ground) {
    this.scene = scene;
    this.models = models;
    this.ground = ground;
    this.chunks = [];
    this.proxies = {};
  }

  add(key, placements, { near = 60, lod = null, occludes = false } = {}) {
    if (!placements.length) return;
    const root = this.models[key].scene;
    root.updateMatrixWorld(true);
    const parts = [];
    root.traverse((o) => { if (o.isMesh) parts.push({ geometry: o.geometry, material: o.material, matrix: o.matrixWorld.clone() }); });
    const groups = new Map();
    for (const p of placements) {
      const c = `${Math.floor(p.x / CHUNK)},${Math.floor(p.z / CHUNK)}`;
      if (!groups.has(c)) groups.set(c, []);
      groups.get(c).push(p);
    }
    const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    const fill = (im, list, extra) => {
      list.forEach((p, i) => {
        q.setFromAxisAngle(up, p.rot ?? 0);
        v.set(p.x, p.y ?? this.ground(p.x, p.z), p.z);
        s.setScalar(p.scale ?? 1);
        m.compose(v, q, s);
        if (extra) m.multiply(extra);
        im.setMatrixAt(i, m);
      });
      im.computeBoundingSphere();
    };
    for (const [c, list] of groups) {
      const [cx, cz] = c.split(',').map(Number);
      const detail = new THREE.Group();
      for (const part of parts) {
        const im = new THREE.InstancedMesh(part.geometry, part.material, list.length);
        fill(im, list, part.matrix);
        detail.add(im);
      }
      this.scene.add(detail);
      let proxy = null;
      if (lod) {
        proxy = new THREE.InstancedMesh(this.proxyGeometry(lod), this.proxyMaterial, list.length);
        fill(proxy, list);
        this.scene.add(proxy);
      }
      this.chunks.push({ x: (cx + 0.5) * CHUNK, z: (cz + 0.5) * CHUNK, near, detail, proxy, occludes });
    }
  }

  // Simple low-poly stand-ins for distant trees.
  proxyGeometry(kind) {
    if (this.proxies[kind]) return this.proxies[kind];
    const leaf = new THREE.Color(kind === 'pine' ? '#2f5b33' : '#3f6e33'), bark = new THREE.Color('#5b4330');
    const paint = (g, color) => {
      g = g.index ? g.toNonIndexed() : g;
      const n = g.attributes.position.count, cols = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { cols[i * 3] = color.r; cols[i * 3 + 1] = color.g; cols[i * 3 + 2] = color.b; }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      return g;
    };
    const trunk = paint(new THREE.CylinderGeometry(0.15, 0.22, kind === 'pine' ? 1.6 : 2.6, 5).translate(0, kind === 'pine' ? 0.8 : 1.3, 0), bark);
    const crown = kind === 'pine'
      ? paint(new THREE.ConeGeometry(1.15, 4.2, 6).translate(0, 3.4, 0), leaf)
      : paint(new THREE.IcosahedronGeometry(2.1, 0).scale(1, 0.85, 1).translate(0, 4.2, 0), leaf);
    const merged = new THREE.BufferGeometry();
    for (const name of ['position', 'normal', 'color']) {
      const a = trunk.attributes[name].array, b = crown.attributes[name].array;
      const arr = new Float32Array(a.length + b.length); arr.set(a); arr.set(b, a.length);
      merged.setAttribute(name, new THREE.BufferAttribute(arr, 3));
    }
    this.proxyMaterial ||= new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 });
    return (this.proxies[kind] = merged);
  }

  update(x, z) {
    for (const c of this.chunks) {
      const close = Math.hypot(c.x - x, c.z - z) - CHUNK * 0.7 < c.near;
      c.detail.visible = close;
      if (c.proxy) c.proxy.visible = !close;
    }
  }

  // Nearby meshes that should push the camera in (tree trunks and crowns).
  occluders() {
    const out = [];
    for (const c of this.chunks) if (c.occludes && c.detail.visible) out.push(...c.detail.children);
    return out;
  }
}
