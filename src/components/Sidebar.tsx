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
    <aside className="group/sidebar w-[68px] hover:w-64 shrink-0 bg-slate-50/95 backdrop-blur-xs border-r border-slate-200/90 flex flex-col justify-between select-none z-30 shadow-[1px_0_3px_rgba(0,0,0,0.02)] hover:shadow-xl hover:shadow-slate-900/5 h-[calc(100vh-64px)] sticky top-16 overflow-hidden transition-[width,box-shadow] duration-[380ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
      {/* Top Navigation */}
      <div className="overflow-y-auto overflow-x-hidden flex-1">
        <nav className="p-3 space-y-1.5">
          <div className="px-2.5 pb-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider whitespace-nowrap overflow-hidden opacity-0 group-hover/sidebar:opacity-100 transition-opacity duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
            Workspace
          </div>

          {/* 1. Dashboard */}
          <button
            onClick={() => setCurrentTab('repairs')}
            title="Dashboard"
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'repairs'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <div className="flex items-center min-w-0">
              <LayoutDashboard
                className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                  currentTab === 'repairs' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                Dashboard
              </span>
            </div>
            <span
              className={`text-[11px] px-2 py-0.5 rounded-full font-bold tabular-nums shrink-0 opacity-0 scale-90 max-w-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:scale-100 group-hover/sidebar:max-w-[60px] transition-[opacity,transform,max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
                currentTab === 'repairs' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200/80 text-slate-700'
              }`}
            >
              {stats?.totalActive ?? 0}
            </span>
          </button>

          {/* 2. Customers */}
          <button
            onClick={() => setCurrentTab('customers')}
            title="Customers"
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'customers'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <div className="flex items-center min-w-0">
              <Users
                className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                  currentTab === 'customers' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                Customers
              </span>
            </div>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-200/80 text-slate-700 font-semibold tabular-nums shrink-0 opacity-0 scale-90 max-w-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:scale-100 group-hover/sidebar:max-w-[60px] transition-[opacity,transform,max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
              {stats?.customerCount ?? 0}
            </span>
          </button>

          {/* 3. Analytics */}
          <button
            onClick={() => setCurrentTab('analytics')}
            title="Analytics"
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'analytics'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <div className="flex items-center min-w-0">
              <BarChart3
                className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                  currentTab === 'analytics' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                Analytics
              </span>
            </div>
          </button>

          {/* 4. Settings */}
          <button
            onClick={() => setCurrentTab('settings')}
            title="Settings"
            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/90'
                : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
            }`}
          >
            <div className="flex items-center min-w-0">
              <Settings
                className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                  currentTab === 'settings' ? 'text-indigo-600' : 'text-slate-500'
                }`}
              />
              <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                Settings
              </span>
            </div>
          </button>

          {/* 5. Admin Console */}
          {isAdmin && (
            <button
              onClick={() => setCurrentTab('admin')}
              title="Admin Console"
              className={`w-full flex items-center justify-between px-3 py-2.5 rounded-2xl text-xs font-bold ui-press group cursor-pointer ${
                currentTab === 'admin'
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-purple-700 hover:bg-purple-50'
              }`}
            >
              <div className="flex items-center min-w-0">
                <ShieldAlert
                  className={`w-4 h-4 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105 ${
                    currentTab === 'admin' ? 'text-purple-200' : 'text-purple-600'
                  }`}
                />
                <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[140px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                  Admin Console
                </span>
              </div>
              <span className="text-[9px] px-2 py-0.5 rounded-full bg-purple-600 text-white font-bold uppercase shrink-0 opacity-0 scale-90 max-w-0 overflow-hidden group-hover/sidebar:opacity-100 group-hover/sidebar:scale-100 group-hover/sidebar:max-w-[60px] transition-[opacity,transform,max-width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]">
                Admin
              </span>
            </button>
          )}
        </nav>
      </div>

      {/* Bottom Auth & Profile Section */}
      <div className="p-3 border-t border-slate-200 bg-white space-y-2">
        {currentUser ? (
          <div className="space-y-2">
            {/* User Profile Card */}
            <div
              title={`${currentUser.name} (${isAdmin ? 'Administrator' : currentUser.bench || 'Technician'})`}
              className={`p-1.5 rounded-2xl border transition-[background-color,border-color] duration-300 ${
                isAdmin
                  ? 'bg-purple-50/80 text-purple-950 border-purple-200/90 shadow-xs'
                  : 'bg-slate-50 text-slate-900 border-slate-200'
              }`}
            >
              <div className="flex items-center min-w-0">
                <div className="relative shrink-0">
                  <div
                    className={`w-8 h-8 rounded-xl flex items-center justify-center text-xs font-bold ${
                      isAdmin
                        ? 'bg-purple-200/80 border border-purple-300 text-purple-800'
                        : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                    }`}
                  >
                    {isAdmin ? '👑' : currentUser.name.charAt(0).toUpperCase()}
                  </div>
                  <span
                    className="w-2.5 h-2.5 rounded-full bg-emerald-500 ring-2 ring-white absolute -bottom-0.5 -right-0.5"
                    title="Session Active"
                  />
                </div>
                <div className="ml-2.5 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[155px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <p className="text-xs font-bold truncate text-slate-900">{currentUser.name}</p>
                  <p
                    className={`text-[10px] font-mono truncate ${
                      isAdmin ? 'text-purple-700 font-semibold' : 'text-slate-500'
                    }`}
                  >
                    {isAdmin ? 'Administrator' : currentUser.bench || 'Technician'}
                  </p>
                </div>
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
              className="w-full py-2.5 px-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold ui-press flex items-center cursor-pointer shadow-2xs group"
            >
              <LogOut className="w-4 h-4 text-rose-600 shrink-0 transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] group-hover:-translate-x-0.5" />
              <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[100px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                Log Out
              </span>
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onLogout}
              title="Exit to Login"
              className="w-full py-2.5 px-3 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold ui-press flex items-center cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="ml-3 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[100px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)]">
                Exit to Login
              </span>
            </button>

            <button
              type="button"
              onClick={onOpenAdminLogin}
              title="Admin Login"
              className="w-full flex items-center p-2 rounded-2xl bg-purple-50 hover:bg-purple-100 active:bg-purple-200 border border-purple-200 text-purple-900 ui-press shadow-xs group cursor-pointer"
            >
              <div className="w-7 h-7 rounded-xl bg-purple-100 border border-purple-200 text-purple-700 flex items-center justify-center shrink-0">
                <Lock className="w-3.5 h-3.5" />
              </div>
              <div className="ml-2.5 max-w-0 opacity-0 -translate-x-1 overflow-hidden whitespace-nowrap group-hover/sidebar:max-w-[130px] group-hover/sidebar:opacity-100 group-hover/sidebar:translate-x-0 transition-[max-width,opacity,transform] duration-[340ms] ease-[cubic-bezier(0.16,1,0.3,1)] text-left">
                <div className="text-xs font-extrabold text-purple-900 flex items-center gap-1">
                  <span>Admin Login</span>
                  <Shield className="w-3 h-3 text-purple-700" />
                </div>
                <p className="text-[10px] text-purple-600">Master controls</p>
              </div>
            </button>
          </div>
        )}
      </div>
    </aside>
  );
};
