// Verbal topic: analogies, odd one out, opposites/synonyms, sentence
// completion, reading comprehension and word logic.
// All content banks live in ./data/*.js; this file only builds questions.

import { withChoices } from '../core/random.js';
import { ANALOGY_GROUPS } from './data/analogies.js';
import { CATEGORIES, PROPERTIES } from './data/categories.js';
import { OPPOSITES, SYNONYMS } from './data/opposites_synonyms.js';
import { SENTENCES, CAUSE_EFFECT, CONTRAST } from './data/sentences.js';
import { PASSAGES } from './data/passages.js';
import { RIDDLES, WORDS, HIDDEN_WORDS } from './data/word_logic.js';

const MAX_ATTEMPTS = 60;

// Highest bank difficulty (1..3) allowed at each level 1..5.
const MAX_DIFFICULTY = [1, 1, 2, 3, 3];

function maxDifficulty(level) {
  return MAX_DIFFICULTY[Math.min(Math.max(level, 1), 5) - 1];
}

// At levels 4-5 lean towards the harder part of a bank so the test level
// questions are not drowned by the warm-up ones.
function pickByDifficulty(rng, items, level, getD) {
  const cap = maxDifficulty(level);
  const allowed = items.filter((it) => getD(it) <= cap);
  if (level >= 4 && rng.chance(0.65)) {
    const hard = allowed.filter((it) => getD(it) >= 2);
    if (hard.length) return rng.pick(hard);
  }
  return rng.pick(allowed);
}

function addAll(set, values) {
  if (values) for (const v of values) set.add(v);
  return set;
}

// Takes up to n words from `pool` in random order, skipping excluded ones and
// adding every taken word to `exclude` so later picks stay distinct.
function takeDistinct(rng, pool, n, exclude) {
  const out = [];
  for (const w of rng.shuffle(pool)) {
    if (out.length >= n) break;
    if (!w || exclude.has(w)) continue;
    exclude.add(w);
    out.push(w);
  }
  return out;
}

function buildQuestion(rng, { skillId, level, key, prompt, passage = null, correct, distractors, explanation }) {
  const { choices, answerIndex } = withChoices(
    rng,
    { text: correct },
    distractors.map((text) => ({ text })),
  );
  return { key, skillId, level, prompt, passage, visual: null, choices, answerIndex, explanation };
}

// Runs a generator that may reject a draw (returns null) until it succeeds.
function generateWithRetry(skillId, rng, level, attempt) {
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const q = attempt(rng, level);
    if (q) return q;
  }
  throw new Error(`${skillId}: could not build a valid question at level ${level}`);
}

// "א, ב ו־ג" with the Hebrew "ו" glued to the last item.
function joinHebrew(items) {
  if (items.length === 1) return items[0];
  const last = items[items.length - 1];
  const and = last.startsWith('ו') ? ' וגם ' : ' ו';
  return `${items.slice(0, -1).join(', ')}${and}${last}`;
}

/* ------------------------------------------------------------------ */
/* Shared opposite / synonym lookups (also used to keep analogies safe) */
/* ------------------------------------------------------------------ */

function buildRelationMap(entries) {
  const map = new Map();
  const link = (a, b) => {
    if (!map.has(a)) map.set(a, new Set());
    map.get(a).add(b);
  };
  for (const [a, b] of entries) {
    link(a, b);
    link(b, a);
  }
  return map;
}

const OPP_MAP = buildRelationMap(OPPOSITES);
const SYN_MAP = buildRelationMap(SYNONYMS);

const oppOf = (w) => OPP_MAP.get(w) || new Set();
const synOf = (w) => SYN_MAP.get(w) || new Set();

function synonymFamily(w) {
  const out = new Set(synOf(w));
  for (const s of synOf(w)) addAll(out, synOf(s));
  out.delete(w);
  return out;
}

function oppositeFamily(w) {
  // Every word that could be defended as an opposite of w: opposites of w and
  // of its synonyms, plus the synonyms of all of those.
  const out = new Set();
  for (const s of [w, ...synonymFamily(w)]) addAll(out, oppOf(s));
  for (const o of [...out]) addAll(out, synonymFamily(o));
  out.delete(w);
  return out;
}

