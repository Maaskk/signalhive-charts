import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';
import {
  Activity,
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  BookOpen,
  Camera,
  Check,
  ChevronDown,
  Circle,
  Code2,
  Crosshair,
  Download,
  Eye,
  EyeOff,
  FileUp,
  GitBranch,
  GripVertical,
  HelpCircle,
  Layers3,
  LockKeyhole,
  Maximize2,
  Minus,
  MousePointer2,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Play,
  Plus,
  Redo2,
  RotateCcw,
  Ruler,
  Search,
  Settings2,
  SkipForward,
  SlidersHorizontal,
  Square,
  Trash2,
  TrendingUp,
  Type,
  Undo2,
  UnlockKeyhole,
  X,
} from 'lucide-react';
import type {
  Candle,
  Drawing,
  IndicatorId,
  IndicatorSettings,
  InstrumentId,
  Projection,
  Timeframe,
  Tool,
} from './types';
import { Chart, type ChartHandle } from './components/Chart';
import { DrawingOverlay } from './components/DrawingOverlay';
import { Modal } from './components/Modal';
import {
  INSTRUMENTS,
  INSTRUMENT_BY_ID,
  generateCandles,
  parseCSV,
  exportCSV,
  validateCandles,
} from './lib/market';
import {
  createPaperAccount,
  closePaperPosition,
  openPaperPosition,
  paperSummary,
  parsePaperAccount,
  processPaperCandle,
  type PaperAccount,
} from './lib/paper';
import {
  DEFAULT_INDICATORS,
  PRESETS,
  downloadFile,
  loadJSON,
  parseIndicators,
  parseWorkspace,
} from './lib/workspace';
import { volumeProfile } from './lib/volumeProfile';

const TIMEFRAMES: Timeframe[] = ['5m', '15m', '1h', '4h', '1D'];
const TOOL_ITEMS: {
  id: Tool;
  name: string;
  key: string;
  icon: typeof TrendingUp;
  group: string;
  hint: string;
}[] = [
  {
    id: 'cursor',
    name: 'Select & pan',
    key: 'V',
    icon: MousePointer2,
    group: 'Navigation',
    hint: 'Drag empty chart to pan. Click a drawing to select it.',
  },
  {
    id: 'trend',
    name: 'Trend line',
    key: 'T',
    icon: TrendingUp,
    group: 'Lines',
    hint: 'Click two points to draw a trend line.',
  },
  {
    id: 'ray',
    name: 'Ray',
    key: '',
    icon: ArrowUpRight,
    group: 'Lines',
    hint: 'Click two points. The line extends forward.',
  },
  {
    id: 'horizontal',
    name: 'Horizontal level',
    key: 'H',
    icon: Minus,
    group: 'Lines',
    hint: 'Click a price to place a horizontal level.',
  },
  {
    id: 'vertical',
    name: 'Vertical marker',
    key: '',
    icon: GripVertical,
    group: 'Lines',
    hint: 'Click a time to place a vertical marker.',
  },
  {
    id: 'channel',
    name: 'Parallel channel',
    key: '',
    icon: GitBranch,
    group: 'Lines',
    hint: 'Click the baseline twice, then a third point for channel width.',
  },
  {
    id: 'rectangle',
    name: 'Price zone',
    key: 'R',
    icon: Square,
    group: 'Shapes',
    hint: 'Click two opposite corners. Drag handles to resize.',
  },
  {
    id: 'ellipse',
    name: 'Ellipse',
    key: '',
    icon: Circle,
    group: 'Shapes',
    hint: 'Click two opposite corners of the ellipse.',
  },
  {
    id: 'fib',
    name: 'Fibonacci retracement',
    key: 'F',
    icon: SlidersHorizontal,
    group: 'Analysis',
    hint: 'Click the start and end of the swing.',
  },
  {
    id: 'long',
    name: 'Long position',
    key: 'L',
    icon: ArrowUpRight,
    group: 'Analysis',
    hint: 'Click entry, then stop below entry. A 2R target is created; drag its handle to adjust.',
  },
  {
    id: 'short',
    name: 'Short position',
    key: 'S',
    icon: ArrowDownLeft,
    group: 'Analysis',
    hint: 'Click entry, then stop above entry. A 2R target is created; drag its handle to adjust.',
  },
  {
    id: 'measure',
    name: 'Price & time range',
    key: 'M',
    icon: Ruler,
    group: 'Analysis',
    hint: 'Click two points to measure price, percentage and elapsed time.',
  },
  {
    id: 'arrow',
    name: 'Arrow',
    key: '',
    icon: ArrowRight,
    group: 'Annotations',
    hint: 'Click the arrow tail, then its head.',
  },
  {
    id: 'text',
    name: 'Text note',
    key: 'N',
    icon: Type,
    group: 'Annotations',
    hint: 'Click to place a note. Edit its text in the Drawings panel.',
  },
];
const LIBRARY: {
  id: IndicatorId;
  name: string;
  category: string;
  description: string;
  color: string;
}[] = [
  {
    id: 'ema',
    name: 'EMA 9 / 21 / 200',
    category: 'Trend',
    description: 'Blue 9, yellow 21, red 200. SMA-seeded close-price averages.',
    color: '#29b6f6',
  },
  {
    id: 'sma',
    name: 'Simple moving average',
    category: 'Trend',
    description: '50-bar arithmetic moving average.',
    color: '#c59aff',
  },
  {
    id: 'bollinger',
    name: 'Bollinger bands',
    category: 'Volatility',
    description: '20-bar mean and two population standard deviations.',
    color: '#839cc2',
  },
  {
    id: 'levels',
    name: 'Support & resistance',
    category: 'Structure',
    description: 'Three confirmed pivot levels per side. Confirmation uses closed bars.',
    color: '#2cc9a1',
  },
  {
    id: 'volume',
    name: 'Volume',
    category: 'Volume',
    description: 'Candle volume from the current simulated or imported source.',
    color: '#38cfa8',
  },
  {
    id: 'rsi',
    name: 'Relative strength index',
    category: 'Momentum',
    description: 'Wilder RSI 14 with 30 / 50 / 70 reference levels.',
    color: '#b39aef',
  },
  {
    id: 'macd',
    name: 'MACD',
    category: 'Momentum',
    description: '12 / 26 EMAs, 9 EMA signal and histogram.',
    color: '#60a5fa',
  },
  {
    id: 'atr',
    name: 'Average true range',
    category: 'Volatility',
    description: 'Wilder ATR 14. Historical movement, in price units.',
    color: '#dfc591',
  },
];
const AMD_ZONES = [
  { name: 'Accumulation', label: 'ACCUMULATION', color: '#5799ed' },
  { name: 'Manipulation', label: 'MANIPULATION', color: '#f3ad53' },
  { name: 'Distribution', label: 'DISTRIBUTION', color: '#b398ee' },
];

interface Session {
  paper: PaperAccount;
  symbol: InstrumentId;
  timeframe: Timeframe;
  replay: number | null;
  imported: Candle[] | null;
}
function parseSession(value: unknown): Session {
  const v = value as Session;
  if (
    !v ||
    !['XAUUSD', 'EURUSD', 'BTCUSD'].includes(v.symbol) ||
    !TIMEFRAMES.includes(v.timeframe) ||
    !(v.replay === null || (Number.isInteger(v.replay) && v.replay >= 2 && v.replay <= 100000))
  )
    throw new Error('Invalid session');
  if (v.imported !== null) {
    validateCandles(v.imported);
    if (v.imported.length < 2) throw new Error('Missing imported history');
  }
  const parsedPaper = parsePaperAccount(v.paper);
  if (parsedPaper.positions.some((p) => p.instrument !== v.symbol))
    throw new Error('Paper session symbol mismatch');
  return {
    paper: parsedPaper,
    symbol: v.symbol,
    timeframe: v.timeframe,
    replay: v.replay,
    imported: v.imported,
  };
}
const initialWorkspace = () =>
  loadJSON('signalhive-workspace-v1', parseWorkspace, {
    version: 1 as const,
    symbol: 'XAUUSD' as const,
    timeframe: '15m' as const,
    indicators: DEFAULT_INDICATORS,
    drawings: {},
  });
