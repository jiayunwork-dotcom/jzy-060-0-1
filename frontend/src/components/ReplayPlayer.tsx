import { useEffect, useRef, useState } from 'react';
import { api } from '../api/client';
import { useDashboard } from '../store/dashboardStore';

/**
 * Historical replay "VCR". Loads the genuinely archived points for a chosen
 * range from /api/history, then plays them back on a virtual clock:
 *   - play / pause,
 *   - 1x / 2x / 5x speed,
 *   - scrubbing timeline.
 * The dashboard charts read replaySeries + replayClock while mode='replay'.
 */
export default function ReplayPlayer() {
  const sources = useDashboard((s) => s.sources);
  const enterReplay = useDashboard((s) => s.enterReplay);
  const exitReplay = useDashboard((s) => s.exitReplay);
  const setReplayClock = useDashboard((s) => s.setReplayClock);

  const [from, setFrom] = useState(() => Date.now() - 10 * 60_000);
  const [to, setTo] = useState(() => Date.now());
  const [selected, setSelected] = useState<string[]>(['cpu', 'memory', 'network', 'rps']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [bounds, setBounds] = useState<[number, number] | null>(null);

  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [clock, setClock] = useState<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastRealRef = useRef<{ real: number; virt: number } | null>(null);

  const toggleSource = (id: string) =>
    setSelected((cur) => (cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id]));

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.history(from, to, selected);
      enterReplay(res.series);
      const first = from;
      setBounds([first, to]);
      setClock(first);
      setReplayClock(first);
      setPlaying(false);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  // Playback loop: virtual time advances speed x faster than wall time.
  useEffect(() => {
    if (!playing || !bounds) return;
    lastRealRef.current = { real: performance.now(), virt: clock ?? bounds[0] };

    const step = (realNow: number) => {
      const last = lastRealRef.current!;
      const nextVirt = last.virt + (realNow - last.real) * speed;
      if (nextVirt >= bounds[1]) {
        setClock(bounds[1]);
        setReplayClock(bounds[1]);
        setPlaying(false);
        return;
      }
      setClock(nextVirt);
      setReplayClock(nextVirt);
      lastRealRef.current = { real: realNow, virt: nextVirt };
      rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // clock intentionally excluded: the loop tracks it via refs
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, speed, bounds]);

  const stop = () => {
    setPlaying(false);
    exitReplay();
    setBounds(null);
    setClock(null);
  };

  const fmt = (ts: number) =>
    new Date(ts).toLocaleString('zh-CN', { hour12: false });

  const progress = bounds && clock != null
    ? Math.min(100, ((clock - bounds[0]) / (bounds[1] - bounds[0])) * 100)
    : 0;

  return (
    <div className="replay">
      <div className="replay-controls">
        <label className="replay-field">
          <span>开始</span>
          <input
            type="datetime-local"
            value={toLocalInput(from)}
            onChange={(e) => setFrom(fromLocalInput(e.target.value, from))}
            disabled={Boolean(bounds)}
          />
        </label>
        <label className="replay-field">
          <span>结束</span>
          <input
            type="datetime-local"
            value={toLocalInput(to)}
            onChange={(e) => setTo(fromLocalInput(e.target.value, to))}
            disabled={Boolean(bounds)}
          />
        </label>
        <div className="replay-sources">
          {sources.map((s) => (
            <button
              key={s.id}
              type="button"
              disabled={Boolean(bounds)}
              className={`chip-toggle ${selected.includes(s.id) ? 'chip-on' : ''}`}
              onClick={() => toggleSource(s.id)}
            >
              {s.name}
            </button>
          ))}
        </div>
        {!bounds ? (
          <button className="btn btn-primary" disabled={loading || from >= to} onClick={load}>
            {loading ? '加载归档…' : '加载并回放'}
          </button>
        ) : (
          <div className="player">
            <button className="btn" onClick={() => setPlaying((p) => !p)}>
              {playing ? '⏸ 暂停' : '▶ 播放'}
            </button>
            <div className="speed-group">
              {[1, 2, 5].map((sp) => (
                <button
                  key={sp}
                  className={`btn btn-small ${speed === sp ? 'btn-primary' : ''}`}
                  onClick={() => setSpeed(sp)}
                >
                  {sp}x
                </button>
              ))}
            </div>
            <input
              className="scrub"
              type="range"
              min={bounds[0]}
              max={bounds[1]}
              step={100}
              value={clock ?? bounds[0]}
              onChange={(e) => {
                const v = Number(e.target.value);
                setClock(v);
                setReplayClock(v);
                setPlaying(false);
              }}
            />
            <span className="replay-clock">{clock != null ? fmt(clock) : '--'}</span>
            <span className="replay-progress">{progress.toFixed(0)}%</span>
            <button className="btn btn-danger" onClick={stop}>⏹ 退出回放</button>
          </div>
        )}
      </div>
      {error && <div className="form-error">{error}</div>}
      {bounds && (
        <div className="replay-hint">
          回放模式：图表只显示所选区间内后端真实归档的点（{fmt(bounds[0])} ~ {fmt(bounds[1])}），
          实时推送已暂停显示。
        </div>
      )}
    </div>
  );
}

function toLocalInput(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromLocalInput(value: string, fallback: number): number {
  const t = new Date(value).getTime();
  return Number.isFinite(t) ? t : fallback;
}
