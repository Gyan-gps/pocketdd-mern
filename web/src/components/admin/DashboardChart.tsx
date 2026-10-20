'use client';

import {
  BarController,
  BarElement,
  CategoryScale,
  Chart as ChartJS,
  Legend,
  LinearScale,
  LineController,
  LineElement,
  PointElement,
  Tooltip,
} from 'chart.js';
import { Chart } from 'react-chartjs-2';

ChartJS.register(BarController, BarElement, LineController, LineElement, PointElement, CategoryScale, LinearScale, Legend, Tooltip);

export interface ChartDataset {
  borderWidth?: number;
  borderColor: string;
  backgroundColor: string;
  data: number[];
  label: string;
  type: string;
}

/**
 * The consoletvs/charts (Chart.js) widgets from dashboard.blade.php. Datasets come from the API exactly as
 * the Laravel chart controllers build them. The base chart is a bar chart, as consoletvs renders it; a
 * `pie` dataset therefore draws on the same axes.
 */
export function DashboardChart({ labels, datasets }: { labels: string[]; datasets: ChartDataset[] }) {
  return (
    <div className="relative h-[400px]">
      <Chart
        type="bar"
        data={{
          labels,
          datasets: datasets.map((d) => ({
            ...d,
            type: d.type === 'line' ? ('line' as const) : ('bar' as const),
            borderWidth: d.borderWidth ?? 2,
            ...(d.type === 'line' ? { tension: 0, pointRadius: 3, fill: false } : {}),
          })),
        }}
        options={{
          maintainAspectRatio: false,
          plugins: { legend: { position: 'top', labels: { boxWidth: 40, color: '#666' } } },
          scales: {
            x: { grid: { color: 'rgba(0,0,0,0.1)' }, ticks: { color: '#666' } },
            y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.1)' }, ticks: { color: '#666' } },
          },
        }}
      />
    </div>
  );
}
