import React, { useRef, useState, useEffect } from 'react';
import { Search, Plus, Wrench, ArrowRight, LogOut, Menu, Clock, Square, Coffee, Zap, Bell, Check, Lock } from 'lucide-react';
import { Ticket, User } from '../types';
import { flushOfflineQueue } from '../utils/offlineSync';
import { fetchWithAuth } from '../utils/auth';

interface AppNotification {
  id: string;
  type: string;
  title: string;
  message: string;
  linkTab?: string | null;
  isRead: boolean;
  createdAt: string;
}

interface HeaderProps {
  currentTab: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  openCreateModal: () => void;
  tickets?: Ticket[];
  onSelectTicket?: (ticket: Ticket) => void;
  currentUser?: User | null;
  onLogout?: () => void;
  onLockTerminal?: () => void;
  onOpenMobileMenu?: () => void;
  onOpenTimeClock?: () => void;
  isClockedIn?: boolean;
  isOnBreak?: boolean;
  timeClockElapsed?: string;
  clockInTime?: string | Date | null;
  breakMinutes?: number;
  onQuickClockIn?: () => void;
  onQuickClockOut?: () => void;
  onQuickToggleBreak?: () => void;
  onNavigateNotification?: (linkTab: string) => void;
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
  onLockTerminal,
  onOpenMobileMenu,
  onOpenTimeClock,
  isClockedIn,
  isOnBreak,
  timeClockElapsed: _timeClockElapsed,
  clockInTime,
  breakMinutes = 0,
  onQuickClockIn,
  onQuickClockOut,
  onQuickToggleBreak,
  onNavigateNotification,
}) => {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const mobileSearchRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [liveElapsed, setLiveElapsed] = useState('');
  const [isOnline, setIsOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [queuedCount, setQueuedCount] = useState(0);

  const loadNotifications = async () => {
    if (!currentUser) return;
    try {
      const res = await fetchWithAuth('/api/notifications?limit=20');
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.notifications || json.data || []);
        setUnreadCount(json.unreadCount ?? 0);
      }
    } catch {}
  };

  useEffect(() => {
    if (!currentUser) return;
    loadNotifications();
    const poll = setInterval(loadNotifications, 20_000);
    return () => clearInterval(poll);
  }, [currentUser?.id]);

  useEffect(() => {
    const handleOutsideNotif = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideNotif);
    return () => document.removeEventListener('mousedown', handleOutsideNotif);
  }, []);

  const handleMarkNotificationRead = async (n: AppNotification) => {
    if (!n.isRead) {
      setNotifications((prev) => prev.map((item) => (item.id === n.id ? { ...item, isRead: true } : item)));
      setUnreadCount((c) => Math.max(0, c - 1));
      fetchWithAuth(`/api/notifications/${n.id}/read`, { method: 'POST' }).catch(() => {});
    }
    setIsNotifOpen(false);
    if (n.linkTab && onNavigateNotification) {
      onNavigateNotification(n.linkTab);
    }
  };

  const handleMarkAllRead = async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    await fetchWithAuth('/api/notifications/read-all', { method: 'POST' }).catch(() => {});
  };

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
      if (isOnBreak) {
        setLiveElapsed('Break');
        return;
      }
      const start = new Date(clockInTime).getTime();
      const diffSec = Math.max(0, Math.floor((Date.now() - start) / 1000) - (breakMinutes || 0) * 60);
      const hrs = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      setLiveElapsed(`${pad(hrs)}:${pad(mins)}:${pad(secs)}`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [isClockedIn, isOnBreak, clockInTime, breakMinutes]);

  // Focus mobile search input when expanded
  useEffect(() => {
    if (isMobileSearchOpen) {
      mobileSearchInputRef.current?.focus();
    }
  }, [isMobileSearchOpen]);

  // Global hotkey: '/' (when not typing in an input) or 'Cmd+K'/'Ctrl+K' to focus God Mode search
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isEditingText =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      const isSlash = e.key === '/' && !isEditingText && !e.metaKey && !e.ctrlKey && !e.altKey;
      const isCmdK = e.key.toLowerCase() === 'k' && (e.metaKey || e.ctrlKey);

      if (isSlash || isCmdK) {
        const isDesktopVisible = searchInputRef.current && searchInputRef.current.offsetParent !== null;
        if (isDesktopVisible && document.activeElement !== searchInputRef.current) {
          e.preventDefault();
          searchInputRef.current?.focus();
        } else if (!isDesktopVisible) {
          e.preventDefault();
          setIsMobileSearchOpen(true);
          setTimeout(() => mobileSearchInputRef.current?.focus(), 20);
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inDesktopSearch = dropdownRef.current?.contains(target);
      const inMobileSearch = mobileSearchRef.current?.contains(target);
      if (!inDesktopSearch && !inMobileSearch) {
        setIsDropdownOpen(false);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  const [serverSearchResults, setServerSearchResults] = useState<Ticket[] | null>(null);
  const query = searchQuery.trim().toLowerCase();
  const numericQuery = query.replace(/^(wo[\s\-_]*)?#?/i, '');
  const digits = searchQuery.replace(/\D/g, '');

  useEffect(() => {
    const trimmed = searchQuery.trim();
    if (!trimmed) {
      setServerSearchResults(null);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      fetchWithAuth(`/api/tickets?view=ALL&search=${encodeURIComponent(trimmed)}&page=1&pageSize=6`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => {
          if (!cancelled && Array.isArray(json?.data)) {
            setServerSearchResults(json.data);
          }
        })
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [searchQuery]);

  const localResults = query && tickets.length > 0
    ? tickets.filter((t) => {
        const matchName = t.customer.fullName.toLowerCase().includes(query);
        const matchPhone = digits.length >= 3 && t.customer.phone.replace(/\D/g, '').includes(digits);
        const matchDevice = t.device?.name?.toLowerCase().includes(query);
        const matchSerial = t.device?.serialNumber?.toLowerCase().includes(query);
        const matchTicketNum = /^\d+$/.test(numericQuery) && String(t.ticketNumber) === numericQuery;
        const matchIssue = t.faultDescription.toLowerCase().includes(query);
        return matchName || matchPhone || matchDevice || matchSerial || matchTicketNum || matchIssue;
      }).slice(0, 6)
    : [];

  const searchResults = query ? (serverSearchResults ?? localResults) : [];

  const handleSelectResult = (t: Ticket) => {
    setIsDropdownOpen(false);
    setIsMobileSearchOpen(false);
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
      setIsMobileSearchOpen(false);
      searchInputRef.current?.blur();
      mobileSearchInputRef.current?.blur();
    }
  };

  const renderSearchDropdown = () => {
    if (!isDropdownOpen || !query) return null;
    return (
      <div className="absolute left-0 right-0 mt-1.5 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden ui-pop">
        <div className="px-3.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-semibold gap-2">
          <span>Matches ({searchResults.length})</span>
          {searchResults.length > 0 && (
            <span className="text-[10px] text-indigo-600 font-bold hidden sm:inline">Press Enter to Jump ↵</span>
          )}
        </div>

        {searchResults.length === 0 ? (
          <div className="p-4 text-center text-xs text-slate-500 italic">
            No active work order found for &ldquo;{searchQuery}&rdquo;
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
                  className={`w-full text-left p-3 hover:bg-indigo-50/80 transition flex items-center justify-between gap-2 cursor-pointer group ${
                    idx === 0 ? 'bg-indigo-50/30' : ''
                  }`}
                >
                  <div className="space-y-0.5 min-w-0 flex-1 pr-1">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-mono font-bold text-xs text-indigo-600 shrink-0">
                        WO #{t.ticketNumber}
                      </span>
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {t.customer.fullName}
                      </span>
                      <span className="text-[11px] text-slate-500 font-mono hidden sm:inline">
                        ({t.customer.phone})
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 flex items-center gap-1.5 min-w-0">
                      <span className="font-semibold text-slate-800 shrink-0">{t.device?.name || 'Device'}</span>
                      <span className="text-slate-300 shrink-0">•</span>
                      <span className="truncate text-slate-500">{t.faultDescription}</span>
                    </div>
                  </div>

                  <div className="text-right shrink-0 flex items-center gap-2">
                    <div>
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
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
                    <ArrowRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition hidden sm:block" />
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  return (
    <header className="bg-white border-b border-slate-200/90 z-30 sticky top-0 shadow-xs w-full">
      <div className="h-14 sm:h-16 px-2.5 sm:px-5 md:px-6 flex items-center justify-between gap-1.5 sm:gap-2 min-w-0">
        {/* Brand & Breadcrumb & Mobile Menu */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0 flex-1 md:flex-initial">
          {onOpenMobileMenu && (
            <button
              type="button"
              onClick={onOpenMobileMenu}
              aria-label="Open navigation menu"
              title="Open navigation menu"
              className="md:hidden h-9 w-9 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl ui-press cursor-pointer shrink-0 flex items-center justify-center"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center text-sm font-medium text-slate-500 gap-1.5 sm:gap-2 min-w-0 group">
            <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-xs shrink-0 ui-icon-spring">
              <Wrench className="w-4 h-4" />
            </div>
            <span className="font-bold text-slate-900 hidden md:inline shrink-0">Faso Fix POS</span>
            <span className="text-slate-300 hidden md:inline shrink-0">/</span>
            <span className="text-slate-900 font-semibold capitalize truncate min-w-0">
              {currentTab.replace('-', ' ')}
            </span>
            {!isOnline && (
              <span className="px-1.5 sm:px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold border border-amber-300 animate-pulse flex items-center gap-1 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                <span className="hidden sm:inline">Offline</span>
                {queuedCount > 0 ? ` (${queuedCount})` : ''}
              </span>
            )}
          </div>
        </div>

        {/* God Mode Search & Header Actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0 md:flex-1 md:justify-end min-w-0">
          {/* Desktop & Tablet Inline Search */}
          <div className="hidden md:block relative flex-1 min-w-[140px] max-w-[200px] lg:max-w-[380px]" ref={dropdownRef}>
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              placeholder="Search (Press /)"
              value={searchQuery}
              onFocus={() => setIsDropdownOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onKeyDown={handleKeyDownInput}
              className="w-full pl-10 pr-10 py-2 text-xs bg-slate-50/90 border border-slate-300/90 rounded-full text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/15 focus:border-indigo-600 transition-[border-color,box-shadow,background-color] duration-200 shadow-xs"
            />

            <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 pointer-events-none">
              {searchQuery ? (
                <button
                  type="button"
                  aria-label="Clear search"
                  onClick={() => {
                    setSearchQuery('');
                    setIsDropdownOpen(false);
                  }}
                  className="pointer-events-auto text-slate-400 hover:text-slate-600 text-sm font-bold cursor-pointer w-4 h-4 flex items-center justify-center rounded-full hover:bg-slate-200 transition-colors"
                >
                  ×
                </button>
              ) : (
                <kbd className="hidden lg:inline-block px-1.5 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-200/60 rounded-md border border-slate-300/60">
                  /
                </kbd>
              )}
            </div>

            {renderSearchDropdown()}
          </div>

          {/* Mobile Search Toggle Button */}
          <button
            type="button"
            onClick={() => {
              const next = !isMobileSearchOpen;
              setIsMobileSearchOpen(next);
              if (next) setIsDropdownOpen(true);
            }}
            aria-label="Search work orders"
            title="Search work orders"
            className={`md:hidden h-9 w-9 inline-flex items-center justify-center rounded-xl border ui-press cursor-pointer shrink-0 ${
              isMobileSearchOpen || searchQuery
                ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
            }`}
          >
            <Search className="w-4 h-4" />
          </button>

          {/* New Ticket Button */}
          <button
            type="button"
            onClick={openCreateModal}
            aria-label="New Ticket"
            title="Create New Ticket (Hotkey: N)"
            className="h-9 inline-flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white px-3 lg:px-4 rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/30 ui-press ui-btn-glow group cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
            <span className="hidden lg:inline">New Ticket</span>
          </button>

          {/* Time Clock Status & Quick Punch Widget */}
          {currentUser && (
            <div className="flex items-center gap-1.5 shrink-0">
              {onOpenTimeClock && (
                <button
                  type="button"
                  onClick={onOpenTimeClock}
                  aria-label="Staff Time Clock"
                  title="Open Staff Time Clock, History & Paystubs"
                  className={`h-9 inline-flex items-center justify-center gap-1.5 px-2.5 sm:px-3 rounded-xl text-xs font-bold ui-press cursor-pointer shrink-0 border shadow-2xs ${
                    isOnBreak
                      ? 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-300'
                      : isClockedIn
                      ? 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-300'
                      : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border-slate-200'
                  }`}
                >
                  <Clock
                    className={`w-3.5 h-3.5 shrink-0 ${
                      isOnBreak ? 'text-amber-600' : isClockedIn ? 'text-emerald-600 animate-pulse' : 'text-slate-500'
                    }`}
                  />
                  <span className="hidden sm:inline whitespace-nowrap">
                    {isOnBreak
                      ? liveElapsed
                        ? `Break (${liveElapsed})`
                        : 'On Break'
                      : isClockedIn
                      ? liveElapsed
                        ? `🟢 ${liveElapsed}`
                        : 'Clocked In'
                      : 'Clocked Out'}
                  </span>
                </button>
              )}

              {/* Quick 1-click punch in when clocked out (lg+ screens) */}
              {!isClockedIn && onQuickClockIn && (
                <button
                  type="button"
                  onClick={onQuickClockIn}
                  aria-label="Punch In"
                  title="Instant 1-Click Clock In"
                  className="hidden lg:inline-flex h-9 items-center gap-1 px-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-xs font-bold shadow-xs ui-press ui-btn-glow cursor-pointer shrink-0"
                >
                  <Zap className="w-3.5 h-3.5 fill-current" />
                  <span className="hidden xl:inline">Punch In</span>
                </button>
              )}

              {/* Quick 1-click break & clock-out when clocked in (lg+ screens) */}
              {isClockedIn && (
                <div className="hidden lg:flex items-center gap-1">
                  {onQuickToggleBreak && (
                    <button
                      type="button"
                      onClick={onQuickToggleBreak}
                      aria-label={isOnBreak ? 'Resume Shift' : 'Take Break'}
                      title={isOnBreak ? 'Resume Shift (End Break)' : 'Take Unpaid Break'}
                      className={`h-9 w-9 inline-flex items-center justify-center rounded-xl text-xs font-bold ui-press cursor-pointer border shrink-0 ${
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
                      aria-label="Clock Out"
                      title="Instant 1-Click Clock Out"
                      className="h-9 w-9 inline-flex items-center justify-center bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 hover:text-red-800 border border-red-200 rounded-xl text-xs font-bold ui-press cursor-pointer shrink-0 shadow-2xs"
                    >
                      <Square className="w-3.5 h-3.5 fill-current" />
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Notification Bell & Light-Theme Popover */}
          {currentUser && (
            <div ref={notifRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => {
                  const next = !isNotifOpen;
                  setIsNotifOpen(next);
                  if (next) loadNotifications();
                }}
                aria-label="Notifications"
                title="Notifications"
                className="relative h-9 w-9 inline-flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 ui-press cursor-pointer"
              >
                <Bell className="w-4 h-4" />
                {unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[17px] h-[17px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-black flex items-center justify-center shadow-xs">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>

              {isNotifOpen && (
                <div className="fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-[62px] sm:top-full sm:mt-2 sm:w-96 bg-white rounded-3xl border border-slate-200 shadow-2xl overflow-hidden z-50 ui-pop">
                  <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Bell className="w-4 h-4 text-[#0284c7]" />
                      <span className="text-xs font-extrabold text-slate-900">Notifications</span>
                      {unreadCount > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-sky-100 text-[#0284c7] text-[10px] font-bold">
                          {unreadCount} new
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllRead}
                        className="text-[11px] font-bold text-[#0284c7] hover:underline inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3 h-3" />
                        <span>Mark all read</span>
                      </button>
                    )}
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center text-xs text-slate-400">
                        No notifications yet. Schedule updates, shift requests, and paystubs will appear here.
                      </div>
                    ) : (
                      notifications.map((n) => (
                        <button
                          key={n.id}
                          type="button"
                          onClick={() => handleMarkNotificationRead(n)}
                          className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition flex items-start gap-2.5 cursor-pointer ${
                            !n.isRead ? 'bg-sky-50/50' : 'bg-white'
                          }`}
                        >
                          <span
                            className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${
                              !n.isRead ? 'bg-[#0284c7]' : 'bg-slate-200'
                            }`}
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center justify-between gap-2">
                              <span className={`text-xs truncate ${!n.isRead ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                                {n.title}
                              </span>
                              <span className="text-[10px] text-slate-400 shrink-0">
                                {new Date(n.createdAt).toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })}
                              </span>
                            </div>
                            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">{n.message}</p>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Profile & Direct Logout Button */}
          {currentUser && onLogout && (
            <div className="flex items-center gap-1.5 sm:gap-2 pl-1.5 sm:pl-2 border-l border-slate-200 shrink-0">
              <div className="hidden xl:flex items-center space-x-2 px-2.5 py-1 bg-slate-100 rounded-xl border border-slate-200/80">
                <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] font-bold">
                  {currentUser.name.charAt(0)}
                </div>
                <span className="text-xs font-semibold text-slate-800 max-w-[100px] truncate">
                  {currentUser.name}
                </span>
              </div>
              {onLockTerminal && (
                <button
                  type="button"
                  onClick={onLockTerminal}
                  aria-label="Lock Terminal"
                  title="Quick-lock counter screen"
                  className="h-9 inline-flex items-center justify-center gap-1.5 px-2.5 bg-slate-100 hover:bg-slate-200 active:bg-slate-300 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold ui-press cursor-pointer shrink-0 shadow-2xs"
                >
                  <Lock className="w-3.5 h-3.5 text-slate-600" />
                  <span className="hidden xl:inline">Lock</span>
                </button>
              )}
              <button
                type="button"
                onClick={onLogout}
                aria-label="Log Out"
                title={`Sign out of ${currentUser.name}`}
                className="h-9 inline-flex items-center justify-center gap-1.5 px-2.5 lg:px-3 bg-red-50 hover:bg-red-100 active:bg-red-200 text-red-700 hover:text-red-800 border border-red-200 rounded-xl text-xs font-bold ui-press cursor-pointer shrink-0 shadow-2xs group"
              >
                <LogOut className="w-3.5 h-3.5 text-red-600 group-hover:scale-110 transition-transform" />
                <span className="hidden lg:inline">Log Out</span>
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expandable Full-Width Mobile Search Bar Row */}
      {(isMobileSearchOpen || Boolean(searchQuery)) && (
        <div ref={mobileSearchRef} className="md:hidden border-t border-slate-100 bg-slate-50/90 px-3 py-2 relative">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={mobileSearchInputRef}
              type="text"
              placeholder="Search WO #, client, phone, device..."
              value={searchQuery}
              onFocus={() => setIsDropdownOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onKeyDown={handleKeyDownInput}
              className="w-full pl-10 pr-10 py-2 text-base sm:text-xs bg-white border border-slate-300 rounded-full text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 shadow-xs"
            />
            <button
              type="button"
              aria-label={searchQuery ? 'Clear search' : 'Close search'}
              onClick={() => {
                setSearchQuery('');
                setIsDropdownOpen(false);
                setIsMobileSearchOpen(false);
              }}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-base font-bold cursor-pointer w-6 h-6 flex items-center justify-center rounded-full hover:bg-slate-200 transition"
            >
              ×
            </button>

            {renderSearchDropdown()}
          </div>
        </div>
      )}
    </header>
  );
};
