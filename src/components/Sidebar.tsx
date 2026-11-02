import React from 'react';
import {
  LayoutDashboard,
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
  currentTab: 'dashboard' | 'dataview' | 'analytics' | 'customers' | 'inventory' | 'settings';
  setCurrentTab: (tab: 'dashboard' | 'dataview' | 'analytics' | 'customers' | 'inventory' | 'settings') => void;
  stats: DashboardStats | null;
  openCreateModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  stats,
  openCreateModal,
}) => {
  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col justify-between p-4 shrink-0 h-[calc(100vh-61px)] sticky top-[61px] select-none shadow-[1px_0_4px_rgba(0,0,0,0.02)]">
      {/* Top Nav Section */}
      <div className="space-y-5">
        <div>
          <p className="px-3 text-[10px] font-bold tracking-wider text-slate-400 uppercase mb-2">
            Main Navigation
          </p>
          <nav className="space-y-1">
            <button
              onClick={() => setCurrentTab('dashboard')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                currentTab === 'dashboard'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                <span>Dashboard</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-700">
                {stats?.totalActive ?? 0}
              </span>
            </button>

            <button
              onClick={openCreateModal}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 hover:text-slate-900 transition-all"
            >
              <div className="flex items-center gap-2.5">
                <PlusCircle className="w-4 h-4 text-slate-400" />
                <span>New Ticket</span>
              </div>
              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-indigo-600 text-white">
                + New
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('customers')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                currentTab === 'customers'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-4 h-4 text-slate-400" />
                <span>CRM Customers</span>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-600">
                {stats?.customerCount ?? 0}
              </span>
            </button>

            <button
              onClick={() => setCurrentTab('inventory')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                currentTab === 'inventory'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Package className="w-4 h-4 text-slate-400" />
                <span>Parts Inventory</span>
              </div>
              {stats && stats.waitingOnParts > 0 ? (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-700">
                  {stats.waitingOnParts} req
                </span>
              ) : null}
            </button>

            <button
              onClick={() => setCurrentTab('analytics')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
                currentTab === 'analytics'
                  ? 'bg-indigo-50 text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <BarChart3 className="w-4 h-4 text-slate-400" />
                <span>Analytics</span>
              </div>
            </button>

            <button
              onClick={() => setCurrentTab('settings')}
              className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
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

        {/* Strengthened Visual Separation / Divider */}
        <div className="relative py-1">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-200"></div>
          </div>
          <div className="relative flex justify-center text-[10px] uppercase font-bold text-slate-400 bg-white px-2">
            Local Workstation
          </div>
        </div>

        {/* Elevated Bench Info Box */}
        <div className="bg-gradient-to-br from-slate-900 to-indigo-950 text-white rounded-xl p-3.5 shadow-md space-y-2.5 border border-slate-800">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              Bench #04 Active
            </span>
            <Cpu className="w-3.5 h-3.5 text-indigo-300" />
          </div>

          <div className="text-[11px] text-slate-300 space-y-1 pt-1 border-t border-white/10">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Assigned:</span>
              <span className="font-semibold text-white">Alex Mercer</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-slate-400">Shop Rate:</span>
              <span className="font-semibold font-mono text-emerald-400">$85/hr standard</span>
            </div>
          </div>
        </div>
      </div>

      {/* Technician Profile Card */}
      <div className="pt-3 border-t border-slate-200 flex items-center gap-3">
        <div className="w-9 h-9 rounded-full bg-indigo-600 text-white font-bold text-xs flex items-center justify-center border-2 border-indigo-200 shadow-sm">
          AM
        </div>
        <div className="overflow-hidden">
          <h4 className="text-xs font-bold text-slate-900 truncate">Alex Mercer</h4>
          <p className="text-[10px] text-slate-500 font-medium truncate flex items-center gap-1">
            <UserCheck className="w-3 h-3 text-emerald-600" />
            Master Technician
          </p>
        </div>
      </div>
    </aside>
  );
};
