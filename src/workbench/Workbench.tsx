import { useEffect, useRef, useState } from 'react';
import { VelaWorkspace } from '@luxalgo/vela/workspace';
import { drawingTypes } from '@luxalgo/vela';
import { parseCSV } from '../lib/market';
import { mt5SnapshotFreshness, parseMT5Snapshot } from '../lib/mt5Snapshot';
import type { InstrumentId } from '../types';
import {
  WorkbenchProvider,
  inferBaseMinutes,
  parseCSVSource,
  sourceKey,
  sourceSymbol,
  sourceTimeframes,
  type DataSource,
} from './data';
import { restoreCSV, saveCSV } from './storage';
import { BundledStudyEngine, STUDIES } from './studies';
import './workbench.css';

const MEMORY = 'signalhive-workbench-v2-source';
const tools = drawingTypes();
type Panel = 'source' | 'tools' | 'guide' | null;
const messageOf = (e: unknown) =>
  e instanceof Error ? e.message : 'The operation could not be completed.';
function download(name: string, value: string, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
async function readMT5() {
  const response = await fetch('http://127.0.0.1:18743/api/mt5', {
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('Open the installed local app and MT5 demo terminal first.');
  const snapshot = parseMT5Snapshot(await response.json());
  if (!snapshot.connected)
    throw new Error(`MT5 adapter: ${snapshot.error}. Last candles remain visible.`);
  if (mt5SnapshotFreshness(snapshot, Date.now() / 1000).snapshotStale)
    throw new Error('MT5 snapshot is stale. Last candles remain visible.');
  sourceSymbol({ kind: 'mt5', snapshot });
  return snapshot;
}

export default function Workbench() {
  const [source, setSource] = useState<DataSource | null>(null);
  const [panel, setPanel] = useState<Panel>(null);
  const [query, setQuery] = useState('');
  const [csvSymbol, setCsvSymbol] = useState<InstrumentId>('XAUUSD');
  const [message, setMessage] = useState('Restoring workspace…');
  const [connection, setConnection] = useState('');
  const [busy, setBusy] = useState(false);
  const [replaying, setReplaying] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [replayDate, setReplayDate] = useState('');
  const [pace, setPace] = useState(1000);
  const host = useRef<HTMLDivElement>(null);
  const workspace = useRef<VelaWorkspace | null>(null);
  const provider = useRef<WorkbenchProvider | null>(null);
  const csvInput = useRef<HTMLInputElement>(null);
  const layoutInput = useRef<HTMLInputElement>(null);
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const revision = useRef(0);
  const pendingLayout = useRef<unknown>(null);
  const localDesktop = location.port === '18743' || '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    let stopped = false;
    const ticket = revision.current;
    void (async () => {
      try {
        const saved = localStorage.getItem(MEMORY);
        if (saved === 'csv') {
          const imported = await restoreCSV();
          if (!imported)
            throw new Error('Saved CSV is unavailable. Import it again or choose simulation.');
          if (!stopped && ticket === revision.current) setSource(imported);
        } else if (saved === 'mt5') {
          if (!localDesktop)
            throw new Error(
              'This workspace used local MT5. Open the installed app or choose another source.'
            );
          const snapshot = await readMT5();
          if (!stopped && ticket === revision.current) setSource({ kind: 'mt5', snapshot });
        } else if (!stopped && ticket === revision.current) setSource({ kind: 'simulation' });
      } catch (e) {
        if (!stopped && ticket === revision.current) {
          setMessage(messageOf(e));
          setPanel('source');
        }
      }
    })();
    return () => {
      stopped = true;
    };
  }, [localDesktop]);

  const key = source ? sourceKey(source) : '';
  useEffect(() => {
    const current = sourceRef.current;
    if (!host.current || !current) return;
    const data = new WorkbenchProvider(current);
    const engines: BundledStudyEngine[] = [];
    let ws: VelaWorkspace;
    try {
      ws = new VelaWorkspace(host.current, {
        symbol: `signalhive:${sourceSymbol(current)}`,
        timeframe: sourceTimeframes(current).includes('15') ? '15' : sourceTimeframes(current)[0],
        providers: { signalhive: () => data },
        live: current.kind === 'mt5',
        bars: 600,
        theme: 'dark',
        layout: '1',
        nativeBackend: 'canvas2d',
        glow: 0,
        animations: { intro: false, zoom: 100, pan: 100 },
        persist: `signalhive-workbench-v2-layout-${key}`,
        statusline: false,
        timeframes: sourceTimeframes(current),
        timezone: 'Etc/UTC',
        engines: {
          pine: () => {
            const engine = new BundledStudyEngine();
            engines.push(engine);
            return engine;
          },
        },
        indicators: STUDIES,
        sync: { crosshair: true },
      });
      workspace.current = ws;
      provider.current = data;
      if (pendingLayout.current) {
        ws.applyState(pendingLayout.current);
        pendingLayout.current = null;
      }
      setReplaying(false);
      setPlaying(false);
      setConnection('');
      setMessage('Workspace ready. Double-click a drawing or study legend to edit its settings.');
    } catch (e) {
      data.destroy();
      engines.forEach((e) => e.terminate());
      setMessage(messageOf(e));
      return;
    }
    const off = [
      ws.replay.on('replay:start', () => setReplaying(true)),
      ws.replay.on('replay:end', () => {
        setReplaying(false);
        setPlaying(false);
      }),
      ws.replay.on('replay:play', () => setPlaying(true)),
      ws.replay.on('replay:pause', () => setPlaying(false)),
    ];
    const hide = () => {
      if (document.hidden) ws.replay.pause();
    };
    document.addEventListener('visibilitychange', hide);
    return () => {
      document.removeEventListener('visibilitychange', hide);
      off.forEach((f) => f());
      ws.destroy();
      engines.forEach((e) => e.terminate());
      data.destroy();
      workspace.current = null;
      provider.current = null;
    };
  }, [key]);

  useEffect(() => {
    if (source?.kind !== 'mt5') return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (!stopped && !document.hidden) {
        try {
          const snapshot = await readMT5();
          if (!stopped) {
            provider.current?.updateSnapshot(snapshot);
            sourceRef.current = { kind: 'mt5', snapshot };
            setSource(sourceRef.current);
            setConnection(
              mt5SnapshotFreshness(snapshot, Date.now() / 1000).quoteStale
                ? 'Stale broker quote'
                : 'Connected · read only'
            );
          }
        } catch (e) {
          if (!stopped) setConnection(messageOf(e));
        }
      }
      if (!stopped) timer = setTimeout(poll, 4000);
    };
    void poll();
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [source?.kind]);

  async function changeSource(next: DataSource) {
    revision.current++;
    setSource(next);
    setPanel(null);
    setConnection('');
    try {
      localStorage.setItem(MEMORY, next.kind);
    } catch {
      setMessage('Storage is full. This source will not restore after closing.');
    }
  }
  async function importCSV(file?: File) {
    if (!file) return;
    const ticket = ++revision.current;
    setBusy(true);
    try {
      if (file.size > 15_000_000)
        throw new Error('Use a CSV smaller than 15 MB (at most 100,000 candles).');
      const text = await file.text();
      const bars = parseCSV(text);
      const baseMinutes = inferBaseMinutes(bars);
      const digest = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(csvSymbol + text)
      );
      const id = Array.from(new Uint8Array(digest))
        .map((v) => v.toString(16).padStart(2, '0'))
        .join('')
        .slice(0, 24);
      const next: Extract<DataSource, { kind: 'csv' }> = {
        kind: 'csv',
        name: file.name,
        symbol: csvSymbol,
        bars,
        baseMinutes,
        id,
      };
      await saveCSV(next);
      if (ticket === revision.current) await changeSource(next);
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
      if (csvInput.current) csvInput.current.value = '';
    }
  }
  async function connect() {
    const ticket = ++revision.current;
    setBusy(true);
    try {
      const snapshot = await readMT5();
      if (ticket === revision.current) await changeSource({ kind: 'mt5', snapshot });
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      setBusy(false);
    }
  }
  function exportLayout() {
    const ws = workspace.current;
    if (!ws || !source) return;
    // MT5 credentials, account totals and quotes never enter workspace exports.
    download(
      'signalhive-workspace.json',
      JSON.stringify({
        application: 'signalhive-workbench',
        version: 2,
        source:
          source.kind === 'csv'
            ? source
            : source.kind === 'mt5'
              ? {
                  kind: 'mt5',
                  symbol: source.snapshot.symbol,
                  timeframe: source.snapshot.timeframe,
                }
              : { kind: source.kind },
        layout: ws.getState(),
      })
    );
    setMessage('Workspace exported. MT5 account details are excluded.');
  }
  async function importLayout(file?: File) {
    if (!file) return;
    try {
      if (file.size > 20_000_000) throw new Error('Workspace backup exceeds 20 MB.');
      const input = JSON.parse(await file.text());
      if (
        input.application !== 'signalhive-workbench' ||
        input.version !== 2 ||
        !input.layout ||
        !['csv', 'simulation', 'mt5'].includes(input.source?.kind)
      )
        throw new Error('This backup must be a version 2 Signalhive workspace.');
      if (input.source.kind === 'mt5' && source?.kind !== 'mt5')
        throw new Error('Connect the same local MT5 market before restoring this layout.');
      if (
        input.source.kind === 'mt5' &&
        source?.kind === 'mt5' &&
        (input.source.symbol !== source.snapshot.symbol ||
          input.source.timeframe !== source.snapshot.timeframe)
      )
        throw new Error('This backup belongs to a different MT5 symbol or base interval.');
      const next: DataSource =
        input.source.kind === 'csv'
          ? parseCSVSource(input.source)
          : input.source.kind === 'mt5'
            ? source!
            : { kind: 'simulation' };
      if (next.kind === 'csv') await saveCSV(next);
      if (source && sourceKey(next) === sourceKey(source))
        workspace.current?.applyState(input.layout);
      else {
        pendingLayout.current = input.layout;
        await changeSource(next);
      }
      setMessage('Workspace restored.');
    } catch (e) {
      setMessage(messageOf(e));
    } finally {
      if (layoutInput.current) layoutInput.current.value = '';
    }
  }
  async function startReplay() {
    try {
      if (!workspace.current || !replayDate) throw new Error('Choose a replay start time in UTC.');
      const from = Date.parse(replayDate + 'Z');
      if (!Number.isFinite(from)) throw new Error('Choose a valid UTC time.');
      const bounds = workspace.current.replay.bounds;
      if (!bounds || from < bounds.first || from >= bounds.last)
        throw new Error('Choose a start within the loaded chart history, before its last candle.');
      await workspace.current.replay.start({ from });
    } catch (e) {
      setMessage(messageOf(e));
    }
  }
  const label =
    source?.kind === 'simulation'
      ? 'SIMULATED · seeded OHLCV'
      : source?.kind === 'csv'
        ? `CSV · ${source.name}`
        : source
          ? `MT5 DEMO · ${connection || 'read only'}`
          : 'Choose a data source';
  return (
    <main className="workbench">
      <header className="wb-header">
        <a
          className="wb-brand"
          href={location.pathname + location.search}
          aria-label="Signalhive Charts"
        >
          <img src="./icon.svg" alt="" />
          Signalhive <span>Charts</span>
        </a>
        <nav aria-label="Workbench actions">
          <button
            aria-expanded={panel === 'source'}
            onClick={() => setPanel(panel === 'source' ? null : 'source')}
          >
            Data source
          </button>
          <button
            aria-expanded={panel === 'tools'}
            onClick={() => setPanel(panel === 'tools' ? null : 'tools')}
          >
            Drawing library
          </button>
          <button onClick={exportLayout} disabled={!source}>
            Save backup
          </button>
          <button onClick={() => layoutInput.current?.click()}>Restore backup</button>
          <button
            onClick={() => {
              const image = workspace.current?.screenshot();
              if (!image)
                return setMessage('The chart is still loading; image export is unavailable.');
              const a = document.createElement('a');
              a.href = image;
              a.download = 'signalhive-chart.png';
              a.click();
              setMessage('Chart image export requested.');
            }}
            disabled={!source}
          >
            PNG
          </button>
          <button
            aria-expanded={panel === 'guide'}
            onClick={() => setPanel(panel === 'guide' ? null : 'guide')}
          >
            How to use
          </button>
          <a href="?workspace=classic">Previous workspace</a>
        </nav>
      </header>
      <div className="wb-source">
        <span className="wb-dot" />
        {label}
        <span className="wb-source-note">Analysis & drawings · no broker orders</span>
      </div>
      <div className="wb-body">
        {panel && (
          <aside className="wb-panel" aria-label={`${panel} panel`}>
            <div className="wb-panel-title">
              <h2>
                {panel === 'source'
                  ? 'Data sources'
                  : panel === 'tools'
                    ? 'Drawing library'
                    : 'Workspace guide'}
              </h2>
              <button onClick={() => setPanel(null)} aria-label="Close panel">
                ✕
              </button>
            </div>
            {panel === 'source' && (
              <>
                <p>
                  Each source keeps its own chart layout and drawings. Switching does not erase your
                  other workspace.
                </p>
                <button disabled={busy} onClick={() => void changeSource({ kind: 'simulation' })}>
                  Use simulated data
                </button>
                <p className="wb-muted">
                  Seeded practice prices, not market history. No background price polling.
                </p>
                <h3>Import your OHLCV history</h3>
                <label>
                  CSV symbol
                  <select
                    value={csvSymbol}
                    onChange={(e) => setCsvSymbol(e.target.value as InstrumentId)}
                  >
                    <option>XAUUSD</option>
                    <option>EURUSD</option>
                    <option>BTCUSD</option>
                  </select>
                </label>
                <button disabled={busy} onClick={() => csvInput.current?.click()}>
                  Import CSV
                </button>
                <p className="wb-muted">
                  time, open, high, low, close, volume. UTC seconds or ISO timestamps. Only
                  compatible higher intervals are available; lower candles cannot be invented.
                </p>
                <h3>Local MT5 demo</h3>
                <button disabled={busy || !localDesktop} onClick={() => void connect()}>
                  Connect read-only MT5
                </button>
                <p className="wb-muted">
                  Requires the installed local app and an open demo terminal. No passwords, order
                  execution or cloud upload. Polling pauses while the app is hidden.
                </p>
              </>
            )}
            {panel === 'tools' && (
              <>
                <input
                  aria-label="Search drawing tools"
                  placeholder="Search lines, profiles, positions…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
                <p className="wb-muted">
                  Select a tool, then place its anchors on the chart. Double-click the finished
                  drawing for coordinates, colors and tool-specific inputs.
                </p>
                <div className="wb-tools">
                  {tools
                    .filter((t) =>
                      `${t.label} ${t.group}`.toLowerCase().includes(query.toLowerCase())
                    )
                    .map((t) => (
                      <button
                        key={t.type}
                        disabled={!source}
                        onClick={() => {
                          workspace.current?.chart.drawings.setTool(t.type);
                          setMessage(
                            `${t.label}: ${t.placementHint || 'place anchors on the chart, then double-click to edit.'}`
                          );
                          setPanel(null);
                        }}
                      >
                        <strong>{t.label}</strong>
                        <small>{t.group}</small>
                      </button>
                    ))}
                </div>
              </>
            )}
            {panel === 'guide' && (
              <>
                <h3>Charts and studies</h3>
                <p>
                  Use the chart toolbar to change interval, candle style, indicators and chart
                  layout. Double-click the price chart to open its appearance settings. Double-click
                  a study legend to edit its periods, colors and lines.
                </p>
                <h3>Your defaults</h3>
                <p>
                  EMA 9 blue, EMA 21 yellow, EMA 200 red; RSI and MACD in separate panes. The three
                  bundled Pine studies run in a worker. The built-in indicator picker adds other
                  available studies. Arbitrary Pine source is not enabled.
                </p>
                <h3>Positions and volume</h3>
                <p>
                  Long / Short Position draws target and stop regions with editable risk, account
                  size and prices. It places no trade. Quantity is chart units, not MT5 lots. Fixed
                  Range Volume Profile draws an estimated profile from OHLCV, with editable rows,
                  value area, POC, VAH and VAL. It is not exchange tick-at-price data.
                </p>
                <h3>Draw and arrange</h3>
                <p>
                  Use the left toolbar or Drawing library. Select an object to move its anchors;
                  double-click for its full properties. Right-click for object actions. The chart
                  layout menu opens more charts; start with one for the lowest resource use.
                </p>
                <h3>Workspace and replay</h3>
                <p>
                  Changes save locally per source. Export a backup before clearing app data. Choose
                  a UTC start below for replay, then step or play. Replay pauses when the app is
                  hidden.
                </p>
                <p className="wb-muted">
                  This build does not yet match every paid TradingView feature. Exchange feeds,
                  arbitrary Pine compatibility, cloud alerts, strategy testing and automated AMD
                  detection remain gaps.
                </p>
                <a href="https://github.com/Maaskk/signalhive-charts">Source code · AGPL-3.0</a>
              </>
            )}
          </aside>
        )}
        <section ref={host} className="wb-chart" aria-label="Professional chart workspace" />
        {!source && (
          <div className="wb-empty">
            <h1>Choose your chart data</h1>
            <p>{message}</p>
            <button onClick={() => setPanel('source')}>Choose source</button>
          </div>
        )}
      </div>
      <footer className="wb-footer">
        <span role="status">{message}</span>
        <a href="https://github.com/Maaskk/signalhive-charts" target="_blank" rel="noreferrer">
          Source · AGPL-3.0
        </a>
        <a href="./licenses/LICENSE.txt" target="_blank" rel="noreferrer">
          Licence
        </a>
        <a href="https://velacharts.dev" target="_blank" rel="noreferrer">
          Charts by Vela
        </a>
      </footer>
      {source && source.kind !== 'mt5' && (
        <div className="wb-replay" aria-label="Replay controls">
          <strong>Bar replay</strong>
          <label>
            Start (UTC)
            <input
              type="datetime-local"
              value={replayDate}
              onChange={(e) => setReplayDate(e.target.value)}
            />
          </label>
          <button onClick={() => void startReplay()}>Start</button>
          <button disabled={!replaying} onClick={() => workspace.current?.replay.step()}>
            Step
          </button>
          <button
            disabled={!replaying}
            onClick={() =>
              playing ? workspace.current?.replay.pause() : workspace.current?.replay.play(pace)
            }
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <select
            aria-label="Replay speed"
            value={pace}
            onChange={(e) => {
              const value = Number(e.target.value);
              setPace(value);
              if (playing) workspace.current?.replay.play(value);
            }}
          >
            <option value={2000}>0.5×</option>
            <option value={1000}>1×</option>
            <option value={500}>2×</option>
          </select>
          <button disabled={!replaying} onClick={() => workspace.current?.replay.stop()}>
            Exit replay
          </button>
        </div>
      )}
      <input
        ref={csvInput}
        hidden
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => void importCSV(e.target.files?.[0])}
      />
      <input
        ref={layoutInput}
        hidden
        type="file"
        accept=".json,application/json"
        onChange={(e) => void importLayout(e.target.files?.[0])}
      />
    </main>
  );
}
