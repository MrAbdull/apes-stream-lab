// Small SVG bar charts for the notebook (no chart library needed).

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function niceMax(v) {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 4, 6, 8, 10].map((m) => m * p).find((m) => m >= v); // each splits cleanly into 4 ticks
}

// series: [{ name, color, values: [number|null per label] }]
// bands: optional background bands [{ from, to, color, label }]
export function barChart({ title, labels, series, unit = '', max, bands = [] }) {
  const W = 560, H = 250, L = 46, R = 12, T = 34, B = 34;
  const all = series.flatMap((s) => s.values).filter((v) => v != null);
  const top = max ?? niceMax(Math.max(1e-9, ...all, ...bands.map((b) => Math.min(b.to, 1e9))) * 1.1);
  const y = (v) => T + (H - T - B) * (1 - Math.min(v, top) / top);
  const gw = (W - L - R) / labels.length;
  const bw = Math.min(34, (gw - 14) / series.length);

  let out = `<svg viewBox="0 0 ${W} ${H}" class="chart" role="img" aria-label="${esc(title)}">`;
  out += `<text x="${L}" y="18" class="chart-title">${esc(title)}</text>`;
  for (const b of bands) {
    const y1 = y(Math.min(b.to, top)), y2 = y(Math.max(b.from, 0));
    out += `<rect x="${L}" y="${y1}" width="${W - L - R}" height="${y2 - y1}" fill="${b.color}" opacity=".16"/>`;
    out += `<text x="${W - R - 4}" y="${y1 + 12}" text-anchor="end" class="chart-band">${esc(b.label)}</text>`;
  }
  for (let i = 0; i <= 4; i++) {
    const v = (top / 4) * i, yy = y(v);
    out += `<line x1="${L}" x2="${W - R}" y1="${yy}" y2="${yy}" class="chart-grid"/>`;
    out += `<text x="${L - 6}" y="${yy + 4}" text-anchor="end" class="chart-axis">${+v.toFixed(2)}</text>`;
  }
  labels.forEach((lab, i) => {
    const gx = L + gw * i + (gw - bw * series.length) / 2;
    series.forEach((s, j) => {
      const v = s.values[i];
      const x = gx + j * bw;
      if (v == null) {
        out += `<text x="${x + bw / 2}" y="${H - B - 6}" text-anchor="middle" class="chart-missing">—</text>`;
      } else {
        out += `<rect x="${x + 1}" y="${y(v)}" width="${bw - 2}" height="${H - B - y(v)}" rx="3" fill="${s.color}"/>`;
        out += `<text x="${x + bw / 2}" y="${y(v) - 4}" text-anchor="middle" class="chart-val">${v}</text>`;
      }
    });
    out += `<text x="${L + gw * i + gw / 2}" y="${H - 12}" text-anchor="middle" class="chart-axis">${esc(lab)}</text>`;
  });
  if (unit) out += `<text x="12" y="${T + (H - T - B) / 2}" transform="rotate(-90 12 ${T + (H - T - B) / 2})" text-anchor="middle" class="chart-axis">${esc(unit)}</text>`;
  if (series.length > 1) {
    let lx = W - R;
    for (const s of series.slice().reverse()) {
      const w = s.name.length * 6.5 + 18;
      lx -= w;
      out += `<rect x="${lx}" y="8" width="10" height="10" rx="2" fill="${s.color}"/><text x="${lx + 14}" y="17" class="chart-axis">${esc(s.name)}</text>`;
    }
  }
  return out + '</svg>';
}
