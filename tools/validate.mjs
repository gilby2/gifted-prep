// Runs every skill generator many times and checks the question contract
// (CONTRACT.md). Exit code 1 if any check fails.
//
// Usage:
//   node tools/validate.mjs                    # all skills, 1500 runs each
//   node tools/validate.mjs --runs 300         # fewer runs
//   node tools/validate.mjs --skill math.add   # only skills whose id starts with this
//   node tools/validate.mjs --registry path/to/registry.js   # alternative registry (testing)

import { pathToFileURL, fileURLToPath } from 'node:url';
import path from 'node:path';
import { createRng } from '../js/core/random.js';
import { checkQuestion } from '../js/app/contract.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const HEBREW = /[֐-׿]/;
const MIN_DISTINCT_WARN = 200;
const MAX_SAMPLE_FAILURES = 5;
const ANSWER_BIAS_WARN = 0.5;

function parseArgs(argv) {
  const args = { runs: 1500, skill: null, registry: path.join(HERE, '../js/generators/index.js') };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--runs') args.runs = Number(argv[++i]);
    else if (a === '--skill') args.skill = argv[++i];
    else if (a === '--registry') args.registry = path.resolve(argv[++i]);
    else if (a === '-h' || a === '--help') {
      console.log('node tools/validate.mjs [--runs N] [--skill PREFIX] [--registry FILE]');
      process.exit(0);
    } else {
      console.error(`unknown argument: ${a}`);
      process.exit(2);
    }
  }
  if (!Number.isInteger(args.runs) || args.runs < 5) {
    console.error('--runs must be an integer >= 5');
    process.exit(2);
  }
  return args;
}

function checkTopic(topic, problems) {
  if (typeof topic.id !== 'string' || !topic.id) problems.push('topic id missing');
  if (typeof topic.name !== 'string' || !HEBREW.test(topic.name)) problems.push(`topic ${topic.id}: name not Hebrew`);
  if (typeof topic.icon !== 'string' || !topic.icon) problems.push(`topic ${topic.id}: icon missing`);
  if (!Array.isArray(topic.skills) || topic.skills.length === 0) problems.push(`topic ${topic.id}: no skills`);
}

function checkSkillMeta(topic, skill, seenIds, problems) {
  const where = `skill ${skill.id}`;
  if (typeof skill.id !== 'string' || !skill.id.startsWith(`${topic.id}.`)) problems.push(`${where}: id must start with "${topic.id}."`);
  if (seenIds.has(skill.id)) problems.push(`${where}: duplicate skill id`);
  seenIds.add(skill.id);
  if (typeof skill.name !== 'string' || !HEBREW.test(skill.name)) problems.push(`${where}: name not Hebrew`);
  if (typeof skill.generate !== 'function') problems.push(`${where}: generate is not a function`);
  const lo = skill.minLevel ?? 1;
  const hi = skill.maxLevel ?? 5;
  if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < 1 || hi > 5 || lo > hi) {
    problems.push(`${where}: bad level range ${lo}..${hi}`);
  }
}

// Same seed and level must reproduce the same question (needed for exact retries).
function checkDeterminism(skill, level, seed, q) {
  const again = skill.generate(createRng(seed), level);
  if (JSON.stringify(again) !== JSON.stringify(q)) return 'not deterministic for the same seed';
  return null;
}

