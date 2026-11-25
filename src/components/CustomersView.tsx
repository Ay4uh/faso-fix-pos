import React, { useState, useEffect, useMemo } from 'react';
import { Customer, Ticket, TicketStatus } from '../types';
import { fetchWithAuth } from '../utils/auth';
import { deriveTicketQuoteState, isTicketPaidInFull } from '../utils/repairPricing';
import {
  Search,
  Phone,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Printer,
  Pencil,
  Plus,
  ExternalLink,
  CheckCircle2,
  X,
  RotateCcw,
} from 'lucide-react';
import type { PaginationMeta } from './TicketTable';

interface CustomersViewProps {
  customers: Customer[];
  tickets: Ticket[];
  onOpenCreateWithCustomer?: (customer: Customer) => void;
  onSelectTicket?: (ticket: Ticket) => void;
  onPrintTicket?: (ticket: Ticket) => void;
  onOpenSmsModal?: (ticket: Ticket) => void;
  pagination?: PaginationMeta | null;
  onPageChange?: (page: number) => void;
  searchQuery?: string;
  onSearchChange?: (query: string) => void;
  refreshKey?: number;
  onCustomerUpdated?: () => void;
}

type StatusFilterKey = 'ALL' | 'PAID_DONE' | 'UNPAID' | 'IN_SHOP' | 'CANCELLED';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

