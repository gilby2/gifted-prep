# Shared contract (all agents MUST follow)

Static site, no build step, vanilla ES modules, served by GitHub Pages.
Everything the child sees is Hebrew, RTL, grade-2 level (age 7-8), short sentences.

## Files and ownership
- `js/core/random.js` - seeded RNG helpers (written, do not change API).
- `js/core/svg.js` - SVG shape helpers for visual puzzles (owner: shapes agent; others may import).
- `js/generators/math.js` - owner: math agent.
- `js/generators/verbal.js` + `js/generators/data/*.js` - owner: verbal agent.
- `js/generators/shapes.js` - owner: shapes agent.
- `js/generators/index.js` - registry, imports the three topic modules (owner: app agent).
- `js/app/*`, `css/*`, `index.html`, `.github/workflows/*`, `README.md` - owner: app agent.
- `tools/validate.mjs` - node script that runs every skill generator many times and checks the contract (owner: app agent).

## Topic module shape
Each generator file exports a default `topic` object:

```js
export default {
  id: 'math',               // stable id
  name: 'חשבון',            // Hebrew display name
  icon: '🔢',               // emoji
  skills: [
    {
      id: 'math.add_sub',   // stable, `${topic}.${skill}`
      name: 'חיבור וחיסור',
      minLevel: 1, maxLevel: 5,
      generate(rng, level) { return question; }
    }
  ]
};
```

`level` is an integer 1..5 (1 = easy warm-up for grade 2, 3 = typical test level, 5 = hard test level).
`rng` is an instance from `createRng(seed)` in `js/core/random.js`. Generators MUST use only `rng`
(never Math.random) so a seed reproduces the question.

## Question shape

```js
{
  key: 'math.add_sub:17+25',   // dedupe signature: same key = same question. Must be specific enough
                               // that two genuinely different questions never share a key.
  skillId: 'math.add_sub',
  level: 3,
  prompt: 'כמה זה 17 + 25?',   // Hebrew text, may contain \n. Plain text, no HTML.
  passage: null,               // optional longer text (reading comprehension), plain text.
  visual: null,                // optional: { svg: '<svg ...>...</svg>' } shown above the choices.
  choices: [                   // exactly 4 choices (3 allowed only when a 4th makes no sense)
    { text: '42' },            // or { svg: '<svg ...>' } for figure answers, or both
    { text: '32' }, { text: '43' }, { text: '52' }
  ],
  answerIndex: 0,              // index into choices, after shuffling (use rng.shuffle helper)
  explanation: 'מחברים עשרות ...', // short Hebrew explanation shown after an answer, kid language
}
```

Rules:
- Exactly one correct answer. Distractors must be plausible (typical kid mistakes), all distinct.
- Shuffle choices with `rng`, set `answerIndex` accordingly.
- SVGs: self-contained, `viewBox` set, no width/height attributes (CSS sizes them), no external refs,
  colors from a kid-friendly palette, readable at 90px for choices and 260px for the main visual.
- Variety: each skill must be able to produce at least several hundred distinct `key`s across levels
  (procedural parameters + large hand-written banks for verbal content).
- Hebrew numbers in text use digits. Avoid niqqud except where needed to disambiguate.
- No names of real people except neutral common Israeli kid names (נועה, יונתן, מאיה, איתי, ...).
