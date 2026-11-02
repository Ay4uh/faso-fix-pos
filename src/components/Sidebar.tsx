import React from 'react';
import {
  Wrench,
  PlusCircle,
  Users,
  BarChart3,
  Settings,
  Cpu,
  Package,
  UserCheck,
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
  selectedBench,
  openCreateModal,
}) => {
  const activeBenchName = selectedBench === 'ALL' ? 'All Shop Benches' : selectedBench;

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

        {/* Workstation Status Box */}
        <div className="bg-slate-900 text-white rounded-xl p-3 shadow-md space-y-2 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              {activeBenchName}
            </span>
            <Cpu className="w-3.5 h-3.5 text-indigo-300" />
          </div>

          <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Assigned Tech:</span>
              <span className="font-semibold text-white">Alex Mercer</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Shop Rate:</span>
              <span className="font-semibold font-mono text-emerald-400">$85/hr</span>
            </div>
          </div>
        </div>
      </div>

      {/* Technician Profile Card */}
      <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border border-indigo-200 shadow-xs">
          AM
        </div>
        <div className="overflow-hidden">
          <h4 className="text-xs font-bold text-slate-900 truncate">Alex Mercer</h4>
          <p className="text-[10px] text-slate-500 font-medium truncate flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-emerald-600" />
            Lead Technician
          </p>
        </div>
      </div>
    </aside>
  );
};
