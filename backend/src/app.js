import Fastify from 'fastify';
import fastifyWebsocket from '@fastify/websocket';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';

import { loadConfig } from './config.js';
import { ConfigStore } from './domain/configStore.js';
import { SeriesStore } from './domain/seriesStore.js';
import { SourcesRegistry } from './domain/sourcesRegistry.js';
import { createSimulators } from './domain/simulator.js';
import { AlertEngine } from './domain/alertEngine.js';
import { Collector } from './domain/collector.js';
import { Hub } from './domain/hub.js';
import { DEFAULT_RULES } from './domain/sourceDefinitions.js';

import sourceRoutes from './http/sourceRoutes.js';
import metricRoutes from './http/metricRoutes.js';
import historyRoutes from './http/historyRoutes.js';
import alertRoutes from './http/alertRoutes.js';
import configRoutes from './http/configRoutes.js';

/**
 * Build and wire the whole application. Kept factory-style (no implicit
 * listen()) so the test-suite can boot isolated instances on random ports
 * with their own DATA_DIR.
 *
 * @param {Partial<ReturnType<loadConfig>>} [overrides]
 */
export async function createApp(overrides = {}) {
  const cfg = { ...loadConfig(), ...overrides };

  const fastify = Fastify({
    logger: { level: overrides.logLevel || process.env.LOG_LEVEL || 'info' }
  });

  const configStore = new ConfigStore(cfg.dataDir, { alertRules: DEFAULT_RULES });
  await configStore.load();

  const store = new SeriesStore(cfg.dataDir, cfg.retentionMs, {
    compactionIntervalMs: cfg.compactionIntervalMs
  });
  const sources = new SourcesRegistry(undefined, { autoFaults: cfg.autoFaults });
  await store.init(sources.list().map((s) => s.id));

  const simulators = createSimulators();
  const alerts = new AlertEngine(configStore);
  alerts.init(configStore.rules);

  const collector = new Collector(sources, simulators, {
    tickIntervalMs: cfg.tickIntervalMs
  });

  const hub = new Hub();

  // ---- live pipeline: produced point -> archive + alert engine + push ----
  collector.on('point', (point) => {
    store.append(point.source, point.ts, point.value);
    alerts.evaluate(point.source, point.value, point.ts);
    hub.broadcastPoint(point);
  });

  alerts.on('alert-fired', (alert) => hub.broadcastAlert('alert-fired', alert));
  alerts.on('alert-resolved', (event) => hub.broadcastAlert('alert-resolved', event));

  await fastify.register(fastifyWebsocket);
  hub.attach(fastify, '/ws', () => ({
    sources: sources.list(),
    points: store.recentSnapshot(
      sources.list().map((s) => s.id),
      5 * 60_000
    ),
    alerts: alerts.listActive(),
    rules: alerts.listRules()
  }));

  // ---- REST API ----
  const deps = {
    sources,
    store,
    configStore,
    alerts,
    collector,
    hub,
    retentionMs: cfg.retentionMs
  };
  await fastify.register(
    async (api) => {
      await api.register(sourceRoutes, deps);
      await api.register(metricRoutes, deps);
      await api.register(historyRoutes, deps);
      await api.register(alertRoutes, deps);
      await api.register(configRoutes, deps);
      api.get('/health', async () => ({
        ok: true,
        sources: sources.list().length,
        retentionMs: cfg.retentionMs
      }));
    },
    { prefix: '/api' }
  );

  // ---- built frontend (production container) ----
  if (existsSync(cfg.staticDir)) {
    await fastify.register(fastifyStatic, {
      root: cfg.staticDir,
      wildcard: false
    });
    // SPA fallback: any non-API GET serves index.html and lets the router work.
    fastify.setNotFoundHandler((req, reply) => {
      if (req.raw.url?.startsWith('/api/') || req.raw.url === '/ws') {
        return reply.code(404).send({ error: 'not found' });
      }
      return reply.sendFile('index.html');
    });
  }

  // ---- lifecycle ----
  fastify.addHook('onClose', async () => {
    collector.stop();
    hub.close();
    await Promise.allSettled([configStore.close(), store.close()]);
  });

  const start = async () => {
    // Listen first; only start the periodic collector when an interval is
    // configured. (Tests pass a very large interval and drive points via the
    // ingest endpoint.)
    if (cfg.tickIntervalMs > 0) collector.start();
    await fastify.listen({ host: cfg.host, port: cfg.port });
    return fastify;
  };

  const stop = async () => fastify.close();

  return { fastify, cfg, sources, store, configStore, alerts, collector, hub, start, stop };
}

