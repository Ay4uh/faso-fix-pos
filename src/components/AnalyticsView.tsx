import React, { useState, useEffect } from 'react';
import { Ticket, DashboardStats, ReportData } from '../types';
import { fetchWithAuth } from '../utils/auth';
import {
  BarChart3,
  TrendingUp,
  Clock,
  CheckCircle2,
  CreditCard,
  Smartphone,
  Layers,
  Download,
} from 'lucide-react';

interface AnalyticsViewProps {
  tickets: Ticket[];
  stats: DashboardStats | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tickets, stats }) => {
  const [days, setDays] = useState<number>(30);
  const [report, setReport] = useState<ReportData | null>(null);

  useEffect(() => {
    fetchWithAuth(`/api/reports?days=${days}`)
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setReport(json.data);
        }
      })
      .catch((err) => console.error('Failed to load reports', err));
  }, [days]);

  const total = tickets.length || 1;
  const completedCount = tickets.filter((t) => t.status === 'COMPLETED' || t.status === 'READY_FOR_PICKUP').length;
  const inProgressCount = tickets.filter((t) => t.status === 'IN_PROGRESS' || t.status === 'DIAGNOSING').length;
  const waitingPartsCount = tickets.filter((t) => t.status === 'WAITING_ON_PARTS').length;
  const pendingCount = tickets.filter(
    (t) => t.status === 'PENDING' || t.status === 'CHECKED_IN' || t.status === 'WAITING_ON_APPROVAL'
  ).length;

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

  const totalValue = tickets.reduce(
    (acc, t) => acc + (t.totals ? t.totals.totalCents / 100 : t.laborCents / 100),
    0
  );
  const avgTicket = total > 0 ? totalValue / total : 0;

  const revenue = report ? report.revenueCents / 100 : (stats ? stats.collectedMonthCents / 100 : 0);
  const partsMarginCents = report ? report.partsRevenueCents - report.partsCostCents : 0;

  return (
    <div className="space-y-6">
      {/* Top Banner - Clean, Bright, Modern */}
      <div className="bg-white rounded-2xl p-5 sm:p-6 text-slate-900 border border-slate-200/90 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-[11px] font-bold tracking-wider uppercase text-indigo-600">
                Operations & Performance
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                Live POS Telemetry
              </span>
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">Faso Fix Bench Diagnostics & Velocity</h2>
            <p className="text-xs text-slate-500 mt-1 max-w-xl leading-relaxed">
              Real-time repair pipeline metrics, technician throughput, and component lead time indicators computed directly from database records.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Days Span Selector & CSV Export */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleExportTicketsCsv}
                className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg border border-slate-200 text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
              >
                <Download className="w-3.5 h-3.5 text-slate-600" />
                <span>Export CSV</span>
              </button>

              <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200 text-xs font-semibold">
                {[7, 30, 90].map((d) => (
                  <button
                    key={d}
                    onClick={() => setDays(d)}
                    className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${
                      days === d
                        ? 'bg-white text-indigo-600 shadow-xs font-bold'
                        : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {d} Days
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center gap-4 bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Gross Volume</p>
                <p className="text-lg font-bold font-mono text-emerald-600">
                  ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </p>
              </div>
              <div className="h-8 w-px bg-slate-200"></div>
              <div>
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Avg Work Order</p>
                <p className="text-lg font-bold font-mono text-indigo-600">
                  ${avgTicket.toFixed(2)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Period Collected Revenue
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900">
              ${revenue.toFixed(2)}
            </span>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">
              <TrendingUp className="w-3.5 h-3.5" />
              Verified
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            {report?.ticketsCreated ?? 0} tickets initiated in window
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Turnaround Speed
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {report?.avgTurnaroundHours !== null && report?.avgTurnaroundHours !== undefined
                ? `${(report.avgTurnaroundHours / 24).toFixed(1)} Days`
                : '—'}
            </span>
            <span className="text-xs text-indigo-600 font-semibold flex items-center gap-0.5">
              <Clock className="w-3.5 h-3.5" />
              Triage avg
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            From check-in to completed test
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            On-Time Commitment
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-slate-900">
              {report?.onTimeRate !== null && report?.onTimeRate !== undefined
                ? `${Math.round(report.onTimeRate * 100)}%`
                : '—'}
            </span>
            <span className="text-xs text-emerald-600 font-semibold flex items-center gap-0.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              SLA rate
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Completed within promised date
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block mb-1">
            Parts Net Margin
          </span>
          <div className="flex items-baseline justify-between">
            <span className="text-2xl font-bold font-mono text-emerald-600">
              ${(partsMarginCents / 100).toFixed(2)}
            </span>
            <span className="text-xs text-slate-500 font-semibold flex items-center gap-0.5">
              <Layers className="w-3.5 h-3.5" />
              Gross profit
            </span>
          </div>
          <span className="text-[11px] text-slate-400 mt-1 block">
            Cost: ${(report ? report.partsCostCents / 100 : 0).toFixed(2)}
          </span>
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Active Queue Distribution ({tickets.length} total)
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-blue-700">In-Progress Repairs</span>
                <span>{inProgressCount} ({Math.round((inProgressCount / total) * 100)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-blue-600 rounded-full"
                  style={{ width: `${(inProgressCount / total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-amber-700">Waiting on Components</span>
                <span>{waitingPartsCount} ({Math.round((waitingPartsCount / total) * 100)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{ width: `${(waitingPartsCount / total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-emerald-700">Completed & Tested</span>
                <span>{completedCount} ({Math.round((completedCount / total) * 100)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 rounded-full"
                  style={{ width: `${(completedCount / total) * 100}%` }}
                ></div>
              </div>
            </div>

            <div>
              <div className="flex justify-between font-semibold mb-1">
                <span className="text-slate-600">Pending Triage</span>
                <span>{pendingCount} ({Math.round((pendingCount / total) * 100)}%)</span>
              </div>
              <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-400 rounded-full"
                  style={{ width: `${(pendingCount / total) * 100}%` }}
                ></div>
              </div>
            </div>
          </div>
        </div>

        {/* Top Serviced Devices */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Smartphone className="w-4 h-4 text-indigo-600" />
            Top Serviced Device Models
          </h3>

          <div className="space-y-2.5">
            {report?.topDevices && report.topDevices.length > 0 ? (
              report.topDevices.map((item, idx) => (
                <div
                  key={item.name}
                  className="flex items-center justify-between p-2.5 bg-slate-50 rounded-lg text-xs"
                >
                  <div className="flex items-center gap-2">
                    <span className="w-5 h-5 rounded-full bg-indigo-100 text-indigo-700 font-bold text-[10px] flex items-center justify-center font-mono">
                      {idx + 1}
                    </span>
                    <span className="font-semibold text-slate-800">{item.name}</span>
                  </div>
                  <span className="font-mono text-slate-600 font-semibold px-2 py-0.5 bg-white border border-slate-200 rounded">
                    {item.count} {item.count === 1 ? 'ticket' : 'tickets'}
                  </span>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No tickets recorded in this time window
              </div>
            )}
          </div>
        </div>

        {/* Payment Methods Breakdown */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600" />
            Revenue by Tender Type
          </h3>

          <div className="space-y-3">
            {report?.byMethod && Object.keys(report.byMethod).length > 0 ? (
              Object.entries(report.byMethod).map(([method, amountCents]) => (
                <div key={method} className="text-xs">
                  <div className="flex justify-between font-semibold mb-1">
                    <span className="text-slate-700 capitalize">
                      {method.toLowerCase().replace('_', '-')}
                    </span>
                    <span className="font-mono font-bold text-slate-900">
                      ${(amountCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-600 rounded-full"
                      style={{
                        width: `${report.revenueCents > 0 ? (amountCents / report.revenueCents) * 100 : 0}%`,
                      }}
                    ></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="py-8 text-center text-xs text-slate-400">
                No payments collected yet in this window
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
