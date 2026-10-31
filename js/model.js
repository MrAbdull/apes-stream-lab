// Stream Health Lab science model.
// Everything here is deterministic from the seed key: the same student/group
// always gets the same organisms, chemistry and questions.
// The water-quality index follows the Izaak Walton League "Save Our Streams"
// approach: count the TYPES of organisms in each tolerance group and weight them.

import { makeRng } from './rng.js';

export const GROUPS = {
  1: { name: 'Sensitive', short: 'Sensitive', weight: 3, color: '#2e7d32', desc: 'Need clean, cool, oxygen-rich water. Their presence means good water quality.' },
  2: { name: 'Somewhat sensitive', short: 'Somewhat sens.', weight: 2, color: '#b7791f', desc: 'Can tolerate some pollution.' },
  3: { name: 'Tolerant', short: 'Tolerant', weight: 1, color: '#c0392b', desc: 'Survive in polluted, low-oxygen water. Many tolerant and few sensitive organisms signals poor water quality.' },
};

export const TAXA = [
  { id: 'stonefly', name: 'Stonefly nymph', group: 1, ept: true, size: '10–30 mm',
    look: '6 legs, 2 long tails and 2 long antennae. No gills along the sides of the abdomen.',
    hint: 'Count the tails, and check whether there are gills along the sides of the abdomen.' },
  { id: 'mayfly', name: 'Mayfly nymph', group: 1, ept: true, size: '5–20 mm',
    look: '6 legs, usually 3 thin tails, and leaf-like gills along both sides of the abdomen.',
    hint: 'Count the tails and look for gills along the abdomen.' },
  { id: 'caddisfly', name: 'Caddisfly larva', group: 1, ept: true, size: '5–25 mm',
    look: 'Soft larva living inside a tube-shaped case built from tiny pebbles or sticks. 6 legs stick out near the head.',
    hint: 'What is it living inside?' },
  { id: 'waterpenny', name: 'Water penny', group: 1, size: '4–8 mm',
    look: 'Flat, round, copper-colored disc. Legs are hidden underneath.',
    hint: 'Look at the overall shape: is it flat and round?' },
  { id: 'riffle', name: 'Riffle beetle', group: 1, size: '1–3 mm',
    look: 'Tiny, dark, hard-shelled oval beetle with 6 long legs.',
    hint: 'Is it a tiny, hard-shelled adult beetle?' },
  { id: 'gilledsnail', name: 'Gilled snail (right-handed)', group: 1, size: '5–15 mm',
    look: 'Coiled shell. Tip up, opening facing you: the opening is on the RIGHT, with a hard lid (operculum).',
    hint: 'Which side is the shell opening on? Is there a lid?' },
  { id: 'dobsonfly', name: 'Dobsonfly larva (hellgrammite)', group: 1, size: '25–90 mm',
    look: 'Large, dark larva with strong pinching jaws, 6 legs and pointed filaments along each side.',
    hint: 'Look at the jaws and the filaments along the sides.' },
  { id: 'dragonfly', name: 'Dragonfly nymph', group: 2, size: '15–45 mm',
    look: 'Wide, chunky body with big eyes and 6 legs. No tails.',
    hint: 'Is the body wide or slender? Does it have tails?' },
  { id: 'damselfly', name: 'Damselfly nymph', group: 2, size: '10–30 mm',
    look: 'Slender body with big eyes and 6 legs, ending in 3 flat, paddle-shaped gills.',
    hint: 'Look at the shape of the 3 structures at the tail end.' },
  { id: 'cranefly', name: 'Crane fly larva', group: 2, size: '15–60 mm',
    look: 'Fat, pale, caterpillar-like larva with no legs. Finger-like lobes at one end.',
    hint: 'Does it have legs? Look closely at the ends.' },
  { id: 'crayfish', name: 'Crayfish', group: 2, size: '20–150 mm',
    look: 'Small lobster shape: 2 large claws, 8 walking legs and a fan-shaped tail.',
    hint: 'Look for claws.' },
  { id: 'scud', name: 'Scud (amphipod)', group: 2, size: '5–20 mm',
    look: 'Small, shrimp-like, flattened from side to side. Curls up and swims on its side.',
    hint: 'Which direction is the body flattened?' },
  { id: 'sowbug', name: 'Aquatic sowbug (isopod)', group: 2, size: '5–20 mm',
    look: 'Flattened from top to bottom like a pill bug, with 7 pairs of legs and 2 antennae.',
    hint: 'Which direction is the body flattened? Count the leg pairs.' },
  { id: 'clam', name: 'Clam or mussel', group: 2, size: '2–250 mm',
    look: 'Two hinged shell halves that close together.',
    hint: 'How many shell pieces are there?' },
  { id: 'worm', name: 'Aquatic worm', group: 3, size: '1–50 mm',
    look: 'Thin, segmented, legless worm like a tiny earthworm. No suckers.',
    hint: 'Check both ends: are there suckers?' },
  { id: 'leech', name: 'Leech', group: 3, size: '5–100 mm',
    look: 'Flattened, segmented, legless body with a sucker at each end.',
    hint: 'Check both ends for suckers.' },
  { id: 'midge', name: 'Midge larva', group: 3, size: '2–20 mm',
    look: 'Very small, thin, worm-like larva, often bright red ("bloodworm"), with tiny leg bumps.',
    hint: 'Check the size and the color.' },
  { id: 'blackfly', name: 'Black fly larva', group: 3, size: '3–15 mm',
    look: 'Bowling-pin shape: one end swollen and attached to rocks, fan-like brushes on the head.',
    hint: 'Look at the overall body shape.' },
  { id: 'pouchsnail', name: 'Lunged snail (left-handed)', group: 3, size: '5–20 mm',
    look: 'Coiled shell. Tip up, opening facing you: the opening is on the LEFT, with no lid.',
    hint: 'Which side is the shell opening on? Is there a lid?' },
];

