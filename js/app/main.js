// App shell: hash routing between screens, the practice session flow and the
// test simulation flow. All learning logic lives in progress.js; this file
// only renders and wires events.

import { topics, loadErrors } from '../generators/index.js';
import { createRng } from '../core/random.js';
import { Progress, safeLocalStorage, dayKey, genderText, SETTING_LIMITS } from './progress.js';
import { h, fill, multiline, bidiText, percent } from './dom.js';
import { pickPraise, ENCOURAGE, TIMEOUT, RETRY_NOTE, LEVEL_UP, pick } from './phrases.js';
import { confetti, playSound, watchHebrewVoice, speak, stopSpeaking, prefersReducedMotion } from './effects.js';

const LETTERS = ['א', 'ב', 'ג', 'ד'];
const LONG_CHOICE_CHARS = 16;
const SESSION_LENGTH_OPTIONS = [5, 10, 15, 20];
const EXAM_LENGTH_OPTIONS = [10, 15, 20];
const TIMER_OPTIONS = [30, 45, 60, 90];
const TEST_ADVANCE_MS = 700;
const TEST_TIMEOUT_ADVANCE_MS = 1500;

const storage = safeLocalStorage();
const progress = new Progress({ topics, storage });
const app = document.getElementById('app');

let session = null;
let parentsUnlocked = false;
let speechAvailable = false;
let timerHandle = null;

const sound = (name) => playSound(name, progress.settings.sound);
const t = (m, f) => (progress.settings.gender === 'girl' ? f : m);
const say = (text) => genderText(text, progress.settings.gender);

// ---------------------------------------------------------------- routing

const SCREENS = {
  welcome: renderWelcome,
  home: renderHome,
  practice: renderPractice,
  summary: renderSummary,
  test: renderTest,
  results: renderResults,
  review: renderReview,
  achievements: renderAchievements,
  gate: renderGate,
  parents: renderParents,
};

const SESSION_SCREENS = new Set(['practice', 'summary', 'test', 'results', 'review']);

function go(name) {
  if (location.hash === `#${name}`) render();
  else location.hash = name;
}

// The one session screen that matches the session state; the browser back
// button must not reopen a finished question or test.
function sessionScreen() {
  if (!session) return 'home';
  if (session.exam) return session.summary ? 'results' : 'test';
  return session.summary ? 'summary' : 'practice';
}

function render() {
  clearTimer();
  stopSpeaking();
  let name = location.hash.slice(1) || 'home';
  if (!SCREENS[name]) name = 'home';
  if (!progress.settings.name) name = 'welcome';
  if (SESSION_SCREENS.has(name)) {
    const allowed = sessionScreen();
    if (name !== allowed && !(name === 'review' && allowed === 'results' && session.mistakes.length)) name = allowed;
  }
  if (name === 'parents' && !parentsUnlocked) name = 'gate';
  if (!SESSION_SCREENS.has(name)) session = null;

  app.replaceChildren(SCREENS[name]());
  app.dataset.screen = name;
  window.scrollTo(0, 0);
  const heading = app.querySelector('[data-autofocus]');
  if (heading) heading.focus({ preventScroll: true });
}

function screen(className, ...children) {
  return h('section', { class: `screen ${className}` }, ...children);
}

function topBar(title, { back = 'home', backLabel = '🏠 בית', onBack = null, extra = null } = {}) {
  return h('header', { class: 'topbar' },
    h('button', { class: 'btn btn-ghost btn-back', type: 'button', onclick: onBack ?? (() => go(back)) }, backLabel),
    h('h1', { class: 'topbar-title', tabindex: '-1', 'data-autofocus': true }, title),
    extra ?? h('span', { class: 'topbar-spacer' }));
}

function statChip(icon, value, label) {
  return h('div', { class: 'chip', title: label },
    h('span', { 'aria-hidden': 'true' }, icon), h('b', {}, String(value)), h('span', { class: 'sr-only' }, label));
}

function counterChip(n, total) {
  return h('div', { class: 'chip chip-counter' },
    h('span', { 'aria-hidden': 'true', dir: 'ltr' }, `${n}/${total}`),
    h('span', { class: 'sr-only' }, `${n} מתוך ${total}`));
}

// ---------------------------------------------------------------- welcome

function renderWelcome() {
  let chosen = null;
  const input = h('input', { class: 'input welcome-input', type: 'text', id: 'welcome-name', maxlength: '30',
    autocomplete: 'off', enterkeyhint: 'done', 'aria-labelledby': 'welcome-title' });
  const msg = h('p', { class: 'welcome-msg', 'aria-live': 'polite' });

  const genderButton = (value, icon, label) => h('button', { class: 'gender-btn', type: 'button',
    'data-gender': value, 'aria-pressed': 'false', onclick: () => choose(value) },
  h('span', { class: 'gender-icon', 'aria-hidden': 'true' }, icon), h('span', {}, label));
  const buttons = [genderButton('boy', '👦', 'אני בן'), genderButton('girl', '👧', 'אני בת')];

  function choose(value) {
    chosen = value;
    for (const b of buttons) b.setAttribute('aria-pressed', String(b.dataset.gender === value));
    msg.textContent = '';
  }

  const submit = (e) => {
    e.preventDefault();
    const name = input.value.trim();
    if (!name) {
      msg.textContent = 'רק צריך לכתוב שם 🙂';
      input.focus();
      return;
    }
    if (!chosen) {
      msg.textContent = 'עוד דבר קטן: בן או בת?';
      buttons[0].focus();
      return;
    }
    progress.updateSettings({ name, gender: chosen });
    go('home');
  };

  return screen('welcome',
    h('form', { class: 'card welcome-card', onsubmit: submit, novalidate: true },
      h('span', { class: 'welcome-wave', 'aria-hidden': 'true' }, '👋'),
      h('h1', { class: 'welcome-title', id: 'welcome-title', tabindex: '-1', 'data-autofocus': true }, 'שלום! איך קוראים לך?'),
      input,
      h('div', { class: 'gender-choice', role: 'group', 'aria-label': 'בן או בת?' }, buttons),
      h('button', { class: 'btn btn-primary btn-huge', type: 'submit' }, 'יאללה, מתחילים! 🚀'),
      msg));
}

