import React from 'react';
import { Ticket, DashboardStats } from '../types';
import { BarChart3, TrendingUp, Clock, CheckCircle2, AlertTriangle, ShieldCheck } from 'lucide-react';

interface AnalyticsViewProps {
  tickets: Ticket[];
  stats: DashboardStats | null;
}

export const AnalyticsView: React.FC<AnalyticsViewProps> = ({ tickets, stats }) => {
  const total = tickets.length || 1;
  const completedCount = tickets.filter((t) => t.status === 'COMPLETED').length;
  const inProgressCount = tickets.filter((t) => t.status === 'IN_PROGRESS').length;
  const waitingPartsCount = tickets.filter((t) => t.status === 'WAITING_ON_PARTS').length;
  const pendingCount = tickets.filter((t) => t.status === 'PENDING').length;

  const totalValue = tickets.reduce((acc, t) => acc + t.price, 0);
  const avgTicket = totalValue / total;

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-gradient-to-r from-slate-900 to-indigo-950 rounded-2xl p-6 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-[10px] font-bold tracking-widest uppercase text-indigo-400">
              Operations & Performance
            </span>
            <h2 className="text-xl font-bold mt-1">ApexFix Bench Diagnostics & Velocity</h2>
            <p className="text-xs text-slate-300 mt-1 max-w-xl">
              Real-time repair pipeline metrics, technician throughput, and component lead time indicators.
            </p>
          </div>
          <div className="flex items-center gap-4 bg-white/10 backdrop-blur-xs p-3.5 rounded-xl border border-white/10">
            <div>
              <p className="text-[10px] text-slate-300 uppercase">Gross Volume</p>
              <p className="text-lg font-bold font-mono text-emerald-400">
                ${totalValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="h-8 w-px bg-white/20"></div>
            <div>
              <p className="text-[10px] text-slate-300 uppercase">Avg Work Order</p>
              <p className="text-lg font-bold font-mono text-indigo-200">
                ${avgTicket.toFixed(2)}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Analytics Breakdown Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Status Distribution */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <BarChart3 className="w-4 h-4 text-indigo-600" />
            Active Queue Distribution
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

        {/* SLA & Health */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <Clock className="w-4 h-4 text-indigo-600" />
            Turnaround & Lead Times
          </h3>

          <div className="space-y-4">
            <div className="flex items-center gap-3 p-3 bg-emerald-50 border border-emerald-100 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-emerald-900">94.2% On-Time Turnaround</p>
                <p className="text-[11px] text-emerald-700">Units delivered prior to due date commitment</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-blue-50 border border-blue-100 rounded-lg">
              <ShieldCheck className="w-5 h-5 text-blue-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-blue-900">0.8% Warranty RMA Rate</p>
                <p className="text-[11px] text-blue-700">Post-repair quality inspection passed</p>
              </div>
            </div>

            <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-100 rounded-lg">
              <Clock className="w-5 h-5 text-slate-600 shrink-0" />
              <div>
                <p className="text-xs font-bold text-slate-800">1.8 Days Avg Triage</p>
                <p className="text-[11px] text-slate-500">From intake intake to diagnostic completion</p>
              </div>
            </div>
          </div>
        </div>

        {/* Workstation Bench Performance */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Bench Workload & Tech Metrics
          </h3>

          <div className="space-y-3 text-xs">
            <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Lead Tech Assigned:</span>
                <span className="font-bold text-slate-900">Alex Mercer</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Current Bench:</span>
                <span className="font-semibold text-slate-700">Bench #04 (Hardware/Micro-solder)</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Efficiency Rating:</span>
                <span className="font-bold text-emerald-600">98.4% Standard</span>
              </div>
            </div>

            <div className="p-3 bg-indigo-50/70 border border-indigo-100 rounded-lg text-indigo-900 space-y-1">
              <p className="font-bold text-[11px]">Notice: 2 Units Waiting on Parts</p>
              <p className="text-[11px] text-indigo-700 leading-relaxed">
                Dell XPS fan vapor-chamber and MacBook top-case scheduled for delivery via express distributor.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
