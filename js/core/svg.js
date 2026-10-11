// SVG helpers for figure puzzles. Every function returns a plain string.
//
// A "figure" is a plain object describing one drawn shape:
//   { shape, color, size, rot, dots, fill }
//   shape: one of SHAPES
//   color: one of COLORS
//   size:  0 small, 1 medium, 2 large
//   rot:   degrees, clockwise (only meaningful for ROTATABLE shapes)
//   dots:  number of dots drawn inside (only for DOT_SHAPES, see dotCapacity)
//   fill:  'solid' | 'empty' | 'striped'
//
// Generators reason about figures through figSig(), never through SVG text,
// so two figures that look the same always have the same signature.
//
// Sequences and matrices are drawn right-to-left (Hebrew reading order):
// item 0 is on the right and the '?' of a sequence is on the left end.

export const READING_RTL = true;

const INK = '#1f2937';
const FRAME_FILL = '#ffffff';
const FRAME_LINE = '#cbd5e1';
const QUESTION_FILL = '#fff7ed';
const QUESTION_LINE = '#fb923c';
const QUESTION_INK = '#c2410c';

export const COLORS = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

const FILL_HEX = {
  red: '#ef4444',
  blue: '#3b82f6',
  green: '#22c55e',
  yellow: '#facc15',
  purple: '#a855f7',
  orange: '#fb923c',
};

const LINE_HEX = {
  red: '#b91c1c',
  blue: '#1d4ed8',
  green: '#15803d',
  yellow: '#ca8a04',
  purple: '#7e22ce',
  orange: '#ea580c',
};

export const COLOR_HE = {
  red: 'אדום', blue: 'כחול', green: 'ירוק', yellow: 'צהוב', purple: 'סגול', orange: 'כתום',
};
export const COLOR_HE_F = {
  red: 'אדומה', blue: 'כחולה', green: 'ירוקה', yellow: 'צהובה', purple: 'סגולה', orange: 'כתומה',
};
export const COLOR_HE_PL = {
  red: 'אדומים', blue: 'כחולים', green: 'ירוקים', yellow: 'צהובים', purple: 'סגולים', orange: 'כתומים',
};
export const COLOR_HE_FPL = {
  red: 'אדומות', blue: 'כחולות', green: 'ירוקות', yellow: 'צהובות', purple: 'סגולות', orange: 'כתומות',
};

export const SHAPES = [
  'circle', 'square', 'triangle', 'star', 'heart', 'hexagon', 'diamond', 'arrow', 'pentagon',
];

export const SHAPE_HE = {
  circle: 'עיגול', square: 'ריבוע', triangle: 'משולש', star: 'כוכב', heart: 'לב',
  hexagon: 'משושה', diamond: 'מעוין', arrow: 'חץ', pentagon: 'מחומש',
};
export const SHAPE_HE_PL = {
  circle: 'עיגולים', square: 'ריבועים', triangle: 'משולשים', star: 'כוכבים', heart: 'לבבות',
  hexagon: 'משושים', diamond: 'מעוינים', arrow: 'חצים', pentagon: 'מחומשים',
};

export const SIZES = [0, 1, 2];
export const SIZE_HE = ['קטן', 'בינוני', 'גדול'];
export const SIZE_HE_FPL = ['קטנות', 'בינוניות', 'גדולות'];
export const SIZE_HE_F = ['קטנה', 'בינונית', 'גדולה'];
const SIZE_SCALE = [0.58, 0.78, 1.0];

export const FILLS = ['solid', 'empty', 'striped'];
export const FILL_HE = { solid: 'מלא', empty: 'ריק', striped: 'מפוספס' };
export const FILL_HE_F = { solid: 'מלאה', empty: 'ריקה', striped: 'מפוספסת' };
export const FILL_HE_FPL = { solid: 'מלאות', empty: 'ריקות', striped: 'מפוספסות' };

// Rotation period in degrees: rotating by a multiple of it looks identical.
// Shapes not listed are never rotated by the generators.
const ROTATION_PERIOD = { arrow: 360, heart: 360, triangle: 120 };
export const ROTATABLE = Object.keys(ROTATION_PERIOD);

export const CORNERS = { triangle: 3, square: 4, pentagon: 5, hexagon: 6 };

