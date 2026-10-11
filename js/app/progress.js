// Adaptive progress engine for one child: per-skill stats, level adaptation,
// skill picking, question freshness, mistake re-queueing, points, streaks and
// badges. Pure logic - no DOM. Persistence and clock are injected so node
// tests can run it; profiles.js owns loading and saving.

import { createRng } from '../core/random.js';
import { checkQuestion } from './contract.js';

export const SCHEMA_VERSION = 1;
export const EXPORT_APP_ID = 'gifted-prep';

export const MIN_LEVEL = 1;
export const MAX_LEVEL = 5;
export const START_LEVEL = 2;
export const RECENT_WINDOW = 20;
export const LEVEL_UP_WINDOW = 5;
export const LEVEL_UP_NEEDED = 4;
export const LEVEL_DOWN_MISSES = 3;
export const SEEN_CAP = 3000;
export const FRESH_TRIES = 12;
export const RETRY_QUEUE_CAP = 40;
export const RETRY_VARIANT_DELAY = 3;
export const RETRY_EXACT_DELAY = 6;
export const MASTERY_HALF_LIFE_DAYS = 30;
export const MASTERED_THRESHOLD = 0.8;
export const MASTERED_MIN_ATTEMPTS = 10;
export const HISTORY_DAYS_KEPT = 400;
export const TEST_HISTORY_KEPT = 60;
export const GENDERS = Object.freeze(['boy', 'girl']);

const DAY_MS = 24 * 60 * 60 * 1000;

export const DEFAULT_SETTINGS = Object.freeze({
  name: '',
  gender: 'boy',
  sessionLength: 10,
  examLength: 15,
  timedDefault: false,
  timerSeconds: 45,
  sound: true,
});

export const SETTING_LIMITS = Object.freeze({
  sessionLength: [5, 30],
  examLength: [5, 40],
  timerSeconds: [15, 120],
});

// ---------------------------------------------------------------- dates

export function dayKey(ts) {
  const d = new Date(ts);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function previousDayKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  const date = new Date(y, m - 1, d, 12);
  date.setDate(date.getDate() - 1);
  return dayKey(date.getTime());
}

function clamp(v, lo, hi) {
  return Math.min(hi, Math.max(lo, v));
}

// Child-facing text is either one neutral string or a [masculine, feminine] pair.
export function genderText(text, gender) {
  if (!Array.isArray(text)) return text;
  return gender === 'girl' ? text[1] : text[0];
}

// ---------------------------------------------------------------- state

export function defaultState(now = Date.now()) {
  return {
    version: SCHEMA_VERSION,
    createdAt: now,
    settings: { ...DEFAULT_SETTINGS },
    skills: {},
    seen: [],
    retryQueue: [],
    counter: 0,
    points: 0,
    totals: {
      attempts: 0,
      correct: 0,
      run: 0,
      bestRun: 0,
      fastCorrect: 0,
      retriesFixed: 0,
      sessions: 0,
      perfectSessions: 0,
      exams: 0,
    },
    days: {},
    badges: {},
    testHistory: [],
  };
}

function newSkillState() {
  return {
    attempts: 0,
    correct: 0,
    level: START_LEVEL,
    ewma: 0.5,
    recent: [],
    atLevel: [],
    missStreak: 0,
    lastPracticed: 0,
    timeTotalMs: 0,
    timeCount: 0,
  };
}

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

