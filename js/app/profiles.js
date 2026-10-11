// Several children on one device. Owns the profiles index, the migration from
// the single-child save, one Progress per child, and export/import.
// No DOM; the store (store.js) and the clock are injected.

import { Progress, normalizeState, defaultState, SCHEMA_VERSION, EXPORT_APP_ID, GENDERS } from './progress.js';

export const MAX_PROFILES = 8;
export const AVATARS = Object.freeze(['🦁', '🐼', '🦊', '🐯', '🐸', '🐵', '🦄', '🐶', '🐱', '🐰', '🐨', '🐙']);
export const COLORS = Object.freeze(['#ffd8a8', '#b2f2bb', '#a5d8ff', '#d0bfff', '#ffc9c9', '#99e9f2', '#ffec99', '#fcc2d7']);
export const EXPORT_KIND = 'profiles';
export const EXPORT_VERSION = 2;
export const FALLBACK_NAME = 'ילד/ה';

const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function isObj(v) {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function cleanName(v) {
  return typeof v === 'string' ? v.trim().slice(0, 30) : '';
}

// A newer app version may add avatars, so any short string is kept.
function validAvatar(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 16;
}

export function newProfileId() {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// Index entry or null. `stateSettings` fills a missing name/gender from the
// child's progress record.
function normalizeEntry(raw, now, stateSettings = null) {
  if (!isObj(raw)) return null;
  const name = cleanName(raw.name) || cleanName(stateSettings?.name);
  if (!name) return null;
  const gender = GENDERS.includes(raw.gender) ? raw.gender
    : GENDERS.includes(stateSettings?.gender) ? stateSettings.gender : 'boy';
  const createdAt = num(raw.createdAt, now);
  return {
    id: typeof raw.id === 'string' && ID_RE.test(raw.id) ? raw.id : newProfileId(),
    name,
    gender,
    avatar: validAvatar(raw.avatar) ? raw.avatar : AVATARS[0],
    color: COLOR_RE.test(raw.color ?? '') ? raw.color : COLORS[0],
    createdAt,
    updatedAt: num(raw.updatedAt, createdAt),
    lastUsedAt: num(raw.lastUsedAt, 0),
  };
}

// Throws an Error with a Hebrew message if the text is not a progress file.
// Returns { kind: 'all', profiles: [{ entry, state, rev }], activeId } for a
// file with all children, or { kind: 'single', state } for an old one-child file.
export function parseProgressFile(text, now = Date.now()) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error('הקובץ אינו קובץ התקדמות תקין (JSON שגוי).');
  }
  if (!isObj(parsed) || parsed.app !== EXPORT_APP_ID) {
    throw new Error('הקובץ אינו קובץ התקדמות של האפליקציה.');
  }
  const tooNew = () => new Error('הקובץ נוצר בגרסה חדשה יותר של האפליקציה.');

  if (Array.isArray(parsed.profiles)) {
    if (num(parsed.version, 0) > EXPORT_VERSION) throw tooNew();
    const ids = new Set();
    const profiles = [];
    for (const p of parsed.profiles) {
      if (!isObj(p) || !isObj(p.state)) continue;
      if (num(p.state.version, 0) > SCHEMA_VERSION) throw tooNew();
      const entry = normalizeEntry(p, now, p.state.settings);
      if (!entry) continue;
      if (ids.has(entry.id)) entry.id = newProfileId();
      ids.add(entry.id);
      profiles.push({ entry, state: p.state, rev: num(p.rev, 0) });
    }
    if (!profiles.length) throw new Error('בקובץ אין ילדים.');
    return { kind: 'all', profiles, activeId: typeof parsed.activeId === 'string' ? parsed.activeId : null };
  }

  if (isObj(parsed.state)) {
    if (num(parsed.state.version, 0) > SCHEMA_VERSION) throw tooNew();
    return { kind: 'single', state: parsed.state };
  }
  throw new Error('הקובץ אינו קובץ התקדמות של האפליקציה.');
}

export class Profiles {
  constructor({ topics = [], store, now = () => Date.now() }) {
    this.topics = topics;
    this.store = store;
    this.now = now;
    this.entries = [];
    this._activeId = null;
    this.instances = new Map();
    this.migrated = false;
  }

