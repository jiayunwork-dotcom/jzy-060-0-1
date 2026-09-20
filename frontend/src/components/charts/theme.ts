import type { AlertLevel } from '../../types';

/** Shared visual language across all chart types. */
export const PALETTE = {
  normal: '#3fa9f5',
  secondary: '#5ac8a0',
  warning: '#f5a623',
  critical: '#e5484d',
  axis: '#8a93a6',
  split: 'rgba(255,255,255,0.08)',
  text: '#cdd3e0',
  areaTop: 'rgba(63,169,245,0.28)',
  areaBottom: 'rgba(63,169,245,0.02)'
};

export function colorForLevel(level: AlertLevel | null | undefined): string | null {
  if (level === 'critical') return PALETTE.critical;
  if (level === 'warning') return PALETTE.warning;
  return null;
}

export const SERIES_COLORS = [
  '#3fa9f5',
  '#5ac8a0',
  '#b48cf0',
  '#f5a623',
  '#ef6f9e',
  '#4cc3d9',
  '#9bd35c'
];

export const baseTextStyle = { color: PALETTE.text, fontSize: 11 };

export const baseGrid = { top: 34, left: 48, right: 16, bottom: 28 };
