// Unit tests for js/app/progress.js. Run: node tools/test_progress.mjs
// Uses fake topics and an in-memory localStorage shim, so it does not depend
// on the real generators.

import assert from 'node:assert/strict';
import {
  Progress, STORAGE_KEY, SEEN_CAP, START_LEVEL, RETRY_VARIANT_DELAY, RETRY_EXACT_DELAY, TEST_HISTORY_KEPT,
  dayKey, normalizeState, genderText,
} from '../js/app/progress.js';
import { PRAISE_ABILITY, PRAISE_EFFORT, ENCOURAGE, TIMEOUT, RETRY_NOTE, pick, pickPraise } from '../js/app/phrases.js';
import { createRng } from '../js/core/random.js';

class MemoryStorage {
  constructor() { this.map = new Map(); }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null; }
  setItem(k, v) { this.map.set(k, String(v)); }
  removeItem(k) { this.map.delete(k); }
}

class ThrowingStorage {
  getItem() { throw new Error('denied'); }
  setItem() { throw new Error('quota'); }
  removeItem() { throw new Error('denied'); }
}

// A skill whose key space is `space` questions per level.
function makeSkill(id, space = 100000) {
  return {
    id, name: `מיומנות ${id}`, minLevel: 1, maxLevel: 5,
    generate(rng, level) {
      const a = rng.int(0, space - 1);
      const choices = [{ text: `${a}` }, { text: `${a + 1}` }, { text: `${a + 2}` }, { text: `${a + 3}` }];
      return {
        key: `${id}:${level}:${a}`, skillId: id, level,
        prompt: `כמה זה ${a}?`, passage: null, visual: null,
        choices, answerIndex: 0, explanation: 'ככה פותרים.',
      };
    },
  };
}

function makeTopics() {
  return [
    { id: 'math', name: 'חשבון', icon: '🔢', skills: [makeSkill('math.a'), makeSkill('math.b'), makeSkill('math.c')] },
    { id: 'verbal', name: 'מילים', icon: '📖', skills: [makeSkill('verbal.a')] },
    { id: 'shapes', name: 'צורות', icon: '🔷', skills: [makeSkill('shapes.a'), makeSkill('shapes.tiny', 3)] },
  ];
}

function clock(start = new Date(2026, 9, 11, 17, 0).getTime()) {
  const c = { t: start };
  c.now = () => c.t;
  c.addDays = (d) => { c.t += d * 24 * 3600 * 1000; };
  return c;
}

function fresh(opts = {}) {
  const c = opts.clock ?? clock();
  const storage = opts.storage === undefined ? new MemoryStorage() : opts.storage;
  const p = new Progress({ topics: opts.topics ?? makeTopics(), storage, now: c.now });
  return { p, c, storage };
}

