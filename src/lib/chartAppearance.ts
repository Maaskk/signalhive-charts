export const CHART_TYPES = ['candles', 'bars', 'line', 'area'] as const;
export type ChartType = (typeof CHART_TYPES)[number];

export interface ChartAppearance {
  chartType: ChartType;
  background: string;
  text: string;
  gridColor: string;
  upColor: string;
  downColor: string;
  wickUpColor: string;
  wickDownColor: string;
  lineColor: string;
  areaTopColor: string;
  areaBottomColor: string;
  crosshairColor: string;
  borderVisible: boolean;
  fontSize: number;
}

export const DEFAULT_CHART_APPEARANCE: Readonly<ChartAppearance> = Object.freeze({
  chartType: 'candles',
  background: '#0b111c',
  text: '#8ba2bf',
  gridColor: '#172235',
  upColor: '#25c7a3',
  downColor: '#f16b7d',
  wickUpColor: '#25c7a3',
  wickDownColor: '#f16b7d',
  lineColor: '#65a6ff',
  areaTopColor: '#234c7d',
  areaBottomColor: '#0b111c',
  crosshairColor: '#6c85a8',
  borderVisible: false,
  fontSize: 12,
});

/** Accept only supported primitives from untrusted local storage or workspace JSON. */
export function parseChartAppearance(input: unknown): ChartAppearance {
  const result: ChartAppearance = { ...DEFAULT_CHART_APPEARANCE };
  if (!input || typeof input !== 'object' || Array.isArray(input)) return result;
  const record = input as Record<string, unknown>;
  if (CHART_TYPES.includes(record.chartType as ChartType)) {
    result.chartType = record.chartType as ChartType;
  }
  for (const key of Object.keys(DEFAULT_CHART_APPEARANCE) as (keyof ChartAppearance)[]) {
    const fallback = DEFAULT_CHART_APPEARANCE[key];
    const candidate = record[key];
    if (typeof fallback === 'string' && key !== 'chartType') {
      if (typeof candidate === 'string' && /^#[0-9a-f]{6}$/i.test(candidate)) {
        (result[key] as string) = candidate.toLowerCase();
      }
    }
  }
  if (typeof record.borderVisible === 'boolean') result.borderVisible = record.borderVisible;
  if (typeof record.fontSize === 'number' && Number.isFinite(record.fontSize)) {
    result.fontSize = Math.min(18, Math.max(10, Math.round(record.fontSize)));
  }
  return result;
}
