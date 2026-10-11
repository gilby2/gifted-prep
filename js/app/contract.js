// Question contract checks (see CONTRACT.md). Shared by the app, which skips
// malformed questions instead of showing them, and by tools/validate.mjs.

const HEBREW = /[֐-׿]/;
const BAD_TOKENS = /\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]|Infinity/;

function checkSvg(svg, where, problems) {
  if (typeof svg !== 'string' || !svg.trim()) {
    problems.push(`${where}: svg is empty`);
    return;
  }
  const s = svg.trim();
  if (!s.startsWith('<svg')) problems.push(`${where}: svg does not start with <svg`);
  if (!s.endsWith('</svg>')) problems.push(`${where}: svg does not end with </svg>`);
  if (!/viewBox\s*=\s*"[^"]+"/.test(s)) problems.push(`${where}: svg has no viewBox`);
  const open = s.match(/<svg[^>]*>/);
  if (open && /\s(width|height)\s*=/.test(open[0])) problems.push(`${where}: root svg has width/height`);
  if (/<script|on\w+\s*=|javascript:/i.test(s)) problems.push(`${where}: svg contains script`);
  if (/(href|src)\s*=\s*"(https?:|\/\/)/i.test(s)) problems.push(`${where}: svg has external reference`);
  if (BAD_TOKENS.test(s)) problems.push(`${where}: svg contains undefined/NaN`);
}

function checkText(text, where, problems, { requireHebrew = false } = {}) {
  if (typeof text !== 'string') {
    problems.push(`${where}: not a string`);
    return;
  }
  if (!text.trim()) problems.push(`${where}: empty`);
  if (BAD_TOKENS.test(text)) problems.push(`${where}: contains undefined/NaN/null`);
  if (requireHebrew && !HEBREW.test(text)) problems.push(`${where}: no Hebrew letters`);
  if (/<[a-z][^>]*>/i.test(text)) problems.push(`${where}: looks like HTML`);
}

// Returns a list of problem strings; empty list means the question is valid.
export function checkQuestion(q, expectedSkillId) {
  const problems = [];
  if (!q || typeof q !== 'object') return ['question is not an object'];

  if (typeof q.key !== 'string' || !q.key) problems.push('key missing');
  else if (BAD_TOKENS.test(q.key)) problems.push('key contains undefined/NaN');
  if (expectedSkillId && q.skillId !== expectedSkillId) {
    problems.push(`skillId ${q.skillId} != ${expectedSkillId}`);
  }
  if (!Number.isInteger(q.level) || q.level < 1 || q.level > 5) problems.push(`bad level ${q.level}`);

  checkText(q.prompt, 'prompt', problems, { requireHebrew: true });
  if (q.passage != null) checkText(q.passage, 'passage', problems, { requireHebrew: true });
  if (q.explanation != null) checkText(q.explanation, 'explanation', problems);
  else problems.push('explanation missing');
  if (q.visual != null) checkSvg(q.visual.svg, 'visual', problems);

  if (!Array.isArray(q.choices)) {
    problems.push('choices is not an array');
    return problems;
  }
  if (q.choices.length < 3 || q.choices.length > 4) problems.push(`choices count ${q.choices.length}`);

  const signatures = new Set();
  q.choices.forEach((c, i) => {
    if (!c || (c.text == null && c.svg == null)) {
      problems.push(`choice ${i}: no text and no svg`);
      return;
    }
    if (c.text != null) checkText(String(c.text), `choice ${i} text`, problems);
    if (c.svg != null) checkSvg(c.svg, `choice ${i}`, problems);
    const sig = `${c.text ?? ''}|${c.svg ?? ''}`;
    if (signatures.has(sig)) problems.push(`choice ${i} duplicates another choice`);
    signatures.add(sig);
  });

  if (!Number.isInteger(q.answerIndex) || q.answerIndex < 0 || q.answerIndex >= q.choices.length) {
    problems.push(`bad answerIndex ${q.answerIndex}`);
  }
  return problems;
}