// Words close enough in meaning that a child could defend one in place of the
// other. They are never offered as a wrong answer for each other, even when
// the banks do not list them as synonyms.
const NEAR_MEANING = [
  ['גדול', 'ענק', 'עצום'],
  ['קטן', 'זעיר', 'קטנטן'],
  ['חשוך', 'כהה'],
  ['מואר', 'בהיר'],
  ['שקט', 'רגוע', 'שליו', 'דממה'],
  ['כועס', 'עצבני', 'רוגז'],
  ['גס', 'מחוספס'],
  ['עדין', 'רך'],
  ['יציב', 'חזק', 'איתן'],
  ['סמיך', 'עבה'],
  ['דליל', 'דק', 'רזה', 'צנום'],
  ['שבע', 'מלא'],
  ['מלא', 'גדוש', 'צפוף'],
  ['אמיתי', 'נכון', 'מדויק'],
  ['שונה', 'אחר', 'מוזר', 'משונה'],
  ['נחמד', 'חביב', 'אדיב', 'מנומס'],
  ['ישן', 'עתיק', 'זקן', 'קשיש'],
  ['שמח', 'עליז'],
  ['עצוב', 'עגום'],
  ['מהיר', 'זריז'],
  ['חכם', 'נבון'],
  ['מפחיד', 'מבהיל'],
  ['שובר', 'מנפץ', 'הורס', 'מקלקל'],
  ['רוחץ', 'שוטף', 'מנקה', 'מצחצח'],
  ['נעלם', 'מתחבא', 'מסתתר', 'מחביא'],
  ['מוצא', 'מגלה'],
  ['מראה', 'מציג', 'מגלה'],
  ['בוחר', 'בורר', 'מחליט', 'קובע'],
  ['מטייל', 'מסייר', 'הולך', 'צועד'],
  ['מדבר', 'משוחח', 'צועק', 'צורח', 'לוחש'],
  ['מגדיל', 'מוסיף'],
  ['מקטין', 'מחסיר'],
  ['קופא', 'מתקרר'],
  ['נמס', 'מתחמם'],
  ['מסכים', 'מאשר'],
  ['מתנגד', 'מסרב'],
  ['קושר', 'מחבר'],
  ['מתיר', 'מפריד'],
  ['ממריא', 'עולה'],
  ['נוחת', 'יורד'],
  ['מאיץ', 'ממהר', 'מזדרז'],
  ['יום', 'אור', 'בוקר', 'זריחה'],
  ['לילה', 'חושך', 'ערב', 'שקיעה'],
  ['קיץ', 'חום'],
  ['חורף', 'קור'],
  ['התחלה', 'תחילה', 'פתיחה'],
  ['סוף', 'סיום'],
  ['צחוק', 'שמחה', 'אושר'],
  ['בכי', 'עצב'],
  ['יבשה', 'אדמה', 'קרקע'],
  ['ניצחון', 'הצלחה'],
  ['הפסד', 'כישלון'],
  ['גבר', 'איש', 'אדם', 'זכר'],
  ['אישה', 'נקבה'],
  ['עושר', 'כסף', 'ממון'],
  ['מתנה', 'שי', 'פרס', 'גמול'],
  ['ארוחה', 'סעודה', 'אוכל', 'מזון'],
  ['רעש', 'המולה'],
  ['פנימה', 'בפנים'],
  ['החוצה', 'בחוץ'],
  ['למעלה', 'מעל'],
  ['למטה', 'מתחת'],
  ['קדימה', 'לפני'],
  ['אחורה', 'אחרי'],
  ['מהר', 'במהירות', 'מיד', 'תכף'],
  ['עכשיו', 'כעת', 'מיד', 'תכף'],
  ['אחר כך', 'לאחר מכן', 'אחרי', 'בסוף', 'לבסוף'],
  ['הרבה', 'המון', 'הכול'],
  ['מעט', 'קצת', 'כלום'],
];

const NEAR_MAP = new Map();
for (const group of NEAR_MEANING) {
  for (const w of group) {
    if (!NEAR_MAP.has(w)) NEAR_MAP.set(w, new Set());
    for (const other of group) if (other !== w) NEAR_MAP.get(w).add(other);
  }
}

function addNear(set, words) {
  for (const w of [...words]) addAll(set, NEAR_MAP.get(w));
  return set;
}

/* ------------------------------------------------------------------ */
/* 1. Analogies                                                         */
/* ------------------------------------------------------------------ */

const ANALOGY = ANALOGY_GROUPS.map((g) => {
  const pairs = g.pairs.map(([a, b, d = 1, no = []]) => ({ a, b, d, no }));
  const answersOf = new Map();
  const blocked = new Map();
  for (const p of pairs) {
    if (!answersOf.has(p.a)) answersOf.set(p.a, new Set());
    answersOf.get(p.a).add(p.b);
    if (!blocked.has(p.a)) blocked.set(p.a, new Set());
    addAll(blocked.get(p.a), p.no);
  }
  return { ...g, pairs, answersOf, blocked, bTerms: [...new Set(pairs.map((p) => p.b))] };
});

// word -> Map(associated word -> easiest difficulty of a pair linking them).
const ASSOC = new Map();
for (const g of ANALOGY) {
  for (const p of g.pairs) {
    for (const [x, y] of [[p.a, p.b], [p.b, p.a]]) {
      if (!ASSOC.has(x)) ASSOC.set(x, new Map());
      const m = ASSOC.get(x);
      m.set(y, Math.min(m.get(y) ?? 3, p.d));
    }
  }
}

function assocWords(word, level) {
  const cap = maxDifficulty(level);
  return [...(ASSOC.get(word) || [])].filter(([, d]) => d <= cap).map(([w]) => w);
}