// Fills missing fields with defaults and drops garbage, so an old or
// hand-edited save never crashes the app.
export function normalizeState(raw, now = Date.now()) {
  const base = defaultState(now);
  if (!isObj(raw)) return base;

  const settings = { ...DEFAULT_SETTINGS };
  if (isObj(raw.settings)) {
    const s = raw.settings;
    if (typeof s.name === 'string' && s.name.trim()) settings.name = s.name.trim().slice(0, 30);
    if (GENDERS.includes(s.gender)) settings.gender = s.gender;
    for (const [k, [lo, hi]] of Object.entries(SETTING_LIMITS)) {
      settings[k] = clamp(Math.round(num(s[k], settings[k])), lo, hi);
    }
    if (typeof s.timedDefault === 'boolean') settings.timedDefault = s.timedDefault;
    if (typeof s.sound === 'boolean') settings.sound = s.sound;
  }

  const skills = {};
  if (isObj(raw.skills)) {
    for (const [id, s] of Object.entries(raw.skills)) {
      if (!isObj(s)) continue;
      const st = newSkillState();
      st.attempts = Math.max(0, num(s.attempts, 0));
      st.correct = clamp(num(s.correct, 0), 0, st.attempts);
      st.level = clamp(Math.round(num(s.level, START_LEVEL)), MIN_LEVEL, MAX_LEVEL);
      st.ewma = clamp(num(s.ewma, 0.5), 0, 1);
      st.recent = Array.isArray(s.recent) ? s.recent.filter(isObj).slice(-RECENT_WINDOW) : [];
      st.atLevel = Array.isArray(s.atLevel) ? s.atLevel.map((x) => (x ? 1 : 0)).slice(-LEVEL_UP_WINDOW) : [];
      st.missStreak = Math.max(0, num(s.missStreak, 0));
      st.lastPracticed = num(s.lastPracticed, 0);
      st.timeTotalMs = Math.max(0, num(s.timeTotalMs, 0));
      st.timeCount = Math.max(0, num(s.timeCount, 0));
      skills[id] = st;
    }
  }

  const totals = { ...base.totals };
  if (isObj(raw.totals)) {
    for (const k of Object.keys(totals)) totals[k] = Math.max(0, num(raw.totals[k], 0));
  }

  const days = {};
  if (isObj(raw.days)) {
    for (const [k, d] of Object.entries(raw.days)) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(k) || !isObj(d)) continue;
      days[k] = {
        attempts: Math.max(0, num(d.attempts, 0)),
        correct: Math.max(0, num(d.correct, 0)),
        points: Math.max(0, num(d.points, 0)),
      };
    }
  }

  const badges = {};
  if (isObj(raw.badges)) {
    for (const [k, v] of Object.entries(raw.badges)) badges[k] = num(v, now);
  }

  const seen = Array.isArray(raw.seen)
    ? raw.seen.filter((x) => Array.isArray(x) && typeof x[0] === 'string').map((x) => [x[0], num(x[1], 0)])
    : [];

  const testHistory = Array.isArray(raw.testHistory)
    ? raw.testHistory.filter(isObj).map(normalizeTestEntry).filter(Boolean).slice(-TEST_HISTORY_KEPT)
    : [];

  const retryQueue = Array.isArray(raw.retryQueue)
    ? raw.retryQueue.filter((r) => isObj(r) && typeof r.skillId === 'string').slice(-RETRY_QUEUE_CAP)
    : [];

  return {
    version: SCHEMA_VERSION,
    createdAt: num(raw.createdAt, now),
    settings,
    skills,
    seen: seen.slice(-SEEN_CAP),
    retryQueue,
    counter: Math.max(0, num(raw.counter, 0)),
    points: Math.max(0, num(raw.points, 0)),
    totals,
    days,
    badges,
    testHistory,
  };
}

function normalizeTestEntry(e) {
  const total = Math.max(0, Math.round(num(e.total, 0)));
  if (!total) return null;
  const topics = {};
  if (isObj(e.topics)) {
    for (const [id, t] of Object.entries(e.topics)) {
      if (!isObj(t)) continue;
      const tt = Math.max(0, Math.round(num(t.total, 0)));
      topics[id] = { total: tt, correct: clamp(Math.round(num(t.correct, 0)), 0, tt) };
    }
  }
  const correct = clamp(Math.round(num(e.correct, 0)), 0, total);
  return {
    at: num(e.at, 0),
    total,
    correct,
    timedOut: clamp(Math.round(num(e.timedOut, 0)), 0, total - correct),
    timeMs: Math.max(0, num(e.timeMs, 0)),
    topics,
  };
}

// ---------------------------------------------------------------- badges

