import React from 'react';
import { ClipboardList, Cog, Truck, DollarSign, CheckCircle2, TrendingUp } from 'lucide-react';
import { DashboardStats } from '../types';

interface MetricCardsProps {
  stats: DashboardStats | null;
}

export const MetricCards: React.FC<MetricCardsProps> = ({ stats }) => {
  const secured = stats?.securedInvoiced ?? 0;
  const projected = stats?.projectedPipeline ?? 0;
  const total = stats?.totalPipeline ?? (secured + projected);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
      {/* 1. Active Work Orders */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Active Work Orders
            </p>
            <h3 className="text-2xl font-bold text-slate-900 mt-1">
              {stats?.totalActive ?? 0}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Across all workstations</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
            <ClipboardList className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 2. In-Progress */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              In-Progress
            </p>
            <h3 className="text-2xl font-bold text-blue-600 mt-1">
              {stats?.inProgress ?? 0}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Under technician active work</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600">
            <Cog className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 3. Waiting on Parts */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
              Waiting on Parts
            </p>
            <h3 className="text-2xl font-bold text-amber-600 mt-1">
              {stats?.waitingOnParts ?? 0}
            </h3>
            <p className="text-[11px] text-slate-400 mt-1">Components in transit</p>
          </div>
          <div className="w-9 h-9 rounded-lg bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
            <Truck className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* 4. Financial Breakdown: Secured vs Projected Pipeline */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-4 shadow-sm hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="w-full">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Financial Pipeline
              </p>
              <span className="font-mono text-sm font-bold text-slate-900">
                ${total.toLocaleString('en-US', { minimumFractionDigits: 2 })}
              </span>
            </div>

            {/* Split Breakdown */}
            <div className="mt-2.5 space-y-1.5 pt-1.5 border-t border-slate-100">
              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-emerald-700 font-semibold">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  Secured Invoiced:
                </span>
                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                  ${secured.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>

              <div className="flex items-center justify-between text-[11px]">
                <span className="flex items-center gap-1.5 text-blue-700 font-semibold">
                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                  Projected Queue:
                </span>
                <span className="font-mono font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded">
                  ${projected.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
