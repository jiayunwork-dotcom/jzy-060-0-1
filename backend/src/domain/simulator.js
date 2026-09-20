/**
 * Tiny random-walk simulator producing plausible-looking metric curves.
 * Each metric has its own baseline / variance / clamp range and a small
 * probability of an occasional spike (which naturally exercises the alert
 * engine without any manual poking).
 */

/**
 * @param {{ min: number, max: number, start: number, vol: number, spikeChance?: number, spike?: number }} cfg
 */
export function createWalker(cfg) {
  let value = cfg.start;
  return () => {
    let next = value + (Math.random() - 0.5) * cfg.vol;
    if (cfg.spikeChance && Math.random() < cfg.spikeChance) {
      next += cfg.spike ?? cfg.vol * 4;
    }
    // Gentle pull back toward the start (mean reversion) so walks stay bounded.
    next += (cfg.start - next) * 0.08;
    next = Math.min(cfg.max, Math.max(cfg.min, next));
    value = next;
    return next;
  };
}

/** Round to a metric-appropriate number of decimals. */
export function roundFor(sourceId, value) {
  const decimals = sourceId === 'online' ? 0 : 1;
  const f = 10 ** decimals;
  return Math.round(value * f) / f;
}

export function createSimulators() {
  const walkers = {
    cpu: createWalker({ min: 5, max: 99, start: 42, vol: 10, spikeChance: 0.03, spike: 35 }),
    memory: createWalker({ min: 20, max: 97, start: 58, vol: 4 }),
    network: createWalker({ min: 0, max: 125, start: 32, vol: 12, spikeChance: 0.02, spike: 45 }),
    rps: createWalker({ min: 0, max: 6000, start: 2100, vol: 350, spikeChance: 0.02, spike: 1800 }),
    online: createWalker({ min: 0, max: 20000, start: 8200, vol: 500 }),
    errorRate: createWalker({ min: 0, max: 100, start: 1.2, vol: 1.1, spikeChance: 0.025, spike: 8 })
  };
  return {
    /** @param {string} sourceId */
    next(sourceId) {
      const walker = walkers[sourceId];
      if (!walker) return 0;
      return roundFor(sourceId, walker());
    }
  };
}
