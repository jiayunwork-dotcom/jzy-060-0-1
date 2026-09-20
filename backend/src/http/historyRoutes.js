/**
 * Historical archive + replay routes. Every read comes from SeriesStore
 * (the durable 24h archive) — the simulator is never invoked here, so a
 * replay can only contain points that were genuinely produced/archived.
 *
 *   GET  /api/history?from=&to=&sources=     range query of archived points
 *   POST /api/history/backfill {source,points} archive historical points
 *                                             (demo/test seeding, no alerts/push)
 */
export default async function historyRoutes(fastify, deps) {
  const { sources, store, retentionMs } = deps;

  fastify.get('/history', async (req, reply) => {
    const to = Number(req.query?.to) || Date.now();
    const from = Number(req.query?.from) || to - 5 * 60_000;
    if (!Number.isFinite(from) || !Number.isFinite(to) || from > to) {
      return reply.code(400).send({ error: 'invalid from/to range' });
    }
    let sourceIds = sources.list().map((s) => s.id);
    if (typeof req.query?.sources === 'string' && req.query.sources.trim()) {
      const requested = req.query.sources.split(',').map((s) => s.trim()).filter(Boolean);
      const known = new Set(sourceIds);
      if (requested.some((id) => !known.has(id))) {
        return reply.code(400).send({ error: 'unknown source id' });
      }
      sourceIds = requested;
    }
    return {
      from,
      to,
      retentionMs,
      series: store.queryRange(sourceIds, from, to)
    };
  });

  fastify.post('/history/backfill', async (req, reply) => {
    const body = req.body ?? {};
    const sourceId = String(body.source ?? '');
    if (!sources.get(sourceId)) return reply.code(404).send({ error: 'source not found' });
    /** @type {{ts:number, value:number}[]} */
    const points = Array.isArray(body.points) ? body.points : [];
    if (!points.length) return reply.code(400).send({ error: 'points[] required' });

    let inserted = 0;
    for (const p of points) {
      const ts = Number(p?.ts);
      const value = Number(p?.value);
      if (!Number.isFinite(ts) || !Number.isFinite(value)) {
        return reply.code(400).send({ error: 'each point needs numeric ts and value' });
      }
      // Archive only: no alert evaluation, no live WebSocket fan-out.
      store.append(sourceId, ts, value);
      inserted++;
    }
    await store.flush();
    return { inserted };
  });
}