// ---------------------------------------------------------------- home

function renderHome() {
  const s = progress.settings;
  const streak = progress.streak();

  const cards = topics.map((topic) => {
    const sum = progress.topicSummary(topic);
    return h('button', { class: 'topic-card', type: 'button', onclick: () => startSession({ mode: 'topic', focusTopicId: topic.id }) },
      h('span', { class: 'topic-icon', 'aria-hidden': 'true' }, topic.icon),
      h('span', { class: 'topic-name' }, topic.name),
      h('span', { class: 'bar', role: 'progressbar', 'aria-label': `התקדמות ב${topic.name}`,
        'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(Math.round(sum.mastery * 100)) },
      h('span', { class: 'bar-fill', style: { width: `${Math.max(4, Math.round(sum.mastery * 100))}%` } })));
  });

  const lastTest = progress.state.testHistory.at(-1);

  const modes = [
    h('section', { class: 'mode-card mode-practice', 'aria-labelledby': 'mode-practice-title' },
      h('div', { class: 'mode-head' },
        h('span', { class: 'mode-icon', 'aria-hidden': 'true' }, '🎯'),
        h('div', {},
          h('h2', { class: 'mode-title', id: 'mode-practice-title' }, 'אימון'),
          h('p', { class: 'mode-desc' }, `${s.timedDefault ? '' : 'בלי שעון. '}אחרי כל שאלה רואים אם צדקנו ולמה.`))),
      h('button', { class: 'btn btn-primary btn-huge', type: 'button', onclick: () => startSession({ mode: 'mixed' }) },
        h('span', { 'aria-hidden': 'true' }, '🎲 '), 'אימון מעורב'),
      h('h3', { class: 'section-title' }, t('או בחר נושא:', 'או בחרי נושא:')),
      h('div', { class: 'topic-grid' }, cards)),
    h('section', { class: 'mode-card mode-test', 'aria-labelledby': 'mode-test-title' },
      h('div', { class: 'mode-head' },
        h('span', { class: 'mode-icon', 'aria-hidden': 'true' }, '📝'),
        h('div', {},
          h('h2', { class: 'mode-title', id: 'mode-test-title' }, 'מבחן לדוגמה'),
          h('p', { class: 'mode-desc' }, `${s.examLength} שאלות מכל הנושאים, עם שעון, כמו במבחן. את התוצאות רואים בסוף.`))),
      lastTest ? h('p', { class: 'mode-last' }, `במבחן הקודם: ${lastTest.correct} מתוך ${lastTest.total}`) : null,
      h('button', { class: 'btn btn-test', type: 'button', onclick: startTest },
        h('span', { 'aria-hidden': 'true' }, '⏱️ '), 'להתחיל מבחן')),
  ];

  return screen('home',
    h('header', { class: 'home-head' },
      h('h1', { class: 'greeting', tabindex: '-1', 'data-autofocus': true }, s.name ? `שלום ${s.name}!` : 'שלום!'),
      h('div', { class: 'chips' },
        statChip('⭐', progress.state.points, 'נקודות'),
        statChip('🔥', streak, streak === 1 ? 'יום ברצף' : 'ימים ברצף'))),
    h('p', { class: 'home-sub' }, progress.practicedToday()
      ? 'איזה כיף שחזרת! עוד סיבוב?'
      : t('מוכן לאתגר של היום?', 'מוכנה לאתגר של היום?')),
    topics.length === 0
      ? h('p', { class: 'notice' }, t('אין כרגע שאלות זמינות. בקש מאבא או מאמא לבדוק.',
        'אין כרגע שאלות זמינות. בקשי מאבא או מאמא לבדוק.'))
      : h('div', { class: 'modes' }, modes),
    h('div', { class: 'home-actions' },
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go('achievements') },
        h('span', { 'aria-hidden': 'true' }, '🏆 '), 'הישגים'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => go('parents') },
        h('span', { 'aria-hidden': 'true' }, '👨‍👩‍👧 '), 'הורים')));
}

// ---------------------------------------------------------------- question view

