import { useState } from 'react';
import { api } from '../api/client';
import { useDashboard } from '../store/dashboardStore';
import type { AlertLevel, AlertRule } from '../types';

/**
 * Alert rule management: create / edit / delete rules, distinguish warning
 * vs critical, enable/disable individual rules. Threshold edits are sent to
 * the backend which immediately re-judges against the latest reading.
 */
export default function AlertRulesPanel() {
  const rules = useDashboard((s) => s.rules);
  const sources = useDashboard((s) => s.sources);
  const setRules = useDashboard((s) => s.setRules);
  const [editing, setEditing] = useState<AlertRule | null>(null);
  const [creating, setCreating] = useState(false);

  const nameOf = (id: string) => sources.find((s) => s.id === id)?.name ?? id;

  const remove = async (id: string) => {
    await api.deleteRule(id);
    setRules(await api.listRules());
  };

  const toggle = async (rule: AlertRule) => {
    await api.updateRule(rule.id, { enabled: !rule.enabled });
    setRules(await api.listRules());
  };

  return (
    <div className="rules-panel">
      <div className="rules-head">
        <h3>告警规则</h3>
        <button className="btn btn-primary" onClick={() => setCreating(true)}>
          新增规则
        </button>
      </div>
      <table className="rules-table">
        <thead>
          <tr>
            <th>级别</th>
            <th>名称</th>
            <th>指标</th>
            <th>条件</th>
            <th>阈值</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          {rules.map((r) => (
            <tr key={r.id} className={r.enabled ? '' : 'row-disabled'}>
              <td>
                <span className={`level-tag level-${r.level}`}>
                  {r.level === 'critical' ? '严重' : '警告'}
                </span>
              </td>
              <td>{r.name}</td>
              <td>{nameOf(r.source)}</td>
              <td className="mono">{r.operator}</td>
              <td className="mono">{r.threshold}</td>
              <td>
                <label className="switch">
                  <input type="checkbox" checked={r.enabled} onChange={() => toggle(r)} />
                  <span>{r.enabled ? '启用' : '停用'}</span>
                </label>
              </td>
              <td className="row-actions">
                <button className="btn btn-small" onClick={() => setEditing(r)}>编辑</button>
                <button className="btn btn-small btn-danger" onClick={() => remove(r.id)}>删除</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {(creating || editing) && (
        <RuleEditor
          rule={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={async () => {
            setRules(await api.listRules());
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </div>
  );
}

function RuleEditor({
  rule,
  onClose,
  onSaved
}: {
  rule: AlertRule | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const sources = useDashboard((s) => s.sources);
  const [form, setForm] = useState<Omit<AlertRule, 'id'>>({
    source: rule?.source ?? sources[0]?.id ?? 'cpu',
    name: rule?.name ?? '',
    operator: rule?.operator ?? '>',
    threshold: rule?.threshold ?? 80,
    level: rule?.level ?? 'warning',
    enabled: rule?.enabled ?? true
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      if (rule) await api.updateRule(rule.id, form);
      else await api.createRule(form);
      onSaved();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>{rule ? '编辑告警规则' : '新增告警规则'}</h4>
        <label className="form-row">
          <span>名称</span>
          <input
            value={form.name}
            placeholder="例如：CPU 过高"
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </label>
        <label className="form-row">
          <span>指标</span>
          <select
            value={form.source}
            onChange={(e) => setForm({ ...form, source: e.target.value })}
          >
            {sources.map((s) => (
              <option key={s.id} value={s.id}>{s.name}</option>
            ))}
          </select>
        </label>
        <div className="form-row-inline">
          <label className="form-row">
            <span>条件</span>
            <select
              value={form.operator}
              onChange={(e) =>
                setForm({ ...form, operator: e.target.value as AlertRule['operator'] })
              }
            >
              <option value="&gt;">大于 &gt;</option>
              <option value="&lt;">小于 &lt;</option>
            </select>
          </label>
          <label className="form-row">
            <span>阈值</span>
            <input
              type="number"
              value={form.threshold}
              onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })}
            />
          </label>
        </div>
        <label className="form-row">
          <span>级别</span>
          <div className="level-picker">
            {(['warning', 'critical'] as AlertLevel[]).map((lv) => (
              <button
                key={lv}
                type="button"
                className={`level-choice ${form.level === lv ? `level-choice-${lv} active` : ''}`}
                onClick={() => setForm({ ...form, level: lv })}
              >
                {lv === 'critical' ? '严重' : '警告'}
              </button>
            ))}
          </div>
        </label>
        <label className="form-row">
          <span>启用</span>
          <input
            type="checkbox"
            checked={form.enabled}
            onChange={(e) => setForm({ ...form, enabled: e.target.checked })}
          />
        </label>
        {error && <div className="form-error">{error}</div>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  );
}
