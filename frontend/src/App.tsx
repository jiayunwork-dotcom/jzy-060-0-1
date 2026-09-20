import { useEffect } from 'react';
import { NavLink, Route, Routes } from 'react-router-dom';
import DashboardPage from './pages/DashboardPage';
import SourcesPage from './pages/SourcesPage';
import AlertToasts from './components/AlertToasts';
import { useWebSocket } from './api/useWebSocket';
import { useDashboard } from './store/dashboardStore';

export default function App() {
  const applySnapshot = useDashboard((s) => s.applySnapshot);
  const addPoint = useDashboard((s) => s.addPoint);
  const setSources = useDashboard((s) => s.setSources);
  const setRules = useDashboard((s) => s.setRules);
  const fireAlert = useDashboard((s) => s.fireAlert);
  const resolveAlert = useDashboard((s) => s.resolveAlert);

  // Single server-push connection drives the whole UI.
  useWebSocket((msg) => {
    switch (msg.type) {
      case 'snapshot':
        applySnapshot({
          sources: msg.sources,
          points: msg.points,
          alerts: msg.alerts,
          rules: msg.rules
        });
        break;
      case 'point':
        addPoint(msg.point);
        break;
      case 'sources':
        setSources(msg.sources);
        break;
      case 'alert-rules':
        if (msg.rules) setRules(msg.rules);
        break;
      case 'alert-fired':
        if (msg.alert) fireAlert(msg.alert);
        break;
      case 'alert-resolved':
        if (msg.alert) resolveAlert(msg.alert.ruleId);
        break;
    }
  });

  // Browser title reflects whether any critical alert is firing.
  const criticalCount = useDashboard((s) =>
    s.activeAlerts.filter((a) => a.level === 'critical').length
  );
  useEffect(() => {
    document.title = criticalCount
      ? `【${criticalCount} 严重告警】实时运维监控仪表板`
      : '实时运维监控仪表板';
  }, [criticalCount]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="brand">📈 实时运维监控</div>
        <nav className="nav">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'nav-on' : '')}>
            仪表板
          </NavLink>
          <NavLink to="/sources" className={({ isActive }) => (isActive ? 'nav-on' : '')}>
            数据源
          </NavLink>
        </nav>
        <div className="header-sub">服务端推送 · 1s/次 · 24h 留档</div>
      </header>

      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/sources" element={<SourcesPage />} />
        </Routes>
      </main>

      <AlertToasts />
    </div>
  );
}
