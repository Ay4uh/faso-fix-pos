import React, { useRef, useState, useEffect } from 'react';
import { Search, Plus, Wrench, List, Kanban, ArrowRight, LogOut } from 'lucide-react';
import { Ticket, User } from '../types';

interface HeaderProps {
  currentTab: string;
  viewMode: 'list' | 'kanban';
  setViewMode: (mode: 'list' | 'kanban') => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openCreateModal: () => void;
  tickets?: Ticket[];
  onSelectTicket?: (ticket: Ticket) => void;
  currentUser?: User | null;
  onLogout?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  viewMode,
  setViewMode,
  searchQuery,
  setSearchQuery,
  openCreateModal,
  tickets = [],
  onSelectTicket,
  currentUser,
  onLogout,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  // Global hotkey: '/' or 'Cmd+K' to focus God Mode search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === '/' || (e.key === 'k' && (e.metaKey || e.ctrlKey))) && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const query = searchQuery.trim().toLowerCase();
  const digits = searchQuery.replace(/\D/g, '');

  const searchResults = query && tickets.length > 0
    ? tickets.filter((t) => {
        const matchName = t.customer.fullName.toLowerCase().includes(query);
        const matchPhone = digits.length >= 3 && t.customer.phone.replace(/\D/g, '').includes(digits);
        const matchDevice = t.device?.name?.toLowerCase().includes(query);
        const matchSerial = t.device?.serialNumber?.toLowerCase().includes(query);
        const matchTicketNum = String(t.ticketNumber) === query.replace('#', '');
        const matchIssue = t.faultDescription.toLowerCase().includes(query);
        return matchName || matchPhone || matchDevice || matchSerial || matchTicketNum || matchIssue;
      }).slice(0, 6)
    : [];

  const handleSelectResult = (t: Ticket) => {
    setIsDropdownOpen(false);
    setSearchQuery('');
    if (onSelectTicket) onSelectTicket(t);
  };

  const handleKeyDownInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && searchResults.length > 0) {
      e.preventDefault();
      handleSelectResult(searchResults[0]);
    }
    if (e.key === 'Escape') {
      setIsDropdownOpen(false);
      searchInputRef.current?.blur();
    }
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200/90 px-4 sm:px-6 md:px-8 flex items-center justify-between z-30 sticky top-0 shadow-xs">
      {/* Brand & Breadcrumb & View Mode Switcher */}
      <div className="flex items-center space-x-3 sm:space-x-4">
        <div className="flex items-center text-sm font-medium text-slate-500 space-x-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900 hidden sm:inline">ApexFix POS</span>
          <span className="text-slate-300 hidden sm:inline">/</span>
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
              <span>Kanban</span>
            </button>
          </div>
        )}
      </div>

      {/* God Mode Search Area */}
      <div className="flex items-center space-x-3" ref={dropdownRef}>
        <div className="relative w-64 sm:w-80 md:w-[420px] lg:w-[480px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder='God Mode: Search "John", "iPad", phone #, ticket... (Press /)'
            value={searchQuery}
            onFocus={() => setIsDropdownOpen(true)}
            onChange={(e) => {
              setSearchQuery(e.target.value);
              setIsDropdownOpen(true);
            }}
            onKeyDown={handleKeyDownInput}
            className="w-full pl-9 pr-14 py-2 text-xs bg-slate-50/90 border border-slate-300/90 rounded-lg text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition shadow-xs"
          />

          <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
            {searchQuery ? (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsDropdownOpen(false);
                }}
                className="pointer-events-auto text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-200 transition"
              >
                ×
              </button>
            ) : (
              <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-200/60 rounded border border-slate-300/60">
                /
              </kbd>
            )}
          </div>

          {/* God Mode Live Search Results Dropdown */}
          {isDropdownOpen && query && (
            <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-xl shadow-2xl z-50 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
              <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold">
                <span>Direct Search Matches ({searchResults.length})</span>
                {searchResults.length > 0 && (
                  <span className="text-[10px] text-indigo-600 font-bold">Press Enter to Jump to Top Match ↵</span>
                )}
              </div>

              {searchResults.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500 italic">
                  No active work order found for "{searchQuery}"
                </div>
              ) : (
                <div className="divide-y divide-slate-100 max-h-80 overflow-y-auto">
                  {searchResults.map((t, idx) => {
                    const balance = t.totals ? t.totals.balanceCents / 100 : t.laborCents / 100;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => handleSelectResult(t)}
                        className={`w-full text-left p-3 hover:bg-indigo-50/80 transition flex items-center justify-between cursor-pointer group ${
                          idx === 0 ? 'bg-indigo-50/30' : ''
                        }`}
                      >
                        <div className="space-y-0.5 truncate pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-mono font-bold text-xs text-indigo-600">
                              WO #{t.ticketNumber}
                            </span>
                            <span className="font-bold text-xs text-slate-900 truncate">
                              {t.customer.fullName}
                            </span>
                            <span className="text-[11px] text-slate-500 font-mono">
                              ({t.customer.phone})
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-600 flex items-center gap-2">
                            <span className="font-semibold text-slate-800">{t.device?.name || 'Device'}</span>
                            <span className="text-slate-300">•</span>
                            <span className="truncate max-w-[220px] text-slate-500">{t.faultDescription}</span>
                          </div>
                        </div>

                        <div className="text-right shrink-0 flex items-center gap-3">
                          <div>
                            <span className="text-[10px] px-2 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                              {t.status.replace(/_/g, ' ')}
                            </span>
                            <div className="font-mono text-xs font-bold text-slate-900 mt-0.5">
                              {balance === 0 ? (
                                <span className="text-emerald-600">Paid</span>
                              ) : (
                                <span>${balance.toFixed(2)}</span>
                              )}
                            </div>
                          </div>
                          <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition" />
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        <button
          onClick={openCreateModal}
          title="Create New Ticket (Hotkey: N)"
          className="inline-flex items-center space-x-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3.5 sm:px-4 py-2 rounded-lg text-xs font-bold shadow-sm shadow-indigo-600/30 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span className="hidden md:inline">New Ticket</span>
        </button>

        {/* User Profile & Direct Logout Button */}
        {currentUser && onLogout && (
          <div className="flex items-center space-x-2 pl-2 border-l border-slate-200">
            <div className="hidden xl:flex items-center space-x-2 px-2.5 py-1 bg-slate-100 rounded-lg border border-slate-200/80">
              <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                {currentUser.name.charAt(0)}
              </div>
              <span className="text-xs font-semibold text-slate-800 max-w-[100px] truncate">
                {currentUser.name}
              </span>
            </div>
            <button
              type="button"
              onClick={onLogout}
              title={`Sign out of ${currentUser.name}`}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 hover:text-red-800 border border-red-200 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs group"
            >
              <LogOut className="w-3.5 h-3.5 text-red-600 group-hover:scale-110 transition-transform" />
              <span>Log Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
