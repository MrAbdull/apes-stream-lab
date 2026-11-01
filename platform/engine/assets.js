// Cached glTF loading. Paths are relative to the site's assets/ folder.

import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

const loader = new GLTFLoader();
const cache = new Map();

export const assetUrl = (p) => new URL(`../../assets/${p}`, import.meta.url).href;

export function loadModel(path) {
  if (!cache.has(path)) cache.set(path, loader.loadAsync(assetUrl(path)));
  return cache.get(path);
}

// Load a { key: path } map; reports progress from 0 to 1.
export async function loadModels(map, onProgress) {
  const entries = Object.entries(map);
  const out = {};
  let done = 0;
  await Promise.all(entries.map(([k, p]) => loadModel(p).then((g) => { out[k] = g; onProgress?.(++done / entries.length); })));
  return out;
}

// Characters are loaded fresh (not cached) because each needs its own skeleton.
export function loadCharacter(id) {
  return loader.loadAsync(assetUrl(`characters/${id}.glb`));
}
