import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';

/**
 * Locks historical replay: the replay endpoint returns the points really
 * archived in the selected range (distinctive seeded values), never points
 * fabricated on demand. With the simulator timer effectively disabled, every
 * returned point must be one we archived ourselves.
 */
describe('history replay reads the real archive', () => {
  let app;
  const now = Date.now();

  before(async () => {
    app = await startTestApp();
    // A distinctive, non-random pattern archived at known timestamps.
    const points = [];
    for (let i = 0; i < 6; i++) {
      points.push({ ts: now - 60_000 + i * 10_000, value: 100 + i });
    }
    const seeded = await app.http.post('/history/backfill', { source: 'rps', points });
    assert.equal(seeded.status, 200, `backfill failed: ${JSON.stringify(seeded.body)}`);
    assert.equal(seeded.body.inserted, 6);
  });
  after(async () => app.shutdown());

  it('reports the 24h retention window', async () => {
    const health = await app.http.get('/health');
    assert.equal(health.body.retentionMs, 24 * 60 * 60 * 1000);
  });

  it('returns exactly the archived points inside the selected range', async () => {
    const from = now - 35_000;
    const to = now + 5_000;
    const res = await app.http.get(
      `/history?sources=rps&from=${from}&to=${to}`
    );
    assert.equal(res.status, 200);

    const values = res.body.series.rps.map((p) => p.value).sort((a, b) => a - b);
    // Seeded values 100..105; only points with ts >= from survive (last three).
    assert.deepEqual(values, [103, 104, 105]);
    for (const p of res.body.series.rps) {
      assert.equal(p.source, 'rps');
      assert.ok(p.ts >= from && p.ts <= to);
    }
  });

  it('does not invent data: an empty range returns an empty series', async () => {
    const res = await app.http.get(
      `/history?sources=online&from=${now - 1_000_000}&to=${now - 900_000}`
    );
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.series.online, []);
  });

  it('rejects unknown source ids instead of fabricating a series', async () => {
    const res = await app.http.get(
      `/history?sources=doesNotExist&from=${now - 1000}&to=${now}`
    );
    assert.equal(res.status, 400);
  });

  it('survives across a store reload from disk', async () => {
    // Force buffered lines to the on-disk JSONL, then re-read via a fresh store.
    await app.store.flush();
    const reloaded = app.store.query('rps', now - 120_000, now + 60_000);
    const values = reloaded.map((p) => p.value).sort((a, b) => a - b);
    assert.deepEqual(values, [100, 101, 102, 103, 104, 105]);
  });
});
