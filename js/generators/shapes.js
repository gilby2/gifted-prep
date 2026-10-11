// Figure-reasoning questions: series, matrices, odd one out, analogies,
// counting and spatial thinking. Every answer is derived from the generated
// model; SVG is only the rendering of that model.

import { withChoices } from '../core/random.js';
import {
  COLORS, SHAPES, SIZES, FILLS, ROTATABLE, CORNERS, MAX_DOTS,
  COLOR_HE, COLOR_HE_F, COLOR_HE_PL, COLOR_HE_FPL,
  SHAPE_HE, SHAPE_HE_PL, SIZE_HE, SIZE_HE_F, SIZE_HE_FPL,
  FILL_HE, FILL_HE_F, FILL_HE_FPL,
  makeFig, figSig, isValidFig, normRot, dotCapacity,
  tileSvg, sequenceSvg, matrixSvg, analogySvg,
  cellsSvg, mirrorSvg, colorSwatchSvg, segmentsSvg, scatterSvg, svgDoc, cellsMarkup,
} from '../core/svg.js';

const ATTRS = ['shape', 'color', 'size', 'fill', 'dots', 'rot'];
const ROOMY_DOT_SHAPES = ['circle', 'square', 'hexagon', 'pentagon', 'heart'];

const ATTR_NOUN = {
  shape: 'הצורה', color: 'הצבע', size: 'הגודל', fill: 'המילוי', dots: 'מספר הנקודות', rot: 'הכיוון',
};

const ARROW_DIR_HE = {
  0: 'למעלה', 45: 'למעלה וימינה', 90: 'ימינה', 135: 'למטה וימינה',
  180: 'למטה', 225: 'למטה ושמאלה', 270: 'שמאלה', 315: 'למעלה ושמאלה',
};

const mod = (a, m) => ((a % m) + m) % m;
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

// ---------------------------------------------------------------------------
// Hebrew text helpers

function joinHe(items) {
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  const glue = /^\d/.test(last) ? ' ו-' : ' ו';
  return `${items.slice(0, -1).join(', ')}${glue}${last}`;
}

function dotsPhrase(n) {
  if (n === 0) return 'בלי נקודות';
  if (n === 1) return 'נקודה אחת';
  return `${n} נקודות`;
}

function turnPhrase(step) {
  const s = mod(step, 360);
  if (s === 180) return 'חצי סיבוב';
  const cw = s <= 180;
  const amount = Math.min(s, 360 - s);
  const name = amount === 45 ? 'שמינית סיבוב' : amount === 90 ? 'רבע סיבוב' : 'שלוש שמיניות סיבוב';
  return `${name} ${cw ? 'עם כיוון השעון' : 'נגד כיוון השעון'}`;
}

function dotsStepPhrase(step) {
  if (step === 1) return 'נוספת נקודה אחת';
  if (step === -1) return 'יורדת נקודה אחת';
  if (step > 0) return `נוספות ${step} נקודות`;
  return `יורדות ${-step} נקודות`;
}

function describeFig(f) {
  let s = `${SHAPE_HE[f.shape]} ${COLOR_HE[f.color]} ${SIZE_HE[f.size]}`;
  if (f.fill !== 'solid') s += ` ${FILL_HE[f.fill]}`;
  if (f.shape === 'arrow') s += ` שמצביע ${ARROW_DIR_HE[normRot('arrow', f.rot)]}`;
  if (f.dots > 0) s += ` עם ${dotsPhrase(f.dots)}`;
  return s;
}

// ---------------------------------------------------------------------------
// Choice helpers

function roundRobin(lists) {
  const out = [];
  const max = Math.max(0, ...lists.map((l) => l.length));
  for (let i = 0; i < max; i++) {
    for (const l of lists) if (i < l.length) out.push(l[i]);
  }
  return out;
}

// Picks 3 distractors in tier order, skipping duplicates of the answer, of
// each other and of `forbidden` signatures (alternative readings of the
// puzzle that would also be correct).
function finalizeChoices(rng, correct, tiers, sigFn, forbidden = []) {
  const seen = new Set([sigFn(correct), ...forbidden]);
  const picked = [];
  for (const tier of tiers) {
    for (const cand of tier) {
      if (picked.length === 3) break;
      if (cand == null) continue;
      const s = sigFn(cand);
      if (seen.has(s)) continue;
      seen.add(s);
      picked.push(cand);
    }
  }
  if (picked.length < 3) return null;
  return withChoices(rng, correct, picked);
}

function withAttr(f, attr, v) {
  return { ...f, [attr]: v };
}

function attrDomain(f, attr) {
  switch (attr) {
    case 'shape': return SHAPES;
    case 'color': return COLORS;
    case 'size': return SIZES;
    case 'fill': return FILLS;
    case 'dots': return range(0, MAX_DOTS);
    case 'rot':
      if (f.shape === 'arrow') return range(0, 7).map((k) => k * 45);
      return ROTATABLE.includes(f.shape) ? [0, 90, 180, 270] : [];
    default: return [];
  }
}

// Valid figures that differ from f only in `attr`, plausible values first.
function variants(rng, f, attr, preferred = []) {
  const rest = rng.shuffle(attrDomain(f, attr));
  const own = figSig(f);
  return [...preferred, ...rest]
    .map((v) => withAttr(f, attr, v))
    .filter((g) => isValidFig(g) && figSig(g) !== own);
}

function figChoices(rng, correct, tiers, forbidden = []) {
  const res = finalizeChoices(rng, correct, tiers, figSig, forbidden);
  if (!res) return null;
  return { choices: res.choices.map((f) => ({ svg: tileSvg(f) })), answerIndex: res.answerIndex };
}

function constantTier(rng, f, varying) {
  const lists = rng.shuffle(ATTRS.filter((a) => !varying.includes(a)))
    .map((a) => variants(rng, f, a));
  return roundRobin(lists);
}

function pickShapePool(has) {
  if (has('rot') && has('dots')) return ['heart'];
  if (has('rot')) return ROTATABLE;
  if (has('dots')) return ROOMY_DOT_SHAPES;
  return SHAPES;
}

function compatible(attrs) {
  return !(attrs.includes('rot') && attrs.includes('shape'));
}

function sampleAttrs(rng, pool, n) {
  for (let i = 0; i < 50; i++) {
    const attrs = rng.sample(pool, n);
    if (compatible(attrs)) return attrs;
  }
  return null;
}

function rotStepOptions(shape, level) {
  if (shape === 'triangle') return [90, -90, 180];
  const opts = [90, -90];
  if (level >= 2 && shape === 'arrow') opts.push(45, -45);
  if (level >= 3) opts.push(180);
  return opts;
}

function randomRot(rng, shape) {
  return shape === 'arrow' ? rng.int(0, 7) * 45 : rng.int(0, 3) * 90;
}

// ---------------------------------------------------------------------------
// 1. Series