// Max dots that stay readable inside a shape, per size [small, medium, large].
const DOT_CAPACITY = {
  circle: [4, 6, 6],
  square: [4, 6, 6],
  hexagon: [4, 6, 6],
  pentagon: [4, 6, 6],
  heart: [2, 4, 5],
  triangle: [1, 3, 4],
};
export const DOT_SHAPES = Object.keys(DOT_CAPACITY);
export const MAX_DOTS = 6;

// Dot pattern spread as a fraction of the shape radius, and the vertical
// offset of the pattern centre (the heart's roomy part is above its middle).
const DOT_SPREAD = {
  circle: 0.42, square: 0.4, hexagon: 0.42, pentagon: 0.36, heart: 0.3, triangle: 0.27,
};
const DOT_CENTER_Y = { heart: -0.12 };

const DOT_LAYOUT = [
  [],
  [[0, 0]],
  [[-1, -1], [1, 1]],
  [[-1, -1], [0, 0], [1, 1]],
  [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  [[-1, -1], [-1, 0], [-1, 1], [1, -1], [1, 0], [1, 1]],
];

export function dotCapacity(shape, size) {
  const cap = DOT_CAPACITY[shape];
  return cap ? cap[size] : 0;
}

const mod = (a, m) => ((a % m) + m) % m;

export function normRot(shape, rot) {
  const period = ROTATION_PERIOD[shape];
  return period ? mod(rot, period) : 0;
}

export function makeFig(over = {}) {
  return { shape: 'circle', color: 'blue', size: 1, rot: 0, dots: 0, fill: 'solid', ...over };
}

// Canonical signature: equal signatures look identical on screen.
export function figSig(f) {
  return `${f.shape}.${f.color}.${f.size}.${normRot(f.shape, f.rot)}.${f.dots}.${f.fill}`;
}

export function isValidFig(f) {
  if (!SHAPES.includes(f.shape) || !COLORS.includes(f.color)) return false;
  if (!SIZES.includes(f.size) || !FILLS.includes(f.fill)) return false;
  if (!Number.isInteger(f.dots) || f.dots < 0 || f.dots > dotCapacity(f.shape, f.size)) return false;
  if (!Number.isFinite(f.rot)) return false;
  if (!ROTATABLE.includes(f.shape) && mod(f.rot, 360) !== 0) return false;
  return true;
}

// ---------------------------------------------------------------------------
// Geometry. Every shape is a polygon in unit coordinates (y points down),
// so stripes can be clipped analytically without <clipPath> ids, which would
// collide between several inline SVGs on one page.

function regular(n, r, startDeg) {
  const pts = [];
  for (let i = 0; i < n; i++) {
    const a = ((startDeg + (360 * i) / n) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function starPoints(outer, inner) {
  const pts = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? outer : inner;
    const a = ((-90 + 36 * i) * Math.PI) / 180;
    pts.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return pts;
}

function heartPoints() {
  const raw = [];
  for (let i = 0; i < 72; i++) {
    const t = (2 * Math.PI * i) / 72;
    const x = 16 * Math.sin(t) ** 3;
    const y = -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    raw.push([x, y]);
  }
  const xs = raw.map((p) => p[0]);
  const ys = raw.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const half = Math.max(Math.max(...xs) - cx, Math.max(...ys) - cy);
  return raw.map(([x, y]) => [(x - cx) / half, (y - cy) / half]);
}

const UNIT = {
  circle: regular(64, 1, 0),
  square: [[-0.82, -0.82], [0.82, -0.82], [0.82, 0.82], [-0.82, 0.82]],
  triangle: regular(3, 1.15, -90),
  star: starPoints(1.05, 0.45),
  heart: heartPoints(),
  hexagon: regular(6, 1, 0),
  diamond: [[0, -1.05], [0.72, 0], [0, 1.05], [-0.72, 0]],
  arrow: [[0, -1], [0.72, -0.12], [0.3, -0.12], [0.3, 1], [-0.3, 1], [-0.3, -0.12], [-0.72, -0.12]],
  pentagon: regular(5, 1.05, -90),
};

const num = (v) => String(Math.round(v * 10) / 10 + 0);

function rotatePt([x, y], deg) {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a);
  const s = Math.sin(a);
  return [x * c - y * s, x * s + y * c];
}

function polyPath(pts) {
  return `M${pts.map(([x, y]) => `${num(x)} ${num(y)}`).join('L')}Z`;
}

// Diagonal hatch lines clipped to an arbitrary simple polygon (even-odd).
function stripePath(pts, spacing) {
  const vals = pts.map(([x, y]) => y - x);
  const lo = Math.min(...vals);
  const hi = Math.max(...vals);
  let d = '';
  for (let t = lo + spacing / 2; t < hi; t += spacing) {
    const xs = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i];
      const q = pts[(i + 1) % pts.length];
      const fp = p[1] - p[0] - t;
      const fq = q[1] - q[0] - t;
      if ((fp > 0) === (fq > 0)) continue;
      const k = fp / (fp - fq);
      xs.push(p[0] + k * (q[0] - p[0]));
    }
    xs.sort((a, b) => a - b);
    for (let i = 0; i + 1 < xs.length; i += 2) {
      d += `M${num(xs[i])} ${num(xs[i] + t)}L${num(xs[i + 1])} ${num(xs[i + 1] + t)}`;
    }
  }
  return d;
}

// Markup for one figure centred at (cx, cy) inside a box of `box` units.
export function figureMarkup(f, cx, cy, box = 100) {
  const k = box / 100;
  const R = 42 * SIZE_SCALE[f.size] * k;
  const rot = ROTATABLE.includes(f.shape) ? f.rot : 0;
  const rotated = UNIT[f.shape].map((p) => rotatePt(p, rot));
  const xs = rotated.map((p) => p[0]);
  const ys = rotated.map((p) => p[1]);
  const ox = cx - ((Math.min(...xs) + Math.max(...xs)) / 2) * R;
  const oy = cy - ((Math.min(...ys) + Math.max(...ys)) / 2) * R;
  const pts = rotated.map(([x, y]) => [ox + x * R, oy + y * R]);
  const line = LINE_HEX[f.color];
  const strokeW = 3.2 * k;

  let out = '';
  if (f.fill === 'solid') {
    out += `<path d="${polyPath(pts)}" fill="${FILL_HEX[f.color]}" stroke="${line}" stroke-width="${num(strokeW)}" stroke-linejoin="round"/>`;
  } else {
    out += `<path d="${polyPath(pts)}" fill="#ffffff" stroke="none"/>`;
    if (f.fill === 'striped') {
      out += `<path d="${stripePath(pts, 7 * k)}" stroke="${FILL_HEX[f.color]}" stroke-width="${num(2.8 * k)}" fill="none"/>`;
    }
    out += `<path d="${polyPath(pts)}" fill="none" stroke="${line}" stroke-width="${num(strokeW)}" stroke-linejoin="round"/>`;
  }

  if (f.dots > 0) {
    const [dcx, dcy] = rotatePt([0, DOT_CENTER_Y[f.shape] || 0], rot);
    const spread = (DOT_SPREAD[f.shape] || 0.3) * R;
    const r = Math.max(4.2 * k, 0.125 * R);
    for (const [dx, dy] of DOT_LAYOUT[f.dots]) {
      const x = ox + dcx * R + dx * spread;
      const y = oy + dcy * R + dy * spread;
      out += `<circle cx="${num(x)}" cy="${num(y)}" r="${num(r)}" fill="#ffffff" stroke="${INK}" stroke-width="${num(1.6 * k)}"/>`;
    }
  }
  return out;
}

export function svgDoc(w, h, inner) {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${num(w)} ${num(h)}">${inner}</svg>`;
}

function frameMarkup(x, y, w, h) {
  return `<rect x="${num(x + 1)}" y="${num(y + 1)}" width="${num(w - 2)}" height="${num(h - 2)}" rx="10" fill="${FRAME_FILL}" stroke="${FRAME_LINE}" stroke-width="2"/>`;
}

export function questionCellMarkup(x, y, w, h) {
  const fs = Math.min(w, h) * 0.55;
  return `<rect x="${num(x + 2)}" y="${num(y + 2)}" width="${num(w - 4)}" height="${num(h - 4)}" rx="10" fill="${QUESTION_FILL}" stroke="${QUESTION_LINE}" stroke-width="3" stroke-dasharray="8 6"/>`
    + `<text x="${num(x + w / 2)}" y="${num(y + h / 2 + fs * 0.36)}" font-family="Arial, sans-serif" font-size="${num(fs)}" font-weight="bold" fill="${QUESTION_INK}" text-anchor="middle">?</text>`;
}

function cellMarkup(fig, x, y, size) {
  if (!fig) return questionCellMarkup(x, y, size, size);
  return frameMarkup(x, y, size, size) + figureMarkup(fig, x + size / 2, y + size / 2, size);
}

// Single figure, used for answer choices.
export function tileSvg(fig) {
  return svgDoc(100, 100, figureMarkup(fig, 50, 50, 100));
}

const SEQ_MAX_PER_ROW = 4;

function stepNumberMarkup(k, cx, cy) {
  return `<circle cx="${num(cx)}" cy="${num(cy)}" r="11" fill="${FRAME_LINE}"/>`
    + `<text x="${num(cx)}" y="${num(cy + 5)}" font-family="Arial, sans-serif" font-size="15" font-weight="bold" fill="${INK}" text-anchor="middle">${k}</text>`;
}

// Figures followed by a '?' cell. Item 0 is at the reading start.
// Up to SEQ_MAX_PER_ROW cells stay in one row. Longer series wrap into two
// rows that both read from the same side, with a step number above every cell
// and an arrow between neighbours, so the order stays obvious on a phone.
export function sequenceSvg(figs) {
  const cell = 100;
  const pad = 4;
  const items = [...figs, null];
  const n = items.length;
  if (n <= SEQ_MAX_PER_ROW) {
    const gap = 10;
    const w = pad * 2 + n * cell + (n - 1) * gap;
    let inner = '';
    items.forEach((fig, i) => {
      const slot = READING_RTL ? n - 1 - i : i;
      inner += cellMarkup(fig, pad + slot * (cell + gap), pad, cell);
    });
    return svgDoc(w, cell + pad * 2, inner);
  }

  const perRow = Math.ceil(n / 2);
  const gapX = 34;
  const labelH = 26;
  const gapY = 12;
  const rowH = labelH + cell;
  const w = pad * 2 + perRow * cell + (perRow - 1) * gapX;
  const h = pad * 2 + 2 * rowH + gapY;
  const xOf = (col) => pad + (READING_RTL ? perRow - 1 - col : col) * (cell + gapX);
  let inner = '';
  items.forEach((fig, i) => {
    const row = Math.floor(i / perRow);
    const col = i % perRow;
    const x = xOf(col);
    const top = pad + row * (rowH + gapY);
    inner += stepNumberMarkup(i + 1, x + cell / 2, top + labelH / 2 - 1);
    inner += cellMarkup(fig, x, top + labelH, cell);
    if (col < perRow - 1 && i < n - 1) {
      const nextX = xOf(col + 1);
      const y = top + labelH + cell / 2;
      const [from, to] = READING_RTL ? [x - 6, nextX + cell + 6] : [x + cell + 6, nextX - 6];
      inner += arrowMarkup(from, to, y);
    }
  });
  return svgDoc(w, h, inner);
}

// grid[r][c] is a figure, or null for the missing cell. Column 0 is at the
// reading start (right side when READING_RTL).
export function matrixSvg(grid) {
  const cell = 100;
  const gap = 8;
  const pad = 4;
  const rows = grid.length;
  const cols = grid[0].length;
  const w = pad * 2 + cols * cell + (cols - 1) * gap;
  const h = pad * 2 + rows * cell + (rows - 1) * gap;
  let inner = '';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const slot = READING_RTL ? cols - 1 - c : c;
      inner += cellMarkup(grid[r][c], pad + slot * (cell + gap), pad + r * (cell + gap), cell);
    }
  }
  return svgDoc(w, h, inner);
}

