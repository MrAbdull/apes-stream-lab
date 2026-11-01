// Offline lab assistant: students type a question and get the best-matching answer
// from the world's glossary. No cloud service, no keys, nothing leaves the device.

const STOP = new Set('a an the is are was were what whats why how do does did i me my to of in on for and or it its this that with be can should you your about explain mean means define tell'.split(' '));
const words = (s) => s.toLowerCase().replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
const stem = (w) => w.replace(/(ies)$/, 'y').replace(/(es|s)$/, '');

const GENERAL = [
  { term: 'next step', keys: ['next', 'stuck', 'lost', 'help', 'now', 'task', 'supposed'], dynamic: 'next' },
  { term: 'moving around', keys: ['move', 'walk', 'run', 'control', 'joystick', 'camera', 'look'],
    answer: 'Laptop: W A S D or arrow keys to move, Shift to run, drag to look, scroll to zoom. iPad: joystick to move (push all the way to run), drag to look.' },
  { term: 'saving', keys: ['save', 'saved', 'progress', 'lose', 'device', 'continue'],
    answer: 'Progress saves automatically in this browser. To switch devices, open your Passport on the campus and download your progress file, then load it on the new device.' },
];

export class Assistant {
  constructor(glossary = []) {
    this.entries = [...GENERAL, ...glossary].map((e) => ({
      ...e,
      bag: new Set([...words(e.term), ...(e.keys || []), ...(e.aliases || []).flatMap(words)].map(stem)),
      termBag: new Set(words(e.term).map(stem)),
    }));
  }

  ask(text, ctx = {}) {
    const q = words(text).map(stem);
    if (!q.length) return { answer: 'Type a question, for example "What is species richness?"' };
    let best = null, bestScore = 0;
    for (const e of this.entries) {
      let s = 0;
      for (const w of q) { if (e.termBag.has(w)) s += 3; else if (e.bag.has(w)) s += 1; }
      if (s > bestScore) { best = e; bestScore = s; }
    }
    if (!best || bestScore < 1) {
      const sample = this.entries.filter((e) => e.answer).slice(3, 8).map((e) => e.term).join(', ');
      return { answer: `I'm not sure about that one. Try asking about: ${sample}. Or ask your teacher.` };
    }
    if (best.dynamic === 'next') return { term: 'Next step', answer: ctx.next ? ctx.next() : 'Explore the world and talk to the people you meet.' };
    return { term: best.term, answer: best.answer };
  }
}
