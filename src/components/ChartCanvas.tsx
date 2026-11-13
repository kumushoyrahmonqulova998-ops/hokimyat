import { useEffect, useRef } from 'react';
import {
  Chart,
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler,
  type ChartConfiguration,
} from 'chart.js';

Chart.register(
  BarController,
  BarElement,
  LineController,
  LineElement,
  PointElement,
  DoughnutController,
  ArcElement,
  CategoryScale,
  LinearScale,
  Tooltip,
  Legend,
  Filler
);

export interface ChartDatasetInput {
  label: string;
  data: number[];
  color: string;
  fill?: boolean;
}

interface ChartCanvasProps {
  type: 'line' | 'bar' | 'doughnut';
  labels: string[];
  datasets: ChartDatasetInput[];
  height?: number;
  sparkline?: boolean;
  dark?: boolean;
}

export function ChartCanvas({
  type,
  labels,
  datasets,
  height = 220,
  sparkline = false,
  dark = false,
}: ChartCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const chartRef = useRef<Chart | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (chartRef.current) {
      chartRef.current.destroy();
      chartRef.current = null;
    }

    const gridColor = dark ? 'rgba(148, 163, 184, 0.12)' : 'rgba(15, 23, 42, 0.07)';
    const textColor = dark ? '#94A3B8' : '#475569';

    const config: ChartConfiguration = {
      type,
      data: {
        labels,
        datasets: datasets.map((ds) => {
          if (type === 'doughnut') {
            return {
              label: ds.label,
              data: ds.data,
              backgroundColor: ['#0B1E3B', '#1D4ED8', '#16A34A', '#C59B27', '#DC2626'],
              borderWidth: 0,
            };
          }
          if (type === 'bar') {
            return {
              label: ds.label,
              data: ds.data,
              backgroundColor: ds.color,
              borderRadius: 4,
              maxBarThickness: 28,
            };
          }
          return {
            label: ds.label,
            data: ds.data,
            borderColor: ds.color,
            backgroundColor: ds.fill ? `${ds.color}20` : ds.color,
            fill: Boolean(ds.fill),
            tension: 0.25,
            borderWidth: sparkline ? 1.8 : 2.2,
            pointRadius: sparkline ? 0 : 3,
            pointHoverRadius: sparkline ? 3 : 5,
          };
        }),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 180 },
        plugins: {
          legend: {
            display: !sparkline && datasets.length > 0,
            position: 'bottom',
            labels: {
              color: textColor,
              boxWidth: 10,
              boxHeight: 10,
              padding: 14,
              font: { family: 'Public Sans, sans-serif', size: 11 },
            },
          },
          tooltip: {
            enabled: !sparkline,
          },
        },
        scales:
          type === 'doughnut'
            ? undefined
            : sparkline
              ? {
                  x: { display: false },
                  y: { display: false },
                }
              : {
                  x: {
                    grid: { display: false },
                    ticks: {
                      color: textColor,
                      font: { family: 'JetBrains Mono, monospace', size: 10 },
                    },
                  },
                  y: {
                    beginAtZero: true,
                    grid: { color: gridColor },
                    ticks: {
                      color: textColor,
                      font: { family: 'JetBrains Mono, monospace', size: 10 },
                    },
                  },
                },
      },
    };

    chartRef.current = new Chart(canvas, config);

    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, [type, labels, datasets, sparkline, dark]);

  return (
    <div style={{ height: `${height}px` }} className="w-full relative">
      <canvas ref={canvasRef} />
    </div>
  );
}