function genSeries(rng, level) {
  const nAttr = level <= 2 ? 1 : level <= 4 ? 2 : 3;
  const shown = level <= 3 ? 4 : 5;
  const L = shown + 1;
  const pool = level === 1 ? ['color', 'shape', 'size', 'dots', 'rot'] : ATTRS;
  const attrs = sampleAttrs(rng, pool, nAttr);
  if (!attrs) return null;
  const has = (a) => attrs.includes(a);

  const seq = Array.from({ length: L }, () => makeFig());
  const set = (attr, fn) => seq.forEach((f, i) => { f[attr] = fn(i); });
  const sentences = [];
  const wrongs = {};
  const cycleLen = () => (level === 1 ? 2 : rng.pick([2, 3]));

  const shapePool = pickShapePool(has);
  if (has('shape')) {
    const cyc = rng.sample(shapePool, cycleLen());
    set('shape', (i) => cyc[i % cyc.length]);
    sentences.push(`הצורות חוזרות לפי הסדר: ${cyc.map((s) => SHAPE_HE[s]).join(', ')}.`);
    wrongs.shape = cyc;
  } else {
    const sh = rng.pick(shapePool);
    set('shape', () => sh);
  }

  if (has('size')) {
    const patterns = level === 1 ? [[0, 2], [2, 0]] : [[0, 2], [2, 0], [0, 1, 2], [2, 1, 0]];
    const cyc = rng.pick(patterns);
    set('size', (i) => cyc[i % cyc.length]);
    sentences.push(`הגודל חוזר לפי הסדר: ${cyc.map((s) => SIZE_HE[s]).join(', ')}.`);
    wrongs.size = cyc;
  } else {
    const sz = rng.pick([1, 2, 2]);
    set('size', () => sz);
  }

  if (has('color')) {
    const cyc = rng.sample(COLORS, cycleLen());
    set('color', (i) => cyc[i % cyc.length]);
    sentences.push(`הצבעים חוזרים לפי הסדר: ${cyc.map((c) => COLOR_HE[c]).join(', ')}.`);
    wrongs.color = cyc;
  } else {
    const c = rng.pick(COLORS);
    set('color', () => c);
  }

  if (has('fill')) {
    const cyc = rng.sample(FILLS, cycleLen());
    set('fill', (i) => cyc[i % cyc.length]);
    sentences.push(`המילוי חוזר לפי הסדר: ${cyc.map((x) => FILL_HE[x]).join(', ')}.`);
    wrongs.fill = cyc;
  } else {
    const fl = level >= 4 ? rng.pick(FILLS) : 'solid';
    set('fill', () => fl);
  }

  let rotStep = 0;
  if (has('rot')) {
    const shape = seq[0].shape;
    rotStep = rng.pick(rotStepOptions(shape, level));
    const start = randomRot(rng, shape);
    set('rot', (i) => mod(start + i * rotStep, 360));
    sentences.push(`בכל צעד ה${SHAPE_HE[shape]} מסתובב ${turnPhrase(rotStep)}.`);
  } else if (seq[0].shape === 'arrow' && !has('shape')) {
    const r = randomRot(rng, 'arrow');
    set('rot', () => r);
  }

  let dotStep = 0;
  if (has('dots')) {
    const cap = Math.min(...seq.map((f) => dotCapacity(f.shape, f.size)));
    const steps = level <= 2 ? [1] : [1, 1, -1, 2];
    dotStep = rng.pick(steps);
    const span = dotStep * (L - 1);
    const lo = Math.max(0, -span);
    const hi = Math.min(cap, cap - span);
    if (hi < lo) return null;
    const start = rng.int(lo, hi);
    set('dots', (i) => start + i * dotStep);
    sentences.push(`בכל צעד ${dotsStepPhrase(dotStep)}.`);
  }

  if (!seq.every(isValidFig)) return null;
  const answer = seq[shown];
  const last = seq[shown - 1];

  const ruleLists = attrs.map((a) => {
    if (a === 'rot') {
      return variants(rng, answer, 'rot', [answer.rot - rotStep, answer.rot + rotStep, answer.rot + 180]);
    }
    if (a === 'dots') {
      return variants(rng, answer, 'dots', [answer.dots - dotStep, answer.dots + dotStep, answer.dots + 1, answer.dots - 1]);
    }
    return variants(rng, answer, a, [last[a], ...rng.shuffle(wrongs[a])]);
  });
  const tiers = [roundRobin(ruleLists), constantTier(rng, answer, attrs), seq.slice(0, shown).reverse()];
  const ch = figChoices(rng, answer, tiers);
  if (!ch) return null;

  return {
    key: `shapes.series:${seq.map(figSig).join(',')}`,
    skillId: 'shapes.series',
    level,
    prompt: 'מה בא במקום סימן השאלה?',
    passage: null,
    visual: { svg: sequenceSvg(seq.slice(0, shown)) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation: `${sentences.join(' ')} לכן עכשיו בא ${describeFig(answer)}.`,
  };
}

// ---------------------------------------------------------------------------
// 2. Matrices

function distinctValues(rng, attr, n, base, shapePool) {
  switch (attr) {
    case 'shape': return rng.sample(shapePool, n);
    case 'color': return rng.sample(COLORS, n);
    case 'size': return rng.sample(SIZES, n);
    case 'fill': return rng.sample(FILLS, n);
    case 'dots': return rng.sample(range(1, 5), n);
    case 'rot': return rng.sample(attrDomain(base, 'rot'), n);
    default: return [];
  }
}

function distSentence(attr, vals, shape) {
  switch (attr) {
    case 'shape': return `בכל שורה יש ${joinHe(vals.map((v) => SHAPE_HE[v]))}.`;
    case 'color': return `בכל שורה יש צורה ${joinHe(vals.map((v) => COLOR_HE_F[v]))}.`;
    case 'size': return `בכל שורה יש צורה ${joinHe(vals.map((v) => SIZE_HE_F[v]))}.`;
    case 'fill': return `בכל שורה יש צורה ${joinHe(vals.map((v) => FILL_HE_F[v]))}.`;
    case 'dots': return `בכל שורה יש צורה עם ${joinHe(vals.map(String))} נקודות.`;
    case 'rot': return `בכל שורה ה${SHAPE_HE[shape]} מופיע ב-3 כיוונים שונים.`;
    default: return '';
  }
}

function baseFig(rng, shapePool) {
  const shape = rng.pick(shapePool);
  return makeFig({ shape, color: rng.pick(COLORS), size: 2, fill: 'solid', rot: 0, dots: 0 });
}

function matrixQuestion(level, grid, mr, mc, answer, ch, explanation) {
  const shown = grid.map((row, r) => row.map((f, c) => (r === mr && c === mc ? null : f)));
  return {
    key: `shapes.matrix:${mr}${mc}:${grid.map((row) => row.map(figSig).join(',')).join('/')}`,
    skillId: 'shapes.matrix',
    level,
    prompt: 'איזו צורה חסרה?',
    passage: null,
    visual: { svg: matrixSvg(shown) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation,
  };
}

function genMatrix2(rng, level) {
  const pool = level === 1 ? ['color', 'shape', 'fill', 'size'] : ATTRS;
  const attrs = sampleAttrs(rng, pool, 2);
  if (!attrs) return null;
  const has = (a) => attrs.includes(a);
  const shapePool = pickShapePool(has);
  const base = baseFig(rng, shapePool);
  if (base.shape === 'arrow' && !has('rot')) base.rot = randomRot(rng, 'arrow');
  const [rowAttr, colAttr] = attrs;
  const rowVals = distinctValues(rng, rowAttr, 2, base, shapePool);
  const colVals = distinctValues(rng, colAttr, 2, base, shapePool);
  const grid = [0, 1].map((r) => [0, 1].map((c) => ({ ...base, [rowAttr]: rowVals[r], [colAttr]: colVals[c] })));
  if (!grid.flat().every(isValidFig)) return null;

  const [mr, mc] = level === 1 ? [1, 1] : [rng.int(0, 1), rng.int(0, 1)];
  const answer = grid[mr][mc];
  const tiers = [
    [grid[1 - mr][mc], grid[mr][1 - mc]],
    roundRobin([variants(rng, answer, rowAttr), variants(rng, answer, colAttr)]),
    constantTier(rng, answer, attrs),
    [grid[1 - mr][1 - mc]],
  ];
  const ch = figChoices(rng, answer, tiers);
  if (!ch) return null;
  const explanation = `בכל שורה ${ATTR_NOUN[rowAttr]} לא משתנה, ובכל טור ${ATTR_NOUN[colAttr]} לא משתנה. לכן חסר ${describeFig(answer)}.`;
  return matrixQuestion(level, grid, mr, mc, answer, ch, explanation);
}

const MATRIX_RULES = {
  shape: ['dist', 'rowconst', 'colconst'],
  color: ['dist', 'rowconst', 'colconst'],
  fill: ['dist', 'rowconst', 'colconst'],
  size: ['dist', 'colconst', 'rowconst'],
  dots: ['prog', 'prog', 'dist', 'colconst'],
  rot: ['prog', 'dist'],
};

function genMatrix3(rng, level) {
  const nAttr = level === 3 ? 2 : level === 4 ? rng.pick([2, 3]) : 3;
  const attrs = sampleAttrs(rng, ATTRS, nAttr);
  if (!attrs) return null;
  const has = (a) => attrs.includes(a);
  const shapePool = pickShapePool(has);
  const base = baseFig(rng, shapePool);
  if (base.shape === 'arrow' && !has('rot')) base.rot = randomRot(rng, 'arrow');

  const rules = [];
  for (const attr of attrs) {
    const type = rng.pick(MATRIX_RULES[attr]);
    const rule = { attr, type };
    if (type === 'prog' && attr === 'dots') {
      rule.step = level === 3 ? 1 : rng.pick([1, 1, -1, 2]);
      rule.rowStep = rng.pick([0, 1]);
      const cells = [];
      for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) cells.push(r * rule.rowStep + c * rule.step);
      const lo = Math.min(...cells);
      const hi = Math.max(...cells);
      if (hi - lo > 5) return null;
      const start = rng.int(-lo, 5 - hi);
      rule.value = (r, c) => start + r * rule.rowStep + c * rule.step;
      rule.sentence = `בכל שורה, מימין לשמאל, ${dotsStepPhrase(rule.step)} בכל פעם.`;
    } else if (type === 'prog' && attr === 'rot') {
      rule.step = rng.pick(base.shape === 'arrow' ? [90, -90, 45, -45] : [90, -90]);
      const rowShift = rng.pick([0, 90]);
      const start = randomRot(rng, base.shape);
      rule.value = (r, c) => mod(start + r * rowShift + c * rule.step, 360);
      rule.sentence = `בכל שורה, מימין לשמאל, ה${SHAPE_HE[base.shape]} מסתובב ${turnPhrase(rule.step)}.`;
    } else {
      const vals = distinctValues(rng, attr, 3, base, shapePool);
      rule.vals = vals;
      if (type === 'dist') {
        const sign = rng.pick([1, -1]);
        rule.value = (r, c) => vals[mod(c + sign * r, 3)];
        rule.sentence = distSentence(attr, vals, base.shape);
      } else if (type === 'rowconst') {
        rule.value = (r) => vals[r];
        rule.sentence = `בכל שורה ${ATTR_NOUN[attr]} לא משתנה.`;
      } else {
        rule.value = (r, c) => vals[c];
        rule.sentence = `בכל טור (מלמעלה למטה) ${ATTR_NOUN[attr]} לא משתנה.`;
      }
    }
    rules.push(rule);
  }

  const grid = [0, 1, 2].map((r) => [0, 1, 2].map((c) => {
    const f = { ...base };
    for (const rule of rules) f[rule.attr] = rule.value(r, c);
    return f;
  }));
  const flat = grid.flat();
  if (!flat.every(isValidFig)) return null;
  if (new Set(flat.map(figSig)).size !== 9) return null;

  const [mr, mc] = level === 3 ? [2, 2] : [rng.int(0, 2), rng.int(0, 2)];
  const answer = grid[mr][mc];
  const ruleLists = rules.map((rule) => {
    const preferred = rule.vals
      ? rule.vals
      : [answer[rule.attr] + rule.step, answer[rule.attr] - rule.step];
    return variants(rng, answer, rule.attr, preferred);
  });
  const neighbours = flat.filter((f) => f !== answer);
  const tiers = [roundRobin(ruleLists), constantTier(rng, answer, attrs), rng.shuffle(neighbours)];
  const ch = figChoices(rng, answer, tiers);
  if (!ch) return null;
  const explanation = `${rules.map((r) => r.sentence).join(' ')} לכן חסר ${describeFig(answer)}.`;
  return matrixQuestion(level, grid, mr, mc, answer, ch, explanation);
}

function genMatrix(rng, level) {
  return level <= 2 ? genMatrix2(rng, level) : genMatrix3(rng, level);
}

// ---------------------------------------------------------------------------
// 3. Odd one out

const ODD_RULES = {
  1: ['color', 'shape'],
  2: ['color', 'shape', 'fill', 'size'],
  3: ['color', 'shape', 'fill', 'size', 'dots', 'rot'],
  4: ['color', 'shape', 'fill', 'size', 'dots', 'rot', 'corners'],
  5: ['fill', 'size', 'dots', 'rot', 'corners', 'corners'],
};

function valuePattern(values) {
  const counts = new Map();
  for (const v of values) counts.set(v, (counts.get(v) || 0) + 1);
  return [...counts.values()].sort((a, b) => b - a).join('');
}

function oddExplanation(rule, figs, oddIdx) {
  const odd = figs[oddIdx];
  const normal = figs[(oddIdx + 1) % 4];
  switch (rule) {
    case 'color':
      return `שלוש צורות ${COLOR_HE_FPL[normal.color]}, ורק אחת ${COLOR_HE_F[odd.color]}.`;
    case 'shape':
      return `יש שלושה ${SHAPE_HE_PL[normal.shape]}, ורק ${SHAPE_HE[odd.shape]} אחד.`;
    case 'size':
      return `שלוש צורות ${SIZE_HE_FPL[normal.size]}, ורק אחת ${SIZE_HE_F[odd.size]}.`;
    case 'fill':
      return `שלוש צורות ${FILL_HE_FPL[normal.fill]}, ורק אחת ${FILL_HE_F[odd.fill]}.`;
    case 'dots':
      return `בשלוש צורות יש ${dotsPhrase(normal.dots)}, ורק באחת יש ${dotsPhrase(odd.dots)}.`;
    case 'rot':
      return `שלושה חצים מצביעים ${ARROW_DIR_HE[normRot('arrow', normal.rot)]}, ורק חץ אחד מצביע ${ARROW_DIR_HE[normRot('arrow', odd.rot)]}.`;
    case 'corners':
      return `בכל צורה יש מספר נקודות כמו מספר הפינות שלה. רק ל${SHAPE_HE[odd.shape]} יש ${CORNERS[odd.shape]} פינות אבל ${dotsPhrase(odd.dots)}.`;
    default:
      return '';
  }
}

function genOddOneOut(rng, level) {
  const rule = rng.pick(ODD_RULES[level]);
  const nNoise = level <= 2 ? 1 : level <= 4 ? 2 : 3;
  const figs = Array.from({ length: 4 }, () => makeFig());
  const oddIdx = rng.int(0, 3);
  const setAll = (attr, vals) => figs.forEach((f, i) => { f[attr] = vals[i]; });
  const fixed = new Set();

  if (rule === 'corners') {
    const shapes = rng.shuffle(Object.keys(CORNERS));
    setAll('shape', shapes);
    setAll('size', figs.map(() => 2));
    setAll('dots', shapes.map((s, i) => {
      if (i !== oddIdx) return CORNERS[s];
      const options = [CORNERS[s] - 1, CORNERS[s] + 1].filter((d) => d <= dotCapacity(s, 2));
      return rng.pick(options);
    }));
    ['shape', 'size', 'dots', 'rot'].forEach((a) => fixed.add(a));
  } else {
    let shared;
    let odd;
    if (rule === 'rot') {
      setAll('shape', figs.map(() => 'arrow'));
      fixed.add('shape');
      shared = randomRot(rng, 'arrow');
      odd = mod(shared + rng.pick([90, 180, 270, 45, -45]), 360);
    } else if (rule === 'dots') {
      shared = rng.int(1, 4);
      odd = shared === 1 ? 2 : shared + rng.pick([1, -1]);
    } else {
      [shared, odd] = rng.sample(attrDomain(figs[0], rule), 2);
    }
    setAll(rule, figs.map((_, i) => (i === oddIdx ? odd : shared)));
    fixed.add(rule);
    if (rule !== 'rot') fixed.add('rot');
  }

  const noisePool = ['color', 'shape', 'size', 'fill', 'dots', 'rot'].filter((a) => {
    if (fixed.has(a)) return false;
    if (a === 'rot') return figs[0].shape === 'arrow';
    return true;
  });
  const noise = rng.sample(noisePool, Math.min(nNoise, noisePool.length));
  // Sizes are only comparable between equal shapes.
  const sizeVaries = rule === 'size' || noise.includes('size');
  const shapeVaries = rule === 'shape' || noise.includes('shape');
  if (sizeVaries && shapeVaries) return null;
  const needsRoom = rule === 'dots' || noise.includes('dots');
  const constant = (a) => {
    if (a === 'shape') return rng.pick(needsRoom ? ROOMY_DOT_SHAPES : SHAPES);
    if (a === 'color') return rng.pick(COLORS);
    if (a === 'size') return rng.pick([1, 2]);
    if (a === 'fill') return level >= 3 ? rng.pick(FILLS) : 'solid';
    if (a === 'dots') return 0;
    return 0;
  };
  for (const a of ['shape', 'color', 'size', 'fill', 'dots', 'rot']) {
    if (fixed.has(a)) continue;
    if (noise.includes(a)) {
      let vals;
      if (a === 'shape') {
        vals = rng.sample(needsRoom ? ROOMY_DOT_SHAPES : SHAPES, 4);
      } else if (a === 'color') {
        vals = rng.sample(COLORS, 4);
      } else if (a === 'dots') {
        vals = rng.sample(range(0, 4), 4);
      } else if (a === 'rot') {
        vals = rng.sample(attrDomain(figs[0], 'rot'), 4);
      } else {
        const [p, q] = rng.sample(attrDomain(figs[0], a), 2);
        vals = rng.shuffle([p, p, q, q]);
      }
      setAll(a, vals);
    } else {
      const v = constant(a);
      setAll(a, figs.map(() => v));
    }
  }
  if (figs[0].shape === 'arrow' && rule !== 'rot' && !noise.includes('rot')) {
    const r = randomRot(rng, 'arrow');
    setAll('rot', figs.map(() => r));
  }

  if (!figs.every(isValidFig)) return null;
  if (new Set(figs.map(figSig)).size !== 4) return null;
  // No other attribute may single out one figure, or there would be two answers.
  for (const a of ATTRS) {
    if (a === rule || (rule === 'corners' && a === 'dots')) continue;
    const vals = figs.map((f) => (a === 'rot' ? normRot(f.shape, f.rot) : f[a]));
    if (valuePattern(vals) === '31') return null;
  }

  const sorted = figs.map(figSig).sort();
  return {
    key: `shapes.odd_one_out:${sorted.join(',')}|${figSig(figs[oddIdx])}`,
    skillId: 'shapes.odd_one_out',
    level,
    prompt: 'איזו צורה יוצאת דופן?',
    passage: null,
    visual: null,
    choices: figs.map((f) => ({ svg: tileSvg(f) })),
    answerIndex: oddIdx,
    explanation: oddExplanation(rule, figs, oddIdx),
  };
}

// ---------------------------------------------------------------------------
// 4. Analogies

const ANALOGY_POOL = {
  1: ['color', 'shape', 'size', 'fill'],
  2: ['color', 'shape', 'size', 'fill', 'dots', 'rot'],
  3: ATTRS, 4: ATTRS, 5: ATTRS,
};

function analogyPart(attr, a, b) {
  switch (attr) {
    case 'color': return `הצבע משתנה מ${COLOR_HE[a.color]} ל${COLOR_HE[b.color]}`;
    case 'shape': return `ה${SHAPE_HE[a.shape]} הופך ל${SHAPE_HE[b.shape]}`;
    case 'fill': return `המילוי משתנה מ${FILL_HE[a.fill]} ל${FILL_HE[b.fill]}`;
    case 'size': return b.size > a.size ? 'הצורה נעשית גדולה יותר' : 'הצורה נעשית קטנה יותר';
    case 'dots': return dotsStepPhrase(b.dots - a.dots);
    case 'rot': return `הצורה מסתובבת ${turnPhrase(b.rot - a.rot)}`;
    default: return '';
  }
}

function genAnalogy(rng, level) {
  const nT = level <= 2 ? 1 : level <= 4 ? 2 : 3;
  const T = sampleAttrs(rng, ANALOGY_POOL[level], nT);
  if (!T) return null;
  if (T.includes('size') && T.includes('shape')) return null;
  const has = (x) => T.includes(x);
  const shapePool = pickShapePool(has);

  const A = baseFig(rng, shapePool);
  A.size = rng.pick([1, 2]);
  A.fill = level >= 3 ? rng.pick(FILLS) : 'solid';
  if (A.shape === 'arrow') A.rot = randomRot(rng, 'arrow');
  const B = { ...A };
  const C = { ...A };
  const relative = level >= 3;
  const deltas = {};

  for (const t of T) {
    if (t === 'dots') {
      const k = level <= 2 ? 1 : rng.pick([1, 2, -1]);
      const capA = dotCapacity(A.shape, Math.min(A.size, 1));
      A.dots = rng.int(Math.max(0, -k), Math.min(capA, capA - k));
      B.dots = A.dots + k;
      C.dots = relative ? rng.int(Math.max(0, -k), Math.min(capA, capA - k)) : A.dots;
      deltas.dots = k;
    } else if (t === 'rot') {
      const d = rng.pick(A.shape === 'arrow' && level >= 4 ? [90, -90, 180, 45, -45] : [90, -90, 180]);
      B.rot = A.rot + d;
      C.rot = relative ? randomRot(rng, A.shape) : A.rot;
      deltas.rot = d;
    } else if (t === 'size') {
      B.size = rng.pick(SIZES.filter((s) => s !== A.size));
    } else {
      const pool = t === 'shape' ? shapePool : attrDomain(A, t);
      B[t] = rng.pick(pool.filter((v) => v !== A[t]));
    }
  }

  const carriers = rng.shuffle(['color', 'shape', 'fill', 'size'].filter((k) => !has(k)));
  const carrier = carriers.find((k) => !(k === 'shape' && (has('rot') || has('dots'))));
  if (carrier) {
    const pool = carrier === 'shape' ? shapePool : attrDomain(C, carrier);
    C[carrier] = rng.pick(pool.filter((v) => v !== A[carrier]));
  }
  if (C.shape === 'arrow' && A.shape !== 'arrow') C.rot = randomRot(rng, 'arrow');
  if (A.shape === 'arrow' && C.shape !== 'arrow' && !has('rot')) C.rot = 0;

  const D = { ...C };
  for (const t of T) {
    if (t === 'dots') D.dots = C.dots + deltas.dots;
    else if (t === 'rot') D.rot = C.rot + deltas.rot;
    else D[t] = B[t];
  }
  if (has('rot')) { A.rot = mod(A.rot, 360); B.rot = mod(B.rot, 360); D.rot = mod(D.rot, 360); }

  const all = [A, B, C, D];
  if (!all.every(isValidFig)) return null;
  if (figSig(A) === figSig(B) || figSig(C) === figSig(D) || figSig(A) === figSig(C)) return null;

  // Other readings of A->B that would give a different, defensible answer.
  const forbidden = [];
  if (has('rot')) {
    forbidden.push(figSig({ ...D, rot: mod(2 * A.rot + deltas.rot - C.rot, 360) }));
    forbidden.push(figSig({ ...D, rot: B.rot }));
  }
  if (has('dots')) forbidden.push(figSig({ ...D, dots: B.dots }));

  const ruleLists = T.map((t) => {
    if (t === 'dots') return variants(rng, D, 'dots', [C.dots, D.dots + 1, D.dots - 1]);
    if (t === 'rot') return variants(rng, D, 'rot', [C.rot, D.rot + 180, C.rot - deltas.rot]);
    return variants(rng, D, t, [C[t]]);
  });
  const carrierTier = carrier ? [withAttr(D, carrier, A[carrier])] : [];
  const tiers = [roundRobin(ruleLists), carrierTier, constantTier(rng, D, T)];
  const ch = figChoices(rng, D, tiers, forbidden);
  if (!ch) return null;

  const parts = T.map((t) => analogyPart(t, A, B));
  return {
    key: `shapes.analogies:${all.map(figSig).join(',')}`,
    skillId: 'shapes.analogies',
    level,
    prompt: 'הצורה הראשונה השתנתה. מה יקרה לצורה השנייה באותו אופן?',
    passage: null,
    visual: { svg: analogySvg(A, B, C) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation: `בשורה העליונה ${joinHe(parts)}. עושים את אותו שינוי בשורה התחתונה, ומקבלים ${describeFig(D)}.`,
  };
}

// ---------------------------------------------------------------------------
// 5. Counting

function numberChoices(rng, answer, candidates) {
  const tiers = [candidates.filter((n) => Number.isInteger(n) && n >= 0 && n <= 30)];
  const res = finalizeChoices(rng, answer, tiers, String);
  if (!res) return null;
  return { choices: res.choices.map((n) => ({ text: String(n) })), answerIndex: res.answerIndex };
}

const SCATTER_SHAPES = ['circle', 'square', 'triangle', 'star', 'heart'];

function genScatterCount(rng, level) {
  const [cols, rows] = level === 1 ? [4, 2] : level <= 3 ? [4, 3] : [5, 3];
  const nItems = level === 1 ? rng.int(6, 8) : level <= 3 ? rng.int(9, 12) : rng.int(12, 15);
  const shapes = rng.sample(SCATTER_SHAPES, level === 1 ? 3 : 4);
  const colors = rng.sample(COLORS, level === 1 ? 2 : 3);
  const slots = rng.sample(range(0, cols * rows - 1), nItems);
  const items = slots.map((s) => ({
    fig: makeFig({
      shape: rng.pick(shapes),
      color: rng.pick(colors),
      size: level >= 4 ? rng.pick([0, 1]) : 1,
      fill: level >= 4 && rng.chance(0.3) ? 'empty' : 'solid',
    }),
    col: s % cols,
    row: Math.floor(s / cols),
    dx: rng.int(-6, 6),
    dy: rng.int(-6, 6),
  }));
  const figs = items.map((it) => it.fig);
  const count = (pred) => figs.filter(pred).length;

  const kinds = { 1: ['shape'], 2: ['shape', 'shapeColor'], 3: ['shapeColor'], 4: ['shapeColor', 'diff'], 5: ['diff', 'colorNotShape'] };
  const kind = rng.pick(kinds[level]);
  const sh = rng.pick(shapes);
  const co = rng.pick(colors);
  let answer;
  let prompt;
  let explanation;
  let mistakes;
  if (kind === 'shape') {
    answer = count((f) => f.shape === sh);
    prompt = `כמה ${SHAPE_HE_PL[sh]} יש בציור?`;
    explanation = `סופרים רק את ה${SHAPE_HE_PL[sh]}, בכל הצבעים. יש ${answer}.`;
    mistakes = [count((f) => f.color === co)];
  } else if (kind === 'shapeColor') {
    answer = count((f) => f.shape === sh && f.color === co);
    prompt = `כמה ${SHAPE_HE_PL[sh]} ${COLOR_HE_PL[co]} יש בציור?`;
    explanation = `סופרים רק ${SHAPE_HE_PL[sh]} שהם גם ${COLOR_HE_PL[co]}. יש ${answer}.`;
    mistakes = [count((f) => f.shape === sh), count((f) => f.color === co)];
  } else if (kind === 'diff') {
    const [s1, s2] = rng.sample(shapes, 2);
    const a = count((f) => f.shape === s1);
    const b = count((f) => f.shape === s2);
    answer = a - b;
    prompt = `כמה ${SHAPE_HE_PL[s1]} יש יותר מ${SHAPE_HE_PL[s2]}?`;
    explanation = `יש ${a} ${SHAPE_HE_PL[s1]} ו-${b} ${SHAPE_HE_PL[s2]}. ${a} פחות ${b} זה ${answer}.`;
    mistakes = [a, b, a + b];
  } else {
    answer = count((f) => f.color === co && f.shape !== sh);
    prompt = `כמה צורות ${COLOR_HE_FPL[co]} יש בציור, שהן לא ${SHAPE_HE_PL[sh]}?`;
    explanation = `יש ${count((f) => f.color === co)} צורות ${COLOR_HE_FPL[co]}. מורידים את ה${SHAPE_HE_PL[sh]} ה${COLOR_HE_PL[co]}, ונשארות ${answer}.`;
    mistakes = [count((f) => f.color === co), count((f) => f.shape !== sh)];
  }
  if (answer < (level === 1 ? 2 : 1) || answer > 9) return null;

  const ch = numberChoices(rng, answer, [...rng.shuffle(mistakes), ...rng.shuffle([answer + 1, answer - 1]), answer + 2, answer - 2, answer + 3]);
  if (!ch) return null;
  const itemSig = items.map((it) => `${it.col}${it.row}${figSig(it.fig)}`).join(',');
  return {
    key: `shapes.counting:${prompt}|${itemSig}`,
    skillId: 'shapes.counting',
    level,
    prompt,
    passage: null,
    visual: { svg: scatterSvg(items, cols, rows) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation,
  };
}

// Line drawings: answers come from a generic counter over the segments.

const EPS = 1e-6;

function intersect([p1, p2], [p3, p4]) {
  const d = (p2[0] - p1[0]) * (p4[1] - p3[1]) - (p2[1] - p1[1]) * (p4[0] - p3[0]);
  if (Math.abs(d) < EPS) return null;
  const t = ((p3[0] - p1[0]) * (p4[1] - p3[1]) - (p3[1] - p1[1]) * (p4[0] - p3[0])) / d;
  const u = ((p3[0] - p1[0]) * (p2[1] - p1[1]) - (p3[1] - p1[1]) * (p2[0] - p1[0])) / d;
  if (t < -EPS || t > 1 + EPS || u < -EPS || u > 1 + EPS) return null;
  return [p1[0] + t * (p2[0] - p1[0]), p1[1] + t * (p2[1] - p1[1])];
}

function onSegment(p, [a, b]) {
  const cross = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
  const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (Math.abs(cross) / len > 0.01) return false;
  const dot = (p[0] - a[0]) * (b[0] - a[0]) + (p[1] - a[1]) * (b[1] - a[1]);
  return dot >= -0.01 && dot <= len * len + 0.01;
}

function buildGraph(segments) {
  const pts = [];
  const addPt = (p) => {
    if (!pts.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 0.01)) pts.push(p);
  };
  for (const s of segments) { addPt(s[0]); addPt(s[1]); }
  for (let i = 0; i < segments.length; i++) {
    for (let j = i + 1; j < segments.length; j++) {
      const p = intersect(segments[i], segments[j]);
      if (p) addPt(p);
    }
  }
  const onSeg = segments.map((s) => new Set(pts.map((p, i) => (onSegment(p, s) ? i : -1)).filter((i) => i >= 0)));
  const connected = (i, j) => onSeg.some((set) => set.has(i) && set.has(j));
  return { pts, connected };
}

export function countTriangles(segments) {
  const { pts, connected } = buildGraph(segments);
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = i + 1; j < pts.length; j++) {
      if (!connected(i, j)) continue;
      for (let k = j + 1; k < pts.length; k++) {
        if (!connected(i, k) || !connected(j, k)) continue;
        const [a, b, c] = [pts[i], pts[j], pts[k]];
        const area = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
        if (Math.abs(area) > 1) n++;
      }
    }
  }
  return n;
}

