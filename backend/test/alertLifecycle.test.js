import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
import { startTestApp, sleep } from './helpers.js';

const rule = (over = {}) => ({
  source: 'network',
  name: '网络吞吐测试规则',
  operator: '>',
  threshold: 50,
  level: 'warning',
  ...over
});

/**
 * Locks alert lifecycle: crossing a threshold fires the correct level,
 * falling back resolves it; editing a rule's threshold re-judges against
 * the new value; warning and critical are distinguished.
 */
describe('alert threshold lifecycle', () => {
  let app;

  before(async () => app = await startTestApp());
  after(async () => app.shutdown());

  it('fires warning when value crosses threshold and resolves when it falls back', async () => {
    const created = await app.http.post('/alerts/rules', rule());
    assert.equal(created.status, 201);
    const id = created.body.rule.id;

    const below = await app.http.post('/sources/network/ingest', { value: 10 });
    assert.equal(below.status, 200);
    let active = await app.http.get('/alerts/active');
    assert.equal(active.body.alerts.some((a) => a.ruleId === id), false);

    const above = await app.http.post('/sources/network/ingest', { value: 70 });
    assert.equal(above.status, 200);
    active = await app.http.get('/alerts/active');
    const firing = active.body.alerts.find((a) => a.ruleId === id);
    assert.ok(firing, 'warning alert fired');
    assert.equal(firing.level, 'warning');
    assert.equal(firing.value, 70);

    const back = await app.http.post('/sources/network/ingest', { value: 20 });
    assert.equal(back.status, 200);
    active = await app.http.get('/alerts/active');
    assert.equal(active.body.alerts.some((a) => a.ruleId === id), false);

    const events = await app.http.get('/alerts/events');
    const fired = events.body.events.find((e) => e.ruleId === id && e.type === 'fired');
    const resolved = events.body.events.find((e) => e.ruleId === id && e.type === 'resolved');
    assert.ok(fired && resolved, 'both lifecycle events recorded');
    assert.equal(fired.at < resolved.at, true);
  });

  it('distinguishes critical from warning', async () => {
    const created = await app.http.post('/alerts/rules', rule({ level: 'critical' }));
    const id = created.body.rule.id;

    await app.http.post('/sources/network/ingest', { value: 71 });
    const active = await app.http.get('/alerts/active');
    const firing = active.body.alerts.find((a) => a.ruleId === id);
    assert.ok(firing);
    assert.equal(firing.level, 'critical');
  });

  it('after editing the threshold, judgement follows the new threshold', async () => {
    // Start with threshold 80; current value 71 (ingested above) must NOT fire.
    const created = await app.http.post('/alerts/rules', rule({ threshold: 80 }));
    const id = created.body.rule.id;

    let active = await app.http.get('/alerts/active');
    assert.equal(active.body.alerts.some((a) => a.ruleId === id), false,
      '71 does not breach threshold 80');

    // Lower threshold to 60 via the update endpoint -> existing value 71 now breaches.
    const updated = await app.http.put(`/alerts/rules/${id}`, { threshold: 60 });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.rule.threshold, 60);

    active = await app.http.get('/alerts/active');
    assert.ok(active.body.alerts.find((a) => a.ruleId === id),
      'same value fires against the new, lower threshold without a new point');

    // Raise threshold above current value -> it resolves immediately.
    await app.http.put(`/alerts/rules/${id}`, { threshold: 90 });
    active = await app.http.get('/alerts/active');
    assert.equal(active.body.alerts.some((a) => a.ruleId === id), false,
      'raising the threshold past the current value resolves the alert');
  });

  it('pushes fired/resolved alerts over WebSocket', async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${new URL(app.baseUrl).port}/ws`);
    /** @type {any[]} */
    const msgs = [];
    await new Promise((resolve, reject) => {
      ws.once('open', resolve);
      ws.once('error', reject);
    });
    ws.on('message', (raw) => msgs.push(JSON.parse(raw.toString())));

    const created = await app.http.post('/alerts/rules', rule({ threshold: 55 }));
    const id = created.body.rule.id;
    await app.http.post('/sources/network/ingest', { value: 80 });
    await app.http.post('/sources/network/ingest', { value: 10 });
    await sleep(150);

    const fired = msgs.find((m) => m.type === 'alert-fired' && m.alert?.ruleId === id);
    const resolved = msgs.find((m) => m.type === 'alert-resolved' && m.alert?.ruleId === id);
    assert.ok(fired, 'alert-fired pushed by server');
    assert.ok(resolved, 'alert-resolved pushed by server');
    ws.close();
  });
});
