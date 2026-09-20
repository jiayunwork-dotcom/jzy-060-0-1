/**
 * Data source management + manual ingestion routes.
 *
 *   GET    /api/sources                list sources with state
 *   POST   /api/sources/:id/enabled    { enabled: boolean } collection switch
 *   POST   /api/sources/:id/status     { status: 'ok'|'error', error? } fault injection
 *   POST   /api/sources/:id/ingest     { value } push a live reading through the pipeline
 */
export default async function sourceRoutes(fastify, deps) {
  const { sources, collector, alerts, hub } = deps;

  fastify.get('/sources', async () => ({ sources: sources.list() }));

  fastify.post('/sources/:id/enabled', async (req, reply) => {
    const item = sources.get(req.params.id);
    if (!item) return reply.code(404).send({ error: 'source not found' });
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      return reply.code(400).send({ error: 'body must be { enabled: boolean }' });
    }
    sources.setEnabled(item.id, enabled);
    if (!enabled) alerts.resolveAllForSource(item.id);
    hub.broadcastSources(sources.list());
    return { source: sources.get(item.id) };
  });

  fastify.post('/sources/:id/status', async (req, reply) => {
    const item = sources.get(req.params.id);
    if (!item) return reply.code(404).send({ error: 'source not found' });
    const status = req.body?.status;
    if (status !== 'ok' && status !== 'error') {
      return reply.code(400).send({ error: "status must be 'ok' or 'error'" });
    }
    sources.setStatus(item.id, status, status === 'error' ? (req.body?.error ?? 'manual fault') : null);
    if (status === 'error') alerts.resolveAllForSource(item.id);
    hub.broadcastSources(sources.list());
    return { source: sources.get(item.id) };
  });

  fastify.post('/sources/:id/ingest', async (req, reply) => {
    const item = sources.get(req.params.id);
    if (!item) return reply.code(404).send({ error: 'source not found' });
    const value = Number(req.body?.value);
    if (!Number.isFinite(value)) return reply.code(400).send({ error: 'value must be a finite number' });
    const ts = Number.isFinite(Number(req.body?.ts)) ? Number(req.body.ts) : Date.now();
    const result = collector.push(item.id, value, ts);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { point: result.point };
  });
}