export const TAXON = Object.fromEntries(TAXA.map((t) => [t.id, t]));

export const SITES = [
  { id: 1, name: 'Headwaters', z: -160, landUse: 'Forested headwaters', about: 'The stream begins in an old forest. Shade from the trees keeps the water cool.' },
  { id: 2, name: 'Farm Bend', z: -45, landUse: 'Farmland and cattle pasture', about: 'Crops are planted right up to one bank, and cattle can walk into the stream on the other side.' },
  { id: 3, name: 'Town Outfall', z: 45, landUse: 'Town with an outfall pipe', about: 'The stream flows through town. A large pipe discharges water into the stream just upstream.' },
  { id: 4, name: 'Recovery Reach', z: 160, landUse: 'Forested buffer downstream', about: 'Below town, a wide strip of trees (a riparian buffer) lines both banks.' },
];

export const SOURCES = {
  sewage: { label: 'Sewage / wastewater discharge', evidence: 'Very low DO, high nitrate and phosphate, algae, odor; mostly tolerant organisms.' },
  thermal: { label: 'Thermal pollution (heated cooling water)', evidence: 'Water temperature far above other sites, lower DO from warm water, nutrients and turbidity near normal.' },
  sediment: { label: 'Sediment from construction stormwater', evidence: 'Extremely high turbidity (muddy water), rock-clinging taxa such as water pennies and riffle beetles missing, nutrients only moderately raised.' },
  agdrain: { label: 'Agricultural drainage (fertilizer-rich water)', evidence: 'Very high nitrate (highest of all sites), raised phosphate and pH, moderate turbidity.' },
};

export const TESTS = [
  { id: 'temp', name: 'Water temperature', unit: '°C', tool: 'Thermometer', decimals: 1, how: 'Hold the thermometer in flowing water for 1 minute.' },
  { id: 'do', name: 'Dissolved oxygen', unit: 'mg/L', tool: 'DO meter', decimals: 1, how: 'Lower the probe into the current and wait for a steady reading.' },
  { id: 'ph', name: 'pH', unit: '', tool: 'pH meter', decimals: 1, how: 'Rinse the probe, then dip it in a water sample.' },
  { id: 'nitrate', name: 'Nitrate', unit: 'mg/L', tool: 'Nitrate test strip', decimals: 1, how: 'Dip the strip for 2 seconds and compare its color to the chart.' },
  { id: 'phosphate', name: 'Phosphate', unit: 'mg/L', tool: 'Phosphate test kit', decimals: 2, how: 'Add the reagent tablet to the sample and compare its color.' },
  { id: 'turbidity', name: 'Turbidity', unit: 'NTU', tool: 'Turbidity tube', decimals: 0, how: 'Pour water into the tube until the disk at the bottom disappears.' },
  { id: 'flow', name: 'Flow (float test)', unit: 's for 10 m', tool: 'Orange, stopwatch, 10 m tape', decimals: 1, how: 'Drop an orange at the start line and time it over 10 meters.' },
];

