import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import {
  AreaSeries,
  BarSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  HistogramSeries,
  LineSeries,
  LineStyle,
  createChart,
  type IChartApi,
  type IPriceLine,
  type LogicalRange,
  type Logical,
  type UTCTimestamp,
} from 'lightweight-charts';
import type { Candle, IndicatorSettings, Instrument, Projection } from '../types';
import { atr, bollinger, confirmedPivots, ema, macd, rsi, sma } from '../lib/indicators';
import { indexToTime, timeToIndex } from '../lib/chartTime';
import {
  DEFAULT_INDICATOR_CONFIG,
  type IndicatorConfig,
  type IndicatorLineWidth,
} from '../lib/indicatorConfig';
import { DEFAULT_CHART_APPEARANCE, type ChartAppearance } from '../lib/chartAppearance';

/** Related study lines share one calculation per candle array, without retaining old replay arrays. */
function cachedCalculation<T>(calculate: (data: Candle[]) => T): (data: Candle[]) => T {
  const cache = new WeakMap<Candle[], T>();
  return (data) => {
    let result = cache.get(data);
    if (result === undefined) {
      result = calculate(data);
      cache.set(data, result);
    }
    return result;
  };
}

interface Props {
  candles: Candle[];
  instrument: Instrument;
  indicators: IndicatorSettings;
  grid: boolean;
  config?: IndicatorConfig;
  appearance?: ChartAppearance;
  onProjection: (projection: Projection | null) => void;
  onHover: (candle: Candle | null) => void;
}
export interface ChartHandle {
  fit: () => void;
  zoom: (factor: number) => void;
  screenshot: () => Promise<void>;
}

