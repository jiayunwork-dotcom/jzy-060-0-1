import { useMemo } from 'react';
import { useDashboard } from '../store/dashboardStore';
import LineChart from './charts/LineChart';
import GaugeChart from './charts/GaugeChart';
import BarChart, { type BarEntry } from './charts/BarChart';
import type { LayoutItem, MetricPoint } from '../types';

interface Props {
  item: LayoutItem;
}

/** Resolves one persisted widget spec into the right chart with live data. */
export default function WidgetPanel({ item }: Props) {
  const sources = useDashboard((s) => s.sources);
  const liveSeries = useDashboard((s) => s.series);
  const replaySeries = useDashboard((s) => s.replaySeries);
  const mode = useDashboard((s) => s.mode);
  const replayClock = useDashboard((s) => s.replayClock);
  const alertLevels = useDashboard((s) => s.alertLevels);

  const data = mode === 'replay' ? replaySeries : liveSeries;
  const clock = mode === 'replay' ? replayClock : null;
  const levelActive = mode === 'live';

  const nameOf = (id: string) => sources.find((s) => s.id === id)?.name ?? id;
  const source = (id: string) => sources.find((s) => s.id === id);
  const points = (id: string): MetricPoint[] => data[id] ?? [];

  const panel = useMemo(() => {
    switch (item.widget.kind) {
      case 'line': {
        const unit = source(item.widget.sources[0])?.unit;
        const first = source(item.widget.sources[0]);
        return (
          <LineChart
            title={item.widget.title}
            unit={unit}
            min={first?.min}
            max={first?.max}
            clock={clock}
            series={item.widget.sources.map((id) => ({
              name: nameOf(id),
              points: points(id),
              level: levelActive ? alertLevels[id] ?? null : null
            }))}
          />
        );
      }
      case 'gauge': {
        const id = item.widget.sources[0];
        const src = source(id);
        const pts = points(id);
        // In replay mode show the value at the virtual clock; live shows latest.
        const upto = clock != null ? pts.filter((p) => p.ts <= clock) : pts;
        const last = upto[upto.length - 1];
        return (
          <GaugeChart
            title={item.widget.title}
            value={last?.value ?? 0}
            min={src?.min}
            max={src?.max}
            unit={src?.unit}
            level={levelActive ? alertLevels[id] : null}
          />
        );
      }
      case 'bar': {
        const entries: BarEntry[] = item.widget.sources.map((id) => {
          const pts = points(id);
          const upto = clock != null ? pts.filter((p) => p.ts <= clock) : pts;
          return {
            name: nameOf(id),
            value: upto.length ? upto[upto.length - 1].value : 0,
            level: levelActive ? alertLevels[id] : null
          };
        });
        const unit = source(item.widget.sources[0])?.unit;
        return <BarChart title={item.widget.title} entries={entries} unit={unit} />;
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [item, data, clock, alertLevels, sources, mode]);

  const firingSources = item.widget.sources.filter((id) => alertLevels[id]);
  const highest = firingSources.some((id) => alertLevels[id] === 'critical')
    ? 'critical'
    : firingSources.length
      ? 'warning'
      : null;

  return (
    <div className={`panel ${highest && mode === 'live' ? `panel-${highest}` : ''}`}>
      {highest && mode === 'live' && (
        <span className={`panel-badge panel-badge-${highest}`}>
          {highest === 'critical' ? '严重' : '警告'}
        </span>
      )}
      {panel}
    </div>
  );
}
