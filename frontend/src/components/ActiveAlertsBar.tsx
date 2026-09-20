import { useDashboard } from '../store/dashboardStore';

/** Compact live list of currently firing alerts (both levels). */
export default function ActiveAlertsBar() {
  const alerts = useDashboard((s) => s.activeAlerts);
  const sources = useDashboard((s) => s.sources);
  const nameOf = (id: string) => sources.find((s) => s.id === id)?.name ?? id;

  return (
    <div className="active-alerts">
      {alerts.length === 0 ? (
        <span className="all-clear">● 全部指标正常</span>
      ) : (
        alerts.map((a) => (
          <span key={a.ruleId} className={`active-chip chip-${a.level}`}>
            <span className={`chip-dot dot-${a.level}`} />
            {a.level === 'critical' ? '严重' : '警告'} · {nameOf(a.source)} · {a.ruleName}
            <span className="chip-value">
              {a.value}
              {sources.find((s) => s.id === a.source)?.unit === 'percent' ? '%' : ''}
            </span>
          </span>
        ))
      )}
    </div>
  );
}