// `test(p)` gets the Progress instance; badges are checked after every answer
// and at the end of every session, and once earned are never taken away.
export function badgeDefinitions(topics) {
  const list = [
    { id: 'first_correct', icon: '🌱', name: 'צעד ראשון', desc: 'תשובה נכונה ראשונה',
      test: (p) => p.state.totals.correct >= 1 },
    { id: 'correct_10', icon: '⭐', name: '10 נכונות', desc: '10 תשובות נכונות',
      test: (p) => p.state.totals.correct >= 10 },
    { id: 'correct_50', icon: '🌟', name: '50 נכונות', desc: '50 תשובות נכונות',
      test: (p) => p.state.totals.correct >= 50 },
    { id: 'correct_200', icon: '💫', name: '200 נכונות', desc: '200 תשובות נכונות',
      test: (p) => p.state.totals.correct >= 200 },
    { id: 'correct_500', icon: '🏆', name: '500 נכונות', desc: '500 תשובות נכונות',
      test: (p) => p.state.totals.correct >= 500 },
    { id: 'run_5', icon: '🔥', name: '5 ברצף', desc: '5 תשובות נכונות ברצף',
      test: (p) => p.state.totals.bestRun >= 5 },
    { id: 'run_10', icon: '🚀', name: '10 ברצף', desc: '10 תשובות נכונות ברצף',
      test: (p) => p.state.totals.bestRun >= 10 },
    { id: 'learned_mistake', icon: '🧠', name: ['לומד מטעויות', 'לומדת מטעויות'], desc: 'פתרת נכון שאלה שטעית בה קודם',
      test: (p) => p.state.totals.retriesFixed >= 1 },
    { id: 'learned_mistake_10', icon: '🦉', name: ['חכם כמו ינשוף', 'חכמה כמו ינשוף'], desc: '10 פעמים פתרת נכון אחרי טעות',
      test: (p) => p.state.totals.retriesFixed >= 10 },
    { id: 'level_5', icon: '🧗', name: 'לפסגה', desc: 'הגעת לרמה 5 בנושא כלשהו',
      test: (p) => Object.values(p.state.skills).some((s) => s.level >= 5) },
    { id: 'master_1', icon: '🎓', name: ['אלוף מיומנות', 'אלופת מיומנות'], desc: 'שלטת היטב במיומנות אחת',
      test: (p) => p.masteredSkillIds().length >= 1 },
    { id: 'master_5', icon: '👑', name: ['אלוף על', 'אלופת על'], desc: 'שלטת היטב ב-5 מיומנויות',
      test: (p) => p.masteredSkillIds().length >= 5 },
    { id: 'streak_3', icon: '📅', name: '3 ימים ברצף', desc: 'תרגלת 3 ימים ברצף',
      test: (p) => p.streak() >= 3 },
    { id: 'streak_7', icon: '🗓️', name: 'שבוע שלם', desc: 'תרגלת 7 ימים ברצף',
      test: (p) => p.streak() >= 7 },
    { id: 'streak_30', icon: '🏅', name: ['חודש של אלופים', 'חודש של אלופות'], desc: 'תרגלת 30 ימים ברצף',
      test: (p) => p.streak() >= 30 },
    { id: 'fast_5', icon: '⚡', name: 'ברק', desc: '5 תשובות נכונות ומהירות במבחן לדוגמה',
      test: (p) => p.state.totals.fastCorrect >= 5 },
    { id: 'perfect_session', icon: '💯', name: 'מושלם', desc: 'סיבוב שלם בלי אף טעות',
      test: (p) => p.state.totals.perfectSessions >= 1 },
    { id: 'first_exam', icon: '⏱️', name: 'מבחן ראשון', desc: 'סיימת מבחן לדוגמה ראשון',
      test: (p) => p.state.totals.exams >= 1 },
    { id: 'points_1000', icon: '💎', name: '1000 נקודות', desc: 'צברת 1000 נקודות',
      test: (p) => p.state.points >= 1000 },
  ];

  for (const topic of topics) {
    list.push({
      id: `explore_${topic.id}`, icon: topic.icon, name: [`חוקר ${topic.name}`, `חוקרת ${topic.name}`],
      desc: `ענית על שאלה בנושא ${topic.name}`,
      test: (p) => topic.skills.some((s) => (p.state.skills[s.id]?.attempts ?? 0) > 0),
    });
  }
  if (topics.length > 1) {
    list.push({
      id: 'explorer_all', icon: '🧭', name: ['חוקר גדול', 'חוקרת גדולה'], desc: 'ניסית את כל הנושאים',
      test: (p) => topics.every((t) => t.skills.some((s) => (p.state.skills[s.id]?.attempts ?? 0) > 0)),
    });
  }
  return list;
}

// ---------------------------------------------------------------- engine