export function countSquares(segments) {
  const { pts, connected } = buildGraph(segments);
  const find = (x, y) => pts.findIndex((p) => Math.abs(p[0] - x) < 0.01 && Math.abs(p[1] - y) < 0.01);
  let n = 0;
  for (let i = 0; i < pts.length; i++) {
    for (let j = 0; j < pts.length; j++) {
      const [a, b] = [pts[i], pts[j]];
      if (Math.abs(a[1] - b[1]) > 0.01 || b[0] <= a[0] + 0.01) continue;
      const s = b[0] - a[0];
      const k = find(a[0], a[1] + s);
      const l = find(b[0], b[1] + s);
      if (k < 0 || l < 0) continue;
      if (connected(i, j) && connected(i, k) && connected(j, l) && connected(k, l)) n++;
    }
  }
  return n;
}

const FAN_SLOTS = [0.2, 0.35, 0.5, 0.65, 0.8];

function fanFigure(rng, k, withCrossbar) {
  const apex = [130, 12];
  const left = [14, 178];
  const right = [246, 178];
  const segs = [[apex, left], [apex, right], [left, right]];
  const picks = rng.sample(FAN_SLOTS, k).sort((a, b) => a - b);
  for (const t of picks) segs.push([apex, [left[0] + t * (right[0] - left[0]), 178]]);
  if (withCrossbar) {
    const t = rng.pick([0.5, 0.55, 0.6]);
    const y = apex[1] + t * (left[1] - apex[1]);
    const xl = apex[0] + t * (left[0] - apex[0]);
    const xr = apex[0] + t * (right[0] - apex[0]);
    segs.push([[xl, y], [xr, y]]);
  }
  return { segs, w: 260, h: 190, what: 'triangles', pieces: (k + 1) * (withCrossbar ? 2 : 1), tag: `fan${picks.join('-')}${withCrossbar ? 'x' : ''}` };
}

