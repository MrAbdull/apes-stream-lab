// Combining teammates' work. With no server, each teammate saves a file and the
// others import it; the merge keeps the best of everyone's work and credits who did it.

export function checkTeammateFile(S, other) {
  if (!other || other.lab !== 'stream' || !other.sites) return 'That file is not a Stream Health Lab save file.';
  if (other.classCode !== S.classCode) return 'That save file is from a different class.';
  if (!S.group || !other.group || other.group.code !== S.group.code) return 'That save file is from a different group.';
  if (other.student.email === S.student.email) return 'That is your own save file. Choose a teammate\'s file.';
  return null;
}

const better = (a, b) => (!a ? b : !a.correct && b?.correct ? b : a);

export function mergeTeam(S, other) {
  const who = other.student.name;

  for (const id of [1, 2, 3, 4]) {
    const a = S.sites[id], b = other.sites[id];
    if (!b) continue;
    if (!a.kicked && b.kicked) a.kicked = b.kicked;
    for (const [taxon, rec] of Object.entries(b.ids || {})) a.ids[taxon] = better(a.ids[taxon], rec);
    for (const [test, rec] of Object.entries(b.tests || {})) if (!a.tests[test]) a.tests[test] = rec;
    if (b.notes && !a.notes.includes(b.notes)) a.notes = (a.notes ? a.notes + '\n\n' : '') + `[${who}] ${b.notes}`;
    a.index = better(a.index, b.index);
    a.rating = better(a.rating, b.rating);
  }

  for (const id of Object.keys(other.visited || {})) S.visited[id] = true;

  for (const [qid, rec] of Object.entries(other.answers || {})) {
    const mine = S.answers[qid];
    if (rec.type === 'text') {
      const text = (rec.value || '').trim();
      if (!text) continue;
      if (!mine || !(mine.value || '').trim()) S.answers[qid] = { ...rec };
      else if (!mine.value.includes(text)) mine.value += `\n\n[${who}] ${text}`;
    } else {
      S.answers[qid] = better(mine, rec);
    }
  }

  const seen = new Set(S.log.map((e) => e.t + '|' + e.by + '|' + e.msg));
  for (const e of other.log || []) if (!seen.has(e.t + '|' + e.by + '|' + e.msg)) S.log.push(e);
  S.log.sort((x, y) => x.t - y.t);

  for (const m of other.team || []) {
    if (!S.team.some((t) => t.email === m.email)) S.team.push(m);
  }
  S.merged.push({ name: who, email: other.student.email, at: Date.now() });
}
