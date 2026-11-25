import React from 'react';
import { DashboardStats } from '../types';
import { Cpu, Loader, Package, CheckCircle2 } from 'lucide-react';

interface MetricCardsProps {
  stats: DashboardStats | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats }) => {
  const activeCount = stats?.totalActive ?? stats?.open ?? 0;
  const inProgress = stats?.inProgress ?? 0;
  const waitingParts = stats?.waitingOnParts ?? 0;
  const readyPickup = stats?.awaitingPickupCount ?? stats?.completed ?? 0;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 ui-stagger">
      {/* 1. Active Work Orders */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-indigo-200/80 ui-card-lift group flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] sm:text-[11px] leading-tight">Active Work Orders</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-indigo-600 mt-1 font-mono tabular-nums tracking-tight">{activeCount}</h3>
          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 truncate">Across all workstations</p>
        </div>
        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs shrink-0 transition-transform duration-200 group-hover:scale-105">
          <Cpu className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>

      {/* 2. In Progress */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-blue-200/80 ui-card-lift group flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] sm:text-[11px] leading-tight">In Progress</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-blue-600 mt-1 font-mono tabular-nums tracking-tight">{inProgress}</h3>
          <p className="text-[10px] sm:text-[11px] text-blue-700 font-medium mt-0.5 truncate">Under technician active work</p>
        </div>
        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-blue-50 border border-blue-100 text-blue-600 flex items-center justify-center shadow-xs shrink-0 transition-transform duration-200 group-hover:scale-105">
          <Loader className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>

      {/* 3. Waiting on Parts */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-amber-200/80 ui-card-lift group flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] sm:text-[11px] leading-tight">Waiting on Parts</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1 font-mono tabular-nums tracking-tight">{waitingParts}</h3>
          <p className="text-[10px] sm:text-[11px] text-amber-700 font-medium mt-0.5 truncate">Components in transit</p>
        </div>
        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-amber-50 border border-amber-100 text-amber-600 flex items-center justify-center shadow-xs shrink-0 transition-transform duration-200 group-hover:scale-105">
          <Package className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>

      {/* 4. Ready for Pickup */}
      <div className="bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-md hover:border-teal-200/80 ui-card-lift group flex items-center justify-between gap-2 min-w-0">
        <div className="min-w-0">
          <p className="font-semibold text-slate-500 uppercase tracking-wider text-[10px] sm:text-[11px] leading-tight">Ready for Pickup</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-teal-600 mt-1 font-mono tabular-nums tracking-tight">{readyPickup}</h3>
          <p className="text-[10px] sm:text-[11px] text-teal-700 font-medium mt-0.5 truncate">Awaiting customer collection</p>
        </div>
        <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-teal-50 border border-teal-100 text-teal-600 flex items-center justify-center shadow-xs shrink-0 transition-transform duration-200 group-hover:scale-105">
          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </div>
    </div>
  );
};