const WORK_STATUS_META: Record<string, { label: string; className: string }> = {
  CHECKED_IN: { label: 'Checked In', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  PENDING: { label: 'Checked In', className: 'bg-slate-100 text-slate-700 border-slate-200' },
  DIAGNOSING: { label: 'Diagnosing', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  IN_PROGRESS: { label: 'Diagnosing', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  WAITING_ON_APPROVAL: { label: 'Diagnosing', className: 'bg-blue-50 text-blue-700 border-blue-200' },
  WAITING_ON_PARTS: { label: 'Waiting on Part', className: 'bg-amber-50 text-amber-800 border-amber-200' },
  READY_FOR_PICKUP: { label: 'Ready for Pickup', className: 'bg-teal-50 text-teal-800 border-teal-200' },
  COMPLETED: { label: 'Completed', className: 'bg-emerald-50 text-emerald-800 border-emerald-200' },
  DECLINED: { label: 'Declined', className: 'bg-rose-50 text-rose-700 border-rose-200' },
  CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 border-slate-200 line-through' },
};

function toLocalDateKey(value: string | Date): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatDayHeading(dayKey: string): string {
  const [yStr, mStr, dStr] = dayKey.split('-');
  const y = Number(yStr);
  const m = Number(mStr);
  const d = Number(dStr);
  if (!y || !m || !d) return dayKey;
  return new Date(y, m - 1, d, 12, 0, 0).toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function classifyTicket(t: Ticket) {
  const subtotalCents = t.totals ? t.totals.subtotalCents : t.laborCents;
  const totalCents = t.totals ? t.totals.totalCents : t.laborCents;
  const paidCents = t.totals ? t.totals.paidCents : 0;
  const balanceCents = t.totals ? t.totals.balanceCents : totalCents;
  const quoteState =
    t.quoteState ?? deriveTicketQuoteState(t, { subtotalCents, totalCents, paidCents, balanceCents });

  const isPaid = t.totals ? isTicketPaidInFull(t.totals, quoteState) : false;
  const isClosedOut = t.status === 'CANCELLED' || t.status === 'DECLINED';
  const isPaidDone = isPaid || t.status === 'COMPLETED';
  const isUnpaid = balanceCents > 0 && !isClosedOut;
  const isInShop = !isClosedOut && t.status !== 'COMPLETED';

  return {
    totalCents,
    paidCents,
    balanceCents,
    hasPrice: quoteState.hasPrice,
    isPaid,
    isClosedOut,
    isPaidDone,
    isUnpaid,
    isInShop,
  };
}

function getWorkStatusMeta(status: TicketStatus) {
  return WORK_STATUS_META[status] || { label: status.replace(/_/g, ' '), className: 'bg-slate-100 text-slate-700 border-slate-200' };
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers: _customers,
  tickets: _tickets,
  onOpenCreateWithCustomer,
  onSelectTicket,
  onPrintTicket,
  onOpenSmsModal: _onOpenSmsModal,
  pagination: _pagination,
  onPageChange: _onPageChange,
  searchQuery,
  onSearchChange,
  refreshKey = 0,
  onCustomerUpdated,
}) => {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [scopeMode, setScopeMode] = useState<'month' | 'all'>('month');
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilterKey>('ALL');

  const [localSearch, setLocalSearch] = useState('');
  const search = searchQuery !== undefined ? searchQuery : localSearch;
  const setSearch = (val: string) => {
    if (onSearchChange) onSearchChange(val);
    else setLocalSearch(val);
  };
  const [debouncedSearch, setDebouncedSearch] = useState(search.trim());

  const [historyTickets, setHistoryTickets] = useState<Ticket[]>([]);
  const [totalServerCount, setTotalServerCount] = useState(0);
  const [isLoadingHistory, setIsLoadingHistory] = useState(true);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // Edit Customer Modal state
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [editName, setEditName] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAltPhone, setEditAltPhone] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [isSavingCustomer, setIsSavingCustomer] = useState(false);
  const [editCustomerError, setEditCustomerError] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 200);
    return () => clearTimeout(t);
  }, [search]);

  useEffect(() => {
    let cancelled = false;
    setIsLoadingHistory(true);
    setHistoryError(null);

    const params = new URLSearchParams();
    params.set('view', 'ALL');
    params.set('sort', 'createdAt');
    params.set('pageSize', '500');

    if (debouncedSearch) {
      params.set('search', debouncedSearch);
    } else if (scopeMode === 'month') {
      const from = new Date(viewYear, viewMonth, 1, 0, 0, 0, 0).toISOString();
      const to = new Date(viewYear, viewMonth + 1, 0, 23, 59, 59, 999).toISOString();
      params.set('from', from);
      params.set('to', to);
    }

    fetchWithAuth(`/api/tickets?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const errJson = await res.json().catch(() => ({}));
          throw new Error(errJson?.error || 'Failed to load customer history');
        }
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        setHistoryTickets(Array.isArray(json.data) ? json.data : []);
        setTotalServerCount(typeof json.total === 'number' ? json.total : (json.data?.length ?? 0));
      })
      .catch((err: any) => {
        if (!cancelled) {
          setHistoryError(err?.message || 'Could not load customer history');
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoadingHistory(false);
      });

    return () => {
      cancelled = true;
    };
  }, [viewYear, viewMonth, scopeMode, debouncedSearch, refreshKey]);

  const todayKey = toLocalDateKey(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterdayKey = toLocalDateKey(yesterdayDate);

  const monthLabel = useMemo(
    () =>
      new Date(viewYear, viewMonth, 1, 12, 0, 0).toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
    [viewYear, viewMonth]
  );

  // Per-day markers over the loaded scope (for interactive calendar indicators)
  const dayMarkers = useMemo(() => {
    const map = new Map<
      string,
      { count: number; hasPaidDone: boolean; hasUnpaid: boolean; hasInShop: boolean }
    >();
    for (const t of historyTickets) {
      const key = toLocalDateKey(t.createdAt);
      if (!key) continue;
      const meta = classifyTicket(t);
      const entry = map.get(key) || {
        count: 0,
        hasPaidDone: false,
        hasUnpaid: false,
        hasInShop: false,
      };
      entry.count += 1;
      if (meta.isPaidDone) entry.hasPaidDone = true;
      if (meta.isUnpaid) entry.hasUnpaid = true;
      if (meta.isInShop) entry.hasInShop = true;
      map.set(key, entry);
    }
    return map;
  }, [historyTickets]);

  // Tickets restricted by selected day (before applying status pill so pill counts reflect the active day/scope)
  const dayScopedTickets = useMemo(() => {
    if (!selectedDayKey) return historyTickets;
    return historyTickets.filter((t) => toLocalDateKey(t.createdAt) === selectedDayKey);
  }, [historyTickets, selectedDayKey]);

  const statusCounts = useMemo(() => {
    let paidDone = 0;
    let unpaid = 0;
    let inShop = 0;
    let cancelled = 0;
    for (const t of dayScopedTickets) {
      const m = classifyTicket(t);
      if (m.isPaidDone) paidDone += 1;
      if (m.isUnpaid) unpaid += 1;
      if (m.isInShop) inShop += 1;
      if (m.isClosedOut) cancelled += 1;
    }
    return {
      ALL: dayScopedTickets.length,
      PAID_DONE: paidDone,
      UNPAID: unpaid,
      IN_SHOP: inShop,
      CANCELLED: cancelled,
    };
  }, [dayScopedTickets]);

  const visibleTickets = useMemo(() => {
    if (statusFilter === 'ALL') return dayScopedTickets;
    return dayScopedTickets.filter((t) => {
      const m = classifyTicket(t);
      switch (statusFilter) {
        case 'PAID_DONE':
          return m.isPaidDone;
        case 'UNPAID':
          return m.isUnpaid;
        case 'IN_SHOP':
          return m.isInShop;
        case 'CANCELLED':
          return m.isClosedOut;
        default:
          return true;
      }
    });
  }, [dayScopedTickets, statusFilter]);

  const groupedDays = useMemo(() => {
    const groups = new Map<string, Ticket[]>();
    for (const t of visibleTickets) {
      const key = toLocalDateKey(t.createdAt) || 'Unknown';
      const list = groups.get(key) || [];
      list.push(t);
      groups.set(key, list);
    }

    const sortedKeys = Array.from(groups.keys()).sort((a, b) => b.localeCompare(a));
    return sortedKeys.map((dayKey) => {
      const items = [...(groups.get(dayKey) || [])].sort((a, b) => {
        const diff = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return diff !== 0 ? diff : b.ticketNumber - a.ticketNumber;
      });
      let collectedCents = 0;
      let owingCents = 0;
      for (const t of items) {
        const m = classifyTicket(t);
        collectedCents += m.paidCents;
        if (!m.isClosedOut && m.balanceCents > 0) {
          owingCents += m.balanceCents;
        }
      }
      return {
        dayKey,
        label: dayKey === 'Unknown' ? 'Unknown Date' : formatDayHeading(dayKey),
        isToday: dayKey === todayKey,
        isYesterday: dayKey === yesterdayKey,
        items,
        collectedCents,
        owingCents,
      };
    });
  }, [visibleTickets, todayKey, yesterdayKey]);

  const summaryStats = useMemo(() => {
    let paidDone = 0;
    let collectedCents = 0;
    let owingCents = 0;
    for (const t of visibleTickets) {
      const m = classifyTicket(t);
      if (m.isPaidDone) paidDone += 1;
      collectedCents += m.paidCents;
      if (!m.isClosedOut && m.balanceCents > 0) {
        owingCents += m.balanceCents;
      }
    }
    return {
      visits: visibleTickets.length,
      paidDone,
      collectedCents,
      owingCents,
    };
  }, [visibleTickets]);

  // Build 7-column calendar cells for viewYear / viewMonth
  const calendarCells = useMemo(() => {
    const firstDayWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const cells: Array<{ day: number | null; dayKey: string | null }> = [];
    for (let i = 0; i < firstDayWeekday; i++) {
      cells.push({ day: null, dayKey: null });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const mStr = String(viewMonth + 1).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      cells.push({ day, dayKey: `${viewYear}-${mStr}-${dStr}` });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, dayKey: null });
    }
    return cells;
  }, [viewYear, viewMonth]);

  const handleStepMonth = (delta: number) => {
    const d = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setScopeMode('month');
    setSelectedDayKey(null);
  };

  const handleJumpToday = () => {
    const d = new Date();
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
    setScopeMode('month');
    setSelectedDayKey(toLocalDateKey(d));
  };

  const openEditCustomerModal = (c: Customer, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditCustomerError(null);
    setEditingCustomer(c);
    setEditName(c.fullName || '');
    setEditPhone(c.phone || '');
    setEditAltPhone(c.altPhone || '');
    setEditEmail(c.email || '');
    setEditAddress(c.address || '');
  };

  const handleSaveCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCustomer) return;
    setEditCustomerError(null);

    const name = editName.trim();
    const phone = editPhone.trim();
    if (!name) {
      setEditCustomerError('Customer name is required');
      return;
    }
    if (phone.replace(/\D/g, '').length < 7) {
      setEditCustomerError('Phone number needs at least 7 digits');
      return;
    }

    setIsSavingCustomer(true);
    try {
      const res = await fetchWithAuth(`/api/customers/${editingCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fullName: name,
          phone,
          altPhone: editAltPhone.trim() || null,
          email: editEmail.trim() || null,
          address: editAddress.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json?.error || 'Failed to update customer details');
      }
      const updatedCustomer: Customer | undefined = json?.data;
      if (updatedCustomer) {
        setHistoryTickets((prev) =>
          prev.map((t) => (t.customerId === updatedCustomer.id ? { ...t, customer: updatedCustomer } : t))
        );
      }
      setEditingCustomer(null);
      if (onCustomerUpdated) onCustomerUpdated();
    } catch (err: any) {
      setEditCustomerError(err?.message || 'Error updating customer');
    } finally {
      setIsSavingCustomer(false);
    }
  };

  const statusPills: Array<{ key: StatusFilterKey; label: string; count: number; activeCls: string }> = [
    {
      key: 'ALL',
      label: 'All',
      count: statusCounts.ALL,
      activeCls: 'bg-slate-900 text-white border-slate-900',
    },
    {
      key: 'PAID_DONE',
      label: 'Paid / Done',
      count: statusCounts.PAID_DONE,
      activeCls: 'bg-emerald-600 text-white border-emerald-600',
    },
    {
      key: 'UNPAID',
      label: 'Unpaid',
      count: statusCounts.UNPAID,
      activeCls: 'bg-amber-600 text-white border-amber-600',
    },
    {
      key: 'IN_SHOP',
      label: 'In Shop',
      count: statusCounts.IN_SHOP,
      activeCls: 'bg-indigo-600 text-white border-indigo-600',
    },
    {
      key: 'CANCELLED',
      label: 'Cancelled',
      count: statusCounts.CANCELLED,
      activeCls: 'bg-slate-600 text-white border-slate-600',
    },
  ];

  const summaryTitle = selectedDayKey
    ? formatDayHeading(selectedDayKey)
    : debouncedSearch
    ? 'Search Results Summary'
    : scopeMode === 'all'
    ? 'All-Time Summary'
    : `${monthLabel} Summary`;

  return (
    <div className="space-y-4">
      {/* ========================================================
          TOP HEADER, SEARCH & STATUS FILTER BAR
         ======================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 sm:p-5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="group">
            <div className="flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-indigo-600 shrink-0 ui-icon-spring" />
              <h1 className="text-lg font-extrabold text-slate-900 tracking-tight">
                Customer History
              </h1>
              {debouncedSearch && (
                <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200 text-[10px] font-bold">
                  Searching all dates
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Sorted by calendar day · work-order status &amp; payment tracking
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
            <div className="relative flex-1 md:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search customer, phone, device, WO #..."
                className="w-full pl-10 pr-8 py-2 bg-slate-50 border border-slate-200 rounded-full text-xs text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear customer search"
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Status Filter Pills */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            {statusPills.map((pill) => {
              const isActive = statusFilter === pill.key;
              return (
                <button
                  key={pill.key}
                  type="button"
                  onClick={() => setStatusFilter(pill.key)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border ui-press cursor-pointer tabular-nums inline-flex items-center gap-1.5 ${
                    isActive
                      ? `${pill.activeCls} shadow-2xs`
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                >
                  <span>{pill.label}</span>
                  <span
                    className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                      isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    {pill.count}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="text-[11px] text-slate-400 font-mono tabular-nums">
            {totalServerCount > historyTickets.length
              ? `Showing latest ${historyTickets.length} of ${totalServerCount} records`
              : `${visibleTickets.length} visit${visibleTickets.length === 1 ? '' : 's'} shown`}
          </div>
        </div>
      </div>

      {/* ========================================================
          TWO-COLUMN WORKSPACE: CALENDAR LEFT + DAY GROUPS RIGHT
         ======================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-[328px_minmax(0,1fr)] gap-5 items-start">
        {/* LEFT COLUMN: INTERACTIVE MONTH CALENDAR + SUMMARY */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-1 gap-4">
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
            {/* Calendar Header Controls */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => handleStepMonth(-1)}
                  aria-label="Previous Month"
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 ui-press cursor-pointer shrink-0"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-sm font-bold text-slate-900 text-center">
                  {monthLabel}
                </span>
                <button
                  type="button"
                  onClick={() => handleStepMonth(1)}
                  aria-label="Next Month"
                  className="p-1.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900 ui-press cursor-pointer shrink-0"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleJumpToday}
                  className={`flex-1 py-1.5 px-2.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ui-press cursor-pointer ${
                    selectedDayKey === todayKey && scopeMode === 'month'
                      ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (scopeMode === 'all') {
                      setScopeMode('month');
                    } else {
                      setScopeMode('all');
                      setSelectedDayKey(null);
                    }
                  }}
                  className={`flex-1 py-1.5 px-2.5 rounded-full text-[11px] font-semibold border whitespace-nowrap ui-press cursor-pointer ${
                    scopeMode === 'all'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  All Time
                </button>
              </div>
            </div>

            {/* Weekday Header */}
            <div className="grid grid-cols-7 gap-1 text-center">
              {WEEKDAYS.map((wd) => (
                <div
                  key={wd}
                  className="text-[10px] font-bold uppercase tracking-wider text-slate-400 py-1"
                >
                  {wd}
                </div>
              ))}
            </div>

            {/* Day Grid */}
            <div className="grid grid-cols-7 gap-1">
              {calendarCells.map((cell, idx) => {
                if (!cell.day || !cell.dayKey) {
                  return <div key={`empty-${idx}`} className="h-11 rounded-xl bg-slate-50/40" />;
                }
                const marker = dayMarkers.get(cell.dayKey);
                const isSelected = selectedDayKey === cell.dayKey;
                const isToday = cell.dayKey === todayKey;

                return (
                  <button
                    key={cell.dayKey}
                    type="button"
                    onClick={() => {
                      if (scopeMode === 'all') setScopeMode('month');
                      setSelectedDayKey((curr) => (curr === cell.dayKey ? null : cell.dayKey));
                    }}
                    className={`h-11 rounded-xl p-1 flex flex-col items-center justify-between border ui-press cursor-pointer relative ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : isToday
                        ? 'bg-indigo-50/60 text-indigo-900 border-indigo-400 ring-1 ring-indigo-300 font-bold'
                        : marker
                        ? 'bg-white hover:bg-slate-50 text-slate-900 border-slate-200'
                        : 'bg-white hover:bg-slate-50 text-slate-400 border-slate-100'
                    }`}
                  >
                    <div className="w-full flex items-center justify-between px-0.5 leading-none">
                      <span className={`text-[11px] font-mono tabular-nums ${isSelected ? 'font-bold' : 'font-semibold'}`}>
                        {cell.day}
                      </span>
                      {marker && marker.count > 0 && (
                        <span
                          className={`text-[9px] font-mono font-bold px-1 rounded ${
                            isSelected
                              ? 'bg-white/25 text-white'
                              : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {marker.count}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-0.5 h-1.5">
                      {marker?.hasPaidDone && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-emerald-300' : 'bg-emerald-500'}`}
                          title="Paid / Done"
                        />
                      )}
                      {marker?.hasUnpaid && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-amber-300' : 'bg-amber-500'}`}
                          title="Unpaid balance"
                        />
                      )}
                      {marker?.hasInShop && (
                        <span
                          className={`w-1.5 h-1.5 rounded-full ${isSelected ? 'bg-sky-200' : 'bg-blue-500'}`}
                          title="Active in shop"
                        />
                      )}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Calendar Legend & Clear */}
            <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-500">
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" /> Paid / Done
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-500" /> Unpaid
                </span>
                <span className="inline-flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-blue-500" /> In Shop
                </span>
              </div>
              {selectedDayKey && (
                <button
                  type="button"
                  onClick={() => setSelectedDayKey(null)}
                  className="text-indigo-600 font-bold hover:underline cursor-pointer"
                >
                  Show all days
                </button>
              )}
            </div>
          </div>

          {/* Summary Card */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs p-4 space-y-3">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 truncate">
              {summaryTitle}
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Visits
                </div>
                <div className="text-lg font-extrabold text-slate-900 font-mono tabular-nums mt-0.5">
                  {summaryStats.visits}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-100">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  Paid / Done
                </div>
                <div className="text-lg font-extrabold text-indigo-700 font-mono tabular-nums mt-0.5">
                  {summaryStats.paidDone}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-emerald-50/60 border border-emerald-100">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                  Collected
                </div>
                <div className="text-base font-extrabold text-emerald-700 font-mono tabular-nums mt-0.5">
                  ${(summaryStats.collectedCents / 100).toFixed(2)}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-amber-50/60 border border-amber-100">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
                  Balance Owing
                </div>
                <div className="text-base font-extrabold text-amber-700 font-mono tabular-nums mt-0.5">
                  ${(summaryStats.owingCents / 100).toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: DAY-BY-DAY CHRONOLOGICAL GROUPS */}
        <div className="min-w-0 space-y-3">
          {selectedDayKey && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-2.5 flex items-center justify-between gap-2 text-xs ui-pop">
              <span className="font-semibold text-indigo-900">
                Showing customers from <strong>{formatDayHeading(selectedDayKey)}</strong>
              </span>
              <button
                type="button"
                onClick={() => setSelectedDayKey(null)}
                className="px-3 py-1 bg-white hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-full font-bold ui-press cursor-pointer"
              >
                Clear Day Filter
              </button>
            </div>
          )}

          {historyError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs font-medium">
              {historyError}
            </div>
          )}

          {isLoadingHistory ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center space-y-2">
              <div className="w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
              <p className="text-xs text-slate-500 font-medium">Loading customer history...</p>
            </div>
          ) : groupedDays.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200/90 p-10 text-center space-y-3 ui-view-enter">
              <CalendarIcon className="w-8 h-8 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">No customer visits match</h3>
                <p className="text-xs text-slate-500">
                  {selectedDayKey
                    ? `No work orders logged on ${formatDayHeading(selectedDayKey)} for this filter.`
                    : `No work orders logged in ${scopeMode === 'all' ? 'history' : monthLabel} for the active filter.`}
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                {selectedDayKey && (
                  <button
                    type="button"
                    onClick={() => setSelectedDayKey(null)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press cursor-pointer"
                  >
                    Show All Days
                  </button>
                )}
                {(statusFilter !== 'ALL' || search.trim() !== '') && (
                  <button
                    type="button"
                    onClick={() => {
                      setStatusFilter('ALL');
                      setSearch('');
                      setSelectedDayKey(null);
                    }}
                    className="px-3.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold inline-flex items-center gap-1 ui-press cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Reset Filters</span>
                  </button>
                )}
              </div>
            </div>
          ) : (
            groupedDays.map((group) => (
              <section
                key={group.dayKey}
                className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden ui-view-enter"
              >
                {/* Sticky-style Day Header */}
                <div className="bg-slate-50 border-b border-slate-200 px-4 py-2.5 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <h2 className="text-xs sm:text-sm font-bold text-slate-900">{group.label}</h2>
                    {group.isToday && (
                      <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                        Today
                      </span>
                    )}
                    {!group.isToday && group.isYesterday && (
                      <span className="px-2 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold">
                        Yesterday
                      </span>
                    )}
                  </div>

                  <div className="text-[11px] font-mono tabular-nums text-slate-500 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-slate-700">
                      {group.items.length} visit{group.items.length === 1 ? '' : 's'}
                    </span>
                    <span>&bull;</span>
                    <span className="text-emerald-700 font-semibold">
                      ${(group.collectedCents / 100).toFixed(2)} collected
                    </span>
                    {group.owingCents > 0 && (
                      <>
                        <span>&bull;</span>
                        <span className="text-amber-700 font-semibold">
                          ${(group.owingCents / 100).toFixed(2)} owing
                        </span>
                      </>
                    )}
                  </div>
                </div>

                {/* Ticket Rows for this Day */}
                <div key={`${selectedDayKey || 'all'}-${statusFilter}`} className="divide-y divide-slate-100 ui-row-stagger">
                  {group.items.map((t) => {
                    const m = classifyTicket(t);
                    const workMeta = getWorkStatusMeta(t.status);
                    const timeStr = new Date(t.createdAt).toLocaleTimeString([], {
                      hour: 'numeric',
                      minute: '2-digit',
                    });

                    let paymentBadge = (
                      <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                        No Charge
                      </span>
                    );
                    if (m.isPaid) {
                      paymentBadge = (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Paid
                        </span>
                      );
                    } else if (m.paidCents > 0 && m.balanceCents > 0) {
                      paymentBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                          Partial
                        </span>
                      );
                    } else if (m.balanceCents > 0 && !m.isClosedOut) {
                      paymentBadge = (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          Unpaid
                        </span>
                      );
                    }

                    return (
                      <div
                        key={t.id}
                        onClick={() => onSelectTicket && onSelectTicket(t)}
                        className="p-3.5 sm:px-4 hover:bg-indigo-50/40 transition-colors duration-150 cursor-pointer flex flex-col md:flex-row md:items-center justify-between gap-3"
                      >
                        {/* Left: Customer, Time, Device & Issue */}
                        <div className="min-w-0 flex-1 space-y-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="text-sm font-bold text-slate-900 truncate">
                              {t.customer?.fullName || 'Customer'}
                            </span>
                            <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 border border-indigo-100 font-mono text-[11px] font-bold whitespace-nowrap">
                              WO #{t.ticketNumber}
                            </span>
                            <span className="text-[11px] font-mono tabular-nums text-slate-400 whitespace-nowrap">
                              {timeStr}
                            </span>
                            {t.customer?.phone && (
                              <a
                                href={`tel:${t.customer.phone}`}
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 text-xs font-mono text-slate-600 hover:text-indigo-600 whitespace-nowrap"
                              >
                                <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{t.customer.phone}</span>
                              </a>
                            )}
                          </div>

                          <div className="text-xs text-slate-600 truncate">
                            <strong className="font-semibold text-slate-800">
                              {t.device?.name || 'Device'}
                            </strong>
                            {t.faultDescription ? ` — ${t.faultDescription}` : ''}
                          </div>
                        </div>

                        {/* Middle + Right: Statuses, Currency & Actions */}
                        <div className="flex flex-wrap items-center justify-between md:justify-end gap-2.5 shrink-0">
                          <div className="flex items-center gap-1.5 whitespace-nowrap">
                            <span
                              className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold border whitespace-nowrap ${workMeta.className}`}
                            >
                              {workMeta.label}
                            </span>
                            {paymentBadge}
                          </div>

                          <div className="text-right min-w-[82px] whitespace-nowrap">
                            <div className="text-sm font-extrabold font-mono tabular-nums text-slate-900">
                              {m.hasPrice || m.paidCents > 0
                                ? `$${(m.totalCents / 100).toFixed(2)}`
                                : 'Pending'}
                            </div>
                            <div className="text-[11px] font-mono tabular-nums">
                              {m.isPaid ? (
                                <span className="text-emerald-700 font-semibold">Paid in full</span>
                              ) : m.paidCents > 0 && m.balanceCents > 0 ? (
                                <span className="text-indigo-700 font-semibold">
                                  Paid ${(m.paidCents / 100).toFixed(2)} · Bal ${(m.balanceCents / 100).toFixed(2)}
                                </span>
                              ) : m.balanceCents > 0 && !m.isClosedOut ? (
                                <span className="text-amber-700 font-semibold">
                                  Bal: ${(m.balanceCents / 100).toFixed(2)}
                                </span>
                              ) : m.isClosedOut ? (
                                <span className="text-slate-400">{t.status.toLowerCase()}</span>
                              ) : (
                                <span className="text-slate-400">No items</span>
                              )}
                            </div>
                          </div>

                          {/* Row Action Buttons */}
                          <div
                            className="flex items-center gap-1.5 whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {onSelectTicket && (
                              <button
                                type="button"
                                onClick={() => onSelectTicket(t)}
                                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold inline-flex items-center gap-1 ui-press cursor-pointer whitespace-nowrap"
                              >
                                <ExternalLink className="w-3 h-3 shrink-0" />
                                <span>Open</span>
                              </button>
                            )}
                            {onPrintTicket && (
                              <button
                                type="button"
                                onClick={() => onPrintTicket(t)}
                                title="Print Receipt / Invoice"
                                aria-label={`Print WO #${t.ticketNumber}`}
                                className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-slate-900 hover:bg-slate-50 ui-press cursor-pointer shrink-0"
                              >
                                <Printer className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {t.customer && (
                              <button
                                type="button"
                                onClick={(e) => openEditCustomerModal(t.customer, e)}
                                title="Edit Customer Contact"
                                aria-label={`Edit customer ${t.customer.fullName}`}
                                className="p-1.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:bg-slate-50 ui-press cursor-pointer shrink-0"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                            )}
                            {onOpenCreateWithCustomer && t.customer && (
                              <button
                                type="button"
                                onClick={() => onOpenCreateWithCustomer(t.customer)}
                                title="New Work Order for this Customer"
                                className="px-2.5 py-1.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-semibold inline-flex items-center gap-0.5 ui-press cursor-pointer whitespace-nowrap"
                              >
                                <Plus className="w-3 h-3 shrink-0" />
                                <span>Ticket</span>
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            ))
          )}
        </div>
      </div>

      {/* ========================================================
          EDIT CUSTOMER MODAL
         ======================================================== */}
      {editingCustomer && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Pencil className="w-4 h-4 text-indigo-600" />
                Edit Customer Profile
              </h3>
              <button
                type="button"
                onClick={() => setEditingCustomer(null)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editCustomerError && (
              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-xl font-medium border border-red-200">
                {editCustomerError}
              </div>
            )}

            <form onSubmit={handleSaveCustomer} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Full Name *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Primary Phone *
                  </label>
                  <input
                    type="text"
                    required
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Alt Phone
                  </label>
                  <input
                    type="text"
                    value={editAltPhone}
                    onChange={(e) => setEditAltPhone(e.target.value)}
                    placeholder="Optional"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Email
                </label>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(e) => setEditEmail(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Address
                </label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={(e) => setEditAddress(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingCustomer(null)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingCustomer}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSavingCustomer ? 'Saving...' : 'Save Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
