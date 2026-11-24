import React, { useState, useEffect, useMemo } from 'react';
import { Ticket, DashboardStats, ReportData, PerformanceRow } from '../types';
import { fetchWithAuth } from '../utils/auth';
import {
  BarChart3,
  CheckCircle2,
  UserPlus,
  Users,
  DollarSign,
  Percent,
  TrendingUp,
  Package,
  Receipt,
  Download,
  RefreshCw,
  Table as TableIcon,
  BarChart2,
} from 'lucide-react';

interface AnalyticsViewProps {
  tickets: Ticket[];
  stats: DashboardStats | null;
  refreshKey?: number;
}

type PresetKey = 'today' | 'yesterday' | 'last7' | 'last30' | 'this_month' | 'last_month' | 'custom';
type BarChartMetric = 'revenue' | 'new_customers' | 'closed_tickets';
type PerfViewMode = 'table' | 'chart';
type PerfGroupMode = 'staff' | 'device';

const PRESETS: readonly { key: Exclude<PresetKey, 'custom'>; label: string }[] = [
  { key: 'today', label: 'Today' },
  { key: 'yesterday', label: 'Yesterday' },
  { key: 'last7', label: 'Last 7 Days' },
  { key: 'last30', label: 'Last 30 Days' },
  { key: 'this_month', label: 'This Month' },
  { key: 'last_month', label: 'Last Month' },
];

const METHOD_META: Record<string, { label: string; color: string }> = {
  CARD: { label: 'Card', color: '#4f46e5' },
  CASH: { label: 'Cash', color: '#10b981' },
  DEBIT: { label: 'Debit', color: '#f59e0b' },
  E_TRANSFER: { label: 'E-Transfer', color: '#0ea5e9' },
  CREDIT: { label: 'Credit', color: '#8b5cf6' },
  OTHER: { label: 'Other', color: '#64748b' },
};

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPresetBounds(key: Exclude<PresetKey, 'custom'>): { from: string; to: string } {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  switch (key) {
    case 'today': {
      const s = toDateInputValue(today);
      return { from: s, to: s };
    }
    case 'yesterday': {
      const y = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
      const s = toDateInputValue(y);
      return { from: s, to: s };
    }
    case 'last7': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6);
      return { from: toDateInputValue(start), to: toDateInputValue(today) };
    }
    case 'last30': {
      const start = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 29);
      return { from: toDateInputValue(start), to: toDateInputValue(today) };
    }
    case 'this_month': {
      const start = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: toDateInputValue(start), to: toDateInputValue(today) };
    }
    case 'last_month': {
      const start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const end = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: toDateInputValue(start), to: toDateInputValue(end) };
    }
  }
}

