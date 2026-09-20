export type SourceKind = 'system' | 'business';
export type SourceUnit = 'percent' | 'number';
export type SourceState = 'ok' | 'error';
export type AlertLevel = 'warning' | 'critical';
export type AlertOperator = '>' | '<';

export interface SourceItem {
  id: string;
  name: string;
  kind: SourceKind;
  unit: SourceUnit;
  min?: number;
  max?: number;
  enabled: boolean;
  status: SourceState;
  lastValue: number;
  lastAt: number | null;
  error: string | null;
}

export interface MetricPoint {
  source: string;
  ts: number;
  value: number;
}

export type SeriesMap = Record<string, MetricPoint[]>;

export interface AlertRule {
  id: string;
  source: string;
  name: string;
  operator: AlertOperator;
  threshold: number;
  level: AlertLevel;
  enabled: boolean;
}

export interface ActiveAlert {
  ruleId: string;
  source: string;
  ruleName: string;
  level: AlertLevel;
  threshold: number;
  operator: AlertOperator;
  value: number;
  startedAt: number;
}

export interface AlertEvent {
  id: string;
  type: 'fired' | 'resolved';
  ruleId: string;
  source: string;
  ruleName: string;
  level: AlertLevel;
  threshold: number;
  operator: AlertOperator;
  value: number;
  at: number;
}

/** A draggable / resizable dashboard tile, as persisted server-side. */
export interface LayoutItem {
  i: string; // widget id, e.g. "line:cpu"
  x: number;
  y: number;
  w: number;
  h: number;
  widget: WidgetSpec;
}

export type WidgetKind = 'line' | 'gauge' | 'bar';

export interface WidgetSpec {
  kind: WidgetKind;
  title: string;
  /** sources shown in this widget */
  sources: string[];
}

export interface SnapshotMessage {
  type: 'snapshot';
  sources: SourceItem[];
  points: SeriesMap;
  alerts: ActiveAlert[];
  rules: AlertRule[];
}

export interface PointMessage {
  type: 'point';
  point: MetricPoint;
}

export interface SourcesMessage {
  type: 'sources';
  sources: SourceItem[];
}

export interface AlertMessage {
  type: 'alert-fired' | 'alert-resolved' | 'alert-rules';
  alert?: ActiveAlert & { at?: number };
  rules?: AlertRule[];
}

export type WsMessage =
  | SnapshotMessage
  | PointMessage
  | SourcesMessage
  | AlertMessage;
