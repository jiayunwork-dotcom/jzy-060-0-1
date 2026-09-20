import { promises as fs } from 'node:fs';
import { existsSync, createWriteStream } from 'node:fs';
import { join } from 'node:path';
import { EventEmitter } from 'node:events';

const POINT_LIMIT_PER_SERIES = 100_000;

/**
 * Rolling archive for metric data points.
 *
 * Every source gets:
 *   - an in-memory ring buffer (fast queries / replay reads),
 *   - an append-only JSONL log in DATA_DIR/series/<id>.jsonl (durable archive).
 *
 * Points older than the retention window (default 24h) are pruned on read
 * and on a periodic compaction that rewrites the log without expired lines.
 */
export class SeriesStore extends EventEmitter {
  /**
   * @param {string} dataDir
   * @param {number} retentionMs
   * @param {{ compactionIntervalMs?: number, now?: () => number }} [options]
   */
  constructor(dataDir, retentionMs, options = {}) {
    super();
    this.dataDir = dataDir;
    this.seriesDir = join(dataDir, 'series');
    this.retentionMs = retentionMs;
    this.now = options.now ?? (() => Date.now());
    /** @type {Map<string, MetricPoint[]>} */
    this._series = new Map();
    /** @type {Map<string, string[]>} lines awaiting append to disk */
    this._pending = new Map();
    /** Serialized disk-write chain (tail promise only). */
    this._tail = Promise.resolve();
    this._compactionTimer = setInterval(
      () => this.compactAll().catch(() => undefined),
      options.compactionIntervalMs ?? 60_000
    );
    this._compactionTimer.unref?.();
  }

  async init(sourceIds = []) {
    await fs.mkdir(this.seriesDir, { recursive: true });
    await Promise.all(sourceIds.map((id) => this._loadOne(id)));
  }

  async _loadOne(id) {
    this._series.set(id, []);
    const file = this._file(id);
    if (!existsSync(file)) return;
    const raw = await fs.readFile(file, 'utf8');
    /** @type {MetricPoint[]} */
    const points = [];
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        points.push(JSON.parse(line));
      } catch {
        /* tolerate a torn trailing line */
      }
    }
    points.sort((a, b) => a.ts - b.ts);
    this._series.set(id, this._prune(id, points));
  }

  _file(id) {
    return join(this.seriesDir, `${id}.jsonl`);
  }

  /**
   * Archive one point. Buffer trimming is synchronous so subsequent reads are
   * immediately consistent; the durable append happens asynchronously.
   */
  append(source, ts, value) {
    const series = this._series.get(source) ?? [];
    series.push({ source, ts, value });
    this._series.set(source, series);
    this._prune(source, series);

    const lines = this._pending.get(source) ?? [];
    lines.push(JSON.stringify({ source, ts, value }));
    this._pending.set(source, lines);
    this._scheduleFlush();
  }

  get latest() {
    return this._series;
  }

  getLast(source) {
    const s = this._series.get(source);
    return s && s.length ? s[s.length - 1] : null;
  }

  /** Read a slice from the real archive — never freshly generated points. */
  query(source, from, to = this.now()) {
    const series = this._prune(source, this._series.get(source) ?? []);
    return series.filter((p) => p.ts >= from && p.ts <= to);
  }

  /** Multi-source range read used by the replay endpoint. */
  queryRange(sourceIds, from, to) {
    /** @type {Record<string, MetricPoint[]>} */
    const result = {};
    for (const id of sourceIds) result[id] = this.query(id, from, to);
    return result;
  }

  /** Snapshot of the most recent points, pushed when a client connects. */
  recentSnapshot(sourceIds, windowMs) {
    const since = this.now() - windowMs;
    return this.queryRange(sourceIds, since, this.now());
  }

  /**
   * Drop points older than wallClock - retentionMs, in place. The window is
   * anchored to the current time (injectable for tests); points archived with
   * old timestamps are expired immediately even if they're the latest in the
   * series, which is exactly what "retain the last 24h" means.
   */
  _prune(source, points) {
    const cutoff = this.now() - this.retentionMs;
    let i = 0;
    while (i < points.length && points[i].ts < cutoff) i++;
    if (i > 0) points.splice(0, i);
    if (points.length > POINT_LIMIT_PER_SERIES) {
      points.splice(0, points.length - POINT_LIMIT_PER_SERIES);
    }
    return points;
  }

  _scheduleFlush() {
    if (this._flushScheduled) return;
    this._flushScheduled = true;
    const run = async () => {
      this._flushScheduled = false;
      const batch = this._pending;
      this._pending = new Map();
      for (const [source, lines] of batch) {
        await this._appendLines(source, lines);
      }
    };
    // Serialize flushes so logs are never interleaved / corrupted.
    this._tail = this._tail.then(run, run);
  }

  _appendLines(source, lines) {
    return new Promise((resolve) => {
      const stream = createWriteStream(this._file(source), { flags: 'a' });
      stream.on('error', () => {
        stream.destroy();
        resolve();
      });
      stream.end(`${lines.join('\n')}\n`, () => {
        // Wait for the descriptor to actually close so callers (shutdown +
        // temp-dir cleanup) never race a still-open file.
        stream.close(() => resolve());
      });
    });
  }

  /** Force every buffered line to disk (used by tests and on shutdown). */
  async flush() {
    await this._tail;
  }

  /** Rewrite every log without points outside the retention window. */
  async compactAll() {
    await this.flush();
    for (const id of [...this._series.keys()]) {
      const points = this._prune(id, this._series.get(id) ?? []);
      const tmp = `${this._file(id)}.tmp`;
      if (points.length === 0) {
        await fs.rm(this._file(id), { force: true });
        continue;
      }
      await fs.writeFile(tmp, points.map((p) => JSON.stringify(p)).join('\n') + '\n');
      await fs.rename(tmp, this._file(id));
    }
  }

  async close() {
    clearInterval(this._compactionTimer);
    await this.flush();
  }
}
