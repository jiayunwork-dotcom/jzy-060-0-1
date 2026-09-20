import { useEffect, useMemo, useState } from 'react';
import { Responsive, WidthProvider, type Layout } from 'react-grid-layout';
import { api } from '../api/client';
import { useDashboard } from '../store/dashboardStore';
import { DEFAULT_LAYOUT } from '../defaultLayout';
import type { LayoutItem, WidgetKind } from '../types';
import WidgetPanel from '../components/WidgetPanel';
import AlertRulesPanel from '../components/AlertRulesPanel';
import ActiveAlertsBar from '../components/ActiveAlertsBar';
import ReplayPlayer from '../components/ReplayPlayer';

const GridLayout = WidthProvider(Responsive);
const COLS = 12;

/**
 * Main live board: draggable / resizable widget tiles. Edits are autosaved
 * to the backend (persisted in the container storage); first visit gets the
 * default board and "恢复默认布局" resets it.
 */
export default function DashboardPage() {
  const layoutItems = useDashboard((s) => s.layout);
  const setLayout = useDashboard((s) => s.setLayout);
  const mode = useDashboard((s) => s.mode);
  const [editMode, setEditMode] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showRules, setShowRules] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .getLayout()
      .then((saved) => {
        if (cancelled) return;
        setLayout(Array.isArray(saved) && saved.length ? saved : DEFAULT_LAYOUT);
      })
      .catch(() => setLayout(DEFAULT_LAYOUT))
      .finally(() => setLoaded(true));
    return () => {
      cancelled = true;
    };
  }, [setLayout]);

  const rglLayout: Layout[] = useMemo(
    () =>
      (layoutItems ?? []).map((it) => ({
        i: it.i,
        x: it.x,
        y: it.y,
        w: it.w,
        h: it.h,
        minW: 2,
        minH: 4
      })),
    [layoutItems]
  );

  const save = async (items: LayoutItem[]) => {
    setLayout(items);
    try {
      await api.saveLayout(items);
    } catch (e) {
      console.error('保存布局失败', e);
    }
  };

  const onLayoutChange = (next: Layout[]) => {
    if (!layoutItems || !editMode) return;
    const byId = new Map(next.map((n) => [n.i, n]));
    const merged = layoutItems.map((it) => {
      const n = byId.get(it.i);
      return n ? { ...it, x: n.x, y: n.y, w: n.w, h: n.h } : it;
    });
    void save(merged);
  };

  const removeWidget = (id: string) => {
    void save((layoutItems ?? []).filter((it) => it.i !== id));
  };

  const reset = async () => {
    await api.saveLayout(DEFAULT_LAYOUT);
    setLayout(DEFAULT_LAYOUT);
  };

  const addWidget = async (spec: LayoutItem['widget']) => {
    const id = `${spec.kind}:${spec.sources.join('-')}-${Date.now().toString(36)}`;
    const maxY = (layoutItems ?? []).reduce((m, it) => Math.max(m, it.y + it.h), 0);
    const item: LayoutItem = {
      i: id,
      x: 0,
      y: maxY,
      w: spec.kind === 'gauge' ? 3 : 6,
      h: spec.kind === 'gauge' ? 5 : 7,
      widget: spec
    };
    await save([...(layoutItems ?? []), item]);
    setShowAdd(false);
  };

  if (!loaded) return <div className="page">加载布局中…</div>;

  return (
    <div className="page">
      <div className="board-toolbar">
        <ActiveAlertsBar />
        <div className="toolbar-actions">
          <button
            className={`btn ${editMode ? 'btn-primary' : ''}`}
            onClick={() => setEditMode((v) => !v)}
          >
            {editMode ? '完成布局' : '编辑布局'}
          </button>
          {editMode && (
            <>
              <button className="btn" onClick={() => setShowAdd(true)}>＋ 添加图表</button>
              <button className="btn" onClick={reset}>恢复默认</button>
            </>
          )}
          <button className="btn" onClick={() => setShowRules((v) => !v)}>
            告警规则
          </button>
        </div>
      </div>

      <ReplayPlayer />

      {mode === 'replay' && <div className="mode-banner">● 历史回放中</div>}

      {showRules && (
        <div className="rules-dock">
          <AlertRulesPanel />
        </div>
      )}

      <GridLayout
        className="layout"
        layouts={{ lg: rglLayout }}
        cols={{ lg: COLS, md: COLS, sm: 1, xs: 1, xxs: 1 }}
        rowHeight={34}
        margin={[14, 14]}
        isDraggable={editMode}
        isResizable={editMode}
        draggableHandle=".panel-drag"
        onLayoutChange={onLayoutChange}
      >
        {(layoutItems ?? []).map((it) => (
          <div key={it.i} className="tile">
            {editMode && <div className="panel-drag" title="拖动移动">⠿</div>}
            {editMode && (
              <button className="tile-remove" onClick={() => removeWidget(it.i)} title="移除">
                ×
              </button>
            )}
            <WidgetPanel item={it} />
          </div>
        ))}
      </GridLayout>

      {showAdd && <AddWidgetDialog onClose={() => setShowAdd(false)} onAdd={addWidget} />}
    </div>
  );
}

function AddWidgetDialog({
  onClose,
  onAdd
}: {
  onClose: () => void;
  onAdd: (spec: LayoutItem['widget']) => void;
}) {
  const sources = useDashboard((s) => s.sources);
  const [kind, setKind] = useState<WidgetKind>('line');
  const [picked, setPicked] = useState<string[]>(['cpu']);
  const [title, setTitle] = useState('');

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h4>添加图表</h4>
        <label className="form-row">
          <span>类型</span>
          <select value={kind} onChange={(e) => setKind(e.target.value as WidgetKind)}>
            <option value="line">折线图（趋势）</option>
            <option value="gauge">仪表盘（瞬时值）</option>
            <option value="bar">柱状图（横向对比）</option>
          </select>
        </label>
        <div className="form-row column">
          <span>指标 {kind === 'gauge' ? '（单选）' : '（可多选）'}</span>
          <div className="replay-sources">
            {sources.map((s) => (
              <button
                key={s.id}
                type="button"
                className={`chip-toggle ${picked.includes(s.id) ? 'chip-on' : ''}`}
                onClick={() =>
                  setPicked((cur) =>
                    kind === 'gauge'
                      ? [s.id]
                      : cur.includes(s.id)
                        ? cur.filter((x) => x !== s.id)
                        : [...cur, s.id]
                  )
                }
              >
                {s.name}
              </button>
            ))}
          </div>
        </div>
        <label className="form-row">
          <span>标题</span>
          <input
            value={title}
            placeholder="留空使用自动标题"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <div className="modal-actions">
          <button className="btn" onClick={onClose}>取消</button>
          <button
            className="btn btn-primary"
            disabled={!picked.length}
            onClick={() => {
              const names = picked.map(
                (id) => sources.find((s) => s.id === id)?.name ?? id
              );
              onAdd({
                kind,
                sources: picked,
                title:
                  title ||
                  (kind === 'gauge'
                    ? names[0]
                    : kind === 'bar'
                      ? '指标对比'
                      : '指标趋势')
              });
            }}
          >
            添加
          </button>
        </div>
      </div>
    </div>
  );
}
