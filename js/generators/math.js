// Math topic: procedural grade-2 gifted-test style questions.
import { withChoices } from '../core/random.js';

// Math expressions are wrapped in a Unicode LTR isolate so that "34 + ? = 61"
// keeps its left-to-right order inside an RTL Hebrew sentence.
const LRI = '⁦';
const PDI = '⁩';
const ltr = (s) => `${LRI}${s}${PDI}`;

const COLORS = {
	ink: '#264653',
	blue: '#4f8ef7',
	teal: '#2a9d8f',
	yellow: '#ffb703',
	orange: '#fb8500',
	red: '#e76f51',
	sky: '#8ecae6',
	cream: '#fff8e7',
	silver: '#cfd8dc',
	gold: '#f4c430',
};

const BOYS = ['יונתן', 'איתי', 'עומר', 'נועם', 'אורי', 'דניאל', 'יואב', 'אריאל',
	'עידו', 'רועי', 'אלון', 'תומר', 'אמיר', 'גיא', 'איתן', 'אביב'];
const GIRLS = ['נועה', 'מאיה', 'תמר', 'שירה', 'יעל', 'אביגיל', 'הילה', 'מיכל',
	'ליה', 'אלה', 'נגה', 'טליה', 'דנה', 'רחלי', 'עלמה', 'הדס'];

// ---------------------------------------------------------------------------
// Shared helpers

function person(rng, exclude = null) {
	for (;;) {
		const m = rng.chance(0.5);
		const name = rng.pick(m ? BOYS : GIRLS);
		if (!exclude || exclude.name !== name)
			return { name, m };
	}
}

const v = (p, male, female) => (p.m ? male : female);

const sum = (arr) => arr.reduce((a, b) => a + b, 0);

function isGoodNumber(x, min, max) {
	return typeof x === 'number' && Number.isInteger(x) && x >= min && x <= max;
}

// Pick 3 distinct distractors: first from the "kid mistake" candidates in
// order, then nearby values in a random order.
function fillNumeric(rng, correct, candidates, opts = {}) {
	const min = opts.min ?? (correct >= 1 ? 1 : 0);
	const max = opts.max ?? Infinity;
	if (!Number.isInteger(correct))
		throw new Error(`math: non-integer answer ${correct}`);
	const out = [];
	const seen = new Set([correct]);
	const tryAdd = (c) => {
		if (out.length >= 3 || !isGoodNumber(c, min, max) || seen.has(c))
			return;
		seen.add(c);
		out.push(c);
	};
	candidates.forEach(tryAdd);
	const near = rng.shuffle([1, -1, 2, -2, 10, -10]);
	near.forEach((d) => tryAdd(correct + d));
	for (let d = 3; out.length < 3; d++) {
		tryAdd(correct + d);
		tryAdd(correct - d);
	}
	return out;
}

function fillStrings(rng, correct, candidates, extraGen) {
	const out = [];
	const seen = new Set([correct]);
	const tryAdd = (c) => {
		if (out.length >= 3 || typeof c !== 'string' || !c || seen.has(c))
			return;
		seen.add(c);
		out.push(c);
	};
	candidates.forEach(tryAdd);
	for (let guard = 0; out.length < 3 && guard < 200; guard++)
		tryAdd(extraGen());
	return out;
}

function makeQ(rng, skillId, level, keyTail, prompt, correct, distractors,
	explanation, visual = null) {
	const { choices, answerIndex } = withChoices(rng, { text: String(correct) },
		distractors.map((d) => ({ text: String(d) })));
	return {
		key: `${skillId}:${keyTail}`,
		skillId,
		level,
		prompt,
		passage: null,
		visual,
		choices,
		answerIndex,
		explanation,
	};
}

function numQ(rng, skillId, level, keyTail, prompt, correct, candidates,
	explanation, visual = null, opts = {}) {
	return makeQ(rng, skillId, level, keyTail, prompt, correct,
		fillNumeric(rng, correct, candidates, opts), explanation, visual);
}

function digits(n) {
	return String(n).split('').map(Number);
}

function noCarryAdd(a, b) {
	let r = 0;
	for (let p = 1; a > 0 || b > 0; p *= 10) {
		r += ((a % 10 + b % 10) % 10) * p;
		a = Math.floor(a / 10);
		b = Math.floor(b / 10);
	}
	return r;
}

// "Smaller from bigger" mistake: subtracts each column without borrowing.
function noBorrowSub(a, b) {
	let r = 0;
	for (let p = 1; a > 0 || b > 0; p *= 10) {
		r += Math.abs(a % 10 - b % 10) * p;
		a = Math.floor(a / 10);
		b = Math.floor(b / 10);
	}
	return r;
}

function swapDigits(n) {
	return Number(String(n).split('').reverse().join(''));
}

function svgOpen(w, h) {
	return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">`;
}

function svgText(x, y, s, size, fill = COLORS.ink, weight = 'bold') {
	return `<text x="${x}" y="${y}" font-size="${size}" font-family="Arial, sans-serif" ` +
		`font-weight="${weight}" fill="${fill}" text-anchor="middle" dominant-baseline="central">${s}</text>`;
}

// ---------------------------------------------------------------------------
// 1. Addition and subtraction

function addPair(rng, level) {
	switch (level) {
	case 1: {
		const a = rng.int(2, 12);
		return [a, rng.int(1, 20 - a)];
	}
	case 2: {
		const a = rng.int(10, 40);
		return [a, rng.int(3, 50 - a)];
	}
	case 3:
	case 4: {
		const a = rng.int(12, 85);
		return [a, rng.int(11, 99 - a)];
	}
	default: {
		const a = rng.int(100, 800);
		const b = rng.chance(0.5) ? rng.int(25, 99) : rng.int(100, 999 - a);
		return [a, Math.max(b, 11)];
	}
	}
}

function genAddSub(rng, level) {
	const id = 'math.add_sub';
	const types = { 1: ['add', 'sub'], 2: ['add', 'sub', 'miss_add'],
		3: ['add', 'sub', 'miss_add', 'miss_sub'],
		4: ['add', 'sub', 'miss_add', 'miss_sub', 'miss_first', 'three'],
		5: ['add', 'sub', 'miss_add', 'miss_sub', 'miss_first', 'three'] }[level];
	const type = rng.pick(types);
	const [a, b] = addPair(rng, level);
	const c = a + b;
	const colHint = level >= 5 ? 'מאות, עשרות ויחידות' : 'עשרות ויחידות';

	switch (type) {
	case 'add':
		return numQ(rng, id, level, `add:${a}:${b}`,
			`כמה זה ${ltr(`${a} + ${b}`)}?`, c,
			[noCarryAdd(a, b), c + 10, c - 10, c + 1, c - 1, Math.abs(a - b)],
			`${ltr(`${a} + ${b} = ${c}`)}. מחברים בנפרד ${colHint}, ולא שוכחים להעביר.`);
	case 'sub':
		return numQ(rng, id, level, `sub:${c}:${b}`,
			`כמה זה ${ltr(`${c} - ${b}`)}?`, a,
			[noBorrowSub(c, b), a + 10, a - 10, a + 1, a - 1, c + b],
			`${ltr(`${c} - ${b} = ${a}`)}. אפשר לבדוק בחיבור: ${ltr(`${a} + ${b} = ${c}`)}.`);
	case 'miss_add':
		return numQ(rng, id, level, `miss_add:${a}:${c}`,
			`איזה מספר חסר?\n${ltr(`${a} + ? = ${c}`)}`, b,
			[c + a, b + 1, b - 1, b + 10, b - 10, c],
			`סופרים מ-${a} עד ${c}: ${ltr(`${c} - ${a} = ${b}`)}.`);
	case 'miss_sub':
		return numQ(rng, id, level, `miss_sub:${c}:${a}`,
			`איזה מספר חסר?\n${ltr(`${c} - ? = ${a}`)}`, b,
			[c + a, b + 1, b - 1, b + 10, b - 10, a],
			`כמה צריך להוריד מ-${c} כדי להגיע ל-${a}? ${ltr(`${c} - ${a} = ${b}`)}.`);
	case 'miss_first':
		return numQ(rng, id, level, `miss_first:${b}:${a}`,
			`איזה מספר חסר?\n${ltr(`? - ${b} = ${a}`)}`, c,
			[Math.abs(a - b), c + 1, c - 1, c + 10, c - 10, a],
			`מחזירים את מה שהורידו: ${ltr(`${a} + ${b} = ${c}`)}.`);
	default: {
		const d = rng.int(5, c - 1);
		const ans = c - d;
		return numQ(rng, id, level, `three:${a}:${b}:${d}`,
			`כמה זה ${ltr(`${a} + ${b} - ${d}`)}?`, ans,
			[c + d, ans + 1, ans - 1, ans + 10, ans - 10, a - b + d],
			`קודם ${ltr(`${a} + ${b} = ${c}`)}, ואז ${ltr(`${c} - ${d} = ${ans}`)}.`);
	}
	}
}

// ---------------------------------------------------------------------------
// 2. Multiplication and division

const GROUP_ITEMS = [
	{ e: '🍬', box: 'שקיות', one: 'אחת', what: 'סוכריות', them: 'אותן' },
	{ e: '🍎', box: 'סלים', one: 'אחד', what: 'תפוחים', them: 'אותם' },
	{ e: '🌸', box: 'אגרטלים', one: 'אחד', what: 'פרחים', them: 'אותם' },
	{ e: '⚽', box: 'ארגזים', one: 'אחד', what: 'כדורים', them: 'אותם' },
	{ e: '🍪', box: 'צלחות', one: 'אחת', what: 'עוגיות', them: 'אותן' },
	{ e: '🐟', box: 'אקווריומים', one: 'אחד', what: 'דגים', them: 'אותם' },
];

function mulCands(a, b) {
	const p = a * b;
	return [a + b, p + a, p - a, p + b, p - b, p + 1, p - 1, p + 10];
}