  // Loads the index. With no index, rebuilds it from the progress records,
  // or migrates the old single-child save into the first profile.
  init() {
    const now = this.now();
    const raw = this.store.readIndex();
    const hadIndex = isObj(raw) && Array.isArray(raw.profiles);
    let changed = !hadIndex;

    if (hadIndex) {
      const ids = new Set();
      for (const e of raw.profiles) {
        const entry = isObj(e) && ID_RE.test(e.id ?? '') ? normalizeEntry(e, now) : null;
        if (!entry || ids.has(entry.id)) {
          changed = true;
          continue;
        }
        ids.add(entry.id);
        this.entries.push(entry);
      }
      this._activeId = typeof raw.activeId === 'string' ? raw.activeId : null;
    }

    // Records without an index entry come from a lost index or a failed
    // index write; adopt them so no child disappears.
    for (const id of this.store.listProfileIds()) {
      if (this.entry(id) || !ID_RE.test(id)) continue;
      const rec = this.store.readProfile(id);
      if (!rec) continue;
      const entry = normalizeEntry({ id, createdAt: num(rec.state.createdAt, now), lastUsedAt: num(rec.updatedAt, 0) },
        now, rec.state.settings);
      if (!entry) continue;
      entry.avatar = this.suggestAvatar();
      entry.color = this._freeColor();
      this.entries.push(entry);
      changed = true;
    }

    if (!hadIndex && !this.entries.length) changed = this._migrateLegacy(now) || changed;

    if (!this.entry(this._activeId)) {
      const fallback = this._mostRecentId();
      if (fallback !== this._activeId) changed = true;
      this._activeId = fallback;
    }
    this.entries.sort((a, b) => a.createdAt - b.createdAt);
    if (changed) this._writeIndex();
    return this;
  }

  _migrateLegacy(now) {
    const legacy = this.store.readLegacy();
    if (!isObj(legacy)) return false;
    const state = normalizeState(legacy, now);
    if (!state.settings.name && !state.totals.attempts && !state.points) return false;
    if (!state.settings.name) state.settings.name = FALLBACK_NAME;
    const entry = {
      id: newProfileId(),
      name: state.settings.name,
      gender: state.settings.gender,
      avatar: AVATARS[0],
      color: COLORS[0],
      createdAt: num(state.createdAt, now),
      updatedAt: now,
      lastUsedAt: now,
    };
    this.store.writeProfile(entry.id, state);
    this.entries.push(entry);
    this._activeId = entry.id;
    this.migrated = true;
    return true;
  }

  _writeIndex() {
    return this.store.writeIndex({ activeId: this._activeId, profiles: this.entries.map((e) => ({ ...e })) }).ok;
  }

  _mostRecentId() {
    let best = null;
    for (const e of this.entries) if (!best || e.lastUsedAt > best.lastUsedAt) best = e;
    return best?.id ?? null;
  }

  suggestAvatar() {
    return AVATARS.find((a) => !this.entries.some((e) => e.avatar === a)) ?? AVATARS[this.entries.length % AVATARS.length];
  }

  _freeColor() {
    return COLORS.find((c) => !this.entries.some((e) => e.color === c)) ?? COLORS[this.entries.length % COLORS.length];
  }

  // Saves the record and keeps the index name/gender in step with settings
  // changed through Progress.updateSettings.
  _persist(id, state) {
    const { ok } = this.store.writeProfile(id, state);
    const e = this.entry(id);
    if (e && state.settings.name && (e.name !== state.settings.name || e.gender !== state.settings.gender)) {
      e.name = state.settings.name;
      e.gender = state.settings.gender;
      e.updatedAt = this.now();
      this._writeIndex();
    }
    return ok;
  }

  // ---- reading

  get list() {
    return this.entries.map((e) => ({ ...e }));
  }

  get count() {
    return this.entries.length;
  }

  get canAdd() {
    return this.entries.length < MAX_PROFILES;
  }

  get activeId() {
    return this._activeId;
  }

  get active() {
    return this._activeId ? this.progressFor(this._activeId) : null;
  }

  get persistent() {
    return this.store.persistent;
  }

  entry(id) {
    return this.entries.find((e) => e.id === id) ?? null;
  }

  // One Progress per child for the whole app run, so the practice screens and
  // the parents screen never hold two copies of the same child.
  progressFor(id) {
    const entry = this.entry(id);
    if (!entry) return null;
    let p = this.instances.get(id);
    if (!p) {
      const rec = this.store.readProfile(id);
      p = new Progress({ topics: this.topics, now: this.now, state: rec?.state ?? defaultState(this.now()),
        persist: (state) => this._persist(id, state) });
      p.state.settings.name = entry.name;
      p.state.settings.gender = entry.gender;
      this.instances.set(id, p);
    }
    return p;
  }

  pointsOf(id) {
    const p = this.instances.get(id);
    if (p) return p.state.points;
    return Math.max(0, num(this.store.readProfile(id)?.state?.points, 0));
  }

  // ---- changes

