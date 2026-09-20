import { create } from 'zustand';
import type {
  ActiveAlert,
  AlertLevel,
  AlertRule,
  LayoutItem,
  MetricPoint,
  SeriesMap,
  SourceItem
} from '../types';

const LIVE_WINDOW_MS = 5 * 60_000;
const MAX_POINTS_PER_SERIES = 400;

function appendLive(series: SeriesMap, point: MetricPoint): SeriesMap {
  const arr = series[point.source] ? [...series[point.source]] : [];
  arr.push(point);
  const cutoff = point.ts - LIVE_WINDOW_MS;
  let i = 0;
  while (i < arr.length && arr[i].ts < cutoff) i++;
  if (i > 0) arr.splice(0, i);
  if (arr.length > MAX_POINTS_PER_SERIES) arr.splice(0, arr.length - MAX_POINTS_PER_SERIES);
  return { ...series, [point.source]: arr };
}

interface DashboardState {
  ready: boolean;
  sources: SourceItem[];
  series: SeriesMap;
  rules: AlertRule[];
  activeAlerts: ActiveAlert[];
  /** source id -> highest firing level, drives chart recoloring */
  alertLevels: Record<string, AlertLevel>;
  /** transient toasts: fired alerts surfaced as popups */
  toasts: { id: string; ruleId: string; level: AlertLevel; title: string; body: string; at: number }[];
  layout: LayoutItem[] | null;

  applySnapshot: (s: {
    sources: SourceItem[];
    points: SeriesMap;
    alerts: ActiveAlert[];
    rules: AlertRule[];
  }) => void;
  addPoint: (p: MetricPoint) => void;
  setSources: (s: SourceItem[]) => void;
  setRules: (r: AlertRule[]) => void;
  fireAlert: (a: ActiveAlert) => void;
  resolveAlert: (ruleId: string) => void;
  dismissToast: (id: string) => void;
  setLayout: (l: LayoutItem[]) => void;

  /** live vs replay mode for the dashboard charts */
  mode: 'live' | 'replay';
  replaySeries: SeriesMap;
  replayClock: number | null;
  enterReplay: (series: SeriesMap) => void;
  exitReplay: () => void;
  setReplayClock: (ts: number | null) => void;
}

function levelsFrom(alerts: ActiveAlert[]): Record<string, AlertLevel> {
  const out: Record<string, AlertLevel> = {};
  for (const a of alerts) {
    // critical wins over warning when several rules on one source are firing
    if (out[a.source] !== 'critical') out[a.source] = a.level;
  }
  return out;
}

export const useDashboard = create<DashboardState>((set) => ({
  ready: false,
  sources: [],
  series: {},
  rules: [],
  activeAlerts: [],
  alertLevels: {},
  toasts: [],
  layout: null,
  mode: 'live',
  replaySeries: {},
  replayClock: null,

  applySnapshot: (s) =>
    set({
      ready: true,
      sources: s.sources,
      series: s.points,
      rules: s.rules,
      activeAlerts: s.alerts,
      alertLevels: levelsFrom(s.alerts)
    }),

  addPoint: (p) => set((st) => ({ series: appendLive(st.series, p) })),

  setSources: (sources) => set({ sources }),

  setRules: (rules) => set({ rules }),

  fireAlert: (a) =>
    set((st) => {
      if (st.activeAlerts.some((x) => x.ruleId === a.ruleId)) return {};
      const activeAlerts = [...st.activeAlerts, a];
      const sourceName = st.sources.find((s) => s.id === a.source)?.name ?? a.source;
      // Drop any earlier toast for the same rule (e.g. warning -> critical)
      // so a single source shows only its current popup.
      const toasts = st.toasts.filter((t) => t.ruleId !== a.ruleId);
      return {
        activeAlerts,
        alertLevels: levelsFrom(activeAlerts),
        toasts: [
          {
            id: `${a.ruleId}-${a.startedAt}`,
            ruleId: a.ruleId,
            level: a.level,
            title: a.level === 'critical' ? '严重告警' : '警告',
            body: `${sourceName} · ${a.ruleName}（当前 ${formatValue(a.value, st, a.source)}）`,
            at: Date.now()
          },
          ...toasts
        ].slice(0, 5)
      };
    }),

  resolveAlert: (ruleId) =>
    set((st) => {
      const activeAlerts = st.activeAlerts.filter((a) => a.ruleId !== ruleId);
      return { activeAlerts, alertLevels: levelsFrom(activeAlerts) };
    }),

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

  setLayout: (layout) => set({ layout }),

  enterReplay: (series) =>
    set({ mode: 'replay', replaySeries: series, replayClock: null }),
  exitReplay: () => set({ mode: 'live', replaySeries: {}, replayClock: null }),
  setReplayClock: (ts) => set({ replayClock: ts })
}));

function formatValue(v: number, st: DashboardState, source: string) {
  const src = st.sources.find((s) => s.id === source);
  return `${v}${src?.unit === 'percent' ? '%' : ''}`;
}
