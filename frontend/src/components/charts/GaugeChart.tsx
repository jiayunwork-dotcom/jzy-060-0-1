import { useMemo } from 'react';
import type { EChartsOption } from 'echarts';
import type { AlertLevel } from '../../types';
import { useECharts } from './useECharts';
import { PALETTE, colorForLevel } from './theme';

interface Props {
  title: string;
  value: number;
  min?: number;
  max?: number;
  unit?: string;
  level?: AlertLevel | null;
  height?: number | string;
}

/**
 * Circular dial for the instantaneous value of one metric. The arc turns
 * amber / red when a warning / critical alert is firing on the source.
 */
export default function GaugeChart({
  title,
  value,
  min = 0,
  max = 100,
  unit,
  level,
  height = '100%'
}: Props) {
  const color = colorForLevel(level) ?? PALETTE.normal;
  const option = useMemo<EChartsOption>(() => ({
    backgroundColor: 'transparent',
    title: {
      text: title,
      left: 'center',
      top: 4,
      textStyle: { color: PALETTE.text, fontSize: 13, fontWeight: 500 }
    },
    series: [
      {
        type: 'gauge',
        min,
        max,
        startAngle: 210,
        endAngle: -30,
        radius: '88%',
        center: ['50%', '60%'],
        progress: {
          show: true,
          width: 14,
          roundCap: true,
          itemStyle: { color }
        },
        axisLine: {
          lineStyle: { width: 14, color: [[1, 'rgba(255,255,255,0.08)']] }
        },
        axisTick: { show: false },
        splitLine: {
          length: 8,
          lineStyle: { color: 'rgba(255,255,255,0.25)', width: 1 }
        },
        axisLabel: { color: PALETTE.axis, fontSize: 9, distance: 14 },
        pointer: {
          itemStyle: { color },
          length: '62%',
          width: 4
        },
        anchor: { show: true, size: 10, itemStyle: { color } },
        detail: {
          valueAnimation: true,
          offsetCenter: [0, '32%'],
          formatter: (v: number) =>
            `${Number(v).toFixed(1)}${unit === 'percent' ? '%' : ''}`,
          color,
          fontSize: 22,
          fontWeight: 600
        },
        data: [{ value }]
      }
    ]
  }), [title, value, min, max, unit, color]);

  const ref = useECharts(option);
  return <div ref={ref} style={{ width: '100%', height }} />;
}
