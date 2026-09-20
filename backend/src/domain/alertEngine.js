import { EventEmitter } from 'node:events';
import { randomUUID } from 'node:crypto';
import { DEFAULT_RULES } from './sourceDefinitions.js';

const HISTORY_LIMIT = 200;

/**
 * Evaluates alert rules against metric points and tracks alert lifecycle:
 *
 *   point crosses threshold  -> alert "fired" (warning / critical)
 *   point falls back         -> alert "resolved"
 *
 * Rules are full CRUD; when a rule's threshold/operator changes the next
 * evaluated point is judged against the new rule immediately, and an alert
 * that no longer matches is resolved.
 */
export class AlertEngine extends EventEmitter {
  /**
   * @param {import('./configStore.js').ConfigStore} configStore
   */
  constructor(configStore) {
    super();
    this.store = configStore;
    /** @type {Map<string, AlertRule>} ruleId -> rule */
    this.rules = new Map();
    /** @type {Map<string, ActiveAlert>} key `${ruleId}` -> firing alert */
    this.active = new Map();
    /** @type {AlertEvent[]} recent lifecycle events (fired/resolved) */
    this.history = [];
  }

  /**
   * @param {object[]} [persisted] rules loaded from disk; seeded on first boot.
   */
  init(persisted) {
    const rules = persisted && persisted.length ? persisted : DEFAULT_RULES;
    for (const r of rules) this.rules.set(r.id, { ...r });
    this.persist();
  }

  listRules() {
    return [...this.rules.values()];
  }

  getRule(id) {
    return this.rules.get(id) ?? null;
  }

  createRule(input) {
    const rule = {
      id: input.id || randomUUID(),
      source: String(input.source),
      name: String(input.name || `${input.source} 告警`),
      operator: input.operator === '<' ? '<' : '>',
      threshold: Number(input.threshold),
      level: input.level === 'critical' ? 'critical' : 'warning',
      enabled: input.enabled !== false
    };
    if (!Number.isFinite(rule.threshold)) throw new Error('threshold must be a number');
    this.rules.set(rule.id, rule);
    this.persist();
    return rule;
  }

  updateRule(id, patch) {
    const rule = this.rules.get(id);
    if (!rule) return null;
    if (patch.source !== undefined) rule.source = String(patch.source);
    if (patch.name !== undefined) rule.name = String(patch.name);
    if (patch.operator !== undefined) rule.operator = patch.operator === '<' ? '<' : '>';
    if (patch.threshold !== undefined) rule.threshold = Number(patch.threshold);
    if (patch.level !== undefined) rule.level = patch.level === 'critical' ? 'critical' : 'warning';
    if (patch.enabled !== undefined) rule.enabled = Boolean(patch.enabled);
    if (!Number.isFinite(rule.threshold)) throw new Error('threshold must be a number');
    this.persist();
    return rule;
  }

  deleteRule(id) {
    const existed = this.rules.delete(id);
    if (existed) {
      this.resolveById(id, Date.now(), 0, 'rule-deleted');
      this.persist();
    }
    return existed;
  }

  listActive() {
    return [...this.active.values()];
  }

  listActiveForSource(source) {
    return this.listActive().filter((a) => a.source === source);
  }

  /** Highest-severity firing level for a source (drives chart recoloring). */
  levelForSource(source) {
    const alerts = this.listActiveForSource(source);
    if (alerts.some((a) => a.level === 'critical')) return 'critical';
    if (alerts.some((a) => a.level === 'warning')) return 'warning';
    return null;
  }

  /**
   * Evaluate every enabled rule attached to a source against one new point.
   * @param {string} source
   * @param {number} value
   * @param {number} ts
   */
  evaluate(source, value, ts) {
    for (const rule of this.rules.values()) {
      if (rule.source !== source || !rule.enabled) continue;
      const matches = this._matches(rule, value);
      const firing = this.active.has(rule.id);
      if (matches && !firing) this._fire(rule, value, ts);
      else if (!matches && firing) this._resolve(rule, value, ts);
      else if (firing) this.active.get(rule.id).value = value;
    }
  }

  /**
   * Re-evaluate with an externally supplied value (used right after a rule is
   * created/updated so threshold edits take effect against the latest known
   * reading without waiting for the next tick).
   */
  reevaluate(ruleId, currentValue, ts = Date.now()) {
    const rule = this.rules.get(ruleId);
    if (!rule) return;
    const matches = rule.enabled && this._matches(rule, currentValue);
    const firing = this.active.has(ruleId);
    if (matches && !firing) this._fire(rule, currentValue, ts);
    if (!matches && firing) this._resolve(rule, currentValue, ts);
  }

  _matches(rule, value) {
    return rule.operator === '<' ? value < rule.threshold : value > rule.threshold;
  }

  _fire(rule, value, ts) {
    const alert = {
      ruleId: rule.id,
      source: rule.source,
      ruleName: rule.name,
      level: rule.level,
      threshold: rule.threshold,
      operator: rule.operator,
      value,
      startedAt: ts
    };
    this.active.set(rule.id, alert);
    this._record({
      id: randomUUID(),
      type: 'fired',
      ruleId: rule.id,
      source: rule.source,
      ruleName: rule.name,
      level: rule.level,
      threshold: rule.threshold,
      operator: rule.operator,
      value,
      at: ts
    });
    this.emit('alert-fired', alert);
  }

  _resolve(rule, value, ts) {
    this.active.delete(rule.id);
    this._record({
      id: randomUUID(),
      type: 'resolved',
      ruleId: rule.id,
      source: rule.source,
      ruleName: rule.name,
      level: rule.level,
      threshold: rule.threshold,
      operator: rule.operator,
      value,
      at: ts
    });
    this.emit('alert-resolved', { ruleId: rule.id, source: rule.source, value, at: ts });
  }

  resolveById(ruleId, ts, value = 0) {
    const firing = this.active.get(ruleId);
    if (!firing) return;
    this._resolve(this.rules.get(ruleId) ?? {
      id: ruleId, source: firing.source, name: firing.ruleName,
      level: firing.level, threshold: firing.threshold, operator: firing.operator
    }, value, ts);
  }

  /** Switching a source off / a source going dark clears its firing alerts. */
  resolveAllForSource(source, ts = Date.now()) {
    for (const rule of this.rules.values()) {
      if (rule.source === source && this.active.has(rule.id)) {
        this._resolve(rule, this.active.get(rule.id).value, ts);
      }
    }
  }

  _record(event) {
    this.history.unshift(event);
    if (this.history.length > HISTORY_LIMIT) this.history.length = HISTORY_LIMIT;
  }

  recentEvents(limit = 50) {
    return this.history.slice(0, limit);
  }

  persist() {
    this.store.setRules(this.listRules());
  }
}