  create({ name, gender, avatar, state = null }) {
    if (!this.canAdd) throw new Error(`אפשר עד ${MAX_PROFILES} ילדים במכשיר אחד.`);
    const clean = cleanName(name);
    if (!clean) throw new Error('השם לא יכול להיות ריק.');
    const now = this.now();
    const g = GENDERS.includes(gender) ? gender : 'boy';
    const s = normalizeState(state ?? defaultState(now), now);
    s.settings.name = clean;
    s.settings.gender = g;
    const entry = {
      id: newProfileId(),
      name: clean,
      gender: g,
      avatar: validAvatar(avatar) ? avatar : this.suggestAvatar(),
      color: this._freeColor(),
      createdAt: now,
      updatedAt: now,
      lastUsedAt: now,
    };
    this.active?.save();
    this.store.writeProfile(entry.id, s);
    this.entries.push(entry);
    this._activeId = entry.id;
    this._writeIndex();
    return { ...entry };
  }

  switchTo(id) {
    const entry = this.entry(id);
    if (!entry) return null;
    this.active?.save();
    this._activeId = id;
    entry.lastUsedAt = this.now();
    this._writeIndex();
    return this.active;
  }

  update(id, { name, gender, avatar } = {}) {
    const e = this.entry(id);
    if (!e) throw new Error('הילד/ה לא נמצא/ה.');
    if (name !== undefined) {
      const clean = cleanName(name);
      if (!clean) throw new Error('השם לא יכול להיות ריק.');
      e.name = clean;
    }
    if (GENDERS.includes(gender)) e.gender = gender;
    if (validAvatar(avatar)) e.avatar = avatar;
    e.updatedAt = this.now();
    this.progressFor(id).updateSettings({ name: e.name, gender: e.gender });
    this._writeIndex();
    return { ...e };
  }

  remove(id) {
    const i = this.entries.findIndex((e) => e.id === id);
    if (i < 0) return false;
    this.entries.splice(i, 1);
    this.instances.delete(id);
    if (this._activeId === id) this._activeId = this._mostRecentId();
    this._writeIndex();
    this.store.removeProfile(id);
    return true;
  }

  // ---- export / import

  exportAll() {
    const profiles = this.entries.map((e) => {
      const p = this.instances.get(e.id);
      const state = p ? p.snapshot() : this.store.readProfile(e.id)?.state ?? defaultState(this.now());
      return { ...e, state };
    });
    return JSON.stringify({
      app: EXPORT_APP_ID,
      kind: EXPORT_KIND,
      version: EXPORT_VERSION,
      exportedAt: new Date(this.now()).toISOString(),
      activeId: this._activeId,
      profiles,
    });
  }

  // Children in the file replace the children with the same id on this
  // device; other children on the device are kept. Returns how many were loaded.
  importAll(parsed) {
    const incoming = parsed.profiles;
    const added = incoming.filter((p) => !this.entry(p.entry.id)).length;
    if (this.entries.length + added > MAX_PROFILES) {
      throw new Error(`אחרי הטעינה יהיו יותר מ-${MAX_PROFILES} ילדים במכשיר. אפשר למחוק ילד/ה ולנסות שוב.`);
    }
    this.active?.save();
    const now = this.now();
    for (const { entry, state, rev } of incoming) {
      const s = normalizeState(state, now);
      s.settings.name = entry.name;
      s.settings.gender = entry.gender;
      this.store.writeProfile(entry.id, s, { minRev: rev });
      this.instances.delete(entry.id);
      const existing = this.entry(entry.id);
      if (existing) Object.assign(existing, { ...entry, updatedAt: now });
      else this.entries.push({ ...entry, updatedAt: now });
    }
    if (!this.entry(this._activeId)) {
      this._activeId = this.entry(parsed.activeId) ? parsed.activeId : this._mostRecentId();
    }
    this.entries.sort((a, b) => a.createdAt - b.createdAt);
    this._writeIndex();
    return incoming.length;
  }

  // An old one-child file: `into: 'new'` adds it as a new child (becomes the
  // active one), `into: 'active'` replaces the active child's progress and
  // settings but keeps the child's name, boy/girl and avatar.
  importSingle(state, { into = 'new' } = {}) {
    if (into === 'new') {
      const s = normalizeState(state, this.now());
      return this.create({ name: s.settings.name || FALLBACK_NAME, gender: s.settings.gender, state: s });
    }
    const e = this.entry(this._activeId);
    if (!e) throw new Error('אין ילד/ה פעיל/ה לטעון לתוכו.');
    const s = normalizeState(state, this.now());
    s.settings.name = e.name;
    s.settings.gender = e.gender;
    this.store.writeProfile(e.id, s);
    this.instances.delete(e.id);
    e.updatedAt = this.now();
    this._writeIndex();
    return { ...e };
  }
}