function eligiblePairs(group, level) {
  const cap = maxDifficulty(level);
  return group.pairs.filter((p) => p.d <= cap);
}

// Answer words of a group at this level, so easy levels never show hard
// words even as distractors.
function levelBTerms(group, level) {
  return [...new Set(eligiblePairs(group, level).map((p) => p.b))];
}

function analogyGroups(level) {
  return ANALOGY.filter((g) => g.minLevel <= level && eligiblePairs(g, level).length >= 3);
}

function pairsCompatible(group, p1, p2) {
  if (p1 === p2) return false;
  if (p1.a === p2.a || p1.b === p2.b || p1.a === p2.b) return false;
  if (group.answersOf.get(p2.a).has(p1.b)) return false;
  if (group.symmetric && p1.b === p2.a && p1.a === p2.b) return false;
  return true;
}

function wrongForQuestionWord(group, c, d) {
  const ex = new Set([c, d]);
  addAll(ex, group.answersOf.get(c));
  addAll(ex, group.blocked.get(c));
  addAll(ex, synonymFamily(d));
  if (group.family === 'opposite') addAll(ex, oppositeFamily(c));
  return addNear(ex, ex);
}

function analogyCompleteWord(rng, level) {
  const group = rng.pick(analogyGroups(level));
  const pool = eligiblePairs(group, level);
  const p1 = rng.pick(pool);
  const p2 = rng.pick(pool);
  if (!pairsCompatible(group, p1, p2)) return null;

  const ex = wrongForQuestionWord(group, p2.a, p2.b);
  const distractors = [];
  if (!ex.has(p1.b) && rng.chance(0.6)) {
    distractors.push(p1.b);
    ex.add(p1.b);
  }
  if (group.assoc && level >= 2 && rng.chance(0.7)) {
    distractors.push(...takeDistinct(rng, assocWords(p2.a, level), 1, ex));
  }
  distractors.push(...takeDistinct(rng, levelBTerms(group, level), 3 - distractors.length, ex));
  if (distractors.length < 3) {
    const sameFamily = ANALOGY
      .filter((g) => g.family === group.family && g !== group && g.minLevel <= level)
      .flatMap((g) => levelBTerms(g, level));
    distractors.push(...takeDistinct(rng, sameFamily, 3 - distractors.length, ex));
  }
  if (distractors.length < 3) return null;

  return buildQuestion(rng, {
    skillId: 'verbal.analogies',
    level,
    key: `verbal.analogies:${p1.a}:${p1.b}=${p2.a}:${p2.b}`,
    prompt: `איזו מילה מתאימה במקום סימן השאלה?\n${p1.a} : ${p1.b}  =  ${p2.a} : ?`,
    correct: p2.b,
    distractors,
    explanation: `${group.say(p1.a, p1.b)}. באותו אופן: ${group.say(p2.a, p2.b)}.`,
  });
}

const pairText = (a, b) => `${a} : ${b}`;

function analogyPickPair(rng, level) {
  const groups = analogyGroups(level);
  const group = rng.pick(groups);
  const pool = eligiblePairs(group, level);
  const given = rng.pick(pool);
  const right = rng.pick(pool);
  if (!pairsCompatible(group, given, right)) return null;
  if (right.a === given.b || right.b === given.a) return null;

  const used = new Set([pairText(given.a, given.b), pairText(right.a, right.b)]);
  const distractors = [];
  let reversedUsed = false;

  if (!group.symmetric && rng.chance(0.7)) {
    const other = rng.pick(pool);
    const text = pairText(other.b, other.a);
    if (other !== given && other !== right && !used.has(text)) {
      distractors.push(text);
      used.add(text);
      reversedUsed = true;
    }
  }

  const otherGroups = groups.filter((g) => g.family !== group.family);
  // A pair that starts with the same word but has another relation is the
  // classic trap ("חתול : גור" when the relation is the animal's sound).
  if (rng.chance(0.6)) {
    const sameStart = otherGroups.flatMap((g) => eligiblePairs(g, level).filter((p) => p.a === right.a));
    if (sameStart.length) {
      const p = rng.pick(sameStart);
      const text = pairText(p.a, p.b);
      if (!used.has(text)) {
        distractors.push(text);
        used.add(text);
      }
    }
  }
  for (let i = 0; distractors.length < 3 && i < 30; i++) {
    const g = rng.pick(otherGroups);
    const p = rng.pick(eligiblePairs(g, level));
    const text = pairText(p.a, p.b);
    if (used.has(text)) continue;
    distractors.push(text);
    used.add(text);
  }
  if (distractors.length < 3) return null;

  const orderNote = reversedUsed ? ' שים לב גם לסדר המילים בזוג.' : '';
  return buildQuestion(rng, {
    skillId: 'verbal.analogies',
    level,
    key: `verbal.analogies:pick:${given.a}:${given.b}>${right.a}:${right.b}`,
    prompt: `איזה זוג מילים קשור באותה דרך כמו הזוג:\n${pairText(given.a, given.b)}`,
    correct: pairText(right.a, right.b),
    distractors,
    explanation: `${group.say(given.a, given.b)}. גם כאן: ${group.say(right.a, right.b)}.${orderNote}`,
  });
}

