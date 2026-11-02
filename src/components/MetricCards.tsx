import React from 'react';
import { DashboardStats } from '../types';
import {
  Wrench,
  Clock,
  Package,
  CheckCircle2,
  DollarSign,
  TrendingUp,
  AlertTriangle,
} from 'lucide-react';

interface MetricCardsProps {
  stats: DashboardStats | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats }) => {
  const activeCount = stats?.totalActive ?? stats?.open ?? 0;
  const inProgress = stats?.inProgress ?? 0;
  const waitingParts = stats?.waitingOnParts ?? 0;
  const completed = stats?.completed ?? 0;

  const pipeline = (stats?.openValueCents ? stats.openValueCents / 100 : stats?.totalPipeline) ?? 0;
  const monthRevenue = (stats?.collectedMonthCents ? stats.collectedMonthCents / 100 : stats?.securedInvoiced) ?? 0;

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {/* 1. Active Queue */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Active Queue</span>
          <div className="w-6 h-6 rounded-md bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Wrench className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-slate-900">{activeCount}</span>
          <span className="text-[10px] font-semibold text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
            Live
          </span>
        </div>
      </div>

      {/* 2. In Progress */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">In-Progress</span>
          <div className="w-6 h-6 rounded-md bg-blue-50 text-blue-600 flex items-center justify-center">
            <Clock className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-blue-700">{inProgress}</span>
          <span className="text-[10px] font-semibold text-slate-400">On bench</span>
        </div>
      </div>

      {/* 3. Waiting on Parts */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Waiting Parts</span>
          <div className="w-6 h-6 rounded-md bg-amber-50 text-amber-600 flex items-center justify-center">
            <Package className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-amber-700">{waitingParts}</span>
          {stats && stats.lowStock > 0 ? (
            <span className="text-[10px] font-bold text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded flex items-center gap-0.5">
              <AlertTriangle className="w-2.5 h-2.5" />
              {stats.lowStock} low
            </span>
          ) : (
            <span className="text-[10px] font-semibold text-slate-400">Pending arrival</span>
          )}
        </div>
      </div>

      {/* 4. Ready / Completed */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Completed</span>
          <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold font-mono text-emerald-700">{completed}</span>
          <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded">
            Tested OK
          </span>
        </div>
      </div>

      {/* 5. Open Pipeline */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Pipeline Owing</span>
          <div className="w-6 h-6 rounded-md bg-slate-100 text-slate-600 flex items-center justify-center">
            <DollarSign className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold font-mono text-slate-900">
            ${pipeline.toFixed(2)}
          </span>
          <span className="text-[10px] font-semibold text-slate-400">Uncollected</span>
        </div>
      </div>

      {/* 6. Collected Revenue */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-[11px] font-bold uppercase tracking-wider">Month Revenue</span>
          <div className="w-6 h-6 rounded-md bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <TrendingUp className="w-3.5 h-3.5" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-xl font-bold font-mono text-emerald-600">
            ${monthRevenue.toFixed(2)}
          </span>
          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
            Secured
          </span>
        </div>
      </div>
    </div>
  );
};
