/**
 * Alert rule CRUD + alert state reads.
 *
 *   GET    /api/alerts/rules
 *   POST   /api/alerts/rules
 *   PUT    /api/alerts/rules/:id        threshold edits take effect immediately
 *   DELETE /api/alerts/rules/:id
 *   GET    /api/alerts/active
 *   GET    /api/alerts/events
 */
export default async function alertRoutes(fastify, deps) {
  const { alerts, sources, store, hub } = deps;
  const sourceIds = () => sources.list().map((s) => s.id);

  fastify.get('/alerts/rules', async () => ({ rules: alerts.listRules() }));

  fastify.post('/alerts/rules', async (req, reply) => {
    const error = validate(req.body, sourceIds());
    if (error) return reply.code(400).send({ error });
    let rule;
    try {
      rule = alerts.createRule({
        source: req.body.source,
        name: req.body.name,
        operator: req.body.operator ?? '>',
        threshold: Number(req.body.threshold),
        level: req.body.level ?? 'warning',
        enabled: req.body.enabled
      });
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    const latest = store.getLast(rule.source);
    if (latest) alerts.reevaluate(rule.id, latest.value, latest.ts);
    return reply.code(201).send({ rule });
  });

  fastify.put('/alerts/rules/:id', async (req, reply) => {
    const rule = alerts.getRule(req.params.id);
    if (!rule) return reply.code(404).send({ error: 'rule not found' });
    const error = validate({ ...rule, ...req.body }, sourceIds());
    if (error) return reply.code(400).send({ error });
    let updated;
    try {
      updated = alerts.updateRule(rule.id, req.body);
    } catch (e) {
      return reply.code(400).send({ error: e.message });
    }
    // Judgement follows the new threshold immediately.
    const latest = store.getLast(updated.source);
    alerts.reevaluate(
      updated.id,
      latest ? latest.value : updated.threshold,
      latest ? latest.ts : Date.now()
    );
    hub.broadcast('alert-rules', { rules: alerts.listRules() });
    return { rule: updated };
  });

  fastify.delete('/alerts/rules/:id', async (req, reply) => {
    const existed = alerts.deleteRule(req.params.id);
    if (!existed) return reply.code(404).send({ error: 'rule not found' });
    return { deleted: true };
  });

  fastify.get('/alerts/active', async () => ({ alerts: alerts.listActive() }));
  fastify.get('/alerts/events', async () => ({ events: alerts.recentEvents(100) }));
}

function validate(body, ids) {
  if (!body || typeof body !== 'object') return 'body required';
  if (body.source !== undefined && !ids.includes(body.source)) {
    return 'source must be an existing source id';
  }
  if (body.operator !== undefined && body.operator !== '>' && body.operator !== '<') {
    return "operator must be '>' or '<'";
  }
  if (body.threshold !== undefined && !Number.isFinite(Number(body.threshold))) {
    return 'threshold must be a finite number';
  }
  if (body.level !== undefined && body.level !== 'warning' && body.level !== 'critical') {
    return "level must be 'warning' or 'critical'";
  }
  return null;
}