function analogyAttempt(rng, level) {
  const pickShare = [0, 0, 0, 0.35, 0.55][level - 1];
  return rng.chance(pickShare) ? analogyPickPair(rng, level) : analogyCompleteWord(rng, level);
}

/* ------------------------------------------------------------------ */
/* 2. Odd one out                                                       */
/* ------------------------------------------------------------------ */

const WORD_TAGS = new Map();
function tagWord(word, tag) {
  if (!WORD_TAGS.has(word)) WORD_TAGS.set(word, new Set());
  WORD_TAGS.get(word).add(tag);
}
for (const c of CATEGORIES) {
  for (const w of c.words) {
    tagWord(w, `cat:${c.id}`);
    tagWord(w, `dom:${c.domain}`);
  }
}
for (const p of PROPERTIES) {
  for (const w of p.members) tagWord(w, `prop:${p.id}`);
  for (const w of p.foils) if (!WORD_TAGS.has(w)) WORD_TAGS.set(w, new Set());
}

const tagsOf = (w) => WORD_TAGS.get(w) || new Set();

// True when `odd` is the only word whose removal leaves a group sharing a tag
// the removed word does not have.
function onlyOneOdd(words, odd) {
  for (const candidate of words) {
    const others = words.filter((w) => w !== candidate);
    const shared = [...tagsOf(others[0])].filter((t) => others.every((w) => tagsOf(w).has(t)));
    const distinguishes = shared.some((t) => !tagsOf(candidate).has(t));
    if (candidate === odd && !distinguishes) return false;
    if (candidate !== odd && distinguishes) return false;
  }
  return true;
}

function categoryLevel(d) {
  return d === 3 ? 4 : d;
}

function oddFromCategories(rng, level, sameDomain) {
  const cats = CATEGORIES.filter((c) => categoryLevel(c.d) <= level);
  const group = rng.pick(cats);
  const others = CATEGORIES.filter((c) => c !== group
    && categoryLevel(c.d) <= Math.max(level, 2)
    && (sameDomain ? c.domain === group.domain : c.domain !== group.domain));
  if (!others.length) return null;
  const oddCat = rng.pick(others);
  const three = rng.sample(group.words, 3);
  const odd = rng.pick(oddCat.words);
  if (three.includes(odd) || tagsOf(odd).has(`cat:${group.id}`)) return null;
  const words = [...three, odd];
  if (!onlyOneOdd(words, odd)) return null;
  return {
    three,
    odd,
    explanation: `${joinHebrew(three)} – כולם ${group.label}. המילה ${odd} שייכת לקבוצה אחרת: ${oddCat.label}.`,
  };
}

function oddFromProperty(rng, level) {
  const props = PROPERTIES.filter((p) => categoryLevel(p.d) <= level);
  const prop = rng.pick(props);
  const three = rng.sample(prop.members, 3);
  const odd = rng.pick(prop.foils);
  const words = [...three, odd];
  if (!onlyOneOdd(words, odd)) return null;
  return {
    three,
    odd,
    explanation: `${joinHebrew(three)} – כולם ${prop.label}. ${odd} – לא.`,
  };
}

function oddOneOutAttempt(rng, level) {
  const propShare = [0, 0, 0.2, 0.35, 0.45][level - 1];
  const sameDomainShare = [0, 0.3, 0.6, 0.65, 0.7][level - 1];
  const made = rng.chance(propShare)
    ? oddFromProperty(rng, level)
    : oddFromCategories(rng, level, rng.chance(sameDomainShare));
  if (!made) return null;
  const { three, odd, explanation } = made;
  return buildQuestion(rng, {
    skillId: 'verbal.odd_one_out',
    level,
    key: `verbal.odd_one_out:${[...three].sort().join(',')}|${odd}`,
    prompt: 'איזו מילה לא מתאימה לשאר המילים?',
    correct: odd,
    distractors: three,
    explanation,
  });
}

/* ------------------------------------------------------------------ */
/* 3. Opposites and synonyms                                            */
/* ------------------------------------------------------------------ */

const entryD = (e) => e[3] || 1;

// Part of speech -> word -> easiest difficulty the word appears with, so easy
// levels only get easy distractors.
const POS_WORDS = new Map();
for (const e of [...OPPOSITES, ...SYNONYMS]) {
  const [a, b, pos] = e;
  if (!POS_WORDS.has(pos)) POS_WORDS.set(pos, new Map());
  const words = POS_WORDS.get(pos);
  for (const w of [a, b]) words.set(w, Math.min(words.get(w) || 3, entryD(e)));
}

function posPool(pos, level) {
  const cap = maxDifficulty(level);
  return [...POS_WORDS.get(pos)].filter(([, d]) => d <= cap).map(([w]) => w);
}

