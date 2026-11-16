/**
 * Real figures from our own Google Search Console and Google Analytics, from the dashboard CSV exports.
 * Daily series are the exported values divided by the axis maximum. Headline stats are as shown in Google.
 * To refresh: export again (Search Console "Chart.csv", GA4 exploration CSV) and regenerate these arrays.
 */
export interface ProofSeries {
  label: string;
  color: string;
  /** y-axis tick labels, bottom to top */
  ticks: string[];
  /** daily values as a fraction (0 to 1) of the axis maximum */
  values: number[];
}

export interface ProofView {
  key: 'gsc90' | 'gsc28' | 'ga28';
  source: 'gsc' | 'ga';
  range: { en: string; es: string };
  stats: Array<{ label: string; value: string }>;
  series: ProofSeries[];
  /** x-axis labels positioned at a data index */
  xTicks: Array<{ i: number; label: string }>;
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
      { label: 'Impressions', color: '#5E35B1', ticks: ['0', '3k', '6k', '9k'], values: [0.101,0.1246,0.1139,0.1588,0.1768,0.1934,0.1982,0.2416,0.3054,0.3654,0.4697,0.5748,0.543,0.6039,0.5533,0.5127,0.475,0.529,0.4176,0.4077,0.4346,0.4884,0.4922,0.5362,0.6251,0.6598,0.7057,0.6988,0.64,0.6237,0.5103,0.6068,0.7209,0.7136,0.7793,0.7216,0.61,0.5808,0.6496,0.7576,0.7386,0.6039,0.3708,0.2951,0.2806,0.3331,0.5451,0.397,0.2772,0.2866,0.3024,0.3431,0.4074,0.5708,0.6032,0.6406,0.6557,0.4992,0.46,0.6057,0.7009,0.6392,0.6736,0.6577,0.5924,0.5786,0.6449,0.7129,0.6528,0.56,0.5137,0.4629,0.3954,0.5226,0.6092,0.5766,0.4642,0.4637,0.4694,0.3761,0.4712,0.622,0.8528,0.9672,0.9376,0.8549,0.701,0.7393,0.886] },
      { label: 'Clicks', color: '#1A73E8', ticks: ['0', '80', '160', '240'], values: [0.1625,0.1542,0.0917,0.2,0.2,0.1958,0.2333,0.2333,0.2625,0.3042,0.4125,0.5208,0.5375,0.5333,0.5083,0.3917,0.4208,0.4417,0.3417,0.25,0.3875,0.4792,0.425,0.375,0.4958,0.6208,0.6125,0.5042,0.5125,0.4625,0.3417,0.3833,0.5167,0.4958,0.5042,0.5417,0.4917,0.4875,0.5125,0.7458,0.6208,0.4458,0.3208,0.3042,0.3708,0.3167,0.4167,0.3625,0.3,0.2958,0.3208,0.2875,0.3542,0.5375,0.4417,0.5458,0.5333,0.4458,0.475,0.6,0.7333,0.7417,0.6875,0.8333,0.575,0.5708,0.7042,0.6542,0.6208,0.55,0.45,0.4542,0.3542,0.4875,0.5,0.5667,0.4208,0.4667,0.525,0.2833,0.3833,0.5125,0.7667,0.8917,0.9875,0.825,0.7,0.7667,0.8333] },
    ],
    xTicks: [{"i":0,"label":"4 Jun"},{"i":13,"label":"17 Jun"},{"i":25,"label":"29 Jun"},{"i":38,"label":"12 Jul"},{"i":50,"label":"24 Jul"},{"i":63,"label":"6 Aug"},{"i":75,"label":"18 Aug"},{"i":88,"label":"31 Aug"}],
  },
  {
    key: 'gsc28',
    source: 'gsc',
    range: { en: '18 Oct to 14 Nov 2026', es: '18 oct a 14 nov 2026' },
    stats: [
      { label: 'Total impressions', value: '149k' },
      { label: 'Total clicks', value: '3.21k' },
      { label: 'Average CTR', value: '2.2%' },
      { label: 'Average position', value: '11.1' },
    ],
    series: [
      { label: 'Impressions', color: '#5E35B1', ticks: ['0', '3k', '6k', '9k'], values: [0.4573,0.5122,0.492,0.5782,0.5037,0.4599,0.3421,0.3796,0.5451,0.5758,0.5747,0.5904,0.5104,0.4104,0.6009,0.6542,0.5487,0.509,0.6528,0.633,0.6024,0.6678,0.7764,0.6949,0.7342,0.8014,0.816,0.9002] },
      { label: 'Clicks', color: '#1A73E8', ticks: ['0', '75', '150', '225'], values: [0.5289,0.48,0.48,0.4489,0.5911,0.4267,0.3911,0.3689,0.64,0.5778,0.4667,0.52,0.4756,0.4044,0.4756,0.5067,0.52,0.5333,0.4844,0.4978,0.4222,0.3956,0.5422,0.4044,0.4133,0.6978,0.6844,0.8889] },
    ],
    xTicks: [{"i":0,"label":"18 Oct"},{"i":5,"label":"23 Oct"},{"i":11,"label":"29 Oct"},{"i":16,"label":"3 Nov"},{"i":22,"label":"9 Nov"},{"i":27,"label":"14 Nov"}],
  },
  {
    key: 'ga28',
    source: 'ga',
    range: { en: '20 Oct to 16 Nov 2026', es: '20 oct a 16 nov 2026' },
    stats: [
      { label: 'Active users', value: '7.0k' },
      { label: 'Views', value: '21k' },
      { label: 'Sessions', value: '9.7k' },
      { label: 'New users', value: '6.7k' },
    ],
    series: [{ label: 'Active users', color: '#1A73E8', ticks: ['0', '200', '400', '600'], values: [0.43,0.39,0.5067,0.3667,0.2917,0.3633,0.5317,0.455,0.4067,0.4183,0.4767,0.3983,0.4333,0.4117,0.4933,0.8983,0.4983,0.4083,0.4033,0.4133,0.4983,0.4267,0.4683,0.4983,0.77,0.51,0.5583] }],
    xTicks: [{"i":0,"label":"20 Oct"},{"i":9,"label":"29 Oct"},{"i":17,"label":"6 Nov"},{"i":26,"label":"15 Nov"}],
  },
];