function gridFigure(rows, cols) {
  const cs = 56;
  const segs = [];
  for (let r = 0; r <= rows; r++) segs.push([[10, 10 + r * cs], [10 + cols * cs, 10 + r * cs]]);
  for (let c = 0; c <= cols; c++) segs.push([[10 + c * cs, 10], [10 + c * cs, 10 + rows * cs]]);
  return { segs, w: cols * cs + 20, h: rows * cs + 20, what: 'squares', pieces: rows * cols, tag: `grid${rows}x${cols}` };
}

function squareFigure(variant) {
  const [a, b] = [12, 188];
  const m = (a + b) / 2;
  const segs = [[[a, a], [b, a]], [[b, a], [b, b]], [[b, b], [a, b]], [[a, b], [a, a]]];
  const diag1 = [[a, a], [b, b]];
  const diag2 = [[b, a], [a, b]];
  const vmid = [[m, a], [m, b]];
  const hmid = [[a, m], [b, m]];
  const extra = {
    diag: [diag1],
    cross: [diag1, diag2],
    crossMid: [diag1, diag2, vmid],
    jack: [diag1, diag2, vmid, hmid],
    diagMid: [diag1, vmid],
  }[variant];
  const pieces = { diag: 2, cross: 4, crossMid: 6, jack: 8, diagMid: 3 }[variant];
  return { segs: [...segs, ...extra], w: 200, h: 200, what: 'triangles', pieces, tag: `sq-${variant}` };
}