function newRng() {
  return createRng((Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0);
}

function questionCard(q, { retry = false } = {}) {
  const skill = progress.skillById.get(q.skillId);
  const topic = progress.topicBySkill.get(q.skillId);
  const speakText = [q.passage, q.prompt].filter(Boolean).join('. ');
  const speakBtn = h('button', { class: 'btn btn-round speak-btn', type: 'button', 'data-speak': true,
    'aria-label': 'להקריא את השאלה', title: 'להקריא את השאלה', hidden: !speechAvailable, onclick: () => speak(speakText) }, '🔊');

  return h('article', { class: 'question-card' },
    h('div', { class: 'question-meta' },
      h('span', { class: 'tag' }, `${topic?.icon ?? ''} ${skill?.name ?? ''}`),
      retry ? h('span', { class: 'tag tag-retry' }, say(RETRY_NOTE)) : null,
      speakBtn),
    q.passage ? h('div', { class: 'passage', dir: 'rtl' }, multiline(q.passage, 'passage-line')) : null,
    h('h2', { class: 'prompt', tabindex: '-1', 'data-autofocus': true }, multiline(q.prompt)),
    q.visual?.svg ? h('div', { class: 'visual', svg: q.visual.svg, role: 'img', 'aria-label': 'ציור לשאלה' }) : null);
}

// `onChoose` null renders read-only choices. `marks` maps a choice index to
// 'correct' or 'wrong' (review screen).
function choiceGrid(q, { onChoose = null, marks = {} } = {}) {
  const longChoices = q.choices.some((c) => c.text && !c.svg && String(c.text).length > LONG_CHOICE_CHARS);
  const figureChoices = q.choices.every((c) => c.svg);
  const buttons = q.choices.map((c, i) => {
    const mark = marks[i];
    let cls = `choice${c.svg ? ' choice-svg' : ''}`;
    if (mark === 'correct') cls += ' is-correct has-mark';
    else if (mark === 'wrong') cls += ' is-wrong has-mark';
    else if (!onChoose) cls += ' is-dim';
    const markLabel = mark === 'correct' ? 'התשובה הנכונה' : mark === 'wrong' ? 'התשובה שלך' : null;
    return h('button', { class: cls, type: 'button', 'data-index': String(i), disabled: !onChoose,
      'aria-label': `${c.text ? `${LETTERS[i]}. ${c.text}` : `תשובה ${LETTERS[i]}`}${markLabel ? ` (${markLabel})` : ''}`,
      onclick: onChoose ? () => onChoose(i) : null },
    h('span', { class: 'choice-letter', 'aria-hidden': 'true' }, LETTERS[i]),
    mark ? h('span', { class: 'choice-mark', 'aria-hidden': 'true' }, mark === 'correct' ? '✓' : '✗') : null,
    c.svg ? h('span', { class: 'choice-figure', svg: c.svg }) : null,
    c.text != null ? h('span', { class: 'choice-text', dir: 'auto' }, bidiText(c.text)) : null);
  });
  return h('div', { class: `choices${longChoices ? ' choices-long' : ''}${figureChoices ? ' choices-figures' : ''}` }, buttons);
}

function timerBar(ms) {
  return h('div', { class: 'timer', 'aria-hidden': 'true' },
    h('div', { class: 'timer-fill', style: `--timer-ms: ${ms}ms` }));
}

function answerLine(label, q, index) {
  return h('p', { class: 'feedback-answer' }, label, h('b', {}, LETTERS[index]),
    q.choices[index].text != null ? [' - ', h('bdi', {}, bidiText(q.choices[index].text))] : null);
}

function correctAnswerLine(q) {
  return answerLine('התשובה הנכונה: ', q, q.answerIndex);
}

function clearTimer() {
  if (timerHandle) clearTimeout(timerHandle);
  timerHandle = null;
}

// ---------------------------------------------------------------- practice session

function startSession({ mode, focusTopicId = null, focusSkillId = null }) {
  if (mode === 'exam') {
    startTest();
    return;
  }
  const s = progress.settings;
  session = {
    mode,
    exam: false,
    focusTopicId,
    focusSkillId,
    length: s.sessionLength,
    timeLimitMs: s.timedDefault ? s.timerSeconds * 1000 : 0,
    rng: newRng(),
    results: [],
    recentSkillIds: [],
    topicCounts: {},
    pointsEarned: 0,
    newBadges: [],
    current: null,
    summary: null,
  };
  if (!loadNextQuestion()) {
    session = null;
    go('home');
    showToast(t('לא הצלחתי למצוא שאלה. נסה נושא אחר.', 'לא הצלחתי למצוא שאלה. נסי נושא אחר.'));
    return;
  }
  go('practice');
}

function loadNextQuestion() {
  const q = progress.nextQuestion({
    rng: session.rng,
    focusTopicId: session.focusTopicId,
    focusSkillId: session.focusSkillId,
    recentSkillIds: session.recentSkillIds,
    sessionTopicCounts: session.topicCounts,
  });
  if (!q) return false;
  const topicId = progress.topicBySkill.get(q.skillId)?.id;
  session.recentSkillIds.push(q.skillId);
  if (topicId) session.topicCounts[topicId] = (session.topicCounts[topicId] ?? 0) + 1;
  session.current = { question: q, startedAt: 0, answered: false, outcome: null };
  return true;
}

function sessionTitle() {
  if (session.focusSkillId) return progress.skillById.get(session.focusSkillId)?.name ?? 'אימון';
  if (session.focusTopicId) return topics.find((topic) => topic.id === session.focusTopicId)?.name ?? 'אימון';
  return 'אימון מעורב';
}

function renderPractice() {
  const { question: q } = session.current;
  const number = session.results.length + 1;

  const dots = h('div', { class: 'dots', 'aria-label': `שאלה ${number} מתוך ${session.length}` },
    Array.from({ length: session.length }, (_, i) => {
      const r = session.results[i];
      const cls = r ? (r.correct ? 'dot dot-ok' : 'dot dot-miss') : i === number - 1 ? 'dot dot-now' : 'dot';
      return h('span', { class: cls, 'aria-hidden': 'true' });
    }));

  const pointsChip = statChip('⭐', progress.state.points, 'נקודות');
  pointsChip.id = 'points-chip';

  const view = screen('practice',
    h('header', { class: 'topbar' },
      h('button', { class: 'btn btn-ghost btn-back', type: 'button', onclick: () => go('home') }, '✕ יציאה'),
      h('span', { class: 'topbar-title' }, sessionTitle()),
      pointsChip),
    dots,
    session.timeLimitMs ? timerBar(session.timeLimitMs) : null,
    questionCard(q, { retry: !!q.retryKind }),
    choiceGrid(q, { onChoose: (i) => answer(i) }),
    h('div', { class: 'feedback', id: 'feedback', 'aria-live': 'polite' }));

  session.current.startedAt = performance.now();
  if (session.timeLimitMs) {
    timerHandle = setTimeout(() => answer(-1, { timedOut: true }), session.timeLimitMs);
  }
  return view;
}

function answer(index, { timedOut = false } = {}) {
  const cur = session?.current;
  if (!cur || cur.answered) return;
  cur.answered = true;
  clearTimer();
  stopSpeaking();

  const q = cur.question;
  const timeMs = performance.now() - cur.startedAt;
  const correct = !timedOut && index === q.answerIndex;
  const outcome = progress.recordAnswer(q, { correct, timeMs, timedOut, timeLimitMs: session.timeLimitMs });
  cur.outcome = outcome;
  session.results.push({ skillId: q.skillId, correct: outcome.correct });
  session.pointsEarned += outcome.points.total;
  session.newBadges.push(...outcome.newBadges);

  const buttons = app.querySelectorAll('.choice');
  buttons.forEach((b, i) => {
    b.disabled = true;
    if (i === q.answerIndex) b.classList.add('is-correct');
    else if (i === index) b.classList.add('is-wrong');
    else b.classList.add('is-dim');
  });
  app.querySelector('.timer')?.classList.add('is-stopped');

  const dot = app.querySelectorAll('.dot')[session.results.length - 1];
  if (dot) dot.className = outcome.correct ? 'dot dot-ok' : 'dot dot-miss';

  showFeedback(q, outcome, timedOut);
}

function showFeedback(q, outcome, timedOut) {
  const box = document.getElementById('feedback');
  const isLast = session.results.length >= session.length;
  const next = h('button', { class: 'btn btn-primary btn-next', type: 'button', onclick: nextQuestion },
    isLast ? 'לסיכום ⭐' : 'הבא ←');

  let title;
  if (outcome.correct) title = pickPraise();
  else if (timedOut) title = pick(TIMEOUT);
  else title = pick(ENCOURAGE);

  const pts = outcome.points;
  const pointsLine = pts.total > 0
    ? h('span', { class: 'points-pop', dir: 'ltr' }, `+${pts.total}`, pts.speed ? ' ⚡' : '')
    : null;

  box.className = `feedback ${outcome.correct ? 'feedback-ok' : 'feedback-miss'}`;
  fill(box,
    h('div', { class: 'feedback-head' },
      h('span', { class: 'feedback-icon', 'aria-hidden': 'true' }, outcome.correct ? '🎉' : '💡'),
      h('strong', { class: 'feedback-title' }, say(title)),
      pointsLine),
    outcome.levelAfter > outcome.levelBefore ? h('p', { class: 'level-up' }, LEVEL_UP) : null,
    !outcome.correct ? correctAnswerLine(q) : null,
    q.explanation ? h('p', { class: 'explanation' }, multiline(q.explanation)) : null,
    outcome.newBadges.map((b) => h('p', { class: 'badge-won' }, `${b.icon} הישג חדש: ${b.name}!`)),
    next);

  if (outcome.correct) {
    sound(outcome.newBadges.length ? 'badge' : 'correct');
    confetti({ count: outcome.newBadges.length ? 120 : 60 });
    bumpPoints();
  } else {
    sound('wrong');
  }
  box.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'nearest' });
  next.focus({ preventScroll: true });
}