function fakeQuestion(skillId, level, extra = {}) {
  return { key: `${skillId}:${level}:${Math.random()}`, skillId, level, seed: 1, retryKind: null, ...extra };
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

test('starts with defaults and persists across reloads', () => {
  const { p, c, storage } = fresh();
  assert.equal(p.settings.name, '');
  assert.equal(p.settings.gender, 'boy');
  assert.equal(p.state.points, 0);
  p.recordAnswer(fakeQuestion('math.a', START_LEVEL), { correct: true, timeMs: 3000 });
  assert.ok(storage.getItem(STORAGE_KEY));
  const p2 = new Progress({ topics: makeTopics(), storage, now: c.now });
  assert.equal(p2.state.totals.correct, 1);
  assert.equal(p2.state.skills['math.a'].attempts, 1);
});

test('works in memory when storage throws', () => {
  const { p } = fresh({ storage: new ThrowingStorage() });
  const r = p.recordAnswer(fakeQuestion('math.a', START_LEVEL), { correct: true });
  assert.equal(r.correct, true);
  assert.equal(p.state.totals.correct, 1);
  assert.equal(p.save(), false);
});

test('level goes up after 4 of 5 correct, one step at a time', () => {
  const { p } = fresh();
  const st = () => p.state.skills['math.a'];
  for (let i = 0; i < 3; i++) p.recordAnswer(fakeQuestion('math.a', st()?.level ?? START_LEVEL), { correct: true });
  assert.equal(st().level, START_LEVEL);
  const r = p.recordAnswer(fakeQuestion('math.a', st().level), { correct: true });
  assert.equal(r.levelBefore, START_LEVEL);
  assert.equal(r.levelAfter, START_LEVEL + 1);
  // Window resets after a change: 3 more correct do not move it again.
  for (let i = 0; i < 3; i++) p.recordAnswer(fakeQuestion('math.a', st().level), { correct: true });
  assert.equal(st().level, START_LEVEL + 1);
});

test('4 of last 5 with a miss in between still levels up', () => {
  const { p } = fresh();
  const lv = () => p.state.skills['math.a']?.level ?? START_LEVEL;
  for (const ok of [true, false, true, true]) p.recordAnswer(fakeQuestion('math.a', lv()), { correct: ok });
  assert.equal(lv(), START_LEVEL);
  p.recordAnswer(fakeQuestion('math.a', lv()), { correct: true });
  assert.equal(lv(), START_LEVEL + 1);
});

test('level goes down after 3 misses in a row and never below 1 or above 5', () => {
  const { p } = fresh();
  const lv = () => p.state.skills['math.a']?.level ?? START_LEVEL;
  for (let i = 0; i < 2; i++) p.recordAnswer(fakeQuestion('math.a', lv()), { correct: false });
  assert.equal(lv(), START_LEVEL);
  p.recordAnswer(fakeQuestion('math.a', lv()), { correct: false });
  assert.equal(lv(), START_LEVEL - 1);
  for (let i = 0; i < 9; i++) p.recordAnswer(fakeQuestion('math.a', lv()), { correct: false });
  assert.equal(lv(), 1);
  for (let i = 0; i < 60; i++) p.recordAnswer(fakeQuestion('math.a', lv()), { correct: true });
  assert.equal(lv(), 5);
});

test('answers at a different level or exact retries do not move the level', () => {
  const { p } = fresh();
  const lv = () => p.state.skills['math.a']?.level ?? START_LEVEL;
  for (let i = 0; i < 6; i++) p.recordAnswer(fakeQuestion('math.a', 5), { correct: true });
  assert.equal(lv(), START_LEVEL);
  for (let i = 0; i < 6; i++) p.recordAnswer(fakeQuestion('math.a', lv(), { retryKind: 'exact' }), { correct: true });
  assert.equal(lv(), START_LEVEL);
});

test('timeout counts as a miss with zero points', () => {
  const { p } = fresh();
  const r = p.recordAnswer(fakeQuestion('math.a', 3), { correct: true, timedOut: true, timeMs: 45000, timeLimitMs: 45000 });
  assert.equal(r.correct, false);
  assert.equal(r.points.total, 0);
  assert.equal(p.state.totals.correct, 0);
  assert.equal(p.state.skills['math.a'].timeCount, 0);
});

test('points scale with level and speed bonus only in timed mode', () => {
  const l1 = Progress.pointsFor({ level: 1, correct: true, run: 1 });
  const l5 = Progress.pointsFor({ level: 5, correct: true, run: 1 });
  assert.ok(l5.total > l1.total);
  assert.equal(l1.speed, 0);
  const fast = Progress.pointsFor({ level: 3, correct: true, timeMs: 5000, timeLimitMs: 50000, run: 1 });
  const slow = Progress.pointsFor({ level: 3, correct: true, timeMs: 49000, timeLimitMs: 50000, run: 1 });
  assert.ok(fast.speed > slow.speed);
  assert.equal(Progress.pointsFor({ level: 3, correct: false }).total, 0);
  assert.equal(Progress.pointsFor({ level: 1, correct: true, run: 5 }).run, 10);
});

test('nextQuestion avoids recently seen keys', () => {
  const { p } = fresh();
  const rng = createRng(42);
  const keys = new Set();
  for (let i = 0; i < 300; i++) {
    const q = p.nextQuestion({ rng, focusTopicId: 'math' });
    assert.ok(q);
    assert.ok(!keys.has(q.key), `duplicate key ${q.key}`);
    keys.add(q.key);
    assert.equal(p.wasSeen(q.key), true);
  }
});

test('small key space still yields a question (least recently seen)', () => {
  const topics = [{ id: 't', name: 'ת', icon: 'x', skills: [makeSkill('t.tiny', 2)] }];
  const { p } = fresh({ topics });
  const rng = createRng(7);
  for (let i = 0; i < 20; i++) assert.ok(p.nextQuestion({ rng }));
});

test('seen LRU is capped and evicts the oldest', () => {
  const { p } = fresh();
  for (let i = 0; i < SEEN_CAP + 50; i++) p.markSeen(`k${i}`);
  assert.equal(p.seenMap.size, SEEN_CAP);
  assert.equal(p.wasSeen('k0'), false);
  assert.equal(p.wasSeen(`k${SEEN_CAP + 49}`), true);
  p.save();
  assert.ok(p.state.seen.length <= SEEN_CAP);
});

test('wrong answer re-queues a variant and the exact question once', () => {
  const topics = [{ id: 'm', name: 'ח', icon: 'x', skills: [makeSkill('m.a'), makeSkill('m.b')] }];
  const { p } = fresh({ topics });
  const rng = createRng(1);
  const wrong = p.nextQuestion({ rng });
  p.recordAnswer(wrong, { correct: false });
  assert.equal(p.state.retryQueue.length, 2);

  const served = [];
  for (let i = 0; i < RETRY_EXACT_DELAY + 2; i++) {
    const q = p.nextQuestion({ rng });
    served.push(q);
    p.recordAnswer(q, { correct: !q.retryKind ? true : false });
  }
  const variant = served.find((q) => q.retryKind === 'variant');
  const exact = served.find((q) => q.retryKind === 'exact');
  assert.ok(variant, 'variant served');
  assert.ok(exact, 'exact served');
  assert.equal(variant.skillId, wrong.skillId);
  assert.notEqual(variant.key, wrong.key);
  assert.equal(exact.key, wrong.key);
  assert.deepEqual(exact.choices, wrong.choices);
  assert.ok(served.indexOf(variant) >= RETRY_VARIANT_DELAY - 1);
  // Retries answered wrong are not re-queued again.
  assert.equal(p.state.retryQueue.length, 0);
});

test('retries are skipped when useRetries is false (exam mode)', () => {
  const { p } = fresh();
  const rng = createRng(3);
  const q = p.nextQuestion({ rng });
  p.recordAnswer(q, { correct: false });
  for (let i = 0; i < 10; i++) assert.equal(p.nextQuestion({ rng, useRetries: false }).retryKind, null);
  assert.equal(p.state.retryQueue.length, 2);
});

test('retry queue survives a reload (next session)', () => {
  const { p, c, storage } = fresh();
  const rng = createRng(5);
  const q = p.nextQuestion({ rng });
  p.recordAnswer(q, { correct: false });
  c.addDays(1);
  const p2 = new Progress({ topics: makeTopics(), storage, now: c.now });
  const got = [];
  for (let i = 0; i < 8; i++) got.push(p2.nextQuestion({ rng }));
  assert.ok(got.some((x) => x.retryKind === 'exact' && x.key === q.key));
});

test('skill picker favours weak and stale skills but covers all topics', () => {
  const { p, c } = fresh();
  // Make math.a strong and recent.
  for (let i = 0; i < 40; i++) {
    const lv = p.levelFor({ id: 'math.a', minLevel: 1, maxLevel: 5 });
    p.recordAnswer(fakeQuestion('math.a', lv), { correct: true });
  }
  // Make math.b weak.
  for (let i = 0; i < 10; i++) p.recordAnswer(fakeQuestion('math.b', 1), { correct: false });
  const rng = createRng(11);
  const counts = {};
  for (let i = 0; i < 3000; i++) {
    const s = p.pickSkill({ rng, focusTopicId: 'math' });
    counts[s.id] = (counts[s.id] ?? 0) + 1;
  }
  assert.ok(counts['math.b'] > counts['math.a'] * 1.5, JSON.stringify(counts));

  const topicCounts = {};
  const session = {};
  for (let i = 0; i < 9; i++) {
    const s = p.pickSkill({ rng, sessionTopicCounts: session });
    const t = s.id.split('.')[0];
    session[t] = (session[t] ?? 0) + 1;
    topicCounts[t] = true;
  }
  assert.equal(Object.keys(topicCounts).length, 3, JSON.stringify(session));

  c.addDays(20);
  assert.ok(p.mastery('math.a') < 0.95);
});

test('focus topic only picks skills from that topic', () => {
  const { p } = fresh();
  const rng = createRng(2);
  for (let i = 0; i < 200; i++) assert.ok(p.pickSkill({ rng, focusTopicId: 'shapes' }).id.startsWith('shapes.'));
});

test('focus skill only serves that skill', () => {
  const { p } = fresh();
  const rng = createRng(12);
  for (let i = 0; i < 30; i++) assert.equal(p.nextQuestion({ rng, focusSkillId: 'verbal.a' }).skillId, 'verbal.a');
  assert.equal(p.nextQuestion({ rng, focusSkillId: 'nope' }), null);
});

test('mastery fades with time but not below half', () => {
  const { p, c } = fresh();
  for (let i = 0; i < 30; i++) {
    const lv = p.state.skills['math.a']?.level ?? START_LEVEL;
    p.recordAnswer(fakeQuestion('math.a', lv), { correct: true });
  }
  const m0 = p.mastery('math.a');
  assert.ok(m0 > 0.9, `m0=${m0}`);
  assert.equal(p.isMastered('math.a'), true);
  c.addDays(30);
  const m30 = p.mastery('math.a');
  assert.ok(m30 < m0 && m30 > m0 * 0.7, `m30=${m30}`);
  c.addDays(1000);
  assert.ok(p.mastery('math.a') >= m0 * 0.5 - 1e-9);
});

test('daily streak counts consecutive days and breaks on a gap', () => {
  const { p, c } = fresh();
  const answer = () => p.recordAnswer(fakeQuestion('math.a', 2), { correct: true });
  answer();
  assert.equal(p.streak(), 1);
  c.addDays(1); answer();
  c.addDays(1); answer();
  assert.equal(p.streak(), 3);
  c.addDays(1);
  assert.equal(p.streak(), 3, 'streak alive until the end of the next day');
  assert.equal(p.practicedToday(), false);
  c.addDays(1);
  assert.equal(p.streak(), 0);
  answer();
  assert.equal(p.streak(), 1);
  assert.ok(p.state.badges.streak_3);
  const h = p.history(7);
  assert.equal(h.length, 7);
  assert.equal(h[6].day, dayKey(c.now()));
  assert.equal(h[6].attempts, 1);
});

test('badges are awarded once and returned as new', () => {
  const { p } = fresh();
  const r1 = p.recordAnswer(fakeQuestion('math.a', 2), { correct: true });
  const ids = r1.newBadges.map((b) => b.id);
  assert.ok(ids.includes('first_correct'));
  assert.ok(ids.includes('explore_math'));
  const r2 = p.recordAnswer(fakeQuestion('math.a', 2), { correct: true });
  assert.ok(!r2.newBadges.some((b) => b.id === 'first_correct'));
  for (let i = 0; i < 3; i++) p.recordAnswer(fakeQuestion('math.b', 2), { correct: true });
  assert.ok(p.state.badges.run_5);
  p.recordAnswer(fakeQuestion('verbal.a', 2), { correct: true });
  const r3 = p.recordAnswer(fakeQuestion('shapes.a', 2), { correct: false });
  assert.ok(r3.newBadges.some((b) => b.id === 'explorer_all'));
  assert.equal(p.badgeList().filter((b) => b.earnedAt).length, Object.keys(p.state.badges).length);
});

test('finishSession gives stars, suggestions and perfect-session badge', () => {
  const { p } = fresh();
  const perfect = Array.from({ length: 10 }, () => ({ skillId: 'math.a', correct: true }));
  const s1 = p.finishSession(perfect);
  assert.equal(s1.stars, 3);
  assert.ok(s1.newBadges.some((b) => b.id === 'perfect_session'));
  const mixed = [
    ...Array.from({ length: 5 }, () => ({ skillId: 'math.a', correct: true })),
    ...Array.from({ length: 5 }, () => ({ skillId: 'verbal.a', correct: false })),
  ];
  const s2 = p.finishSession(mixed, { exam: true });
  assert.equal(s2.stars, 1);
  assert.equal(s2.suggestions[0].id, 'verbal.a');
  assert.equal(p.state.totals.exams, 1);
});

test('export and import round-trip; bad files are rejected', () => {
  const { p } = fresh();
  const rng = createRng(9);
  for (let i = 0; i < 5; i++) p.recordAnswer(p.nextQuestion({ rng }), { correct: i % 2 === 0 });
  p.updateSettings({ name: 'דני', sessionLength: 12 });
  const text = p.exportData();

  const { p: other } = fresh();
  other.importData(text);
  assert.equal(other.settings.name, 'דני');
  assert.equal(other.state.totals.attempts, 5);
  assert.equal(other.seenMap.size, p.seenMap.size);

  assert.throws(() => other.importData('not json'), /JSON/);
  assert.throws(() => other.importData('{"foo":1}'), /אינו/);
  assert.equal(other.state.totals.attempts, 5, 'failed import leaves state untouched');
});

test('settings are clamped and garbage state is normalized', () => {
  const { p } = fresh();
  p.updateSettings({ sessionLength: 999, timerSeconds: 1, name: '   ' });
  assert.equal(p.settings.sessionLength, 30);
  assert.equal(p.settings.timerSeconds, 15);
  assert.equal(p.settings.name, '');
  p.updateSettings({ name: 'מאיה', gender: 'girl' });
  p.updateSettings({ name: '  ', gender: 'other' });
  assert.equal(p.settings.name, '', 'blank name falls back to the empty default');
  assert.equal(p.settings.gender, 'boy', 'unknown gender falls back to boy');
  const s = normalizeState({ skills: { x: { level: 99, attempts: 'a' } }, days: { bad: {} }, seen: 'x' });
  assert.equal(s.skills.x.level, 5);
  assert.equal(s.skills.x.attempts, 0);
  assert.deepEqual(s.days, {});
  assert.deepEqual(s.seen, []);
});

test('reset clears progress but keeps settings', () => {
  const { p } = fresh();
  p.updateSettings({ name: 'נועם' });
  p.recordAnswer(fakeQuestion('math.a', 2), { correct: true });
  p.reset();
  assert.equal(p.state.totals.attempts, 0);
  assert.equal(p.settings.name, 'נועם');
});

test('a throwing or invalid generator is skipped, not fatal', () => {
  const bad = { id: 'x.bad', name: 'רע', minLevel: 1, maxLevel: 5, generate() { throw new Error('boom'); } };
  const invalid = { id: 'x.inv', name: 'לא תקין', minLevel: 1, maxLevel: 5,
    generate: (rng, level) => ({ key: 'k', skillId: 'x.inv', level, prompt: 'undefined', choices: [], answerIndex: 0 }) };
  const topics = [{ id: 'x', name: 'א', icon: 'x', skills: [bad, invalid, makeSkill('x.ok')] }];
  const { p } = fresh({ topics });
  const rng = createRng(4);
  for (let i = 0; i < 20; i++) assert.equal(p.nextQuestion({ rng }).skillId, 'x.ok');
  assert.ok(p.brokenSkills.has('x.bad'));
  assert.ok(p.brokenSkills.has('x.inv'));
});

test('skill level respects skill min/max range', () => {
  const narrow = { ...makeSkill('n.a'), minLevel: 3, maxLevel: 4 };
  const topics = [{ id: 'n', name: 'צר', icon: 'x', skills: [narrow] }];
  const { p } = fresh({ topics });
  assert.equal(p.levelFor(narrow), 3);
  const rng = createRng(8);
  for (let i = 0; i < 30; i++) p.recordAnswer(p.nextQuestion({ rng }), { correct: true });
  assert.equal(p.levelFor(narrow), 4);
  for (let i = 0; i < 30; i++) p.recordAnswer(p.nextQuestion({ rng }), { correct: false });
  assert.equal(p.levelFor(narrow), 3);
});

test('old save with a name and no gender keeps the name and defaults to boy', () => {
  const storage = new MemoryStorage();
  storage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, settings: { name: 'יונתן', sessionLength: 10 }, points: 70 }));
  const p = new Progress({ topics: makeTopics(), storage, now: clock().now });
  assert.equal(p.settings.name, 'יונתן');
  assert.equal(p.settings.gender, 'boy');
  assert.equal(p.state.points, 70);
  assert.deepEqual(p.state.testHistory, []);
});