export const Chart = forwardRef<ChartHandle, Props>(function Chart(
  {
    candles,
    instrument,
    indicators,
    grid,
    config = DEFAULT_INDICATOR_CONFIG,
    appearance = DEFAULT_CHART_APPEARANCE,
    onProjection,
    onHover,
  },
  ref
) {
  const host = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candlesRef = useRef(candles);
  candlesRef.current = candles;
  const dataUpdaters = useRef<((data: Candle[]) => void)[]>([]);
  const refreshProjection = useRef<(() => void) | null>(null);
  const appliedCandles = useRef<Candle[] | null>(null);
  const savedView = useRef<{ calendar: string; range: LogicalRange } | null>(null);
  // An instrument/calendar change resets the viewport, while replay and study changes preserve it.
  const calendar = `${instrument.id}:${candles[0]?.time}:${candles[1]?.time}`;

  const callbackRef = useRef({ onProjection, onHover });
  callbackRef.current = { onProjection, onHover };
  const [error, setError] = useState('');
  const configKey = JSON.stringify(config);
  const appearanceKey = JSON.stringify(appearance);

  useImperativeHandle(
    ref,
    () => ({
      fit: () => chartRef.current?.timeScale().fitContent(),
      zoom: (factor) => {
        const scale = chartRef.current?.timeScale();
        const range = scale?.getVisibleLogicalRange();
        if (range && scale) {
          const center = (range.from + range.to) / 2;
          const span = Math.max(12, (range.to - range.from) / factor);
          scale.setVisibleLogicalRange({ from: center - span / 2, to: center + span / 2 });
        }
      },
      screenshot: async () => {
        const chart = chartRef.current;
        if (!chart || !host.current) return;
        const canvas = chart.takeScreenshot();
        const overlays =
          host.current.parentElement?.querySelectorAll<SVGSVGElement>(
            'svg.profile-overlay, svg.drawing-overlay, svg.paper-levels'
          ) ?? [];
        for (const overlay of overlays) {
          const serialized = new XMLSerializer().serializeToString(overlay);
          const url = URL.createObjectURL(new Blob([serialized], { type: 'image/svg+xml' }));
          try {
            const img = new Image();
            img.src = url;
            await img.decode();
            const ctx = canvas.getContext('2d');
            if (ctx)
              ctx.drawImage(
                img,
                0,
                0,
                overlay.clientWidth * window.devicePixelRatio,
                overlay.clientHeight * window.devicePixelRatio
              );
          } finally {
            URL.revokeObjectURL(url);
          }
        }
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.font = `${12 * window.devicePixelRatio}px system-ui`;
          ctx.fillStyle = '#9da8bf';
          ctx.fillText(
            'Signalhive Charts · simulated / imported data · paper only',
            16 * window.devicePixelRatio,
            24 * window.devicePixelRatio
          );
        }
        const blob = await new Promise<Blob | null>((resolve) =>
          canvas.toBlob(resolve, 'image/png')
        );
        if (blob) {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `signalhive-${instrument.id}.png`;
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }
      },
    }),
    [instrument.id]
  );

  useEffect(() => {
    const initialCandles = candlesRef.current;
    if (!host.current || initialCandles.length < 2) return;
    dataUpdaters.current = [];
    let frame = 0;
    let disposed = false;
    let revision = 0;
    let chart: IChartApi | undefined;
    const container = host.current;
    try {
      chart = createChart(container, {
        width: container.clientWidth,
        height: container.clientHeight,
        layout: {
          background: { type: ColorType.Solid, color: appearance.background },
          textColor: appearance.text,
          fontFamily: 'Inter, system-ui, sans-serif',
          fontSize: appearance.fontSize,
          attributionLogo: true,
          panes: { separatorColor: '#263044', separatorHoverColor: '#879bff', enableResize: true },
        },
        grid: {
          vertLines: { visible: grid, color: appearance.gridColor },
          horzLines: { visible: grid, color: appearance.gridColor },
        },
        crosshair: {
          mode: CrosshairMode.Normal,
          vertLine: { color: appearance.crosshairColor, labelBackgroundColor: '#384765' },
          horzLine: { color: appearance.crosshairColor, labelBackgroundColor: '#384765' },
        },
        rightPriceScale: {
          borderColor: '#283142',
          minimumWidth: 78,
          scaleMargins: { top: 0.12, bottom: 0.14 },
        },
        timeScale: {
          borderColor: '#283142',
          timeVisible: true,
          secondsVisible: false,
          rightOffset: 12,
          barSpacing: 7,
          minBarSpacing: 2,
        },
        handleScale: {
          axisPressedMouseMove: true,
          axisDoubleClickReset: true,
          mouseWheel: true,
          pinch: true,
        },
      });
      chartRef.current = chart;
      const priceFormat = {
        type: 'price' as const,
        precision: instrument.decimals,
        minMove: 10 ** -instrument.decimals,
      };
      const main =
        appearance.chartType === 'bars'
          ? chart.addSeries(BarSeries, {
              upColor: appearance.upColor,
              downColor: appearance.downColor,
              priceFormat,
            })
          : appearance.chartType === 'line'
            ? chart.addSeries(LineSeries, {
                color: appearance.lineColor,
                lineWidth: 2,
                priceFormat,
              })
            : appearance.chartType === 'area'
              ? chart.addSeries(AreaSeries, {
                  lineColor: appearance.lineColor,
                  topColor: appearance.areaTopColor,
                  bottomColor: appearance.areaBottomColor,
                  priceFormat,
                })
              : chart.addSeries(CandlestickSeries, {
                  upColor: appearance.upColor,
                  downColor: appearance.downColor,
                  borderUpColor: appearance.upColor,
                  borderDownColor: appearance.downColor,
                  borderVisible: appearance.borderVisible,
                  wickUpColor: appearance.wickUpColor,
                  wickDownColor: appearance.wickDownColor,
                  priceFormat,
                });
      const registerData = (apply: (data: Candle[]) => void) => {
        dataUpdaters.current.push(apply);
        apply(initialCandles);
      };
      registerData((data) =>
        main.setData(data.map((c) => ({ ...c, time: c.time as UTCTimestamp, value: c.close })))
      );
      const line = (
        compute: (data: Candle[]) => { time: number; value: number }[],
        color: string,
        pane = 0,
        title = '',
        width: IndicatorLineWidth = 1
      ) => {
        const series = chart!.addSeries(
          LineSeries,
          {
            color,
            lineWidth: width,
            title,
            lastValueVisible: false,
            priceLineVisible: false,
            crosshairMarkerVisible: false,
          },
          pane
        );
        registerData((data) =>
          series.setData(compute(data).map((p) => ({ ...p, time: p.time as UTCTimestamp })))
        );
        return series;
      };
      if (indicators.ema) {
        config.ema.periods.forEach((period, i) =>
          line(
            (data) => ema(data, period),
            config.ema.colors[i],
            0,
            `EMA ${period}`,
            config.ema.width
          )
        );
      }
      if (indicators.sma)
        line(
          (data) => sma(data, config.sma.period),
          config.sma.color,
          0,
          `SMA ${config.sma.period}`,
          config.sma.width
        );
      if (indicators.bollinger) {
        const bands = cachedCalculation((data) =>
          bollinger(data, config.bollinger.period, config.bollinger.deviations)
        );
        line(
          (data) => bands(data).upper,
          config.bollinger.bandColor,
          0,
          '',
          config.bollinger.width
        );
        line(
          (data) => bands(data).middle,
          config.bollinger.middleColor,
          0,
          '',
          config.bollinger.width
        );
        line(
          (data) => bands(data).lower,
          config.bollinger.bandColor,
          0,
          '',
          config.bollinger.width
        );
      }
      if (indicators.levels) {
        let priceLines: IPriceLine[] = [];
        registerData((data) => {
          priceLines.forEach((priceLine) => main.removePriceLine(priceLine));
          priceLines = [];
          const pivots = confirmedPivots(data, config.levels.radius);
          for (const kind of ['support', 'resistance'] as const) {
            const distinct = pivots.filter((p) => p.kind === kind).slice(-config.levels.count);
            distinct.forEach((p, i) =>
              priceLines.push(
                main.createPriceLine({
                  price: p.value,
                  color:
                    (kind === 'support'
                      ? config.levels.supportColor
                      : config.levels.resistanceColor) + '80',
                  lineWidth: config.levels.width,
                  lineStyle: LineStyle.Dashed,
                  axisLabelVisible: false,
                  title: `${kind === 'support' ? 'S' : 'R'}${distinct.length - i} ${p.value.toFixed(instrument.decimals)}`,
                })
              )
            );
          }
        });
      }
      let pane = 0;
      const paneLabels: { title: string; pane: number }[] = [];
      if (indicators.volume) {
        ++pane;
        const v = chart.addSeries(
          HistogramSeries,
          { priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false },
          pane
        );
        registerData((data) =>
          v.setData(
            data.map((c) => ({
              time: c.time as UTCTimestamp,
              value: c.volume,
              color: (c.close >= c.open ? config.volume.upColor : config.volume.downColor) + '4d',
            }))
          )
        );
        paneLabels.push({ title: 'Volume · simulated / CSV', pane });
      }
      if (indicators.rsi) {
        ++pane;
        const r = line(
          (data) => rsi(data, config.rsi.period),
          config.rsi.color,
          pane,
          `RSI ${config.rsi.period}`,
          config.rsi.width
        );
        r.applyOptions({
          autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }),
        });
        for (const value of [config.rsi.lower, 50, config.rsi.upper].filter(
          (value, i, values) => values.indexOf(value) === i
        ))
          r.createPriceLine({
            price: value,
            color: '#495168',
            lineWidth: 1,
            lineStyle: LineStyle.Dashed,
            axisLabelVisible: value === config.rsi.lower || value === config.rsi.upper,
            title: '',
          });
        paneLabels.push({ title: `RSI ${config.rsi.period}`, pane });
      }
      if (indicators.macd) {
        const oscillator = cachedCalculation((data) =>
          macd(data, config.macd.fast, config.macd.slow, config.macd.signal)
        );
        ++pane;
        const h = chart.addSeries(
          HistogramSeries,
          { priceLineVisible: false, lastValueVisible: false },
          pane
        );
        registerData((data) =>
          h.setData(
            oscillator(data).histogram.map((p) => ({
              ...p,
              time: p.time as UTCTimestamp,
              color: (p.value >= 0 ? config.macd.positiveColor : config.macd.negativeColor) + '80',
            }))
          )
        );
        line(
          (data) => oscillator(data).macd,
          config.macd.macdColor,
          pane,
          'MACD',
          config.macd.width
        );
        line(
          (data) => oscillator(data).signal,
          config.macd.signalColor,
          pane,
          'Signal',
          config.macd.width
        );
        paneLabels.push({
          title: `MACD ${config.macd.fast} · ${config.macd.slow} · ${config.macd.signal}`,
          pane,
        });
      }
      if (indicators.atr) {
        ++pane;
        line(
          (data) => atr(data, config.atr.period),
          config.atr.color,
          pane,
          `ATR ${config.atr.period}`,
          config.atr.width
        );
        paneLabels.push({ title: `ATR ${config.atr.period}`, pane });
      }
      chart.panes().forEach((p, i) => p.setStretchFactor(i === 0 ? 5 : 1));
      paneLabels.forEach(({ title, pane: index }) => {
        const node = chart!.panes()[index].getHTMLElement();
        if (node) {
          const label = document.createElement('span');
          label.className = 'pane-label';
          label.textContent = title;
          node.style.position = 'relative';
          node.appendChild(label);
        }
      });
      const currentChart = chart;
      const update = () => {
        frame = 0;
        if (disposed) return;
        const width = currentChart.timeScale().width();
        const height = currentChart.panes()[0]?.getHeight() ?? container.clientHeight;
        callbackRef.current.onProjection({
          width,
          height,
          revision: ++revision,
          x: (t) =>
            currentChart
              .timeScale()
              .logicalToCoordinate(timeToIndex(candlesRef.current, t) as Logical),
          y: (p) => main.priceToCoordinate(p),
          from: (x, y) => {
            const logical = currentChart.timeScale().coordinateToLogical(x);
            const price = main.coordinateToPrice(y);
            return logical === null || price === null
              ? null
              : { time: indexToTime(candlesRef.current, Number(logical)), price };
          },
        });
      };
      const schedule = () => {
        if (!frame && !disposed) frame = requestAnimationFrame(update);
      };
      refreshProjection.current = schedule;
      chart.timeScale().subscribeVisibleLogicalRangeChange(schedule);
      chart.timeScale().subscribeSizeChange(schedule);
      let hoverTime: unknown = null;
      chart.subscribeCrosshairMove((param) => {
        if (param.time === hoverTime) return;
        hoverTime = param.time;
        const candle = candlesRef.current.find((c) => c.time === param.time);
        callbackRef.current.onHover(candle ?? null);
      });
      const observer = new ResizeObserver(() => {
        if (!disposed) {
          currentChart.resize(container.clientWidth, container.clientHeight);
          schedule();
        }
      });
      observer.observe(container);
      const onMove = (e: PointerEvent) => {
        if (e.buttons) schedule();
      };
      container.addEventListener('pointermove', onMove);
      container.addEventListener('pointerup', schedule);
      container.addEventListener('wheel', schedule, { passive: true });
      // Study toggles may rebuild panes, but must not undo a user's zoom or pan.
      const previousView = savedView.current;
      chart
        .timeScale()
        .setVisibleLogicalRange(
          previousView?.calendar === calendar
            ? previousView.range
            : { from: Math.max(0, initialCandles.length - 145), to: initialCandles.length + 12 }
        );
      appliedCandles.current = initialCandles;
      schedule();
      setError('');
      return () => {
        const range = currentChart.timeScale().getVisibleLogicalRange();
        if (range) savedView.current = { calendar, range };
        disposed = true;
        cancelAnimationFrame(frame);
        observer.disconnect();
        container.removeEventListener('pointermove', onMove);
        container.removeEventListener('pointerup', schedule);
        container.removeEventListener('wheel', schedule);
        callbackRef.current.onProjection(null);
        chartRef.current = null;
        dataUpdaters.current = [];
        refreshProjection.current = null;
        appliedCandles.current = null;
        currentChart.remove();
      };
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not render the chart');
      chart?.remove();
      chartRef.current = null;
    }
  }, [
    calendar,
    configKey,
    appearanceKey,
    instrument.decimals,
    indicators.ema,
    indicators.sma,
    indicators.bollinger,
    indicators.levels,
    indicators.volume,
    indicators.rsi,
    indicators.macd,
    indicators.atr,
    grid,
  ]);

  useEffect(() => {
    const chart = chartRef.current;
    const previous = appliedCandles.current;
    if (!chart || previous === candles || candles.length < 2) return;
    const scale = chart.timeScale();
    const range = scale.getVisibleLogicalRange();
    // Follow new bars only when the right edge was already in view. Panned history stays put.
    const follow = range && previous && range.to >= previous.length - 2;
    for (const apply of dataUpdaters.current) apply(candles);
    if (range) {
      const shift = follow && previous ? candles.length - previous.length : 0;
      scale.setVisibleLogicalRange({ from: range.from + shift, to: range.to + shift });
    }
    appliedCandles.current = candles;
    refreshProjection.current?.();
  }, [candles]);

  return (
    <>
      <div className="chart-canvas" ref={host} data-testid="chart-canvas" />
      {error ? (
        <div className="chart-error" role="alert">
          Chart unavailable: {error}
        </div>
      ) : null}
    </>
  );
});
