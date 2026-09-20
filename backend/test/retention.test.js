import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { startTestApp } from './helpers.js';
import { SeriesStore } from '../src/domain/seriesStore.js';
import { join } from 'node:path';

const DAY = 24 * 60 * 60 * 1000;

/**
 * Locks the rolling retention window:
 *  - points older than 24h are dropped by the archive (reads + disk compaction),
 *  - points inside the window are kept,
 *  - with a shorter configured window, an old point is evicted as the
 *    window rolls forward even if it was "recent" when written.
 */
describe('retention window rolling eviction', () => {
  it('prunes points older than the retention window on read', async () => {
    const app = await startTestApp({ retentionMs: DAY });
    try {
      const now = Date.now();
      const r = await app.http.post('/history/backfill', {
        source: 'memory',
        points: [
          { ts: now - (DAY + 60_000), value: 99 },   // too old
          { ts: now - 10_000, value: 42 }            // within window
        ]
      });
      assert.equal(r.status, 200);

      const res = await app.http.get(
        `/history?sources=memory&from=${now - 2 * DAY}&to=${now + 1000}`
      );
      const values = res.body.series.memory.map((p) => p.value);
      assert.deepEqual(values, [42]);
    } finally {
      await app.shutdown();
    }
  });

  it('rewrites the on-disk log without expired points during compaction', async () => {
    const app = await startTestApp({ retentionMs: DAY });
    try {
      const now = Date.now();
      await app.http.post('/history/backfill', {
        source: 'cpu',
        points: [
          { ts: now - (2 * DAY), value: 1 },
          { ts: now - (DAY + 1), value: 2 },
          { ts: now - 5000, value: 3 }
        ]
      });
      await app.store.flush();
      await app.store.compactAll();

      const raw = await readFile(join(app.dataDir, 'series', 'cpu.jsonl'), 'utf8');
      const kept = raw.split('\n').filter(Boolean).map((l) => JSON.parse(l).value);
      assert.deepEqual(kept, [3]);
    } finally {
      await app.shutdown();
    }
  });

  it('evicts a previously-valid point when a shorter window rolls past it', async () => {
    const app = await startTestApp({ retentionMs: 10_000 });
    try {
      const t0 = Date.now();
      let clock = t0;
      // Fresh store with a 10s window: point 6s old is kept at write time.
      const store = new SeriesStore(app.dataDir, 10_000, {
        compactionIntervalMs: 10 ** 9,
        now: () => clock
      });
      await store.init(['online']);
      store.append('online', t0 - 6_000, 7);
      assert.equal(store.query('online', 0, t0 + 1000).length, 1);

      // Window rolls: 12s later that point is 18s old and must be evicted.
      clock = t0 + 12_000;
      const found = store.query('online', 0, clock + 1000);
      assert.equal(found.length, 0);
      clearInterval(store._compactionTimer);
    } finally {
      await app.shutdown();
    }
  });
});
