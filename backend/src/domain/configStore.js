import { promises as fs } from 'node:fs';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';

/**
 * Persists durable configuration (alert rules + dashboard layout + source
 * switches) as a single JSON document on the container's mounted storage.
 *
 * Writes are debounced so bursts of UI edits don't hammer the disk, and the
 * write is atomic (temp file + rename) to avoid a half-written document.
 */
export class ConfigStore {
  /**
   * @param {string} dataDir
   * @param {{ alertRules: object[], layout?: object[] }} [seed]
   * @param {{ debounceMs?: number }} [options]
   */
  constructor(dataDir, seed, options = {}) {
    this.file = join(dataDir, 'config.json');
    this.debounceMs = options.debounceMs ?? 300;
    /** @type {{ alertRules: object[], layout?: object[] }} */
    this.data = {
      alertRules: seed?.alertRules ?? [],
      ...(seed?.layout ? { layout: seed.layout } : {})
    };
    /** @type {NodeJS.Timeout|null} */
    this._timer = null;
    this._saving = Promise.resolve();
    this.closed = false;
  }

  async load() {
    if (existsSync(this.file)) {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      this.data = {
        alertRules: Array.isArray(parsed.alertRules) ? parsed.alertRules : [],
        layout: Array.isArray(parsed.layout) ? parsed.layout : undefined
      };
    }
    return this.data;
  }

  get rules() {
    return this.data.alertRules;
  }

  setRules(rules) {
    this.data.alertRules = rules;
    this.requestSave();
  }

  getLayout() {
    return this.data.layout ?? null;
  }

  setLayout(layout) {
    this.data.layout = layout;
    this.requestSave();
  }

  /** Debounced persistence; tests can await flush() to force a write. */
  requestSave() {
    if (this.closed) return;
    if (this._timer) clearTimeout(this._timer);
    this._timer = setTimeout(() => {
      this._timer = null;
      this._saving = this._saveNow().catch(() => undefined);
    }, this.debounceMs);
  }

  async flush() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
      // Write immediately instead of letting the debounced callback fire later
      // (which could race shutdown / temp-dir removal).
      await this._saveNow(true);
      return;
    }
    await this._saving.catch(() => undefined);
  }

  async close() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    this.closed = true;
    await this._saving.catch(() => undefined);
    await this._saveNow(true).catch(() => undefined);
  }

  /**
   * @param {boolean} [force] write once even if close() already ran (used by
   * shutdown hooks and tests that flush right after stopping the app)
   */
  async _saveNow(force = false) {
    if (this.closed && !force) return;
    try {
      await fs.mkdir(dirname(this.file), { recursive: true });
      const tmp = `${this.file}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.data), 'utf8');
      await fs.rename(tmp, this.file);
    } catch (e) {
      // Directory may already have been removed during test teardown.
      if (e.code === 'ENOENT' || e.code === 'ESTALE') return;
      throw e;
    }
  }
}