export class Progress {
  // `persist(state)` saves the state and returns true on success.
  constructor({ topics = [], persist = null, now = () => Date.now(), state = null } = {}) {
    this.topics = topics;
    this.persist = persist;
    this.now = now;
    this.brokenSkills = new Set();
    this.lastError = null;
    this.state = state ? normalizeState(state, now()) : defaultState(now());
    this._rebuildSeen();
    this.badges = badgeDefinitions(topics);

    this.skillById = new Map();
    this.topicBySkill = new Map();
    for (const t of topics) {
      for (const s of t.skills) {
        this.skillById.set(s.id, s);
        this.topicBySkill.set(s.id, t);
      }
    }
  }

  // ---- persistence

  // The state with the seen-question LRU written back into it.
  snapshot() {
    this.state.seen = [...this.seenMap.entries()];
    return this.state;
  }

  save() {
    this.snapshot();
    if (!this.persist) return false;
    try {
      return this.persist(this.state);
    } catch (err) {
      this.lastError = `save failed: ${err}`;
      return false;
    }
  }

  _rebuildSeen() {
    this.seenMap = new Map();
    const sorted = [...this.state.seen].sort((a, b) => a[1] - b[1]);
    for (const [key, stamp] of sorted) this.seenMap.set(key, stamp);
  }

  reset({ keepSettings = true } = {}) {
    const settings = this.state.settings;
    this.state = defaultState(this.now());
    if (keepSettings) this.state.settings = settings;
    this._rebuildSeen();
    this.save();
  }

  // ---- settings

  get settings() {
    return this.state.settings;
  }

  updateSettings(patch) {
    const merged = normalizeState({ ...this.state, settings: { ...this.state.settings, ...patch } }, this.now());
    this.state.settings = merged.settings;
    this.save();
    return this.state.settings;
  }

  // ---- per-skill views

  skillState(skillId) {
    if (!this.state.skills[skillId]) this.state.skills[skillId] = newSkillState();
    const st = this.state.skills[skillId];
    const skill = this.skillById.get(skillId);
    if (skill) st.level = clamp(st.level, skill.minLevel ?? MIN_LEVEL, skill.maxLevel ?? MAX_LEVEL);
    return st;
  }

  peekSkillState(skillId) {
    return this.state.skills[skillId] ?? null;
  }

  levelFor(skill) {
    const st = this.peekSkillState(skill.id);
    const level = st ? st.level : START_LEVEL;
    return clamp(level, skill.minLevel ?? MIN_LEVEL, skill.maxLevel ?? MAX_LEVEL);
  }

  daysSince(ts) {
    if (!ts) return Infinity;
    return Math.max(0, (this.now() - ts) / DAY_MS);
  }

  // 0..1. Combines recent accuracy (EWMA) with the level reached, and fades
  // slowly when the skill has not been practiced (forgetting curve, floored at half).
  mastery(skillId) {
    const st = this.peekSkillState(skillId);
    if (!st || st.attempts === 0) return 0;
    const raw = 0.6 * st.ewma + 0.4 * ((st.level - MIN_LEVEL) / (MAX_LEVEL - MIN_LEVEL));
    const retention = Math.pow(0.5, this.daysSince(st.lastPracticed) / MASTERY_HALF_LIFE_DAYS);
    return clamp(raw * (0.5 + 0.5 * retention), 0, 1);
  }

  isMastered(skillId) {
    const st = this.peekSkillState(skillId);
    return !!st && st.attempts >= MASTERED_MIN_ATTEMPTS && st.level >= 4 && this.mastery(skillId) >= MASTERED_THRESHOLD;
  }

  masteredSkillIds() {
    return Object.keys(this.state.skills).filter((id) => this.isMastered(id));
  }

  skillSummary(skill) {
    const st = this.peekSkillState(skill.id);
    return {
      id: skill.id,
      name: skill.name,
      topicId: this.topicBySkill.get(skill.id)?.id ?? null,
      attempts: st?.attempts ?? 0,
      correct: st?.correct ?? 0,
      accuracy: st && st.attempts ? st.correct / st.attempts : null,
      level: this.levelFor(skill),
      mastery: this.mastery(skill.id),
      lastPracticed: st?.lastPracticed ?? 0,
      avgTimeMs: st && st.timeCount ? st.timeTotalMs / st.timeCount : null,
      recentAccuracy: st && st.recent.length ? st.recent.filter((r) => r.c).length / st.recent.length : null,
    };
  }

