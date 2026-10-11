// Storage adapter: the only module that touches localStorage. Holds the
// profiles index and one progress record per child. Every write stamps the
// record with `updatedAt` and a per-record monotonic `rev`, then calls the
// sync hooks, so a cloud adapter can be added later without touching the app.
//
// Layout:
//   gifted-prep:profiles:v1        { version, rev, updatedAt, activeId, profiles: [entry] }
//   gifted-prep:profile:v1:<id>    { id, rev, updatedAt, state }   (state = progress.js state)
//   gifted-prep:progress:v1        legacy single-child state, read once for migration and kept as a backup

export const LEGACY_KEY = 'gifted-prep:progress:v1';
export const INDEX_KEY = 'gifted-prep:profiles:v1';
export const PROFILE_KEY_PREFIX = 'gifted-prep:profile:v1:';

// Sync hooks. A cloud adapter implements the same shape; the app never waits
// for a returned promise, and a throwing hook never blocks a local save.
//   onAppStart()                  once, after the profiles are loaded
//   onSaved(profileId, record)    after a progress record is written
//   onIndexSaved(index)           after the profiles index is written
//   onDeleted(profileId)          after a child's record is removed
export const NOOP_SYNC = Object.freeze({
  onAppStart() {},
  onSaved() {},
  onIndexSaved() {},
  onDeleted() {},
});

export function safeLocalStorage() {
  try {
    const ls = globalThis.localStorage;
    if (!ls) return null;
    const probe = `${INDEX_KEY}:probe`;
    ls.setItem(probe, '1');
    ls.removeItem(probe);
    return ls;
  } catch {
    return null;
  }
}

function num(v, fallback) {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export class Store {
  // `storage` is a localStorage-like object or null. Writes that fail (no
  // storage, quota, private mode) are kept in memory so the app still works
  // until the page is closed.
  constructor({ storage = null, now = () => Date.now(), sync = NOOP_SYNC } = {}) {
    this.storage = storage;
    this.now = now;
    this.sync = sync;
    this.memory = new Map();
    this.revs = new Map();
    this.lastError = null;
  }

  get persistent() {
    return !!this.storage;
  }

  _get(key) {
    if (this.memory.has(key)) return this.memory.get(key);
    if (!this.storage) return null;
    try {
      return this.storage.getItem(key);
    } catch (err) {
      this.lastError = `read ${key} failed: ${err}`;
      return null;
    }
  }

  _set(key, text) {
    if (this.storage) {
      try {
        this.storage.setItem(key, text);
        this.memory.delete(key);
        return true;
      } catch (err) {
        this.lastError = `write ${key} failed: ${err}`;
      }
    }
    this.memory.set(key, text);
    return false;
  }

  _remove(key) {
    this.memory.delete(key);
    if (!this.storage) return;
    try {
      this.storage.removeItem(key);
    } catch (err) {
      this.lastError = `remove ${key} failed: ${err}`;
    }
  }

  // Parsed JSON, or null when missing or corrupt.
  _getJson(key) {
    const text = this._get(key);
    if (text == null) return null;
    try {
      return JSON.parse(text);
    } catch (err) {
      this.lastError = `parse ${key} failed: ${err}`;
      return null;
    }
  }

  _nextRev(key, minRev = 0) {
    let prev = this.revs.get(key);
    if (prev === undefined) prev = num(this._getJson(key)?.rev, 0);
    const rev = Math.max(prev, num(minRev, 0)) + 1;
    this.revs.set(key, rev);
    return rev;
  }

  _hook(name, ...args) {
    try {
      const r = this.sync[name]?.(...args);
      if (r && typeof r.catch === 'function') r.catch((err) => { this.lastError = `sync ${name}: ${err}`; });
    } catch (err) {
      this.lastError = `sync ${name}: ${err}`;
    }
  }

  // ---- legacy

  readLegacy() {
    return this._getJson(LEGACY_KEY);
  }

  // ---- index

  readIndex() {
    const raw = this._getJson(INDEX_KEY);
    if (raw && typeof raw === 'object') this.revs.set(INDEX_KEY, Math.max(this.revs.get(INDEX_KEY) ?? 0, num(raw.rev, 0)));
    return raw;
  }

  // Returns { ok, index } with the stamped index.
  writeIndex({ activeId, profiles }) {
    const index = { version: 1, rev: this._nextRev(INDEX_KEY), updatedAt: this.now(), activeId, profiles };
    const ok = this._set(INDEX_KEY, JSON.stringify(index));
    this._hook('onIndexSaved', index);
    return { ok, index };
  }

  // ---- profiles

  // Profile ids that have a record, from storage and from in-memory writes.
  listProfileIds() {
    const ids = new Set();
    for (const key of this.memory.keys()) if (key.startsWith(PROFILE_KEY_PREFIX)) ids.add(key.slice(PROFILE_KEY_PREFIX.length));
    if (this.storage && typeof this.storage.key === 'function') {
      try {
        for (let i = 0; i < this.storage.length; i++) {
          const key = this.storage.key(i);
          if (key && key.startsWith(PROFILE_KEY_PREFIX)) ids.add(key.slice(PROFILE_KEY_PREFIX.length));
        }
      } catch (err) {
        this.lastError = `list failed: ${err}`;
      }
    }
    return [...ids];
  }

  // { id, rev, updatedAt, state } or null when missing or corrupt.
  readProfile(id) {
    const key = PROFILE_KEY_PREFIX + id;
    const rec = this._getJson(key);
    if (!rec || typeof rec !== 'object' || !rec.state || typeof rec.state !== 'object') return null;
    this.revs.set(key, Math.max(this.revs.get(key) ?? 0, num(rec.rev, 0)));
    return rec;
  }

  // `minRev` lets an imported record keep counting from its own rev.
  // Returns { ok, record }.
  writeProfile(id, state, { minRev = 0 } = {}) {
    const key = PROFILE_KEY_PREFIX + id;
    const record = { id, rev: this._nextRev(key, minRev), updatedAt: this.now(), state };
    const ok = this._set(key, JSON.stringify(record));
    this._hook('onSaved', id, record);
    return { ok, record };
  }

  removeProfile(id) {
    const key = PROFILE_KEY_PREFIX + id;
    this._remove(key);
    this._hook('onDeleted', id);
  }

  appStarted() {
    this._hook('onAppStart');
  }
}
