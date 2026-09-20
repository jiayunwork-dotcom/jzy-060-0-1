import type {
  AlertRule,
  ActiveAlert,
  AlertEvent,
  LayoutItem,
  MetricPoint,
  SeriesMap,
  SourceItem
} from '../types';

const json = async <T>(res: Response): Promise<T> => {
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
};

export const api = {
  // ---- sources ----
  async listSources(): Promise<SourceItem[]> {
    const r = await fetch('/api/sources');
    return (await json<{ sources: SourceItem[] }>(r)).sources;
  },
  setEnabled(id: string, enabled: boolean) {
    return fetch(`/api/sources/${id}/enabled`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled })
    }).then((r) => json(r));
  },
  setStatus(id: string, status: 'ok' | 'error', error?: string) {
    return fetch(`/api/sources/${id}/status`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status, error })
    }).then((r) => json(r));
  },
  ingest(id: string, value: number) {
    return fetch(`/api/sources/${id}/ingest`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ value })
    }).then((r) => json(r));
  },

  // ---- live metrics (initial chart fill before WS catches up) ----
  async recent(windowMs = 5 * 60_000): Promise<SeriesMap> {
    const r = await fetch(`/api/metrics/recent?windowMs=${windowMs}`);
    return (await json<{ series: SeriesMap }>(r)).series;
  },

  // ---- history / replay ----
  async history(from: number, to: number, sources?: string[]): Promise<{
    from: number;
    to: number;
    retentionMs: number;
    series: SeriesMap;
  }> {
    const q = new URLSearchParams({ from: String(from), to: String(to) });
    if (sources?.length) q.set('sources', sources.join(','));
    const r = await fetch(`/api/history?${q}`);
    return json(r);
  },

  // ---- alerts ----
  async listRules(): Promise<AlertRule[]> {
    const r = await fetch('/api/alerts/rules');
    return (await json<{ rules: AlertRule[] }>(r)).rules;
  },
  async createRule(input: Omit<AlertRule, 'id'>): Promise<{ rule: AlertRule }> {
    const r = await fetch('/api/alerts/rules', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    return json(r);
  },
  async updateRule(id: string, patch: Partial<AlertRule>) {
    const r = await fetch(`/api/alerts/rules/${id}`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(patch)
    });
    return json<{ rule: AlertRule }>(r);
  },
  async deleteRule(id: string) {
    const r = await fetch(`/api/alerts/rules/${id}`, { method: 'DELETE' });
    return json(r);
  },
  async activeAlerts(): Promise<ActiveAlert[]> {
    const r = await fetch('/api/alerts/active');
    return (await json<{ alerts: ActiveAlert[] }>(r)).alerts;
  },
  async alertEvents(): Promise<AlertEvent[]> {
    const r = await fetch('/api/alerts/events');
    return (await json<{ events: AlertEvent[] }>(r)).events;
  },

  // ---- layout ----
  async getLayout(): Promise<LayoutItem[] | null> {
    const r = await fetch('/api/layout');
    return (await json<{ layout: LayoutItem[] | null }>(r)).layout;
  },
  async saveLayout(layout: LayoutItem[]) {
    const r = await fetch('/api/layout', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ layout })
    });
    return json<{ ok: boolean }>(r);
  }
};

// Re-exported point type for modules that only depend on the api layer.
export type { MetricPoint };
