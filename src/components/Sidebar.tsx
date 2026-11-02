import React from 'react';
import {
  Wrench,
  PlusCircle,
  Users,
  BarChart3,
  Settings,
  Package,
} from 'lucide-react';
import { DashboardStats } from '../types';

interface SidebarProps {
  currentTab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings';
  setCurrentTab: (tab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings') => void;
  stats: DashboardStats | null;
  selectedBench: string;
  openCreateModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  stats,
  openCreateModal,
}) => {

  return (
    <aside className="w-60 bg-white border-r border-slate-200 flex flex-col justify-between p-4 shrink-0 h-[calc(100vh-61px)] sticky top-[61px] select-none shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
      {/* Top Nav Section */}
      <div className="space-y-4">
        {/* Quick New Intake Button */}
        <button
          onClick={openCreateModal}
          className="w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white shadow-xs shadow-indigo-200 transition-all cursor-pointer"
        >
          <PlusCircle className="w-4 h-4" />
          <span>New Work Order</span>
        </button>

        <div>
          <p className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">
            Navigation
          </p>
          <nav className="space-y-1">
            <button
              onClick={() => setCurrentTab('repairs')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'repairs'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Wrench className="w-4 h-4 text-indigo-600" />
                <span>Repair Queue</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
                {stats?.totalActive ?? 0}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('customers')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'customers'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>Customers</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                {stats?.customerCount ?? 0}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('inventory')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'inventory'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-slate-400" />
                <span>Parts &amp; Stock</span>
              </div>
              {stats && stats.lowStock > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  {stats.lowStock} low
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setCurrentTab('analytics')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'analytics'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span>Analytics &amp; Reports</span>
              </div>
            </button>

            <button
              onClick={() => setCurrentTab('settings')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                currentTab === 'settings'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-4 h-4 text-slate-400" />
                <span>Settings</span>
              </div>
            </button>
          </nav>
        </div>
      </div>

      {/* Clean Shop Status Footer */}
      <div className="pt-3 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5 font-medium">
          <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
          ApexFix POS Online
        </span>
        <span className="font-mono text-slate-400 text-[10px]">v2.4</span>
      </div>
    </aside>
  );
};