  topicSummary(topic) {
    const skills = topic.skills.map((s) => this.skillSummary(s));
    const attempts = skills.reduce((a, s) => a + s.attempts, 0);
    const correct = skills.reduce((a, s) => a + s.correct, 0);
    const mastery = skills.length ? skills.reduce((a, s) => a + s.mastery, 0) / skills.length : 0;
    return { id: topic.id, name: topic.name, icon: topic.icon, attempts, correct,
      accuracy: attempts ? correct / attempts : null, mastery, skills };
  }

  // Practiced skills with the lowest mastery first.
  weakestSkills(n = 3) {
    const practiced = [];
    for (const t of this.topics) {
      for (const s of t.skills) {
        const sum = this.skillSummary(s);
        if (sum.attempts > 0) practiced.push(sum);
      }
    }
    return practiced.sort((a, b) => a.mastery - b.mastery).slice(0, n);
  }

  // ---- streaks and history

  streak() {
    const days = this.state.days;
    let key = dayKey(this.now());
    if (!days[key]?.attempts) key = previousDayKey(key);
    let count = 0;
    while (days[key]?.attempts) {
      count++;
      key = previousDayKey(key);
    }
    return count;
  }

  practicedToday() {
    return !!this.state.days[dayKey(this.now())]?.attempts;
  }

  // Oldest first: [{ day, attempts, correct, points }] for the last `n` days.
  history(n = 14) {
    const out = [];
    let key = dayKey(this.now());
    for (let i = 0; i < n; i++) {
      const d = this.state.days[key];
      out.push({ day: key, attempts: d?.attempts ?? 0, correct: d?.correct ?? 0, points: d?.points ?? 0 });
      key = previousDayKey(key);
    }
    return out.reverse();
  }

  // ---- skill picking

  _skillWeight(skill) {
    const st = this.peekSkillState(skill.id);
    const weakness = 1 - this.mastery(skill.id);
    const staleness = st && st.attempts ? Math.min(1, this.daysSince(st.lastPracticed) / 5) : 1;
    return 0.2 + 1.0 * weakness + 0.8 * staleness;
  }

  _usableSkills(topic) {
    return topic.skills.filter((s) => !this.brokenSkills.has(s.id));
  }

  // Two-stage weighted pick: topic first (so a topic with many skills does not
  // crowd out the others), then skill. `sessionTopicCounts` spreads a session
  // across topics, `recentSkillIds` (most recent last) avoids repeating a skill.
  pickSkill({ rng, focusTopicId = null, focusSkillId = null, recentSkillIds = [], sessionTopicCounts = {} } = {}) {
    const r = rng ?? createRng(this.now());
    if (focusSkillId) {
      const only = this.skillById.get(focusSkillId);
      return only && !this.brokenSkills.has(only.id) ? only : null;
    }
    const topics = this.topics
      .filter((t) => !focusTopicId || t.id === focusTopicId)
      .filter((t) => this._usableSkills(t).length > 0);
    if (!topics.length) return null;

    const recentPenalty = (id) => {
      const idx = recentSkillIds.lastIndexOf(id);
      if (idx < 0) return 1;
      const age = recentSkillIds.length - idx;
      if (age === 1) return 0.15;
      if (age <= 3) return 0.5;
      return 1;
    };

    const topicWeights = topics.map((t) => {
      const skills = this._usableSkills(t);
      const mean = skills.reduce((a, s) => a + this._skillWeight(s), 0) / skills.length;
      return mean / (1 + 0.8 * (sessionTopicCounts[t.id] ?? 0));
    });
    const topic = weightedPick(r, topics, topicWeights);
    const skills = this._usableSkills(topic);
    const weights = skills.map((s) => this._skillWeight(s) * recentPenalty(s.id));
    return weightedPick(r, skills, weights);
  }

  // ---- question generation

  _generate(skill, level, seed) {
    let q;
    try {
      q = skill.generate(createRng(seed), level);
    } catch (err) {
      this.lastError = `${skill.id} L${level} seed ${seed}: ${err}`;
      return null;
    }
    const problems = checkQuestion(q, skill.id);
    if (problems.length) {
      this.lastError = `${skill.id} L${level} seed ${seed}: ${problems.join('; ')}`;
      return null;
    }
    return { ...q, level, seed };
  }

