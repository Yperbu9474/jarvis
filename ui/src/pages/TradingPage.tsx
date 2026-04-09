import React, { useEffect, useMemo, useState } from "react";
import { api, useApiData } from "../hooks/useApi";
import "../styles/trading.css";

type TradingMode = "paper" | "live";

type TradingConfig = {
  enabled: boolean;
  mode: TradingMode;
  allowLiveExecution: boolean;
  symbols: string[];
  scanAllUsdtMarkets: boolean;
  maxMarketScan: number;
  setupsPerRun: number;
  intervalMinutes: number;
  marginCoin: string;
  paperBalance: number;
  maxLeverage: number;
  maxNotionalPerTrade: number;
  maxConcurrentPositions: number;
  maxDailyLoss: number;
  riskPerTradePct: number;
  maxHoldMinutes: number;
  apiKey: string;
  apiSecret: string;
};

type TradingPosition = {
  id: string;
  symbol: string;
  mode: TradingMode;
  side: "LONG" | "SHORT";
  status: "open" | "closed";
  leverage: number;
  quantity: number;
  entryPrice: number;
  currentPrice: number;
  stopLoss: number | null;
  takeProfit: number | null;
  notional: number;
  unrealizedPnl: number;
  realizedPnl: number;
  openedAt: number;
};

type TradingOrder = {
  id: string;
  symbol: string;
  provider: "paper" | "bitunix";
  side: "BUY" | "SELL";
  status: string;
  leverage: number;
  quantity: number;
  price: number;
  createdAt: number;
};

type TradingSignal = {
  id: string;
  symbol: string;
  action: "LONG" | "SHORT" | "HOLD";
  confidence: number;
  price: number;
  rationale: string;
  analyzedAt: number;
};

type TradingRun = {
  id: string;
  trigger: "manual" | "scheduler";
  mode: TradingMode;
  status: string;
  summary: string;
  createdAt: number;
};

type TradingSummary = {
  config: TradingConfig;
  accountEquity: number;
  accountAvailable: number;
  dayPnl: number;
  realizedPnl: number;
  unrealizedPnl: number;
  winRate: number;
  openPositions: TradingPosition[];
  recentOrders: TradingOrder[];
  recentSignals: TradingSignal[];
  recentRuns: TradingRun[];
};

const EMPTY_CONFIG: TradingConfig = {
  enabled: true,
  mode: "paper",
  allowLiveExecution: false,
  symbols: ["BTCUSDT", "ETHUSDT"],
  scanAllUsdtMarkets: true,
  maxMarketScan: 8,
  setupsPerRun: 2,
  intervalMinutes: 1,
  marginCoin: "USDT",
  paperBalance: 10000,
  maxLeverage: 5,
  maxNotionalPerTrade: 1500,
  maxConcurrentPositions: 3,
  maxDailyLoss: 400,
  riskPerTradePct: 0.01,
  maxHoldMinutes: 20,
  apiKey: "",
  apiSecret: "",
};

function money(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  }).format(value);
}

function num(value: number, digits = 2): string {
  return Number(value).toFixed(digits);
}

function time(value: number): string {
  return new Date(value).toLocaleString();
}

