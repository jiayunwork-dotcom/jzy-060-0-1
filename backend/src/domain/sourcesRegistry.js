import { EventEmitter } from 'node:events';
import { SOURCE_DEFS } from './sourceDefinitions.js';

/**
 * Owns the runtime view of every metric data source:
 *   - enabled: manual collection on/off switch (off => no new points),
 *   - status:  ok / error probe state (error => produces no value while broken),
 *   - lastValue / lastAt / error metadata.
 */
export class SourcesRegistry extends EventEmitter {
  /**
   * @param {SourceDef[]} defs
   * @param {{ autoFaults?: boolean }} [options]
   */
  constructor(defs = SOURCE_DEFS, options = {}) {
    super();
    this.autoFaults = options.autoFaults ?? true;
    /** @type {Map<string, SourceItem>} */
    this.items = new Map();
    for (const d of defs) {
      this.items.set(d.id, {
        ...d,
        enabled: true,
        status: 'ok',
        lastValue: 0,
        lastAt: null,
        error: null
      });
    }
  }

  list() {
    return [...this.items.values()];
  }

  get(id) {
    return this.items.get(id) ?? null;
  }

  /** Only a source that is switched on AND healthy yields new data points. */
  canProduce(id) {
    const item = this.items.get(id);
    return Boolean(item && item.enabled && item.status === 'ok');
  }

  setEnabled(id, enabled) {
    const item = this.items.get(id);
    if (!item) return null;
    item.enabled = enabled;
    this.emit('changed', item);
    return item;
  }

  /** Mark a probe broken (with reason) or healthy again. */
  setStatus(id, status, error = null) {
    const item = this.items.get(id);
    if (!item) return null;
    item.status = status;
    item.error = status === 'error' ? error : null;
    this.emit('changed', item);
    return item;
  }

  markReading(id, value, ts) {
    const item = this.items.get(id);
    if (!item) return;
    item.lastValue = value;
    item.lastAt = ts;
    if (item.status === 'ok') item.error = null;
  }

  /**
   * Demo-mode spontaneous faults: rare, brief and self-healing so the
   * management page shows error states without manual intervention.
   */
  maybeRandomFault() {
    if (!this.autoFaults) return;
    const candidates = this.list().filter((i) => i.enabled && i.status === 'ok');
    if (!candidates.length || Math.random() > 0.004) return;
    const victim = candidates[Math.floor(Math.random() * candidates.length)];
    this.setStatus(victim.id, 'error', '模拟采集超时');
    setTimeout(() => {
      const cur = this.items.get(victim.id);
      if (cur && cur.status === 'error' && cur.error === '模拟采集超时') {
        this.setStatus(victim.id, 'ok');
      }
    }, 4000 + Math.random() * 6000).unref?.();
  }

  toJSON() {
    return this.list();
  }
}
