// Life Science Lab simulations, ported from ScienceLab 3D (MIT, Rudra Sarker) and fixed:
// - Food web: ScienceLab's random agents gained 50 energy per kill (no real 10% rule) and moved
//   per frame (faster on fast computers). Here a population model with 10% energy transfer drives
//   the numbers; the animals on screen just show those numbers.
// - Natural selection: same camouflage idea, but deterministic per student (seeded) and run by generation.
// - Photosynthesis: rebuilt as the classic Elodea bubble-count experiment (light, CO2, temperature).

import { makeRng } from '../../../js/rng.js';

// ---------------- Food web ----------------
// Four-level food chain: logistic producers; consumers feed with Beddington–DeAngelis
// functional responses (predators interfere with each other, which keeps real food webs
// steady); each level converts 10% of what it eats into new biomass.
// Parameters were fitted so the default habitat sits at a stable balance and removing
// a level produces the textbook result (trophic cascade, overgrazing).
const FW = { r: 1.0855, K: 216.46, aH: 0.1509, hH: 0.0048, iH: 0.0865, mH: 0.0299, aC: 0.2968, hC: 0.0425, iC: 0.0775, mC: 0.0059, aA: 0.5937, hA: 0.1915, iA: 2.7377, mA: 0.0235, e: 0.1 };
export const FOODWEB_BALANCE = { plants: 77.4, herbivores: 8.13, carnivores: 2.82, apex: 2.12 };

export function foodWebRun({ plants = FOODWEB_BALANCE.plants, herbivores = FOODWEB_BALANCE.herbivores, carnivores = FOODWEB_BALANCE.carnivores, apex = FOODWEB_BALANCE.apex, days = 120 }) {
  let P = plants, H = herbivores, C = carnivores, A = apex;
  const dt = 0.05, series = [{ t: 0, P, H, C, A }];
  for (let i = 1; i <= days / dt; i++) {
    const fH = FW.aH * P / (1 + FW.aH * FW.hH * P + FW.iH * H);
    const fC = FW.aC * H / (1 + FW.aC * FW.hC * H + FW.iC * C);
    const fA = FW.aA * C / (1 + FW.aA * FW.hA * C + FW.iA * A);
    const nP = P + (FW.r * P * (1 - P / FW.K) - fH * H) * dt;
    const nH = H + (FW.e * fH * H - FW.mH * H - fC * C) * dt;
    const nC = C + (FW.e * fC * C - FW.mC * C - fA * A) * dt;
    const nA = A + (FW.e * fA * A - FW.mA * A) * dt;
    P = Math.max(0, nP); H = Math.max(0, nH); C = Math.max(0, nC); A = Math.max(0, nA);
    if (i % Math.round(1 / dt) === 0) series.push({ t: Math.round(i * dt), P, H, C, A });
  }
  return series;
}

// ---------------- Natural selection ----------------
// Beetles come in two color morphs. Birds spot beetles that contrast with the ground,
// survivors reproduce, and rare mutations flip color.
export const BACKGROUNDS = {
  grass: { label: 'Grassland', color: '#4f8a3a', see: { green: 0.18, brown: 0.62 } },
  dirt: { label: 'Bare soil', color: '#8a6238', see: { green: 0.62, brown: 0.18 } },
  snow: { label: 'Snow', color: '#e9eef2', see: { green: 0.55, brown: 0.55 } },
};

export function selectionRun({ background = 'dirt', startGreen = 50, generations = 10, mutation = 2, seed = 'x', run = 0 }) {
  const N = 60;
  const rng = makeRng(`${seed}|sel|${background}|${startGreen}|${generations}|${mutation}|${run}`);
  let green = Math.round((N * startGreen) / 100);
  const series = [{ gen: 0, green, brown: N - green, pctGreen: (100 * green) / N, eaten: 0 }];
  const see = BACKGROUNDS[background].see;
  for (let g = 1; g <= generations; g++) {
    let sg = 0, sb = 0;
    for (let i = 0; i < green; i++) if (rng.next() > see.green) sg++;
    for (let i = 0; i < N - green; i++) if (rng.next() > see.brown) sb++;
    const survivors = sg + sb, eaten = N - survivors;
    // Survivors reproduce back to N; offspring inherit color, with a small chance of mutation.
    let ng = 0;
    for (let i = 0; i < N; i++) {
      let isGreen = survivors === 0 ? rng.next() < 0.5 : rng.next() < sg / survivors;
      if (rng.next() < mutation / 100) isGreen = !isGreen;
      if (isGreen) ng++;
    }
    green = ng;
    series.push({ gen: g, green, brown: N - green, pctGreen: (100 * green) / N, eaten });
  }
  return series;
}

// ---------------- Photosynthesis (Elodea) ----------------
// Oxygen bubbles per minute from a water plant under a lamp.
// Light falls off with the square of distance; sodium bicarbonate supplies CO2; enzymes work best near 25 °C.
export function lightIntensity(distanceCm) { return (10 / distanceCm) ** 2; } // relative to 10 cm

export function bubbleRate({ distance = 10, co2 = 1, temp = 25 }) {
  const I = lightIntensity(distance);
  const light = I / (I + 0.35);
  const carbon = (co2 + 0.05) / (co2 + 0.3);
  const enzymes = Math.exp(-(((temp - 25) / 9) ** 2));
  return 62 * light * carbon * enzymes;
}

export function bubbleTrial(params, seed, trial) {
  const rng = makeRng(`${seed}|bubbles|${params.distance}|${params.co2}|${params.temp}|${trial}`);
  const mean = bubbleRate(params);
  return Math.max(0, Math.round(mean * (1 + (rng.next() - 0.5) * 0.12)));
}