function relationExclusions(mode, x, y) {
  const ex = new Set([x, y]);
  if (mode === 'opp') {
    const opposites = oppositeFamily(x);
    addAll(ex, opposites);
    addNear(ex, [y, ...opposites]);
  } else {
    const same = [x, y, ...synonymFamily(x), ...synonymFamily(y)];
    addAll(ex, same);
    addNear(ex, same);
  }
  return ex;
}

function singleWordRelation(rng, level, mode) {
  const bank = mode === 'opp' ? OPPOSITES : SYNONYMS;
  const entry = pickByDifficulty(rng, bank, level, entryD);
  const [a, b, pos] = entry;
  const [x, y] = rng.chance(0.5) ? [a, b] : [b, a];
  const ex = relationExclusions(mode, x, y);

  const traps = mode === 'opp' ? [...synonymFamily(x)] : [...oppositeFamily(x)];
  const distractors = level >= 2 ? takeDistinct(rng, traps, 1, ex) : [];
  const trap = distractors[0];
  distractors.push(...takeDistinct(rng, posPool(pos, level), 3 - distractors.length, ex));
  if (distractors.length < 3) return null;

  let explanation;
  if (mode === 'opp') {
    explanation = `ההפך של ${x} הוא ${y}.`;
    if (trap) explanation += ` המילה ${trap} דומה ל${x}, והיא לא ההפך.`;
  } else {
    explanation = `המילה ${y} אומרת כמעט אותו דבר כמו ${x}.`;
    if (trap) explanation += ` המילה ${trap} היא דווקא ההפך.`;
  }
  return buildQuestion(rng, {
    skillId: 'verbal.opposites_synonyms',
    level,
    key: `verbal.opposites_synonyms:${mode}:${x}>${y}`,
    prompt: mode === 'opp'
      ? `מה ההפך של המילה "${x}"?`
      : `איזו מילה אומרת כמעט אותו דבר כמו "${x}"?`,
    correct: y,
    distractors,
    explanation,
  });
}

const dashPair = (a, b) => `${a} – ${b}`;

function pairRelation(rng, level, mode) {
  const bank = mode === 'opp' ? OPPOSITES : SYNONYMS;
  const otherBank = mode === 'opp' ? SYNONYMS : OPPOSITES;
  const [a, b, pos] = pickByDifficulty(rng, bank, level, entryD);
  const used = new Set([dashPair(a, b), dashPair(b, a)]);
  const distractors = [];

  const otherPairs = rng.shuffle(otherBank.filter((e) => e[2] === pos && entryD(e) <= maxDifficulty(level)));
  for (const [c, d] of otherPairs) {
    if (distractors.length >= 2) break;
    const text = dashPair(c, d);
    if (used.has(text)) continue;
    distractors.push(text);
    used.add(text);
  }
  // A "mixed" pair: same first word, unrelated second word.
  const ex = relationExclusions(mode, a, b);
  addAll(ex, mode === 'opp' ? synonymFamily(a) : oppositeFamily(a));
  const [filler] = takeDistinct(rng, posPool(pos, level), 1, ex);
  if (filler) distractors.push(dashPair(a, filler));
  if (distractors.length < 3) return null;

  return buildQuestion(rng, {
    skillId: 'verbal.opposites_synonyms',
    level,
    key: `verbal.opposites_synonyms:pair-${mode}:${a}|${b}`,
    prompt: mode === 'opp'
      ? 'באיזה זוג המילים הן הפכים?'
      : 'באיזה זוג המילים אומרות כמעט אותו דבר?',
    correct: dashPair(a, b),
    distractors,
    explanation: mode === 'opp'
      ? `${a} ו${b} הן מילים הפוכות.`
      : `${a} ו${b} הן מילים דומות – אומרות כמעט אותו דבר.`,
  });
}

function oppositesSynonymsAttempt(rng, level) {
  const oppShare = level === 1 ? 0.7 : 0.5;
  const mode = rng.chance(oppShare) ? 'opp' : 'syn';
  const pairShare = level >= 4 ? 0.3 : 0;
  return rng.chance(pairShare) ? pairRelation(rng, level, mode) : singleWordRelation(rng, level, mode);
}

/* ------------------------------------------------------------------ */
/* 4. Sentence completion                                               */
/* ------------------------------------------------------------------ */

const PRONOUN_START = /^(הוא|היא|הם|הן|אני|אנחנו)\s/;

function handWrittenSentence(rng, level) {
  const [sentence, answer, wrong, explanation] = pickByDifficulty(rng, SENTENCES, level, (s) => s[4]);
  return buildQuestion(rng, {
    skillId: 'verbal.sentence_completion',
    level,
    key: `verbal.sentence_completion:${sentence}`,
    prompt: `איזו מילה משלימה את המשפט?\n${sentence}`,
    correct: answer,
    distractors: wrong,
    explanation,
  });
}

