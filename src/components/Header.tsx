import React, { useRef, useState, useEffect } from 'react';
import { Search, Plus, Wrench, ArrowRight, LogOut, Menu, Clock, Play, Square, Coffee, Zap, WifiOff } from 'lucide-react';
import { Ticket, User } from '../types';
import { flushOfflineQueue } from '../utils/offlineSync';

interface HeaderProps {
  currentTab: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openCreateModal: () => void;
  tickets?: Ticket[];
  onSelectTicket?: (ticket: Ticket) => void;
  currentUser?: User | null;
  onLogout?: () => void;
  onOpenMobileMenu?: () => void;
  onOpenTimeClock?: () => void;
  isClockedIn?: boolean;
  isOnBreak?: boolean;
  timeClockElapsed?: string;
  clockInTime?: string | Date | null;
  onQuickClockIn?: () => void;
  onQuickClockOut?: () => void;
  onQuickToggleBreak?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  searchQuery,
  setSearchQuery,
  openCreateModal,
  tickets = [],
  onSelectTicket,
  currentUser,
  onLogout,
  onOpenMobileMenu,
  onOpenTimeClock,
  isClockedIn,
  isOnBreak,
  timeClockElapsed,
  clockInTime,
  onQuickClockIn,
  onQuickClockOut,
  onQuickToggleBreak,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [liveElapsed, setLiveElapsed] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queuedCount, setQueuedCount] = useState(0);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      flushOfflineQueue();
    };
    const handleOffline = () => setIsOnline(false);
    const handleQueue = (e: any) => setQueuedCount(e.detail?.count || 0);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    window.addEventListener('offline-queue-updated', handleQueue);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('offline-queue-updated', handleQueue);
    };
  }, []);

  // Real-time ticking second counter for active shift
  useEffect(() => {
    if (!isClockedIn || !clockInTime) {
      setLiveElapsed('');
      return;
    }

    const updateTimer = () => {
      const start = new Date(clockInTime).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000));
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      if (hrs > 0) {
        setLiveElapsed(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
      } else {
        setLiveElapsed(`${pad(mins)}:${pad(secs)}`);
      }
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, clockInTime]);

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
    <header className="h-16 bg-white border-b border-slate-200/90 px-3 sm:px-6 md:px-8 flex items-center justify-between z-30 sticky top-0 shadow-xs gap-2">
      {/* Brand & Breadcrumb & View Mode Switcher */}
      <div className="flex items-center space-x-2 sm:space-x-4 min-w-0 shrink-0">
        {onOpenMobileMenu && (
          <button
            type="button"
            onClick={onOpenMobileMenu}
            className="md:hidden p-2 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition cursor-pointer min-h-[44px] min-w-[44px] flex items-center justify-center"
            title="Open navigation menu"
          >
            <Menu className="w-5 h-5" />
          </button>
        )}

        <div className="flex items-center text-sm font-medium text-slate-500 space-x-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0">
            <Wrench className="w-4 h-4" />
          </div>
          <span className="font-bold text-slate-900 hidden sm:inline">Faso Fix POS</span>
          <span className="text-slate-300 hidden sm:inline">/</span>
          <span className="text-slate-900 font-semibold capitalize truncate max-w-[100px] sm:max-w-none">
            {currentTab.replace('-', ' ')}
          </span>
          {!isOnline && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300 animate-pulse flex items-center gap-1 shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
              Offline {queuedCount > 0 ? `(${queuedCount})` : ''}
            </span>
          )}
        </div>
      </div>

      {/* God Mode Search Area */}
      <div className="flex items-center space-x-2 sm:space-x-3 flex-1 justify-end min-w-0" ref={dropdownRef}>
        <div className="relative flex-1 max-w-[180px] sm:max-w-[280px] md:max-w-[420px]">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder='Search (Press /)'
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
                    const total = t.totals ? t.totals.totalCents / 100 : t.laborCents / 100;
                    const paid = t.totals ? t.totals.paidCents / 100 : 0;
                    const balance = t.totals ? t.totals.balanceCents / 100 : total;
                    const isPaid = total > 0 && paid >= total;
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
                              {isPaid ? (
                                <span className="text-emerald-600">Paid</span>
                              ) : total === 0 && paid === 0 ? (
                                <span className="text-slate-400 font-normal">$0.00</span>
                              ) : paid > 0 && total === 0 ? (
                                <span className="text-indigo-600 font-bold">Dep: ${paid.toFixed(2)}</span>
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

        {/* Time Clock Status & Quick Punch Widget */}
        {currentUser && (
          <div className="flex items-center space-x-1.5 shrink-0">
            {onOpenTimeClock && (
              <button
                type="button"
                onClick={onOpenTimeClock}
                title="Open Staff Time Clock, History & Paystubs"
                className={`inline-flex items-center space-x-1.5 px-2.5 sm:px-3 py-2 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 border shadow-2xs ${
                  isOnBreak
                    ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                    : isClockedIn
                    ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                }`}
              >
                <Clock className={`w-3.5 h-3.5 ${isOnBreak ? 'text-amber-600' : isClockedIn ? 'text-emerald-600 animate-pulse' : 'text-slate-500'}`} />
                <span>
                  {isOnBreak
                    ? (liveElapsed ? `Break (${liveElapsed})` : 'On Break')
                    : isClockedIn
                    ? (liveElapsed ? `🟢 ${liveElapsed}` : 'Clocked In')
                    : 'Clocked Out'}
                </span>
              </button>
            )}

            {/* Quick 1-click punch in when clocked out */}
            {!isClockedIn && onQuickClockIn && (
              <button
                type="button"
                onClick={onQuickClockIn}
                title="Instant 1-Click Clock In"
                className="inline-flex items-center space-x-1 px-2.5 py-2 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer shrink-0"
              >
                <Zap className="w-3.5 h-3.5 fill-current" />
                <span className="hidden sm:inline">Punch In</span>
              </button>
            )}

            {/* Quick 1-click break & clock-out when clocked in */}
            {isClockedIn && (
              <div className="flex items-center space-x-1">
                {onQuickToggleBreak && (
                  <button
                    type="button"
                    onClick={onQuickToggleBreak}
                    title={isOnBreak ? 'Resume Shift (End Break)' : 'Take Unpaid Break'}
                    className={`p-2 rounded-lg text-xs font-bold transition cursor-pointer border shrink-0 ${
                      isOnBreak
                        ? 'bg-amber-500 text-white border-amber-600 hover:bg-amber-600'
                        : 'bg-amber-50 hover:bg-amber-100 text-amber-700 border-amber-200'
                    }`}
                  >
                    <Coffee className="w-3.5 h-3.5" />
                  </button>
                )}
                {onQuickClockOut && (
                  <button
                    type="button"
                    onClick={onQuickClockOut}
                    title="Instant 1-Click Clock Out"
                    className="p-2 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 hover:text-red-800 border border-red-200 rounded-lg text-xs font-bold transition cursor-pointer shrink-0 shadow-2xs"
                  >
                    <Square className="w-3.5 h-3.5 fill-current" />
                  </button>
                )}
              </div>
            )}
          </div>
        )}

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
