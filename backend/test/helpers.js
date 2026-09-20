import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from '../src/app.js';

/**
 * Boot an isolated backend instance: random port, private DATA_DIR,
 * effectively disabled simulator timer / random faults so tests are
 * fully deterministic (points only move when a test ingests one).
 */
export async function startTestApp(overrides = {}) {
  const dataDir = await mkdtemp(join(tmpdir(), 'opsdash-'));
  const app = await createApp({
    dataDir,
    host: '127.0.0.1',
    port: 0,
    tickIntervalMs: 60 * 60_000,
    compactionIntervalMs: 60 * 60_000,
    autoFaults: false,
    logLevel: 'silent',
    ...overrides
  });
  await app.start();
  const address = app.fastify.server.address();
  const baseUrl = `http://127.0.0.1:${address.port}`;

  return {
    ...app,
    dataDir,
    baseUrl,
    http: {
      // All app routes live under /api; pass paths relative to that prefix.
      get: (path) => fetch(`${baseUrl}/api${path}`).then(asJson),
      post: (path, body) =>
        fetch(`${baseUrl}/api${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {})
        }).then(asJson),
      put: (path, body) =>
        fetch(`${baseUrl}/api${path}`, {
          method: 'PUT',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body ?? {})
        }).then(asJson),
      del: (path) => fetch(`${baseUrl}/api${path}`, { method: 'DELETE' }).then(asJson)
    },
    async shutdown() {
      await app.stop();
      // Retry cleanup: a background flush/compaction may release a file just
      // after the first attempt.
      await app.store.flush().catch(() => {});
      for (let attempt = 0; attempt < 5; attempt++) {
        try {
          await rm(dataDir, { recursive: true, force: true });
          return;
        } catch (e) {
          if (e.code !== 'ENOTEMPTY' && e.code !== 'EBUSY') throw e;
          await new Promise((r) => setTimeout(r, 50));
        }
      }
      await rm(dataDir, { recursive: true, force: true });
    }
  };
}

async function asJson(res) {
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* empty body */
  }
  return { status: res.status, body };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
