// Field-guide style drawings of each macroinvertebrate (SVG, 120×120, head up).
// Each drawing shows the features students use to identify it: number of tails,
// gills, legs, cases, shell direction, suckers and so on.

const S = (d, extra = '') => `<path d="${d}" ${extra}/>`;

function legs6(y0, color = '#4e342e', spread = 18) {
  const ys = [y0, y0 + 8, y0 + 16];
  return `<g stroke="${color}" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">${ys.map((y, i) => {
    const out = spread + i * 2, drop = i === 0 ? -6 : i === 1 ? 2 : 10;
    return S(`M${60 - 8} ${y} L${60 - 8 - out} ${y + drop - 6} L${60 - 10 - out - 4} ${y + drop + 6}`) +
      S(`M${60 + 8} ${y} L${60 + 8 + out} ${y + drop - 6} L${60 + 10 + out + 4} ${y + drop + 6}`);
  }).join('')}</g>`;
}

function nymph({ body = '#8d6e63', tails = 2, gills = false, abW = 9, abH = 24, antennae = true, wide = false }) {
  const segs = Array.from({ length: 6 }, (_, i) => `<line x1="${60 - abW + 1}" x2="${60 + abW - 1}" y1="${60 + i * 7}" y2="${60 + i * 7}" stroke="rgba(0,0,0,.25)" stroke-width="1.2"/>`).join('');
  const tailPaths = tails === 3
    ? [S('M57 98 Q50 108 44 118'), S('M60 99 L60 119'), S('M63 98 Q70 108 76 118')]
    : tails === 2 ? [S('M57 98 Q50 108 44 118'), S('M63 98 Q70 108 76 118')] : [];
  const gillShapes = gills
    ? Array.from({ length: 5 }, (_, i) => `<ellipse cx="${60 - abW - 4}" cy="${62 + i * 7}" rx="5" ry="3" fill="#c9a98f" opacity=".9"/><ellipse cx="${60 + abW + 4}" cy="${62 + i * 7}" rx="5" ry="3" fill="#c9a98f" opacity=".9"/>`).join('')
    : '';
  return `
    ${antennae ? `<g stroke="#4e342e" stroke-width="1.6" fill="none" stroke-linecap="round">${S('M56 15 Q46 6 38 2')}${S('M64 15 Q74 6 82 2')}</g>` : ''}
    ${legs6(32)}
    <g stroke="#4e342e" stroke-width="1.8" fill="none" stroke-linecap="round">${tailPaths.join('')}</g>
    ${gillShapes}
    <ellipse cx="60" cy="${wide ? 74 : 76}" rx="${abW}" ry="${abH}" fill="${body}"/>
    ${segs}
    <rect x="49" y="27" width="22" height="28" rx="7" fill="${body}"/>
    <path d="M51 40 L58 52 M69 40 L62 52" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/>
    <ellipse cx="60" cy="20" rx="9" ry="8" fill="${body}"/>
    <circle cx="55" cy="18" r="1.8" fill="#222"/><circle cx="65" cy="18" r="1.8" fill="#222"/>`;
}

function shell(rightHanded, operculum) {
  const g = `
    <ellipse cx="55" cy="13" rx="5" ry="5" fill="#a38a65"/>
    <ellipse cx="56" cy="24" rx="10" ry="9" fill="#9c8159"/>
    <ellipse cx="58" cy="41" rx="18" ry="15" fill="#8f7550"/>
    <ellipse cx="60" cy="72" rx="30" ry="36" fill="#86693f"/>
    <path d="M38 52 Q60 62 84 50 M44 30 Q58 36 72 30 M48 18 Q56 22 64 18" stroke="rgba(0,0,0,.3)" stroke-width="1.6" fill="none"/>
    <ellipse cx="75" cy="84" rx="14" ry="20" fill="#3b2a1a"/>
    ${operculum ? '<ellipse cx="75" cy="85" rx="10.5" ry="15.5" fill="#b08a55"/><ellipse cx="75" cy="85" rx="6" ry="9" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/><ellipse cx="75" cy="85" rx="2.5" ry="4" fill="none" stroke="rgba(0,0,0,.35)" stroke-width="1.2"/>' : '<ellipse cx="75" cy="86" rx="8" ry="13" fill="#24180e"/>'}`;
  return rightHanded ? g : `<g transform="translate(120,0) scale(-1,1)">${g}</g>`;
}

