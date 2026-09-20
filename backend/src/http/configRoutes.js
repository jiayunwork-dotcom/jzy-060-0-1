/**
 * Dashboard layout persistence:
 *
 *   GET  /api/layout  -> { layout: [...] | null }
 *   PUT  /api/layout  <- { layout: [...] }  (drag/resize results auto-saved)
 */
export default async function configRoutes(fastify, deps) {
  const { configStore } = deps;

  fastify.get('/layout', async () => ({ layout: configStore.getLayout() }));

  fastify.put('/layout', async (req, reply) => {
    const layout = req.body?.layout;
    if (!Array.isArray(layout)) {
      return reply.code(400).send({ error: 'body must be { layout: Layout[] }' });
    }
    configStore.setLayout(layout);
    await configStore.flush();
    return { ok: true, layout: configStore.getLayout() };
  });
}