function causeEffectSentence(rng, level) {
  const [cause, effect, , causeFirstOnly = false] = pickByDifficulty(rng, CAUSE_EFFECT, level, (s) => s[2]);
  const canUseKi = !causeFirstOnly && !PRONOUN_START.test(effect);
  const useKi = canUseKi && rng.chance(0.5);
  const common = { skillId: 'verbal.sentence_completion', level };
  if (useKi) {
    return buildQuestion(rng, {
      ...common,
      key: `verbal.sentence_completion:ki:${cause}>${effect}`,
      prompt: `איזו מילה משלימה את המשפט?\n${effect} ___ ${cause}.`,
      correct: 'כי',
      // Not "אבל": "לבשתי סוודר אבל היה לי קר" is a fine sentence too.
      distractors: ['לכן', 'אז', 'או'],
      explanation: `${cause} – זאת הסיבה. אחרי "כי" באה הסיבה.`,
    });
  }
  return buildQuestion(rng, {
    ...common,
    key: `verbal.sentence_completion:lachen:${cause}>${effect}`,
    prompt: `איזו מילה משלימה את המשפט?\n${cause}, ___ ${effect}.`,
    correct: 'לכן',
    // Not "למרות ש": "היה לי קר, למרות שלבשתי סוודר" is a fine sentence too.
    distractors: ['כי', 'בגלל ש', 'או'],
    explanation: `${cause}, ובגלל זה ${effect}. אחרי "לכן" בא מה שקרה בגלל הסיבה.`,
  });
}

function contrastSentence(rng, level) {
  const [first, second] = pickByDifficulty(rng, CONTRAST, level, (s) => s[2]);
  return buildQuestion(rng, {
    skillId: 'verbal.sentence_completion',
    level,
    key: `verbal.sentence_completion:aval:${first}>${second}`,
    prompt: `איזו מילה משלימה את המשפט?\n${first}, ___ ${second}.`,
    correct: 'אבל',
    distractors: ['לכן', 'כי', 'או'],
    explanation: `שני חלקי המשפט לא מסתדרים זה עם זה, ולכן מחברים אותם ב"אבל".`,
  });
}

function sentenceAttempt(rng, level) {
  const roll = rng();
  if (roll < 0.62) return handWrittenSentence(rng, level);
  if (roll < 0.86) return causeEffectSentence(rng, level);
  return contrastSentence(rng, level);
}

/* ------------------------------------------------------------------ */
/* 5. Reading comprehension                                             */
/* ------------------------------------------------------------------ */

function readingAttempt(rng, level) {
  const passage = pickByDifficulty(rng, PASSAGES, level, (p) => p.d);
  const [qid, , question, answer, wrong, explanation] = rng.pick(passage.questions);
  return buildQuestion(rng, {
    skillId: 'verbal.reading',
    level,
    key: `verbal.reading:${passage.id}:${qid}`,
    prompt: question,
    passage: `${passage.title}\n\n${passage.text}`,
    correct: answer,
    distractors: wrong,
    explanation,
  });
}

/* ------------------------------------------------------------------ */
/* 6. Word logic                                                        */
/* ------------------------------------------------------------------ */

const FINAL_TO_REGULAR = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const ALEF_BET = 'אבגדהוזחטיכלמנסעפצקרשת';

// Letters of a word in regular (non-final) form, without spaces or marks.
function lettersOf(word) {
  return [...word]
    .filter((ch) => ch >= 'א' && ch <= 'ת')
    .map((ch) => FINAL_TO_REGULAR[ch] || ch);
}

const letterKey = (word) => lettersOf(word).sort().join('');
const firstLetter = (word) => lettersOf(word)[0];
const lastLetter = (word) => lettersOf(word).slice(-1)[0];
const letterCount = (word) => lettersOf(word).length;
const showLetters = (letters) => letters.join(' - ');

function isSubsequence(small, big) {
  let i = 0;
  for (const ch of big) if (ch === small[i]) i++;
  return i === small.length;
}

const WORD_SET = new Set(WORDS.map((w) => lettersOf(w).join('')));

function riddle(rng, level) {
  const cap = maxDifficulty(level);
  let pool = RIDDLES.filter((r) => r[3] <= cap);
  if (level >= 5) pool = pool.filter((r) => r[3] >= 2);
  const [text, answer, wrong] = rng.pick(pool);
  return buildQuestion(rng, {
    skillId: 'verbal.word_logic',
    level,
    key: `verbal.word_logic:riddle:${text}`,
    prompt: `חידה: ${text}`,
    correct: answer,
    distractors: wrong,
    explanation: `התשובה: ${answer}. כל רמז בחידה מתאים לתשובה הזאת.`,
  });
}