test('gender is stored, exported and imported', () => {
  const { p } = fresh();
  p.updateSettings({ name: 'נועה', gender: 'girl' });
  const { p: other } = fresh();
  other.importData(p.exportData());
  assert.equal(other.settings.name, 'נועה');
  assert.equal(other.settings.gender, 'girl');
  const old = JSON.parse(p.exportData());
  delete old.state.settings.gender;
  other.importData(JSON.stringify(old));
  assert.equal(other.settings.gender, 'boy');
});

test('badges are shown in the child gender', () => {
  const { p } = fresh();
  const name = () => p.badgeList().find((b) => b.id === 'learned_mistake').name;
  assert.equal(name(), 'לומד מטעויות');
  p.updateSettings({ gender: 'girl' });
  assert.equal(name(), 'לומדת מטעויות');
  assert.equal(p.badgeList().find((b) => b.id === 'explore_math').name, 'חוקרת חשבון');
  const r = p.recordAnswer(fakeQuestion('math.a', 2), { correct: true });
  assert.ok(r.newBadges.every((b) => typeof b.name === 'string'));
});

test('phrases have both genders and praise mixes ability and effort without repeats', () => {
  assert.equal(genderText(['אתה', 'את'], 'boy'), 'אתה');
  assert.equal(genderText(['אתה', 'את'], 'girl'), 'את');
  assert.equal(genderText('כל הכבוד!', 'girl'), 'כל הכבוד!');
  const all = [...PRAISE_ABILITY, ...PRAISE_EFFORT, ...ENCOURAGE, ...TIMEOUT, RETRY_NOTE];
  for (const e of all) {
    if (Array.isArray(e)) {
      assert.equal(e.length, 2, JSON.stringify(e));
      assert.notEqual(e[0], e[1], JSON.stringify(e));
    } else assert.equal(typeof e, 'string');
  }
  // A neutral string must not hide a masculine-only form.
  const MASC = /(^|\s)(אתה|בוא|מוכן|בחר|בקש|נסה)(\s|[.,!?]|$)/;
  for (const e of all) if (!Array.isArray(e)) assert.ok(!MASC.test(e), `masculine-only phrase: ${e}`);
  const flat = [...PRAISE_ABILITY, ...PRAISE_EFFORT].map((e) => JSON.stringify(e));
  assert.equal(new Set(flat).size, flat.length, 'praise lists share no phrase');
  assert.ok(PRAISE_EFFORT.length >= 15);

  let prev = null;
  let effort = 0;
  for (let i = 0; i < 2000; i++) {
    const cur = pickPraise();
    assert.notEqual(cur, prev, 'praise repeated immediately');
    if (PRAISE_EFFORT.includes(cur)) effort++;
    prev = cur;
  }
  assert.ok(effort > 800 && effort < 1200, `effort share ${effort}/2000`);
  const two = ['a', 'b'];
  for (let i = 0, last = null; i < 50; i++) {
    const x = pick(two);
    assert.notEqual(x, last);
    last = x;
  }
});

