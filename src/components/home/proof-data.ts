/**
 * Real figures from our own Google Search Console and Google Analytics (read off the dashboards).
 *
 * `stats` are exact. The `series` arrays are TRACED from the dashboard charts (0 to 1 of each axis maximum),
 * so the shapes are accurate but individual points are approximate. To make them exact, replace each array
 * with values from a CSV export divided by the axis maximum (`max`).
 */
export interface ProofSeries {
  label: string;
  color: string;
  max: number;
  /** y-axis tick labels, bottom to top */
  ticks: string[];
  values: number[];
  dashed?: boolean;
}

export interface ProofView {
  key: 'gsc90' | 'gsc28' | 'ga28';
  source: 'gsc' | 'ga';
  range: { en: string; es: string };
  stats: Array<{ label: string; value: string; delta?: string; deltaDir?: 'up' | 'down' }>;
  series: ProofSeries[];
  xLabels: string[];
}

export const PROOF_VIEWS: ProofView[] = [
  {
    key: 'gsc90',
    source: 'gsc',
    range: { en: '4 Jun to 31 Aug 2026', es: '4 jun a 31 ago 2026' },
    stats: [
      { label: 'Total impressions', value: '424k' },
      { label: 'Total clicks', value: '10.2k' },
      { label: 'Average CTR', value: '2.4%' },
      { label: 'Average position', value: '8.2' },
    ],
    series: [
      { label: 'Impressions', color: '#5E35B1', max: 9000, ticks: ['0', '3k', '6k', '9k'], values: [0.03, 0.1, 0.25, 0.56, 0.53, 0.4, 0.68, 0.66, 0.77, 0.62, 0.75, 0.28, 0.27, 0.4, 0.58, 0.7, 0.6, 0.62, 0.4, 0.45, 0.35, 0.96, 0.78] },
      { label: 'Clicks', color: '#1A73E8', max: 240, ticks: ['0', '80', '160', '240'], values: [0.14, 0.2, 0.2, 0.53, 0.5, 0.45, 0.58, 0.5, 0.52, 0.5, 0.74, 0.3, 0.29, 0.38, 0.52, 0.62, 0.58, 0.55, 0.36, 0.4, 0.3, 0.97, 0.82] },
    ],
    xLabels: ['4 Jun', '16 Jun', '28 Jun', '10 Jul', '22 Jul', '3 Aug', '15 Aug', '27 Aug'],
  },
  {
    key: 'gsc28',
    source: 'gsc',
    range: { en: '18 Oct to 13 Nov 2026', es: '18 oct a 13 nov 2026' },
    stats: [
      { label: 'Total impressions', value: '149k' },
      { label: 'Total clicks', value: '3.21k' },
      { label: 'Average CTR', value: '2.2%' },
      { label: 'Average position', value: '11.1' },
    ],
    series: [
      { label: 'Impressions', color: '#5E35B1', max: 9000, ticks: ['0', '3k', '6k', '9k'], values: [0.46, 0.5, 0.48, 0.35, 0.55, 0.57, 0.58, 0.4, 0.6, 0.65, 0.55, 0.65, 0.62, 0.68, 0.72, 0.78, 0.84, 0.9] },
      { label: 'Clicks', color: '#1A73E8', max: 225, ticks: ['0', '75', '150', '225'], values: [0.5, 0.46, 0.46, 0.42, 0.4, 0.34, 0.36, 0.55, 0.6, 0.5, 0.48, 0.44, 0.4, 0.38, 0.45, 0.4, 0.3, 0.55, 0.62, 0.6, 0.88] },
    ],
    xLabels: ['18 Oct', '22 Oct', '26 Oct', '30 Oct', '3 Nov', '7 Nov', '11 Nov'],
  },
  {
    key: 'ga28',
    source: 'ga',
    range: { en: 'Last 28 days, to 15 Nov 2026', es: 'Últimos 28 días, hasta el 15 nov 2026' },
    stats: [
      { label: 'Active users', value: '7.1k', delta: '6.7%', deltaDir: 'up' },
      { label: 'Views', value: '22k', delta: '1.3%', deltaDir: 'down' },
      { label: 'Sessions', value: '9.9k', delta: '0.4%', deltaDir: 'up' },
      { label: 'New users', value: '6.8k', delta: '6.7%', deltaDir: 'up' },
    ],
    series: [
      { label: 'Active users', color: '#1A73E8', max: 800, ticks: ['0', '200', '400', '600', '800'], values: [0.34, 0.35, 0.33, 0.4, 0.31, 0.25, 0.3, 0.43, 0.38, 0.34, 0.35, 0.39, 0.32, 0.35, 0.34, 0.4, 0.7, 0.4, 0.34, 0.33, 0.33, 0.4, 0.35, 0.39, 0.4, 0.61, 0.41, 0.44] },
    ],
    xLabels: ['25 Oct', '1 Nov', '8 Nov', '15 Nov'],
  },
];