function triforceFigure() {
  const A = [130, 12];
  const B = [14, 178];
  const C = [246, 178];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  const [ab, ac, bc] = [mid(A, B), mid(A, C), mid(B, C)];
  const segs = [[A, B], [A, C], [B, C], [ab, ac], [ab, bc], [ac, bc]];
  return { segs, w: 260, h: 190, what: 'triangles', pieces: 4, tag: 'triforce' };
}

function pickGeometry(rng, level) {
  const options = {
    2: [() => fanFigure(rng, 1, false), () => triforceFigure(), () => squareFigure('diagMid')],
    3: [() => fanFigure(rng, 2, false), () => gridFigure(2, 2), () => squareFigure('cross'), () => triforceFigure()],
    4: [() => fanFigure(rng, 3, false), () => gridFigure(2, 3), () => gridFigure(3, 2), () => squareFigure('crossMid'), () => fanFigure(rng, 1, true)],
    5: [() => fanFigure(rng, 2, true), () => gridFigure(3, 3), () => squareFigure('jack'), () => fanFigure(rng, 4, false), () => gridFigure(2, 4)],
  }[level];
  return rng.pick(options)();
}

function genGeometryCount(rng, level) {
  const fig = pickGeometry(rng, level);
  const answer = fig.what === 'squares' ? countSquares(fig.segs) : countTriangles(fig.segs);
  const noun = fig.what === 'squares' ? 'ריבועים' : 'משולשים';
  const ch = numberChoices(rng, answer, [fig.pieces, answer - 1, answer + 1, answer - 2, answer + 2, answer + 3]);
  if (!ch) return null;
  const bigger = answer - fig.pieces;
  return {
    key: `shapes.counting:${fig.tag}`,
    skillId: 'shapes.counting',
    level,
    prompt: `כמה ${noun} יש בציור? (גם ${noun} גדולים נספרים)`,
    passage: null,
    visual: { svg: segmentsSvg(fig.segs, fig.w, fig.h) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation: `יש ${fig.pieces} ${noun} קטנים, ועוד ${bigger} ${noun} גדולים שבנויים מכמה חלקים. ביחד ${answer}.`,
  };
}

function genCounting(rng, level) {
  const geoChance = { 1: 0, 2: 0.3, 3: 0.5, 4: 0.5, 5: 0.5 }[level];
  return rng.chance(geoChance) ? genGeometryCount(rng, level) : genScatterCount(rng, level);
}

// ---------------------------------------------------------------------------
// 6. Spatial: mirror, rotation, cube nets
//
// Grid figures are lists of cells [x, y, color]; y grows downwards.

const rot90 = ([x, y, c]) => [-y, x, c];
const flipH = ([x, y, c]) => [-x, y, c];
const flipV = ([x, y, c]) => [x, -y, c];

function normalize(cells) {
  const minX = Math.min(...cells.map((p) => p[0]));
  const minY = Math.min(...cells.map((p) => p[1]));
  return cells.map(([x, y, c]) => [x - minX, y - minY, c])
    .sort((p, q) => p[1] - q[1] || p[0] - q[0]);
}

const cellsSig = (cells) => normalize(cells).map(([x, y, c]) => `${x}${y}${c[0]}`).join(',');
const rotateN = (cells, k) => { let out = cells; for (let i = 0; i < k; i++) out = out.map(rot90); return out; };
const allRotations = (cells) => [0, 1, 2, 3].map((k) => normalize(rotateN(cells, k)));
const allOrientations = (cells) => [...allRotations(cells), ...allRotations(cells.map(flipH))];
const dims = (cells) => {
  const n = normalize(cells);
  return [Math.max(...n.map((p) => p[0])) + 1, Math.max(...n.map((p) => p[1])) + 1];
};

function growPolyomino(rng, n, maxDim) {
  const cells = [[0, 0]];
  const has = (x, y) => cells.some((p) => p[0] === x && p[1] === y);
  let guard = 0;
  while (cells.length < n && guard++ < 200) {
    const [x, y] = rng.pick(cells);
    const [dx, dy] = rng.pick([[1, 0], [-1, 0], [0, 1], [0, -1]]);
    if (has(x + dx, y + dy)) continue;
    const next = [...cells, [x + dx, y + dy]];
    const xs = next.map((p) => p[0]);
    const ys = next.map((p) => p[1]);
    if (Math.max(...xs) - Math.min(...xs) >= maxDim || Math.max(...ys) - Math.min(...ys) >= maxDim) continue;
    cells.push([x + dx, y + dy]);
  }
  return cells.length === n ? cells : null;
}

function connectedCells(cells) {
  const key = (p) => `${p[0]},${p[1]}`;
  const set = new Set(cells.map(key));
  const seen = new Set([key(cells[0])]);
  const stack = [cells[0]];
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const k = `${x + dx},${y + dy}`;
      if (set.has(k) && !seen.has(k)) { seen.add(k); stack.push([x + dx, y + dy]); }
    }
  }
  return seen.size === cells.length;
}