test('buildTest spreads questions over all topics with no retries or duplicates', () => {
  const { p } = fresh();
  p.recordAnswer(p.nextQuestion({ rng: createRng(1) }), { correct: false });
  for (const length of [10, 15, 20]) {
    const qs = p.buildTest({ rng: createRng(length), length });
    assert.equal(qs.length, length);
    const per = {};
    for (const q of qs) {
      assert.equal(q.retryKind, null);
      const topic = q.skillId.split('.')[0];
      per[topic] = (per[topic] ?? 0) + 1;
    }
    assert.equal(Object.keys(per).length, 3, JSON.stringify(per));
    const counts = Object.values(per);
    assert.ok(Math.max(...counts) - Math.min(...counts) <= 1, JSON.stringify(per));
    assert.equal(new Set(qs.map((q) => q.key)).size, length, 'no duplicate questions');
  }
  assert.equal(p.buildTest({ rng: createRng(2) }).length, p.settings.examLength);
});

test('test answers count for stats and points but re-queue only at the end', () => {
  const { p } = fresh();
  const qs = p.buildTest({ rng: createRng(31), length: 6 });
  const answers = [];
  const pointsBefore = p.state.points;
  qs.forEach((q, i) => {
    const timedOut = i === 4;
    const correct = !timedOut && i % 2 === 0;
    const r = p.recordAnswer(q, { correct, timedOut, timeMs: timedOut ? 45000 : 10000, timeLimitMs: 45000, requeue: false });
    answers.push({ question: q, correct: r.correct, timedOut, timeMs: timedOut ? 45000 : 10000 });
  });
  assert.equal(p.state.retryQueue.length, 0, 'nothing re-queued during the test');
  assert.equal(p.state.totals.attempts, 6);
  assert.ok(p.state.points > pointsBefore);

  const res = p.finishTest(answers);
  assert.equal(res.total, 6);
  assert.equal(res.correct, 2);
  assert.equal(res.timedOut, 1);
  assert.equal(res.timeMs, 5 * 10000 + 45000);
  assert.equal(res.topics.reduce((a, t) => a + t.total, 0), 6);
  assert.ok(res.topics.every((t) => t.name && t.icon));
  assert.equal(p.state.totals.exams, 1);
  assert.ok(p.state.badges.first_exam);

  // Each mistake: a variant and an exact retry, spread out.
  assert.equal(p.state.retryQueue.length, 8);
  const exactDue = p.state.retryQueue.filter((r) => r.kind === 'exact').map((r) => r.dueAt);
  assert.equal(new Set(exactDue).size, 4, 'retries are spread over time');

  const wrongKeys = new Set(answers.filter((a) => !a.correct).map((a) => a.question.key));
  const served = [];
  const rng = createRng(77);
  for (let i = 0; i < 20; i++) served.push(p.nextQuestion({ rng }));
  const exactServed = served.filter((q) => q.retryKind === 'exact').map((q) => q.key);
  assert.equal(new Set(exactServed).size, 4);
  assert.ok(exactServed.every((k) => wrongKeys.has(k)));
});