export const ROLES = {
  collector: { name: 'Collector', does: 'Do the kick-net sample at each site.' },
  identifier: { name: 'Identifier', does: 'Identify the organisms in the sorting tray.' },
  chemist: { name: 'Chemist', does: 'Run the water tests and the flow test.' },
  recorder: { name: 'Recorder / Analyst', does: 'Calculate the index and lead the questions.' },
};

// toPrecision first so 14.749999999999998 (really 14.75) rounds the way a student would.
const round = (v, d) => Math.round(Number(v.toPrecision(12)) * 10 ** d) / 10 ** d;

// Dissolved-oxygen saturation in fresh water at sea level (mg/L), from temperature (°C).
export function doSaturation(T) {
  return 14.62 - 0.3898 * T + 0.006969 * T * T - 0.00005897 * T * T * T;
}

export function computeIndex(taxonIds) {
  return [...new Set(taxonIds)].reduce((sum, id) => sum + GROUPS[TAXON[id].group].weight, 0);
}

export function ratingFor(index) {
  if (index > 22) return 'Excellent';
  if (index >= 17) return 'Good';
  if (index >= 11) return 'Fair';
  return 'Poor';
}

export const RATINGS = ['Excellent', 'Good', 'Fair', 'Poor'];

// ---------- generation ----------

function genChem(siteId, source, r, s3) {
  const R = (a, b) => r.range(a, b);
  let c;
  if (siteId === 1) c = { temp: R(11, 14), sat: R(0.95, 1.02), ph: R(6.9, 7.4), nitrate: R(0.1, 0.5), phosphate: R(0.01, 0.03), turbidity: R(1, 5) };
  else if (siteId === 2) c = { temp: R(15, 18), sat: R(0.85, 0.95), ph: R(7.3, 7.9), nitrate: R(3, 7), phosphate: R(0.08, 0.18), turbidity: R(20, 45) };
  else if (siteId === 3) {
    c = {
      sewage: { temp: R(17, 20), sat: R(0.4, 0.55), ph: R(6.8, 7.2), nitrate: R(8, 14), phosphate: R(0.4, 0.9), turbidity: R(15, 30) },
      thermal: { temp: R(26, 30), sat: R(0.8, 0.9), ph: R(7.4, 7.9), nitrate: R(3, 6), phosphate: R(0.08, 0.15), turbidity: R(18, 35) },
      sediment: { temp: R(16, 19), sat: R(0.82, 0.92), ph: R(7.2, 7.7), nitrate: R(3, 6), phosphate: R(0.15, 0.3), turbidity: R(90, 200) },
      agdrain: { temp: R(16, 19), sat: R(0.7, 0.82), ph: R(7.6, 8.2), nitrate: R(15, 25), phosphate: R(0.2, 0.4), turbidity: R(25, 50) },
    }[source];
  } else {
    c = {
      temp: source === 'thermal' ? R(20, 23) : R(15, 17.5),
      sat: R(0.82, 0.92),
      ph: (s3.ph + R(7.2, 7.6)) / 2,
      nitrate: s3.nitrate * R(0.45, 0.6),
      phosphate: s3.phosphate * R(0.4, 0.55),
      turbidity: Math.max(R(10, 20), s3.turbidity * R(0.3, 0.45)),
    };
  }
  const temp = round(c.temp, 1);
  return {
    temp,
    do: round(doSaturation(temp) * c.sat, 1),
    ph: round(c.ph, 1),
    nitrate: round(c.nitrate, 1),
    phosphate: round(c.phosphate, 2),
    turbidity: Math.round(c.turbidity),
  };
}

