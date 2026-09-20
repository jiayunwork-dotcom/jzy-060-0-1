/** @type {SourceDef[]} */
export const SOURCE_DEFS = [
  // ---- System metrics ----
  { id: 'cpu', name: 'CPU 使用率', kind: 'system', unit: 'percent', min: 0, max: 100 },
  { id: 'memory', name: '内存占用', kind: 'system', unit: 'percent', min: 0, max: 100 },
  { id: 'network', name: '网络吞吐 (MB/s)', kind: 'system', unit: 'number', min: 0, max: 125 },
  // ---- Business metrics ----
  { id: 'rps', name: '每秒请求数', kind: 'business', unit: 'number', min: 0, max: 6000 },
  { id: 'online', name: '在线人数', kind: 'business', unit: 'number', min: 0, max: 20000 },
  { id: 'errorRate', name: '错误率 (%)', kind: 'business', unit: 'percent', min: 0, max: 100 }
];

/**
 * Seed alert rules: two levels per major metric so a fresh dashboard already
 * demonstrates warning vs. critical distinctions.
 */
export const DEFAULT_RULES = [
  { id: 'cpu-warning', source: 'cpu', name: 'CPU 偏高', operator: '>', threshold: 70, level: 'warning', enabled: true },
  { id: 'cpu-critical', source: 'cpu', name: 'CPU 严重过载', operator: '>', threshold: 85, level: 'critical', enabled: true },
  { id: 'memory-warning', source: 'memory', name: '内存偏高', operator: '>', threshold: 75, level: 'warning', enabled: true },
  { id: 'memory-critical', source: 'memory', name: '内存严重不足', operator: '>', threshold: 90, level: 'critical', enabled: true },
  { id: 'error-warning', source: 'errorRate', name: '错误率偏高', operator: '>', threshold: 5, level: 'warning', enabled: true },
  { id: 'error-critical', source: 'errorRate', name: '错误率严重', operator: '>', threshold: 10, level: 'critical', enabled: true }
];
