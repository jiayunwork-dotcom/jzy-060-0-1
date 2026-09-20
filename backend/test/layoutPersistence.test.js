import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestApp } from './helpers.js';
import { createApp } from '../src/app.js';

/**
 * Locks dashboard layout persistence: PUT layout -> GET returns it, and it
 * survives an application restart (written into the container's DATA_DIR,
 * not just held in memory).
 */
describe('layout persistence', () => {
  let app;

  before(async () => app = await startTestApp());
  after(async () => app.shutdown());

  const layout = [
    { i: 'line:cpu', x: 0, y: 0, w: 6, h: 7, widget: { kind: 'line', title: 'CPU', sources: ['cpu'] } },
    { i: 'gauge:mem', x: 6, y: 0, w: 3, h: 5, widget: { kind: 'gauge', title: 'MEM', sources: ['memory'] } }
  ];

  it('saves and returns the saved layout', async () => {
    const saved = await app.http.put('/layout', { layout });
    assert.equal(saved.status, 200);
    assert.deepEqual(saved.body.layout, layout);

    const got = await app.http.get('/layout');
    assert.deepEqual(got.body.layout, layout);
  });

  it('rejects malformed payloads', async () => {
    const bad = await app.http.put('/layout', { layout: { nope: true } });
    assert.equal(bad.status, 400);
  });

  it('keeps layout and alert rules after restart against the same DATA_DIR', async () => {
    const dataDir = app.dataDir;

    // Create a rule before the restart to prove rule config also lands on disk.
    const created = await app.http.post('/alerts/rules', {
      source: 'online',
      name: '在线人数持久化规则',
      operator: '<',
      threshold: 10,
      level: 'warning'
    });
    assert.equal(created.status, 201);
    const ruleId = created.body.rule.id;
    // Rule writes are debounced; force them to disk before restarting.
    await app.configStore.flush();

    await app.stop();

    const second = await createApp({
      dataDir,
      host: '127.0.0.1',
      port: 0,
      tickIntervalMs: 60 * 60_000,
      compactionIntervalMs: 60 * 60_000,
      autoFaults: false,
      logLevel: 'silent'
    });
    await second.start();
    try {
      assert.deepEqual(second.configStore.getLayout(), layout);
      const rules = second.alerts.listRules();
      assert.ok(rules.some((r) => r.id === ruleId && r.name === '在线人数持久化规则'));
    } finally {
      await second.stop();
    }
  });
});