const QUALITY = { 1: 0.95, 2: 0.55, 4: 0.6 };
const QUALITY3 = { sewage: 0.1, thermal: 0.25, sediment: 0.22, agdrain: 0.3 };
const TARGET = { 1: [23, 31], 2: [13, 19], 4: [14, 20] };
const TARGET3 = { sewage: [4, 9], thermal: [8, 12], sediment: [7, 12], agdrain: [9, 14] };
const MODS = {
  sewage: { midge: 1.6, worm: 1.6, leech: 1.5, pouchsnail: 1.4 },
  thermal: { stonefly: 0, dobsonfly: 0.3, midge: 1.5, pouchsnail: 1.3 },
  sediment: { waterpenny: 0.1, riffle: 0.2, stonefly: 0.2, caddisfly: 0.4, worm: 1.6, midge: 1.5 },
  agdrain: { midge: 1.3, blackfly: 1.3, pouchsnail: 1.3 },
};

function presenceProb(t, q, mods) {
  let p;
  if (t.group === 1) p = 0.05 + 0.9 * q ** 1.5;
  else if (t.group === 2) p = 0.2 + 0.6 * (1 - Math.abs(q - 0.6) / 0.6);
  else p = 0.3 + 0.65 * (1 - q);
  return Math.max(0, Math.min(0.97, p * (mods[t.id] ?? 1)));
}

function genOrganisms(siteId, source, r) {
  const q = siteId === 3 ? QUALITY3[source] : QUALITY[siteId];
  const [lo, hi] = siteId === 3 ? TARGET3[source] : TARGET[siteId];
  const mods = siteId === 3 ? MODS[source] : {};
  const probs = TAXA.map((t) => ({ t, p: presenceProb(t, q, mods) }));

  let present = null;
  for (let tries = 0; tries < 300; tries++) {
    const pick = probs.filter(({ p }) => r.next() < p).map(({ t }) => t.id);
    const idx = computeIndex(pick);
    if (pick.length >= 4 && idx >= lo && idx <= hi) { present = pick; break; }
  }
  if (!present) {
    // Deterministic fallback: start from likely taxa and adjust into the band.
    const sorted = probs.slice().sort((a, b) => b.p - a.p);
    present = sorted.filter(({ p }) => p > 0.5).map(({ t }) => t.id);
    for (const { t } of sorted) {
      if (computeIndex(present) >= lo) break;
      if (!present.includes(t.id)) present.push(t.id);
    }
    for (const { t } of sorted.slice().reverse()) {
      if (computeIndex(present) <= hi) break;
      if (present.includes(t.id) && present.length > 4) present = present.filter((id) => id !== t.id);
    }
  }

  return r.shuffle(present).map((id) => {
    const g = TAXON[id].group;
    const count = g === 1 ? r.int(2, Math.round(4 + 18 * q)) : g === 2 ? r.int(2, 12) : r.int(3, Math.round(6 + 50 * (1 - q)));
    return { taxonId: id, count };
  });
}

function genFlowTime(siteId, r) {
  const v = { 1: [0.5, 0.8], 2: [0.3, 0.5], 3: [0.25, 0.45], 4: [0.3, 0.5] }[siteId];
  return round(10 / r.range(v[0], v[1]), 1);
}

export function siteTaxa(site) {
  return site.organisms.map((o) => o.taxonId);
}

export function generateLab(seedKey, settings) {
  const rng = (sub) => makeRng(seedKey + '|' + sub);
  const source = settings.scenario === 'mystery'
    ? rng('source').pick(['sewage', 'thermal', 'sediment', 'agdrain'])
    : 'sewage';

  const chems = {};
  for (const id of [1, 2, 3, 4]) chems[id] = genChem(id, source, rng('chem' + id), chems[3]);

  const sites = SITES.map((s) => {
    const chem = { ...chems[s.id], flow: genFlowTime(s.id, rng('flow' + s.id)) };
    const organisms = genOrganisms(s.id, source, rng('bugs' + s.id));
    const index = computeIndex(organisms.map((o) => o.taxonId));
    return { ...s, chem, organisms, index, rating: ratingFor(index) };
  });

  const lab = { seedKey, source, mystery: settings.scenario === 'mystery', sites };
  lab.questions = genQuestions(lab, rng('questions'));
  return lab;
}

