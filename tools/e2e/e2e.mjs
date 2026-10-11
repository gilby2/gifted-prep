// End-to-end QA run in headless Chromium (Playwright). NOT part of CI: it needs
// a Playwright install and a static server. Usage:
//
//   python3 -m http.server 8765            # from a parent dir, to test a subpath
//   PLAYWRIGHT_DIR=/path/to/node_modules/playwright \
//   node tools/e2e/e2e.mjs --base http://127.0.0.1:8765/repo/ --out /tmp/e2e
//
// The app exposes window.__e2e only when the URL has ?e2e (see js/app/main.js).
// Exit code 1 if any check fails. Writes report.json and PNG screenshots to --out.

import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1]]);
  return acc;
}, []));
const BASE = (args.base ?? 'http://127.0.0.1:8765/repo/').replace(/\/?$/, '/');
const OUT = path.resolve(args.out ?? 'tools/e2e/out');
const BULK = Number(args.bulk ?? 2); // questions per skill per level
fs.mkdirSync(OUT, { recursive: true });

function loadPlaywright() {
  const candidates = [process.env.PLAYWRIGHT_DIR, 'playwright'].filter(Boolean);
  const req = createRequire(import.meta.url);
  for (const c of candidates) {
    try { return req(c); } catch { /* next */ }
  }
  throw new Error('playwright not found; set PLAYWRIGHT_DIR');
}
const { chromium } = loadPlaywright();

const VIEWPORTS = { phone: { width: 390, height: 844 }, tablet: { width: 820, height: 1180 }, desktop: { width: 1280, height: 800 } };
const failures = [];
const notes = [];
const report = { base: BASE, flows: {}, bulk: {}, consoleErrors: [], pageErrors: [], failedRequests: [], badQuestions: [], perf: {} };

function check(cond, msg) {
  if (!cond) failures.push(msg);
  return !!cond;
}

const STORAGE_KEY = 'gifted-prep:progress:v1';
const DEFAULT_PROFILE = { name: 'יונתן' }; // an old save: a name and no gender