const ART = {
  stonefly: () => nymph({ tails: 2, gills: false }),
  mayfly: () => nymph({ body: '#9a7b5f', tails: 3, gills: true, abW: 8 }),
  dragonfly: () => `
    ${legs6(34, '#4e5b2e', 20)}
    <ellipse cx="60" cy="74" rx="20" ry="32" fill="#6b7a3a"/>
    ${Array.from({ length: 6 }, (_, i) => `<path d="M${44 + i} ${58 + i * 8} Q60 ${62 + i * 8} ${76 - i} ${58 + i * 8}" stroke="rgba(0,0,0,.25)" fill="none" stroke-width="1.3"/>`).join('')}
    <path d="M55 104 L57 112 L60 106 L63 112 L65 104 Z" fill="#5a6830"/>
    <rect x="47" y="28" width="26" height="22" rx="8" fill="#6b7a3a"/>
    <ellipse cx="60" cy="20" rx="15" ry="9" fill="#6b7a3a"/>
    <circle cx="48" cy="18" r="5" fill="#3b4220"/><circle cx="72" cy="18" r="5" fill="#3b4220"/>`,
  damselfly: () => `
    ${legs6(30, '#4e5b2e', 22)}
    <g fill="#8aa04e"><ellipse cx="52" cy="108" rx="3.5" ry="10" transform="rotate(18 52 108)"/><ellipse cx="60" cy="110" rx="3.5" ry="10"/><ellipse cx="68" cy="108" rx="3.5" ry="10" transform="rotate(-18 68 108)"/></g>
    <rect x="56" y="44" width="8" height="54" rx="4" fill="#7a8d40"/>
    <rect x="51" y="26" width="18" height="20" rx="6" fill="#7a8d40"/>
    <ellipse cx="60" cy="18" rx="13" ry="7" fill="#7a8d40"/>
    <circle cx="49" cy="17" r="4" fill="#3b4220"/><circle cx="71" cy="17" r="4" fill="#3b4220"/>`,
  caddisfly: () => `
    ${legs6(18, '#4e342e', 14)}
    <ellipse cx="60" cy="14" rx="7" ry="7" fill="#c7a46b"/>
    <rect x="45" y="30" width="30" height="80" rx="14" fill="#8b8273"/>
    ${[[52, 40, 5], [66, 44, 4], [57, 54, 5], [68, 60, 4], [51, 68, 4], [62, 72, 5], [54, 84, 5], [67, 88, 4], [58, 98, 4], [50, 96, 3]].map(([x, y, r]) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${r > 4 ? '#a59c8c' : '#6f675a'}" stroke="rgba(0,0,0,.2)"/>`).join('')}`,
  waterpenny: () => `
    <circle cx="60" cy="60" r="38" fill="#b8733a"/>
    <circle cx="60" cy="60" r="28" fill="none" stroke="rgba(0,0,0,.25)" stroke-width="1.6"/>
    ${Array.from({ length: 12 }, (_, i) => { const a = (i / 12) * Math.PI * 2; return `<line x1="${60 + Math.cos(a) * 28}" y1="${60 + Math.sin(a) * 28}" x2="${60 + Math.cos(a) * 38}" y2="${60 + Math.sin(a) * 38}" stroke="rgba(0,0,0,.25)" stroke-width="1.4"/>`; }).join('')}
    <ellipse cx="60" cy="60" rx="10" ry="16" fill="#a2622e"/>`,
  riffle: () => `
    <g stroke="#2b211b" stroke-width="1.4" fill="none" stroke-linecap="round">
      ${S('M55 52 L40 44 L34 52')}${S('M65 52 L80 44 L86 52')}${S('M55 60 L38 62 L34 72')}${S('M65 60 L82 62 L86 72')}${S('M55 68 L42 78 L40 90')}${S('M65 68 L78 78 L80 90')}
    </g>
    <ellipse cx="60" cy="64" rx="9" ry="14" fill="#2f241d"/>
    <path d="M60 51 L60 77" stroke="rgba(255,255,255,.25)" stroke-width="1"/>
    <ellipse cx="60" cy="48" rx="5" ry="4" fill="#2f241d"/>
    <text x="60" y="112" text-anchor="middle" font-size="9" fill="#555" font-family="system-ui">(enlarged)</text>`,
  gilledsnail: () => shell(true, true),
  pouchsnail: () => shell(false, false),
  dobsonfly: () => `
    <g stroke="#2a2522" stroke-width="2.6" fill="none" stroke-linecap="round">${S('M53 10 Q46 2 52 0')}${S('M67 10 Q74 2 68 0')}</g>
    ${legs6(26, '#2a2522', 16)}
    <g stroke="#3a332e" stroke-width="1.6" stroke-linecap="round">
      ${Array.from({ length: 8 }, (_, i) => `<line x1="50" y1="${52 + i * 7}" x2="40" y2="${50 + i * 7}"/><line x1="70" y1="${52 + i * 7}" x2="80" y2="${50 + i * 7}"/>`).join('')}
    </g>
    <rect x="48" y="46" width="24" height="64" rx="10" fill="#3d3530"/>
    ${Array.from({ length: 8 }, (_, i) => `<line x1="49" x2="71" y1="${52 + i * 7}" y2="${52 + i * 7}" stroke="rgba(255,255,255,.12)"/>`).join('')}
    <rect x="49" y="22" width="22" height="26" rx="6" fill="#3d3530"/>
    <ellipse cx="60" cy="16" rx="10" ry="8" fill="#2e2824"/>`,
  cranefly: () => `
    <rect x="44" y="10" width="32" height="94" rx="16" fill="#d8c9ad"/>
    ${Array.from({ length: 10 }, (_, i) => `<line x1="45" x2="75" y1="${20 + i * 8.5}" y2="${20 + i * 8.5}" stroke="rgba(0,0,0,.18)" stroke-width="1.4"/>`).join('')}
    <g fill="#c4b392">${[44, 52, 60, 68, 76].map((x) => `<path d="M${x - 3} 100 L${x} 116 L${x + 3} 100 Z"/>`).join('')}</g>
    <ellipse cx="60" cy="12" rx="6" ry="4" fill="#5d5240"/>`,
  crayfish: () => `
    <g stroke="#7a3a22" stroke-width="1.4" fill="none">${S('M54 22 Q36 6 22 4')}${S('M66 22 Q84 6 98 4')}</g>
    <g fill="#9c4a2b">
      <path d="M50 30 Q36 26 30 14 Q24 4 32 4 Q40 10 42 18 Q46 22 52 26 Z"/>
      <path d="M70 30 Q84 26 90 14 Q96 4 88 4 Q80 10 78 18 Q74 22 68 26 Z"/>
    </g>
    <g stroke="#7a3a22" stroke-width="2" stroke-linecap="round">${[38, 44, 50, 56].map((y) => `<line x1="50" y1="${y}" x2="38" y2="${y + 6}"/><line x1="70" y1="${y}" x2="82" y2="${y + 6}"/>`).join('')}</g>
    <ellipse cx="60" cy="44" rx="13" ry="22" fill="#a9532f"/>
    ${[70, 78, 86, 94].map((y, i) => `<rect x="${50 + i}" y="${y - 4}" width="${20 - i * 2}" height="8" rx="3" fill="#a9532f" stroke="rgba(0,0,0,.2)"/>`).join('')}
    <path d="M52 100 L60 116 L68 100 Z" fill="#9c4a2b"/>`,
  scud: () => `
    <g stroke="#8a7d5a" stroke-width="1.6" stroke-linecap="round">${Array.from({ length: 7 }, (_, i) => { const a = Math.PI * (0.25 + i * 0.09); return `<line x1="${60 + Math.cos(a) * 26}" y1="${60 + Math.sin(a) * 26}" x2="${60 + Math.cos(a) * 36}" y2="${60 + Math.sin(a) * 38}"/>`; }).join('')}</g>
    ${Array.from({ length: 10 }, (_, i) => { const a = Math.PI * (-0.55 + i * 0.13); return `<ellipse cx="${60 + Math.cos(a) * 22}" cy="${60 + Math.sin(a) * 22}" rx="8" ry="11" transform="rotate(${(a * 180) / Math.PI} ${60 + Math.cos(a) * 22} ${60 + Math.sin(a) * 22})" fill="#c8b98c" stroke="rgba(0,0,0,.2)"/>`; }).join('')}
    <g stroke="#8a7d5a" stroke-width="1.4" fill="none">${S('M70 40 Q88 26 100 30')}${S('M72 44 Q90 36 102 42')}</g>`,
  sowbug: () => `
    <g stroke="#55504a" stroke-width="1.4" fill="none">${S('M55 22 Q44 8 36 6')}${S('M65 22 Q76 8 84 6')}</g>
    <g stroke="#55504a" stroke-width="1.8" stroke-linecap="round">${Array.from({ length: 7 }, (_, i) => `<line x1="44" y1="${36 + i * 9}" x2="30" y2="${32 + i * 9}"/><line x1="76" y1="${36 + i * 9}" x2="90" y2="${32 + i * 9}"/>`).join('')}</g>
    <ellipse cx="60" cy="64" rx="20" ry="40" fill="#7d776e"/>
    ${Array.from({ length: 8 }, (_, i) => `<path d="M42 ${36 + i * 8} Q60 ${40 + i * 8} 78 ${36 + i * 8}" stroke="rgba(0,0,0,.25)" fill="none"/>`).join('')}
    <g stroke="#55504a" stroke-width="2" stroke-linecap="round"><line x1="54" y1="102" x2="50" y2="114"/><line x1="66" y1="102" x2="70" y2="114"/></g>`,
  clam: () => `
    <ellipse cx="60" cy="62" rx="42" ry="32" fill="#8e8a5c"/>
    ${[34, 26, 18, 10].map((r) => `<path d="M${60 - r * 1.2} ${62 + 10} Q60 ${62 - r * 1.1} ${60 + r * 1.2} ${62 + 10}" stroke="rgba(0,0,0,.25)" fill="none" stroke-width="1.4"/>`).join('')}
    <path d="M18 62 Q60 72 102 62" stroke="#4a4630" stroke-width="2.5" fill="none"/>
    <ellipse cx="40" cy="44" rx="6" ry="4" fill="#a6a272"/>`,
  worm: () => `
    <path d="M30 10 Q70 25 50 50 Q30 75 70 90 Q90 98 86 112" stroke="#b56a5a" stroke-width="7" fill="none" stroke-linecap="round"/>
    <path d="M30 10 Q70 25 50 50 Q30 75 70 90 Q90 98 86 112" stroke="rgba(0,0,0,.25)" stroke-width="7" fill="none" stroke-dasharray="1 5"/>`,
  leech: () => `
    <path d="M60 8 Q82 30 76 64 Q72 96 60 112 Q48 96 44 64 Q38 30 60 8 Z" fill="#3e3a2f"/>
    ${Array.from({ length: 12 }, (_, i) => `<line x1="${48 - (i > 6 ? i - 6 : 0)}" x2="${72 + (i > 6 ? i - 6 : 0)}" y1="${18 + i * 7.5}" y2="${18 + i * 7.5}" stroke="rgba(255,255,255,.12)"/>`).join('')}
    <circle cx="60" cy="14" r="5" fill="#57513f" stroke="#2a271f"/>
    <circle cx="60" cy="104" r="8" fill="#57513f" stroke="#2a271f"/>`,
  midge: () => `
    <path d="M70 30 Q40 42 52 66 Q62 86 46 96" stroke="#c62828" stroke-width="4.5" fill="none" stroke-linecap="round"/>
    <path d="M70 30 Q40 42 52 66 Q62 86 46 96" stroke="rgba(0,0,0,.25)" stroke-width="4.5" fill="none" stroke-dasharray="1 4"/>
    <circle cx="71" cy="29" r="3.5" fill="#6d1b1b"/>
    <circle cx="67" cy="35" r="1.6" fill="#8e2020"/><circle cx="46" cy="96" r="1.6" fill="#8e2020"/>
    <text x="60" y="114" text-anchor="middle" font-size="9" fill="#555" font-family="system-ui">(enlarged)</text>`,
  blackfly: () => `
    <path d="M60 18 Q50 22 52 40 Q54 52 50 66 Q42 96 60 108 Q78 96 70 66 Q66 52 68 40 Q70 22 60 18 Z" fill="#5d5d55"/>
    ${Array.from({ length: 8 }, (_, i) => `<line x1="${52 + (i > 3 ? -4 : 0)}" x2="${68 + (i > 3 ? 4 : 0)}" y1="${34 + i * 9}" y2="${34 + i * 9}" stroke="rgba(255,255,255,.12)"/>`).join('')}
    <g stroke="#3d3d36" stroke-width="1.2">${[-30, -15, 0, 15, 30].map((a) => `<line x1="55" y1="18" x2="${55 + Math.sin((a * Math.PI) / 180) * 12 - 6}" y2="${18 - Math.cos((a * Math.PI) / 180) * 12}"/><line x1="65" y1="18" x2="${65 + Math.sin((a * Math.PI) / 180) * 12 + 6}" y2="${18 - Math.cos((a * Math.PI) / 180) * 12}"/>`).join('')}</g>`,
};

export function bugSVG(id, size = 120) {
  const art = ART[id] ? ART[id]() : '';
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}" role="img" aria-label="Specimen drawing" xmlns="http://www.w3.org/2000/svg">${art}</svg>`;
}