export function siteDisplayName(lab, siteId) {
  const s = lab.sites[siteId - 1];
  if (siteId === 3 && lab.mystery) return 'Outfall Pipe';
  return s.name;
}

// What a student notices when they arrive (qualitative clues that match the data).
export function siteObservations(lab, siteId) {
  const c = lab.sites[siteId - 1].chem;
  const out = [];
  out.push(c.turbidity < 8 ? 'The water is crystal clear; you can see every pebble on the bottom.'
    : c.turbidity < 30 ? 'The water is slightly cloudy.'
    : c.turbidity < 80 ? 'The water is cloudy and tan colored.'
    : 'The water is muddy brown; you cannot see the bottom.');
  out.push(c.temp < 15 ? 'It feels cold on your hands.' : c.temp < 21 ? 'It feels cool.' : c.temp < 25 ? 'It feels lukewarm.' : 'It feels surprisingly warm.');
  out.push(c.phosphate > 0.3 ? 'Slimy green algae coats most rocks.' : c.phosphate > 0.1 ? 'A thin film of algae covers some rocks.' : 'The rocks are clean, with very little algae.');
  if (siteId === 3 && lab.source === 'sewage') out.push('There is a faint unpleasant odor near the pipe.');
  if (siteId === 2) out.push('Cattle tracks lead down the muddy bank into the water.');
  return out;
}

// ---------- questions (different numbers/wording per student or group) ----------

