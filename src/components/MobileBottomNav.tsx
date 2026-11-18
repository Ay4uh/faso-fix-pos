import React from 'react';
import {
  LayoutDashboard,
  Users,
  Plus,
  Package,
  Menu,
} from 'lucide-react';
import { DashboardStats } from '../types';

interface MobileBottomNavProps {
  currentTab: string;
  setCurrentTab: (tab: any) => void;
  openCreateModal: () => void;
  openMobileMenu: () => void;
  stats: DashboardStats | null;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  currentTab,
  setCurrentTab,
  openCreateModal,
  openMobileMenu,
  stats,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200/90 shadow-[0_-2px_10px_rgba(0,0,0,0.04)] px-2 py-1 safe-area-pb">
      <div className="flex items-center justify-around h-14">
        {/* Work Orders */}
        <button
          type="button"
          onClick={() => setCurrentTab('repairs')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[50px] transition cursor-pointer ${
            currentTab === 'repairs' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <div className="relative">
            <LayoutDashboard className="w-5 h-5" />
            {(stats?.totalActive ?? 0) > 0 && (
              <span className="absolute -top-1 -right-2 px-1 py-0.2 bg-indigo-600 text-white text-[9px] font-bold rounded-full">
                {stats?.totalActive}
              </span>
            )}
          </div>
          <span className="text-[10px] mt-0.5">Tickets</span>
        </button>

        {/* Customers */}
        <button
          type="button"
          onClick={() => setCurrentTab('customers')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[50px] transition cursor-pointer ${
            currentTab === 'customers' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Users className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Clients</span>
        </button>

        {/* Elevated Quick Create Center Button */}
        <button
          type="button"
          onClick={openCreateModal}
          className="flex flex-col items-center justify-center px-3 -mt-4 transition cursor-pointer group"
          title="New Ticket"
        >
          <div className="w-12 h-12 rounded-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white flex items-center justify-center shadow-lg shadow-indigo-600/30 ring-4 ring-white transition-transform group-active:scale-95">
            <Plus className="w-6 h-6 stroke-[2.5]" />
          </div>
          <span className="text-[10px] font-bold text-indigo-700 mt-1">New</span>
        </button>

        {/* Inventory */}
        <button
          type="button"
          onClick={() => setCurrentTab('inventory')}
          className={`flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[50px] transition cursor-pointer ${
            currentTab === 'inventory' ? 'text-indigo-600 font-bold' : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <Package className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">Parts</span>
        </button>

        {/* More Menu (Opens Drawer) */}
        <button
          type="button"
          onClick={openMobileMenu}
          className="flex flex-col items-center justify-center flex-1 h-full py-1 min-w-[50px] text-slate-500 hover:text-slate-800 transition cursor-pointer"
        >
          <Menu className="w-5 h-5" />
          <span className="text-[10px] mt-0.5">More</span>
        </button>
      </div>
    </nav>
  );
};
