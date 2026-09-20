import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startTestApp, sleep } from './helpers.js';

/**
 * Locks the behaviour: a manually disabled source stops receiving new data
 * points (REST + over the server-push WebSocket) and resumes after being
 * switched back on.
 */
describe('source enable/disable collection switch', () => {
  let app;

  before(async () => {
    app = await startTestApp();
    await app.http.post('/sources/cpu/enabled', { enabled: true });
  });
  after(async () => app.shutdown());

  it('ingests points while enabled', async () => {
    const r = await app.http.post('/sources/cpu/ingest', { value: 30 });
    assert.equal(r.status, 200);
    assert.equal(r.body.point.value, 30);

    const latest = await app.http.get('/metrics/latest');
    const cpu = latest.body.points.find((p) => p.source === 'cpu');
    assert.ok(cpu, 'cpu point archived');
  });

  it('stops producing new points after being switched off (REST)', async () => {
    const off = await app.http.post('/sources/cpu/enabled', { enabled: false });
    assert.equal(off.body.source.enabled, false);

    const rejected = await app.http.post('/sources/cpu/ingest', { value: 95 });
    assert.equal(rejected.status, 409);

    const after = await app.http.get('/metrics/latest');
    const cpu = after.body.points.find((p) => p.source === 'cpu');
    // Last archived point is still the pre-disable one; no 95 point appeared.
    assert.notEqual(cpu.value, 95);
  });

  it('stops pushing points over WebSocket while disabled, resumes after re-enable', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${new URL(app.baseUrl).port}/ws`);
    /** @type {any[]} */
    const received = [];
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'point') received.push(msg.point);
    });

    // disabled: nothing cpu-related may be pushed.
    await app.http.post('/sources/cpu/ingest', { value: 40 });
    await sleep(120);
    assert.equal(received.filter((p) => p.source === 'cpu').length, 0);

    // re-enabled: pushed again.
    await app.http.post('/sources/cpu/enabled', { enabled: true });
    await app.http.post('/sources/cpu/ingest', { value: 41 });
    await sleep(120);
    const cpuPushed = received.filter((p) => p.source === 'cpu');
    assert.ok(cpuPushed.some((p) => p.value === 41), 'a post-enable point was pushed');

    ws.close();
  });
});