function anagram(rng, level) {
  const sizes = [[3], [3, 4], [4], [4, 5], [5]][level - 1];
  const size = rng.pick(sizes);
  const pool = WORDS.filter((w) => letterCount(w) === size);
  const word = rng.pick(pool);
  const letters = lettersOf(word);
  const shown = rng.shuffle(letters);
  if (shown.join('') === letters.join('') || WORD_SET.has(shown.join(''))) return null;

  const target = letterKey(word);
  const scored = rng.shuffle(pool)
    .filter((w) => w !== word && letterKey(w) !== target)
    .map((w) => ({ w, common: lettersOf(w).filter((ch) => letters.includes(ch)).length }))
    .sort((p, q) => q.common - p.common);
  const distractors = scored.slice(0, 3).map((s) => s.w);
  if (distractors.length < 3) return null;

  return buildQuestion(rng, {
    skillId: 'verbal.word_logic',
    level,
    key: `verbal.word_logic:anagram:${word}:${shown.join('')}`,
    prompt: `מסדרים מחדש את האותיות: ${showLetters(shown)}\nאיזו מילה אפשר לבנות מהן?`,
    correct: word,
    distractors,
    explanation: `מסדרים את האותיות ${showLetters(shown)} ומקבלים ${word}. במילים האחרות יש אותיות אחרות.`,
  });
}

function hiddenWord(rng, level) {
  const [word, hidden] = rng.pick(HIDDEN_WORDS);
  const plain = lettersOf(word).join('');
  const ex = new Set([hidden]);
  const candidates = WORDS.filter((w) => {
    const l = lettersOf(w);
    if (l.length < 2 || l.length >= lettersOf(word).length) return false;
    return !plain.includes(l.join('')) && !isSubsequence(l, lettersOf(word));
  });
  // Prefer words that share a letter with the long word, so they look plausible.
  const near = candidates.filter((w) => lettersOf(w).some((ch) => plain.includes(ch)));
  const distractors = takeDistinct(rng, near.length >= 3 ? near : candidates, 3, ex);
  if (distractors.length < 3) return null;

  return buildQuestion(rng, {
    skillId: 'verbal.word_logic',
    level,
    key: `verbal.word_logic:hidden:${word}:${hidden}`,
    prompt: `איזו מילה מסתתרת בתוך המילה "${word}"?`,
    correct: hidden,
    distractors,
    explanation: `בתוך ${word} כתובה המילה ${hidden} – האותיות שלה באות ברצף, אחת אחרי השנייה.`,
  });
}

const SERIES_RULES = {
  sameFirst: (ws) => ws.every((w) => firstLetter(w) === firstLetter(ws[0])),
  sameLast: (ws) => ws.every((w) => lastLetter(w) === lastLetter(ws[0])),
  alphabet: (ws) => ws.every((w, i) => i === 0
    || ALEF_BET.indexOf(firstLetter(w)) === ALEF_BET.indexOf(firstLetter(ws[i - 1])) + 1),
  lengthUp: (ws) => ws.every((w, i) => i === 0 || letterCount(w) === letterCount(ws[i - 1]) + 1),
  chain: (ws) => ws.every((w, i) => i === 0 || firstLetter(w) === lastLetter(ws[i - 1])),
};

function buildSeries(rng, rule) {
  const pick = (pred) => {
    const pool = WORDS.filter(pred);
    return pool.length ? rng.pick(pool) : null;
  };
  if (rule === 'sameFirst' || rule === 'sameLast') {
    const get = rule === 'sameFirst' ? firstLetter : lastLetter;
    const letter = get(rng.pick(WORDS));
    const pool = WORDS.filter((w) => get(w) === letter);
    if (pool.length < 4) return null;
    return rng.sample(pool, 4);
  }
  if (rule === 'alphabet') {
    const start = rng.int(0, ALEF_BET.length - 4);
    const words = [0, 1, 2, 3].map((i) => pick((w) => firstLetter(w) === ALEF_BET[start + i]));
    return words.every(Boolean) ? words : null;
  }
  if (rule === 'lengthUp') {
    const base = rng.int(2, 3);
    const words = [0, 1, 2, 3].map((i) => pick((w) => letterCount(w) === base + i));
    return words.every(Boolean) ? words : null;
  }
  const words = [rng.pick(WORDS)];
  while (words.length < 4) {
    const prev = words[words.length - 1];
    const next = pick((w) => firstLetter(w) === lastLetter(prev) && !words.includes(w));
    if (!next) return null;
    words.push(next);
  }
  return words;
}

function seriesExplanation(rule, series, answer) {
  const all = [...series, answer];
  switch (rule) {
    case 'sameFirst':
      return `כל המילים מתחילות באות ${firstLetter(answer)}, וגם ${answer}.`;
    case 'sameLast':
      return `כל המילים נגמרות באות ${answer.slice(-1)}, וגם ${answer}.`;
    case 'alphabet':
      return `האות הראשונה של כל מילה באה לפי סדר האלף-בית: ${all.map(firstLetter).join(', ')}.`;
    case 'lengthUp':
      return `בכל מילה יש אות אחת יותר מאשר במילה הקודמת: ${all.map(letterCount).join(', ')} אותיות.`;
    default: {
      const endChar = [...series[2]].filter((ch) => ch >= 'א' && ch <= 'ת').pop();
      const startChar = firstLetter(answer);
      const same = endChar === startChar ? '' : ' – זאת אותה אות, רק בצורה סופית';
      return `כל מילה מתחילה באות שבה נגמרה המילה הקודמת. המילה ${series[2]} נגמרת באות ${endChar}, והמילה ${answer} מתחילה באות ${startChar}${same}.`;
    }
  }
}