// `profile` seeds a saved name (skips onboarding) unless storage already has a
// save; null starts as a first visit.
async function newPage(browser, viewport = VIEWPORTS.phone, { clock = false, profile = DEFAULT_PROFILE } = {}) {
  const context = await browser.newContext({ viewport, locale: 'he-IL', acceptDownloads: true, reducedMotion: 'reduce' });
  if (profile) {
    await context.addInitScript(({ key, settings }) => {
      if (!localStorage.getItem(key)) localStorage.setItem(key, JSON.stringify({ version: 1, settings }));
    }, { key: STORAGE_KEY, settings: profile });
  }
  const page = await context.newPage();
  if (clock) await page.clock.install();
  page.on('console', (m) => { if (m.type() === 'error') report.consoleErrors.push(`${m.text()} @ ${m.location().url}`); });
  page.on('pageerror', (e) => report.pageErrors.push(String(e)));
  page.on('requestfailed', (r) => report.failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on('dialog', (d) => d.accept());
  return { context, page };
}

async function open(page, hash = '') {
  await page.goto(`${BASE}?e2e${hash}`);
  await page.waitForFunction(() => window.__e2e && document.querySelector('#app .screen'));
}

const q = (page) => page.evaluate(() => {
  const c = window.__e2e.session?.current;
  if (!c) return null;
  const { question } = c;
  return { ...question, visual: question.visual ? { svg: question.visual.svg.length } : null };
});

// Inspects the rendered practice screen and returns a list of problems.
async function inspectQuestion(page) {
  return page.evaluate(async () => {
    const problems = [];
    const { checkQuestion } = await import(new URL('js/app/contract.js', document.baseURI).href);
    const question = window.__e2e.session.current.question;
    problems.push(...checkQuestion(question, question.skillId).map((p) => `contract: ${p}`));
    const screen = document.querySelector('.screen.practice');
    if (!screen) return ['no practice screen'];
    const text = screen.innerText;
    if (/\bundefined\b|\bnull\b|\bNaN\b|\[object|Infinity/.test(text)) problems.push(`bad token in text: ${text.slice(0, 120)}`);
    const prompt = screen.querySelector('.prompt');
    if (!prompt || !prompt.innerText.trim()) problems.push('empty prompt');
    if (question.passage && !screen.querySelector('.passage')?.innerText.trim()) problems.push('empty passage');
    const vw = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > vw + 1) problems.push(`page scrolls horizontally ${document.documentElement.scrollWidth}>${vw}`);
    if (question.visual) {
      const svg = screen.querySelector('.visual svg');
      const r = svg?.getBoundingClientRect();
      if (!svg || r.width < 60 || r.height < 40) problems.push(`visual too small/blank ${r?.width}x${r?.height}`);
      else if (!svg.querySelector('*') || svg.getBBox().width < 5) problems.push('visual svg has no drawn content');
      if (r && (r.left < -1 || r.right > vw + 1)) problems.push('visual overflows viewport');
    }
    const buttons = [...screen.querySelectorAll('.choice')];
    if (buttons.length !== question.choices.length) problems.push(`rendered ${buttons.length} of ${question.choices.length} choices`);
    if (buttons.length < 3 || buttons.length > 4) problems.push(`choice count ${buttons.length}`);
    buttons.forEach((b, i) => {
      const r = b.getBoundingClientRect();
      if (r.width < 40 || r.height < 40) problems.push(`choice ${i} too small ${r.width}x${r.height}`);
      if (r.left < -1 || r.right > vw + 1) problems.push(`choice ${i} outside viewport`);
      if (b.scrollWidth > b.clientWidth + 2) problems.push(`choice ${i} content overflows (${b.scrollWidth}>${b.clientWidth})`);
      const t = b.querySelector('.choice-text');
      if (t && t.scrollWidth > t.clientWidth + 2) problems.push(`choice ${i} text overflows`);
      const fig = b.querySelector('.choice-figure svg');
      if (question.choices[i].svg) {
        const fr = fig?.getBoundingClientRect();
        if (!fig || fr.width < 40 || fr.height < 30) problems.push(`choice ${i} figure blank/small ${fr?.width}x${fr?.height}`);
      } else if (!t || !t.innerText.trim()) problems.push(`choice ${i} empty text`);
    });
    return problems;
  });
}

// Every arithmetic run (e.g. "33 + 13 = 46", "5, 7, 10, ?") must be laid out
// left-to-right on screen even inside RTL text. Measures glyph positions.
async function inspectBidi(page) {
  return page.evaluate(() => {
    const problems = [];
    const RUN = /\d+(?:\s*(?:[+\-−×:=,]|\s)\s*(?:\d+|\?))+/g;
    const roots = document.querySelectorAll('.prompt, .passage, .explanation, .feedback-answer, .choice-text');
    for (const root of roots) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      let t;
      while ((t = walker.nextNode())) {
        for (const m of t.data.matchAll(RUN)) {
          if (/^\d+:\d\d$/.test(m[0])) continue; // clock time
          // Comma lists in prose ("הספרות 6, 7, 8") read right-to-left by design;
          // only operator expressions and series with a "?" must be LTR.
          if (!/[+\-−×=?]/.test(m[0]) && !/\d:\s/.test(m[0])) continue;
          const xs = [];
          for (const n of m[0].matchAll(/\d+/g)) {
            const r = document.createRange();
            r.setStart(t, m.index + n.index);
            r.setEnd(t, m.index + n.index + n[0].length);
            const rect = r.getBoundingClientRect();
            xs.push([Math.round(rect.top), rect.x]);
          }
          for (let i = 1; i < xs.length; i++) {
            if (Math.abs(xs[i][0] - xs[i - 1][0]) < 4 && xs[i][1] < xs[i - 1][1]) {
              problems.push(`reversed math in ${root.className}: "${m[0]}" (${JSON.stringify(t.data.slice(0, 80))})`);
              break;
            }
          }
        }
      }
    }
    return problems;
  });
}

async function answer(page, correct) {
  const cur = await q(page);
  const idx = correct ? cur.answerIndex : (cur.answerIndex + 1) % cur.choices.length;
  await page.click(`.choice[data-index="${idx}"]`);
  await page.waitForSelector('#feedback .btn-next');
  const bidi = await inspectBidi(page);
  if (bidi.length) report.badQuestions.push({ flow: 'bidi', skillId: cur.skillId, key: cur.key, probs: bidi });
  return cur;
}

async function next(page) {
  await page.click('#feedback .btn-next');
  await page.waitForFunction(() => !document.querySelector('#feedback .btn-next'));
}

// Test simulation: pick an answer (or let the timer run out), check that no
// feedback is shown, and wait for the auto-advance. With a fake clock the
// caller passes `clock` so the advance timer can be run.
async function answerTest(page, correct, { clock = false } = {}) {
  const cur = await q(page);
  const index = await page.evaluate(() => window.__e2e.session.index);
  const idx = correct ? cur.answerIndex : (cur.answerIndex + 1) % cur.choices.length;
  await page.click(`.choice[data-index="${idx}"]`);
  check(await page.locator('.choice.is-picked').count() === 1, 'test marks the picked choice');
  check(await page.locator('.choice.is-correct, .choice.is-wrong, #feedback').count() === 0, 'test shows no feedback');
  check(await page.locator('.confetti-canvas').count() === 0, 'test shows no confetti');
  if (clock) await page.clock.runFor(800);
  await page.waitForFunction((i) => window.__e2e.session?.index !== i || !!window.__e2e.session?.summary, index);
  return cur;
}

async function testResultsReady(page) {
  await page.waitForSelector('.screen.results');
}

async function startVia(page, opts) {
  await page.evaluate((o) => window.__e2e.startSession(o), opts);
  await page.waitForSelector('.screen.practice .choice');
}

