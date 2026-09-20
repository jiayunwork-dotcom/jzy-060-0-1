import { useState } from 'react';
import { api } from '../api/client';
import { useDashboard } from '../store/dashboardStore';
import type { SourceItem } from '../types';

/**
 * Central data source management: lists every source with kind/state/last
 * reading, toggles collection on/off and lets the operator force a source
 * into error / back to healthy (fault injection for drills).
 */
export default function SourcesPage() {
  const sources = useDashboard((s) => s.sources);
  const setSources = useDashboard((s) => s.setSources);
  const [busy, setBusy] = useState<string | null>(null);

  const toggle = async (src: SourceItem) => {
    setBusy(src.id);
    try {
      const r = await api.setEnabled(src.id, !src.enabled) as { source: SourceItem };
      setSources(sources.map((s) => (s.id === r.source.id ? r.source : s)));
    } finally {
      setBusy(null);
    }
  };

  const setStatus = async (src: SourceItem, status: 'ok' | 'error') => {
    setBusy(src.id);
    try {
      const r = await api.setStatus(
        src.id,
        status,
        status === 'error' ? '人工标记异常' : undefined
      ) as { source: SourceItem };
      setSources(sources.map((s) => (s.id === r.source.id ? r.source : s)));
    } finally {
      setBusy(null);
    }
  };

  const counts = {
    total: sources.length,
    enabled: sources.filter((s) => s.enabled).length,
    error: sources.filter((s) => s.status === 'error').length
  };

  return (
    <div className="page">
      <div className="page-head">
        <h2>数据源管理</h2>
        <div className="summary">
          <span>共 {counts.total} 路</span>
          <span className="summary-ok">采集中 {counts.enabled}</span>
          <span className={counts.error ? 'summary-err' : 'summary-ok'}>
            异常 {counts.error}
          </span>
        </div>
      </div>

      <table className="sources-table">
        <thead>
          <tr>
            <th>状态</th>
            <th>数据源</th>
            <th>类型</th>
            <th>采集开关</th>
            <th>最新值</th>
            <th>更新时间</th>
            <th>错误信息</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {sources.map((s) => (
            <tr key={s.id} className={s.status === 'error' ? 'row-error' : ''}>
              <td>
                <span className={`state-dot state-${s.status} ${s.enabled ? '' : 'state-off'}`} />
                {s.status === 'error' ? '异常' : s.enabled ? '正常' : '已关闭'}
              </td>
              <td>
                <div className="src-name">{s.name}</div>
                <div className="src-id mono">{s.id}</div>
              </td>
              <td>{s.kind === 'system' ? '系统指标' : '业务指标'}</td>
              <td>
                <label className="switch">
                  <input
                    type="checkbox"
                    checked={s.enabled}
                    disabled={busy === s.id}
                    onChange={() => toggle(s)}
                  />
                  <span>{s.enabled ? '开' : '关'}</span>
                </label>
              </td>
              <td className="mono">
                {s.lastAt == null ? '—' : `${s.lastValue}${s.unit === 'percent' ? '%' : ''}`}
              </td>
              <td className="mono">
                {s.lastAt ? new Date(s.lastAt).toLocaleTimeString('zh-CN', { hour12: false }) : '—'}
              </td>
              <td className={s.error ? 'error-text' : ''}>{s.error ?? '—'}</td>
              <td className="row-actions">
                {s.status === 'ok' ? (
                  <button
                    className="btn btn-small"
                    disabled={busy === s.id}
                    onClick={() => setStatus(s, 'error')}
                  >
                    模拟故障
                  </button>
                ) : (
                  <button
                    className="btn btn-small btn-primary"
                    disabled={busy === s.id}
                    onClick={() => setStatus(s, 'ok')}
                  >
                    恢复
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
