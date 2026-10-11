// Topic registry. Each topic module is loaded independently so a broken
// module only removes its own topic instead of taking the whole app down.

const MODULES = ['./math.js', './verbal.js', './shapes.js'];

const settled = await Promise.allSettled(MODULES.map((path) => import(path)));

export const loadErrors = [];
export const topics = [];

settled.forEach((result, i) => {
  if (result.status === 'rejected') {
    loadErrors.push({ module: MODULES[i], error: String(result.reason) });
    return;
  }
  const topic = result.value.default;
  if (!topic || !topic.id || !Array.isArray(topic.skills)) {
    loadErrors.push({ module: MODULES[i], error: 'missing default topic export' });
    return;
  }
  topics.push(topic);
});

if (loadErrors.length && typeof console !== 'undefined') {
  for (const e of loadErrors) console.error(`[generators] failed to load ${e.module}: ${e.error}`);
}

const skillIndex = new Map();
for (const topic of topics) {
  for (const skill of topic.skills) skillIndex.set(skill.id, { skill, topic });
}

export function getSkill(id) {
  const entry = skillIndex.get(id);
  return entry ? entry.skill : null;
}

export function getTopicOfSkill(id) {
  const entry = skillIndex.get(id);
  return entry ? entry.topic : null;
}

export function allSkills() {
  return topics.flatMap((t) => t.skills);
}