// Starts single-skill sessions until `pred(question)` holds.
async function findQuestion(page, skillId, level, predSrc = 'true') {
  for (let i = 0; i < 300; i++) {
    const ok = await page.evaluate(({ skillId, level, predSrc }) => {
      const e = window.__e2e;
      e.progress.state.retryQueue = [];
      e.progress.skillState(skillId).level = level;
      e.startSession({ mode: 'skill', focusSkillId: skillId });
      const question = e.session.current.question;
      // eslint-disable-next-line no-new-func
      return question.level === level && new Function('q', `return (${predSrc});`)(question);
    }, { skillId, level, predSrc });
    if (ok) {
      await page.waitForSelector('.screen.practice .choice');
      return true;
    }
  }
  return false;
}

const shot = (page, name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true });

// ------------------------------------------------------------------ flows

async function flowCore(browser) {
  const { context, page } = await newPage(browser);
  const r = (report.flows.core = {});

  // First visit
  const t0 = Date.now();
  await open(page);
  r.homeReadyMs = Date.now() - t0;
  check(await page.evaluate(() => document.querySelector('#app').dataset.screen) === 'home', 'saved name skips onboarding');
  check(await page.locator('.greeting').innerText() === 'שלום יונתן!', 'home greeting');
  check(await page.evaluate(() => window.__e2e.progress.settings.gender) === 'boy', 'old save without gender defaults to boy');
  check(await page.locator('.topic-card').count() === 3, 'home has 3 topic cards');
  check(await page.locator('.home-sub').innerText() === 'מוכן לאתגר של היום?', 'first-visit subtitle');
  check(await page.locator('.mode-practice').count() === 1 && await page.locator('.mode-test').count() === 1, 'home shows both modes');
  check(await page.locator('.mode-practice .section-title').innerText() === 'או בחר נושא:', 'masculine topic prompt');

  // Mixed session of 10, wrong on Q1, Q2, Q6
  await page.click('.btn-huge');
  await page.waitForSelector('.screen.practice .choice');
  r.timeToFirstQuestionMs = Date.now() - t0;
  check(await page.locator('.dot').count() === 10, 'mixed session has 10 dots');
  const wrongAt = new Set([1, 2, 6]);
  const seq = [];
  for (let n = 1; n <= 10; n++) {
    const probs = await inspectQuestion(page);
    const cur = await answer(page, !wrongAt.has(n));
    if (probs.length) report.badQuestions.push({ flow: 'mixed', key: cur.key, probs });
    seq.push({ n, key: cur.key, skillId: cur.skillId, retryKind: cur.retryKind ?? null,
      retryTag: await page.locator('.tag-retry').count() });
    const fb = await page.locator('#feedback').getAttribute('class');
    check(fb.includes(wrongAt.has(n) ? 'feedback-miss' : 'feedback-ok'), `mixed Q${n} feedback class ${fb}`);
    if (wrongAt.has(n)) check(await page.locator('.feedback-answer').count() === 1, `Q${n} shows correct answer`);
    await next(page);
  }
  r.mixedSequence = seq;
  // Re-queue: Q1 wrong -> variant ~Q5, exact copy of Q1 ~Q8
  const exactOfQ1 = seq.find((s) => s.n > 1 && s.key === seq[0].key);
  check(exactOfQ1 && exactOfQ1.retryKind === 'exact' && exactOfQ1.retryTag === 1, `Q1 reappears as exact retry: ${JSON.stringify(seq.map((s) => [s.n, s.retryKind]))}`);
  check(seq.some((s) => s.retryKind === 'variant' && s.skillId === seq[0].skillId), 'Q1 skill variant retry shown');

  // Summary
  await page.waitForSelector('.screen.summary');
  const score = await page.locator('.summary-score').innerText();
  const expectedCorrect = 10 - wrongAt.size;
  r.summary = score;
  check(score === `ענית נכון על ${expectedCorrect} מתוך 10 שאלות`, `summary score "${score}"`);

  // Topic sessions
  for (const topicIdx of [0, 1, 2]) {
    await page.click('.summary .btn-ghost, .btn-back').catch(() => {});
    await open(page);
    const topicId = await page.evaluate((i) => window.__e2e.progress.topics?.[i]?.id ?? null, topicIdx);
    await page.locator('.topic-card').nth(topicIdx).click();
    await page.waitForSelector('.screen.practice .choice');
    const title = await page.locator('.topbar-title').innerText();
    const skills = [];
    for (let n = 1; n <= 10; n++) {
      const probs = await inspectQuestion(page);
      const cur = await answer(page, n % 3 !== 0);
      if (probs.length) report.badQuestions.push({ flow: `topic ${title}`, key: cur.key, probs });
      skills.push(cur.skillId);
      await next(page);
    }
    const prefixes = new Set(skills.map((s) => s.split('.')[0]));
    r[`topic_${topicIdx}`] = { title, skills };
    check(prefixes.size === 1, `topic session ${title} stayed on one topic: ${[...prefixes]}`);
    if (topicId) check(prefixes.has(topicId), `topic session ${title} matches ${topicId}`);
    await page.waitForSelector('.screen.summary');
  }

  // Achievements
  await open(page, '#achievements');
  const badges = await page.locator('.badge').count();
  const locked = await page.locator('.badge-locked').count();
  r.achievements = { badges, locked, text: await page.locator('.screen p.center').innerText() };
  check(badges > 0 && locked < badges, `achievements: ${badges} badges, ${locked} locked`);

  // Parents gate
  await open(page, '#parents');
  check(await page.evaluate(() => document.querySelector('#app').dataset.screen) === 'gate', 'parents redirects to gate');
  await page.fill('.gate input', '1');
  await page.click('.gate button[type=submit]');
  check((await page.locator('.gate-msg').innerText()).includes('לא נכון'), 'gate rejects wrong answer');
  const [a, b] = (await page.locator('.gate-q').innerText()).match(/\d+/g).map(Number);
  await page.fill('.gate input', String(a * b));
  await page.click('.gate button[type=submit]');
  await page.waitForSelector('.screen.parents');
  r.parentsTables = await page.locator('.skill-table').count();
  check(r.parentsTables === 3, 'parents shows 3 skill tables');
  const attemptsShown = await page.locator('.stat b').first().innerText();
  check(attemptsShown === '40', `parents total attempts ${attemptsShown} (expect 40)`);

  check(await page.locator('.test-history').count() === 1, 'parents shows test history card');

  // Settings: an empty name is refused, then name, gender, lengths and timer
  await page.fill('.settings input.input[type=text]', '');
  await page.locator('.settings input.input[type=text]').dispatchEvent('change');
  check(await page.evaluate(() => window.__e2e.progress.settings.name) === 'יונתן', 'empty name is not saved');
  check(await page.inputValue('.settings input.input[type=text]') === 'יונתן', 'empty name input restored');
  await page.fill('.settings input.input[type=text]', 'נועה');
  await page.locator('.settings input.input[type=text]').dispatchEvent('change');
  await page.locator('.settings select').nth(0).selectOption('girl');
  await page.locator('.settings select').nth(1).selectOption('5');
  check(await page.locator('.settings select').nth(2).locator('option').allInnerTexts()
    .then((o) => o.join(',') === '10 שאלות,15 שאלות,20 שאלות'), 'exam length options 10/15/20');
  await page.locator('.settings select').nth(3).selectOption('30');
  await page.locator('.settings input[type=checkbox]').first().check();
  const settings = await page.evaluate(() => ({ ...window.__e2e.progress.settings }));
  r.settings = settings;
  check(settings.name === 'נועה' && settings.gender === 'girl' && settings.sessionLength === 5 && settings.timerSeconds === 30
    && settings.timedDefault === true, `settings saved ${JSON.stringify(settings)}`);
  await shot(page, 'flow_parents_after_settings');

  // Export
  const [download] = await Promise.all([page.waitForEvent('download'), page.click('.row .btn-secondary >> nth=0')]);
  const exportPath = path.join(OUT, 'export.json');
  await download.saveAs(exportPath);
  const exported = JSON.parse(fs.readFileSync(exportPath, 'utf8'));
  const pointsBefore = exported.state.points;
  r.export = { file: download.suggestedFilename(), points: pointsBefore, attempts: exported.state.totals.attempts };
  check(exported.app === 'gifted-prep' && pointsBefore > 0, 'export JSON valid with points');
  check(exported.state.settings.gender === 'girl', 'export carries gender');
  check(!/amiad/.test(download.suggestedFilename()), `export file name is not personal: ${download.suggestedFilename()}`);

  // Reset (two confirms auto-accepted)
  await page.click('.btn-danger');
  await page.waitForFunction(() => window.__e2e.progress.state.points === 0);
  check(await page.locator('.stat b').first().innerText() === '0', 'reset shows 0 attempts');
  check(await page.evaluate(() => window.__e2e.progress.settings.name) === 'נועה', 'reset keeps settings');

  // Import
  await page.setInputFiles('#import-file', exportPath);
  await page.waitForFunction((p) => window.__e2e.progress.state.points === p, pointsBefore);
  check(await page.locator('.stat b').first().innerText() === '40', 'import restores attempts');

  // Settings take effect + reload persistence
  await page.goto(`${BASE}?e2e`);
  await page.waitForSelector('.greeting');
  check(await page.locator('.greeting').innerText() === 'שלום נועה!', 'name persists after reload');
  check(await page.locator('.mode-practice .section-title').innerText() === 'או בחרי נושא:', 'gender setting switches home text');
  const chip = await page.locator('.chip b').first().innerText();
  check(Number(chip) === pointsBefore, `points persist after reload ${chip} vs ${pointsBefore}`);
  check(await page.locator('.home-sub').innerText() === 'איזה כיף שחזרת! עוד סיבוב?', 'returning subtitle');
  await page.click('.btn-huge');
  await page.waitForSelector('.screen.practice .choice');
  check(await page.locator('.dot').count() === 5, 'session length 5 after settings');
  check(await page.locator('.timer').count() === 1, 'timer shown when timedDefault on');
  check((await page.locator('.timer-fill').getAttribute('style')).includes('30000ms'), 'timer is 30s');

  // Corrupt storage must not crash; the name is lost, so onboarding comes back
  await page.evaluate((key) => localStorage.setItem(key, '{broken'), STORAGE_KEY);
  await page.goto(`${BASE}?e2e`);
  await page.waitForSelector('.screen.welcome');
  check(await page.locator('.gender-btn').count() === 2, 'corrupt storage boots into onboarding');
  await page.fill('#welcome-name', 'נועה');
  await page.click('.gender-btn[data-gender=girl]');
  await page.click('.welcome-card button[type=submit]');
  await page.waitForSelector('.greeting');
  check(await page.locator('.topic-card').count() === 3, 'home after onboarding has topics');

  // Bad import file
  report.dialogs = [];
  page.removeAllListeners('dialog');
  page.on('dialog', (d) => { report.dialogs.push(d.message()); d.accept(); });
  await page.goto(`${BASE}?e2e#parents`);
  const [x, y] = (await page.locator('.gate-q').innerText()).match(/\d+/g).map(Number);
  await page.fill('.gate input', String(x * y));
  await page.click('.gate button[type=submit]');
  await page.waitForSelector('.screen.parents');
  const badFile = path.join(OUT, 'bad.json');
  fs.writeFileSync(badFile, '{"hello":1}');
  await page.setInputFiles('#import-file', badFile);
  await page.waitForFunction(() => true);
  await page.waitForTimeout(300);
  check(report.dialogs.some((m) => m.includes('אינו קובץ התקדמות')), `bad import alerts: ${report.dialogs}`);

  await context.close();
}

