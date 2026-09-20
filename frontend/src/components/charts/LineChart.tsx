import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { AlertLevel, MetricPoint } from '../../types';
import { useECharts } from './useECharts';
import { PALETTE, SERIES_COLORS, baseGrid, baseTextStyle, colorForLevel } from './theme';

interface Props {
  title: string;
  /** one or more series; each entry is rendered as a line */
  series: { name: string; points: MetricPoint[]; level?: AlertLevel | null }[];
  unit?: string;
  /** in replay mode, only render points up to this virtual clock */
  clock?: number | null;
  /** expected y-axis range for percent metrics */
  min?: number;
  max?: number;
  height?: number | string;
}

/**
 * Trend view: smooth area line(s) over time, recolored to warning / critical
 * when an alert on that source is firing.
 */
export default function LineChart({ title, series, unit, clock, min, max, height = '100%' }: Props) {
  const option = useMemo<EChartsOption>(() => {
    const visible = series.map((s) => ({
      ...s,
      points: clock != null ? s.points.filter((p) => p.ts <= clock) : s.points
    }));
    return {
      backgroundColor: 'transparent',
      title: { text: title, left: 10, top: 6, textStyle: { ...baseTextStyle, fontSize: 13 } },
      tooltip: {
        trigger: 'axis',
        backgroundColor: 'rgba(20,26,38,0.92)',
        borderColor: 'rgba(255,255,255,0.12)',
        textStyle: { color: PALETTE.text },
        valueFormatter: (v) => `${v}${unit === 'percent' ? '%' : ''}`
      },
      legend: {
        top: 6,
        right: 10,
        textStyle: baseTextStyle,
        itemWidth: 12,
        itemHeight: 8
      },
      grid: baseGrid,
      xAxis: {
        type: 'time',
        axisLine: { lineStyle: { color: PALETTE.axis } },
        axisLabel: {
          color: PALETTE.axis,
          formatter: (v: number) =>
            new Date(v).toLocaleTimeString('zh-CN', { hour12: false })
        },
        splitLine: { show: false }
      },
      yAxis: {
        type: 'value',
        min: min ?? (unit === 'percent' ? 0 : undefined),
        max: max ?? (unit === 'percent' ? 100 : undefined),
        axisLabel: { color: PALETTE.axis },
        splitLine: { lineStyle: { color: PALETTE.split } }
      },
      series: visible.map((s, idx) => {
        const color = colorForLevel(s.level) ??
          (s.level ? undefined : SERIES_COLORS[idx % SERIES_COLORS.length]);
        return {
          name: s.name,
          type: 'line',
          showSymbol: false,
          smooth: 0.25,
          lineStyle: { color, width: 2 },
          itemStyle: { color },
          emphasis: { focus: 'series' },
          areaStyle: idx === 0
            ? {
                color: {
                  type: 'linear',
                  x: 0, y: 0, x2: 0, y2: 1,
                  colorStops: [
                    { offset: 0, color: s.level ? `${color}55` : PALETTE.areaTop },
                    { offset: 1, color: PALETTE.areaBottom }
                  ]
                }
              }
            : undefined,
          data: s.points.map((p) => [p.ts, p.value])
        };
      })
    };
  }, [title, series, unit, clock, min, max]);

  const ref = useECharts(option);
  return <div ref={ref} style={{ width: '100%', height }} />;
}
