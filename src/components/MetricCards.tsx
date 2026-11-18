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
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Active Work Orders</p>
          <h3 className="text-2xl font-bold text-slate-900 mt-1 font-mono">{activeCount}</h3>
          <p className="text-[11px] text-slate-500 mt-0.5">Across all workstations</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Cpu className="w-5 h-5" />
        </div>
      </div>

      {/* 2. In Progress */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">In Progress</p>
          <h3 className="text-2xl font-bold text-blue-600 mt-1 font-mono">{inProgress}</h3>
          <p className="text-[11px] text-blue-700/80 mt-0.5">Under technician active work</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
          <Loader className="w-5 h-5" />
        </div>
      </div>

      {/* 3. Waiting on Parts */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Waiting on Parts</p>
          <h3 className="text-2xl font-bold text-amber-600 mt-1 font-mono">{waitingParts}</h3>
          <p className="text-[11px] text-amber-700/80 mt-0.5">Components in transit</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
          <Package className="w-5 h-5" />
        </div>
      </div>

      {/* 4. Estimated Pipeline */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div>
          <p className="text-xs font-medium text-slate-500">Estimated Pipeline</p>
          <h3 className="text-2xl font-bold text-emerald-600 mt-1 font-mono">${pipelineDollars}</h3>
          <p className="text-[11px] text-emerald-700/80 mt-0.5">Repairs value (Inc. Tax)</p>
        </div>
        <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
          <BadgeDollarSign className="w-5 h-5" />
        </div>
      </div>
    </div>
  );
};