async function flowOnboarding(browser) {
  const r = (report.flows.onboarding = {});
  for (const [gender, vpName] of [['girl', 'phone'], ['boy', 'desktop']]) {
    const { context, page } = await newPage(browser, VIEWPORTS[vpName], { profile: null });
    await open(page);
    check(await page.evaluate(() => document.querySelector('#app').dataset.screen) === 'welcome', 'first visit shows onboarding');
    await open(page, '#parents');
    check(await page.evaluate(() => document.querySelector('#app').dataset.screen) === 'welcome', 'onboarding comes before any screen');
    check(await page.locator('.welcome-title').innerText() === 'שלום! איך קוראים לך?', 'onboarding title');
    await shot(page, `${vpName}_00_welcome_empty`);

    await page.click('.welcome-card button[type=submit]');
    check((await page.locator('.welcome-msg').innerText()).includes('שם'), 'onboarding asks for a name');
    const name = gender === 'girl' ? 'מאיה' : 'איתי';
    await page.fill('#welcome-name', `  ${name} `);
    await page.click('.welcome-card button[type=submit]');
    check((await page.locator('.welcome-msg').innerText()).includes('בן או בת'), 'onboarding asks for boy/girl');
    await page.click(`.gender-btn[data-gender=${gender}]`);
    check(await page.getAttribute(`.gender-btn[data-gender=${gender}]`, 'aria-pressed') === 'true', 'gender button pressed');
    await shot(page, `${vpName}_00_welcome_${gender}`);
    await page.click('.welcome-card button[type=submit]');
    await page.waitForSelector('.greeting');
    const settings = await page.evaluate(() => ({ ...window.__e2e.progress.settings }));
    check(settings.name === name && settings.gender === gender, `onboarding saved ${JSON.stringify(settings)}`);
    check(await page.locator('.greeting').innerText() === `שלום ${name}!`, 'greeting uses the new name');
    const sub = await page.locator('.home-sub').innerText();
    check(sub === (gender === 'girl' ? 'מוכנה לאתגר של היום?' : 'מוכן לאתגר של היום?'), `gendered subtitle "${sub}"`);
    await shot(page, `${vpName}_01_home_${gender}`);

    // Feedback phrases follow the gender: no masculine-only phrase for a girl.
    const MASC = /(^|\s)(אתה|בוא|מוכן|תצליח|יודע|משתפר|מתאמן|לומד|אלוף|חכם|גאון|תותח)(\s|[.,!?]|$)/;
    const FEM = /(^|\s)(בואי|מוכנה|תצליחי|יודעת|משתפרת|מתאמנת|לומדת|אלופה|גאונה|תותחית)(\s|[.,!?]|$)/;
    const titles = [];
    await page.evaluate(() => window.__e2e.progress.updateSettings({ sessionLength: 20 }));
    await startVia(page, { mode: 'mixed' });
    for (let i = 0; i < 20; i++) {
      await answer(page, i % 2 === 0);
      titles.push(await page.locator('.feedback-title').innerText());
      titles.push(...await page.locator('.tag-retry').allInnerTexts());
      await next(page);
    }
    r[gender] = titles;
    const wrongForm = titles.filter((x) => (gender === 'girl' ? MASC : FEM).test(x));
    check(wrongForm.length === 0, `${gender} saw wrong-gender phrases: ${wrongForm}`);
    for (let i = 1; i < titles.length; i++) {
      if (titles[i] === titles[i - 1]) check(false, `phrase repeated immediately: ${titles[i]}`);
    }
    await context.close();
  }
}