function bumpPoints() {
  const chip = document.getElementById('points-chip');
  if (!chip) return;
  chip.querySelector('b').textContent = String(progress.state.points);
  chip.classList.remove('bump');
  void chip.offsetWidth;
  chip.classList.add('bump');
}

function nextQuestion() {
  if (session.results.length < session.length && loadNextQuestion()) {
    render();
    return;
  }
  session.summary = progress.finishSession(session.results);
  session.newBadges.push(...session.summary.newBadges);
  go('summary');
}

function renderSummary() {
  const sum = session.summary;
  const stars = Array.from({ length: 3 }, (_, i) =>
    h('span', { class: i < sum.stars ? 'star star-on' : 'star', 'aria-hidden': 'true' }, '★'));
  const headline = sum.stars === 3 ? 'סיבוב מדהים!' : sum.stars === 2 ? 'כל הכבוד!' : 'יופי שהתאמנת!';
  const last = { mode: session.mode, focusTopicId: session.focusTopicId, focusSkillId: session.focusSkillId };

  if (sum.stars === 3) setTimeout(() => confetti({ count: 140, durationMs: 2000 }), 150);

  return screen('summary',
    h('h1', { class: 'summary-title', tabindex: '-1', 'data-autofocus': true }, headline),
    h('div', { class: 'stars', role: 'img', 'aria-label': `${sum.stars} כוכבים מתוך 3` }, stars),
    h('p', { class: 'summary-score' }, `ענית נכון על ${sum.correct} מתוך ${sum.total} שאלות`),
    h('p', { class: 'summary-points' }, `⭐ צברת ${session.pointsEarned} נקודות`),
    newBadgesBlock(),
    sum.suggestions.length
      ? h('div', { class: 'suggestions' },
        h('h2', { class: 'section-title' }, 'מה כדאי לתרגל עכשיו?'),
        sum.suggestions.map((sg) => h('button', { class: 'btn btn-secondary', type: 'button',
          onclick: () => startSession({ mode: 'skill', focusSkillId: sg.id }) }, `🎯 ${sg.name}`)))
      : null,
    h('div', { class: 'summary-actions' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => startSession(last) }, '🔁 עוד סיבוב'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go('home') }, '🏠 הביתה')));
}

function newBadgesBlock() {
  return session.newBadges.length
    ? h('div', { class: 'summary-badges' },
      h('h2', { class: 'section-title' }, 'הישגים חדשים'),
      h('div', { class: 'badge-grid' }, session.newBadges.map(badgeTile)))
    : null;
}

// ---------------------------------------------------------------- test simulation

