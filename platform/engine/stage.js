// Stage: renderer, sky, lighting, fog, resizing and the frame loop shared by every world.

import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

export class Stage {
  constructor(container, { fogNear = 70, fogFar = 270, fogColor = '#c9dde9', sunElevation = 35, sunAzimuth = 150, exposure = 1.0 } = {}) {
    this.container = container;
    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.75);
    renderer.setPixelRatio(this.pixelRatio);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = exposure;
    container.appendChild(renderer.domElement);
    this.renderer = renderer;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(62, 1, 0.1, 1500);
    this.frameFns = [];
    this.frame = 0;

    // Sky dome
    const sky = new Sky();
    sky.scale.setScalar(1200);
    const u = sky.material.uniforms;
    u.turbidity.value = 5; u.rayleigh.value = 1.2; u.mieCoefficient.value = 0.004; u.mieDirectionalG.value = 0.8;
    this.sunDir = new THREE.Vector3().setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - sunElevation + 0.0001), THREE.MathUtils.degToRad(sunAzimuth));
    u.sunPosition.value.copy(this.sunDir);
    this.scene.add(sky);

    // Soft reflections and fill light from a plain gradient (the Sky shader's sun is too bright for this).
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    const dome = new THREE.SphereGeometry(10, 32, 16);
    const top = new THREE.Color('#8fbde0'), horizon = new THREE.Color('#dfeaf0'), ground = new THREE.Color('#5d6b48');
    const cols = [], pos = dome.attributes.position, c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const y = pos.getY(i) / 10;
      if (y > 0) c.copy(horizon).lerp(top, Math.pow(y, 0.6)); else c.copy(horizon).lerp(ground, Math.min(1, -y * 3));
      cols.push(c.r, c.g, c.b);
    }
    dome.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
    envScene.add(new THREE.Mesh(dome, new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.BackSide })));
    this.scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    this.scene.environmentIntensity = 0.6;

    this.scene.fog = new THREE.Fog(fogColor, fogNear, fogFar);
    this.scene.add(new THREE.HemisphereLight('#e8f4ff', '#56653f', 0.75));
    const sun = new THREE.DirectionalLight('#fff1dc', 1.7);
    sun.position.copy(this.sunDir).multiplyScalar(100);
    this.scene.add(sun);

    this.resize();
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.clock = new THREE.Clock();
    this.perf = { t: 0, frames: 0 };
  }

  onFrame(fn) { this.frameFns.push(fn); }

  start() {
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      const dt = Math.min(this.clock.getDelta(), 0.1); // cap avoids big jumps after a pause
      this.frame++;
      for (const fn of this.frameFns) fn(dt, this.frame);
      this.renderer.render(this.scene, this.camera);
      this.watchPerformance(dt);
    };
    loop();
  }

  // Drop the resolution once if the device is struggling (older iPads).
  watchPerformance(dt) {
    if (this.perf.done) return;
    this.perf.t += dt; this.perf.frames++;
    if (this.perf.t > 3) {
      if (this.perf.frames / this.perf.t < 28 && this.pixelRatio > 1) { this.pixelRatio = 1; this.renderer.setPixelRatio(1); this.resize(); }
      this.perf.done = true;
    }
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }
}

// A floating text sign that always faces the camera.
export function makeLabel(lines, { bg = 'rgba(255,255,255,0.92)', fg = '#1d2b22', accent = '#2e7d32', scale = 1 } = {}) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = 22;
  const fontFor = (i) => `${i ? '500 32px' : 'bold 44px'} system-ui, sans-serif`;
  const w = Math.max(...lines.map((l, i) => { ctx.font = fontFor(i); return ctx.measureText(l).width; })) + pad * 2;
  canvas.width = Math.ceil(w);
  canvas.height = Math.ceil(44 + (lines.length - 1) * 40 + pad * 2);
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.roundRect(0, 0, canvas.width, canvas.height, 18); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(0, 0, 10, canvas.height);
  lines.forEach((l, i) => { ctx.font = fontFor(i); ctx.fillStyle = fg; ctx.fillText(l, pad, pad + 40 + i * 40 - (i ? 4 : 0)); });
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthWrite: false }));
  const s = 0.012 * scale;
  sprite.scale.set(canvas.width * s, canvas.height * s, 1);
  return sprite;
}

// A height-mapped, vertex-colored ground plane.
export function makeTerrain(size, segments, heightAt, colorAt) {
  const g = new THREE.PlaneGeometry(size, size, segments, segments);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  const colors = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, heightAt(x, z));
    colorAt(x, z, c);
    colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return new THREE.Mesh(g, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, metalness: 0 }));
}