async function flowExam(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS.phone, { clock: true });
  const r = (report.flows.exam = {});
  await open(page);
  await page.click('.btn-test');
  await page.waitForSelector('.screen.test-mode .choice');
  r.dots = await page.locator('.dot').count();
  check(r.dots === 15, `exam has 15 questions (${r.dots})`);
  check(await page.locator('.timer').count() === 1, 'exam shows timer');
  check((await page.locator('.timer-fill').getAttribute('style')).includes('45000ms'), 'exam timer is 45s');
  check(await page.locator('.topbar-title').innerText() === 'מבחן לדוגמה', 'exam title');
  const plan = await page.evaluate(() => window.__e2e.session.questions.map((x) => ({ key: x.key, skillId: x.skillId, retryKind: x.retryKind })));
  const perTopic = {};
  for (const x of plan) perTopic[x.skillId.split('.')[0]] = (perTopic[x.skillId.split('.')[0]] ?? 0) + 1;
  r.perTopic = perTopic;
  check(Object.keys(perTopic).length === 3 && Object.values(perTopic).every((n) => n === 5), `exam spans topics evenly ${JSON.stringify(perTopic)}`);
  check(new Set(plan.map((x) => x.key)).size === 15 && plan.every((x) => !x.retryKind), 'exam questions are distinct and never retries');
  const probs = await inspectQuestion(page);
  if (probs.length) report.badQuestions.push({ flow: 'exam', probs });

  // Q1 answered correctly; a late second click must not double-record
  await page.click(`.choice[data-index="${(await q(page)).answerIndex}"]`);
  const attemptsBefore = await page.evaluate(() => window.__e2e.progress.state.totals.attempts);
  await page.locator('.choice').nth(0).click({ force: true });
  check(await page.evaluate(() => window.__e2e.progress.state.totals.attempts) === attemptsBefore, 'no double answer in test');
  check(await page.locator('#feedback, .feedback').count() === 0, 'no feedback after a test answer');
  check(await page.locator('.choice.is-picked').count() === 1, 'picked choice marked');
  await shot(page, 'phone_test_picked');
  await page.clock.runFor(800);
  await page.waitForFunction(() => window.__e2e.session.index === 1);
  check(await page.locator('.chip-counter [aria-hidden]').innerText() === '2/15', 'counter shows 2/15');

  // Q2 times out, then moves on by itself
  await page.clock.runFor(46_000);
  await page.waitForSelector('.choice:disabled');
  r.timeoutStatus = await page.locator('#test-status').innerText();
  check(r.timeoutStatus.includes('הזמן נגמר'), `timeout status "${r.timeoutStatus}"`);
  check(await page.locator('.choice.is-correct').count() === 0, 'timeout does not reveal the answer');
  await shot(page, 'phone_test_timeout');
  await page.clock.runFor(1600);
  await page.waitForFunction(() => window.__e2e.session.index === 2);

  for (let n = 3; n <= 15; n++) {
    if (n === 3) await shot(page, 'phone_test_question');
    await answerTest(page, n % 2 === 0, { clock: true });
  }
  await testResultsReady(page);
  r.score = await page.locator('.results-score').innerText();
  check(await page.locator('.results-score b').innerText() === '7', `test score ${r.score}`);
  check(await page.locator('.topic-row').count() === 3, 'results show 3 topic rows');
  r.facts = await page.locator('.results-facts').innerText();
  check(r.facts.includes('הזמן נגמר ב-1 שאלה'), `results mention the timeout: ${r.facts}`);
  const state = await page.evaluate(() => {
    const p = window.__e2e.progress;
    return { exams: p.state.totals.exams, history: p.state.testHistory, queue: p.state.retryQueue.length, attempts: p.state.totals.attempts };
  });
  check(state.exams === 1 && state.history.length === 1 && state.history[0].correct === 7, `test history stored ${JSON.stringify(state.history)}`);
  check(state.queue === 16, `8 test mistakes re-queued as 16 retries (${state.queue})`);
  check(state.attempts === 15, `test answers count in stats (${state.attempts})`);
  await shot(page, 'phone_test_results');

  // Mistakes review
  const reviewBtn = await page.locator('.btn-review').innerText();
  check(reviewBtn.includes('בוא נעבור על הטעויות'), `review button "${reviewBtn}"`);
  await page.click('.btn-review');
  await page.waitForSelector('.screen.review');
  check(await page.locator('.chip-counter [aria-hidden]').innerText() === '1/8', 'review has 8 mistakes');
  check((await page.locator('.review-box .feedback-title').innerText()).includes('הזמן נגמר'), 'first mistake is the timeout');
  check(await page.locator('.choice.is-correct').count() === 1 && await page.locator('.choice.is-wrong').count() === 0, 'timeout review marks only the answer');
  await shot(page, 'phone_review_timeout');
  await page.click('.review-nav .btn-primary');
  check(await page.locator('.choice.is-correct').count() === 1 && await page.locator('.choice.is-wrong').count() === 1, 'review marks his answer and the right one');
  check(await page.locator('.review-box .explanation').count() === 1, 'review shows explanation');
  await shot(page, 'phone_review_wrong');
  for (let i = 2; i < 8; i++) await page.click('.review-nav .btn-primary');
  check(await page.locator('.review-nav .btn-primary').innerText() === 'סיימנו ✓', 'last review step');
  await page.click('.review-nav .btn-primary');
  await testResultsReady(page);

  // Browser back must not reopen the finished test
  await page.evaluate(() => { location.hash = 'test'; });
  await page.waitForFunction(() => document.querySelector('#app').dataset.screen === 'results');

  // Practice now serves the test mistakes
  const wrongKeys = await page.evaluate(() => window.__e2e.session.mistakes.map((m) => m.question.key));
  await page.click('.summary-actions .btn-ghost');
  await page.waitForSelector('.greeting');
  check((await page.locator('.mode-last').innerText()).includes('7 מתוך 15'), 'home shows the last test score');
  await page.click('.mode-practice .btn-huge');
  await page.waitForSelector('.screen.practice .choice');
  const served = [];
  for (let n = 1; n <= 10; n++) {
    const cur = await answer(page, true);
    served.push({ key: cur.key, retryKind: cur.retryKind ?? null });
    await next(page);
  }
  r.practiceAfter = served;
  check(served.some((x) => x.retryKind === 'exact' && wrongKeys.includes(x.key)), 'practice re-asks a test mistake');
  await context.close();
}

