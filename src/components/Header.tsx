import React, { useRef } from 'react';
import { Search, Plus, Wrench, List, Kanban } from 'lucide-react';

interface HeaderProps {
  currentTab: string;
  viewMode: 'list' | 'kanban';
  setViewMode: (mode: 'list' | 'kanban') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openCreateModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  openCreateModal,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);

  return (
    <header className="h-16 bg-white border-b border-slate-200/80 px-6 sm:px-8 flex items-center justify-between z-30 sticky top-0 shadow-xs">
      {/* Brand & Breadcrumb & View Mode Switcher */}
      <div className="flex items-center space-x-4">
        <div className="flex items-center text-sm font-medium text-slate-500 space-x-2">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-indigo-500 flex items-center justify-center text-white shadow-xs">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900">ApexFix POS</span>
          <span className="text-slate-300">/</span>
          <span className="text-slate-900 font-semibold capitalize">
            {currentTab.replace('-', ' ')}
          </span>
        </div>

        {currentTab === 'repairs' && (
          <div className="hidden sm:flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200/60 text-xs">
            <button
              onClick={() => setViewMode('list')}
              className={`px-2.5 py-1 rounded-md font-medium transition flex items-center space-x-1.5 cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              <span>Data Grid</span>
            </button>
            <button
              onClick={() => setViewMode('kanban')}
              className={`px-2.5 py-1 rounded-md font-medium transition flex items-center space-x-1.5 cursor-pointer ${
                viewMode === 'kanban'
                  ? 'bg-white text-slate-900 shadow-xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Kanban className="w-3.5 h-3.5" />
              <span>Kanban Board</span>
            </button>
          </div>
        )}
      </div>

      {/* Action Area & Quick Search */}
      <div className="flex items-center space-x-3">
        <div className="relative w-72 sm:w-96 md:w-[440px] lg:w-[480px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search ticket, customer, phone, IMEI..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-8 py-2 text-xs bg-slate-50/90 border border-slate-300/90 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition shadow-xs"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer w-5 h-5 flex items-center justify-center rounded-full hover:bg-slate-200 transition"
              title="Clear search"
            >
              ×
            </button>
          )}
        </div>

        <button
          onClick={openCreateModal}
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-4 py-2 rounded-lg text-xs font-bold shadow-sm shadow-indigo-600/30 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden md:inline">Create Ticket</span>
        </button>
      </div>
    </header>
  );
};