function compactAgo(value: number): string {
  const delta = Math.max(0, Date.now() - value);
  const minutes = Math.floor(delta / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default function TradingPage() {
  const { data, loading, error, refetch } = useApiData<TradingSummary>("/api/trading/summary", []);
  const [draft, setDraft] = useState<TradingConfig>(EMPTY_CONFIG);
  const [phase, setPhase] = useState<"idle" | "saving" | "running" | "analyzing">("idle");
  const [message, setMessage] = useState("");
  const [selectedSymbol, setSelectedSymbol] = useState("BTCUSDT");
  const [analysis, setAnalysis] = useState<TradingSignal | null>(null);

  useEffect(() => {
    if (data?.config) {
      setDraft(data.config);
      setSelectedSymbol((current) => current || data.config.symbols[0] || "BTCUSDT");
    }
  }, [data]);

  useEffect(() => {
    const timer = window.setInterval(() => refetch(), 15000);
    return () => window.clearInterval(timer);
  }, [refetch]);

  const symbolText = useMemo(() => draft.symbols.join(", "), [draft.symbols]);
  const openPosition = data?.openPositions?.[0] ?? null;
  const latestRun = data?.recentRuns?.[0] ?? null;
  const latestSignal = data?.recentSignals?.[0] ?? null;
  const engineState = draft.enabled ? "monitoring" : "paused";
  const executionState = draft.mode === "live" && draft.allowLiveExecution ? "armed" : draft.mode === "live" ? "safe" : "paper";
  const statusTone = draft.mode === "live" && draft.allowLiveExecution ? "warn" : "good";

  const setField = <K extends keyof TradingConfig>(key: K, value: TradingConfig[K]) => {
    setDraft((current) => ({ ...current, [key]: value }));
  };

  const saveConfig = async () => {
    setPhase("saving");
    setMessage("");
    try {
      const saved = await api<TradingConfig>("/api/trading/config", {
        method: "POST",
        body: JSON.stringify(draft),
      });
      setDraft(saved);
      setMessage("Trading configuration saved.");
      refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Failed to save trading config.");
    } finally {
      setPhase("idle");
    }
  };

  const runStrategy = async () => {
    setPhase("running");
    setMessage("");
    try {
      const result = await api<{ runId: string; messages: string[] }>("/api/trading/run", {
        method: "POST",
        body: JSON.stringify({ trigger: "manual" }),
      });
      setMessage(result.messages.join(" "));
      refetch();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Run failed.");
    } finally {
      setPhase("idle");
    }
  };

  const analyze = async () => {
    setPhase("analyzing");
    setMessage("");
    try {
      const result = await api<TradingSignal>("/api/trading/analyze", {
        method: "POST",
        body: JSON.stringify({ symbol: selectedSymbol }),
      });
      setAnalysis(result);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Analysis failed.");
    } finally {
      setPhase("idle");
    }
  };

  const downloadCsv = () => {
    window.open("/api/trading/pnl/export", "_blank", "noopener,noreferrer");
  };

  if (loading && !data) {
    return <div className="tr-page"><div className="tr-loading">Loading trading desk...</div></div>;
  }

  return (
    <div className="tr-page">
      <div className="tr-atmosphere" />

      <header className="tr-header">
        <div className="tr-header-copy">
          <div className="tr-header-topline">
            <span className="tr-header-title">Trading Desk</span>
            <span className={`tr-status-badge is-${statusTone}`}>{executionState}</span>
          </div>
          <h1 className="tr-hero">Live perps monitoring, execution, and ledger control</h1>
          <p className="tr-subcopy">
            Continuous Bitunix futures monitoring with strategy controls, live position supervision, market analysis,
            and exportable PnL from the same operating panel.
          </p>
        </div>
        <div className="tr-header-actions">
          <button className="tr-action tr-action-subtle" onClick={analyze} disabled={phase !== "idle"}>Analyze Market</button>
          <button className="tr-action tr-action-subtle" onClick={downloadCsv}>Export PnL CSV</button>
          <button className="tr-action tr-action-primary" onClick={runStrategy} disabled={phase !== "idle"}>Run Cycle</button>
        </div>
      </header>

      <div className="tr-shell">
        <aside className="tr-rail">
          <RailCard
            title="System State"
            items={[
              { label: "Engine", value: engineState, tone: draft.enabled ? "good" : "muted" },
              { label: "Mode", value: draft.mode, tone: draft.mode === "live" ? "warn" : "good" },
              { label: "Execution", value: executionState, tone: statusTone },
              { label: "Universe", value: draft.scanAllUsdtMarkets ? `${draft.maxMarketScan} USDT` : `${draft.symbols.length} custom`, tone: "muted" },
              { label: "Cycle", value: `${draft.intervalMinutes} min`, tone: "muted" },
              { label: "Hold rule", value: `${draft.maxHoldMinutes}m / +0.5%`, tone: "muted" },
            ]}
          />

          <RailCard
            title="Loop Snapshot"
            items={[
              { label: "Last run", value: latestRun ? compactAgo(latestRun.createdAt) : "none", tone: "muted" },
              { label: "Summary", value: latestRun?.summary ?? "No recent cycle.", tone: "muted", multiLine: true },
              { label: "Top setup", value: latestSignal ? `${latestSignal.symbol} ${latestSignal.action}` : "No setup", tone: latestSignal?.action === "LONG" ? "good" : latestSignal?.action === "SHORT" ? "bad" : "muted" },
              { label: "Confidence", value: latestSignal ? `${num(latestSignal.confidence * 100)}%` : "0%", tone: "muted" },
            ]}
          />
        </aside>

        <main className="tr-main">
          {(message || error) && <div className="tr-banner">{message || error}</div>}

          <section className="tr-panel tr-metrics-panel">
            <div className="tr-panel-header">
              <div>
                <div className="tr-panel-kicker">Account</div>
                <h2 className="tr-panel-title">Capital and performance</h2>
              </div>
            </div>
            <div className="tr-metrics-grid">
              <MetricCard label="Equity" value={money(data?.accountEquity ?? 0)} />
              <MetricCard label="Available" value={money(data?.accountAvailable ?? 0)} />
              <MetricCard label="24h PnL" value={money(data?.dayPnl ?? 0)} tone={(data?.dayPnl ?? 0) >= 0 ? "good" : "bad"} />
              <MetricCard label="Realized" value={money(data?.realizedPnl ?? 0)} tone={(data?.realizedPnl ?? 0) >= 0 ? "good" : "bad"} />
              <MetricCard label="Unrealized" value={money(data?.unrealizedPnl ?? 0)} tone={(data?.unrealizedPnl ?? 0) >= 0 ? "good" : "bad"} />
              <MetricCard label="Win rate" value={`${num((data?.winRate ?? 0) * 100)}%`} />
            </div>
          </section>

          <div className="tr-primary-grid">
            <section className="tr-panel tr-position-panel">
              <div className="tr-panel-header">
                <div>
                  <div className="tr-panel-kicker">Position</div>
                  <h2 className="tr-panel-title">Live position watch</h2>
                </div>
                <span className={`tr-side-pill is-${openPosition ? openPosition.side === "LONG" ? "good" : "bad" : "muted"}`}>
                  {openPosition ? `${openPosition.symbol} ${openPosition.side}` : "idle"}
                </span>
              </div>

              {openPosition ? (
                <div className="tr-position-body">
                  <div className="tr-position-grid">
                    <KeyValue label="Entry" value={money(openPosition.entryPrice)} />
                    <KeyValue label="Mark" value={money(openPosition.currentPrice)} />
                    <KeyValue label="Unrealized PnL" value={money(openPosition.unrealizedPnl)} tone={openPosition.unrealizedPnl >= 0 ? "good" : "bad"} />
                    <KeyValue label="Size" value={`${num(openPosition.quantity, 5)} • ${openPosition.leverage}x`} />
                    <KeyValue label="Stop Loss" value={openPosition.stopLoss ? money(openPosition.stopLoss) : "Not set"} />
                    <KeyValue label="Take Profit" value={openPosition.takeProfit ? money(openPosition.takeProfit) : "Not set"} />
                  </div>
                  <div className="tr-position-foot">
                    <span>Opened {compactAgo(openPosition.openedAt)}</span>
                    <span>{money(openPosition.notional)} notional</span>
                  </div>
                </div>
              ) : (
                <div className="tr-empty">JARVIS is flat and waiting for the next executable setup.</div>
              )}
            </section>

            <section className="tr-panel tr-analysis-panel">
              <div className="tr-panel-header">
                <div>
                  <div className="tr-panel-kicker">Intelligence</div>
                  <h2 className="tr-panel-title">On-demand market analysis</h2>
                </div>
              </div>

              <div className="tr-analysis-controls">
                <label className="tr-field">
                  <span>Symbol</span>
                  <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)}>
                    {draft.symbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
                  </select>
                </label>
              </div>

              {analysis ? (
                <div className="tr-analysis-card">
                  <div className="tr-analysis-top">
                    <span className={`tr-signal-tag is-${analysis.action === "LONG" ? "good" : analysis.action === "SHORT" ? "bad" : "muted"}`}>
                      {analysis.action}
                    </span>
                    <span className="tr-analysis-time">{time(analysis.analyzedAt)}</span>
                  </div>
                  <div className="tr-analysis-metrics">
                    <KeyValue label="Confidence" value={`${num(analysis.confidence * 100)}%`} />
                    <KeyValue label="Price" value={money(analysis.price)} />
                  </div>
                  <p className="tr-analysis-copy">{analysis.rationale}</p>
                </div>
              ) : (
                <div className="tr-empty">Run an analysis to inspect the current setup before forcing a live cycle.</div>
              )}
            </section>
          </div>

          <div className="tr-secondary-grid">
            <section className="tr-panel">
              <div className="tr-panel-header">
                <div>
                  <div className="tr-panel-kicker">Controls</div>
                  <h2 className="tr-panel-title">Execution configuration</h2>
                </div>
                <button className="tr-action tr-action-subtle" onClick={saveConfig} disabled={phase !== "idle"}>Save</button>
              </div>

              <div className="tr-settings-grid">
                <ToggleRow label="Engine enabled" checked={draft.enabled} onChange={(value) => setField("enabled", value)} />
                <ToggleRow label="Live execution armed" checked={draft.allowLiveExecution} onChange={(value) => setField("allowLiveExecution", value)} />
                <ToggleRow label="Scan all USDT markets" checked={draft.scanAllUsdtMarkets} onChange={(value) => setField("scanAllUsdtMarkets", value)} />

                <label className="tr-field">
                  <span>Mode</span>
                  <select value={draft.mode} onChange={(e) => setField("mode", e.target.value as TradingMode)}>
                    <option value="paper">Paper</option>
                    <option value="live">Live</option>
                  </select>
                </label>
                <label className="tr-field">
                  <span>Margin Coin</span>
                  <input value={draft.marginCoin} onChange={(e) => setField("marginCoin", e.target.value.toUpperCase())} />
                </label>
                <NumberField label="Scheduler (min)" value={draft.intervalMinutes} onChange={(value) => setField("intervalMinutes", value)} />
                <NumberField label="Markets to scan" value={draft.maxMarketScan} onChange={(value) => setField("maxMarketScan", value)} />
                <NumberField label="Setups per run" value={draft.setupsPerRun} onChange={(value) => setField("setupsPerRun", value)} />
                <NumberField label="Paper balance" value={draft.paperBalance} onChange={(value) => setField("paperBalance", value)} />
                <NumberField label="Max leverage" value={draft.maxLeverage} onChange={(value) => setField("maxLeverage", value)} />
                <NumberField label="Max notional/trade" value={draft.maxNotionalPerTrade} onChange={(value) => setField("maxNotionalPerTrade", value)} />
                <NumberField label="Max concurrent" value={draft.maxConcurrentPositions} onChange={(value) => setField("maxConcurrentPositions", value)} />
                <NumberField label="Max daily loss" value={draft.maxDailyLoss} onChange={(value) => setField("maxDailyLoss", value)} />
                <NumberField label="Risk per trade %" value={draft.riskPerTradePct * 100} onChange={(value) => setField("riskPerTradePct", value / 100)} step="0.1" />
                <NumberField label="Max hold (min)" value={draft.maxHoldMinutes} onChange={(value) => setField("maxHoldMinutes", value)} />

                <label className="tr-field tr-span-2">
                  <span>Symbols</span>
                  <textarea
                    rows={3}
                    value={symbolText}
                    onChange={(e) => setField("symbols", e.target.value.split(",").map((item) => item.trim().toUpperCase()).filter(Boolean))}
                  />
                </label>
                <label className="tr-field tr-span-2">
                  <span>Bitunix API Key</span>
                  <input value={draft.apiKey} onChange={(e) => setField("apiKey", e.target.value)} placeholder="Leave blank if env-backed" />
                </label>
                <label className="tr-field tr-span-2">
                  <span>Bitunix API Secret</span>
                  <input type="password" value={draft.apiSecret} onChange={(e) => setField("apiSecret", e.target.value)} placeholder="Leave blank if env-backed" />
                </label>
              </div>
            </section>

            <section className="tr-panel">
              <div className="tr-panel-header">
                <div>
                  <div className="tr-panel-kicker">Policy</div>
                  <h2 className="tr-panel-title">Operating notes</h2>
                </div>
              </div>

              <div className="tr-note-list">
                <NoteRow label="Trade cadence" value={`Up to ${draft.setupsPerRun} setup(s) per cycle and ${draft.maxConcurrentPositions} live position(s) at once.`} />
                <NoteRow label="Sizing" value={`${money(draft.maxNotionalPerTrade)} cap with ${num(draft.riskPerTradePct * 100, 1)}% risk budget per trade.`} />
                <NoteRow label="Timed exit" value={`After ${draft.maxHoldMinutes} minutes, close only if ROI is at least +0.5%; otherwise wait for TP or SL.`} />
                <NoteRow label="Universe" value={draft.scanAllUsdtMarkets ? `Scanner prioritizes the top ${draft.maxMarketScan} USDT markets.` : symbolText || "Custom symbol list is empty."} />
              </div>
            </section>
          </div>

          <div className="tr-ledger-grid">
            <DataTable
              title="Open Positions"
              headers={["Symbol", "Side", "Entry", "Mark", "PnL", "Lev", "Opened"]}
              rows={(data?.openPositions ?? []).map((position) => [
                position.symbol,
                position.side,
                money(position.entryPrice),
                money(position.currentPrice),
                money(position.unrealizedPnl),
                `${position.leverage}x`,
                time(position.openedAt),
              ])}
              empty="No open positions."
            />
            <DataTable
              title="Recent Orders"
              headers={["Symbol", "Provider", "Side", "Qty", "Price", "Status", "Time"]}
              rows={(data?.recentOrders ?? []).map((order) => [
                order.symbol,
                order.provider,
                order.side,
                num(order.quantity, 5),
                money(order.price),
                order.status,
                time(order.createdAt),
              ])}
              empty="No orders yet."
            />
            <DataTable
              title="Recent Analysis"
              headers={["Symbol", "Action", "Confidence", "Price", "Rationale", "Time"]}
              rows={(data?.recentSignals ?? []).map((signal) => [
                signal.symbol,
                signal.action,
                `${num(signal.confidence * 100)}%`,
                money(signal.price),
                signal.rationale,
                time(signal.analyzedAt),
              ])}
              empty="No analysis yet."
            />
            <DataTable
              title="Run Log"
              headers={["Trigger", "Mode", "Status", "Summary", "Time"]}
              rows={(data?.recentRuns ?? []).map((run) => [
                run.trigger,
                run.mode,
                run.status,
                run.summary,
                time(run.createdAt),
              ])}
              empty="No runs yet."
            />
          </div>
        </main>
      </div>
    </div>
  );
}

function MetricCard({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="tr-metric-card">
      <span className="tr-metric-label">{label}</span>
      <strong className={`tr-metric-value${tone ? ` is-${tone}` : ""}`}>{value}</strong>
    </div>
  );
}

function RailCard({
  title,
  items,
}: {
  title: string;
  items: Array<{ label: string; value: string; tone: "good" | "bad" | "warn" | "muted"; multiLine?: boolean }>;
}) {
  return (
    <section className="tr-rail-card">
      <div className="tr-rail-head">
        <span>{title}</span>
      </div>
      <div className="tr-rail-list">
        {items.map((item) => (
          <div key={`${title}-${item.label}`} className="tr-rail-item">
            <span className="tr-rail-label">{item.label}</span>
            <strong className={`tr-rail-value is-${item.tone}${item.multiLine ? " is-multiline" : ""}`}>{item.value}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="tr-toggle-row">
      <div>
        <span>{label}</span>
        <strong>{checked ? "On" : "Off"}</strong>
      </div>
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function NumberField({ label, value, onChange, step }: { label: string; value: number; onChange: (value: number) => void; step?: string }) {
  return (
    <label className="tr-field">
      <span>{label}</span>
      <input type="number" step={step ?? "1"} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function KeyValue({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  return (
    <div className="tr-kv">
      <span>{label}</span>
      <strong className={tone ? `is-${tone}` : ""}>{value}</strong>
    </div>
  );
}

function NoteRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="tr-note-row">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function DataTable({ title, headers, rows, empty }: { title: string; headers: string[]; rows: string[][]; empty: string }) {
  return (
    <section className="tr-panel">
      <div className="tr-panel-header">
        <div>
          <div className="tr-panel-kicker">Ledger</div>
          <h2 className="tr-panel-title">{title}</h2>
        </div>
      </div>
      {rows.length === 0 ? (
        <div className="tr-empty">{empty}</div>
      ) : (
        <div className="tr-table-wrap">
          <table className="tr-table">
            <thead>
              <tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${title}-${index}`}>
                  {row.map((cell, cellIndex) => <td key={`${title}-${index}-${cellIndex}`}>{cell}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