async function flowTestGirl(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS.desktop, { profile: { name: 'מאיה', gender: 'girl' } });
  await open(page);
  await page.evaluate(() => window.__e2e.progress.updateSettings({ examLength: 10 }));
  await page.click('.btn-test');
  await page.waitForSelector('.screen.test-mode .choice');
  check(await page.locator('.dot').count() === 10, 'exam length setting 10');
  for (let n = 1; n <= 10; n++) {
    if (n === 2) await shot(page, 'desktop_test_question');
    await answerTest(page, n % 3 !== 0);
  }
  await testResultsReady(page);
  check((await page.locator('.btn-review').innerText()).includes('בואי נעבור על הטעויות'), 'feminine review button');
  await page.waitForTimeout(100);
  await shot(page, 'desktop_test_results');
  await page.click('.btn-review');
  await page.waitForSelector('.screen.review');
  await shot(page, 'desktop_review');
  await page.evaluate(() => window.__e2e.go('parents'));
  const [a, b] = (await page.locator('.gate-q').innerText()).match(/\d+/g).map(Number);
  await page.fill('.gate input', String(a * b));
  await page.click('.gate button[type=submit]');
  await page.waitForSelector('.screen.parents');
  check(await page.locator('.test-history tbody tr').count() === 1, 'parents list one test');
  check(await page.locator('.test-history .chart-col').count() === 1, 'parents chart one test');
  check(await page.locator('.settings select').nth(0).inputValue() === 'girl', 'parents gender select shows girl');
  await context.close();
}