  // Tries several seeds to find a question whose key was not seen recently.
  // Falls back to the least recently seen candidate if the key space is exhausted.
  generateFresh(skill, level, rng) {
    let best = null;
    let bestStamp = Infinity;
    let failures = 0;
    for (let i = 0; i < FRESH_TRIES; i++) {
      const seed = rng.int(1, 0x7fffffff);
      const q = this._generate(skill, level, seed);
      if (!q) {
        failures++;
        continue;
      }
      const stamp = this.seenMap.get(q.key);
      if (stamp === undefined) return q;
      if (stamp < bestStamp) {
        best = q;
        bestStamp = stamp;
      }
    }
    if (!best && failures === FRESH_TRIES) this.brokenSkills.add(skill.id);
    return best;
  }

  _takeDueRetry(focusTopicId, focusSkillId) {
    const q = this.state.retryQueue;
    const idx = q.findIndex((item) => item.dueAt <= this.state.counter
      && this.skillById.has(item.skillId)
      && (!focusSkillId || item.skillId === focusSkillId)
      && (!focusTopicId || this.topicBySkill.get(item.skillId)?.id === focusTopicId));
    if (idx < 0) return null;
    return q.splice(idx, 1)[0];
  }

  _questionFromRetry(item, rng) {
    const skill = this.skillById.get(item.skillId);
    if (!skill || this.brokenSkills.has(skill.id)) return null;
    if (item.kind === 'exact') {
      const q = this._generate(skill, item.level, item.seed);
      // A generator change can make an old seed produce a different question;
      // then fall through to a fresh variant instead.
      if (q && q.key === item.key) return { ...q, retryKind: 'exact' };
    }
    const q = this.generateFresh(skill, this.levelFor(skill), rng);
    return q ? { ...q, retryKind: 'variant' } : null;
  }

  // Next question for a session. Due mistake retries come first (practice
  // mode only), otherwise a weighted skill pick with a fresh question.
  nextQuestion({ rng, focusTopicId = null, focusSkillId = null, recentSkillIds = [], sessionTopicCounts = {},
    useRetries = true } = {}) {
    const r = rng ?? createRng(this.now());
    let q = null;

    while (useRetries && !q) {
      const item = this._takeDueRetry(focusTopicId, focusSkillId);
      if (!item) break;
      q = this._questionFromRetry(item, r);
    }

    for (let attempt = 0; !q && attempt < 8; attempt++) {
      const skill = this.pickSkill({ rng: r, focusTopicId, focusSkillId, recentSkillIds, sessionTopicCounts });
      if (!skill) break;
      q = this.generateFresh(skill, this.levelFor(skill), r);
      if (q) q.retryKind = null;
    }

    if (q) {
      this.state.counter++;
      this.markSeen(q.key);
    }
    return q;
  }

  markSeen(key) {
    this.seenMap.delete(key);
    this.seenMap.set(key, this.state.counter);
    while (this.seenMap.size > SEEN_CAP) {
      this.seenMap.delete(this.seenMap.keys().next().value);
    }
  }

  wasSeen(key) {
    return this.seenMap.has(key);
  }

  _enqueueRetries(question, delay = 0) {
    const queue = this.state.retryQueue;
    const base = { skillId: question.skillId, level: question.level, seed: question.seed, key: question.key };
    queue.push({ ...base, kind: 'variant', dueAt: this.state.counter + RETRY_VARIANT_DELAY + delay });
    queue.push({ ...base, kind: 'exact', dueAt: this.state.counter + RETRY_EXACT_DELAY + delay });
    while (queue.length > RETRY_QUEUE_CAP) queue.shift();
  }

  // ---- answering

  static pointsFor({ level, correct, timedOut, timeMs, timeLimitMs, run, retryKind }) {
    if (!correct || timedOut) return { base: 0, speed: 0, run: 0, retry: 0, total: 0 };
    const base = 10 + 5 * (level - 1);
    const speed = timeLimitMs ? Math.round(10 * clamp(1 - timeMs / timeLimitMs, 0, 1)) : 0;
    const runBonus = run > 0 && run % 5 === 0 ? 10 : 0;
    const retry = retryKind ? 5 : 0;
    return { base, speed, run: runBonus, retry, total: base + speed + runBonus + retry };
  }