function startTest() {
  const s = progress.settings;
  const questions = progress.buildTest({ rng: newRng(), length: s.examLength });
  if (!questions.length) {
    session = null;
    go('home');
    showToast('לא הצלחתי להכין מבחן. אפשר לנסות שוב.');
    return;
  }
  session = {
    mode: 'exam',
    exam: true,
    questions,
    index: 0,
    answers: [],
    timeLimitMs: s.timerSeconds * 1000,
    current: { question: questions[0], startedAt: 0, answered: false },
    pointsEarned: 0,
    newBadges: [],
    summary: null,
    mistakes: [],
    reviewIndex: 0,
  };
  go('test');
}

function leaveTest() {
  if (window.confirm('לצאת מהמבחן? התוצאות של המבחן הזה לא יישמרו.')) go('home');
}

function renderTest() {
  const q = session.current.question;
  const total = session.questions.length;
  const number = session.index + 1;

  const dots = h('div', { class: 'dots', 'aria-hidden': 'true' },
    Array.from({ length: total }, (_, i) =>
      h('span', { class: i < session.index ? 'dot dot-done' : i === session.index ? 'dot dot-now' : 'dot' })));

  const view = screen('practice test-mode',
    h('header', { class: 'topbar' },
      h('button', { class: 'btn btn-ghost btn-back', type: 'button', onclick: leaveTest }, '✕ יציאה'),
      h('span', { class: 'topbar-title' }, 'מבחן לדוגמה'),
      counterChip(number, total)),
    dots,
    timerBar(session.timeLimitMs),
    questionCard(q),
    choiceGrid(q, { onChoose: (i) => answerTest(i) }),
    h('p', { class: 'test-status', id: 'test-status', 'aria-live': 'polite' }));

  session.current.startedAt = performance.now();
  timerHandle = setTimeout(() => answerTest(-1, { timedOut: true }), session.timeLimitMs);
  return view;
}

// No feedback during the test: the choice is marked as picked and the test moves on.
function answerTest(index, { timedOut = false } = {}) {
  const cur = session?.current;
  if (!cur || cur.answered || !session.exam) return;
  cur.answered = true;
  clearTimer();
  stopSpeaking();

  const q = cur.question;
  const timeMs = timedOut ? session.timeLimitMs : Math.min(session.timeLimitMs, performance.now() - cur.startedAt);
  const correct = !timedOut && index === q.answerIndex;
  const outcome = progress.recordAnswer(q, { correct, timeMs, timedOut, timeLimitMs: session.timeLimitMs, requeue: false });
  session.answers.push({ question: q, chosen: timedOut ? -1 : index, correct: outcome.correct, timedOut, timeMs });
  session.pointsEarned += outcome.points.total;
  session.newBadges.push(...outcome.newBadges);

  app.querySelectorAll('.choice').forEach((b, i) => {
    b.disabled = true;
    b.classList.add(i === index ? 'is-picked' : 'is-dim');
  });
  app.querySelector('.timer')?.classList.add('is-stopped');
  const status = document.getElementById('test-status');
  if (status) status.textContent = timedOut ? '⏰ הזמן נגמר. ממשיכים!' : `בחרת ${LETTERS[index]} ✓`;
  sound('tap');

  timerHandle = setTimeout(advanceTest, timedOut ? TEST_TIMEOUT_ADVANCE_MS : TEST_ADVANCE_MS);
}

function advanceTest() {
  timerHandle = null;
  session.index++;
  if (session.index < session.questions.length) {
    session.current = { question: session.questions[session.index], startedAt: 0, answered: false };
    render();
    return;
  }
  session.summary = progress.finishTest(session.answers);
  session.newBadges.push(...session.summary.newBadges);
  session.mistakes = session.answers.filter((a) => !a.correct);
  go('results');
}

function formatDuration(ms) {
  const sec = Math.round(ms / 1000);
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
}

function renderResults() {
  const sum = session.summary;
  const ratio = sum.total ? sum.correct / sum.total : 0;
  const headline = ratio >= 0.9 ? 'מבחן מדהים! 🏆' : ratio >= 0.7 ? 'עבודה טובה מאוד! 💪' : 'כל הכבוד שסיימת את המבחן! 🌱';
  const mistakes = session.mistakes.length;

  if (ratio >= 0.9) setTimeout(() => confetti({ count: 140, durationMs: 2000 }), 150);

  const breakdown = h('div', { class: 'card results-topics' },
    h('h2', {}, 'לפי נושא'),
    sum.topics.map((topic) => h('div', { class: 'topic-row' },
      h('span', { class: 'topic-row-name' }, h('span', { 'aria-hidden': 'true' }, `${topic.icon} `), topic.name),
      h('span', { class: 'bar', 'aria-hidden': 'true' },
        h('span', { class: 'bar-fill', style: { width: `${Math.max(2, Math.round((topic.correct / topic.total) * 100))}%` } })),
      h('span', { class: 'topic-row-score' }, `${topic.correct} מתוך ${topic.total}`))));

  return screen('results',
    h('h1', { class: 'summary-title', tabindex: '-1', 'data-autofocus': true }, headline),
    h('p', { class: 'results-score', 'aria-label': `${sum.correct} תשובות נכונות מתוך ${sum.total}` },
      h('b', {}, String(sum.correct)), h('span', {}, ` מתוך ${sum.total}`)),
    h('div', { class: 'results-facts' },
      h('span', { class: 'fact' }, '⏱️ זמן: ', h('bdi', { dir: 'ltr' }, formatDuration(sum.timeMs)), ' דקות'),
      sum.timedOut ? h('span', { class: 'fact' }, `⏰ הזמן נגמר ב-${sum.timedOut} ${sum.timedOut === 1 ? 'שאלה' : 'שאלות'}`) : null,
      h('span', { class: 'fact' }, `⭐ צברת ${session.pointsEarned} נקודות`)),
    breakdown,
    newBadgesBlock(),
    mistakes
      ? h('p', { class: 'results-note' }, t('השאלות שטעית בהן יחזרו באימון, כדי שתתאמן עליהן.',
        'השאלות שטעית בהן יחזרו באימון, כדי שתתאמני עליהן.'))
      : h('p', { class: 'results-note' }, 'בלי אף טעות! 💯'),
    h('div', { class: 'summary-actions' },
      mistakes
        ? h('button', { class: 'btn btn-primary btn-review', type: 'button',
          onclick: () => { session.reviewIndex = 0; go('review'); } },
        `🔍 ${t('בוא נעבור על הטעויות', 'בואי נעבור על הטעויות')}`)
        : null,
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: startTest }, '📝 מבחן נוסף'),
      h('button', { class: 'btn btn-ghost', type: 'button', onclick: () => go('home') }, '🏠 הביתה')));
}

