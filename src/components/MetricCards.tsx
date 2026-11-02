import React from 'react';
import { DashboardStats } from '../types';
import {
  Wrench,
  Clock,
  Package,
  CheckCircle2,
} from 'lucide-react';

interface MetricCardsProps {
  stats: DashboardStats | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats }) => {
  const activeCount = stats?.totalActive ?? stats?.open ?? 0;
  const inProgress = stats?.inProgress ?? 0;
  const waitingParts = stats?.waitingOnParts ?? 0;
  const completed = stats?.completed ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
      {/* 1. Active Queue */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider">Active Queue</span>
          <div className="w-7 h-7 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center">
            <Wrench className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl lg:text-3xl font-extrabold font-mono text-slate-900">{activeCount}</span>
          <span className="text-xs font-semibold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            Open Tickets
          </span>
        </div>
      </div>

      {/* 2. In Progress */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider">In-Progress</span>
          <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Clock className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl lg:text-3xl font-extrabold font-mono text-blue-700">{inProgress}</span>
          <span className="text-xs font-semibold text-slate-500">Under Repair</span>
        </div>
      </div>

      {/* 3. Waiting on Parts */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider">Waiting Parts</span>
          <div className="w-7 h-7 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Package className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl lg:text-3xl font-extrabold font-mono text-amber-700">{waitingParts}</span>
          <span className="text-xs font-semibold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
            Awaiting Stock
          </span>
        </div>
      </div>

      {/* 4. Ready / Completed */}
      <div className="bg-white p-4 rounded-xl border border-slate-200/90 shadow-xs flex flex-col justify-between hover:border-slate-300 transition-colors">
        <div className="flex items-center justify-between text-slate-500 mb-2">
          <span className="text-xs font-bold uppercase tracking-wider">Completed / Ready</span>
          <div className="w-7 h-7 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <CheckCircle2 className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-2xl lg:text-3xl font-extrabold font-mono text-emerald-700">{completed}</span>
          <span className="text-xs font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full">
            Ready for Pickup
          </span>
        </div>
      </div>
    </div>
  );
};