async function flowBulk(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS.phone);
  await open(page);
  const skills = await page.evaluate(() => [...window.__e2e.progress.skillById.values()]
    .map((s) => ({ id: s.id, min: s.minLevel ?? 1, max: s.maxLevel ?? 5 })));
  let answered = 0;
  const perSkill = {};
  for (const s of skills) {
    perSkill[s.id] = 0;
    for (let level = s.min; level <= s.max; level++) {
      for (let k = 0; k < BULK; k++) {
        if (!await findQuestion(page, s.id, level)) {
          check(false, `could not generate ${s.id} L${level}`);
          continue;
        }
        const probs = await inspectQuestion(page);
        const cur = await answer(page, (answered % 3) !== 1);
        if (probs.length) report.badQuestions.push({ flow: 'bulk', skillId: s.id, level, key: cur.key, probs });
        answered++;
        perSkill[s.id]++;
      }
    }
  }
  report.bulk = { answered, perSkill };
  check(answered >= 150, `bulk answered ${answered}`);
  await context.close();
}

// ------------------------------------------------------------------ screenshots

const SHOTS = [
  ['reading', 'verbal.reading', 3, 'true'],
  ['math_missing_addend', 'math.add_sub', 3, "q.prompt.includes('?') && /\\+ \\? =/.test(q.prompt)"],
  ['math_series', 'math.number_series', 3, 'true'],
  ['shapes_matrix', 'shapes.matrix', 3, 'true'],
  ['shapes_series_L5', 'shapes.series', 5, 'true'],
  ['verbal_analogy', 'verbal.analogies', 3, 'true'],
  ['math_balance', 'math.balance', 5, 'true'],
  ['shapes_spatial_L5', 'shapes.spatial', 5, 'true'],
];

