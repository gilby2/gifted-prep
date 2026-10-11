// Confetti (canvas), sound effects (WebAudio beeps, no files) and Hebrew
// text-to-speech. Every effect degrades silently when the browser lacks support.

export function prefersReducedMotion() {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

// ---------------------------------------------------------------- confetti

const CONFETTI_COLORS = ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#9775fa', '#f783ac'];

export function confetti({ count = 70, durationMs = 1400 } = {}) {
  if (prefersReducedMotion()) return;
  const canvas = document.createElement('canvas');
  canvas.className = 'confetti-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.appendChild(canvas);
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    canvas.remove();
    return;
  }
  ctx.scale(dpr, dpr);

  const parts = Array.from({ length: count }, () => ({
    x: w / 2 + (Math.random() - 0.5) * w * 0.3,
    y: h * 0.45,
    vx: (Math.random() - 0.5) * 9,
    vy: -6 - Math.random() * 8,
    size: 6 + Math.random() * 6,
    rot: Math.random() * Math.PI,
    vr: (Math.random() - 0.5) * 0.3,
    color: CONFETTI_COLORS[Math.floor(Math.random() * CONFETTI_COLORS.length)],
  }));

  const start = performance.now();
  const frame = (t) => {
    const elapsed = t - start;
    ctx.clearRect(0, 0, w, h);
    ctx.globalAlpha = Math.max(0, 1 - elapsed / durationMs);
    for (const p of parts) {
      p.vy += 0.35;
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      ctx.restore();
    }
    if (elapsed < durationMs) requestAnimationFrame(frame);
    else canvas.remove();
  };
  requestAnimationFrame(frame);
}

// ---------------------------------------------------------------- sound

let audioCtx = null;

function audio() {
  if (audioCtx) return audioCtx;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  try {
    audioCtx = new Ctx();
  } catch {
    audioCtx = null;
  }
  return audioCtx;
}

function tone(ctx, freq, startAt, dur, { type = 'sine', gain = 0.12 } = {}) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, startAt);
  g.gain.exponentialRampToValueAtTime(gain, startAt + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, startAt + dur);
  osc.connect(g).connect(ctx.destination);
  osc.start(startAt);
  osc.stop(startAt + dur + 0.05);
}

const SOUNDS = {
  correct: [[660, 0, 0.12], [880, 0.1, 0.18]],
  wrong: [[330, 0, 0.18, 'triangle'], [262, 0.15, 0.25, 'triangle']],
  badge: [[523, 0, 0.12], [659, 0.1, 0.12], [784, 0.2, 0.12], [1047, 0.3, 0.25]],
  tap: [[520, 0, 0.05, 'triangle', 0.05]],
};

export function playSound(name, enabled) {
  if (!enabled) return;
  const notes = SOUNDS[name];
  const ctx = notes && audio();
  if (!ctx) return;
  try {
    if (ctx.state === 'suspended') ctx.resume();
    const t0 = ctx.currentTime + 0.01;
    for (const [freq, at, dur, type, gain] of notes) tone(ctx, freq, t0 + at, dur, { type, gain });
  } catch {
    // Audio is decoration only; a failing context must never break the lesson.
  }
}

// ---------------------------------------------------------------- speech

let hebrewVoice = null;

function findHebrewVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  return voices.find((v) => /^he([-_]|$)/i.test(v.lang) || /^iw/i.test(v.lang)) ?? null;
}

// Calls `onChange(available)` now and whenever the voice list loads
// (Chrome fills it asynchronously).
export function watchHebrewVoice(onChange) {
  if (!('speechSynthesis' in window)) {
    onChange(false);
    return;
  }
  const update = () => {
    hebrewVoice = findHebrewVoice();
    onChange(!!hebrewVoice);
  };
  update();
  window.speechSynthesis.addEventListener?.('voiceschanged', update);
}

export function speak(text) {
  if (!hebrewVoice || !text) return;
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.voice = hebrewVoice;
  u.lang = hebrewVoice.lang;
  u.rate = 0.9;
  synth.speak(u);
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}