// Same figure with one cell moved to another free spot next to the figure.
function nearMiss(rng, cells) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const i = rng.int(0, cells.length - 1);
    const rest = cells.filter((_, j) => j !== i);
    const free = [];
    for (const [x, y] of rest) {
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const p = [x + dx, y + dy];
        if (!cells.some((q) => q[0] === p[0] && q[1] === p[1])) free.push(p);
      }
    }
    if (!free.length) continue;
    const [nx, ny] = rng.pick(free);
    const moved = [...rest, [nx, ny, cells[i][2]]];
    if (connectedCells(moved)) return moved;
  }
  return null;
}

function randomFigure(rng, n, marker) {
  const raw = growPolyomino(rng, n, 4);
  if (!raw) return null;
  const base = rng.pick(['blue', 'green', 'purple']);
  const markIdx = marker ? rng.int(0, n - 1) : -1;
  const cells = raw.map(([x, y], i) => [x, y, i === markIdx ? 'orange' : base]);
  if (new Set(allOrientations(cells).map(cellsSig)).size !== 8) return null;
  return cells;
}

function gridChoices(rng, correct, tiers) {
  const res = finalizeChoices(rng, correct, tiers, (c) => cellsSig(c));
  if (!res) return null;
  const gridN = Math.max(3, ...res.choices.flatMap(dims));
  return {
    choices: res.choices.map((c) => {
      const n = normalize(c);
      return { svg: cellsSvg(n.map(([x, y]) => [x, y]), gridN, n.map((p) => p[2])) };
    }),
    answerIndex: res.answerIndex,
    gridN,
  };
}

