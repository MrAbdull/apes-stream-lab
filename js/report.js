// Turning a student's saved state into: a progress summary, a PDF report,
// a CSV of raw data, and a pre-filled "email my results" link.

import { TAXON, TESTS, ROLES, siteDisplayName } from './model.js';
import { labFingerprint, describeClass } from './codes.js';

export function fmtTest(t, v) {
  const s = Number(v).toFixed(t.decimals);
  if (t.id === 'flow') return `${s} s for 10 m`;
  return t.unit ? `${s} ${t.unit}` : s;
}

export function summarize(S, LAB) {
  const sites = LAB.sites.map((site) => {
    const ss = S.sites[site.id];
    const specimens = site.organisms.map((o) => {
      const r = ss.ids[o.taxonId];
      return { taxon: TAXON[o.taxonId], count: o.count, guess: r?.guess ? TAXON[r.guess]?.name : null, correct: !!r?.correct, attempts: r?.attempts || 0, by: r?.by };
    });
    const tally = { 1: [], 2: [], 3: [] };
    specimens.filter((s) => s.correct).forEach((s) => tally[s.taxon.group].push(s.taxon.name));
    const idsCorrect = specimens.filter((s) => s.correct).length;
    const testsDone = TESTS.filter((t) => ss.tests[t.id]).length;
    return {
      site, ss, specimens, tally, idsCorrect, testsDone,
      idsTotal: specimens.length,
      kicked: !!ss.kicked,
      allIds: idsCorrect === specimens.length,
      complete: !!ss.kicked && idsCorrect === specimens.length && testsDone === TESTS.length,
      analysisDone: !!(ss.index?.correct && ss.rating?.correct),
    };
  });
  const questions = LAB.questions.map((q) => ({ q, a: S.answers[q.id] || null }));
  const isAnswered = ({ q, a }) => !!a && (q.type === 'text' ? !!(a.value || '').trim() : !!a.done);
  const contributions = {};
  for (const e of S.log) contributions[e.by] = (contributions[e.by] || 0) + 1;
  return {
    sites, questions, contributions,
    sitesComplete: sites.filter((s) => s.complete).length,
    analysisComplete: sites.filter((s) => s.analysisDone).length,
    answered: questions.filter(isAnswered).length,
    autoCorrect: questions.filter(({ a }) => a?.correct).length,
    autoTotal: questions.filter(({ q }) => q.type !== 'text').length,
    isAnswered,
  };
}

const fmtTime = (t) => (t ? new Date(t).toLocaleString() : '—');
const minutes = (ms) => Math.round((ms || 0) / 60000);

// jsPDF's built-in fonts only cover Latin-1, so swap anything outside it.
function pdfSafe(s) {
  return String(s ?? '')
    .replace(/[−–—]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/✓/g, 'OK')
    .replace(/[^\x00-\xFF]/g, '');
}

