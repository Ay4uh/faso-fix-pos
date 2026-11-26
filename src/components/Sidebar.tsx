import React from 'react';
import {
  LayoutDashboard,
  Users,
  BarChart3,
  Settings,
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
  openCreateModal?: () => void;
  onOpenTimeClock?: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentTab,
  setCurrentTab,
  stats,
  currentUser,
  onOpenAdminLogin,
  onLogout,
}) => {
  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <aside className="w-64 shrink-0 bg-slate-50/90 border-r border-slate-200/90 flex flex-col justify-between select-none z-20 shadow-[1px_0_3px_rgba(0,0,0,0.02)] h-[calc(100vh-64px)] sticky top-16">
      {/* Top Navigation */}
      <div className="overflow-y-auto flex-1">
        <nav className="p-4 space-y-1.5">
          <div className="px-3 pb-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
            Workspace
          </div>

          <button
            onClick={() => setCurrentTab('repairs')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'repairs'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <LayoutDashboard className={`w-4 h-4 transition-transform duration-150 group-hover:scale-105 ${currentTab === 'repairs' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Dashboard</span>
            </div>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums ${
                currentTab === 'repairs' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {stats?.totalActive ?? 0}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('customers')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'customers'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Users className={`w-4 h-4 transition-transform duration-150 group-hover:scale-105 ${currentTab === 'customers' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Customers</span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-semibold tabular-nums">
              {stats?.customerCount ?? 0}
            </span>
          </button>

          <button
            onClick={() => setCurrentTab('analytics')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'analytics'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <BarChart3 className={`w-4 h-4 transition-transform duration-150 group-hover:scale-105 ${currentTab === 'analytics' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Analytics</span>
            </div>
          </button>

          <button
            onClick={() => setCurrentTab('settings')}
            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
            }`}
          >
            <div className="flex items-center space-x-3">
              <Settings className={`w-4 h-4 transition-transform duration-150 group-hover:scale-105 ${currentTab === 'settings' ? 'text-indigo-600' : 'text-slate-500'}`} />
              <span>Settings</span>
            </div>
          </button>

          {/* If already authenticated as Admin, show Admin Dashboard in menu too */}
          {isAdmin && (
            <button
              onClick={() => setCurrentTab('admin')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-700 hover:bg-purple-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <ShieldAlert className={`w-4 h-4 transition-transform duration-150 group-hover:scale-105 ${currentTab === 'admin' ? 'text-purple-200' : 'text-purple-600'}`} />
                <span>Admin Console</span>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-bold uppercase">
                Admin
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* ========================================================
          BOTTOM AUTH & SYSTEM ACCESS SECTION — BRIGHT & ACCESSIBLE
         ======================================================== */}
      <div className="p-3 border-t border-slate-200 bg-white space-y-2">
        {currentUser ? (
          <div className="space-y-2">
            {/* User Profile Card */}
            <div className={`p-3 rounded-2xl border transition-colors ${
              isAdmin 
                ? 'bg-purple-50/80 text-purple-950 border-purple-200/90 shadow-xs' 
                : 'bg-slate-50 text-slate-900 border-slate-200'
            }`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2.5 min-w-0">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                    isAdmin 
                      ? 'bg-purple-200/80 border border-purple-300 text-purple-800' 
                      : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                  }`}>
                    {isAdmin ? '👑' : currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <div className="truncate">
                    <p className="text-xs font-bold truncate text-slate-900">
                      {currentUser.name}
                    </p>
                    <p className={`text-[10px] font-mono ${isAdmin ? 'text-purple-700 font-semibold' : 'text-slate-500'}`}>
                      {isAdmin ? 'Administrator' : (currentUser.bench || 'Technician')}
                    </p>
                  </div>
                </div>
                <span className="w-2 h-2 rounded-full bg-emerald-500 ui-pulse-ring shrink-0 ml-1" title="Session Active" />
              </div>
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
              className="w-full py-2.5 px-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold ui-press flex items-center justify-center gap-2 cursor-pointer shadow-2xs group"
            >
              <LogOut className="w-4 h-4 text-rose-600 group-hover:-translate-x-0.5 transition-transform" />
              <span>Log Out</span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onLogout}
              className="w-full py-2 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold ui-press flex items-center justify-center gap-2 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500" />
              <span>Exit to Login</span>
            </button>
            {/* Guest / Offline Mode Note */}
            <div className="p-2 bg-slate-50 rounded-2xl border border-slate-200/80 flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="w-2 h-2 rounded-full bg-slate-400" />
                <span className="text-[11px] font-semibold text-slate-600">Guest Mode</span>
              </div>
            </div>

            {/* Clearly Visible Dedicated Admin Login Button */}
            <button
              type="button"
              onClick={onOpenAdminLogin}
              className="w-full flex items-center justify-between p-3 rounded-2xl bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-200 text-purple-900 ui-press shadow-xs group cursor-pointer"
            >
              <div className="flex items-center space-x-2.5">
                <div className="w-7 h-7 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center group-hover:scale-105 transition-transform">
                  <Lock className="w-3.5 h-3.5" />
                </div>
                <div className="text-left">
                  <div className="text-xs font-extrabold text-purple-900 flex items-center gap-1">
                    <span>Admin Login</span>
                    <Shield className="w-3 h-3 text-purple-700" />
                  </div>
                  <p className="text-[10px] text-purple-600">Master system controls</p>
                </div>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-bold group-hover:bg-purple-700 transition-colors">
                Enter &rarr;
              </span>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