function arrowMarkup(x1, x2, y) {
  const dir = Math.sign(x2 - x1);
  const head = 12 * dir;
  return `<path d="M${num(x1)} ${num(y)}L${num(x2)} ${num(y)}M${num(x2 - head)} ${num(y - 10)}L${num(x2)} ${num(y)}L${num(x2 - head)} ${num(y + 10)}" stroke="${INK}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
}

// A : B  =  C : ?   drawn as two rows, each "first -> second" in reading order.
export function analogySvg(a, b, c) {
  const cell = 100;
  const w = 320;
  const firstX = READING_RTL ? w - 4 - cell : 4;
  const secondX = READING_RTL ? 4 : w - 4 - cell;
  const arrowFrom = READING_RTL ? firstX - 14 : firstX + cell + 14;
  const arrowTo = READING_RTL ? secondX + cell + 14 : secondX - 14;
  let inner = '';
  [[a, b, 4], [c, null, 4 + cell + 18]].forEach(([p, q, y]) => {
    inner += cellMarkup(p, firstX, y, cell);
    inner += cellMarkup(q, secondX, y, cell);
    inner += arrowMarkup(arrowFrom, arrowTo, y + cell / 2);
  });
  inner += `<line x1="16" y1="${4 + cell + 9}" x2="${w - 16}" y2="${4 + cell + 9}" stroke="${FRAME_LINE}" stroke-width="2" stroke-dasharray="6 6"/>`;
  return svgDoc(w, 4 + cell * 2 + 18 + 4, inner);
}

// ---------------------------------------------------------------------------
// Grid figures (polyominoes, cube nets).

// cells: [[x, y], ...]; colors: optional parallel array of COLORS.
// gridN: the grid size the box is scaled for, so several tiles share a scale.
export function cellsMarkup(cells, x0, y0, box, gridN, colors = null) {
  const xs = cells.map((c) => c[0]);
  const ys = cells.map((c) => c[1]);
  const minX = Math.min(...xs);
  const minY = Math.min(...ys);
  const w = Math.max(...xs) - minX + 1;
  const h = Math.max(...ys) - minY + 1;
  const cs = (box * 0.86) / gridN;
  const ox = x0 + (box - w * cs) / 2;
  const oy = y0 + (box - h * cs) / 2;
  let out = '';
  cells.forEach(([x, y], i) => {
    const color = colors ? colors[i] : 'blue';
    out += `<rect x="${num(ox + (x - minX) * cs)}" y="${num(oy + (y - minY) * cs)}" width="${num(cs)}" height="${num(cs)}" fill="${FILL_HEX[color]}" stroke="${INK}" stroke-width="${num(Math.max(1.6, box / 50))}" stroke-linejoin="round"/>`;
  });
  return out;
}

export function cellsSvg(cells, gridN, colors = null) {
  return svgDoc(100, 100, cellsMarkup(cells, 0, 0, 100, gridN, colors));
}

export function colorSwatchSvg(color) {
  return svgDoc(100, 100, `<rect x="18" y="18" width="64" height="64" rx="4" fill="${FILL_HEX[color]}" stroke="${INK}" stroke-width="3"/>`);
}

// Figure next to a dashed mirror line and a '?' cell on the other side.
// axis 'vertical': figure on the right, answer on the left.
// axis 'horizontal': figure on top, answer below (like a reflection in water).
export function mirrorSvg(cells, gridN, axis, colors = null) {
  const box = 110;
  const gap = 24;
  const mirror = '#0ea5e9';
  if (axis === 'vertical') {
    const w = box * 2 + gap;
    const lx = box + gap / 2;
    return svgDoc(w, box,
      frameMarkup(box + gap, 0, box, box)
      + cellsMarkup(cells, box + gap, 0, box, gridN, colors)
      + questionCellMarkup(0, 0, box, box)
      + `<line x1="${lx}" y1="2" x2="${lx}" y2="${box - 2}" stroke="${mirror}" stroke-width="5" stroke-dasharray="10 6"/>`);
  }
  const h = box * 2 + gap;
  const ly = box + gap / 2;
  return svgDoc(box, h,
    frameMarkup(0, 0, box, box)
    + cellsMarkup(cells, 0, 0, box, gridN, colors)
    + questionCellMarkup(0, box + gap, box, box)
    + `<line x1="2" y1="${ly}" x2="${box - 2}" y2="${ly}" stroke="${mirror}" stroke-width="5" stroke-dasharray="10 6"/>`);
}

// ---------------------------------------------------------------------------
// Line drawings (for counting triangles / squares) and scattered figures.

export function segmentsSvg(segments, w, h) {
  const d = segments.map(([[x1, y1], [x2, y2]]) => `M${num(x1)} ${num(y1)}L${num(x2)} ${num(y2)}`).join('');
  return svgDoc(w, h, `<path d="${d}" stroke="${INK}" stroke-width="3.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`);
}

// items: [{ fig, col, row, dx, dy }], laid out on a cols x rows grid.
export function scatterSvg(items, cols, rows) {
  const cell = 64;
  const pad = 6;
  const w = cols * cell + pad * 2;
  const h = rows * cell + pad * 2;
  let inner = `<rect x="1" y="1" width="${w - 2}" height="${h - 2}" rx="12" fill="${FRAME_FILL}" stroke="${FRAME_LINE}" stroke-width="2"/>`;
  for (const it of items) {
    const cx = pad + it.col * cell + cell / 2 + (it.dx || 0);
    const cy = pad + it.row * cell + cell / 2 + (it.dy || 0);
    inner += figureMarkup(it.fig, cx, cy, cell);
  }
  return svgDoc(w, h, inner);
}