  // Records one answer. `timeLimitMs` is set only in timed mode. `requeue: false`
  // is used by the test simulation, which re-queues its mistakes in finishTest.
  // Returns what the UI needs for feedback.
  recordAnswer(question, { correct, timeMs = 0, timedOut = false, timeLimitMs = 0, requeue = true } = {}) {
    const ok = !!correct && !timedOut;
    const now = this.now();
    const st = this.skillState(question.skillId);
    const totals = this.state.totals;
    const levelBefore = st.level;

    st.attempts++;
    totals.attempts++;
    if (ok) {
      st.correct++;
      totals.correct++;
      totals.run++;
      totals.bestRun = Math.max(totals.bestRun, totals.run);
    } else {
      totals.run = 0;
    }

    const alpha = Math.max(0.15, 1 / (st.attempts + 1));
    st.ewma = st.ewma + alpha * ((ok ? 1 : 0) - st.ewma);
    st.lastPracticed = now;
    if (!timedOut && timeMs > 0) {
      st.timeTotalMs += timeMs;
      st.timeCount++;
    }
    st.recent.push({ c: ok ? 1 : 0, l: question.level, ms: Math.round(timeMs), at: now });
    if (st.recent.length > RECENT_WINDOW) st.recent.splice(0, st.recent.length - RECENT_WINDOW);

    // Exact retries repeat a question he has already seen with its answer, so
    // they must not push the level up.
    if (question.retryKind !== 'exact' && question.level === st.level) this._adaptLevel(st, ok, question.skillId);

    const timedFast = ok && timeLimitMs > 0 && timeMs <= timeLimitMs / 2;
    if (timedFast) totals.fastCorrect++;
    const retryFixed = ok && !!question.retryKind;
    if (retryFixed) totals.retriesFixed++;
    if (!ok && !question.retryKind && requeue) this._enqueueRetries(question);

    const pts = Progress.pointsFor({ level: question.level, correct: ok, timedOut, timeMs, timeLimitMs,
      run: totals.run, retryKind: question.retryKind });
    this.state.points += pts.total;

    const dk = dayKey(now);
    const day = this.state.days[dk] ?? (this.state.days[dk] = { attempts: 0, correct: 0, points: 0 });
    day.attempts++;
    if (ok) day.correct++;
    day.points += pts.total;
    this._pruneDays();

    const newBadges = this._awardBadges();
    this.save();
    return {
      correct: ok,
      timedOut,
      points: pts,
      run: totals.run,
      levelBefore,
      levelAfter: st.level,
      newBadges,
    };
  }

  _adaptLevel(st, ok, skillId) {
    const skill = this.skillById.get(skillId);
    const lo = Math.max(MIN_LEVEL, skill?.minLevel ?? MIN_LEVEL);
    const hi = Math.min(MAX_LEVEL, skill?.maxLevel ?? MAX_LEVEL);

    st.atLevel.push(ok ? 1 : 0);
    if (st.atLevel.length > LEVEL_UP_WINDOW) st.atLevel.shift();
    st.missStreak = ok ? 0 : st.missStreak + 1;

    const hits = st.atLevel.reduce((a, b) => a + b, 0);
    if (hits >= LEVEL_UP_NEEDED && st.level < hi) {
      st.level++;
      st.atLevel = [];
      st.missStreak = 0;
    } else if (st.missStreak >= LEVEL_DOWN_MISSES && st.level > lo) {
      st.level--;
      st.atLevel = [];
      st.missStreak = 0;
    }
  }

  _pruneDays() {
    const keys = Object.keys(this.state.days);
    if (keys.length <= HISTORY_DAYS_KEPT) return;
    keys.sort();
    for (const k of keys.slice(0, keys.length - HISTORY_DAYS_KEPT)) delete this.state.days[k];
  }

  _awardBadges() {
    const fresh = [];
    for (const b of this.badges) {
      if (this.state.badges[b.id]) continue;
      let earned = false;
      try {
        earned = b.test(this);
      } catch {
        earned = false;
      }
      if (earned) {
        this.state.badges[b.id] = this.now();
        fresh.push(this._badgeView(b));
      }
    }
    return fresh;
  }

  _badgeView(b) {
    const g = this.settings.gender;
    return { id: b.id, icon: b.icon, name: genderText(b.name, g), desc: genderText(b.desc, g),
      earnedAt: this.state.badges[b.id] ?? null };
  }