const money = (n: number) => `${n < 0 ? '−' : ''}$${Math.abs(n).toFixed(2)}`;
const isoDate = (time: number) =>
  new Date(time * 1000).toLocaleString(undefined, {
    timeZone: 'UTC',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

export default function App() {
  const [saved] = useState(initialWorkspace);
  const [session] = useState(() =>
    loadJSON('signalhive-session-v1', parseSession, {
      paper: createPaperAccount(),
      symbol: saved.symbol,
      timeframe: saved.timeframe,
      replay: null,
      imported: null,
    })
  );
  const [symbol, setSymbol] = useState<InstrumentId>(session.symbol);
  const [timeframe, setTimeframe] = useState<Timeframe>(session.timeframe);
  const [indicators, setIndicators] = useState<IndicatorSettings>(saved.indicators);
  const [drawingMap, setDrawingMap] = useState<Partial<Record<InstrumentId, Drawing[]>>>(
    saved.drawings
  );
  const [paper, setPaper] = useState<PaperAccount>(session.paper);
  const [imported, setImported] = useState<Candle[] | null>(session.imported);
  const [replay, setReplay] = useState<number | null>(session.replay);
  const [playing, setPlaying] = useState(false);
  const [tool, setTool] = useState<Tool>('cursor');
  const [zonePreset, setZonePreset] = useState<(typeof AMD_ZONES)[number] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [projection, setProjection] = useState<Projection | null>(null);
  const [hover, setHover] = useState<Candle | null>(null);
  const [sidebar, setSidebar] = useState(true);
  const [tab, setTab] = useState<'watchlist' | 'drawings' | 'alerts'>('watchlist');
  const [bottom, setBottom] = useState<'paper' | 'journal' | null>('paper');
  const [dialog, setDialog] = useState<
    'library' | 'symbols' | 'help' | 'settings' | 'tools' | 'workspace' | null
  >(null);
  const [query, setQuery] = useState('');
  const [libraryTab, setLibraryTab] = useState<'indicators' | 'presets' | 'scripts'>('indicators');
  const [script, setScript] = useState(
    JSON.stringify({ version: 1, name: 'My study', indicators: DEFAULT_INDICATORS }, null, 2)
  );
  const [customPresets, setCustomPresets] = useState<
    { name: string; indicators: IndicatorSettings }[]
  >(() =>
    loadJSON(
      'signalhive-presets-v1',
      (value) => {
        if (!Array.isArray(value) || value.length > 30) throw new Error('Invalid presets');
        return value.map((p) => {
          if (!p || typeof p.name !== 'string') throw new Error('Invalid name');
          return { name: p.name.slice(0, 60), indicators: parseIndicators(p.indicators) };
        });
      },
      []
    )
  );
  const [grid, setGrid] = useState(true);
  const [message, setMessage] = useState('');
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [lots, setLots] = useState('0.01');
  const [stop, setStop] = useState('');
  const [target, setTarget] = useState('');
  const [alertPrice, setAlertPrice] = useState('');
  const [alerts, setAlerts] = useState<
    { id: string; symbol: InstrumentId; price: number; start: number; fired: boolean }[]
  >([]);
  const [profile, setProfile] = useState(false);
  const [profileBars, setProfileBars] = useState(100);
  const [profileBins, setProfileBins] = useState(32);
  const [profileRangeId, setProfileRangeId] = useState<string | null>(null);
  const [pickingProfile, setPickingProfile] = useState(false);
  const past = useRef<Drawing[][]>([]),
    future = useRef<Drawing[][]>([]);
  const chartRef = useRef<ChartHandle>(null);
  const csvInput = useRef<HTMLInputElement>(null),
    workspaceInput = useRef<HTMLInputElement>(null);
  const instrument = INSTRUMENT_BY_ID[symbol];
  const data = useMemo(
    () => imported ?? generateCandles(symbol, timeframe),
    [imported, symbol, timeframe]
  );
  const candles = useMemo(
    () => (replay === null ? data : data.slice(0, Math.max(2, Math.min(replay, data.length)))),
    [data, replay]
  );
  const last = candles[candles.length - 1];
  const ohlc = hover ?? last;
  const drawings = drawingMap[symbol] ?? [];
  const selectedDrawing = drawings.find((d) => d.id === selected);
  const marks = useMemo(() => ({ [symbol]: last.close }), [symbol, last.close]);
  const summary = useMemo(() => paperSummary(paper, marks), [paper, marks]);
  const watchRows = useMemo(
    () =>
      INSTRUMENTS.map((i) => {
        const bars = i.id === symbol ? candles : generateCandles(i.id, timeframe, 2);
        const end = bars[bars.length - 1];
        return { instrument: i, end, pct: ((end.close - end.open) / end.open) * 100 };
      }),
    [symbol, timeframe, candles]
  );
  const orderRisk = Math.abs(last.close - Number(stop)) * Number(lots) * instrument.contractSize;
  const orderMargin =
    (last.close * Number(lots) * instrument.contractSize) / paper.settings.leverage;
  const activeTool = TOOL_ITEMS.find((t) => t.id === tool)!;
  const profileRange = drawings.find((d) => d.id === profileRangeId);
  const rangeStart = profileRange
    ? Math.floor(Math.min(...profileRange.points.map((p) => p.time)))
    : candles[Math.max(0, candles.length - profileBars)].time;
  const rangeEnd = profileRange
    ? Math.ceil(Math.max(...profileRange.points.map((p) => p.time)))
    : last.time;
  const profileResult = useMemo(() => {
    try {
      return {
        data: profile ? volumeProfile(candles, rangeStart, rangeEnd, profileBins) : null,
        error: '',
      };
    } catch (e) {
      return { data: null, error: e instanceof Error ? e.message : 'Volume profile unavailable.' };
    }
  }, [profile, candles, rangeStart, rangeEnd, profileBins]);
  const vp = profileResult.data;

  const notify = useCallback((text: string) => setMessage(text), []);
  useEffect(() => {
    if (!message) return;
    const t = setTimeout(() => setMessage(''), 6500);
    return () => clearTimeout(t);
  }, [message]);
  useEffect(() => {
    const t = setTimeout(() => {
      try {
        localStorage.setItem(
          'signalhive-workspace-v1',
          JSON.stringify({ version: 1, symbol, timeframe, indicators, drawings: drawingMap })
        );
      } catch {
        notify('Workspace storage is full. Export a backup from the workspace menu.');
      }
    }, 250);
    return () => clearTimeout(t);
  }, [symbol, timeframe, indicators, drawingMap, notify]);
  useEffect(() => {
    try {
      localStorage.setItem(
        'signalhive-session-v1',
        JSON.stringify({ paper, symbol, timeframe, replay, imported })
      );
    } catch {
      notify('Session could not be saved locally. Export your journal before closing.');
    }
  }, [paper, symbol, timeframe, replay, imported, notify]);
  useEffect(() => {
    setPaper((a) => processPaperCandle(a, symbol, last));
    setAlerts((list) =>
      list.map((a) => {
        if (
          a.symbol === symbol &&
          !a.fired &&
          a.start !== last.close &&
          (a.start - a.price) * (last.close - a.price) <= 0
        ) {
          notify(`${symbol} reached ${a.price.toFixed(instrument.decimals)} in this replay.`);
          return { ...a, fired: true };
        }
        return a;
      })
    );
  }, [last, symbol, instrument.decimals, notify]);
  useEffect(() => {
    if (!playing) return;
    const timer = setInterval(
      () =>
        setReplay((n) => {
          const next = (n ?? data.length) + 1;
          return Math.min(next, data.length);
        }),
      900
    );
    return () => clearInterval(timer);
  }, [playing, data.length]);
  useEffect(() => {
    if (replay !== null && replay >= data.length) setPlaying(false);
  }, [replay, data.length]);
  useEffect(() => {
    const distance = symbol === 'EURUSD' ? 0.0002 : symbol === 'BTCUSD' ? 150 : 2;
    setStop((last.close + (side === 'buy' ? -distance : distance)).toFixed(instrument.decimals));
    setTarget(
      (last.close + (side === 'buy' ? 2 * distance : -2 * distance)).toFixed(instrument.decimals)
    );
    // A replay advance must not overwrite a stop/target the user is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [symbol, side, instrument.decimals, timeframe, imported]);

  const changeDrawings = useCallback(
    (next: Drawing[]) => {
      if (next.length > 500) {
        notify('500-drawing limit reached. Export or remove drawings first.');
        return;
      }
      const current = drawingMap[symbol] ?? [];
      const freshRectangle = next.find(
        (d) => d.tool === 'rectangle' && !current.some((c) => c.id === d.id)
      );
      const adjusted =
        pickingProfile && freshRectangle
          ? next.map((d) =>
              d.id === freshRectangle.id
                ? { ...d, text: 'VOLUME PROFILE · TIME RANGE', color: '#839cc2' }
                : d
            )
          : zonePreset
            ? next.map((d) =>
                d.tool === 'rectangle' && !current.some((c) => c.id === d.id)
                  ? { ...d, text: zonePreset.label, color: zonePreset.color }
                  : d
              )
            : next;
      if (pickingProfile && freshRectangle) {
        setProfileRangeId(freshRectangle.id);
        setPickingProfile(false);
        setProfile(true);
      }
      past.current = [...past.current.slice(-49), current];
      future.current = [];
      setDrawingMap((m) => ({ ...m, [symbol]: adjusted }));
    },
    [drawingMap, symbol, zonePreset, pickingProfile, notify]
  );
  const chooseTool = (next: Tool) => {
    setZonePreset(null);
    setPickingProfile(false);
    setTool(next);
    setDialog(null);
  };
  const undo = useCallback(() => {
    const next = past.current.pop();
    if (!next) return;
    future.current.push(drawingMap[symbol] ?? []);
    setDrawingMap((m) => ({ ...m, [symbol]: next }));
    setSelected(null);
  }, [drawingMap, symbol]);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(drawingMap[symbol] ?? []);
    setDrawingMap((m) => ({ ...m, [symbol]: next }));
    setSelected(null);
  }, [drawingMap, symbol]);
  const deleteSelected = useCallback(() => {
    if (!selected || drawings.find((d) => d.id === selected)?.locked) return;
    changeDrawings(drawings.filter((d) => d.id !== selected));
    setSelected(null);
  }, [selected, drawings, changeDrawings]);
  useEffect(() => {
    const handle = (e: KeyboardEvent) => {
      if (
        dialog ||
        (e.target instanceof HTMLElement &&
          (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName) ||
            e.target.isContentEditable))
      )
        return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        e.shiftKey ? redo() : undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setDialog('symbols');
        setQuery('');
        return;
      }
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === 'Escape') {
        setTool('cursor');
        setSelected(null);
        setZonePreset(null);
        setPickingProfile(false);
      }
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        deleteSelected();
      }
      const match = TOOL_ITEMS.find((t) => t.key && t.key.toLowerCase() === e.key.toLowerCase());
      if (match) {
        setZonePreset(null);
        setPickingProfile(false);
        setTool(match.id);
      }
      if (e.key === '?') setDialog('help');
    };
    window.addEventListener('keydown', handle);
    return () => window.removeEventListener('keydown', handle);
  }, [dialog, undo, redo, deleteSelected]);

  const changeMarket = (id: InstrumentId, tf = timeframe) => {
    if (paper.positions.length) {
      notify('Close your paper positions before changing symbol, timeframe or data source.');
      return;
    }
    setPlaying(false);
    setSymbol(id);
    setTimeframe(tf);
    setReplay(null);
    setImported(null);
    setSelected(null);
    setHover(null);
    past.current = [];
    future.current = [];
    setDialog(null);
  };
  const startReplay = () => {
    if (replay === null || replay >= data.length) {
      if (paper.positions.length) {
        notify('Close paper positions before rewinding replay.');
        return;
      }
      setReplay(Math.max(2, data.length - 100));
    }
    setPlaying((p) => !p);
  };
  const stepReplay = () => {
    if (replay === null || replay >= data.length) {
      if (paper.positions.length) {
        notify('Close paper positions before rewinding replay.');
        return;
      }
      setReplay(Math.max(2, data.length - 100));
    } else setReplay((n) => Math.min((n ?? 0) + 1, data.length));
  };
  const openPaper = () => {
    try {
      setPaper(
        openPaperPosition(
          paper,
          {
            instrument: symbol,
            side,
            lots: Number(lots),
            price: last.close,
            stopLoss: Number(stop),
            takeProfit: Number(target),
            time: last.time,
          },
          marks
        )
      );
      notify('Paper position opened. Advance replay to simulate the next candle.');
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Paper order rejected.');
    }
  };
  const importCSV = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (paper.positions.length) throw new Error('Close paper positions before changing data.');
      if (file.size > 15_000_000) throw new Error('CSV limit is 15 MB.');
      const parsed = parseCSV(await file.text());
      if (parsed.length < 2) throw new Error('Import at least two candles.');
      setImported(parsed);
      setReplay(null);
      setPlaying(false);
      setHover(null);
      setDialog(null);
      notify(
        `Imported ${parsed.length.toLocaleString()} candles for ${symbol}. Source prices and volume are supplied by your file.`
      );
    } catch (error) {
      notify(error instanceof Error ? error.message : 'CSV import failed.');
    }
  };
  const importWorkspace = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      if (paper.positions.length)
        throw new Error('Close paper positions before loading a workspace.');
      if (file.size > 2_000_000) throw new Error('Workspace limit is 2 MB.');
      const value = parseWorkspace(JSON.parse(await file.text()));
      setSymbol(value.symbol);
      setTimeframe(value.timeframe);
      setIndicators(value.indicators);
      setDrawingMap(value.drawings);
      setImported(null);
      setReplay(null);
      setPlaying(false);
      setSelected(null);
      past.current = [];
      future.current = [];
      setDialog(null);
      notify('Workspace loaded. CSV data is imported separately.');
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Workspace import failed.');
    }
  };
  const setDrawing = (id: string, patch: Partial<Drawing>) =>
    changeDrawings(drawings.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  const savePreset = () => {
    try {
      const v = JSON.parse(script);
      if (v.version !== 1 || typeof v.name !== 'string' || !v.name.trim())
        throw new Error('Use version 1 and a nonempty preset name.');
      const parsed = {
        name: v.name.trim().slice(0, 60),
        indicators: parseIndicators(v.indicators),
      };
      const next = [...customPresets.filter((p) => p.name !== parsed.name), parsed].slice(-30);
      localStorage.setItem('signalhive-presets-v1', JSON.stringify(next));
      setCustomPresets(next);
      setIndicators(parsed.indicators);
      notify(`Saved and applied “${parsed.name}”.`);
    } catch (e) {
      notify(e instanceof Error ? e.message : 'Invalid study preset.');
    }
  };

  return (
    <div className="app-shell">
      <header className="app-header">
        <button
          className="brand"
          onClick={() => setDialog('workspace')}
          title="Workspace & backups"
        >
          <img src="./icon.svg" alt="" />
          <strong>
            signalhive<span>CHARTS</span>
          </strong>
          <ChevronDown size={14} />
        </button>
        <span className="header-divider" />
        <span className="workspace-name">
          Analysis workspace <span className="saved-dot" /> <span className="muted">Local</span>
        </span>
        <div className="header-spacer" />
        <span className="paper-badge">
          <span /> PAPER ONLY
        </span>
        <a
          className="icon-button github-link"
          aria-label="Open source on GitHub"
          href="https://github.com/Maaskk/signalhive-charts"
          target="_blank"
          rel="noreferrer"
        >
          <Code2 size={18} />
        </a>
        <button
          className="icon-button"
          title="Help & shortcuts (?)"
          aria-label="Help & shortcuts"
          onClick={() => setDialog('help')}
        >
          <HelpCircle size={18} />
        </button>
        <button
          className="icon-button"
          title="Settings"
          aria-label="Settings"
          onClick={() => setDialog('settings')}
        >
          <Settings2 size={18} />
        </button>
      </header>
      <div className="chart-toolbar">
        <button
          className="symbol-select"
          onClick={() => {
            setQuery('');
            setDialog('symbols');
          }}
        >
          <Search size={15} />
          <strong>{symbol}</strong>
          <ChevronDown size={12} />
        </button>
        <span className="toolbar-divider" />
        <div className="timeframes" aria-label="Chart timeframe">
          {TIMEFRAMES.map((tf) => (
            <button
              aria-pressed={timeframe === tf}
              className={timeframe === tf ? 'active' : ''}
              key={tf}
              onClick={() =>
                imported
                  ? notify(
                      'Imported CSV keeps its own candle interval. Switch to simulated data in the workspace menu to change timeframes.'
                    )
                  : changeMarket(symbol, tf)
              }
            >
              {tf}
            </button>
          ))}
        </div>
        <span className="toolbar-divider" />
        <button
          className="toolbar-button"
          onClick={() => {
            setDialog('library');
            setQuery('');
          }}
        >
          <Activity size={16} />
          <span>Indicators</span>
        </button>
        <button
          className="toolbar-button"
          onClick={() => {
            setLibraryTab('presets');
            setDialog('library');
          }}
        >
          <Layers3 size={16} />
          <span>Studies</span>
        </button>
        <button
          className={`toolbar-button ${replay !== null ? 'accent-text' : ''}`}
          onClick={startReplay}
        >
          {playing ? <Pause size={15} /> : <Play size={15} />}
          <span>Replay</span>
        </button>
        <div className="toolbar-spacer" />
        <button
          className="icon-button"
          aria-label="Undo drawing"
          title="Undo drawing (Ctrl/Cmd+Z)"
          disabled={!past.current.length}
          onClick={undo}
        >
          <Undo2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label="Redo drawing"
          title="Redo drawing (Ctrl/Cmd+Shift+Z)"
          disabled={!future.current.length}
          onClick={redo}
        >
          <Redo2 size={17} />
        </button>
        <button
          className="icon-button optional"
          aria-label="Export chart image"
          title="Export chart image"
          onClick={() =>
            chartRef.current
              ?.screenshot()
              .catch(() => notify('Image export failed. Try the browser screenshot tool.'))
          }
        >
          <Camera size={17} />
        </button>
        <button
          className="icon-button optional"
          aria-label="Fullscreen"
          title="Fullscreen"
          onClick={() => {
            if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
            else
              document.documentElement
                .requestFullscreen?.()
                .catch(() => notify('Fullscreen is unavailable in this app window.'));
          }}
        >
          <Maximize2 size={17} />
        </button>
        <button
          className="icon-button"
          aria-label={sidebar ? 'Hide side panel' : 'Show side panel'}
          onClick={() => setSidebar((s) => !s)}
        >
          {sidebar ? <PanelRightClose size={18} /> : <PanelRightOpen size={18} />}
        </button>
      </div>
      <div className="workbench">
        <nav className="drawing-rail" aria-label="Drawing tools">
          {TOOL_ITEMS.filter((t) =>
            [
              'cursor',
              'trend',
              'horizontal',
              'rectangle',
              'fib',
              'long',
              'short',
              'text',
              'measure',
            ].includes(t.id)
          ).map(({ id, icon: Icon, name, key }) => (
            <button
              key={id}
              className={`rail-button ${tool === id ? 'active' : ''}`}
              aria-label={name}
              aria-pressed={tool === id}
              title={`${name}${key ? ` (${key})` : ''}`}
              onClick={() => chooseTool(id)}
            >
              <Icon size={20} />
            </button>
          ))}
          <span className="rail-divider" />
          <button
            className="rail-button"
            aria-label="All drawing tools"
            title="All drawing tools & AMD zones"
            onClick={() => setDialog('tools')}
          >
            <Plus size={20} />
          </button>
          <button
            className={`rail-button ${profile ? 'active' : ''}`}
            aria-label="Volume profile"
            title="Fixed-range volume profile (OHLCV estimate)"
            onClick={() => {
              setProfile((p) => !p);
              setSidebar(true);
              setTab('drawings');
            }}
          >
            <SlidersHorizontal size={20} />
          </button>
          <span className="rail-spacer" />
          <button
            className="rail-button danger-hover"
            disabled={!selected || selectedDrawing?.locked}
            aria-label="Delete selected drawing"
            title="Delete selected drawing"
            onClick={deleteSelected}
          >
            <Trash2 size={19} />
          </button>
        </nav>
        <main className="center-workspace">
          <div className="chart-heading">
            <div className="instrument-heading">
              <span className={`symbol-coin ${symbol.toLowerCase()}`}>
                {symbol === 'XAUUSD' ? 'Au' : symbol === 'EURUSD' ? '€' : '₿'}
              </span>
              <div>
                <h1>
                  {instrument.name} <span>· {imported ? 'CSV' : timeframe}</span>
                </h1>
                <p>
                  {imported ? 'Imported OHLCV' : 'Simulated market'} <span>· UTC</span>
                </p>
              </div>
            </div>
            <div className="quote">
              <strong className={last.close >= last.open ? 'positive' : 'negative'}>
                {last.close.toFixed(instrument.decimals)}
              </strong>
              <small>
                O {ohlc.open.toFixed(instrument.decimals)}{' '}
                <span>H {ohlc.high.toFixed(instrument.decimals)}</span>{' '}
                <span>L {ohlc.low.toFixed(instrument.decimals)}</span> C{' '}
                {ohlc.close.toFixed(instrument.decimals)}
              </small>
            </div>
          </div>
          <div className="indicator-strip">
            {indicators.ema ? (
              <>
                <span>
                  <i style={{ background: '#29b6f6' }} />
                  EMA 9
                </span>
                <span>
                  <i style={{ background: '#facc15' }} />
                  EMA 21
                </span>
                <span>
                  <i style={{ background: '#ef5350' }} />
                  EMA 200
                </span>
              </>
            ) : null}
            {indicators.levels ? (
              <span className="muted">
                <i style={{ background: '#2cc9a1' }} />
                Confirmed S/R
              </span>
            ) : null}
            <button
              aria-label="Open indicator library"
              onClick={() => {
                setDialog('library');
                setLibraryTab('indicators');
                setQuery('');
              }}
            >
              <Plus size={13} />
            </button>
            <span className="data-label">{imported ? 'CSV DATA' : 'SIMULATED DATA'}</span>
          </div>
          <div className="chart-stage" data-testid="chart-stage">
            <Chart
              ref={chartRef}
              candles={candles}
              instrument={instrument}
              indicators={indicators}
              grid={grid}
              onProjection={setProjection}
              onHover={setHover}
            />
            {projection && vp ? (
              <svg
                className="profile-overlay"
                width={projection.width}
                height={projection.height}
                aria-label="Estimated fixed-range volume profile"
              >
                {vp.bins.map((b, i) => {
                  const y1 = projection.y(b.high),
                    y2 = projection.y(b.low);
                  if (y1 === null || y2 === null) return null;
                  const max = Math.max(...vp.bins.map((bin) => bin.volume), 1);
                  const width = (b.volume / max) * Math.min(150, projection.width * 0.22);
                  return (
                    <rect
                      key={i}
                      x={projection.width - width}
                      y={Math.min(y1, y2)}
                      width={width}
                      height={Math.max(1, Math.abs(y2 - y1) - 1)}
                      fill={
                        vp.poc !== null && b.low <= vp.poc && b.high >= vp.poc
                          ? '#d8b15e99'
                          : '#8195c84d'
                      }
                    />
                  );
                })}
                {[
                  { p: vp.poc, label: 'POC', c: '#d8b15e' },
                  { p: vp.vah, label: 'VAH', c: '#9cb0d8' },
                  { p: vp.val, label: 'VAL', c: '#9cb0d8' },
                ].map(({ p, label, c }) => {
                  if (p === null) return null;
                  const y = projection.y(p);
                  return y === null ? null : (
                    <g key={label}>
                      <line
                        x1={projection.width - 155}
                        y1={y}
                        x2={projection.width}
                        y2={y}
                        stroke={c}
                        strokeDasharray="3 3"
                      />
                      <text
                        x={projection.width - 158}
                        y={y - 4}
                        fill={c}
                        textAnchor="end"
                        fontSize="10"
                      >
                        {label} {p.toFixed(instrument.decimals)}
                      </text>
                    </g>
                  );
                })}
                <text x={projection.width - 8} y="18" textAnchor="end" fill="#a2aec4" fontSize="10">
                  OHLCV PROFILE · ESTIMATE
                </text>
              </svg>
            ) : null}
            {projection ? (
              <DrawingOverlay
                key={`${symbol}:${pickingProfile ? 'profile' : (zonePreset?.label ?? 'plain')}`}
                projection={projection}
                tool={tool}
                drawings={drawings}
                selectedId={selected}
                onChange={changeDrawings}
                onSelect={setSelected}
                onToolChange={setTool}
              />
            ) : null}
            <div className="chart-navigation">
              <button aria-label="Zoom out" onClick={() => chartRef.current?.zoom(0.8)}>
                <Minus size={15} />
              </button>
              <button aria-label="Zoom in" onClick={() => chartRef.current?.zoom(1.25)}>
                <Plus size={15} />
              </button>
              <button aria-label="Fit chart" onClick={() => chartRef.current?.fit()}>
                <Maximize2 size={14} />
              </button>
            </div>
          </div>
          <div className="chart-status">
            <span className="tool-hint">
              <Crosshair size={13} />
              {pickingProfile
                ? 'Volume profile: click two corners to select a time range.'
                : zonePreset
                  ? `${zonePreset.name}: click two corners to draw a labeled zone.`
                  : activeTool.hint}
            </span>
            <span className="utc">{isoDate(last.time)} UTC</span>
          </div>
          {replay !== null ? (
            <div className="replay-bar">
              <span className="eyebrow">BAR REPLAY</span>
              <button
                className="icon-button"
                aria-label={playing ? 'Pause replay' : 'Play replay'}
                onClick={startReplay}
              >
                {playing ? <Pause size={16} /> : <Play size={16} />}
              </button>
              <button
                className="icon-button"
                aria-label="Next candle"
                onClick={stepReplay}
                disabled={replay >= data.length}
              >
                <SkipForward size={16} />
              </button>
              <progress value={Math.min(replay, data.length)} max={data.length} />
              <small>
                {Math.min(replay, data.length)} / {data.length}
              </small>
              <button
                className="text-button"
                onClick={() => {
                  if (paper.positions.length) {
                    notify('Close paper positions before leaving replay.');
                    return;
                  }
                  setReplay(null);
                  setPlaying(false);
                }}
              >
                Exit replay <X size={13} />
              </button>
            </div>
          ) : null}
          <section className={`bottom-panel ${bottom ? '' : 'collapsed'}`}>
            <div className="bottom-tabs">
              <button
                className={bottom === 'paper' ? 'active' : ''}
                onClick={() => setBottom((v) => (v === 'paper' ? null : 'paper'))}
              >
                Paper trading <span className="count">{paper.positions.length}</span>
              </button>
              <button
                className={bottom === 'journal' ? 'active' : ''}
                onClick={() => setBottom((v) => (v === 'journal' ? null : 'journal'))}
              >
                Trade journal
              </button>
              <span className="bottom-account">
                Virtual equity <strong>{money(summary.equity)}</strong>
              </span>
              <button
                className="icon-button"
                aria-label={bottom ? 'Collapse trading panel' : 'Expand trading panel'}
                onClick={() => setBottom((v) => (v ? null : 'paper'))}
              >
                <ChevronDown size={15} style={{ transform: bottom ? '' : 'rotate(180deg)' }} />
              </button>
            </div>
            {bottom === 'paper' ? (
              <div className="paper-content">
                <div className="paper-order">
                  <div className="order-title">
                    <span className="eyebrow">SIMULATED ORDER</span>
                    <span>Market · {symbol}</span>
                  </div>
                  <div className="order-fields">
                    <div className="segmented">
                      <button
                        className={side === 'buy' ? 'buy selected' : ''}
                        onClick={() => setSide('buy')}
                      >
                        Buy
                      </button>
                      <button
                        className={side === 'sell' ? 'sell selected' : ''}
                        onClick={() => setSide('sell')}
                      >
                        Sell
                      </button>
                    </div>
                    <label>
                      Lots
                      <input
                        aria-label="Order lots"
                        type="number"
                        min={instrument.minLots}
                        step={instrument.lotStep}
                        value={lots}
                        onChange={(e) => setLots(e.target.value)}
                      />
                    </label>
                    <label>
                      Stop loss
                      <input
                        aria-label="Stop loss"
                        type="number"
                        step={10 ** -instrument.decimals}
                        value={stop}
                        onChange={(e) => setStop(e.target.value)}
                      />
                    </label>
                    <label>
                      Take profit
                      <input
                        aria-label="Take profit"
                        type="number"
                        step={10 ** -instrument.decimals}
                        value={target}
                        onChange={(e) => setTarget(e.target.value)}
                      />
                    </label>
                    <button className="primary-button" onClick={openPaper}>
                      Place paper order
                    </button>
                  </div>
                  <p className="order-estimate">
                    <span
                      className={
                        orderRisk > Math.max(0, summary.equity) * paper.settings.riskPerTrade
                          ? 'negative'
                          : 'positive'
                      }
                    >
                      Estimated stop risk{' '}
                      {Number.isFinite(orderRisk) && Number(stop) > 0 ? money(orderRisk) : '—'}
                    </span>
                    <span>
                      Margin model{' '}
                      {Number.isFinite(orderMargin) && Number(lots) > 0 ? money(orderMargin) : '—'}
                    </span>
                  </p>
                  <p className="microcopy">
                    50 virtual USD · 0.5% risk/order (
                    {money(Math.max(0, summary.equity) * paper.settings.riskPerTrade)}) · 1:100
                    model · Fees excluded. Orders above the risk or margin limit are rejected.
                  </p>
                </div>
                {paper.positions.length ? (
                  <div className="position-list">
                    {paper.positions.map((p) => (
                      <div className="position-row" key={p.id}>
                        <span className={p.side === 'buy' ? 'positive' : 'negative'}>
                          {p.side.toUpperCase()}
                        </span>
                        <strong>{p.instrument}</strong>
                        <span>{p.lots} lots</span>
                        <span>
                          @ {p.entryPrice.toFixed(INSTRUMENT_BY_ID[p.instrument].decimals)}
                        </span>
                        <span>
                          SL {p.stopLoss} · TP {p.takeProfit}
                        </span>
                        <button
                          className="text-button"
                          onClick={() => {
                            try {
                              setPaper(closePaperPosition(paper, p.id, last.close, last.time));
                              notify('Paper position closed.');
                            } catch (e) {
                              notify(e instanceof Error ? e.message : 'Cannot close position');
                            }
                          }}
                        >
                          Close now <X size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-inline">
                    <span className="empty-cross">+</span>
                    <span>No open positions. Practice entries and exits with replay.</span>
                    <span>
                      Free margin <strong>{money(summary.freeMargin)}</strong>
                    </span>
                  </div>
                )}
              </div>
            ) : null}
            {bottom === 'journal' ? (
              <div className="journal-content">
                <div className="journal-summary">
                  <span>
                    Realized P&L{' '}
                    <b className={summary.closedPnl >= 0 ? 'positive' : 'negative'}>
                      {money(summary.closedPnl)}
                    </b>
                  </span>
                  <span>{paper.trades.length} closed trades</span>
                  <button
                    className="text-button"
                    onClick={() =>
                      downloadFile('signalhive-paper-journal.json', JSON.stringify(paper, null, 2))
                    }
                  >
                    <Download size={14} /> Export journal
                  </button>
                </div>
                {paper.trades.length ? (
                  <div className="journal-table">
                    <table>
                      <thead>
                        <tr>
                          <th>Symbol</th>
                          <th>Side / lots</th>
                          <th>Entry</th>
                          <th>Exit</th>
                          <th>Reason</th>
                          <th>P&L</th>
                        </tr>
                      </thead>
                      <tbody>
                        {paper.trades
                          .slice()
                          .reverse()
                          .map((t) => (
                            <tr key={t.id}>
                              <td>{t.instrument}</td>
                              <td>
                                {t.side} {t.lots}
                              </td>
                              <td>{t.entryPrice}</td>
                              <td>{t.exitPrice}</td>
                              <td>{t.reason}</td>
                              <td className={t.pnl >= 0 ? 'positive' : 'negative'}>
                                {money(t.pnl)}
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="empty-panel">
                    <BookOpen size={22} />
                    <p>Your completed paper trades will appear here.</p>
                  </div>
                )}
              </div>
            ) : null}
          </section>
        </main>
        {sidebar ? (
          <aside className="side-panel">
            <div className="side-tabs" aria-label="Side panel">
              <button
                aria-label="Watchlist"
                className={tab === 'watchlist' ? 'active' : ''}
                onClick={() => setTab('watchlist')}
              >
                <Layers3 size={17} />
              </button>
              <button
                aria-label="Drawing objects"
                className={tab === 'drawings' ? 'active' : ''}
                onClick={() => setTab('drawings')}
              >
                <Square size={17} />
              </button>
              <button
                aria-label="Price alerts"
                className={tab === 'alerts' ? 'active' : ''}
                onClick={() => setTab('alerts')}
              >
                <Bell size={17} />
              </button>
              <span />
              {window.innerWidth < 760 ? (
                <button
                  className="icon-button"
                  aria-label="Close side panel"
                  onClick={() => setSidebar(false)}
                >
                  <X size={16} />
                </button>
              ) : null}
            </div>
            {tab === 'watchlist' ? (
              <>
                <div className="side-heading">
                  <h2>Watchlist</h2>
                  <span className="subtle-tag">SIMULATED</span>
                </div>
                <div className="watchlist-labels">
                  <span>Symbol</span>
                  <span>Last / change</span>
                </div>
                {watchRows.map(({ instrument: i, end, pct }) => {
                  return (
                    <button
                      className={`watch-row ${i.id === symbol ? 'selected' : ''}`}
                      key={i.id}
                      onClick={() => changeMarket(i.id)}
                    >
                      <div>
                        <strong>{i.id}</strong>
                        <small>{i.name}</small>
                      </div>
                      <div>
                        <strong>{end.close.toFixed(i.decimals)}</strong>
                        <small className={pct >= 0 ? 'positive' : 'negative'}>
                          {pct >= 0 ? '+' : ''}
                          {pct.toFixed(2)}%
                        </small>
                      </div>
                    </button>
                  );
                })}
                <div className="side-instrument">
                  <span className={`symbol-coin large ${symbol.toLowerCase()}`}>
                    {symbol === 'XAUUSD' ? 'Au' : symbol === 'EURUSD' ? '€' : '₿'}
                  </span>
                  <h2>{symbol}</h2>
                  <p>{instrument.name}</p>
                  <strong>{last.close.toFixed(instrument.decimals)}</strong>
                  <span className="subtle-tag">
                    {imported ? 'IMPORTED' : 'SIMULATED'} · NOT A LIVE QUOTE
                  </span>
                </div>
                <div className="side-section">
                  <h3>Your workspace</h3>
                  <div className="stat-line">
                    <span>Active studies</span>
                    <strong>{Object.values(indicators).filter(Boolean).length}</strong>
                  </div>
                  <div className="stat-line">
                    <span>Drawings</span>
                    <strong>{drawings.length}</strong>
                  </div>
                  <div className="stat-line">
                    <span>Source candles</span>
                    <strong>{candles.length.toLocaleString()}</strong>
                  </div>
                  <button
                    className="secondary-button full"
                    onClick={() => csvInput.current?.click()}
                  >
                    <FileUp size={15} /> Import your OHLCV
                  </button>
                </div>
                <div className="side-note">
                  <span className="eyebrow">A QUIETER WORKSPACE</span>
                  <p>
                    Your drawings and studies save on this device. Export a workspace to take them
                    with you.
                  </p>
                  <button className="text-button" onClick={() => setDialog('workspace')}>
                    Manage workspace <ArrowRight size={14} />
                  </button>
                </div>
              </>
            ) : null}
            {tab === 'drawings' ? (
              <>
                <div className="side-heading">
                  <h2>Drawings</h2>
                  <span className="count">{drawings.length}</span>
                </div>
                <div className="side-section compact">
                  <h3>Market phases · manual annotations</h3>
                  <div className="zone-buttons">
                    {AMD_ZONES.map((z) => (
                      <button
                        key={z.name}
                        style={{ borderColor: z.color + '55', color: z.color }}
                        onClick={() => {
                          setPickingProfile(false);
                          setZonePreset(z);
                          setTool('rectangle');
                        }}
                      >
                        {z.name}
                      </button>
                    ))}
                  </div>
                  <p className="microcopy">
                    Choose a phase, then click two chart corners. Labels are your interpretation,
                    not automatic detection.
                  </p>
                </div>
                <div className="side-section compact">
                  <button className="switch-row" onClick={() => setProfile((p) => !p)}>
                    <span>Fixed-range volume profile</span>
                    <span className={`toggle ${profile ? 'on' : ''}`} />
                  </button>
                  {profileResult.error ? (
                    <p className="microcopy negative" role="alert">
                      {profileResult.error}
                    </p>
                  ) : null}
                  {profile ? (
                    <>
                      <button
                        className="secondary-button full"
                        onClick={() => {
                          setPickingProfile(true);
                          setZonePreset(null);
                          setTool('rectangle');
                        }}
                      >
                        Draw profile time range
                      </button>
                      {profileRange ? (
                        <>
                          <p className="microcopy">
                            Using the drawn time range. Drag its handles to change it.
                          </p>
                          <button className="text-button" onClick={() => setProfileRangeId(null)}>
                            Use recent bars instead
                          </button>
                        </>
                      ) : null}
                      <label className="range-label">
                        Last {profileBars} bars
                        <input
                          type="range"
                          min="20"
                          max={Math.max(20, candles.length)}
                          value={profileBars}
                          onChange={(e) => setProfileBars(Number(e.target.value))}
                        />
                      </label>
                      <label className="range-label">
                        Price bins: {profileBins}
                        <input
                          type="range"
                          min="12"
                          max="64"
                          step="4"
                          value={profileBins}
                          onChange={(e) => setProfileBins(Number(e.target.value))}
                        />
                      </label>
                      <p className="microcopy">
                        70% value area. Volume is spread across candle ranges: an OHLCV estimate,
                        without bid/ask or order-book data.
                      </p>
                    </>
                  ) : null}
                </div>
                {drawings.length ? (
                  <div className="objects-list">
                    {drawings.map((d) => (
                      <div
                        className={`object-row ${selected === d.id ? 'selected' : ''}`}
                        key={d.id}
                      >
                        <button className="object-name" onClick={() => setSelected(d.id)}>
                          <i style={{ background: d.color }} />
                          <span>
                            {d.text || TOOL_ITEMS.find((t) => t.id === d.tool)?.name || d.tool}
                          </span>
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${d.hidden ? 'Show' : 'Hide'} ${d.tool}`}
                          onClick={() => setDrawing(d.id, { hidden: !d.hidden })}
                        >
                          {d.hidden ? <EyeOff size={14} /> : <Eye size={14} />}
                        </button>
                        <button
                          className="icon-button"
                          aria-label={`${d.locked ? 'Unlock' : 'Lock'} ${d.tool}`}
                          onClick={() => setDrawing(d.id, { locked: !d.locked })}
                        >
                          {d.locked ? <LockKeyhole size={13} /> : <UnlockKeyhole size={13} />}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="empty-panel">
                    <Square size={25} />
                    <p>
                      A clear canvas.
                      <br />
                      Choose a tool on the left to begin.
                    </p>
                  </div>
                )}
                {selectedDrawing ? (
                  <div className="side-section drawing-inspector">
                    <h3>Selected drawing</h3>
                    <label>
                      Label
                      <input
                        aria-label="Drawing label"
                        value={selectedDrawing.text ?? ''}
                        maxLength={120}
                        disabled={selectedDrawing.locked}
                        onChange={(e) => setDrawing(selectedDrawing.id, { text: e.target.value })}
                      />
                    </label>
                    <label>
                      Color
                      <input
                        aria-label="Drawing color"
                        type="color"
                        value={selectedDrawing.color}
                        disabled={selectedDrawing.locked}
                        onChange={(e) => setDrawing(selectedDrawing.id, { color: e.target.value })}
                      />
                    </label>
                    <p className="microcopy">
                      Select a drawing on the chart, then drag its center or handles. Lock it to
                      prevent accidental moves.
                    </p>
                    <button
                      className="secondary-button danger-hover"
                      disabled={selectedDrawing.locked}
                      onClick={deleteSelected}
                    >
                      <Trash2 size={14} /> Delete selected
                    </button>
                  </div>
                ) : null}
              </>
            ) : null}
            {tab === 'alerts' ? (
              <>
                <div className="side-heading">
                  <h2>Replay alerts</h2>
                  <Bell size={16} />
                </div>
                <div className="side-section">
                  <p className="muted">
                    A local alert when the replay's closing price crosses your level. Keep this app
                    open.
                  </p>
                  <label>
                    Price for {symbol}
                    <input
                      aria-label="Alert price"
                      type="number"
                      value={alertPrice}
                      step={10 ** -instrument.decimals}
                      onChange={(e) => setAlertPrice(e.target.value)}
                    />
                  </label>
                  <button
                    className="primary-button full"
                    onClick={() => {
                      const price = Number(alertPrice);
                      if (!Number.isFinite(price) || price <= 0) {
                        notify('Enter a positive price.');
                        return;
                      }
                      if (alerts.length >= 50) {
                        notify('Remove an alert before adding another.');
                        return;
                      }
                      setAlerts((a) => [
                        ...a,
                        { id: crypto.randomUUID(), symbol, price, start: last.close, fired: false },
                      ]);
                      setAlertPrice('');
                    }}
                  >
                    <Plus size={14} /> Add local alert
                  </button>
                </div>
                {alerts.map((a) => (
                  <div className="alert-row" key={a.id}>
                    <span>
                      <strong>{a.symbol}</strong>
                      <small>
                        {a.price} · {a.fired ? 'Triggered' : 'Waiting'}
                      </small>
                    </span>
                    <button
                      className="icon-button"
                      aria-label="Remove alert"
                      onClick={() => setAlerts((list) => list.filter((x) => x.id !== a.id))}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <p className="side-footnote">
                  No phone calls, push messages or broker orders. Alerts reset when this window
                  reloads.
                </p>
              </>
            ) : null}
          </aside>
        ) : null}
      </div>
      <footer className="app-footer">
        <span>
          <i /> LOCAL WORKSPACE
        </span>
        <span>Paper trading · {imported ? 'Imported OHLCV' : 'Synthetic OHLCV'}</span>
        <a href="https://www.tradingview.com/" target="_blank" rel="noreferrer">
          Charts by TradingView Lightweight Charts™
        </a>
        <span className="version">v0.1.0 · Open source</span>
      </footer>
      <input ref={csvInput} type="file" accept=".csv,text/csv" hidden onChange={importCSV} />
      <input
        ref={workspaceInput}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={importWorkspace}
      />
      {message ? (
        <div className="toast" role="status">
          <span>{message}</span>
          <button
            className="icon-button"
            aria-label="Dismiss message"
            onClick={() => setMessage('')}
          >
            <X size={16} />
          </button>
        </div>
      ) : null}
      {dialog === 'library' ? (
        <Modal title="Indicators & studies" onClose={() => setDialog(null)} wide>
          <div className="library-tabs">
            {(['indicators', 'presets', 'scripts'] as const).map((t) => (
              <button
                className={libraryTab === t ? 'active' : ''}
                key={t}
                onClick={() => setLibraryTab(t)}
              >
                {t === 'scripts' ? 'Study editor' : t[0].toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
          {libraryTab === 'indicators' ? (
            <>
              <label className="search-input">
                <Search size={17} />
                <input
                  autoFocus
                  placeholder="Search indicators, momentum, volume…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="indicator-grid">
                {LIBRARY.filter((i) =>
                  `${i.name} ${i.description} ${i.category}`
                    .toLowerCase()
                    .includes(query.toLowerCase())
                ).map((i) => (
                  <button
                    className={`indicator-card ${indicators[i.id] ? 'enabled' : ''}`}
                    key={i.id}
                    onClick={() => setIndicators((v) => ({ ...v, [i.id]: !v[i.id] }))}
                    aria-pressed={indicators[i.id]}
                  >
                    <span className="indicator-card-top">
                      <span className="category" style={{ color: i.color }}>
                        {i.category}
                      </span>
                      <span className={`check-circle ${indicators[i.id] ? 'checked' : ''}`}>
                        {indicators[i.id] ? <Check size={12} /> : <Plus size={12} />}
                      </span>
                    </span>
                    <strong>{i.name}</strong>
                    <p>{i.description}</p>
                  </button>
                ))}
              </div>
            </>
          ) : null}
          {libraryTab === 'presets' ? (
            <div className="presets-list">
              {[
                ...PRESETS,
                ...customPresets.map((p) => ({ ...p, description: 'Your saved study preset.' })),
              ].map((p, index) => (
                <button
                  key={`${p.name}-${index}`}
                  onClick={() => {
                    setIndicators({ ...p.indicators });
                    notify(`Applied “${p.name}”.`);
                    setDialog(null);
                  }}
                >
                  <span className="preset-icon">
                    <Layers3 size={21} />
                  </span>
                  <span>
                    <strong>{p.name}</strong>
                    <small>{p.description}</small>
                  </span>
                  <ArrowRight size={17} />
                </button>
              ))}
            </div>
          ) : null}
          {libraryTab === 'scripts' ? (
            <div className="study-editor">
              <div className="callout">
                <Code2 size={18} />
                <p>
                  Save a reusable study as JSON. This editor combines the built-in indicators; it
                  does not execute JavaScript or Pine Script.
                </p>
              </div>
              <textarea
                aria-label="Study preset JSON"
                spellCheck={false}
                value={script}
                onChange={(e) => setScript(e.target.value)}
              />
              <div className="modal-actions">
                <button
                  className="secondary-button"
                  onClick={() =>
                    setScript(JSON.stringify({ version: 1, name: 'My study', indicators }, null, 2))
                  }
                >
                  Use current indicators
                </button>
                <button className="primary-button" onClick={savePreset}>
                  Save & apply study
                </button>
              </div>
            </div>
          ) : null}
        </Modal>
      ) : null}
      {dialog === 'symbols' ? (
        <Modal title="Choose a market" onClose={() => setDialog(null)}>
          <label className="search-input">
            <Search size={17} />
            <input
              autoFocus
              placeholder="Search symbol or name…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <div className="market-results">
            {INSTRUMENTS.filter((i) =>
              `${i.id} ${i.name}`.toLowerCase().includes(query.toLowerCase())
            ).map((i) => (
              <button key={i.id} onClick={() => changeMarket(i.id)}>
                <strong>{i.id}</strong>
                <span>{i.name}</span>
                <span className="subtle-tag">SIMULATED</span>
              </button>
            ))}
          </div>
          <p className="microcopy">
            These datasets are generated examples. Import a CSV for your own prices. No live
            exchange or broker feed is connected.
          </p>
        </Modal>
      ) : null}
      {dialog === 'tools' ? (
        <Modal title="Drawing toolbox" onClose={() => setDialog(null)} wide>
          <div className="tool-grid">
            {TOOL_ITEMS.filter((t) => t.id !== 'cursor').map(
              ({ id, name, icon: Icon, key, group }) => (
                <button key={id} onClick={() => chooseTool(id)}>
                  <Icon size={20} />
                  <span>
                    <strong>{name}</strong>
                    <small>{group}</small>
                  </span>
                  {key ? <kbd>{key}</kbd> : null}
                </button>
              )
            )}
          </div>
          <div className="zone-tool-section">
            <h3>Accumulation · Manipulation · Distribution</h3>
            <p>Manually mark your market-phase hypothesis with named, colored zones.</p>
            <div className="zone-buttons">
              {AMD_ZONES.map((z) => (
                <button
                  key={z.name}
                  style={{ color: z.color, borderColor: z.color + '66' }}
                  onClick={() => {
                    setPickingProfile(false);
                    setZonePreset(z);
                    setTool('rectangle');
                    setDialog(null);
                  }}
                >
                  {z.name}
                </button>
              ))}
            </div>
          </div>
        </Modal>
      ) : null}
      {dialog === 'workspace' ? (
        <Modal title="Your workspace" onClose={() => setDialog(null)}>
          <div className="workspace-actions">
            <button
              onClick={() =>
                downloadFile(
                  'signalhive-workspace.json',
                  JSON.stringify(
                    { version: 1, symbol, timeframe, indicators, drawings: drawingMap },
                    null,
                    2
                  )
                )
              }
            >
              <Download size={20} />
              <span>
                <strong>Export workspace</strong>
                <small>Drawings and studies · no account credentials</small>
              </span>
            </button>
            <button onClick={() => workspaceInput.current?.click()}>
              <FileUp size={20} />
              <span>
                <strong>Import workspace</strong>
                <small>Load a previously exported JSON backup</small>
              </span>
            </button>
            <button onClick={() => csvInput.current?.click()}>
              <FileUp size={20} />
              <span>
                <strong>Import candles from CSV</strong>
                <small>time, open, high, low, close, volume</small>
              </span>
            </button>
            <button
              onClick={() => downloadFile(`${symbol}-candles.csv`, exportCSV(candles), 'text/csv')}
            >
              <Download size={20} />
              <span>
                <strong>Export visible history</strong>
                <small>
                  {candles.length} candles · {imported ? 'imported' : 'simulated'}
                </small>
              </span>
            </button>
            {imported ? (
              <button onClick={() => changeMarket(symbol)}>
                <RotateCcw size={20} />
                <span>
                  <strong>Return to simulated data</strong>
                  <small>Close open paper positions first</small>
                </span>
              </button>
            ) : null}
          </div>
          <p className="microcopy">
            CSV timestamps: UTC Unix seconds or ISO dates. Rows must be strictly chronological. Your
            file stays on this device. Workspaces do not include CSV data; export it separately.
          </p>
        </Modal>
      ) : null}
      {dialog === 'settings' ? (
        <Modal title="Workspace settings" onClose={() => setDialog(null)}>
          <button className="switch-row" onClick={() => setGrid((g) => !g)}>
            <span>Chart grid</span>
            <span className={`toggle ${grid ? 'on' : ''}`} />
          </button>
          <button className="switch-row" onClick={() => setSidebar((s) => !s)}>
            <span>Side panel</span>
            <span className={`toggle ${sidebar ? 'on' : ''}`} />
          </button>
          <div className="settings-section">
            <h3>Virtual account</h3>
            <p>
              Initial balance {money(paper.initialBalance)} · 0.5% maximum risk per trade · 2%
              aggregate stop risk. Margin uses a simplified 1:100 model. No commission, spread,
              funding or broker execution.
            </p>
            <button
              className="secondary-button"
              onClick={() => {
                if (paper.positions.length) {
                  notify('Close open paper positions before resetting.');
                  return;
                }
                downloadFile('signalhive-paper-before-reset.json', JSON.stringify(paper, null, 2));
                setPaper(createPaperAccount());
                notify('Journal exported and paper account reset to 50 virtual USD.');
              }}
            >
              Export journal & reset to $50
            </button>
          </div>
          <div className="settings-section">
            <h3>About Signalhive</h3>
            <p>
              Free and open source. Built with React, TypeScript and TradingView Lightweight
              Charts™. This is an independent project, not affiliated with TradingView or
              MetaQuotes.
            </p>
            <p>
              Drawings are analysis aids. The study editor is a declarative preset library; full
              Pine Script and live broker connectivity are not included.
            </p>
            <a
              className="text-button"
              href="https://github.com/Maaskk/signalhive-charts"
              target="_blank"
              rel="noreferrer"
            >
              Source, licenses & platform downloads <ArrowRight size={14} />
            </a>
          </div>
        </Modal>
      ) : null}
      {dialog === 'help' ? (
        <Modal title="Make the workspace yours" onClose={() => setDialog(null)} wide>
          <div className="help-grid">
            <section>
              <h3>Navigate</h3>
              <p>
                Drag the chart to pan. Use the wheel or pinch to zoom. Drag the right price axis to
                scale vertically; double-click it to reset. The + / − buttons and Fit control sit
                under the chart.
              </p>
              <h3>Draw & organize</h3>
              <p>
                Choose a tool, then click its anchor points. Long/short: click entry and stop to
                create a 2R target; drag handles to edit it. Green is target, red is risk. These
                boxes do not place orders.
              </p>
              <p>
                Use the Drawings tab to name, hide, lock, recolor or delete objects. Accumulation,
                Manipulation and Distribution are labeled rectangle presets.
              </p>
              <h3>Volume profile</h3>
              <p>
                Enable it from the left toolbar or Drawings panel. Select the number of recent bars
                and price bins. POC is the largest bin; VAH and VAL bound a 70% value area. This is
                an estimate from OHLCV, not real tick-level order flow.
              </p>
            </section>
            <section>
              <h3>Keyboard shortcuts</h3>
              <div className="shortcut-list">
                {TOOL_ITEMS.filter((t) => t.key).map((t) => (
                  <div key={t.id}>
                    <span>{t.name}</span>
                    <kbd>{t.key}</kbd>
                  </div>
                ))}
                <div>
                  <span>Undo / redo drawing</span>
                  <kbd>Ctrl/⌘ Z / ⇧ Z</kbd>
                </div>
                <div>
                  <span>Symbol search</span>
                  <kbd>Ctrl/⌘ K</kbd>
                </div>
                <div>
                  <span>Cancel / select</span>
                  <kbd>Esc</kbd>
                </div>
                <div>
                  <span>Delete selected</span>
                  <kbd>Del</kbd>
                </div>
              </div>
              <h3>Practice with replay</h3>
              <p>
                Replay rewinds 100 candles; Play or Next advances it. Open paper positions and use
                Close now to exit early. Stops and targets are checked on later candles; if both
                touch, stop fills first. A $50 account may reject gold orders because of the risk or
                margin limit.
              </p>
              <h3>Data & saving</h3>
              <p>
                The starting markets are synthetic examples. Import OHLCV CSV for your own history.
                Drawings, studies and paper sessions save locally; export backups from the workspace
                menu.
              </p>
            </section>
          </div>
        </Modal>
      ) : null}
    </div>
  );
}