function renderReview() {
  const list = session.mistakes;
  const i = Math.min(session.reviewIndex, list.length - 1);
  const a = list[i];
  const q = a.question;
  const marks = { [q.answerIndex]: 'correct' };
  if (!a.timedOut) marks[a.chosen] = 'wrong';
  const isLast = i === list.length - 1;

  const move = (delta) => {
    session.reviewIndex = i + delta;
    render();
  };

  return screen('practice review',
    topBar('עוברים על הטעויות', { back: 'results', backLabel: '→ לתוצאות', extra: counterChip(i + 1, list.length) }),
    questionCard(q),
    choiceGrid(q, { marks }),
    h('div', { class: 'feedback feedback-miss review-box' },
      h('div', { class: 'feedback-head' },
        h('span', { class: 'feedback-icon', 'aria-hidden': 'true' }, a.timedOut ? '⏰' : '💡'),
        h('strong', { class: 'feedback-title' }, a.timedOut
          ? 'הזמן נגמר לפני שבחרת תשובה.'
          : t('בוא נבין את השאלה הזאת.', 'בואי נבין את השאלה הזאת.'))),
      a.timedOut ? null : answerLine('התשובה שלך: ', q, a.chosen),
      correctAnswerLine(q),
      q.explanation ? h('p', { class: 'explanation' }, multiline(q.explanation)) : null),
    h('div', { class: 'review-nav' },
      h('button', { class: 'btn btn-secondary', type: 'button', disabled: i === 0, onclick: () => move(-1) }, '→ הקודמת'),
      isLast
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('results') }, 'סיימנו ✓')
        : h('button', { class: 'btn btn-primary', type: 'button', onclick: () => move(1) }, 'הבאה ←')));
}

// ---------------------------------------------------------------- achievements

function badgeTile(b) {
  const earned = b.earnedAt !== undefined ? !!b.earnedAt : true;
  return h('div', { class: `badge${earned ? '' : ' badge-locked'}` },
    h('span', { class: 'badge-icon', 'aria-hidden': 'true' }, earned ? b.icon : '🔒'),
    h('span', { class: 'badge-name' }, b.name),
    h('span', { class: 'badge-desc' }, b.desc),
    h('span', { class: 'sr-only' }, earned ? 'הושג' : 'עוד לא הושג'));
}

function renderAchievements() {
  const list = progress.badgeList();
  const earned = list.filter((b) => b.earnedAt).length;
  return screen('achievements',
    topBar('הישגים'),
    h('p', { class: 'center' }, `השגת ${earned} מתוך ${list.length} הישגים`),
    h('div', { class: 'badge-grid' }, list.map(badgeTile)));
}

// ---------------------------------------------------------------- parents gate

function renderGate() {
  const a = 6 + Math.floor(Math.random() * 4);
  const b = 6 + Math.floor(Math.random() * 4);
  const input = h('input', { class: 'input', type: 'text', inputmode: 'numeric', autocomplete: 'off',
    'aria-label': 'תשובה', dir: 'ltr' });
  const msg = h('p', { class: 'gate-msg', 'aria-live': 'polite' });
  const submit = (e) => {
    e.preventDefault();
    if (Number(input.value.trim()) === a * b) {
      parentsUnlocked = true;
      go('parents');
    } else {
      msg.textContent = 'לא נכון. האזור הזה מיועד להורים.';
      input.value = '';
      input.focus();
    }
  };
  return screen('gate',
    topBar('אזור הורים'),
    h('form', { class: 'card gate', onsubmit: submit },
      h('p', {}, 'כדי להיכנס, פתרו את התרגיל:'),
      h('p', { class: 'gate-q', dir: 'ltr' }, `${a} × ${b} = ?`),
      input,
      h('button', { class: 'btn btn-primary', type: 'submit' }, 'כניסה'),
      msg));
}

// ---------------------------------------------------------------- parents

function masteryBar(m) {
  return h('span', { class: 'bar bar-small', title: percent(m) },
    h('span', { class: 'bar-fill', style: { width: `${Math.max(2, Math.round(m * 100))}%` } }));
}

function formatSeconds(ms) {
  return ms == null ? '-' : `${(ms / 1000).toFixed(1)} שנ׳`;
}