  badgeList() {
    return this.badges.map((b) => this._badgeView(b));
  }

  // ---- sessions

  // `results` = [{ skillId, correct }]. Returns stars (1..3, effort always earns
  // one) and up to 2 skills to practice next (weakest among this session's).
  finishSession(results, { exam = false } = {}) {
    const total = results.length;
    const correct = results.filter((r) => r.correct).length;
    const ratio = total ? correct / total : 0;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.7 ? 2 : 1;

    if (total > 0) {
      this.state.totals.sessions++;
      if (exam) this.state.totals.exams++;
      if (correct === total && total >= 5) this.state.totals.perfectSessions++;
    }

    const missedSkills = [...new Set(results.filter((r) => !r.correct).map((r) => r.skillId))];
    const pool = missedSkills.length ? missedSkills : [...new Set(results.map((r) => r.skillId))];
    const suggestions = pool
      .map((id) => this.skillById.get(id))
      .filter(Boolean)
      .map((s) => this.skillSummary(s))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 2);

    const newBadges = this._awardBadges();
    this.save();
    return { total, correct, stars, suggestions, newBadges };
  }

  // ---- test simulation

  // A fixed list of questions spread evenly over all topics (the remainder
  // goes to random topics), in shuffled order. No mistake retries.
  buildTest({ rng, length = this.settings.examLength } = {}) {
    const r = rng ?? createRng(this.now());
    const topicIds = r.shuffle(this.topics.filter((t) => this._usableSkills(t).length > 0).map((t) => t.id));
    if (!topicIds.length) return [];
    const slots = r.shuffle(Array.from({ length }, (_, i) => topicIds[i % topicIds.length]));
    const recentByTopic = {};
    const questions = [];
    for (const topicId of slots) {
      const recentSkillIds = recentByTopic[topicId] ?? (recentByTopic[topicId] = []);
      const q = this.nextQuestion({ rng: r, focusTopicId: topicId, recentSkillIds, useRetries: false })
        ?? this.nextQuestion({ rng: r, useRetries: false });
      if (!q) continue;
      recentSkillIds.push(q.skillId);
      questions.push(q);
    }
    return questions;
  }

  // `answers` = [{ question, correct, timedOut, timeMs }], already passed to
  // recordAnswer with `requeue: false`. Re-queues the mistakes for practice
  // (spread out so they do not all come back at once), stores a history entry
  // and closes the session.
  finishTest(answers) {
    const wrong = answers.filter((a) => !a.correct);
    wrong.forEach((a, i) => this._enqueueRetries(a.question, 2 * i));

    const topics = {};
    for (const a of answers) {
      const id = this.topicBySkill.get(a.question.skillId)?.id ?? 'other';
      const t = topics[id] ?? (topics[id] = { total: 0, correct: 0 });
      t.total++;
      if (a.correct) t.correct++;
    }
    const entry = {
      at: this.now(),
      total: answers.length,
      correct: answers.length - wrong.length,
      timedOut: wrong.filter((a) => a.timedOut).length,
      timeMs: Math.round(answers.reduce((sum, a) => sum + Math.max(0, a.timeMs ?? 0), 0)),
      topics,
    };
    if (entry.total) {
      this.state.testHistory.push(entry);
      if (this.state.testHistory.length > TEST_HISTORY_KEPT) this.state.testHistory.shift();
    }

    const base = this.finishSession(answers.map((a) => ({ skillId: a.question.skillId, correct: a.correct })),
      { exam: true });
    return { ...base, timedOut: entry.timedOut, timeMs: entry.timeMs, topics: this._topicBreakdown(topics) };
  }

  _topicBreakdown(topics) {
    return this.topics
      .filter((t) => topics[t.id])
      .map((t) => ({ id: t.id, name: t.name, icon: t.icon, ...topics[t.id] }));
  }

  // Oldest first, with topic names resolved for display.
  testHistory() {
    return this.state.testHistory.map((e) => ({ ...e, topicList: this._topicBreakdown(e.topics) }));
  }
}

function weightedPick(rng, items, weights) {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (!(sum > 0)) return items[Math.floor(rng() * items.length)];
  let x = rng() * sum;
  for (let i = 0; i < items.length; i++) {
    x -= weights[i];
    if (x < 0) return items[i];
  }
  return items[items.length - 1];
}