function genMirror(rng, level) {
  const n = level === 1 ? rng.int(4, 5) : level === 2 ? 5 : rng.int(5, 6);
  const fig = randomFigure(rng, n, level >= 3);
  if (!fig) return null;
  const axis = level === 1 ? 'vertical' : rng.pick(['vertical', 'horizontal']);
  const flip = axis === 'vertical' ? flipH : flipV;
  const other = axis === 'vertical' ? flipV : flipH;
  const correct = fig.map(flip);
  const tiers = [
    rng.shuffle([fig, fig.map(other), rotateN(fig, 2)]),
    [nearMiss(rng, correct), rotateN(fig, 1), rotateN(fig, 3)],
  ];
  const ch = gridChoices(rng, correct, tiers);
  if (!ch) return null;
  const n0 = normalize(fig);
  const gridN = Math.max(ch.gridN, ...dims(fig));
  return {
    key: `shapes.spatial:mirror-${axis}:${cellsSig(fig)}`,
    skillId: 'shapes.spatial',
    level,
    prompt: axis === 'vertical' ? 'איך תיראה הצורה במראה?' : 'איך תיראה הצורה בהשתקפות במים?',
    passage: null,
    visual: { svg: mirrorSvg(n0.map(([x, y]) => [x, y]), gridN, axis, n0.map((p) => p[2])) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation: axis === 'vertical'
      ? 'במראה ימין ושמאל מתחלפים: מה שהיה בצד ימין עובר לצד שמאל, ולמעלה נשאר למעלה.'
      : 'בהשתקפות במים למעלה ולמטה מתחלפים: מה שהיה למעלה עובר למטה, וימין נשאר ימין.',
  };
}

function genRotation(rng, level) {
  const n = level <= 2 ? rng.int(4, 5) : level === 3 ? 5 : rng.int(5, 6);
  const fig = randomFigure(rng, n, level >= 4);
  if (!fig) return null;
  const k = rng.int(1, 3);
  const correct = rotateN(fig, k);
  const mirrored = fig.map(flipH);
  const rotSigs = new Set(allRotations(fig).map(cellsSig));
  const near = nearMiss(rng, correct);
  const tiers = [
    rng.shuffle([0, 1, 2, 3]).slice(0, level >= 4 ? 2 : 3).map((j) => rotateN(mirrored, j)),
    near && !rotSigs.has(cellsSig(near)) ? [near] : [],
    [0, 1, 2, 3].map((j) => rotateN(mirrored, j)),
  ];
  const ch = gridChoices(rng, correct, tiers);
  if (!ch) return null;
  const n0 = normalize(fig);
  const gridN = Math.max(ch.gridN, ...dims(fig));
  const turn = { 1: 'רבע סיבוב עם כיוון השעון', 2: 'חצי סיבוב', 3: 'רבע סיבוב נגד כיוון השעון' }[k];
  return {
    key: `shapes.spatial:rotate${k}:${cellsSig(fig)}`,
    skillId: 'shapes.spatial',
    level,
    prompt: 'איזו צורה היא אותה צורה, רק מסובבת?',
    passage: null,
    visual: { svg: svgDoc(100, 100, cellsMarkup(n0.map(([x, y]) => [x, y]), 0, 0, 100, gridN, n0.map((p) => p[2]))) },
    choices: ch.choices,
    answerIndex: ch.answerIndex,
    explanation: `אם מסובבים את הצורה ${turn}, מקבלים את התשובה. הצורות האחרות הן תמונת מראה או צורה אחרת, ואותן אי אפשר לקבל רק מסיבוב.`,
  };
}

// --- cube nets -------------------------------------------------------------

// Rolls a cube across the net and records which cube face lands on each
// cell. Faces: 0 bottom, 1 top, 2 north, 3 south, 4 east, 5 west, so
// opposite faces are f and f ^ 1. Returns null if two cells share a face.
export function foldNet(cells) {
  const key = (x, y) => `${x},${y}`;
  const index = new Map(cells.map((p, i) => [key(p[0], p[1]), i]));
  const faces = new Array(cells.length).fill(-1);
  const start = { B: 0, T: 1, N: 2, S: 3, E: 4, W: 5 };
  const roll = {
    '1,0': (o) => ({ ...o, B: o.E, E: o.T, T: o.W, W: o.B }),
    '-1,0': (o) => ({ ...o, B: o.W, W: o.T, T: o.E, E: o.B }),
    '0,1': (o) => ({ ...o, B: o.S, S: o.T, T: o.N, N: o.B }),
    '0,-1': (o) => ({ ...o, B: o.N, N: o.T, T: o.S, S: o.B }),
  };
  faces[0] = start.B;
  const queue = [[0, start]];
  while (queue.length) {
    const [i, o] = queue.shift();
    const [x, y] = cells[i];
    for (const [d, fn] of Object.entries(roll)) {
      const [dx, dy] = d.split(',').map(Number);
      const j = index.get(key(x + dx, y + dy));
      if (j === undefined || faces[j] !== -1) continue;
      const next = fn(o);
      faces[j] = next.B;
      queue.push([j, next]);
    }
  }
  if (faces.includes(-1) || new Set(faces).size !== cells.length) return null;
  return faces;
}

function freeCanon(cells) {
  return allOrientations(cells.map(([x, y]) => [x, y, 'b'])).map(cellsSig).sort()[0];
}

function enumerateHexominoes() {
  let level = new Map([[freeCanon([[0, 0]]), [[0, 0]]]]);
  for (let n = 2; n <= 6; n++) {
    const next = new Map();
    for (const cells of level.values()) {
      for (const [x, y] of cells) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (cells.some((p) => p[0] === x + dx && p[1] === y + dy)) continue;
          const grown = [...cells, [x + dx, y + dy]];
          const canon = freeCanon(grown);
          if (!next.has(canon)) next.set(canon, grown);
        }
      }
    }
    level = next;
  }
  return [...level.values()].map((cells) => normalize(cells.map(([x, y]) => [x, y, 'b'])));
}

