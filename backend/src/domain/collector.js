import { EventEmitter } from 'node:events';
import { roundFor } from './simulator.js';

/**
 * Drives periodic metric production. On every tick, for each data source:
 *   - disabled or erroring sources produce nothing,
 *   - healthy enabled sources get a new simulated (or externally ingested)
 *     value which is emitted on `point` for the rest of the pipeline
 *     (archive + alert engine + WebSocket fan-out).
 */
export class Collector extends EventEmitter {
  /**
   * @param {import('./sourcesRegistry.js').SourcesRegistry} sources
   * @param {import('./simulator.js').createSimulators extends () => infer S ? S : never} simulators
   * @param {{ tickIntervalMs: number }} options
   */
  constructor(sources, simulators, options) {
    super();
    this.sources = sources;
    this.simulators = simulators;
    this.tickIntervalMs = options.tickIntervalMs;
    /** @type {NodeJS.Timeout|null} */
    this.timer = null;
  }

  start() {
    if (this.timer) return;
    // Fire only on the interval — no immediate tick. Callers that want an
    // instant reading can invoke tick() explicitly.
    this.timer = setInterval(() => this.tick(), this.tickIntervalMs);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  tick() {
    this.sources.maybeRandomFault();
    const ts = Date.now();
    for (const source of this.sources.list()) {
      if (!this.sources.canProduce(source.id)) continue;
      const value = this.simulators.next(source.id);
      this.push(source.id, value, ts);
    }
  }

  /**
   * Process one metric reading through the pipeline. Shared by the simulator
   * tick and the manual ingestion endpoint (used by tests as well).
   */
  push(sourceId, rawValue, ts = Date.now()) {
    const source = this.sources.get(sourceId);
    if (!source) return { ok: false, status: 404, error: 'source not found' };
    if (!source.enabled) return { ok: false, status: 409, error: 'source is disabled' };
    if (source.status !== 'ok') return { ok: false, status: 409, error: 'source is in error state' };
    const value = roundFor(sourceId, Number(rawValue));
    this.sources.markReading(sourceId, value, ts);
    this.emit('point', { source: sourceId, ts, value });
    return { ok: true, point: { source: sourceId, ts, value } };
  }
}
