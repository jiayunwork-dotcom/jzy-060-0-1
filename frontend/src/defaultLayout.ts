import type { LayoutItem } from './types';

/**
 * Default board shown on first visit (or after a reset). Twelve columns;
 * tiles are free to drag / resize afterwards, and the result is saved back
 * to /api/layout.
 */
export const DEFAULT_LAYOUT: LayoutItem[] = [
  // ---- gauges: instantaneous values (top row) ----
  {
    i: 'gauge:cpu', x: 0, y: 0, w: 3, h: 5,
    widget: { kind: 'gauge', title: 'CPU 使用率', sources: ['cpu'] }
  },
  {
    i: 'gauge:memory', x: 3, y: 0, w: 3, h: 5,
    widget: { kind: 'gauge', title: '内存占用', sources: ['memory'] }
  },
  {
    i: 'gauge:errorRate', x: 6, y: 0, w: 3, h: 5,
    widget: { kind: 'gauge', title: '错误率', sources: ['errorRate'] }
  },
  {
    i: 'gauge:online', x: 9, y: 0, w: 3, h: 5,
    widget: { kind: 'gauge', title: '在线人数', sources: ['online'] }
  },
  // ---- trends: last 5 minutes ----
  {
    i: 'line:system', x: 0, y: 5, w: 6, h: 7,
    widget: { kind: 'line', title: '系统指标趋势（近 5 分钟）', sources: ['cpu', 'memory'] }
  },
  {
    i: 'line:traffic', x: 6, y: 5, w: 6, h: 7,
    widget: { kind: 'line', title: '网络吞吐 / 请求量', sources: ['network', 'rps'] }
  },
  // ---- cross-source comparison ----
  {
    i: 'bar:system', x: 0, y: 12, w: 6, h: 7,
    widget: { kind: 'bar', title: '系统指标横向对比（%）', sources: ['cpu', 'memory', 'errorRate'] }
  },
  {
    i: 'bar:business', x: 6, y: 12, w: 6, h: 7,
    widget: { kind: 'bar', title: '业务指标当前值', sources: ['rps', 'online', 'network'] }
  }
];