function formatDate(ts) {
  if (!ts) return 'לא תורגל';
  const key = dayKey(ts);
  const [y, m, d] = key.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

function renderParents() {
  const st = progress.state;
  const totals = st.totals;
  const daysPracticed = Object.values(st.days).filter((d) => d.attempts > 0).length;

  const overview = h('div', { class: 'card' },
    h('h2', {}, 'תמונת מצב'),
    h('div', { class: 'stats-grid' },
      stat('שאלות', totals.attempts),
      stat('דיוק כללי', percent(totals.attempts ? totals.correct / totals.attempts : null)),
      stat('נקודות', st.points),
      stat('ימים ברצף', progress.streak()),
      stat('ימי תרגול', daysPracticed),
      stat('תיקונים אחרי טעות', totals.retriesFixed),
      stat('מבחנים לדוגמה', st.testHistory.length)));

  const weakest = progress.weakestSkills(3);
  const weakCard = h('div', { class: 'card' },
    h('h2', {}, 'הכי כדאי לחזק'),
    weakest.length
      ? h('ol', { class: 'weak-list' }, weakest.map((w) => h('li', {},
        h('b', {}, w.name), ` - דיוק ${percent(w.accuracy)}, רמה ${w.level}, שליטה ${percent(w.mastery)}`)))
      : h('p', {}, 'עוד אין מספיק נתונים.'));

  const topicCards = topics.map((topic) => {
    const sum = progress.topicSummary(topic);
    return h('div', { class: 'card' },
      h('h2', {}, `${topic.icon} ${topic.name}`),
      h('p', {}, `${sum.attempts} שאלות, דיוק ${percent(sum.accuracy)}, שליטה ממוצעת ${percent(sum.mastery)}`),
      h('div', { class: 'table-wrap' },
        h('table', { class: 'skill-table' },
          h('thead', {}, h('tr', {}, ['מיומנות', 'שאלות', 'דיוק', 'רמה', 'שליטה', 'זמן ממוצע', 'תרגול אחרון']
            .map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', {}, sum.skills.map((s) => h('tr', {},
            h('th', { scope: 'row' }, s.name),
            h('td', {}, String(s.attempts)),
            h('td', {}, percent(s.accuracy)),
            h('td', {}, String(s.level)),
            h('td', {}, masteryBar(s.mastery)),
            h('td', {}, formatSeconds(s.avgTimeMs)),
            h('td', {}, formatDate(s.lastPracticed))))))));
  });

  const hist = progress.history(14);
  const maxAttempts = Math.max(1, ...hist.map((d) => d.attempts));
  const chart = h('div', { class: 'card' },
    h('h2', {}, 'תרגול ב-14 הימים האחרונים'),
    h('div', { class: 'chart', role: 'img', 'aria-label': hist.map((d) => `${d.day}: ${d.correct}/${d.attempts}`).join(', ') },
      hist.map((d) => {
        const total = Math.round((d.attempts / maxAttempts) * 100);
        const ok = d.attempts ? Math.round((d.correct / d.attempts) * total) : 0;
        return h('div', { class: 'chart-col', title: `${formatDate(new Date(d.day + 'T12:00').getTime())}: ${d.correct} נכונות מתוך ${d.attempts}` },
          h('div', { class: 'chart-bar' },
            h('div', { class: 'chart-total', style: { height: `${total}%` } },
              h('div', { class: 'chart-ok', style: { height: `${total ? (ok / total) * 100 : 0}%` } }))),
          h('span', { class: 'chart-label' }, d.day.slice(8)),
          h('span', { class: 'chart-count' }, d.attempts ? String(d.attempts) : ''));
      })),
    h('p', { class: 'chart-legend' },
      h('span', { class: 'legend legend-ok' }), ' נכונות ',
      h('span', { class: 'legend legend-miss' }), ' טעויות'));

  const errors = loadErrors.length
    ? h('div', { class: 'card card-warn' },
      h('h2', {}, 'תקלה בטעינת נושאים'),
      loadErrors.map((e) => h('p', { dir: 'ltr' }, `${e.module}: ${e.error}`)))
    : null;

  return screen('parents',
    topBar('אזור הורים'),
    errors,
    overview,
    renderTestHistoryCard(),
    weakCard,
    chart,
    topicCards,
    renderSettingsCard(),
    renderDataCard());
}

function stat(label, value) {
  return h('div', { class: 'stat' }, h('b', {}, String(value)), h('span', {}, label));
}

const TEST_CHART_COUNT = 10;
const TEST_TABLE_COUNT = 20;

function renderTestHistoryCard() {
  const list = progress.testHistory();
  if (!list.length) {
    return h('div', { class: 'card test-history' },
      h('h2', {}, 'מבחנים לדוגמה'),
      h('p', {}, 'עוד לא נעשה מבחן לדוגמה. התוצאות של כל מבחן יופיעו כאן, כדי לראות שיפור לאורך זמן.'));
  }

  const pct = (e) => Math.round((e.correct / e.total) * 100);
  const recent = list.slice(-TEST_CHART_COUNT);
  const chart = h('div', { class: 'chart chart-tests', role: 'img',
    'aria-label': recent.map((e) => `${formatDate(e.at)}: ${e.correct}/${e.total}`).join(', ') },
  recent.map((e) => h('div', { class: 'chart-col', title: `${formatDate(e.at)}: ${e.correct} מתוך ${e.total}` },
    h('span', { class: 'chart-count' }, `${pct(e)}%`),
    h('div', { class: 'chart-bar' },
      h('div', { class: 'chart-score', style: { height: `${Math.max(2, pct(e))}%` } })),
    h('span', { class: 'chart-label' }, formatDate(e.at).slice(0, 5)))));

  const rows = list.slice(-TEST_TABLE_COUNT).reverse();
  const table = h('div', { class: 'table-wrap' },
    h('table', { class: 'skill-table' },
      h('thead', {}, h('tr', {},
        ['תאריך', 'ציון', ...topics.map((topic) => topic.name), 'זמן', 'נגמר הזמן'].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', {}, rows.map((e) => h('tr', {},
        h('th', { scope: 'row' }, formatDate(e.at)),
        h('td', {}, `${e.correct}/${e.total} (${pct(e)}%)`),
        topics.map((topic) => {
          const tp = e.topics[topic.id];
          return h('td', {}, tp ? `${tp.correct}/${tp.total}` : '-');
        }),
        h('td', {}, h('bdi', { dir: 'ltr' }, formatDuration(e.timeMs))),
        h('td', {}, String(e.timedOut)))))));

  return h('div', { class: 'card test-history' },
    h('h2', {}, 'מבחנים לדוגמה'),
    h('p', {}, `אחוז התשובות הנכונות ב-${recent.length} המבחנים האחרונים (הישן משמאל):`),
    chart,
    table);
}