test('test history is stored, capped, survives reload and normalizes garbage', () => {
  const { p, c, storage } = fresh();
  const q = fakeQuestion('math.a', 2);
  for (let i = 0; i < TEST_HISTORY_KEPT + 5; i++) {
    c.addDays(1);
    p.finishTest([{ question: q, correct: true, timedOut: false, timeMs: 3000 },
      { question: fakeQuestion('verbal.a', 2), correct: false, timedOut: true, timeMs: 45000 }]);
  }
  assert.equal(p.state.testHistory.length, TEST_HISTORY_KEPT);
  const last = p.testHistory().at(-1);
  assert.equal(last.correct, 1);
  assert.equal(last.total, 2);
  assert.equal(last.timedOut, 1);
  assert.deepEqual(last.topics, { math: { total: 1, correct: 1 }, verbal: { total: 1, correct: 0 } });
  assert.deepEqual(last.topicList.map((t) => t.id), ['math', 'verbal']);

  const p2 = new Progress({ topics: makeTopics(), storage, now: c.now });
  assert.equal(p2.state.testHistory.length, TEST_HISTORY_KEPT);

  const s = normalizeState({ testHistory: [null, 'x', { total: 0 }, { total: 5, correct: 9, timedOut: 3, topics: { m: { total: 2, correct: 5 }, bad: 1 } }] });
  assert.equal(s.testHistory.length, 1);
  assert.equal(s.testHistory[0].correct, 5);
  assert.equal(s.testHistory[0].timedOut, 0);
  assert.deepEqual(s.testHistory[0].topics, { m: { total: 2, correct: 2 } });
  assert.equal(p.finishTest([]).total, 0);
  assert.equal(p.state.testHistory.length, TEST_HISTORY_KEPT, 'empty test is not stored');
});

let failed = 0;
for (const t of tests) {
  try {
    t.fn();
    console.log(`ok   - ${t.name}`);
  } catch (err) {
    failed++;
    console.log(`FAIL - ${t.name}\n       ${err.stack.split('\n').slice(0, 3).join('\n       ')}`);
  }
}
console.log(`\n${tests.length - failed}/${tests.length} passed`);
process.exit(failed ? 1 : 0);