function validateSkill(skill, runs) {
  const lo = skill.minLevel ?? 1;
  const hi = skill.maxLevel ?? 5;
  const levels = [];
  for (let l = lo; l <= hi; l++) levels.push(l);

  const keys = new Set();
  const keysByLevel = {};
  const answerCounts = [0, 0, 0, 0];
  const failures = [];
  let failureCount = 0;
  let totalMs = 0;
  let slowest = 0;

  const seedRng = createRng(`validate:${skill.id}`);
  for (let i = 0; i < runs; i++) {
    const level = levels[i % levels.length];
    const seed = seedRng.int(1, 0x7fffffff);
    let q;
    const t0 = performance.now();
    try {
      q = skill.generate(createRng(seed), level);
    } catch (err) {
      failureCount++;
      if (failures.length < MAX_SAMPLE_FAILURES) failures.push(`L${level} seed ${seed}: threw ${err && err.stack ? err.stack.split('\n')[0] : err}`);
      continue;
    }
    const dt = performance.now() - t0;
    totalMs += dt;
    slowest = Math.max(slowest, dt);

    const problems = checkQuestion(q, skill.id);
    if (q && q.level !== level) problems.push(`level ${q.level} != requested ${level}`);
    if (i % 25 === 0 && problems.length === 0) {
      const d = checkDeterminism(skill, level, seed, q);
      if (d) problems.push(d);
    }
    if (problems.length) {
      failureCount++;
      if (failures.length < MAX_SAMPLE_FAILURES) failures.push(`L${level} seed ${seed}: ${problems.join('; ')}`);
      continue;
    }
    keys.add(q.key);
    (keysByLevel[level] ??= new Set()).add(q.key);
    answerCounts[q.answerIndex]++;
  }

  const valid = runs - failureCount;
  const warnings = [];
  if (keys.size < MIN_DISTINCT_WARN && valid > 0) warnings.push(`only ${keys.size} distinct keys in ${valid} questions`);
  if (valid >= 100) {
    const maxShare = Math.max(...answerCounts) / valid;
    if (maxShare > ANSWER_BIAS_WARN) warnings.push(`answer position biased: ${answerCounts.join('/')}`);
  }
  return {
    distinct: keys.size,
    byLevel: Object.fromEntries(Object.entries(keysByLevel).map(([l, s]) => [l, s.size])),
    failureCount, failures, warnings,
    avgMs: valid ? totalMs / valid : 0,
    slowestMs: slowest,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  let registry;
  try {
    registry = await import(pathToFileURL(args.registry).href);
  } catch (err) {
    console.error(`cannot import registry ${args.registry}:\n${err.stack ?? err}`);
    process.exit(1);
  }

  let failed = false;
  for (const e of registry.loadErrors ?? []) {
    console.error(`LOAD FAIL ${e.module}: ${e.error}`);
    failed = true;
  }

  const topics = registry.topics ?? [];
  if (!topics.length) {
    console.error('no topics loaded');
    process.exit(1);
  }

  const seenIds = new Set();
  let skillCount = 0;
  let warnCount = 0;
  for (const topic of topics) {
    const metaProblems = [];
    checkTopic(topic, metaProblems);
    console.log(`\n${topic.icon ?? ''} ${topic.id} (${topic.name}) - ${topic.skills?.length ?? 0} skills`);
    for (const p of metaProblems) {
      console.log(`  FAIL ${p}`);
      failed = true;
    }
    for (const skill of topic.skills ?? []) {
      if (args.skill && !skill.id.startsWith(args.skill)) continue;
      skillCount++;
      const skillProblems = [];
      checkSkillMeta(topic, skill, seenIds, skillProblems);
      if (skillProblems.length) {
        for (const p of skillProblems) console.log(`  FAIL ${p}`);
        failed = true;
        if (typeof skill.generate !== 'function') continue;
      }
      const r = validateSkill(skill, args.runs);
      const status = r.failureCount ? 'FAIL' : r.warnings.length ? 'warn' : 'ok  ';
      const levels = Object.entries(r.byLevel).map(([l, n]) => `L${l}:${n}`).join(' ');
      console.log(`  ${status} ${skill.id.padEnd(28)} distinct ${String(r.distinct).padStart(5)}  [${levels}]  avg ${r.avgMs.toFixed(2)}ms max ${r.slowestMs.toFixed(1)}ms`);
      if (r.failureCount) {
        failed = true;
        console.log(`       ${r.failureCount}/${args.runs} invalid, e.g.:`);
        for (const f of r.failures) console.log(`         - ${f}`);
      }
      for (const w of r.warnings) {
        warnCount++;
        console.log(`       warning: ${w}`);
      }
    }
  }

  console.log(`\n${skillCount} skills checked, ${args.runs} runs each, ${warnCount} warnings.`);
  console.log(failed ? 'RESULT: FAIL' : 'RESULT: OK');
  process.exit(failed ? 1 : 0);
}

main();
