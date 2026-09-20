/**
 * Live/recent metric reads (served from the in-memory archive):
 *
 *   GET /api/metrics/latest                 latest value of every source
 *   GET /api/metrics/recent?windowMs=300000 last N ms for every source
 */
export default async function metricRoutes(fastify, deps) {
  const { sources, store } = deps;
  const ids = () => sources.list().map((s) => s.id);

  fastify.get('/metrics/latest', async () => {
    const points = ids()
      .map((id) => store.getLast(id))
      .filter(Boolean);
    return { points };
  });

  fastify.get('/metrics/recent', async (req) => {
    const windowMs = Math.min(
      Math.max(Number(req.query?.windowMs) || 5 * 60_000, 1000),
      deps.retentionMs
    );
    return {
      windowMs,
      series: store.recentSnapshot(ids(), windowMs)
    };
  });
}