function genMulDiv(rng, level) {
	const id = 'math.mul_div';
	const types = { 1: ['rep', 'groups'], 2: ['groups', 'mul', 'share'],
		3: ['mul', 'div', 'share'], 4: ['mul', 'div', 'miss_mul', 'miss_div', 'half'],
		5: ['big_mul', 'big_div', 'miss_mul', 'tens'] }[level];
	const type = rng.pick(types);

	switch (type) {
	case 'rep': {
		const n = rng.int(2, 6);
		const k = rng.int(2, 5);
		const expr = Array(k).fill(n).join(' + ');
		return numQ(rng, id, level, `rep:${n}:${k}`, `כמה זה ${ltr(expr)}?`, n * k,
			[n + k, n * k + n, n * k - n, n * k + 1, n * k - 1],
			`${k} פעמים ${n} זה ${n * k}. סופרים בקפיצות של ${n}.`);
	}
	case 'groups': {
		const it = rng.pick(GROUP_ITEMS);
		const k = rng.int(2, level === 1 ? 4 : 5);
		const n = rng.int(2, level === 1 ? 4 : 6);
		const pic = Array(k).fill(it.e.repeat(n)).join('   ');
		return numQ(rng, id, level, `groups:${it.e}:${n}:${k}`,
			`יש ${k} ${it.box}, ובכל ${it.one} יש ${n} ${it.what}.\n${pic}\nכמה ${it.what} יש בסך הכל?`,
			n * k, mulCands(n, k),
			`${ltr(`${k} × ${n} = ${n * k}`)}. ${k} קבוצות של ${n}.`);
	}
	case 'mul': {
		const a = rng.int(2, level === 2 ? 5 : 10);
		const b = rng.int(level === 2 ? 1 : 2, 10);
		return numQ(rng, id, level, `mul:${a}:${b}`, `כמה זה ${ltr(`${a} × ${b}`)}?`,
			a * b, mulCands(a, b),
			`${ltr(`${a} × ${b}`)} זה ${a} פעמים ${b}, כלומר ${a * b}.`);
	}
	case 'share': {
		const it = rng.pick(GROUP_ITEMS);
		const k = rng.int(2, level === 2 ? 4 : 6);
		const q = rng.int(2, level === 2 ? 5 : 9);
		const n = k * q;
		return numQ(rng, id, level, `share:${n}:${k}`,
			`יש ${n} ${it.what}. מחלקים ${it.them} שווה בשווה ל-${k} ילדים. כמה ${it.what} יקבל כל ילד?`,
			q, [n - k, q + 1, q - 1, k, n + k],
			`${ltr(`${n} : ${k} = ${q}`)}, כי ${ltr(`${k} × ${q} = ${n}`)}.`);
	}
	case 'div':
	case 'big_div': {
		const big = type === 'big_div';
		const k = rng.int(2, big ? 9 : 10);
		const q = big ? rng.int(11, 25) : rng.int(2, 10);
		const n = k * q;
		return numQ(rng, id, level, `div:${n}:${k}`, `כמה זה ${ltr(`${n} : ${k}`)}?`,
			q, [n - k, q + 1, q - 1, q + 10, q - 10, q * 2],
			`${ltr(`${n} : ${k} = ${q}`)}, כי ${ltr(`${k} × ${q} = ${n}`)}.`);
	}
	case 'miss_mul': {
		const a = rng.int(2, 10);
		const b = rng.int(level === 5 ? 6 : 3, 10);
		const p = a * b;
		const left = rng.chance(0.5);
		const expr = left ? `? × ${b} = ${p}` : `${b} × ? = ${p}`;
		return numQ(rng, id, level, `miss_mul:${left ? 'l' : 'r'}:${b}:${p}`,
			`איזה מספר חסר?\n${ltr(expr)}`, a,
			[p - b, a + 1, a - 1, p + b, b],
			`${ltr(`${a} × ${b} = ${p}`)}, לכן המספר החסר הוא ${a}.`);
	}
	case 'miss_div': {
		const k = rng.int(2, 9);
		const q = rng.int(2, 9);
		const n = k * q;
		return numQ(rng, id, level, `miss_div:${n}:${q}`,
			`איזה מספר חסר?\n${ltr(`${n} : ? = ${q}`)}`, k,
			[n - q, k + 1, k - 1, n + q, n * q],
			`${ltr(`${n} : ${k} = ${q}`)}, כי ${ltr(`${k} × ${q} = ${n}`)}.`);
	}
	case 'half': {
		const quarter = rng.chance(0.4);
		const d = quarter ? 4 : 2;
		const q = rng.int(quarter ? 3 : 6, quarter ? 15 : 40);
		const n = q * d;
		const word = quarter ? 'רבע' : 'חצי';
		return numQ(rng, id, level, `part:${d}:${n}`, `כמה זה ${word} מ-${n}?`, q,
			[n - d, n * d, quarter ? n / 2 : q + 10, q + 1, q - 1],
			`${word} זה לחלק ל-${d} חלקים שווים: ${ltr(`${n} : ${d} = ${q}`)}.`);
	}
	case 'big_mul': {
		const a = rng.int(11, 30);
		const b = rng.int(2, 5);
		const p = a * b;
		const tens = Math.floor(a / 10) * 10;
		const ones = a % 10;
		return numQ(rng, id, level, `big_mul:${a}:${b}`, `כמה זה ${ltr(`${a} × ${b}`)}?`,
			p, [tens * b + ones, p + b, p - b, p + 10, p - 10, a + b],
			`מפרקים: ${ltr(`${tens} × ${b} = ${tens * b}`)} ו-${ltr(`${ones} × ${b} = ${ones * b}`)}. ביחד ${p}.`);
	}
	default: {
		if (rng.chance(0.3)) {
			const b = rng.int(2, 9);
			return numQ(rng, id, level, `tens:${b}:100`, `כמה זה ${ltr(`${b} × 100`)}?`,
				b * 100, [b * 10, b * 1000, b + 100, b * 100 + 1],
				`${b} פעמים 100 זה ${b} מאות: ${b * 100}.`, null, { max: 100000 });
		}
		const a = rng.int(2, 60);
		return numQ(rng, id, level, `tens:${a}:10`, `כמה זה ${ltr(`${a} × 10`)}?`,
			a * 10, [a + 10, a * 100, a * 10 + 1, a * 10 - 10],
			`כשכופלים ב-10 מוסיפים 0 בסוף: ${a * 10}.`, null, { max: 100000 });
	}
	}
}

// ---------------------------------------------------------------------------
// 3. Word problems

const ITEMS = ['סוכריות', 'מדבקות', 'גולות', 'קלפים', 'עפרונות', 'בלונים', 'אבנים צבעוניות', 'כדורים'];
const FEMININE_ITEMS = new Set(['סוכריות', 'מדבקות', 'גולות', 'אבנים צבעוניות', 'עוגיות']);
const fem = (obj, male, female) => (FEMININE_ITEMS.has(obj) ? female : male);
const SHOP = ['כדור', 'ספר', 'מחברת', 'צעצוע', 'קלמר', 'משחק', 'כובע', 'בובה', 'עיפרון מחיק'];
const SHOP2 = ['גלידה', 'חולצה', 'בקבוק מים', 'מסגרת לתמונה', 'עוגה', 'קופסת צבעים'];

function asRange(level) {
	return [[0, 0], [2, 20], [10, 50], [20, 100], [20, 100], [100, 900]][level];
}

function subPair(rng, level) {
	const [lo, hi] = asRange(level);
	// b and a - b are both at least 2: "1 סוכריות" / "ב-1 שנים" is not Hebrew.
	const a = rng.int(Math.max(lo, 5), hi);
	const b = rng.int(Math.max(2, Math.floor(lo / 2)), a - 2);
	return [a, b];
}

function mulPair(rng, level) {
	if (level <= 2)
		return [rng.int(2, 5), rng.int(2, 5)];
	if (level === 3)
		return [rng.int(2, 10), rng.int(2, 5)];
	if (level === 4)
		return [rng.int(3, 10), rng.int(2, 10)];
	return [rng.int(4, 12), rng.int(3, 9)];
}

function durText(min) {
	const h = Math.floor(min / 60);
	const m = min % 60;
	const hText = h === 0 ? '' : h === 1 ? 'שעה' : h === 2 ? 'שעתיים' : `${h} שעות`;
	if (m === 0)
		return hText;
	if (h === 0)
		return m === 15 ? 'רבע שעה' : m === 30 ? 'חצי שעה' : `${m} דקות`;
	if (m === 15)
		return `${hText} ורבע`;
	if (m === 30)
		return `${hText} וחצי`;
	return `${hText} ו-${m} דקות`;
}

function timeStr(h, m) {
	return `${h}:${String(m).padStart(2, '0')}`;
}

// Adds minutes on a 12-hour clock face.
function addMinutes(h, m, d) {
	const t = (((h % 12) * 60 + m + d) % 720 + 720) % 720;
	const hh = Math.floor(t / 60);
	return [hh === 0 ? 12 : hh, t % 60];
}