function hasSquareBlock(cells) {
  const has = (x, y) => cells.some((p) => p[0] === x && p[1] === y);
  return cells.some(([x, y]) => has(x + 1, y) && has(x, y + 1) && has(x + 1, y + 1));
}

const HEXOMINOES = enumerateHexominoes().filter((c) => Math.max(...dims(c)) <= 5);
export const CUBE_NETS = HEXOMINOES.filter((c) => foldNet(c));
const NON_NETS = HEXOMINOES.filter((c) => !foldNet(c));
const NON_NETS_HARD = NON_NETS.filter((c) => !hasSquareBlock(c));

function randomOrientation(rng, cells) {
  return rng.pick(allOrientations(cells));
}

function genNetValid(rng, level) {
  const color = rng.pick(['blue', 'green', 'purple', 'orange']);
  const paint = (cells) => cells.map(([x, y]) => [x, y, color]);
  const net = paint(randomOrientation(rng, rng.pick(CUBE_NETS)));
  const pool = level >= 5 ? NON_NETS_HARD : NON_NETS;
  const wrong = rng.sample(pool, 3).map((c) => paint(randomOrientation(rng, c)));
  const res = finalizeChoices(rng, net, [wrong], (c) => freeCanon(c));
  if (!res) return null;
  const gridN = Math.max(4, ...res.choices.flatMap(dims));
  return {
    key: `shapes.spatial:net:${res.choices.map(cellsSig).join('|')}`,
    skillId: 'shapes.spatial',
    level,
    prompt: 'איזו פריסה אפשר לקפל לקובייה?',
    passage: null,
    visual: null,
    choices: res.choices.map((c) => {
      const n = normalize(c);
      return { svg: cellsSvg(n.map(([x, y]) => [x, y]), gridN, n.map((p) => p[2])) };
    }),
    answerIndex: res.answerIndex,
    explanation: 'לקובייה יש 6 פאות. רק בפריסה הזאת, כשמקפלים, כל ריבוע נופל על פאה אחרת. בשאר הפריסות שני ריבועים נופלים על אותה פאה ונשאר חור.',
  };
}

function genNetOpposite(rng, level) {
  const shape = randomOrientation(rng, rng.pick(CUBE_NETS));
  const colors = rng.shuffle(COLORS);
  const net = shape.map(([x, y], i) => [x, y, colors[i]]);
  const faces = foldNet(net);
  const t = rng.int(0, 5);
  const o = faces.indexOf(faces[t] ^ 1);
  const target = net[t][2];
  const answer = net[o][2];
  const others = net.filter((_, i) => i !== t && i !== o).map((p) => p[2]);
  const res = finalizeChoices(rng, answer, [rng.shuffle(others)], String);
  if (!res) return null;
  const [tx, ty] = net[t];
  const [ox, oy] = net[o];
  const inLine = (tx === ox && Math.abs(ty - oy) === 2) || (ty === oy && Math.abs(tx - ox) === 2);
  const n0 = normalize(net);
  const gridN = Math.max(4, ...dims(net));
  const tip = inLine ? ' טיפ: שני ריבועים בשורה ישרה עם ריבוע אחד ביניהם תמיד יהיו זה מול זה.' : '';
  return {
    key: `shapes.spatial:opposite:${cellsSig(net)}:${target}`,
    skillId: 'shapes.spatial',
    level,
    prompt: `מקפלים את הפריסה לקובייה. איזה צבע יהיה מול הריבוע ה${COLOR_HE[target]}?`,
    passage: null,
    visual: { svg: svgDoc(100, 100, cellsMarkup(n0.map(([x, y]) => [x, y]), 0, 0, 100, gridN, n0.map((p) => p[2]))) },
    choices: res.choices.map((c) => ({ svg: colorSwatchSvg(c) })),
    answerIndex: res.answerIndex,
    explanation: `כשסוגרים את הקובייה, הריבוע ה${COLOR_HE[target]} נוגע בכל הצבעים חוץ מאחד: ה${COLOR_HE[answer]}. לכן ה${COLOR_HE[answer]} מולו.${tip}`,
  };
}

function genSpatial(rng, level) {
  const plan = {
    1: [genMirror],
    2: [genMirror, genRotation],
    3: [genMirror, genRotation, genRotation],
    4: [genRotation, genMirror, genNetValid],
    5: [genRotation, genNetValid, genNetOpposite],
  }[level];
  return rng.pick(plan)(rng, level);
}

// ---------------------------------------------------------------------------

function retrying(fn, skillId) {
  return (rng, level) => {
    const lv = Math.min(5, Math.max(1, Math.round(level)));
    for (let attempt = 0; attempt < 300; attempt++) {
      const q = fn(rng, lv);
      if (q) return q;
    }
    throw new Error(`${skillId}: could not build a question at level ${lv}`);
  };
}

function skill(id, name, fn) {
  return { id, name, minLevel: 1, maxLevel: 5, generate: retrying(fn, id) };
}

export default {
  id: 'shapes',
  name: 'צורות וחשיבה',
  icon: '🔷',
  skills: [
    skill('shapes.series', 'סדרות צורות', genSeries),
    skill('shapes.matrix', 'מטריצות', genMatrix),
    skill('shapes.odd_one_out', 'יוצא דופן בצורות', genOddOneOut),
    skill('shapes.analogies', 'אנלוגיות צורניות', genAnalogy),
    skill('shapes.counting', 'ספירת צורות', genCounting),
    skill('shapes.spatial', 'חשיבה מרחבית', genSpatial),
  ],
};