function formatMoneyCents(cents: number): string {
  const sign = cents < 0 ? '-' : '';
  return `${sign}$${(Math.abs(cents) / 100).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function niceAxisMax(rawMax: number, isCurrency: boolean): number {
  if (rawMax <= 0) return isCurrency ? 10000 : 4;
  if (isCurrency) {
    const dollars = rawMax / 100;
    const magnitude = Math.pow(10, Math.floor(Math.log10(dollars)));
    const normalized = dollars / magnitude;
    let step = 10;
    if (normalized <= 1.2) step = 1.5;
    else if (normalized <= 2) step = 2;
    else if (normalized <= 3) step = 3;
    else if (normalized <= 5) step = 5;
    else if (normalized <= 8) step = 8;
    return Math.ceil(step * magnitude) * 100;
  }
  if (rawMax <= 4) return 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawMax)));
  return Math.ceil(rawMax / magnitude) * magnitude;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  tickets: _tickets,
  stats: _stats,
  refreshKey = 0,
}) => {
  const initialBounds = useMemo(() => getPresetBounds('this_month'), []);
  const [preset, setPreset] = useState<PresetKey>('this_month');
  const [fromDate, setFromDate] = useState(initialBounds.from);
  const [toDate, setToDate] = useState(initialBounds.to);
  const [manualReloadTick, setManualReloadTick] = useState(0);

  const [report, setReport] = useState<ReportData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [reportError, setReportError] = useState<string | null>(null);

  const [barTab, setBarTab] = useState<BarChartMetric>('revenue');
  const [hoveredBarIdx, setHoveredBarIdx] = useState<number | null>(null);
  const [hoveredPointIdx, setHoveredPointIdx] = useState<number | null>(null);

  const [perfView, setPerfView] = useState<PerfViewMode>('table');
  const [perfGroup, setPerfGroup] = useState<PerfGroupMode>('staff');

  useEffect(() => {
    let cancelled = false;
    setIsLoading(true);
    setReportError(null);

    const safeFrom = fromDate <= toDate ? fromDate : toDate;
    const safeTo = fromDate <= toDate ? toDate : fromDate;
    const fromIso = new Date(`${safeFrom}T00:00:00.000`).toISOString();
    const toIso = new Date(`${safeTo}T23:59:59.999`).toISOString();

    fetchWithAuth(`/api/reports?from=${encodeURIComponent(fromIso)}&to=${encodeURIComponent(toIso)}`)
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error || 'Failed to load analytics report');
        }
        return res.json();
      })
      .then((json) => {
        if (!cancelled && json.success && json.data) {
          setReport(json.data);
        }
      })
      .catch((err: any) => {
        if (!cancelled) setReportError(err?.message || 'Could not load analytics report');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, refreshKey, manualReloadTick]);

  const handleSelectPreset = (key: Exclude<PresetKey, 'custom'>) => {
    const b = getPresetBounds(key);
    setPreset(key);
    setFromDate(b.from);
    setToDate(b.to);
  };

  const handleExportTicketsCsv = async () => {
    try {
      const res = await fetchWithAuth('/api/export/tickets');
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `FasoFix-WorkOrders-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      window.URL.revokeObjectURL(url);
    } catch {
      alert('Failed to download work orders CSV export');
    }
  };

  // Daily Bar Chart series & scaling
  const dailySeries = report?.daily || [];
  const barValues = dailySeries.map((d) =>
    barTab === 'revenue'
      ? d.revenueCents
      : barTab === 'new_customers'
      ? d.newCustomers ?? 0
      : d.closedTickets ?? 0
  );
  const barRawMax = Math.max(0, ...barValues);
  const barAxisMax = niceAxisMax(barRawMax, barTab === 'revenue');

  // Weekly / Short-span Line Chart series & scaling
  const trendSeries = report?.weekly || [];
  const trendRawMax = Math.max(0, ...trendSeries.map((w) => w.revenueCents));
  const trendAxisMax = niceAxisMax(trendRawMax, true);

  // Payment Method Mix bar data
  const tenderEntries = useMemo(() => {
    const raw = report?.byMethod || {};
    return Object.entries(raw)
      .filter(([, cents]) => cents > 0)
      .sort((a, b) => b[1] - a[1]);
  }, [report?.byMethod]);
  const tenderPositiveTotalCents = tenderEntries.reduce((s, [, c]) => s + c, 0);

  // Performance Table / Chart data
  const perfRows: PerformanceRow[] =
    perfGroup === 'staff' ? report?.staffPerformance || [] : report?.devicePerformance || [];
  const maxPerfRevCents = Math.max(1, ...perfRows.map((r) => Math.max(0, r.revenueCents)));

  const revenueDelta = report?.revenueDeltaPct;
  const closedDelta = report?.closedTicketsDeltaPct;

  return (
    <div className="space-y-5">
      {/* ========================================================
          HEADER: MASTER REPORT / KEY METRICS & DATE CONTROLS
         ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <BarChart3 className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight leading-tight">
                Master Report
              </h1>
              <p className="text-xs text-slate-500">
                Key Metrics · {report?.days ?? 30}-day real-time POS window
              </p>
            </div>
          </div>

          <div className="flex flex-col lg:items-end gap-2.5">
            {/* Quick Date Presets */}
            <div className="flex flex-wrap items-center gap-1 bg-slate-100/90 p-1 rounded-lg border border-slate-200/80">
              {PRESETS.map((p) => (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => handleSelectPreset(p.key)}
                  className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    preset === p.key
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            {/* Custom From/To + Refresh + Export */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">From</span>
                <input
                  type="date"
                  aria-label="From date"
                  value={fromDate}
                  onChange={(e) => {
                    setPreset('custom');
                    setFromDate(e.target.value);
                  }}
                  className="bg-transparent text-xs font-mono font-semibold text-slate-800 focus:outline-none"
                />
              </div>
              <span className="text-slate-400 text-xs">to</span>
              <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">To</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={toDate}
                  onChange={(e) => {
                    setPreset('custom');
                    setToDate(e.target.value);
                  }}
                  className="bg-transparent text-xs font-mono font-semibold text-slate-800 focus:outline-none"
                />
              </div>

              <button
                type="button"
                onClick={() => setManualReloadTick((n) => n + 1)}
                disabled={isLoading}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer transition-colors shadow-2xs disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
                <span>Refresh</span>
              </button>

              <button
                type="button"
                onClick={handleExportTicketsCsv}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-lg text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer transition-colors"
              >
                <Download className="w-3.5 h-3.5 text-slate-500" />
                <span>Export CSV</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {reportError && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-medium">
          {reportError}
        </div>
      )}

      {/* ========================================================
          ROW 1: 4 EXECUTIVE KPI CARDS (HERO REVENUE + 3 COUNT CARDS)
         ======================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* Hero Gradient Revenue Card */}
        <div className="rounded-2xl bg-gradient-to-br from-indigo-600 via-indigo-600 to-purple-600 text-white p-5 shadow-sm flex flex-col justify-between gap-3">
          <div className="flex items-start justify-between gap-3">
            <div className="w-9 h-9 rounded-xl bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-2xl font-extrabold font-mono tabular-nums tracking-tight leading-none truncate">
                {formatMoneyCents(report?.revenueCents ?? 0)}
              </div>
              <div className="text-xs font-medium text-indigo-100 mt-1">Revenue (Collected)</div>
              <div className="text-[11px] font-semibold text-emerald-200 mt-1 tabular-nums">
                {revenueDelta !== null && revenueDelta !== undefined
                  ? `${revenueDelta >= 0 ? '↑' : '↓'} ${Math.abs(revenueDelta).toFixed(1)}% vs prev period`
                  : `Prior period: ${formatMoneyCents(report?.prevRevenueCents ?? 0)}`}
              </div>
            </div>
          </div>

          <div className="pt-2.5 border-t border-white/15 flex items-center justify-between gap-2 text-[11px] font-mono tabular-nums text-indigo-100">
            <span>Current 7d: {formatMoneyCents(report?.currentWeekRevenueCents ?? 0)}</span>
            <span>Prev 7d: {formatMoneyCents(report?.previousWeekRevenueCents ?? 0)}</span>
          </div>
        </div>

        {/* Closed / Paid Tickets */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 leading-none">
              {report?.closedTicketsCount ?? 0}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-1.5">Closed / Paid Tickets</div>
            <div
              className={`text-[11px] font-semibold mt-1 tabular-nums ${
                closedDelta !== null && closedDelta !== undefined && closedDelta < 0
                  ? 'text-rose-600'
                  : 'text-emerald-600'
              }`}
            >
              {closedDelta !== null && closedDelta !== undefined
                ? `${closedDelta >= 0 ? '↑' : '↓'} ${Math.abs(closedDelta).toFixed(1)}% vs prev period`
                : `${report?.ticketsCreated ?? 0} work orders created`}
            </div>
          </div>
        </div>

        {/* New Customers */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center shrink-0">
            <UserPlus className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 leading-none">
              {report?.newCustomersCount ?? 0}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-1.5">New Customers</div>
            <div className="text-[11px] font-semibold text-sky-600 mt-1">
              First-time visitors in period
            </div>
          </div>
        </div>

        {/* Returning Customers */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-2xs flex items-start gap-3.5">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="text-2xl font-extrabold font-mono tabular-nums text-slate-900 leading-none">
              {report?.returningCustomersCount ?? 0}
            </div>
            <div className="text-xs font-semibold text-slate-500 mt-1.5">Returning Customers</div>
            <div className="text-[11px] font-semibold text-emerald-600 mt-1">
              Repeat clients in period
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          ROW 2: DAILY SALES BAR CHART + TREND LINE & TENDER MIX
         ======================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Left: Tabbed Daily Bar Chart */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
            <div className="flex items-center gap-4">
              {[
                { key: 'revenue', label: 'Revenue' },
                { key: 'new_customers', label: 'New Customers' },
                { key: 'closed_tickets', label: 'Closed Tickets' },
              ].map((t) => {
                const active = barTab === t.key;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => {
                      setBarTab(t.key as BarChartMetric);
                      setHoveredBarIdx(null);
                    }}
                    className={`pb-1.5 -mb-2.5 text-xs font-bold border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      active
                        ? 'text-indigo-600 border-indigo-600'
                        : 'text-slate-500 border-transparent hover:text-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <span className="text-xs font-bold text-slate-700">
              {barTab === 'revenue'
                ? 'Daily Sales'
                : barTab === 'new_customers'
                ? 'Daily New Customers'
                : 'Daily Closed Tickets'}
            </span>
          </div>

          {/* Pure Responsive SVG Bar Chart */}
          <div className="relative w-full">
            {hoveredBarIdx !== null && dailySeries[hoveredBarIdx] && (
              <div className="absolute right-2 top-1 z-10 px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-mono tabular-nums shadow-md pointer-events-none">
                {dailySeries[hoveredBarIdx].date}:{' '}
                {barTab === 'revenue'
                  ? formatMoneyCents(barValues[hoveredBarIdx])
                  : barValues[hoveredBarIdx]}
              </div>
            )}
            <svg viewBox="0 0 560 215" className="w-full h-52 overflow-visible select-none">
              {(() => {
                const padL = 56;
                const padR = 12;
                const padT = 16;
                const padB = 34;
                const plotW = 560 - padL - padR;
                const plotH = 215 - padT - padB;
                const steps = 4;
                const labelEvery = Math.max(1, Math.ceil(dailySeries.length / 8));
                const n = Math.max(1, dailySeries.length);
                const slotW = plotW / n;
                const barW = Math.max(4, Math.min(28, slotW * 0.68));

                return (
                  <>
                    {/* Horizontal gridlines & Y-axis labels */}
                    {Array.from({ length: steps + 1 }).map((_, idx) => {
                      const ratio = idx / steps;
                      const y = padT + plotH * (1 - ratio);
                      const val = barAxisMax * ratio;
                      const tickLabel =
                        barTab === 'revenue'
                          ? `$${Math.round(val / 100).toLocaleString('en-US')}`
                          : String(Math.round(val));
                      return (
                        <g key={`grid-${idx}`}>
                          <line
                            x1={padL}
                            x2={padL + plotW}
                            y1={y}
                            y2={y}
                            stroke={idx === 0 ? '#cbd5e1' : '#f1f5f9'}
                            strokeWidth={1}
                          />
                          <text
                            x={padL - 8}
                            y={y + 3.5}
                            textAnchor="end"
                            fill="#94a3b8"
                            fontSize="10"
                            fontFamily="ui-monospace, monospace"
                          >
                            {tickLabel}
                          </text>
                        </g>
                      );
                    })}

                    {/* Bars & X-axis labels */}
                    {dailySeries.map((d, i) => {
                      const v = Math.max(0, barValues[i] || 0);
                      const barH = barAxisMax > 0 ? Math.max(v > 0 ? 3 : 0, (v / barAxisMax) * plotH) : 0;
                      const x = padL + i * slotW + (slotW - barW) / 2;
                      const y = padT + plotH - barH;
                      const isHovered = hoveredBarIdx === i;
                      const showLabel = i === 0 || i === dailySeries.length - 1 || i % labelEvery === 0;
                      const shortDate = `${d.date.slice(5, 7)}-${d.date.slice(8, 10)}`;

                      return (
                        <g
                          key={d.date}
                          onMouseEnter={() => setHoveredBarIdx(i)}
                          onMouseLeave={() => setHoveredBarIdx(null)}
                          className="cursor-pointer"
                        >
                          <rect
                            x={padL + i * slotW}
                            y={padT}
                            width={slotW}
                            height={plotH}
                            fill="transparent"
                          />
                          <rect
                            x={x}
                            y={y}
                            width={barW}
                            height={barH}
                            rx={3}
                            fill={isHovered ? '#4338ca' : '#5865f2'}
                          />
                          {showLabel && (
                            <text
                              x={padL + i * slotW + slotW / 2}
                              y={padT + plotH + 16}
                              textAnchor="middle"
                              fill="#94a3b8"
                              fontSize="9.5"
                              fontFamily="ui-monospace, monospace"
                            >
                              {shortDate}
                            </text>
                          )}
                        </g>
                      );
                    })}
                  </>
                );
              })()}
            </svg>
          </div>
        </div>

        {/* Right: Trend Line Chart + Payment Method Mix Bar */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-5 flex flex-col justify-between gap-4">
          <div>
            <div className="flex items-center justify-between gap-2 pb-2">
              <span className="text-xs font-bold text-slate-700">
                {dailySeries.length <= 7 ? 'Daily Revenue Trend' : 'Weekly Revenue Trend'}
              </span>
              <span className="text-[11px] font-mono tabular-nums text-slate-400">
                {trendSeries.length} point{trendSeries.length === 1 ? '' : 's'}
              </span>
            </div>

            <div className="relative w-full">
              {hoveredPointIdx !== null && trendSeries[hoveredPointIdx] && (
                <div className="absolute right-2 top-1 z-10 px-2.5 py-1 rounded-md bg-slate-900 text-white text-[11px] font-mono tabular-nums shadow-md pointer-events-none">
                  {trendSeries[hoveredPointIdx].label}:{' '}
                  {formatMoneyCents(trendSeries[hoveredPointIdx].revenueCents)}
                </div>
              )}
              <svg viewBox="0 0 560 150" className="w-full h-36 overflow-visible select-none">
                <defs>
                  <linearGradient id="trendAreaFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#4f46e5" stopOpacity="0.22" />
                    <stop offset="100%" stopColor="#4f46e5" stopOpacity="0.02" />
                  </linearGradient>
                </defs>
                {(() => {
                  const padL = 56;
                  const padR = 16;
                  const padT = 14;
                  const padB = 26;
                  const plotW = 560 - padL - padR;
                  const plotH = 150 - padT - padB;
                  const steps = 3;

                  const pts = trendSeries.map((pt, i) => {
                    const x =
                      trendSeries.length === 1
                        ? padL + plotW / 2
                        : padL + (i / (trendSeries.length - 1)) * plotW;
                    const y = padT + plotH - (Math.max(0, pt.revenueCents) / trendAxisMax) * plotH;
                    return { x, y, pt };
                  });

                  const polylineStr = pts.map((p) => `${p.x},${p.y}`).join(' ');
                  const areaStr =
                    pts.length >= 2
                      ? `M ${pts[0].x},${padT + plotH} ${pts
                          .map((p) => `L ${p.x},${p.y}`)
                          .join(' ')} L ${pts[pts.length - 1].x},${padT + plotH} Z`
                      : '';

                  return (
                    <>
                      {Array.from({ length: steps + 1 }).map((_, idx) => {
                        const ratio = idx / steps;
                        const y = padT + plotH * (1 - ratio);
                        const dollars = Math.round((trendAxisMax * ratio) / 100);
                        return (
                          <g key={`tgrid-${idx}`}>
                            <line
                              x1={padL}
                              x2={padL + plotW}
                              y1={y}
                              y2={y}
                              stroke={idx === 0 ? '#cbd5e1' : '#f1f5f9'}
                              strokeWidth={1}
                            />
                            <text
                              x={padL - 8}
                              y={y + 3.5}
                              textAnchor="end"
                              fill="#94a3b8"
                              fontSize="10"
                              fontFamily="ui-monospace, monospace"
                            >
                              ${dollars.toLocaleString('en-US')}
                            </text>
                          </g>
                        );
                      })}

                      {areaStr && <path d={areaStr} fill="url(#trendAreaFill)" />}
                      {pts.length >= 2 && (
                        <polyline
                          fill="none"
                          stroke="#4f46e5"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={polylineStr}
                        />
                      )}

                      {pts.map(({ x, y, pt }, idx) => (
                        <g
                          key={pt.label}
                          onMouseEnter={() => setHoveredPointIdx(idx)}
                          onMouseLeave={() => setHoveredPointIdx(null)}
                          className="cursor-pointer"
                        >
                          <circle cx={x} cy={y} r={12} fill="transparent" />
                          <circle
                            cx={x}
                            cy={y}
                            r={hoveredPointIdx === idx ? 5 : 3.5}
                            fill="#4f46e5"
                            stroke="#ffffff"
                            strokeWidth={1.5}
                          />
                          <text
                            x={x}
                            y={padT + plotH + 16}
                            textAnchor="middle"
                            fill="#94a3b8"
                            fontSize="9.5"
                            fontFamily="ui-monospace, monospace"
                          >
                            {pt.label}
                          </text>
                        </g>
                      ))}
                    </>
                  );
                })()}
              </svg>
            </div>
          </div>

          {/* Payment Method Mix Inset */}
          <div className="bg-slate-50/90 border border-slate-200/70 rounded-xl p-3.5 space-y-2">
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <span className="text-base font-extrabold font-mono tabular-nums text-slate-900">
                  {formatMoneyCents(report?.revenueCents ?? 0)}
                </span>
                <span className="text-xs font-semibold text-slate-500">Payment Method Mix</span>
              </div>
              <span className="text-[11px] font-semibold text-emerald-700 tabular-nums">
                {tenderEntries.length > 0
                  ? `${tenderEntries.length} tender type${tenderEntries.length === 1 ? '' : 's'}`
                  : 'No payments recorded'}
              </span>
            </div>

            <div className="w-full h-2.5 rounded-full bg-slate-200 overflow-hidden flex">
              {tenderPositiveTotalCents > 0 ? (
                tenderEntries.map(([method, cents]) => {
                  const meta = METHOD_META[method] || { label: method, color: '#64748b' };
                  const pct = (cents / tenderPositiveTotalCents) * 100;
                  return (
                    <div
                      key={method}
                      style={{ width: `${pct}%`, backgroundColor: meta.color }}
                      title={`${meta.label}: ${formatMoneyCents(cents)} (${pct.toFixed(1)}%)`}
                    />
                  );
                })
              ) : (
                <div className="w-full h-full bg-slate-200" />
              )}
            </div>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-slate-600">
              {tenderEntries.length > 0 ? (
                tenderEntries.map(([method, cents]) => {
                  const meta = METHOD_META[method] || { label: method, color: '#64748b' };
                  return (
                    <span key={method} className="inline-flex items-center gap-1.5 font-mono tabular-nums">
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: meta.color }}
                      />
                      <span className="font-sans font-medium text-slate-600">{meta.label}:</span>
                      <strong className="text-slate-900">{formatMoneyCents(cents)}</strong>
                    </span>
                  );
                })
              ) : (
                <span className="text-slate-400">
                  Card, Cash, Debit, and E-Transfer mix will populate once payments are collected.
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          ROW 3: 5 FINANCIAL PROFITABILITY & OPERATIONS CARDS
         ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-5 gap-3.5">
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <DollarSign className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold font-mono tabular-nums text-slate-900 truncate">
              {formatMoneyCents(report?.netRevenueCents ?? 0)}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Net Revenue</div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
              Excl. HST ({formatMoneyCents(report?.netTaxCollectedCents ?? 0)})
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shrink-0">
            <Percent className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold font-mono tabular-nums text-slate-900">
              {report?.grossMarginPct !== null && report?.grossMarginPct !== undefined
                ? `${report.grossMarginPct.toFixed(1)}%`
                : '—'}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Gross Margin</div>
            <div className="text-[10px] text-emerald-600 font-medium mt-0.5">
              After parts cost
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold font-mono tabular-nums text-slate-900 truncate">
              {formatMoneyCents(report?.grossProfitCents ?? 0)}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Gross Profit</div>
            <div className="text-[10px] text-slate-400 mt-0.5">Net rev - Parts COGS</div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex items-start gap-3">
          <div className="w-9 h-9 rounded-lg bg-sky-50 border border-sky-100 text-sky-600 flex items-center justify-center shrink-0">
            <Package className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold font-mono tabular-nums text-slate-900 truncate">
              {formatMoneyCents(report?.partsCostCents ?? 0)}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Parts Cost (COGS)</div>
            <div className="text-[10px] text-slate-400 font-mono tabular-nums mt-0.5">
              Billed: {formatMoneyCents(report?.partsRevenueCents ?? 0)}
            </div>
          </div>
        </div>

        <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex items-start gap-3 col-span-2 sm:col-span-1">
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
            <Receipt className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <div className="text-base font-extrabold font-mono tabular-nums text-slate-900 truncate">
              {formatMoneyCents(report?.avgTicketValueCents ?? 0)}
            </div>
            <div className="text-[11px] font-semibold text-slate-500 mt-0.5">Avg Work Order</div>
            <div className="text-[10px] text-amber-700 font-mono font-semibold tabular-nums mt-0.5">
              Owing: {formatMoneyCents(report?.outstandingBalanceCents ?? 0)}
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          ROW 4: PERFORMANCE OVERVIEW (TABLE VIEW / CHART VIEW)
         ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 sm:px-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-slate-900">Performance Overview</h2>

          <div className="flex flex-wrap items-center gap-2">
            {/* Table vs Chart toggle */}
            <div className="inline-flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPerfView('table')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 border cursor-pointer transition-colors ${
                  perfView === 'table'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5" />
                <span>Table View</span>
              </button>
              <button
                type="button"
                onClick={() => setPerfView('chart')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold inline-flex items-center gap-1.5 border cursor-pointer transition-colors ${
                  perfView === 'chart'
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                <BarChart2 className="w-3.5 h-3.5" />
                <span>Chart View</span>
              </button>
            </div>

            <div className="h-5 w-px bg-slate-200 hidden sm:block" />

            {/* By Staff vs By Device toggle */}
            <div className="inline-flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                type="button"
                onClick={() => setPerfGroup('staff')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                  perfGroup === 'staff'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Staff
              </button>
              <button
                type="button"
                onClick={() => setPerfGroup('device')}
                className={`px-2.5 py-1 rounded-md text-xs font-semibold cursor-pointer transition-colors ${
                  perfGroup === 'device'
                    ? 'bg-white text-slate-900 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                By Device
              </button>
            </div>
          </div>
        </div>

        {perfView === 'table' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-[#0f2942] text-white text-[10px] xl:text-[11px] font-bold uppercase tracking-normal xl:tracking-wider whitespace-nowrap">
                  <th className="py-3 px-3 xl:px-4">
                    {perfGroup === 'staff' ? 'Staff / Tech' : 'Device Model'}
                  </th>
                  <th className="py-3 px-2.5 xl:px-4 text-right">Revenue</th>
                  <th className="py-3 px-2.5 xl:px-4 text-right">Work Orders</th>
                  <th className="py-3 px-2.5 xl:px-4 text-right">Closed / Paid</th>
                  <th className="py-3 px-2.5 xl:px-4 text-right">New Cust.</th>
                  <th className="py-3 px-2.5 xl:px-4 text-right">Returning</th>
                  <th className="py-3 px-3 xl:px-4 text-right">Avg Ticket</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {perfRows.map((row) => (
                  <tr key={row.name} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 xl:px-4 font-bold text-indigo-700 whitespace-nowrap">
                      {row.name}
                    </td>
                    <td className="py-3 px-2.5 xl:px-4 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                      {formatMoneyCents(row.revenueCents)}
                    </td>
                    <td className="py-3 px-2.5 xl:px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.totalWorkOrders}
                    </td>
                    <td className="py-3 px-2.5 xl:px-4 text-right font-mono tabular-nums text-emerald-700 font-semibold">
                      {row.closedTickets}
                    </td>
                    <td className="py-3 px-2.5 xl:px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.newCustomers}
                    </td>
                    <td className="py-3 px-2.5 xl:px-4 text-right font-mono tabular-nums text-slate-700">
                      {row.returningCustomers}
                    </td>
                    <td className="py-3 px-3 xl:px-4 text-right font-mono tabular-nums font-semibold text-slate-800 whitespace-nowrap">
                      {formatMoneyCents(row.avgTicketCents)}
                    </td>
                  </tr>
                ))}
                {perfRows.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 px-4 text-center text-xs text-slate-400 italic">
                      No work orders or payments recorded in this date range yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-5 space-y-3">
            {perfRows.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400 italic">
                No performance data available in this date range yet.
              </div>
            ) : (
              perfRows.map((row) => {
                const pct = Math.max(2, (Math.max(0, row.revenueCents) / maxPerfRevCents) * 100);
                return (
                  <div key={row.name} className="space-y-1">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-bold text-slate-800 truncate">{row.name}</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          {row.totalWorkOrders} WO{row.totalWorkOrders === 1 ? '' : 's'} · {row.closedTickets} closed
                        </span>
                      </div>
                      <span className="font-mono tabular-nums font-bold text-slate-900 shrink-0">
                        {formatMoneyCents(row.revenueCents)}
                      </span>
                    </div>
                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-indigo-600 rounded-full transition-all"
                        style={{ width: `${row.revenueCents > 0 ? pct : 0}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
      </div>
    </div>
  );
};