function selectField(label, key, options, suffix) {
  const current = progress.settings[key];
  const opts = options.includes(current) ? options : [...options, current].sort((a, b) => a - b);
  const [lo, hi] = SETTING_LIMITS[key];
  return h('label', { class: 'field' }, h('span', {}, label),
    h('select', { class: 'input', onchange: (e) => saveSetting({ [key]: Number(e.target.value) }) },
      opts.filter((o) => o >= lo && o <= hi).map((o) => h('option', { value: String(o), selected: o === current }, `${o} ${suffix}`))));
}

function checkField(label, key) {
  return h('label', { class: 'field field-check' },
    h('input', { type: 'checkbox', checked: progress.settings[key],
      onchange: (e) => saveSetting({ [key]: e.target.checked }) }),
    h('span', {}, label));
}

function saveSetting(patch) {
  progress.updateSettings(patch);
  showToast('נשמר ✓');
}

function renderSettingsCard() {
  const name = h('input', { class: 'input', type: 'text', value: progress.settings.name, maxlength: '30',
    onchange: (e) => {
      if (!e.target.value.trim()) {
        e.target.value = progress.settings.name;
        showToast('השם לא יכול להיות ריק');
        return;
      }
      saveSetting({ name: e.target.value });
    } });
  const gender = h('select', { class: 'input', onchange: (e) => saveSetting({ gender: e.target.value }) },
    [['boy', 'בן (לשון זכר)'], ['girl', 'בת (לשון נקבה)']].map(([value, label]) =>
      h('option', { value, selected: progress.settings.gender === value }, label)));
  return h('div', { class: 'card' },
    h('h2', {}, 'הגדרות'),
    h('div', { class: 'settings' },
      h('label', { class: 'field' }, h('span', {}, 'שם'), name),
      h('label', { class: 'field' }, h('span', {}, 'פנייה לילד/ה'), gender),
      selectField('שאלות בסיבוב אימון', 'sessionLength', SESSION_LENGTH_OPTIONS, 'שאלות'),
      selectField('שאלות במבחן לדוגמה', 'examLength', EXAM_LENGTH_OPTIONS, 'שאלות'),
      selectField('זמן לשאלה', 'timerSeconds', TIMER_OPTIONS, 'שניות'),
      checkField('טיימר גם באימון', 'timedDefault'),
      checkField('צלילים', 'sound')));
}

function renderDataCard() {
  const fileInput = h('input', { type: 'file', accept: 'application/json,.json', class: 'sr-only', id: 'import-file',
    onchange: (e) => importFile(e.target.files?.[0]) });
  return h('div', { class: 'card' },
    h('h2', {}, 'גיבוי והעברה בין מכשירים'),
    h('p', {}, 'ההתקדמות נשמרת בדפדפן הזה בלבד. כדי להעביר למכשיר אחר: שמרו קובץ כאן וטענו אותו שם.'),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: exportFile }, '⬇️ שמירת קובץ התקדמות'),
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => fileInput.click() }, '⬆️ טעינת קובץ התקדמות'),
      fileInput),
    storage ? null : h('p', { class: 'notice' }, 'שימו לב: הדפדפן חוסם שמירה מקומית, ההתקדמות תימחק בסגירת הדף. מומלץ לשמור קובץ.'),
    h('h2', {}, 'איפוס'),
    h('button', { class: 'btn btn-danger', type: 'button', onclick: resetProgress }, '🗑️ איפוס כל ההתקדמות'));
}

function exportFile() {
  const blob = new Blob([progress.exportData()], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = h('a', { href: url, download: `gifted-prep-progress-${dayKey(Date.now())}.json` });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function importFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = () => {
    if (!window.confirm('הטעינה תחליף את ההתקדמות הנוכחית במכשיר הזה. להמשיך?')) return;
    try {
      progress.importData(String(reader.result));
      showToast('ההתקדמות נטענה ✓');
      render();
    } catch (err) {
      window.alert(err.message);
    }
  };
  reader.onerror = () => window.alert('לא הצלחתי לקרוא את הקובץ.');
  reader.readAsText(file);
}

function resetProgress() {
  if (!window.confirm('למחוק את כל ההתקדמות, הנקודות וההישגים? אי אפשר לבטל.')) return;
  if (!window.confirm('בטוח? מומלץ לשמור קובץ התקדמות לפני כן.')) return;
  progress.reset();
  showToast('ההתקדמות אופסה');
  render();
}

// ---------------------------------------------------------------- toast

let toastTimer = null;

function showToast(text) {
  let el = document.getElementById('toast');
  if (!el) {
    el = h('div', { id: 'toast', class: 'toast', role: 'status' });
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 1800);
}

// ---------------------------------------------------------------- boot

document.addEventListener('keydown', (e) => {
  const screenName = app.dataset.screen;
  if ((screenName !== 'practice' && screenName !== 'test') || e.altKey || e.ctrlKey || e.metaKey) return;
  if (e.target instanceof HTMLInputElement) return;
  const idx = ['1', '2', '3', '4'].indexOf(e.key);
  if (idx < 0 || !session?.current || session.current.answered || idx >= session.current.question.choices.length) return;
  if (screenName === 'test') answerTest(idx);
  else answer(idx);
});

watchHebrewVoice((available) => {
  speechAvailable = available;
  document.querySelectorAll('[data-speak]').forEach((b) => { b.hidden = !available; });
});

if (new URLSearchParams(location.search).has('e2e')) {
  window.__e2e = { progress, startSession, startTest, go, get session() { return session; } };
}

window.addEventListener('hashchange', render);
render();