export function buildPDF(S, LAB) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const sum = summarize(S, LAB);
  const PW = doc.internal.pageSize.getWidth(), PH = doc.internal.pageSize.getHeight();
  const L = 48, W = PW - L * 2;
  let y = 54;

  const ensure = (h) => { if (y + h > PH - 48) { doc.addPage(); y = 54; } };
  const font = (style = 'normal', size = 10, color = '#1f2a24') => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(color); };
  const text = (str, { size = 10, style = 'normal', color = '#1f2a24', indent = 0, gap = 4 } = {}) => {
    font(style, size, color);
    const lines = doc.splitTextToSize(pdfSafe(str), W - indent);
    const lh = size * 1.3;
    for (const line of lines) { ensure(lh); doc.text(line, L + indent, y + size); y += lh; }
    y += gap;
  };
  const heading = (str) => {
    ensure(40); y += 8;
    doc.setFillColor('#2e7d32'); doc.rect(L, y, 4, 16, 'F');
    font('bold', 13, '#17371b'); doc.text(pdfSafe(str), L + 10, y + 12.5); y += 26;
  };
  const table = (headers, rows, widths) => {
    const total = widths.reduce((a, b) => a + b, 0);
    const ws = widths.map((w) => (w / total) * W);
    const draw = (cells, bold, fill) => {
      font(bold ? 'bold' : 'normal', 8.5);
      const wrapped = cells.map((c, i) => doc.splitTextToSize(pdfSafe(c), ws[i] - 8));
      const h = Math.max(...wrapped.map((l) => l.length)) * 11 + 8;
      ensure(h);
      if (fill) { doc.setFillColor(fill); doc.rect(L, y, W, h, 'F'); }
      let x = L;
      wrapped.forEach((lines, i) => { font(bold ? 'bold' : 'normal', 8.5); doc.text(lines, x + 4, y + 13); x += ws[i]; });
      doc.setDrawColor('#d5dcd6'); doc.line(L, y + h, L + W, y + h);
      y += h;
    };
    draw(headers, true, '#e8f1e9');
    rows.forEach((r, i) => draw(r, false, i % 2 ? '#f8faf8' : null));
    y += 10;
  };

  // Header
  doc.setFillColor('#1f5c3a'); doc.rect(0, 0, PW, 6, 'F');
  font('bold', 18, '#17371b'); doc.text('Stream Health Lab: Macroinvertebrate Survey', L, y + 6); y += 22;
  font('normal', 10, '#4a5a50'); doc.text('AP Environmental Science · Virtual field investigation', L, y + 4); y += 18;

  const who = S.group
    ? `${who(S)} · Group ${S.group.code} · Role: ${ROLES[S.group.role]?.name || S.group.role}`
    : who(S);
  table(['Student', 'Class', 'Lab ID'], [[who, `${S.classCode} · ${describeClass(S.settings)}`, labFingerprint(S.seedKey)]], [3, 2.4, 0.8]);
  table(['Started', 'Finished', 'Active time', 'Left the lab page'],
    [[fmtTime(S.createdAt), fmtTime(S.finishedAt), `${minutes(S.activeMs)} min`, `${S.tabSwitches} time(s)`]], [1.4, 1.4, 0.8, 0.9]);
  if (S.group) text(`Team members: ${S.team.map((m) => `${m.name}${m.role ? ` (${ROLES[m.role]?.name || m.role})` : ''}`).join(', ')}`, { size: 9 });

  heading('Progress');
  text(`Sites complete: ${sum.sitesComplete}/4 · Index analysis complete: ${sum.analysisComplete}/4 · Questions answered: ${sum.answered}/${LAB.questions.length} · Auto-checked correct: ${sum.autoCorrect}/${sum.autoTotal}`, { size: 9.5 });

  heading('Water quality data');
  table(['Measurement', ...LAB.sites.map((s) => `Site ${s.id}: ${siteDisplayName(LAB, s.id)}`)],
    TESTS.map((t) => [t.name, ...LAB.sites.map((s) => { const r = S.sites[s.id].tests[t.id]; return r ? fmtTest(t, r.value) : 'not measured'; })]),
    [1.4, 1, 1, 1, 1]);

  heading('Macroinvertebrates and water-quality index');
  table(['Site', 'Sensitive (x3)', 'Somewhat sensitive (x2)', 'Tolerant (x1)', 'Student index', 'Student rating'],
    sum.sites.map((s) => [
      `Site ${s.site.id}${s.allIds ? '' : ` (${s.idsCorrect}/${s.idsTotal} identified)`}`,
      s.tally[1].join(', ') || '—', s.tally[2].join(', ') || '—', s.tally[3].join(', ') || '—',
      s.ss.index ? `${s.ss.index.value} (${s.ss.index.correct ? 'correct' : 'incorrect'}, ${s.ss.index.attempts} tries)` : '—',
      s.ss.rating ? `${s.ss.rating.value} (${s.ss.rating.correct ? 'correct' : 'incorrect'})` : '—',
    ]), [0.8, 1.6, 1.6, 1.4, 1, 0.9]);

  // Index bar chart
  const vals = sum.sites.map((s) => (s.ss.index?.correct ? s.ss.index.value : null));
  if (vals.some((v) => v != null)) {
    ensure(170);
    const cx = L + 30, cw = W - 40, ch = 120, top = 32, base = y + ch;
    const yv = (v) => base - (Math.min(v, top) / top) * ch;
    for (const [from, to, col, lab] of [[23, 32, '#c8e6c9', 'Excellent'], [17, 23, '#e6f2c2', 'Good'], [11, 17, '#fff3c4', 'Fair'], [0, 11, '#f9d6d1', 'Poor']]) {
      doc.setFillColor(col); doc.rect(cx, yv(to), cw, yv(from) - yv(to), 'F');
      font('normal', 7.5, '#556'); doc.text(lab, cx + cw - 4, yv(to) + 9, { align: 'right' });
    }
    vals.forEach((v, i) => {
      const bx = cx + (cw / 4) * i + cw / 8 - 18;
      if (v != null) { doc.setFillColor('#2f7d96'); doc.rect(bx, yv(v), 36, base - yv(v), 'F'); font('bold', 8, '#123'); doc.text(String(v), bx + 18, yv(v) - 3, { align: 'center' }); }
      font('normal', 8.5, '#333'); doc.text(`Site ${i + 1}`, bx + 18, base + 12, { align: 'center' });
    });
    font('bold', 9, '#17371b'); doc.text('Water-quality index by site', cx, y - 2);
    y = base + 26;
  }

  heading('Organism identifications');
  table(['Site', 'Specimen', 'Count', 'Final ID', 'Result', 'Tries', 'By'],
    sum.sites.flatMap((s) => s.specimens.map((sp, i) => [
      `Site ${s.site.id}`, String.fromCharCode(65 + i), String(sp.count), sp.guess || 'not identified',
      sp.correct ? 'correct' : sp.guess ? 'incorrect' : '—', String(sp.attempts), sp.by || '—',
    ])), [0.7, 0.7, 0.6, 2, 0.9, 0.6, 1.4]);

  heading('Questions');
  for (const { q, a } of sum.questions) {
    text(`${q.number}. ${q.prompt}`, { style: 'bold', size: 9.5, gap: 2 });
    let ans = '(no answer)';
    if (a) {
      if (q.type === 'text') ans = a.value?.trim() || '(no answer)';
      else if (q.type === 'mc') ans = `${q.options[a.value] ?? '—'} (${a.correct ? 'correct' : 'incorrect'}, ${a.attempts} tries)`;
      else ans = `${a.value} ${q.unit} (${a.correct ? 'correct' : 'incorrect'}, ${a.attempts} tries)`;
    }
    text(ans, { size: 9.5, indent: 12, color: '#24443a', gap: 8 });
  }

  for (const s of sum.sites) {
    if (!s.ss.notes?.trim()) continue;
    heading(`Field notes: Site ${s.site.id}`);
    text(s.ss.notes, { size: 9.5 });
  }

  if (S.group) {
    heading('Team contributions (logged actions)');
    text(Object.entries(sum.contributions).map(([n, c]) => `${n}: ${c}`).join(' · ') || '—', { size: 9.5 });
  }

  heading('Activity log');
  for (const e of S.log.slice(-80)) text(`${new Date(e.t).toLocaleString()} · ${e.by} · ${e.msg}`, { size: 7.5, gap: 0, color: '#4a5a50' });

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    font('normal', 7.5, '#7a8a80');
    doc.text(pdfSafe(`Lab ID ${labFingerprint(S.seedKey)} · ${S.student.name} · page ${i} of ${pages}`), L, PH - 24);
  }
  return doc;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function buildCSV(S, LAB) {
  const rows = [['section', 'site', 'item', 'value', 'unit', 'result', 'attempts', 'by']];
  for (const site of LAB.sites) {
    const ss = S.sites[site.id];
    for (const t of TESTS) {
      const r = ss.tests[t.id];
      rows.push(['water', site.id, t.name, r ? r.value : '', t.unit, '', '', r?.by || '']);
    }
    site.organisms.forEach((o, i) => {
      const r = ss.ids[o.taxonId];
      rows.push(['organism', site.id, `Specimen ${String.fromCharCode(65 + i)}`, r?.guess ? TAXON[r.guess].name : '', `count ${o.count}`,
        r?.correct ? 'correct' : r?.guess ? 'incorrect' : '', r?.attempts || 0, r?.by || '']);
    });
    if (ss.index) rows.push(['analysis', site.id, 'Water-quality index', ss.index.value, 'points', ss.index.correct ? 'correct' : 'incorrect', ss.index.attempts, ss.index.by]);
    if (ss.rating) rows.push(['analysis', site.id, 'Rating', ss.rating.value, '', ss.rating.correct ? 'correct' : 'incorrect', ss.rating.attempts, ss.rating.by]);
  }
  for (const q of LAB.questions) {
    const a = S.answers[q.id];
    const val = !a ? '' : q.type === 'mc' ? q.options[a.value] : a.value;
    rows.push(['question', '', `Q${q.number}: ${q.prompt}`, val, q.unit || '', a && q.type !== 'text' ? (a.correct ? 'correct' : 'incorrect') : '', a?.attempts || '', a?.by || '']);
  }
  const head = [
    `# Stream Health Lab · ${who(S)} · class ${S.classCode}${S.group ? ` · group ${S.group.code}` : ''} · Lab ID ${labFingerprint(S.seedKey)}`,
  ];
  // The BOM tells Excel the file is UTF-8 (so "°C" displays correctly).
  return '﻿' + head.concat(rows.map((r) => r.map(csvCell).join(','))).join('\r\n');
}