function wordSeries(rng, level) {
  const rules = [
    ['sameFirst'],
    ['sameFirst', 'alphabet'],
    ['alphabet', 'lengthUp', 'sameLast'],
    ['alphabet', 'lengthUp', 'chain', 'sameLast'],
    ['lengthUp', 'chain'],
  ][level - 1];
  const rule = rng.pick(rules);
  const words = buildSeries(rng, rule);
  if (!words || new Set(words).size !== 4) return null;
  const series = words.slice(0, 3);
  const answer = words[3];
  const otherRules = Object.keys(SERIES_RULES).filter((r) => r !== rule);
  if (otherRules.some((r) => SERIES_RULES[r](series))) return null;
  if (!SERIES_RULES[rule](words)) return null;

  const ex = new Set(words);
  const wrong = WORDS.filter((w) => !ex.has(w) && !SERIES_RULES[rule]([...series, w]));
  const distractors = takeDistinct(rng, wrong, 3, ex);
  if (distractors.length < 3) return null;

  return buildQuestion(rng, {
    skillId: 'verbal.word_logic',
    level,
    key: `verbal.word_logic:series:${rule}:${series.join(',')}>${answer}`,
    prompt: `איזו מילה ממשיכה את הסדרה?\n${series.join(', ')}, ?`,
    correct: answer,
    distractors,
    explanation: seriesExplanation(rule, series, answer),
  });
}

function readBackwards(rng, level) {
  const pool = WORDS.filter((w) => letterCount(w) >= 3 && letterCount(w) <= 5);
  const word = rng.pick(pool);
  const letters = lettersOf(word);
  const reversed = [...letters].reverse();
  if (reversed.join('') === letters.join('') || WORD_SET.has(reversed.join(''))) return null;

  const ex = new Set([word]);
  const similar = pool.filter((w) => letterCount(w) === letters.length
    && lettersOf(w).join('') !== letters.join('')
    && lettersOf(w).some((ch) => letters.includes(ch)));
  const distractors = takeDistinct(rng, similar, 3, ex);
  if (distractors.length < 3) return null;

  return buildQuestion(rng, {
    skillId: 'verbal.word_logic',
    level,
    key: `verbal.word_logic:reverse:${word}`,
    prompt: `קוראים את האותיות מהסוף להתחלה: ${showLetters(reversed)}\nאיזו מילה מתקבלת?`,
    correct: word,
    distractors,
    explanation: `מהסוף להתחלה: ${showLetters(letters)} – ${word}.`,
  });
}

const WORD_LOGIC_MIX = [
  [[riddle, 0.6], [wordSeries, 0.25], [anagram, 0.15]],
  [[riddle, 0.45], [anagram, 0.2], [wordSeries, 0.2], [hiddenWord, 0.15]],
  [[riddle, 0.35], [anagram, 0.2], [hiddenWord, 0.2], [wordSeries, 0.25]],
  [[riddle, 0.3], [anagram, 0.2], [hiddenWord, 0.2], [wordSeries, 0.2], [readBackwards, 0.1]],
  [[riddle, 0.3], [anagram, 0.2], [hiddenWord, 0.15], [wordSeries, 0.2], [readBackwards, 0.15]],
];

function wordLogicAttempt(rng, level) {
  let roll = rng();
  for (const [make, share] of WORD_LOGIC_MIX[level - 1]) {
    if (roll < share) return make(rng, level);
    roll -= share;
  }
  return riddle(rng, level);
}

/* ------------------------------------------------------------------ */

function skill(id, name, attempt) {
  return {
    id,
    name,
    minLevel: 1,
    maxLevel: 5,
    generate(rng, level) {
      const lvl = Math.min(Math.max(Math.round(level) || 1, 1), 5);
      return generateWithRetry(id, rng, lvl, attempt);
    },
  };
}

export default {
  id: 'verbal',
  name: 'שפה והבנה',
  icon: '📚',
  skills: [
    skill('verbal.analogies', 'אנלוגיות מילוליות', analogyAttempt),
    skill('verbal.odd_one_out', 'יוצא דופן', oddOneOutAttempt),
    skill('verbal.opposites_synonyms', 'הפכים ומילים נרדפות', oppositesSynonymsAttempt),
    skill('verbal.sentence_completion', 'השלמת משפט', sentenceAttempt),
    skill('verbal.reading', 'הבנת הנקרא', readingAttempt),
    skill('verbal.word_logic', 'חשיבה מילולית', wordLogicAttempt),
  ],
};
