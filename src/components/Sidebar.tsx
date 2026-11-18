import React from 'react';
import {
  LayoutDashboard,
  PlusCircle,
  Users,
  BarChart3,
  Settings,
  Package,
  Shield,
  ShieldAlert,
  LogOut,
  Lock,
} from 'lucide-react';
import { DashboardStats, User as UserType } from '../types';

interface SidebarProps {
  currentTab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings' | 'admin';
  setCurrentTab: (tab: 'repairs' | 'customers' | 'inventory' | 'analytics' | 'settings' | 'admin') => void;
  stats: DashboardStats | null;
  currentUser: UserType | null;
  onOpenAdminLogin: () => void;
  onLogout: () => void;
  openCreateModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  stats,
  currentUser,
  onOpenAdminLogin,
  onLogout,
  openCreateModal,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <aside className="w-64 shrink-0 bg-slate-50/90 border-r border-slate-200/90 flex flex-col justify-between select-none z-20 shadow-[1px_0_3px_rgba(0,0,0,0.02)] h-[calc(100vh-64px)] sticky top-16">
      {/* Top Navigation */}
      <div className="overflow-y-auto flex-1">
        <nav className="p-4 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>Workspace</span>
            <span className="text-[10px] text-slate-400 font-mono">v3.4.2</span>
          </div>

          <button
            onClick={() => setCurrentTab('repairs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'repairs'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <LayoutDashboard className={`w-4 h-4 ${currentTab === 'repairs' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Dashboard</span>
            </div>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${
                currentTab === 'repairs' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {stats?.totalActive ?? 0}
            </span>
          </button>

          <button
            onClick={openCreateModal}
            className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all text-slate-600 hover:bg-slate-100 hover:text-slate-900 cursor-pointer"
          >
            <div className="flex items-center space-x-3">
              <PlusCircle className="w-4 h-4 text-indigo-600" />
              <span>New Ticket</span>
            </div>
            <span className="inline-flex items-center text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold shadow-2xs">
              + New
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('customers')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'customers'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Users className={`w-4 h-4 ${currentTab === 'customers' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Customers</span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-semibold">
              {stats?.customerCount ?? 0}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('inventory')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'inventory'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Package className={`w-4 h-4 ${currentTab === 'inventory' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Parts &amp; Stock</span>
            </div>
            {stats && stats.lowStock > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold border border-amber-200">
                {stats.lowStock} Low
              </span>
            )}
          </button>

          <button
            onClick={() => setCurrentTab('analytics')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'analytics'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
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
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Settings className={`w-4 h-4 ${currentTab === 'settings' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Settings</span>
            </div>
          </button>

          {/* If already authenticated as Admin, show Admin Dashboard in menu too */}
          {isAdmin && (
            <button
              onClick={() => setCurrentTab('admin')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-slate-900 text-white shadow-xs border border-slate-800'
                  : 'text-purple-700 hover:bg-purple-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <ShieldAlert className={`w-4 h-4 ${currentTab === 'admin' ? 'text-purple-400' : 'text-purple-600'}`} />
                <span>Admin Console</span>
              </div>
              <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-600 text-white font-bold uppercase">
                Admin
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* ========================================================
          BOTTOM AUTH & SYSTEM ACCESS SECTION — VISUALLY SEPARATED
         ======================================================== */}
      <div className="p-3 border-t-2 border-slate-200 bg-white space-y-2">
        {currentUser ? (
          <div className="space-y-2">
            {/* User Profile Card */}
            <div className={`p-2.5 rounded-xl border transition-all ${
              isAdmin 
                ? 'bg-gradient-to-r from-slate-900 to-indigo-950 text-white border-slate-800 shadow-xs' 
                : 'bg-slate-50 text-slate-900 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${
                    isAdmin 
                      ? 'bg-indigo-500/30 border border-indigo-400/40 text-indigo-300' 
                      : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  }`}>
                    {isAdmin ? '👑' : currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className={`text-xs font-bold truncate ${isAdmin ? 'text-white' : 'text-slate-900'}`}>
                      {currentUser.name}
                    </p>
                    <p className={`text-[10px] font-mono ${isAdmin ? 'text-indigo-300' : 'text-slate-500'}`}>
                      {isAdmin ? 'Administrator' : (currentUser.bench || 'Technician')}
                    </p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0 ml-1" title="Session Active" />
              </div>

              {isAdmin && (
                <div className="pt-2 mt-2 border-t border-slate-800/80">
                  <button
                    type="button"
                    onClick={() => setCurrentTab('admin')}
                    className={`w-full py-1.5 rounded-lg text-[11px] font-bold text-center transition cursor-pointer ${
                      currentTab === 'admin'
                        ? 'bg-indigo-600 text-white'
                        : 'bg-slate-800 text-slate-200 hover:bg-slate-700'
                    }`}
                  >
                    Open Admin Console &rarr;
                  </button>
                </div>
              )}
            </div>

            {/* Dedicated High-Contrast Logout Button */}
            <button
              type="button"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onLogout();
              }}
              title="Sign out of current account"
              className="w-full py-2 px-3 bg-red-50 hover:bg-red-100 active:bg-red-200 border border-red-200 text-red-700 hover:text-red-800 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer shadow-2xs group"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600 group-hover:scale-110 transition-transform" />
              <span>Log Out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {/* Guest / Offline Mode Note */}
            <div className="p-2 bg-slate-50 rounded-xl border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[11px] font-semibold text-slate-600">Guest Tech Mode</span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono">Standard POS</span>
            </div>

            {/* Clearly Visible Dedicated Admin Login Button */}
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-900 hover:bg-slate-800 active:bg-slate-950 text-white transition-all shadow-md shadow-slate-900/10 border border-slate-800 group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-lg bg-indigo-500/20 border border-indigo-400/30 text-indigo-400 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-extrabold text-white flex items-center gap-1">
                    <span>Admin Login</span>
                    <Shield className="w-3 h-3 text-indigo-400" />
                  </div>
                  <p className="text-[10px] text-slate-400">Master system controls</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded bg-indigo-600 text-white font-bold group-hover:bg-indigo-500 transition">
                Enter &rarr;
              </span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
