import React from 'react';
import {
  X,
  LayoutDashboard,
  PlusCircle,
  Users,
  Package,
  BarChart3,
  Settings,
  ShieldAlert,
  LogOut,
  Wrench,
  Clock,
} from 'lucide-react';
import { DashboardStats, User as UserType } from '../types';

interface MobileDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentTab: string;
  setCurrentTab: (tab: any) => void;
  stats: DashboardStats | null;
  currentUser: UserType | null;
  onLogout: () => void;
  openCreateModal: () => void;
  onOpenTimeClock?: () => void;
}

export const MobileDrawer: React.FC<MobileDrawerProps> = ({
  isOpen,
  onClose,
  currentTab,
  setCurrentTab,
  stats,
  currentUser,
  onLogout,
  openCreateModal,
  onOpenTimeClock,
}) => {
  if (!isOpen) return null;

  const isAdmin = currentUser?.role === 'ADMIN';

  const handleSelectTab = (tab: any) => {
    setCurrentTab(tab);
    onClose();
  };

  const handleCreate = () => {
    onClose();
    openCreateModal();
  };

  return (
    <div className="fixed inset-0 z-50 md:hidden flex">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity animate-in fade-in"
        onClick={onClose}
      />

      {/* Slide-out Drawer */}
      <div className="relative w-4/5 max-w-xs bg-white h-full shadow-2xl flex flex-col justify-between z-10 animate-in slide-in-from-left duration-200 border-r border-slate-200">
        <div>
          {/* Drawer Header */}
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
            <div className="flex items-center space-x-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                <Wrench className="w-4 h-4" />
              </div>
              <div>
                <h3 className="font-extrabold text-sm text-slate-900">Faso Fix POS</h3>
                <p className="text-[10px] text-slate-500 font-medium">Terminal v3.4.2</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* User Profile Info */}
          {currentUser && (
            <div className="p-4 border-b border-slate-100 bg-white">
              <div className="flex items-center space-x-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${
                  isAdmin ? 'bg-purple-100 text-purple-800 border border-purple-200' : 'bg-indigo-100 text-indigo-700 border border-indigo-200'
                }`}>
                  {isAdmin ? '👑' : currentUser.name.charAt(0).toUpperCase()}
                </div>
                <div className="truncate">
                  <h4 className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</h4>
                  <p className="text-[10px] text-slate-500 font-medium truncate">
                    {isAdmin ? 'Store Administrator' : (currentUser.bench || 'Technician')}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Navigation Items */}
          <nav className="p-3 space-y-1">
            <button
              onClick={() => handleSelectTab('repairs')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                currentTab === 'repairs'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <LayoutDashboard className="w-4 h-4 text-indigo-600" />
                <span>Work Orders</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold">
                {stats?.totalActive ?? 0}
              </span>
            </button>

            <button
              onClick={handleCreate}
              className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition text-slate-700 hover:bg-slate-50 cursor-pointer min-h-[44px]"
            >
              <div className="flex items-center space-x-3">
                <PlusCircle className="w-4 h-4 text-indigo-600" />
                <span>New Ticket</span>
              </div>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-600 text-white font-bold">
                + New
              </span>
            </button>

            <button
              onClick={() => handleSelectTab('customers')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                currentTab === 'customers'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Users className="w-4 h-4 text-indigo-600" />
                <span>Customers</span>
              </div>
              <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 font-semibold">
                {stats?.customerCount ?? 0}
              </span>
            </button>

            <button
              onClick={() => handleSelectTab('inventory')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                currentTab === 'inventory'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Package className="w-4 h-4 text-slate-500" />
                <span>Parts Inventory</span>
              </div>
              {stats && stats.lowStock > 0 ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold">
                  {stats.lowStock} Low
                </span>
              ) : null}
            </button>

            <button
              onClick={() => handleSelectTab('analytics')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                currentTab === 'analytics'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <BarChart3 className="w-4 h-4 text-slate-500" />
                <span>Analytics &amp; Reports</span>
              </div>
            </button>

            {onOpenTimeClock && (
              <button
                onClick={() => {
                  onClose();
                  onOpenTimeClock();
                }}
                className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] text-slate-700 hover:bg-slate-50"
              >
                <div className="flex items-center space-x-3">
                  <Clock className="w-4 h-4 text-emerald-600" />
                  <span>Time Clock &amp; Shifts</span>
                </div>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 font-bold">
                  Staff
                </span>
              </button>
            )}

            <button
              onClick={() => handleSelectTab('settings')}
              className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                currentTab === 'settings'
                  ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                  : 'text-slate-700 hover:bg-slate-50'
              }`}
            >
              <div className="flex items-center space-x-3">
                <Settings className="w-4 h-4 text-slate-500" />
                <span>Shop Settings</span>
              </div>
            </button>

            {isAdmin && (
              <button
                onClick={() => handleSelectTab('admin')}
                className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition cursor-pointer min-h-[44px] ${
                  currentTab === 'admin'
                    ? 'bg-purple-600 text-white shadow-xs'
                    : 'text-purple-700 hover:bg-purple-50'
                }`}
              >
                <div className="flex items-center space-x-3">
                  <ShieldAlert className="w-4 h-4" />
                  <span>Admin Console</span>
                </div>
                <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${
                  currentTab === 'admin' ? 'bg-purple-700 text-white' : 'bg-purple-100 text-purple-800'
                }`}>
                  Admin
                </span>
              </button>
            )}
          </nav>
        </div>

        {/* Drawer Bottom Actions */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 space-y-2">
          <button
            onClick={() => {
              onClose();
              onLogout();
            }}
            className="w-full py-2.5 px-3 bg-rose-50 hover:bg-rose-100 active:bg-rose-200 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer min-h-[44px]"
          >
            <LogOut className="w-4 h-4 text-rose-600" />
            <span>Sign Out of POS</span>
          </button>
        </div>
      </div>
    </div>
  );
};