async function screenshots(browser) {
  for (const [vpName, vp] of Object.entries(VIEWPORTS)) {
    const { context, page } = await newPage(browser, vp);
    await open(page);
    await shot(page, `${vpName}_01_home`);
    // A few test results so the parents screen has a history to show.
    await page.evaluate(() => {
      const p = window.__e2e.progress;
      const day = 24 * 3600 * 1000;
      const scores = [[8, 15], [10, 15], [9, 15], [12, 15]];
      scores.forEach(([correct, total], i) => p.state.testHistory.push({
        at: Date.now() - (scores.length - i) * 3 * day, total, correct, timedOut: 1, timeMs: 380000 + i * 20000,
        topics: { math: { total: 5, correct: Math.min(5, correct - 5) }, verbal: { total: 5, correct: 3 }, shapes: { total: 5, correct: Math.max(0, correct - 3 - Math.min(5, correct - 5)) } },
      }));
      p.save();
    });
    for (const [name, skillId, level, pred] of SHOTS) {
      if (await findQuestion(page, skillId, level, pred)) {
        await shot(page, `${vpName}_q_${name}`);
        const probs = await inspectQuestion(page);
        if (probs.length) report.badQuestions.push({ flow: `shot ${vpName} ${name}`, probs });
      } else check(false, `screenshot question not found: ${name}`);
    }
    // feedback correct / wrong, then summary of a 5-question session
    await page.evaluate(() => { window.__e2e.progress.updateSettings({ sessionLength: 5 }); });
    await startVia(page, { mode: 'topic', focusTopicId: 'math' });
    await answer(page, true);
    await shot(page, `${vpName}_fb_correct`);
    await next(page);
    await answer(page, false);
    await shot(page, `${vpName}_fb_wrong`);
    await next(page);
    for (let i = 0; i < 3; i++) { await answer(page, true); await next(page); }
    await page.waitForSelector('.screen.summary');
    await page.waitForTimeout(100);
    await shot(page, `${vpName}_summary`);
    await page.evaluate(() => window.__e2e.go('achievements'));
    await page.waitForSelector('.screen.achievements');
    await shot(page, `${vpName}_achievements`);
    await page.evaluate(() => window.__e2e.go('parents'));
    const [a, b] = (await page.locator('.gate-q').innerText()).match(/\d+/g).map(Number);
    await page.fill('.gate input', String(a * b));
    await page.click('.gate button[type=submit]');
    await page.waitForSelector('.screen.parents');
    await shot(page, `${vpName}_parents`);
    await context.close();
  }
}

async function perf(browser) {
  const { context, page } = await newPage(browser, VIEWPORTS.phone);
  const bytes = {};
  page.on('response', async (res) => {
    const url = res.url();
    if (!url.startsWith(BASE)) return;
    try { bytes[url.slice(BASE.length) || 'index.html'] = (await res.body()).length; } catch { /* ignore */ }
  });
  const t0 = Date.now();
  await page.goto(`${BASE}?e2e`);
  await page.waitForSelector('.greeting');
  const home = Date.now() - t0;
  await page.click('.btn-huge');
  await page.waitForSelector('.screen.practice .choice');
  const firstQ = Date.now() - t0;
  const total = Object.values(bytes).reduce((a, b) => a + b, 0);
  const js = Object.entries(bytes).filter(([k]) => k.endsWith('.js')).reduce((a, [, b]) => a + b, 0);
  const css = Object.entries(bytes).filter(([k]) => k.endsWith('.css')).reduce((a, [, b]) => a + b, 0);
  report.perf = { homeMs: home, firstQuestionMs: firstQ, totalBytes: total, jsBytes: js, cssBytes: css, files: bytes };
  await context.close();
}

const browser = await chromium.launch();
try {
  for (const [name, fn] of [['perf', perf], ['onboarding', flowOnboarding], ['core', flowCore], ['exam', flowExam],
    ['examGirl', flowTestGirl], ['bulk', flowBulk], ['screenshots', screenshots]]) {
    if (args.only && !args.only.split(',').includes(name)) continue;
    const t = Date.now();
    try {
      await fn(browser);
    } catch (err) {
      failures.push(`${name} crashed: ${err.stack ?? err}`);
    }
    notes.push(`${name}: ${Date.now() - t} ms`);
  }
} finally {
  await browser.close();
}

report.failures = failures;
report.notes = notes;
for (const e of report.consoleErrors) failures.push(`console: ${e}`);
for (const e of report.pageErrors) failures.push(`pageerror: ${e}`);
for (const b of report.badQuestions) failures.push(`question: ${JSON.stringify(b)}`);
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify(report, null, 2));
console.log(notes.join('\n'));
console.log(JSON.stringify({ perf: report.perf && { ...report.perf, files: undefined }, bulk: report.bulk.answered }, null, 1));
if (failures.length) {
  console.log(`\nFAILURES (${failures.length}):`);
  for (const f of failures) console.log(` - ${f}`);
  process.exit(1);
}
console.log('\nE2E OK');
