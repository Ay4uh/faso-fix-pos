import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  Package,
  BarChart3,
  Settings,
} from 'lucide-react';
import { DashboardStats } from '../types';

interface SidebarProps {
  currentTab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings';
  setCurrentTab: (tab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings') => void;
  stats: DashboardStats | null;
  selectedBench?: string;
  openCreateModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  stats,
  selectedBench = 'ALL',
  openCreateModal,
}) => {
  const activeBenchName = selectedBench === 'ALL' ? 'Bench #04 Active' : `${selectedBench} Active`;

  return (
    <aside className="w-64 shrink-0 bg-white border-r border-slate-200/80 flex flex-col justify-between select-none z-20 shadow-xs h-[calc(100vh-64px)] sticky top-16">
      <div>
        {/* Navigation Menu */}
        <nav className="p-4 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            Menu
          </div>

          <button
            onClick={() => setCurrentTab('repairs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'repairs'
                ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <LayoutDashboard className={`w-4 h-4 ${currentTab === 'repairs' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>Dashboard</span>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
                currentTab === 'repairs' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              {stats?.totalActive ?? 0}
            </span>
          </button>

          <button
            onClick={openCreateModal}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <PlusCircle className="w-4 h-4 text-slate-400" />
              <span>New Ticket</span>
            </div>
            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold">
              + New
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('customers')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'customers'
                ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Users className={`w-4 h-4 ${currentTab === 'customers' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>Customers</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-medium">
              {stats?.customerCount ?? 0}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('inventory')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'inventory'
                ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Package className={`w-4 h-4 ${currentTab === 'inventory' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>Parts &amp; Stock</span>
            </div>
            {stats && stats.lowStock > 0 && (
              <span className="text-xs px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                {stats.lowStock} low
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('analytics')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'analytics'
                ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <BarChart3 className={`w-4 h-4 ${currentTab === 'analytics' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>Analytics</span>
            </div>
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Settings className={`w-4 h-4 ${currentTab === 'settings' ? 'text-indigo-600' : 'text-slate-400'}`} />
              <span>Settings</span>
            </div>
          </button>
        </nav>

        {/* Workstation Quick Status */}
        <div className="mx-4 mt-4 p-3.5 bg-slate-50 border border-slate-200/70 rounded-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-700 flex items-center space-x-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
              <span>{activeBenchName}</span>
            </span>
            <span className="text-[10px] text-slate-500 font-mono">v3.4.1</span>
          </div>
          <div className="text-[11px] text-slate-500 leading-snug">
            Lead Technician: <strong className="text-slate-800">Alex Mercer</strong>
          </div>
          <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex justify-between text-[11px]">
            <span className="text-slate-500">Shop Rate:</span>
            <span className="font-semibold text-slate-800">$85/hr standard</span>
          </div>
        </div>
      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-slate-200/80 bg-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold flex items-center justify-center text-xs shadow-xs">
              AM
            </div>
            <div className="truncate">
              <p className="text-xs font-semibold text-slate-900 truncate">Alex Mercer</p>
              <p className="text-[11px] text-slate-500 truncate">Master Technician</p>
            </div>
          </div>
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Online"></span>
          </div>
        </div>
      </div>
    </aside>
  );
};