function genQuestions(lab, r) {
  const site = (id) => lab.sites[id - 1];
  const c = (id, t) => site(id).chem[t];
  const nm = (id) => `Site ${id} (${siteDisplayName(lab, id)})`;

  const numeric = [];
  {
    const k = r.pick([2, 3]);
    const a = round(((c(k, 'do') - c(1, 'do')) / c(1, 'do')) * 100, 1);
    numeric.push({ id: 'pctDO', type: 'numeric', unit: '%', tol: 1, answer: a,
      prompt: `Calculate the percent change in dissolved oxygen from Site 1 (Headwaters) to ${nm(k)}. Use (new − original) ÷ original × 100. Use a negative sign for a decrease. Round to one decimal place.`,
      work: `(${c(k, 'do')} − ${c(1, 'do')}) ÷ ${c(1, 'do')} × 100 = ${a}%` });
  }
  {
    const k = r.pick([1, 2, 3, 4]);
    const a = round(10 / c(k, 'flow'), 2);
    numeric.push({ id: 'velocity', type: 'numeric', unit: 'm/s', tol: 0.02, answer: a,
      prompt: `Use your float test at ${nm(k)}. The float traveled 10 m. Calculate the stream velocity in meters per second. Round to two decimal places.`,
      work: `10 m ÷ ${c(k, 'flow')} s = ${a} m/s` });
  }
  {
    const k = r.pick([2, 3]);
    const a = round(c(k, 'nitrate') / c(1, 'nitrate'), 1);
    numeric.push({ id: 'nitrateRatio', type: 'numeric', unit: 'times', tol: Math.max(0.15, a * 0.03), answer: a,
      prompt: `How many times greater is the nitrate concentration at ${nm(k)} than at Site 1 (Headwaters)? Round to one decimal place.`,
      work: `${c(k, 'nitrate')} ÷ ${c(1, 'nitrate')} = ${a}` });
  }
  {
    const k = r.pick([1, 2, 4]);
    const a = siteTaxa(site(k)).filter((id) => TAXON[id].ept).length;
    numeric.push({ id: 'ept', type: 'numeric', unit: 'types', tol: 0, answer: a,
      prompt: `What is the EPT richness at ${nm(k)}? (The number of different types of mayflies, stoneflies and caddisflies you found.)`,
      work: `EPT types found: ${siteTaxa(site(k)).filter((id) => TAXON[id].ept).map((id) => TAXON[id].name).join(', ') || 'none'} = ${a}` });
  }
  {
    const a = site(1).index - site(3).index;
    numeric.push({ id: 'indexDrop', type: 'numeric', unit: 'points', tol: 0, answer: a,
      prompt: 'By how many points did the water-quality index drop from Site 1 to Site 3?',
      work: `${site(1).index} − ${site(3).index} = ${a}` });
  }

  const srcKeys = r.shuffle(Object.keys(SOURCES));
  const mcSource = { id: 'source', type: 'mc',
    prompt: lab.mystery
      ? 'Based on ALL of your data (chemistry, organisms and observations), what is the most likely main pollution source entering at Site 3?'
      : 'Based on your data, what is the main pollution source entering at Site 3?',
    options: srcKeys.map((k) => SOURCES[k].label), answerIndex: srcKeys.indexOf(lab.source),
    work: `Evidence to look for: ${SOURCES[lab.source].evidence}` };

  const pointVariant = r.pick(['farm', 'pipe']);
  const mcPoint = { id: 'pointSource', type: 'mc',
    prompt: pointVariant === 'farm'
      ? 'The runoff from the farm fields and pasture upstream of Site 2 is best classified as:'
      : 'The pipe discharging into the stream at Site 3 is best classified as:',
    options: ['A point source of pollution', 'A nonpoint source of pollution'],
    answerIndex: pointVariant === 'farm' ? 1 : 0,
    work: pointVariant === 'farm' ? 'Nonpoint: runoff from a wide area, not one pipe.' : 'Point: a single, identifiable discharge location.' };

  const g1At1 = siteTaxa(site(1)).filter((id) => TAXON[id].group === 1);
  const good = r.pick(g1At1.length ? g1At1 : ['stonefly']);
  const bad = r.shuffle(TAXA.filter((t) => t.group === 3).map((t) => t.id)).slice(0, 3);
  const indOpts = r.shuffle([good, ...bad]);
  const mcIndicator = { id: 'indicator', type: 'mc',
    prompt: 'Which of these organisms is the best indicator of HIGH water quality?',
    options: indOpts.map((id) => TAXON[id].name), answerIndex: indOpts.indexOf(good),
    work: `${TAXON[good].name} (pollution-sensitive group)` };

  const g1At3 = new Set(siteTaxa(site(3)));
  const missing = g1At1.filter((id) => !g1At3.has(id));
  const missName = missing.length ? TAXON[r.pick(missing)].name.toLowerCase() + 's' : 'pollution-sensitive organisms';

  const text = [
    { id: 'tempDO', type: 'text',
      prompt: 'Using temperature and dissolved-oxygen values from at least TWO sites, describe the relationship between water temperature and dissolved oxygen, and explain why it matters for aquatic organisms.',
      lookFor: 'Warmer water holds less dissolved oxygen (lower gas solubility). Cites real numbers from two sites. Links low DO to stress or loss of sensitive organisms.' },
    { id: 'absence', type: 'text',
      prompt: `You found ${missName} at Site 1 but not at Site 3. Explain why, using at least two of your measurements as evidence.`,
      lookFor: 'Sensitive taxa need high DO, cool and clear water. Cites Site 3 measurements (low DO, high temperature, turbidity or nutrients) as evidence.' },
    { id: 'recovery', type: 'text',
      prompt: 'Site 4 shows partial recovery compared with Site 3. Identify two factors that could explain this improvement.',
      lookFor: 'Riparian buffer (shade, filtering runoff, bank stability), dilution and distance from the source, re-aeration from flow, settling of sediment, nutrient uptake.' },
  ];
  const solution = { id: 'solution', type: 'text',
    prompt: `Propose one realistic solution to improve water quality at Site ${r.pick([2, 3])}. Describe how it works and one drawback or cost.`,
    lookFor: 'Realistic APES solution (riparian buffer, fencing cattle, cover crops or reduced fertilizer, upgraded wastewater treatment, cooling towers or ponds, silt fences and sediment basins) with a mechanism and a trade-off.' };

  return [
    ...r.shuffle(numeric).slice(0, 3),
    mcSource,
    r.pick([mcPoint, mcIndicator]),
    ...r.shuffle(text).slice(0, 2),
    solution,
  ].map((q, i) => ({ ...q, number: i + 1 }));
}
