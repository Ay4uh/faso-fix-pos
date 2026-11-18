import React from 'react';
import { DashboardStats } from '../types';
import { Cpu, Loader, Package, BadgeDollarSign } from 'lucide-react';

interface MetricCardsProps {
  stats: DashboardStats | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats }) => {
  const activeCount = stats?.totalActive ?? stats?.open ?? 0;
  const inProgress = stats?.inProgress ?? 0;
  const waitingParts = stats?.waitingOnParts ?? 0;
  const pipelineDollars = stats?.openValueCents ? (stats.openValueCents / 100).toFixed(2) : '0.00';

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. Active Work Orders */}
      <div className="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-sm transition-shadow flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Active Work Orders</p>
          <h3 className="text-3xl font-extrabold text-indigo-600 mt-1 font-mono tracking-tight">{activeCount}</h3>
          <p className="text-[11px] text-slate-600 font-medium mt-0.5">Across all workstations</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
          <Cpu className="w-5 h-5" />
        </div>
      </div>

      {/* 2. In Progress */}
      <div className="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-sm transition-shadow flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-[11px]">In Progress</p>
          <h3 className="text-3xl font-extrabold text-blue-600 mt-1 font-mono tracking-tight">{inProgress}</h3>
          <p className="text-[11px] text-blue-700 font-medium mt-0.5">Under technician active work</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shadow-xs">
          <Loader className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Waiting on Parts */}
      <div className="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-sm transition-shadow flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Waiting on Parts</p>
          <h3 className="text-3xl font-extrabold text-amber-600 mt-1 font-mono tracking-tight">{waitingParts}</h3>
          <p className="text-[11px] text-amber-700 font-medium mt-0.5">Components in transit</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shadow-xs">
          <Package className="w-5 h-5" />
        </div>
      </div>

      {/* 4. Estimated Pipeline */}
      <div className="bg-white p-4.5 rounded-xl border border-slate-200/90 shadow-xs hover:shadow-sm transition-shadow flex items-center justify-between">
        <div>
          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider text-[11px]">Estimated Pipeline</p>
          <h3 className="text-3xl font-extrabold text-emerald-600 mt-1 font-mono tracking-tight">${pipelineDollars}</h3>
          <p className="text-[11px] text-emerald-700 font-medium mt-0.5">Repairs value (Inc. Tax)</p>
        </div>
        <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 text-emerald-600 flex items-center justify-center shadow-xs">
          <BadgeDollarSign className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
