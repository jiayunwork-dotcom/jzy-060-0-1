import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { AlertLevel } from '../../types';
import { useECharts } from './useECharts';
import { PALETTE, SERIES_COLORS, baseTextStyle } from './theme';

export interface BarEntry {
  name: string;
  value: number;
  level?: AlertLevel | null;
}

interface Props {
  title: string;
  entries: BarEntry[];
  unit?: string;
  height?: number | string;
}

/**
 * Horizontal comparison across metrics / services: one bar per source,
 * colored per its current alert level, plain palette color otherwise.
 */
export default function BarChart({ title, entries, unit, height = '100%' }: Props) {
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    title: { text: title, left: 10, top: 6, textStyle: { ...baseTextStyle, fontSize: 13 } },
    tooltip: {
      backgroundColor: 'rgba(20,26,38,0.92)',
      borderColor: 'rgba(255,255,255,0.12)',
      textStyle: { color: PALETTE.text },
      valueFormatter: (v) => `${v}${unit === 'percent' ? '%' : ''}`
    },
    grid: { top: 38, left: 88, right: 28, bottom: 16 },
    xAxis: {
      type: 'value',
      axisLabel: { color: PALETTE.axis },
      splitLine: { lineStyle: { color: PALETTE.split } }
    },
    yAxis: {
      type: 'category',
      data: entries.map((e) => e.name),
      axisLabel: { color: PALETTE.text },
      axisLine: { lineStyle: { color: PALETTE.axis } }
    },
    series: [
      {
        type: 'bar',
        barMaxWidth: 18,
        itemStyle: {
          borderRadius: [0, 4, 4, 0],
          color: (params) => {
            const e = entries[params.dataIndex];
            if (e.level === 'critical') return PALETTE.critical;
            if (e.level === 'warning') return PALETTE.warning;
            return SERIES_COLORS[params.dataIndex % SERIES_COLORS.length];
          }
        },
        label: {
          show: true,
          position: 'right',
          color: PALETTE.text,
          formatter: (p) =>
            `${p.value}${unit === 'percent' ? '%' : ''}`
        },
        data: entries.map((e) => e.value)
      }
    ]
  }), [title, entries, unit]);

  const ref = useECharts(option);
  return <div ref={ref} style={{ width: '100%', height }} />;
}
