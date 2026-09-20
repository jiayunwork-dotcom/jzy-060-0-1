import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';

/**
 * Minimal React binding for an imperative ECharts instance: one chart per
 * component, re-rendered whenever `option` changes, auto-resized with its
 * container (the dashboard tiles get dragged/resized).
 */
export function useECharts(option: echarts.EChartsOption) {
  const ref = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;

    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, { notMerge: true });
  }, [option]);

  return ref;
}