const WORD_TEMPLATES = [
	{
		id: 'give', min: 1, gen(rng, L) {
			const p = person(rng);
			const q = person(rng, p);
			const obj = rng.pick(ITEMS);
			const [a, b] = subPair(rng, L);
			return {
				k: [a, b], ans: a - b, cands: [a + b, a - b + 1, a - b - 1, a - b + 10, b],
				prompt: `ל${p.name} היו ${a} ${obj}. ${v(p, 'הוא נתן', 'היא נתנה')} ל${q.name} ${b} ${obj}. כמה ${obj} נשארו ל${p.name}?`,
				expl: `נתנו, אז מחסירים: ${ltr(`${a} - ${b} = ${a - b}`)}.`,
			};
		},
	},
	{
		id: 'get', min: 1, gen(rng, L) {
			const p = person(rng);
			const q = person(rng, p);
			const obj = rng.pick(ITEMS);
			const [a, b] = subPair(rng, L);
			const x = a - b;
			return {
				k: [x, b], ans: a, cands: [a - b - b, a + 1, a - 1, a + 10, a - 10],
				prompt: `ל${p.name} היו ${x} ${obj}. ${q.name} ${v(q, 'נתן', 'נתנה')} ${v(p, 'לו', 'לה')} עוד ${b}. כמה ${obj} יש ל${p.name} עכשיו?`,
				expl: `קיבלו עוד, אז מחברים: ${ltr(`${x} + ${b} = ${a}`)}.`,
			};
		},
	},
	{
		id: 'money_left', min: 1, gen(rng, L) {
			const p = person(rng);
			const it = rng.pick(SHOP);
			const [a, b] = subPair(rng, L);
			return {
				k: [a, b], ans: a - b, cands: [a + b, a - b + 1, a - b - 1, a - b + 10, b],
				prompt: `ל${p.name} היו ${a} ש"ח. ${v(p, 'הוא קנה', 'היא קנתה')} ${it} ב-${b} ש"ח. כמה כסף נשאר ל${p.name}?`,
				expl: `שילמו, אז הכסף ירד: ${ltr(`${a} - ${b} = ${a - b}`)} ש"ח.`,
			};
		},
	},
	{
		id: 'money_total', min: 1, gen(rng, L) {
			const p = person(rng);
			const it1 = rng.pick(SHOP);
			const it2 = rng.pick(SHOP2);
			const [a, b] = subPair(rng, L);
			const x = a - b;
			return {
				k: [x, b], ans: a, cands: [Math.abs(x - b), a + 1, a - 1, a + 10, noCarryAdd(x, b)],
				prompt: `${p.name} ${v(p, 'קנה', 'קנתה')} ${it1} ב-${x} ש"ח ו${it2} ב-${b} ש"ח. כמה ${v(p, 'הוא שילם', 'היא שילמה')} בסך הכל?`,
				expl: `מחברים את שני המחירים: ${ltr(`${x} + ${b} = ${a}`)} ש"ח.`,
			};
		},
	},
	{
		id: 'money_change', min: 3, gen(rng, L) {
			const p = person(rng);
			const note = L >= 5 ? rng.pick([100, 200]) : rng.pick([20, 50, 100]);
			const spend = rng.int(Math.floor(note / 3), note - 2);
			const a = rng.int(2, spend - 2);
			const b = spend - a;
			const it1 = rng.pick(SHOP);
			const it2 = rng.pick(SHOP2);
			return {
				k: [note, a, b], ans: note - spend,
				cands: [note - a, note - b, spend, note - spend + 1, note - spend - 1, note - spend + 10],
				prompt: `${p.name} ${v(p, 'קנה', 'קנתה')} ${it1} ב-${a} ש"ח ו${it2} ב-${b} ש"ח. ${v(p, 'הוא שילם', 'היא שילמה')} בשטר של ${note} ש"ח. כמה עודף ${v(p, 'הוא קיבל', 'היא קיבלה')}?`,
				expl: `קודם ${ltr(`${a} + ${b} = ${spend}`)}, ואז ${ltr(`${note} - ${spend} = ${note - spend}`)} ש"ח עודף.`,
			};
		},
	},
	{
		id: 'age_sibling', min: 1, gen(rng, L) {
			const p = person(rng);
			const sibM = rng.chance(0.5);
			const sib = p.m ? (sibM ? 'אחיו' : 'אחותו') : (sibM ? 'אחיה' : 'אחותה');
			const a = rng.int(5, 12);
			const older = rng.chance(0.6) || a <= 6;
			const b = older ? rng.int(2, L >= 3 ? 9 : 5) : rng.int(2, a - 3);
			const ans = older ? a + b : a - b;
			const sibAdj = older ? (sibM ? 'גדול' : 'גדולה') : (sibM ? 'קטן' : 'קטנה');
			return {
				k: [a, b, older ? 'o' : 'y'], ans,
				cands: [older ? a - b : a + b, ans + 1, ans - 1, b],
				prompt: `${p.name} ${v(p, 'בן', 'בת')} ${a}. ${sib} ${sibAdj} ${v(p, 'ממנו', 'ממנה')} ב-${b} שנים. ${sibM ? 'בן' : 'בת'} כמה ${sib}?`,
				expl: older
					? `${sib} ${sibAdj}, אז מוסיפים: ${ltr(`${a} + ${b} = ${ans}`)}.`
					: `${sib} ${sibAdj}, אז מחסירים: ${ltr(`${a} - ${b} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'age_parent', min: 4, gen(rng) {
			const p = person(rng);
			const mom = rng.chance(0.5);
			const a = rng.int(6, 12);
			const b = rng.int(24, 38);
			const twoStep = rng.chance(0.5);
			const later = rng.int(2, 9);
			const ans = twoStep ? a + b + later : a + b;
			const par = mom ? 'אמא' : 'אבא';
			const prompt = `${p.name} ${v(p, 'בן', 'בת')} ${a}. ${par} של ${p.name} ${mom ? 'גדולה' : 'גדול'} ${v(p, 'ממנו', 'ממנה')} ב-${b} שנים. ` +
				(twoStep ? `${mom ? 'בת' : 'בן'} כמה ${mom ? 'תהיה' : 'יהיה'} ${par} של ${p.name} בעוד ${later} שנים?` : `${mom ? 'בת' : 'בן'} כמה ${par} של ${p.name}?`);
			return {
				k: [a, b, twoStep ? later : 0], ans,
				cands: twoStep ? [a + b, a + later, ans + 1, ans - 10] : [b - a, ans + 1, ans - 1, ans + 10],
				prompt,
				expl: twoStep
					? `עכשיו ${par} ${mom ? 'בת' : 'בן'} ${ltr(`${a} + ${b} = ${a + b}`)}, ובעוד ${later} שנים: ${ltr(`${a + b} + ${later} = ${ans}`)}.`
					: `${ltr(`${a} + ${b} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'age_time', min: 1, gen(rng, L) {
			const p = person(rng);
			const a = rng.int(4, 12);
			const future = rng.chance(0.5);
			const b = future ? rng.int(2, L >= 3 ? 20 : 8) : rng.int(2, a - 2);
			const ans = future ? a + b : a - b;
			const q = future
				? `${v(p, 'בן', 'בת')} כמה ${v(p, 'יהיה', 'תהיה')} ${p.name} בעוד ${b} שנים?`
				: `${v(p, 'בן', 'בת')} כמה ${v(p, 'היה', 'הייתה')} ${p.name} לפני ${b} שנים?`;
			return {
				k: [a, b, future ? 'f' : 'p'], ans,
				cands: [future ? a - b : a + b, ans + 1, ans - 1, b],
				prompt: `${p.name} ${v(p, 'בן', 'בת')} ${a}. ${q}`,
				expl: future ? `בעתיד הגיל גדל: ${ltr(`${a} + ${b} = ${ans}`)}.`
					: `בעבר הגיל היה קטן יותר: ${ltr(`${a} - ${b} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'age_diff', min: 2, gen(rng) {
			const p = person(rng);
			const q = person(rng, p);
			const b = rng.int(3, 10);
			const a = b + rng.int(1, 8);
			return {
				k: [a, b], ans: a - b, cands: [a + b, a - b + 1, a - b - 1, a],
				prompt: `${p.name} ${v(p, 'בן', 'בת')} ${a} ו${q.name} ${v(q, 'בן', 'בת')} ${b}. בכמה שנים ${p.name} ${v(p, 'גדול', 'גדולה')} מ${q.name}?`,
				expl: `מחפשים את ההפרש: ${ltr(`${a} - ${b} = ${a - b}`)}.`,
			};
		},
	},
	{
		id: 'class_total', min: 1, gen(rng, L) {
			const p = person(rng);
			const lo = L === 1 ? 3 : 8;
			const hi = L === 1 ? 9 : L >= 5 ? 19 : 17;
			const a = rng.int(lo, hi);
			const b = rng.int(lo, hi);
			const place = L === 1 ? 'בקבוצה' : 'בכיתה';
			return {
				k: [a, b], ans: a + b, cands: [Math.abs(a - b), a + b + 1, a + b - 1, a + b + 10, noCarryAdd(a, b)],
				prompt: `${place} של ${p.name} יש ${a} בנים ו-${b} בנות. כמה ילדים יש ${place}?`,
				expl: `בנים ובנות ביחד: ${ltr(`${a} + ${b} = ${a + b}`)}.`,
			};
		},
	},
	{
		id: 'class_absent', min: 1, gen(rng, L) {
			const a = L === 1 ? rng.int(8, 20) : rng.int(22, 38);
			const b = rng.int(2, L === 1 ? 7 : 12);
			return {
				k: [a, b], ans: a - b, cands: [a + b, a - b + 1, a - b - 1, b, noBorrowSub(a, b)],
				prompt: `בכיתה יש ${a} ילדים. היום ${b} ילדים חולים ונשארו בבית. כמה ילדים הגיעו לכיתה?`,
				expl: `מורידים את החולים: ${ltr(`${a} - ${b} = ${a - b}`)}.`,
			};
		},
	},
	{
		id: 'bus_stop', min: 2, gen(rng, L) {
			const a = rng.int(L <= 3 ? 10 : 20, L <= 3 ? 30 : 50);
			const b = rng.int(2, Math.min(15, a - 3));
			const c = rng.int(2, 15);
			const ans = a - b + c;
			return {
				k: [a, b, c], ans, cands: [a - b - c, a + b + c, a + b - c, ans + 1, ans - 1],
				prompt: `באוטובוס היו ${a} נוסעים. בתחנה ירדו ${b} נוסעים ועלו ${c} נוסעים. כמה נוסעים יש עכשיו באוטובוס?`,
				expl: `ירדו: ${ltr(`${a} - ${b} = ${a - b}`)}. עלו: ${ltr(`${a - b} + ${c} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'bus_seats', min: 3, gen(rng, L) {
			const [a, b] = mulPair(rng, L);
			return {
				k: [a, b], ans: a * b, cands: mulCands(a, b),
				prompt: `באוטובוס יש ${a} שורות של מושבים, ובכל שורה ${b} מושבים. כמה מושבים יש באוטובוס?`,
				expl: `${a} שורות של ${b}: ${ltr(`${a} × ${b} = ${a * b}`)}.`,
			};
		},
	},
	{
		id: 'book_left', min: 1, gen(rng, L) {
			const p = person(rng);
			const [a, b] = subPair(rng, L);
			return {
				k: [a, b], ans: a - b, cands: [a + b, a - b + 1, a - b - 1, a - b + 10, b],
				prompt: `בספר של ${p.name} יש ${a} עמודים. ${p.name} ${v(p, 'קרא', 'קראה')} כבר ${b} עמודים. כמה עמודים נשארו ${v(p, 'לו', 'לה')} לקרוא?`,
				expl: `${ltr(`${a} - ${b} = ${a - b}`)} עמודים נשארו.`,
			};
		},
	},
	{
		id: 'book_days', min: 3, gen(rng, L) {
			const p = person(rng);
			const [d, per] = mulPair(rng, L);
			const total = d * per;
			if (L >= 5 && rng.chance(0.5)) {
				return {
					k: ['div', total, per], ans: d, cands: [total - per, d + 1, d - 1, per, total + per],
					prompt: `בספר יש ${total} עמודים. ${p.name} ${v(p, 'קורא', 'קוראת')} ${per} עמודים בכל יום. בכמה ימים ${v(p, 'יגמור', 'תגמור')} את הספר?`,
					expl: `${ltr(`${total} : ${per} = ${d}`)}, כי ${ltr(`${d} × ${per} = ${total}`)}.`,
				};
			}
			return {
				k: ['mul', d, per], ans: total, cands: mulCands(d, per),
				prompt: `${p.name} ${v(p, 'קורא', 'קוראת')} ${per} עמודים בכל יום. כמה עמודים ${v(p, 'יקרא', 'תקרא')} ב-${d} ימים?`,
				expl: `${d} ימים של ${per} עמודים: ${ltr(`${d} × ${per} = ${total}`)}.`,
			};
		},
	},
	{
		id: 'time_end', min: 2, gen(rng, L) {
			const halves = L >= 3;
			const d = halves ? rng.pick([60, 90, 120, 150, 180]) : rng.pick([60, 120, 180]);
			const m = halves ? rng.pick([0, 30]) : 0;
			const h = rng.int(1, 8);
			const [eh, em] = addMinutes(h, m, d);
			const ans = timeStr(eh, em);
			const ev = rng.pick([['הסרט', 'התחיל', 'ונמשך', 'נגמר'], ['המשחק', 'התחיל', 'ונמשך', 'נגמר'],
				['ההצגה', 'התחילה', 'ונמשכה', 'נגמרה'], ['המסיבה', 'התחילה', 'ונמשכה', 'נגמרה']]);
			const cands = [addMinutes(h, m, -d), addMinutes(h, m, d + 60), addMinutes(h, m, d - 60),
				addMinutes(h, m, d + 30), addMinutes(h, m, d - 30)].map(([x, y]) => timeStr(x, y));
			return {
				k: [h, m, d], ans, strings: true,
				cands: fillStrings(rng, ans, cands, () => timeStr(rng.int(1, 12), rng.pick([0, 30]))),
				prompt: `${ev[0]} ${ev[1]} בשעה ${timeStr(h, m)} ${ev[2]} ${durText(d)}. באיזו שעה ${ev[0]} ${ev[3]}?`,
				expl: `מוסיפים ${durText(d)} לשעה ${timeStr(h, m)} ומגיעים ל-${ans}.`,
			};
		},
	},
	{
		id: 'time_start', min: 3, gen(rng, L) {
			const d = rng.pick(L >= 4 ? [30, 60, 90, 120, 150] : [60, 120]);
			const m = rng.pick([0, 30]);
			const h = rng.int(4, 11);
			const [sh, sm] = addMinutes(h, m, -d);
			const ans = timeStr(sh, sm);
			const cands = [addMinutes(h, m, d), addMinutes(h, m, -d - 60), addMinutes(h, m, -d + 60),
				addMinutes(h, m, -d + 30)].map(([x, y]) => timeStr(x, y));
			return {
				k: [h, m, d], ans, strings: true,
				cands: fillStrings(rng, ans, cands, () => timeStr(rng.int(1, 12), rng.pick([0, 30]))),
				prompt: `הטיול נגמר בשעה ${timeStr(h, m)}. הוא נמשך ${durText(d)}. באיזו שעה התחיל הטיול?`,
				expl: `חוזרים אחורה ${durText(d)} מ-${timeStr(h, m)} ומגיעים ל-${ans}.`,
			};
		},
	},
	{
		id: 'share', min: 2, gen(rng, L) {
			const [k, q] = mulPair(rng, L);
			const n = k * q;
			const obj = rng.pick(['עוגיות', 'מדבקות', 'קלפים', 'סוכריות', 'גולות', 'בלונים']);
			return {
				k: [n, k], ans: q, cands: [n - k, q + 1, q - 1, k, n + k],
				prompt: `יש ${n} ${obj}. מחלקים ${fem(obj, 'אותם', 'אותן')} שווה בשווה בין ${k} ילדים. כמה ${obj} יקבל כל ילד?`,
				expl: `${ltr(`${n} : ${k} = ${q}`)}, כי ${ltr(`${k} × ${q} = ${n}`)}.`,
			};
		},
	},
	{
		id: 'bags', min: 2, gen(rng, L) {
			const [a, b] = mulPair(rng, L);
			const it = rng.pick(GROUP_ITEMS);
			return {
				k: [a, b], ans: a * b, cands: mulCands(a, b),
				prompt: `יש ${a} ${it.box}, ובכל ${it.one} יש ${b} ${it.what}. כמה ${it.what} יש בסך הכל?`,
				expl: `${a} פעמים ${b}: ${ltr(`${a} × ${b} = ${a * b}`)}.`,
			};
		},
	},
	{
		id: 'legs', min: 2, gen(rng, L) {
			if (L <= 3) {
				const dog = rng.chance(0.5);
				const n = rng.int(2, L === 2 ? 5 : 9);
				const per = dog ? 4 : 2;
				return {
					k: [dog ? 'd' : 'c', n], ans: n * per, cands: [n + per, n, n * (dog ? 2 : 4), n * per + 2, n * per - 2],
					prompt: `בחצר יש ${n} ${dog ? 'כלבים' : 'תרנגולות'}. כמה רגליים יש ${dog ? 'להם' : 'להן'} ביחד?`,
					expl: `${dog ? 'לכלב' : 'לתרנגולת'} יש ${per} רגליים: ${ltr(`${n} × ${per} = ${n * per}`)}.`,
				};
			}
			const a = rng.int(2, 9);
			const b = rng.int(2, L === 4 ? 5 : 9);
			const ans = 2 * a + 4 * b;
			return {
				k: ['mix', a, b], ans, cands: [a + b, 2 * (a + b), 4 * (a + b), 4 * a + 2 * b, ans + 2, ans - 2],
				prompt: `בחצר יש ${a} תרנגולות ו-${b} כלבים. כמה רגליים יש להם ביחד?`,
				expl: `לתרנגולות ${ltr(`${a} × 2 = ${2 * a}`)}, לכלבים ${ltr(`${b} × 4 = ${4 * b}`)}. ביחד ${ans}.`,
			};
		},
	},
	{
		id: 'compare', min: 1, gen(rng, L) {
			const p = person(rng);
			const q = person(rng, p);
			const obj = rng.pick(ITEMS);
			const [a, b] = subPair(rng, L);
			return {
				k: [a, b], ans: a - b, cands: [a + b, a - b + 1, a - b - 1, a, b],
				prompt: `ל${p.name} יש ${a} ${obj} ול${q.name} יש ${b} ${obj}. כמה ${obj} יש ל${p.name} יותר מאשר ל${q.name}?`,
				expl: `מחפשים את ההפרש: ${ltr(`${a} - ${b} = ${a - b}`)}.`,
			};
		},
	},
	{
		id: 'missing_start', min: 2, gen(rng, L) {
			const p = person(rng);
			const obj = rng.pick(ITEMS);
			const [c, b] = subPair(rng, L);
			return {
				k: [b, c], ans: c - b, cands: [c + b, c - b + 1, c - b - 1, c - b + 10, c],
				prompt: `ל${p.name} היו כמה ${obj}. אחר כך ${v(p, 'הוא קיבל', 'היא קיבלה')} עוד ${b}, ועכשיו יש ${v(p, 'לו', 'לה')} ${c}. כמה ${obj} היו ל${p.name} בהתחלה?`,
				expl: `מורידים את מה ש${v(p, 'הוא קיבל', 'היא קיבלה')}: ${ltr(`${c} - ${b} = ${c - b}`)}.`,
			};
		},
	},
	{
		id: 'missing_given', min: 2, gen(rng, L) {
			const p = person(rng);
			const q = person(rng, p);
			const obj = rng.pick(ITEMS);
			const [a, c] = subPair(rng, L);
			return {
				k: [a, c], ans: a - c, cands: [a + c, a - c + 1, a - c - 1, c, a - c + 10],
				prompt: `ל${p.name} היו ${a} ${obj}. ${v(p, 'הוא נתן', 'היא נתנה')} כמה ${fem(obj, 'מהם', 'מהן')} ל${q.name}, ונשארו ${v(p, 'לו', 'לה')} ${c}. כמה ${obj} ${v(p, 'נתן', 'נתנה')} ${p.name}?`,
				expl: `${ltr(`${a} - ${c} = ${a - c}`)}. אפשר לבדוק: ${ltr(`${c} + ${a - c} = ${a}`)}.`,
			};
		},
	},
	{
		id: 'times_more', min: 3, gen(rng, L) {
			const p = person(rng);
			const q = person(rng, p);
			const obj = rng.pick(['ספרים', 'מדבקות', 'קלפים', 'גולות']);
			if (L >= 4 && rng.chance(0.4)) {
				const h = rng.int(3, 25);
				const a = h * 2;
				return {
					k: ['half', a], ans: h, cands: [a - 2, a + 2, a * 2, h + 1, h - 1],
					prompt: `ל${p.name} יש ${a} ${obj}. ל${q.name} יש חצי ממספר ה${obj} של ${p.name}. כמה ${obj} יש ל${q.name}?`,
					expl: `חצי זה לחלק ל-2: ${ltr(`${a} : 2 = ${h}`)}.`,
				};
			}
			const k = rng.int(2, L >= 5 ? 5 : 3);
			const a = rng.int(3, L >= 5 ? 20 : 10);
			return {
				k: ['times', a, k], ans: a * k, cands: [a + k, a * k + a, a * k - a, a * k + 1],
				prompt: `ל${p.name} יש ${a} ${obj}. ל${q.name} יש פי ${k} ${obj} מאשר ל${p.name}. כמה ${obj} יש ל${q.name}?`,
				expl: `פי ${k} זה ${k} פעמים: ${ltr(`${a} × ${k} = ${a * k}`)}.`,
			};
		},
	},
	{
		id: 'floors', min: 2, gen(rng) {
			const p = person(rng);
			const a = rng.int(1, 12);
			const b = rng.int(2, 8);
			const c = rng.int(2, a + b - 1);
			const ans = a + b - c;
			return {
				k: [a, b, c], ans, cands: [a - b + c, a + b + c, a + b, ans + 1, ans - 1],
				prompt: `${p.name} ${v(p, 'גר', 'גרה')} בקומה ${a}. ${v(p, 'הוא עלה', 'היא עלתה')} במעלית ${b} קומות, ואחר כך ${v(p, 'ירד', 'ירדה')} ${c} קומות. באיזו קומה ${p.name} עכשיו?`,
				expl: `${ltr(`${a} + ${b} = ${a + b}`)}, ואז ${ltr(`${a + b} - ${c} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'savings', min: 3, gen(rng, L) {
			const p = person(rng);
			const [w, per] = mulPair(rng, L);
			const total = w * per;
			if (L >= 4 && rng.chance(0.5)) {
				return {
					k: ['div', total, per], ans: w, cands: [total - per, w + 1, w - 1, per, total + per],
					prompt: `${p.name} ${v(p, 'חוסך', 'חוסכת')} ${per} ש"ח בכל שבוע. אחרי כמה שבועות יהיו ${v(p, 'לו', 'לה')} ${total} ש"ח?`,
					expl: `${ltr(`${total} : ${per} = ${w}`)}, כי ${ltr(`${w} × ${per} = ${total}`)}.`,
				};
			}
			return {
				k: ['mul', w, per], ans: total, cands: mulCands(w, per),
				prompt: `${p.name} ${v(p, 'חוסך', 'חוסכת')} ${per} ש"ח בכל שבוע. כמה ש"ח ${v(p, 'יחסוך', 'תחסוך')} אחרי ${w} שבועות?`,
				expl: `${w} שבועות של ${per} ש"ח: ${ltr(`${w} × ${per} = ${total}`)}.`,
			};
		},
	},
	{
		id: 'trees', min: 3, gen(rng, L) {
			const [a, b] = mulPair(rng, L);
			const place = rng.pick([['בפרדס', 'עצים'], ['בגינה', 'שתילים'], ['באולם', 'כיסאות']]);
			return {
				k: [place[1], a, b], ans: a * b, cands: mulCands(a, b),
				prompt: `${place[0]} יש ${a} שורות, ובכל שורה ${b} ${place[1]}. כמה ${place[1]} יש ${place[0]}?`,
				expl: `${ltr(`${a} × ${b} = ${a * b}`)}.`,
			};
		},
	},
	{
		id: 'boxes_left', min: 4, gen(rng, L) {
			const p = person(rng);
			const [a, b] = mulPair(rng, L);
			const total = a * b;
			const c = rng.int(2, total - 1);
			const ans = total - c;
			return {
				k: [a, b, c], ans, cands: [a + b - c, total + c, total, ans + 1, ans - 1],
				prompt: `ל${p.name} היו ${a} קופסאות, ובכל קופסה ${b} עפרונות. ${v(p, 'הוא נתן', 'היא נתנה')} לחברים ${c} עפרונות. כמה עפרונות נשארו ל${p.name}?`,
				expl: `היו ${ltr(`${a} × ${b} = ${total}`)} עפרונות. נשארו ${ltr(`${total} - ${c} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'balloons', min: 3, gen(rng, L) {
			const a = rng.int(5, L >= 5 ? 60 : 30);
			const b = rng.int(5, L >= 5 ? 60 : 30);
			const c = rng.int(2, Math.min(a + b - 1, 15));
			const ans = a + b - c;
			return {
				k: [a, b, c], ans, cands: [a + b + c, a + b, a - c, ans + 1, ans - 1],
				prompt: `למסיבה הביאו ${a} בלונים אדומים ו-${b} בלונים כחולים. ${c} בלונים התפוצצו. כמה בלונים נשארו?`,
				expl: `${ltr(`${a} + ${b} = ${a + b}`)}, ואז ${ltr(`${a + b} - ${c} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'tower', min: 4, gen(rng, L) {
			const p = person(rng);
			const q = person(rng, p);
			const a = rng.int(6, L >= 5 ? 40 : 20);
			const b = rng.int(2, 12);
			const ans = a + a + b;
			return {
				k: [a, b], ans, cands: [a + b, 2 * a, a + a - b, ans + 1, ans - 1],
				prompt: `${p.name} ${v(p, 'בנה', 'בנתה')} מגדל מ-${a} קוביות. ${q.name} ${v(q, 'בנה', 'בנתה')} מגדל עם ${b} קוביות יותר. כמה קוביות יש בשני המגדלים ביחד?`,
				expl: `ל${q.name} ${ltr(`${a} + ${b} = ${a + b}`)}. ביחד ${ltr(`${a} + ${a + b} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'fruit', min: 4, gen(rng, L) {
			const a = rng.int(8, L >= 5 ? 50 : 25);
			const b = rng.int(2, a - 2);
			const ans = a + a - b;
			return {
				k: [a, b], ans, cands: [a - b, a + b, 2 * a, ans + 1, ans - 1],
				prompt: `בסל יש ${a} תפוחים. יש בו גם אגסים – ${b} פחות ממספר התפוחים. כמה פירות יש בסל בסך הכל?`,
				expl: `אגסים: ${ltr(`${a} - ${b} = ${a - b}`)}. כל הפירות: ${ltr(`${a} + ${a - b} = ${ans}`)}.`,
			};
		},
	},
	{
		id: 'wheels', min: 4, gen(rng, L) {
			const a = rng.int(2, L >= 5 ? 12 : 8);
			const b = rng.int(2, L >= 5 ? 9 : 5);
			const ans = 2 * a + 3 * b;
			return {
				k: [a, b], ans, cands: [a + b, 2 * (a + b), 3 * (a + b), 3 * a + 2 * b, ans + 1, ans - 1],
				prompt: `בחנייה יש ${a} אופניים ו-${b} תלת-אופנים. כמה גלגלים יש בחנייה?`,
				expl: `אופניים: ${ltr(`${a} × 2 = ${2 * a}`)}. תלת-אופנים: ${ltr(`${b} × 3 = ${3 * b}`)}. ביחד ${ans}.`,
			};
		},
	},
	{
		id: 'queue', min: 3, gen(rng) {
			const p = person(rng);
			if (rng.chance(0.5)) {
				const c = rng.int(8, 30);
				const a = rng.int(2, c - 2);
				return {
					k: ['after', a, c], ans: c - a, cands: [c - a + 1, c - a - 1, a, c],
					prompt: `בתור עומדים ${c} ילדים. ${p.name} ${v(p, 'עומד', 'עומדת')} במקום ה-${a} מההתחלה. כמה ילדים עומדים אחרי ${p.name}?`,
					expl: `${p.name} ועוד ${a - 1 === 1 ? 'ילד אחד' : `${a - 1} ילדים`} ${v(p, 'שלפניו', 'שלפניה')} הם ${a} ילדים. ${ltr(`${c} - ${a} = ${c - a}`)}.`,
				};
			}
			const a = rng.int(2, 15);
			const b = rng.int(2, 15);
			return {
				k: ['total', a, b], ans: a + b + 1, cands: [a + b, a + b + 2, a + b - 1],
				prompt: `בתור עומדים ילדים. לפני ${p.name} יש ${a} ילדים ואחרי ${p.name} יש ${b} ילדים. כמה ילדים בתור?`,
				expl: `לא שוכחים את ${p.name}: ${ltr(`${a} + ${b} + 1 = ${a + b + 1}`)}.`,
			};
		},
	},
	{
		id: 'pizza', min: 3, gen(rng, L) {
			const slices = rng.pick([4, 6, 8]);
			const k = rng.int(2, 5);
			const total = slices * k;
			if (L >= 5) {
				const kids = rng.int(2, 6);
				const each = rng.int(1, 3);
				if (kids * each < total) {
					const ans = total - kids * each;
					return {
						k: ['left', slices, k, kids, each], ans,
						cands: [total - kids, total - each, kids * each, ans + 1, ans - 1],
						prompt: `כל פיצה חתוכה ל-${slices} משולשים. הזמינו ${k} פיצות. ${kids} ילדים אכלו, וכל ילד אכל ${each === 1 ? 'משולש אחד' : `${each} משולשים`}. כמה משולשים נשארו?`,
						expl: `היו ${ltr(`${k} × ${slices} = ${total}`)}. אכלו ${ltr(`${kids} × ${each} = ${kids * each}`)}. נשארו ${ans}.`,
					};
				}
			}
			return {
				k: ['all', slices, k], ans: total, cands: mulCands(slices, k),
				prompt: `כל פיצה חתוכה ל-${slices} משולשים. כמה משולשים יש ב-${k} פיצות?`,
				expl: `${ltr(`${k} × ${slices} = ${total}`)}.`,
			};
		},
	},
];

function genWordProblem(rng, level) {
	const id = 'math.word_problems';
	const eligible = WORD_TEMPLATES.filter((t) => level >= t.min);
	const t = rng.pick(eligible);
	const r = t.gen(rng, level);
	const keyTail = `${t.id}:${r.k.join(':')}`;
	if (r.strings)
		return makeQ(rng, id, level, keyTail, r.prompt, r.ans, r.cands, r.expl);
	return numQ(rng, id, level, keyTail, r.prompt, r.ans, r.cands, r.expl);
}

// ---------------------------------------------------------------------------
// 4. Number series

function seriesOf(rng, level) {
	const types = { 1: ['arith'], 2: ['arith', 'arith_down', 'alt'],
		3: ['arith', 'arith_down', 'alt', 'grow', 'double'],
		4: ['arith_down', 'alt', 'grow', 'double', 'interleave'],
		5: ['arith', 'alt', 'grow', 'double', 'interleave', 'fib'] }[level];
	const type = rng.pick(types);
	const n = level <= 2 ? 5 : 6;
	const t = [];
	let expl;
	switch (type) {
	case 'arith': {
		const d = level === 1 ? rng.int(1, 5) : level <= 3 ? rng.int(2, 12)
			: level === 4 ? rng.int(5, 25) : rng.pick([25, 50, 100, rng.int(11, 40)]);
		const s = level === 5 ? rng.int(10, 300) : rng.int(1, level === 1 ? 20 : 40);
		for (let i = 0; i < n; i++)
			t.push(s + i * d);
		expl = `בכל צעד מוסיפים ${d}.`;
		return { type, t, key: `${s}:${d}`, expl, step: d };
	}
	case 'arith_down': {
		const d = level === 2 ? rng.int(2, 10) : rng.int(3, 25);
		const end = rng.int(1, 30);
		const s = end + (n - 1) * d;
		for (let i = 0; i < n; i++)
			t.push(s - i * d);
		expl = `בכל צעד מורידים ${d}.`;
		return { type, t, key: `${s}:${d}`, expl, step: -d };
	}
	case 'alt': {
		const p = rng.int(2, level >= 4 ? 15 : 9);
		const down = rng.chance(0.5);
		const q = down ? rng.int(1, p - 1) : rng.int(1, 10);
		if (q === p && !down)
			return seriesOf(rng, level);
		let x = rng.int(down ? 1 : 1, 30);
		t.push(x);
		for (let i = 1; i < n; i++) {
			x += i % 2 === 1 ? p : (down ? -q : q);
			t.push(x);
		}
		expl = down ? `מוסיפים ${p}, ואז מורידים ${q}, וחוזר חלילה.`
			: `מוסיפים ${p}, ואז מוסיפים ${q}, וחוזר חלילה.`;
		return { type, t, key: `${t[0]}:${p}:${down ? -q : q}`, expl, step: p };
	}
	case 'grow': {
		const d0 = rng.int(1, 5);
		const e = level >= 4 ? rng.int(1, 3) : 1;
		let x = rng.int(1, 20);
		const diffs = [];
		t.push(x);
		for (let i = 1; i < n; i++) {
			const d = d0 + (i - 1) * e;
			diffs.push(`+${d}`);
			x += d;
			t.push(x);
		}
		expl = `הקפיצה גדלה בכל פעם: ${ltr(diffs.join(', '))}.`;
		return { type, t, key: `${t[0]}:${d0}:${e}`, expl, step: d0 };
	}
	case 'double': {
		const half = level >= 4 && rng.chance(0.4);
		const f = level === 5 && !half && rng.chance(0.4) ? 3 : 2;
		const len = f === 3 ? 5 : n;
		if (half) {
			let x = rng.int(1, 5) * 2 ** (len - 1);
			for (let i = 0; i < len; i++, x /= 2)
				t.push(x);
			expl = 'כל מספר הוא חצי מהמספר שלפניו.';
		} else {
			let x = rng.int(1, f === 3 ? 4 : (level === 3 ? 6 : 12));
			for (let i = 0; i < len; i++, x *= f)
				t.push(x);
			expl = `כל מספר הוא פי ${f} מהמספר שלפניו.`;
		}
		return { type, t, key: `${half ? 'h' : f}:${t[0]}`, expl, step: t[1] - t[0] };
	}
	case 'interleave': {
		const a = rng.int(1, 20);
		const b = rng.int(1, 40);
		const p = rng.int(1, 10);
		const q = rng.int(2, 10) * (rng.chance(0.3) ? -1 : 1);
		const len = 7;
		for (let i = 0; i < len; i++) {
			const j = Math.floor(i / 2);
			t.push(i % 2 === 0 ? a + j * p : b + 40 + j * q);
		}
		if (t.some((x) => x <= 0) || p === q)
			return seriesOf(rng, level);
		expl = `יש כאן שתי סדרות שמתחלפות: אחת קופצת ב-${p}, והשנייה ${q > 0 ? `ב-${q}` : `יורדת ב-${-q}`}.`;
		return { type, t, key: `${a}:${p}:${b}:${q}`, expl, step: p };
	}
	default: {
		let a = rng.int(1, 5);
		let b = rng.int(a, 8);
		t.push(a, b);
		for (let i = 2; i < n + 1; i++) {
			[a, b] = [b, a + b];
			t.push(b);
		}
		expl = 'כל מספר הוא הסכום של שני המספרים שלפניו.';
		return { type: 'fib', t, key: `${t[0]}:${t[1]}`, expl, step: t[1] - t[0] };
	}
	}
}

function genSeries(rng, level) {
	const id = 'math.number_series';
	const s = seriesOf(rng, level);
	const t = s.t;
	const askMissing = level >= 2 && rng.chance(0.4);
	const idx = askMissing ? rng.int(2, t.length - 2) : t.length - 1;
	const ans = t[idx];
	const shown = t.map((x, i) => (i === idx ? '?' : String(x)));
	const prevDiff = t[idx - 1] - t[idx - 2];
	const naive = t[idx - 1] + prevDiff;
	const cands = [naive, t[idx - 1] + s.step, t[idx - 1] + (t[1] - t[0]), ans + 1, ans - 1,
		ans + 2, ans - 2, ans + 10, ans - 10];
	const prompt = askMissing ? 'איזה מספר חסר בסדרה?' : 'איזה מספר בא אחר כך בסדרה?';
	return numQ(rng, id, level, `${s.type}:${shown.join(',')}`,
		`${prompt}\n${ltr(shown.join(',  '))}`, ans, cands, s.expl);
}

// ---------------------------------------------------------------------------
// 5. Number sense

const PLACE = ['היחידות', 'העשרות', 'המאות'];
const PLACE_PLURAL = ['יחידות', 'עשרות', 'מאות'];

function randDigitsNumber(rng, len, distinct) {
	for (;;) {
		const d = [rng.int(1, 9)];
		while (d.length < len)
			d.push(rng.int(0, 9));
		if (!distinct || new Set(d).size === len)
			return Number(d.join(''));
	}
}

function permutations(arr) {
	if (arr.length <= 1)
		return [arr];
	const out = [];
	arr.forEach((x, i) => {
		const rest = arr.slice(0, i).concat(arr.slice(i + 1));
		permutations(rest).forEach((p) => out.push([x, ...p]));
	});
	return out;
}

function genNumberSense(rng, level) {
	const id = 'math.number_sense';
	const types = { 1: ['digit_place', 'compose', 'compare', 'parity', 'neighbor'],
		2: ['digit_place', 'digit_value', 'compose', 'compare', 'parity', 'riddle', 'from_digits', 'neighbor'],
		3: ['digit_place', 'digit_value', 'compose', 'compare', 'riddle', 'from_digits', 'between_count', 'neighbor'],
		4: ['digit_value', 'compose', 'compare', 'riddle', 'from_digits', 'between_count', 'neighbor'],
		5: ['digit_value', 'compose', 'compare', 'riddle', 'from_digits', 'between_count', 'neighbor'] }[level];
	const type = rng.pick(types);
	const len = level <= 2 ? 2 : 3;

	switch (type) {
	case 'digit_place': {
		const n = randDigitsNumber(rng, len, true);
		const ds = digits(n);
		const place = rng.int(0, len - 1);
		const ans = ds[len - 1 - place];
		return numQ(rng, id, level, `place:${n}:${place}`,
			`מהי ספרת ${PLACE[place]} במספר ${n}?`, ans,
			[...ds.filter((x) => x !== ans), ans * 10 ** place, ans + 1],
			`במספר ${n} ספרת ${PLACE[place]} היא ${ans}.`, null, { min: 0, max: 999 });
	}
	case 'digit_value': {
		const n = randDigitsNumber(rng, 3, true);
		const ds = digits(n);
		const place = rng.int(0, 2);
		const dig = ds[2 - place];
		if (dig === 0)
			return genNumberSense(rng, level);
		const ans = dig * 10 ** place;
		return numQ(rng, id, level, `value:${n}:${place}`,
			`כמה שווה הספרה ${dig} במספר ${n}?`, ans,
			[dig, dig * 10, dig * 100, n].filter((x) => x !== ans),
			`הספרה ${dig} נמצאת במקום ${PLACE[place]}, ולכן היא שווה ${ans}.`, null, { max: 999 });
	}
	case 'compose': {
		if (level <= 2) {
			const t = rng.int(2, 9);
			const u = rng.int(2, 9);
			const ans = t * 10 + u;
			return numQ(rng, id, level, `compose:${t}:${u}`,
				`איזה מספר יש בו ${t} עשרות ו-${u} יחידות?`, ans,
				[u * 10 + t, t + u, t * 100 + u, ans + 10],
				`${t} עשרות הן ${t * 10}, ועוד ${u} יחידות: ${ans}.`);
		}
		const h = rng.int(2, 9);
		const tens = rng.int(level >= 4 ? 0 : 2, 9);
		const tricky = level >= 4 && rng.chance(0.5);
		const u = tricky ? rng.int(11, 19) : rng.int(2, 9);
		const ans = h * 100 + tens * 10 + u;
		const parts = [`${h} מאות`, tens > 0 ? `${tens} עשרות` : null, `${u} יחידות`].filter(Boolean);
		const text = parts.length === 3 ? `${parts[0]}, ${parts[1]} ו-${parts[2]}` : `${parts[0]} ו-${parts[1]}`;
		const naive = Number(`${h}${tens}${u}`);
		return numQ(rng, id, level, `compose3:${h}:${tens}:${u}`,
			`איזה מספר יש בו ${text}?`, ans,
			[naive, h * 100 + u * 10 + tens, u * 100 + tens * 10 + h, ans + 10, ans - 10, ans + 100],
			tricky ? `${u} יחידות הן עשרת אחת ועוד ${u - 10}. לכן המספר הוא ${ans}.`
				: `${h * 100} ועוד ${tens * 10} ועוד ${u} זה ${ans}.`, null, { max: 99999 });
	}
	case 'compare': {
		const big = rng.chance(0.5);
		const word = big ? 'הכי גדול' : 'הכי קטן';
		let nums;
		if (len === 2) {
			const n = randDigitsNumber(rng, 2, true);
			const [x, y] = digits(n);
			const pool = [n, y * 10 + x, n + rng.pick([1, -1, 9, -9]), x * 10 + ((y + 5) % 10)];
			nums = [...new Set(pool.filter((z) => z >= 10 && z <= 99))];
			for (let d = 2; nums.length < 4; d++) {
				if (n + d <= 99 && !nums.includes(n + d))
					nums.push(n + d);
				else if (n - d >= 10 && !nums.includes(n - d))
					nums.push(n - d);
			}
		} else {
			const n = randDigitsNumber(rng, 3, true);
			if (digits(n).includes(0))
				return genNumberSense(rng, level);
			nums = rng.sample(permutations(digits(n)).map((p) => Number(p.join(''))), 4);
		}
		nums = nums.slice(0, 4);
		const ans = big ? Math.max(...nums) : Math.min(...nums);
		const others = nums.filter((x) => x !== ans);
		const keyNums = nums.slice().sort((a, b) => a - b).join(',');
		return makeQ(rng, id, level, `compare:${big ? 'max' : 'min'}:${keyNums}`,
			`איזה מספר ${word}?`, ans, others,
			`משווים קודם את הספרה השמאלית (${len === 3 ? 'המאות' : 'העשרות'}). המספר ${word} הוא ${ans}.`);
	}
	case 'parity': {
		const even = rng.chance(0.5);
		const hi = level === 1 ? 30 : 99;
		const pickParity = (wantEven) => {
			const x = rng.int(2, hi);
			return (x % 2 === 0) === wantEven ? x : x + 1;
		};
		const ans = pickParity(even);
		const others = [];
		while (others.length < 3) {
			const x = pickParity(!even);
			if (!others.includes(x) && x !== ans)
				others.push(x);
		}
		const all = [ans, ...others].sort((a, b) => a - b).join(',');
		return makeQ(rng, id, level, `parity:${even ? 'e' : 'o'}:${all}`,
			`איזה מספר ${even ? 'זוגי' : 'אי-זוגי'}?`, ans, others,
			`מספר זוגי נגמר ב-0, 2, 4, 6 או 8. ${ans} ${even ? 'זוגי' : 'אי-זוגי'}.`);
	}
	case 'neighbor': {
		const after = rng.chance(0.5);
		let n;
		if (level <= 2)
			n = rng.chance(0.5) ? rng.int(1, 9) * 10 + (after ? 9 : 0) : rng.int(11, 98);
		else
			n = rng.chance(0.6) ? rng.int(1, 9) * 100 + (after ? rng.pick([99, 9 + 10 * rng.int(0, 8)]) : rng.pick([0, 10 * rng.int(1, 9)])) : rng.int(101, 998);
		if (!after && n % 100 === 0 && n < 100)
			n += 1;
		const ans = after ? n + 1 : n - 1;
		const cands = after
			? [Math.floor(n / 10) * 10, n + 10, n - 1, Number(`${Math.floor(n / 10)}10`)]
			: [n + 1, n - 10, Number(`${Math.floor(n / 10) - 1}${n % 10}`), Math.floor(n / 10) * 10 + 9];
		return numQ(rng, id, level, `neighbor:${after ? 'a' : 'b'}:${n}`,
			after ? `איזה מספר בא מיד אחרי ${n}?` : `איזה מספר בא מיד לפני ${n}?`, ans, cands,
			after ? `${ltr(`${n} + 1 = ${ans}`)}.` : `${ltr(`${n} - 1 = ${ans}`)}.`, null, { max: 9999 });
	}
	case 'between_count': {
		const a = level >= 5 ? rng.int(100, 900) : rng.int(5, 80);
		const gap = rng.int(4, 15);
		const b = a + gap;
		const ans = b - a - 1;
		return numQ(rng, id, level, `between:${a}:${b}`,
			`כמה מספרים שלמים יש בין ${a} ל-${b}? (בלי ${a} ובלי ${b})`, ans,
			[b - a, b - a + 1, b - a - 2],
			`המספרים הם מ-${a + 1} עד ${b - 1}. יש ${ans} מספרים, כי לא סופרים את ${a} ואת ${b}.`);
	}
	case 'from_digits': {
		const cnt = 3;
		const allowZero = level >= 5;
		let ds;
		for (;;) {
			ds = [0, 0, 0].map(() => rng.int(allowZero ? 0 : 1, 9));
			if (new Set(ds).size === 3 && ds.some((d) => d !== 0))
				break;
		}
		const twoDigit = level === 2;
		const big = rng.chance(0.5);
		const L = twoDigit ? 2 : cnt;
		const pool = [];
		const perms = permutations(ds).map((p) => p.slice(0, L));
		perms.forEach((p) => {
			if (p[0] !== 0)
				pool.push(Number(p.join('')));
		});
		const uniq = [...new Set(pool)];
		const ans = big ? Math.max(...uniq) : Math.min(...uniq);
		const others = rng.shuffle(uniq.filter((x) => x !== ans));
		const naiveSmall = Number(ds.slice().sort((a, b) => a - b).slice(0, L).join(''));
		const cands = big ? others : [naiveSmall, ...others];
		const what = twoDigit ? 'הדו-ספרתי' : 'התלת-ספרתי';
		return numQ(rng, id, level, `from:${big ? 'max' : 'min'}:${L}:${ds.slice().sort().join('')}`,
			`מהספרות ${ds.join(', ')} בונים את המספר ${what} ${big ? 'הכי גדול' : 'הכי קטן'}. כל ספרה אפשר לקחת רק פעם אחת. איזה מספר זה?`,
			ans, cands,
			big ? 'שמים את הספרה הגדולה ביותר במקום השמאלי, ואחריה את הבאה בגודל.'
				: 'שמים את הספרה הקטנה ביותר במקום השמאלי, אבל מספר לא מתחיל ב-0.',
			null, { min: 1, max: 999 });
	}
	default:
		return genRiddle(rng, level);
	}
}

function genRiddle(rng, level) {
	const id = 'math.number_sense';
	const kinds = level >= 4 ? ['plus', 'sum', 'double', 'window', 'three'] : ['plus', 'sum', 'double', 'window'];
	const kind = rng.pick(kinds);
	let n;
	let clues;
	switch (kind) {
	case 'plus': {
		const t = rng.int(1, 8);
		const k = rng.int(1, 9 - t);
		n = t * 10 + t + k;
		clues = `ספרת העשרות שלי היא ${t}. ספרת היחידות שלי גדולה ממנה ב-${k}.`;
		break;
	}
	case 'sum': {
		const t = rng.int(1, 9);
		const s = rng.int(t, t + 9);
		n = t * 10 + (s - t);
		clues = `ספרת העשרות שלי היא ${t}. סכום הספרות שלי הוא ${s}.`;
		break;
	}
	case 'double': {
		const u = rng.int(1, 4);
		n = 2 * u * 10 + u;
		const tensWord = rng.chance(0.5);
		clues = tensWord ? `ספרת היחידות שלי היא ${u}. ספרת העשרות שלי היא פי 2 ממנה.`
			: `ספרת העשרות שלי כפולה מספרת היחידות. סכום הספרות שלי הוא ${3 * u}.`;
		break;
	}
	case 'window': {
		n = rng.int(12, 97);
		const lo = n - rng.int(1, 4);
		const hi = n + rng.int(1, 5);
		const parity = n % 2 === 0 ? 'זוגי' : 'אי-זוגי';
		clues = `אני גדול מ-${lo} וקטן מ-${hi}. אני מספר ${parity}, וספרת היחידות שלי היא ${n % 10}.`;
		break;
	}
	default: {
		const h = rng.int(2, 9);
		const t = rng.int(1, h - 1);
		const u = h + t <= 9 ? h + t : h - t;
		n = h * 100 + t * 10 + u;
		clues = h + t <= 9
			? `ספרת המאות שלי היא ${h}. ספרת העשרות קטנה ממנה ב-${h - t}. ספרת היחידות היא סכום שתיהן.`
			: `ספרת המאות שלי היא ${h}. ספרת העשרות קטנה ממנה ב-${h - t}. ספרת היחידות היא ההפרש ביניהן.`;
		return numQ(rng, id, level, `riddle:three:${n}`,
			`אני מספר תלת-ספרתי.\n${clues}\nמי אני?`, n,
			[Number(`${h}${u}${t}`), Number(`${u}${t}${h}`), n + 10, n - 1, n + 1],
			`עוברים על הרמזים אחד-אחד: ${h}, אחר כך ${t}, ואחר כך ${u}. המספר הוא ${n}.`, null, { min: 100, max: 999 });
	}
	}
	return numQ(rng, id, level, `riddle:${kind}:${clues.length}:${n}`,
		`אני מספר דו-ספרתי.\n${clues}\nמי אני?`, n,
		[swapDigits(n), n + 1, n - 1, n + 10, n - 10, n + 2],
		`בודקים כל רמז. רק ${n} מתאים לכולם.`, null, { min: 10, max: 99 });
}

// ---------------------------------------------------------------------------
// 6. Balance / shape equations

const EMOJI = ['🍎', '🍌', '🍓', '🍇', '🍐', '🍊', '🍒', '🥕', '⭐', '⚽', '🎈', '🐟', '🍪', '🧁', '🌸', '🐞'];

function balanceSvg(rows) {
	const h = 130;
	let s = svgOpen(300, h * rows.length);
	rows.forEach(([left, right], i) => {
		const y0 = i * h;
		s += `<polygon points="150,${y0 + 70} 130,${y0 + 122} 170,${y0 + 122}" fill="${COLORS.teal}"/>`;
		s += `<rect x="30" y="${y0 + 66}" width="240" height="8" rx="4" fill="${COLORS.ink}"/>`;
		[[75, left], [225, right]].forEach(([cx, items]) => {
			s += `<path d="M${cx - 55},${y0 + 62} Q${cx},${y0 + 82} ${cx + 55},${y0 + 62} Z" fill="${COLORS.yellow}" stroke="${COLORS.orange}" stroke-width="3"/>`;
			const size = items.length > 4 ? 18 : 26;
			const w = size + 2;
			const startX = cx - ((items.length - 1) * w) / 2;
			items.forEach((e, j) => {
				s += `<text x="${startX + j * w}" y="${y0 + 42}" font-size="${size}" text-anchor="middle" dominant-baseline="central">${e}</text>`;
			});
		});
	});
	return `${s}</svg>`;
}

function genBalance(rng, level) {
	const id = 'math.balance';
	const types = { 1: ['double'], 2: ['triple', 'two'], 3: ['two', 'scale', 'triple'],
		4: ['two', 'scale', 'combo', 'times'], 5: ['three', 'scale', 'combo', 'times'] }[level];
	const type = rng.pick(types);
	const [A, B, C] = rng.sample(EMOJI, 3);

	switch (type) {
	case 'double':
	case 'triple': {
		const k = type === 'double' ? 2 : 3;
		const a = rng.int(2, type === 'double' ? 10 : 9);
		const lhs = Array(k).fill(A).join(' + ');
		return numQ(rng, id, level, `${type}:${A}:${a}`,
			`כל ${A} שווה אותו מספר.\n${ltr(`${lhs} = ${a * k}`)}\nכמה שווה ${A}?`, a,
			[a * k - k, a * k, a + 1, a - 1, a * k / 2],
			`${k} פעמים ${A} זה ${a * k}, לכן ${ltr(`${a * k} : ${k} = ${a}`)}.`);
	}
	case 'two': {
		const a = rng.int(2, level >= 4 ? 15 : 9);
		const b = rng.int(1, level >= 4 ? 15 : 9);
		if (a === b)
			return genBalance(rng, level);
		return numQ(rng, id, level, `two:${A}${B}:${a}:${b}`,
			`${ltr(`${A} + ${A} = ${2 * a}`)}\n${ltr(`${A} + ${B} = ${a + b}`)}\nכמה שווה ${B}?`, b,
			[a + b - 2 * a, a + b, a, b + 1, b - 1, (a + b) - 2],
			`${A} שווה ${a}, כי ${ltr(`${a} + ${a} = ${2 * a}`)}. לכן ${B} שווה ${ltr(`${a + b} - ${a} = ${b}`)}.`);
	}
	case 'scale': {
		const k = rng.int(2, level >= 5 ? 5 : 3);
		const m = rng.int(2, level >= 5 ? 4 : 3);
		const svg = balanceSvg([[[A], Array(k).fill(B)], [[B], Array(m).fill(C)]]);
		return numQ(rng, id, level, `scale:${A}${B}${C}:${k}:${m}`,
			`המאזניים מאוזנים.\n${A} אחד שוקל כמו ${k} ${B}.\n${B} אחד שוקל כמו ${m} ${C}.\nכמה ${C} שוקלים כמו ${A} אחד?`,
			k * m, [k + m, k, m, k * m + 1, k * m - 1],
			`כל ${B} מחליפים ב-${m} ${C}. יש ${k} ${B}, אז ${ltr(`${k} × ${m} = ${k * m}`)}.`,
			{ svg });
	}
	case 'combo': {
		const a = rng.int(2, 12);
		const b = rng.int(2, 9);
		const lhsB = `${B} + ${B} + ${B}`;
		return numQ(rng, id, level, `combo:${A}${B}:${a}:${b}`,
			`${ltr(`${A} + ${A} = ${2 * a}`)}\n${ltr(`${lhsB} = ${3 * b}`)}\nכמה שווה ${ltr(`${A} + ${B}`)}?`,
			a + b, [2 * a + 3 * b, a + 3 * b, 2 * a + b, a + b + 1, a + b - 1],
			`${A} שווה ${a} ו-${B} שווה ${b}. ביחד ${a + b}.`);
	}
	case 'times': {
		const b = rng.int(2, 9);
		const k = rng.int(2, 3);
		const a = k * b;
		const rhs = Array(k).fill(B).join(' + ');
		return numQ(rng, id, level, `times:${A}${B}:${k}:${b}`,
			`${ltr(`${A} = ${rhs}`)}\n${ltr(`${A} + ${B} = ${a + b}`)}\nכמה שווה ${B}?`,
			b, [(a + b) / 2, a, a + b - 1, b + 1, b - 1].map(Math.round),
			`${A} שווה ${k} ${B}, אז ${ltr(`${A} + ${B}`)} זה ${k + 1} ${B}. ${ltr(`${a + b} : ${k + 1} = ${b}`)}.`);
	}
	default: {
		const a = rng.int(2, 9);
		const b = rng.int(1, 12);
		const c = rng.int(1, 12);
		const askAll = rng.chance(0.5);
		const ans = askAll ? a + b + c : c;
		return numQ(rng, id, level, `three:${A}${B}${C}:${a}:${b}:${c}:${askAll ? 'all' : 'c'}`,
			`${ltr(`${A} + ${A} = ${2 * a}`)}\n${ltr(`${A} + ${B} = ${a + b}`)}\n${ltr(`${B} + ${C} = ${b + c}`)}\n` +
			(askAll ? `כמה שווה ${ltr(`${A} + ${B} + ${C}`)}?` : `כמה שווה ${C}?`),
			ans, askAll ? [2 * a + (a + b) + (b + c), a + b + (b + c), ans + 1, ans - 1]
				: [b + c - a, b + c, b, c + 1, c - 1],
			`${A} = ${a}, ${B} = ${b}, ${C} = ${c}. פותרים שורה אחרי שורה.`);
	}
	}
}

// ---------------------------------------------------------------------------
// 7. Clock and money

function clockSvg(h, m) {
	let s = svgOpen(200, 200);
	s += `<circle cx="100" cy="100" r="92" fill="${COLORS.cream}" stroke="${COLORS.ink}" stroke-width="6"/>`;
	for (let i = 0; i < 60; i++) {
		const a = (i * 6 * Math.PI) / 180;
		const r1 = i % 5 === 0 ? 80 : 85;
		const x1 = (100 + r1 * Math.sin(a)).toFixed(1);
		const y1 = (100 - r1 * Math.cos(a)).toFixed(1);
		const x2 = (100 + 89 * Math.sin(a)).toFixed(1);
		const y2 = (100 - 89 * Math.cos(a)).toFixed(1);
		s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${COLORS.ink}" stroke-width="${i % 5 === 0 ? 3 : 1}"/>`;
	}
	for (let i = 1; i <= 12; i++) {
		const a = (i * 30 * Math.PI) / 180;
		s += svgText((100 + 66 * Math.sin(a)).toFixed(1), (100 - 66 * Math.cos(a)).toFixed(1), i, 18);
	}
	const hand = (deg, len, w, color) => {
		const a = (deg * Math.PI) / 180;
		return `<line x1="100" y1="100" x2="${(100 + len * Math.sin(a)).toFixed(1)}" y2="${(100 - len * Math.cos(a)).toFixed(1)}" ` +
			`stroke="${color}" stroke-width="${w}" stroke-linecap="round"/>`;
	};
	s += hand(((h % 12) + m / 60) * 30, 42, 8, COLORS.red);
	s += hand(m * 6, 66, 5, COLORS.blue);
	s += `<circle cx="100" cy="100" r="6" fill="${COLORS.ink}"/>`;
	return `${s}</svg>`;
}

const COIN_STYLE = {
	1: { r: 18, fill: COLORS.silver },
	2: { r: 20, fill: COLORS.silver },
	5: { r: 23, fill: '#b0bec5' },
	10: { r: 25, fill: COLORS.gold },
};

function coinsSvg(coins) {
	const perRow = 5;
	const rows = Math.ceil(coins.length / perRow);
	const cols = Math.min(coins.length, perRow);
	let s = svgOpen(cols * 58 + 4, rows * 58 + 4);
	coins.forEach((c, i) => {
		const cx = 31 + (i % perRow) * 58;
		const cy = 31 + Math.floor(i / perRow) * 58;
		const st = COIN_STYLE[c];
		s += `<circle cx="${cx}" cy="${cy}" r="${st.r}" fill="${st.fill}" stroke="${COLORS.ink}" stroke-width="2"/>`;
		s += svgText(cx, cy - 3, c, c === 10 ? 17 : 15);
		s += svgText(cx, cy + 11, '₪', 9);
	});
	return `${s}</svg>`;
}

function minCoins(n) {
	let left = n;
	let cnt = 0;
	for (const c of [10, 5, 2, 1]) {
		cnt += Math.floor(left / c);
		left %= c;
	}
	return cnt;
}

function genClockMoney(rng, level) {
	const id = 'math.clock_money';
	const types = { 1: ['read', 'read', 'coins', 'change'], 2: ['read', 'after', 'coins', 'coin_count', 'change'],
		3: ['read', 'after', 'between', 'coins', 'coin_count', 'change'],
		4: ['read', 'after', 'between', 'coins', 'change', 'min_coins'],
		5: ['read', 'after', 'between', 'change', 'min_coins'] }[level];
	const type = rng.pick(types);
	const minuteSet = { 1: [0], 2: [0, 30], 3: [0, 15, 30, 45], 4: [0, 15, 30, 45],
		5: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] }[level];
	const randTime = () => timeStr(rng.int(1, 12), rng.pick(minuteSet));

	switch (type) {
	case 'read': {
		const h = rng.int(1, 12);
		const m = rng.pick(minuteSet);
		const ans = timeStr(h, m);
		const swapH = m === 0 ? 12 : m / 5;
		const prevH = h === 1 ? 12 : h - 1;
		const nextH = h === 12 ? 1 : h + 1;
		const cands = [timeStr(swapH, (h % 12) * 5), m >= 30 ? timeStr(nextH, m) : timeStr(prevH, m),
			timeStr(h, (m + 30) % 60), timeStr(m >= 30 ? prevH : nextH, m), timeStr(h, (60 - m) % 60)];
		return makeQ(rng, id, level, `read:${ans}`, 'מה השעה בשעון?', ans,
			fillStrings(rng, ans, cands, randTime),
			m === 0 ? `המחוג הארוך על 12 והקצר על ${h}, אז השעה ${ans}.`
				: `המחוג הקצר מראה את השעה (${h}), והארוך מראה דקות (${m}). השעה ${ans}.`,
			{ svg: clockSvg(h, m) });
	}
	case 'after': {
		const durs = { 2: [60, 120, 30], 3: [30, 60, 90, 15, 45], 4: [45, 75, 90, 105, 135, 150],
			5: [20, 40, 50, 80, 100, 135, 165] }[level];
		const d = rng.pick(durs);
		const h = rng.int(1, 10);
		const m = rng.pick(minuteSet);
		const back = level >= 4 && rng.chance(0.35);
		const [ah, am] = addMinutes(h, m, back ? -d : d);
		const ans = timeStr(ah, am);
		const cands = [addMinutes(h, m, back ? d : -d), addMinutes(h, m, (back ? -d : d) + 60),
			addMinutes(h, m, (back ? -d : d) - 60), addMinutes(h, m, (back ? -d : d) + 30)].map(([x, y]) => timeStr(x, y));
		const now = timeStr(h, m);
		return makeQ(rng, id, level, `after:${now}:${back ? -d : d}`,
			back ? `השעה עכשיו ${now}. מה הייתה השעה לפני ${durText(d)}?`
				: `השעה עכשיו ${now}. מה תהיה השעה בעוד ${durText(d)}?`,
			ans, fillStrings(rng, ans, cands, randTime),
			back ? `חוזרים אחורה ${durText(d)} מ-${now} ומגיעים ל-${ans}.`
				: `מוסיפים ${durText(d)} ל-${now} ומגיעים ל-${ans}.`);
	}
	case 'between': {
		const step = level >= 5 ? 5 : 15;
		const d = rng.int(level >= 5 ? 4 : 2, level >= 4 ? 14 : 8) * step;
		const h = rng.int(1, Math.max(1, 10 - Math.ceil(d / 60)));
		const m = rng.pick(level >= 5 ? minuteSet : [0, 15, 30, 45]);
		const [eh, em] = addMinutes(h, m, d);
		const ans = durText(d);
		const ev = rng.pick([['המשחק', 'התחיל', 'ונגמר', 'נמשך'], ['הסרט', 'התחיל', 'ונגמר', 'נמשך'],
			['האימון', 'התחיל', 'ונגמר', 'נמשך'], ['ההצגה', 'התחילה', 'ונגמרה', 'נמשכה'],
			['המסיבה', 'התחילה', 'ונגמרה', 'נמשכה'], ['הטיול', 'התחיל', 'ונגמר', 'נמשך']]);
		const cands = [d + 60, d - 60, d + step, d - step, d + 30, d - 30]
			.filter((x) => x > 0).map(durText);
		return makeQ(rng, id, level, `between:${timeStr(h, m)}:${d}`,
			`${ev[0]} ${ev[1]} ב-${timeStr(h, m)} ${ev[2]} ב-${timeStr(eh, em)}. כמה זמן ${ev[3]} ${ev[0]}?`,
			ans, fillStrings(rng, ans, cands, () => durText(rng.int(1, 16) * 15)),
			`מ-${timeStr(h, m)} עד ${timeStr(eh, em)} עוברים ${ans}.`);
	}
	case 'coins': {
		const n = rng.int(level === 1 ? 2 : 3, level === 1 ? 4 : level === 2 ? 5 : 7);
		const denoms = level === 1 ? [1, 2, 5] : [1, 2, 5, 10];
		const coins = Array.from({ length: n }, () => rng.pick(denoms)).sort((a, b) => b - a);
		const total = sum(coins);
		return numQ(rng, id, level, `coins:${coins.join('-')}`,
			'כמה שקלים יש כאן בסך הכל?', total,
			[n, total - coins[coins.length - 1], total + 1, total - 1, total + 5, total - 5],
			`מחברים את כל המטבעות: ${ltr(`${coins.join(' + ')} = ${total}`)}.`, { svg: coinsSvg(coins) });
	}
	case 'coin_count': {
		const c = rng.pick(level === 2 ? [2, 5, 10] : [2, 5, 10]);
		const k = rng.int(2, 10);
		const total = c * k;
		return numQ(rng, id, level, `coin_count:${c}:${total}`,
			`כמה מטבעות של ${c} ש"ח צריך כדי לקבל ${total} ש"ח?`, k,
			[total - c, k + 1, k - 1, total, c],
			`${ltr(`${k} × ${c} = ${total}`)}, לכן צריך ${k} מטבעות.`);
	}
	case 'change': {
		const p = person(rng);
		const note = level === 1 ? 10 : level === 2 ? rng.pick([10, 20]) : rng.pick([20, 50, 100]);
		const price = rng.int(Math.max(2, Math.floor(note / 4)), note - 1);
		const it = rng.pick([...SHOP, ...SHOP2]);
		const ans = note - price;
		return numQ(rng, id, level, `change:${note}:${price}`,
			`${p.name} ${v(p, 'קנה', 'קנתה')} ${it} ב-${price} ש"ח ${v(p, 'ושילם', 'ושילמה')} ב-${note} ש"ח. כמה עודף ${v(p, 'יקבל', 'תקבל')}?`,
			ans, [noBorrowSub(note, price), ans + 1, ans - 1, ans + 10, note + price, price],
			`עודף = מה ששילמו פחות המחיר: ${ltr(`${note} - ${price} = ${ans}`)} ש"ח.`);
	}
	default: {
		const n = rng.int(level >= 5 ? 13 : 6, level >= 5 ? 49 : 29);
		const ans = minCoins(n);
		const tens = Math.floor(n / 10);
		const rest = n % 10;
		const used = [];
		let left = n;
		for (const c of [10, 5, 2, 1]) {
			for (; left >= c; left -= c) used.push(c);
		}
		return numQ(rng, id, level, `min_coins:${n}`,
			`יש מטבעות של 1, 2, 5 ו-10 ש"ח. מה המספר הקטן ביותר של מטבעות שצריך כדי לשלם בדיוק ${n} ש"ח?`,
			ans, [ans + 1, ans - 1, ans + 2, tens + rest, Math.ceil(n / 5)],
			used.length === 1
				? `מספיק מטבע אחד של ${n} ש"ח.`
				: `לוקחים כל פעם את המטבע הגדול ביותר שאפשר: ${ltr(`${used.join(' + ')} = ${n}`)}. סך הכל ${ans} מטבעות.`);
	}
	}
}

// ---------------------------------------------------------------------------
// 8. Number puzzles

// Pyramid cells are addressed as [row, i]; row 0 is the bottom.
function pyramidSolve(n, known) {
	const k = new Map(known);
	const key = (r, i) => `${r},${i}`;
	const how = new Map();
	let changed = true;
	while (changed) {
		changed = false;
		for (let r = 0; r < n - 1; r++) {
			for (let i = 0; i < n - r - 1; i++) {
				const L = key(r, i);
				const R = key(r, i + 1);
				const P = key(r + 1, i);
				const has = [k.has(L), k.has(R), k.has(P)];
				const cnt = has.filter(Boolean).length;
				if (cnt !== 2)
					continue;
				if (!has[2]) {
					k.set(P, k.get(L) + k.get(R));
					how.set(P, { op: 'sum', a: k.get(L), b: k.get(R) });
				} else if (!has[0]) {
					k.set(L, k.get(P) - k.get(R));
					how.set(L, { op: 'diff', p: k.get(P), o: k.get(R) });
				} else {
					k.set(R, k.get(P) - k.get(L));
					how.set(R, { op: 'diff', p: k.get(P), o: k.get(L) });
				}
				changed = true;
			}
		}
	}
	return { k, how };
}

function pyramidSvg(n, values, hidden, ask) {
	const bw = 60;
	const bh = 40;
	const w = n * bw + 10;
	const h = n * bh + 10;
	let s = svgOpen(w, h);
	for (let r = 0; r < n; r++) {
		for (let i = 0; i < n - r; i++) {
			const x = 5 + r * (bw / 2) + i * bw;
			const y = 5 + (n - 1 - r) * bh;
			const id = `${r},${i}`;
			const isAsk = id === ask;
			s += `<rect x="${x + 1}" y="${y + 1}" width="${bw - 2}" height="${bh - 2}" rx="5" ` +
				`fill="${isAsk ? COLORS.yellow : hidden.has(id) ? '#ffffff' : COLORS.sky}" stroke="${COLORS.ink}" stroke-width="2"/>`;
			const label = isAsk ? '?' : hidden.has(id) ? '' : values.get(id);
			if (label !== '')
				s += svgText(x + bw / 2, y + bh / 2, label, 20);
		}
	}
	return `${s}</svg>`;
}

function genPyramid(rng, level) {
	const id = 'math.logic_numbers';
	const n = level <= 2 ? 3 : level === 5 && rng.chance(0.4) ? 5 : 4;
	const maxBottom = { 1: 9, 2: 15, 3: 12, 4: 20, 5: n === 5 ? 9 : 25 }[level];
	const bottom = Array.from({ length: n }, () => rng.int(1, maxBottom));
	const values = new Map();
	bottom.forEach((x, i) => values.set(`0,${i}`, x));
	for (let r = 1; r < n; r++)
		for (let i = 0; i < n - r; i++)
			values.set(`${r},${i}`, values.get(`${r - 1},${i}`) + values.get(`${r - 1},${i + 1}`));
	const cells = [...values.keys()];
	const extraBlanks = { 1: 0, 2: 0, 3: 0, 4: rng.int(1, 2), 5: rng.int(2, 4) }[level];

	for (let tries = 0; tries < 50; tries++) {
		const ask = level === 1 ? `${n - 1},0` : rng.pick(cells);
		const blanks = new Set(rng.sample(cells.filter((c) => c !== ask), extraBlanks));
		const known = cells.filter((c) => c !== ask && !blanks.has(c)).map((c) => [c, values.get(c)]);
		const { k, how } = pyramidSolve(n, known);
		if (!k.has(ask) || k.get(ask) !== values.get(ask))
			continue;
		const ans = values.get(ask);
		const h = how.get(ask);
		const step = h.op === 'sum' ? `${ltr(`${h.a} + ${h.b} = ${ans}`)}`
			: `${ltr(`${h.p} - ${h.o} = ${ans}`)}`;
		const cands = h.op === 'sum' ? [Math.abs(h.a - h.b), ans + 1, ans - 1, ans + 10]
			: [h.p + h.o, ans + 1, ans - 1, ans + 10, ans - 10];
		const hiddenKey = [...blanks].sort().join('|');
		return numQ(rng, id, level, `pyramid:${bottom.join(',')}:${ask}:${hiddenKey}`,
			'בפירמידה, כל לבנה שווה לסכום שתי הלבנים שמתחתיה. איזה מספר צריך לבוא במקום ה-?',
			ans, cands,
			blanks.size ? `קודם משלימים את הלבנים הריקות שאפשר. בסוף: ${step}.`
				: (h.op === 'sum' ? `מחברים את שתי הלבנים שמתחת: ${step}.`
					: `הלבנה שמעל פחות הלבנה השכנה: ${step}.`),
			{ svg: pyramidSvg(n, values, blanks, ask) });
	}
	return genPyramid(rng, Math.max(1, level - 1));
}

const TRI_POS = [[150, 32], [38, 218], [262, 218], [94, 125], [150, 218], [206, 125]];
// Each side: two corners plus the middle circle, as indices into TRI_POS.
const TRI_SIDES = [[0, 3, 1], [1, 4, 2], [2, 5, 0]];

function triangleSvg(vals, ask) {
	let s = svgOpen(300, 250);
	s += `<polygon points="150,32 38,218 262,218" fill="none" stroke="${COLORS.teal}" stroke-width="5"/>`;
	TRI_POS.forEach(([x, y], i) => {
		s += `<circle cx="${x}" cy="${y}" r="25" fill="${i === ask ? COLORS.yellow : COLORS.sky}" stroke="${COLORS.ink}" stroke-width="3"/>`;
		s += svgText(x, y, i === ask ? '?' : vals[i], 20);
	});
	return `${s}</svg>`;
}

function genTriangle(rng, level) {
	const id = 'math.logic_numbers';
	const hi = level >= 5 ? 20 : 9;
	const [a, b, c] = [rng.int(1, hi), rng.int(1, hi), rng.int(1, hi)];
	const S = Math.max(a + b, b + c, c + a) + rng.int(1, level >= 4 ? 12 : 6);
	const vals = [a, b, c, S - a - b, S - b - c, S - c - a];
	const ask = rng.int(0, 5);
	const showS = level <= 3;
	const side = TRI_SIDES.find((sd) => sd.includes(ask));
	const others = side.filter((i) => i !== ask).map((i) => vals[i]);
	const ans = vals[ask];
	return numQ(rng, id, level, `triangle:${vals.join(',')}:${ask}:${showS ? 's' : 'n'}`,
		showS ? `בכל צלע של המשולש, סכום שלושת המספרים הוא ${S}. איזה מספר חסר?`
			: 'בכל צלע של המשולש, סכום שלושת המספרים שווה. איזה מספר חסר?',
		ans, [S - others[0], S - others[1], others[0] + others[1], ans + 1, ans - 1],
		(showS ? '' : `בצלע השלמה הסכום הוא ${S}. `) + `לכן ${ltr(`${S} - ${others[0]} - ${others[1]} = ${ans}`)}.`,
		{ svg: triangleSvg(vals, ask) });
}

const LO_SHU = [[2, 7, 6], [9, 5, 1], [4, 3, 8]];

function squareSvg(grid, ask, blank) {
	let s = svgOpen(200, 200);
	for (let r = 0; r < 3; r++) {
		for (let c = 0; c < 3; c++) {
			const id = r * 3 + c;
			const x = 10 + c * 60;
			const y = 10 + r * 60;
			s += `<rect x="${x}" y="${y}" width="60" height="60" fill="${id === ask ? COLORS.yellow : id === blank ? '#ffffff' : COLORS.sky}" stroke="${COLORS.ink}" stroke-width="3"/>`;
			if (id !== blank)
				s += svgText(x + 30, y + 30, id === ask ? '?' : grid[r][c], 22);
		}
	}
	return `${s}</svg>`;
}

function genMagicSquare(rng, level) {
	const id = 'math.logic_numbers';
	let g = LO_SHU.map((r) => r.slice());
	const rot = rng.int(0, 3);
	for (let i = 0; i < rot; i++)
		g = g[0].map((_, c) => g.map((r) => r[c]).reverse());
	if (rng.chance(0.5))
		g = g.map((r) => r.slice().reverse());
	const mul = level >= 5 ? rng.int(1, 3) : 1;
	const add = rng.int(0, level >= 5 ? 20 : 10);
	g = g.map((r) => r.map((x) => x * mul + add));
	const S = sum(g[0]);
	const lines = [];
	for (let i = 0; i < 3; i++) {
		lines.push({ cells: [i * 3, i * 3 + 1, i * 3 + 2], name: 'בשורה' });
		lines.push({ cells: [i, i + 3, i + 6], name: 'בעמודה' });
	}
	lines.push({ cells: [0, 4, 8], name: 'באלכסון' }, { cells: [2, 4, 6], name: 'באלכסון' });
	const ask = rng.int(0, 8);
	let blank = -1;
	if (level >= 5) {
		const cand = rng.int(0, 8);
		const ok = cand !== ask && lines.some((l) => l.cells.includes(ask) && !l.cells.includes(cand));
		if (ok)
			blank = cand;
	}
	const line = lines.find((l) => l.cells.includes(ask) && !l.cells.includes(blank));
	const at = (i) => g[Math.floor(i / 3)][i % 3];
	const others = line.cells.filter((i) => i !== ask).map(at);
	const ans = at(ask);
	return numQ(rng, id, level, `magic:${g.flat().join(',')}:${ask}:${blank}`,
		'בריבוע הקסם, הסכום בכל שורה, בכל עמודה ובכל אלכסון שווה. איזה מספר חסר במקום ה-?',
		ans, [S - others[0], others[0] + others[1], ans + 1, ans - 1, at(4)],
		`בשורה שלמה הסכום הוא ${S}. ${line.name} של ה-? יש ${others[0]} ו-${others[1]}, לכן ${ltr(`${S} - ${others[0]} - ${others[1]} = ${ans}`)}.`,
		{ svg: squareSvg(g, ask, blank) });
}

function pickRule(rng, level) {
	const opts = [];
	const k = rng.int(2, 9);
	const c = rng.int(1, 6);
	if (level <= 3) {
		opts.push({ id: `+${k}`, f: (x) => x + k, text: `מוסיפים ${k}` });
		if (level >= 2)
			opts.push({ id: `-${k}`, f: (x) => x - k, text: `מורידים ${k}`, minX: k + 1 });
	}
	if (level >= 3) {
		const m = rng.int(2, 5);
		opts.push({ id: `*${m}`, f: (x) => x * m, text: `כופלים ב-${m}`, inv: (y) => y / m });
	}
	if (level >= 4) {
		const m = rng.int(2, 3);
		opts.push({ id: `*${m}+${c}`, f: (x) => x * m + c, text: `כופלים ב-${m} ומוסיפים ${c}` });
		opts.push({ id: `*${m}-${c}`, f: (x) => x * m - c, text: `כופלים ב-${m} ומורידים ${c}`, minX: c });
		opts.push({ id: '*10', f: (x) => x * 10, text: 'כופלים ב-10' });
	}
	if (level >= 5) {
		opts.push({ id: 'sq', f: (x) => x * x, text: 'כופלים את המספר בעצמו', maxX: 10 });
		opts.push({ id: `+${c}*2`, f: (x) => (x + c) * 2, text: `מוסיפים ${c} ואז כופלים ב-2` });
	}
	if (level === 1)
		return { id: `+${k}`, f: (x) => x + k, text: `מוסיפים ${k}` };
	return rng.pick(opts);
}

function genFuncTable(rng, level) {
	const id = 'math.logic_numbers';
	const rule = pickRule(rng, level);
	const minX = Math.max(1, rule.minX ?? 1);
	const maxX = rule.maxX ?? minX + (level <= 2 ? 12 : 10);
	const xs = rng.sample(Array.from({ length: maxX - minX + 1 }, (_, i) => minX + i), 4);
	const ex = xs.slice(0, 3).sort((a, b) => a - b);
	const qx = xs[3];
	const lines = ex.map((x) => `נכנס ${x}, יוצא ${rule.f(x)}`);
	const reverse = level >= 4 && rng.chance(0.3);
	const ans = reverse ? qx : rule.f(qx);
	const qLine = reverse ? `נכנס ?, יוצא ${rule.f(qx)}` : `נכנס ${qx}, יוצא ?`;
	const d0 = rule.f(ex[0]) - ex[0];
	const cands = reverse ? [rule.f(qx) - d0, qx + 1, qx - 1, rule.f(qx)]
		: [qx + d0, ans + 1, ans - 1, rule.f(qx + 1), rule.f(qx - 1)];
	return numQ(rng, id, level, `table:${rule.id}:${ex.join(',')}:${reverse ? 'r' : 'f'}${qx}`,
		`במכונת המספרים יש כלל אחד שמשנה כל מספר.\n${lines.join('\n')}\n${qLine}`,
		ans, cands,
		`הכלל: ${rule.text}. ${reverse ? `${qx} הופך ל-${rule.f(qx)}.` : `${qx} הופך ל-${ans}.`}`,
		null, { max: 10000 });
}

function genLogicNumbers(rng, level) {
	const kinds = { 1: ['pyramid', 'table'], 2: ['pyramid', 'table', 'triangle'],
		3: ['pyramid', 'table', 'triangle'], 4: ['pyramid', 'table', 'triangle', 'magic'],
		5: ['pyramid', 'table', 'triangle', 'magic'] }[level];
	const kind = rng.pick(kinds);
	if (kind === 'pyramid')
		return genPyramid(rng, level);
	if (kind === 'triangle')
		return genTriangle(rng, level);
	if (kind === 'magic')
		return genMagicSquare(rng, level);
	return genFuncTable(rng, level);
}

// ---------------------------------------------------------------------------

function skill(id, name, gen) {
	return { id, name, minLevel: 1, maxLevel: 5, generate: (rng, level) => gen(rng, level) };
}

export default {
	id: 'math',
	name: 'חשבון',
	icon: '🔢',
	skills: [
		skill('math.add_sub', 'חיבור וחיסור', genAddSub),
		skill('math.mul_div', 'כפל וחילוק', genMulDiv),
		skill('math.word_problems', 'בעיות מילוליות', genWordProblem),
		skill('math.number_series', 'סדרות מספרים', genSeries),
		skill('math.number_sense', 'הבנת מספרים', genNumberSense),
		skill('math.balance', 'מאזניים וצורות', genBalance),
		skill('math.clock_money', 'שעון וכסף', genClockMoney),
		skill('math.logic_numbers', 'חידות מספרים', genLogicNumbers),
	],
};