// Roster students (EarthLab class sign-in) have an internal ID instead of an email; don't print it.
const ROSTER = /@class\.earthlab$/;
const who = (S) => (ROSTER.test(S.student.email) ? S.student.name : `${S.student.name} (${S.student.email})`);

export function mailtoLink(S, LAB) {
  const sum = summarize(S, LAB);
  const lines = [
    `Stream Health Lab results for ${S.student.name}`,
    `Class ${S.classCode}${S.group ? ` · Group ${S.group.code}` : ''} · Lab ID ${labFingerprint(S.seedKey)}`,
    `Finished: ${fmtTime(S.finishedAt)}`,
    '',
    ...sum.sites.map((s) => `Site ${s.site.id} (${siteDisplayName(LAB, s.site.id)}): index ${s.ss.index?.correct ? s.ss.index.value : '—'}, rating ${s.ss.rating?.correct ? s.ss.rating.value : '—'}, DO ${s.ss.tests.do ? s.ss.tests.do.value + ' mg/L' : '—'}`),
    '',
    `Questions answered: ${sum.answered}/${LAB.questions.length} · Auto-checked correct: ${sum.autoCorrect}/${sum.autoTotal}`,
    '',
    'Remember to turn in your PDF report too. This email is only a summary.',
  ];
  return `mailto:${ROSTER.test(S.student.email) ? '' : encodeURIComponent(S.student.email)}?subject=${encodeURIComponent('Stream Health Lab results: ' + S.student.name)}&body=${encodeURIComponent(lines.join('\r\n'))}`;
}
