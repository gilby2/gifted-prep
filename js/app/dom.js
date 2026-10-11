// Tiny DOM builder. Text is always set via text nodes; raw markup is accepted
// only through `svg` (generator SVG strings, which are local trusted code).

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'svg') el.innerHTML = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
  append(el, children);
  return el;
}

// Like el.replaceChildren but with h()'s child rules (skips null/false, flattens arrays).
export function fill(el, ...children) {
  el.replaceChildren();
  append(el, children);
  return el;
}

function append(el, children) {
  for (const c of children) {
    if (c == null || c === false) continue;
    if (Array.isArray(c)) append(el, c);
    else if (c instanceof Node) el.appendChild(c);
    else el.appendChild(document.createTextNode(String(c)));
  }
}

// One block per line, each with dir="auto" so a line made only of numbers and
// symbols (e.g. a number series) keeps left-to-right order inside RTL text.
export function multiline(text, className = 'line') {
  return String(text)
    .split('\n')
    .map((line) => h('span', { class: className, dir: 'auto' }, bidiText(line)));
}

// Generators mark LTR runs with U+2066..U+2069; not every engine honors the
// control characters, so each run becomes a real <bdi dir="ltr"> element.
const ISOLATE_RUN = /⁦([^⁦-⁩]*)⁩/g;
export function bidiText(text) {
  const s = String(text);
  const out = [];
  let last = 0;
  for (const m of s.matchAll(ISOLATE_RUN)) {
    if (m.index > last) out.push(s.slice(last, m.index));
    out.push(h('bdi', { dir: 'ltr' }, m[1]));
    last = m.index + m[0].length;
  }
  if (last < s.length) out.push(s.slice(last));
  return out.map((p) => (typeof p === 'string' ? p.replace(/[⁦-⁩]/g, '') : p));
}

export function percent(x) {
  return x == null ? '-' : `${Math.round(x * 100)}%`;
}
