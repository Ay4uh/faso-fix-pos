import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Users,
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
  openCreateModal,
}) => {
  return (
    <aside className="w-64 shrink-0 bg-slate-50/80 border-r border-slate-200/90 flex flex-col justify-between select-none z-20 shadow-[1px_0_3px_rgba(0,0,0,0.02)] h-[calc(100vh-64px)] sticky top-16">
      <div>
        {/* Navigation Menu */}
        <nav className="p-4 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Menu
          </div>

          <button
            onClick={() => setCurrentTab('repairs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'repairs'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <LayoutDashboard className={`w-4 h-4 ${currentTab === 'repairs' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Dashboard</span>
            </div>
            <span
              className={`text-xs px-2 py-0.5 rounded-full font-bold ${
                currentTab === 'repairs' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {stats?.totalActive ?? 0}
            </span>
          </button>

          <button
            onClick={openCreateModal}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <PlusCircle className="w-4 h-4 text-slate-500" />
              <span>New Ticket</span>
            </div>
            <span className="inline-flex items-center text-[10px] px-1.5 py-0.5 rounded bg-indigo-600 text-white font-bold shadow-2xs">
              + New
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('customers')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'customers'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Users className={`w-4 h-4 ${currentTab === 'customers' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Customers</span>
            </div>
            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-semibold">
              {stats?.customerCount ?? 0}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('analytics')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'analytics'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <BarChart3 className={`w-4 h-4 ${currentTab === 'analytics' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Analytics</span>
            </div>
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-white text-indigo-700 font-bold shadow-xs border border-slate-200/80'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Settings className={`w-4 h-4 ${currentTab === 'settings' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Settings</span>
            </div>
          </button>
        </nav>
      </div>

      {/* User Profile Footer */}
      <div className="p-4 border-t border-slate-200/90 bg-white/70">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 text-indigo-700 font-bold flex items-center justify-center text-xs shadow-xs">
              AM
            </div>
            <div className="truncate">
              <p className="text-xs font-bold text-slate-900 truncate">Alex Mercer</p>
              <p className="text-[11px] text-slate-500 font-medium truncate">Master Technician</p>
            </div>
          </div>
          <div className="flex items-center">
            <span className="w-2 h-2 rounded-full bg-emerald-500 ring-2 ring-emerald-100" title="Online"></span>
          </div>
        </div>
      </div>
    </aside>
  );
};
