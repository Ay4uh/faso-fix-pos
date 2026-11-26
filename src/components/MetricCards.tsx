import React from 'react';
import { DashboardStats, Ticket } from '../types';
import { Cpu, AlarmClock, Wallet, CheckCircle2 } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';

interface MetricCardsProps {
  stats: DashboardStats | null;
  tickets?: Ticket[];
  activeFilter?: string;
  onSelectFilter?: (filter: string) => void;
}

const TERMINAL = new Set(['COMPLETED', 'DECLINED', 'CANCELLED']);

export const MetricCards: React.FC<MetricCardsProps> = ({
  stats,
  tickets = [],
  activeFilter = 'ALL',
  onSelectFilter,
}) => {
  const activeCount = stats?.totalActive ?? stats?.open ?? 0;
  const readyPickup = stats?.readyForPickup ?? stats?.awaitingPickupCount ?? 0;

  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const activeTickets = tickets.filter((t) => !TERMINAL.has(t.status));
  const fallbackOverdue = activeTickets.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length;
  const fallbackDueToday = activeTickets.filter((t) => {
    if (!t.dueDate) return false;
    const ms = new Date(t.dueDate).getTime();
    return ms >= now && ms <= endOfToday.getTime();
  }).length;

  const overdue = stats?.overdue ?? fallbackOverdue;
  const dueToday = stats?.dueToday ?? fallbackDueToday;

  const fallbackUnpaidCents = tickets.reduce((sum, t) => {
    if (t.status === 'CANCELLED' || t.status === 'DECLINED') return sum;
    const bal = t.totals?.balanceCents ?? 0;
    return bal > 0 ? sum + bal : sum;
  }, 0);
  const fallbackUnpaidCount = tickets.filter(
    (t) => t.status !== 'CANCELLED' && t.status !== 'DECLINED' && (t.totals?.balanceCents ?? 0) > 0
  ).length;

  const unpaidCents = stats?.unpaidBalanceCents ?? fallbackUnpaidCents;
  const unpaidCount = stats?.unpaidTicketsCount ?? fallbackUnpaidCount;

  const toggleFilter = (target: string) => {
    onSelectFilter?.(activeFilter === target ? 'ALL' : target);
  };

  const cardBase =
    'text-left w-full bg-white px-3 py-2.5 sm:px-4 sm:py-3 rounded-2xl border shadow-xs hover:shadow-lg ui-card-lift group flex items-center justify-between gap-2 min-w-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
  const labelCls = 'font-semibold text-slate-500 uppercase tracking-wider text-[10px] leading-tight';
  const iconBox =
    'w-8 h-8 sm:w-9 sm:h-9 rounded-xl border flex items-center justify-center shadow-xs shrink-0 ui-icon-spring';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 ui-stagger">
      {/* 1. Active Work Orders */}
      <button
        type="button"
        onClick={() => toggleFilter('ACTIVE_ONLY')}
        className={`${cardBase} ${
          activeFilter === 'ACTIVE_ONLY'
            ? 'border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-50/30'
            : 'border-slate-200/90 hover:shadow-indigo-500/10 hover:border-indigo-200/80'
        }`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Active Work Orders</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-indigo-600 mt-0.5 font-mono tabular-nums tracking-tight">
            <AnimatedNumber value={activeCount} />
          </h3>
          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 truncate">
            {activeFilter === 'ACTIVE_ONLY' ? 'Filtering active only' : 'Tap to filter active only'}
          </p>
        </div>
        <div className={`${iconBox} bg-indigo-50 border-indigo-100 text-indigo-600`}>
          <Cpu className="w-4 h-4" />
        </div>
      </button>

      {/* 2. Due Today / Overdue */}
      <button
        type="button"
        onClick={() => toggleFilter('DUE_OR_OVERDUE')}
        className={`${cardBase} ${
          activeFilter === 'DUE_OR_OVERDUE'
            ? 'border-amber-500 ring-2 ring-amber-500/20 bg-amber-50/30'
            : overdue > 0
            ? 'border-rose-200 bg-gradient-to-br from-white to-rose-50/60 hover:shadow-rose-500/10'
            : 'border-slate-200/90 hover:shadow-amber-500/10 hover:border-amber-200/80'
        }`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Due Today</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-amber-600 mt-0.5 font-mono tabular-nums tracking-tight">
            <AnimatedNumber value={dueToday} />
          </h3>
          <p
            className={`text-[10px] sm:text-[11px] font-semibold mt-0.5 truncate ${
              overdue > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {activeFilter === 'DUE_OR_OVERDUE'
              ? 'Filtering due & overdue'
              : overdue > 0
              ? `${overdue} overdue · tap to view`
              : 'Nothing overdue'}
          </p>
        </div>
        <div
          className={`${iconBox} ${
            overdue > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-amber-50 border-amber-100 text-amber-600'
          }`}
        >
          <AlarmClock className="w-4 h-4" />
        </div>
      </button>

      {/* 3. Unpaid Balances */}
      <button
        type="button"
        onClick={() => toggleFilter('UNPAID')}
        className={`${cardBase} ${
          activeFilter === 'UNPAID'
            ? 'border-violet-500 ring-2 ring-violet-500/20 bg-violet-50/30'
            : 'border-slate-200/90 hover:shadow-violet-500/10 hover:border-violet-200/80'
        }`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Unpaid Balances</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-violet-600 mt-0.5 font-mono tabular-nums tracking-tight truncate">
            ${(unpaidCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 truncate">
            {activeFilter === 'UNPAID'
              ? 'Filtering unpaid tickets'
              : `Across ${unpaidCount} ticket${unpaidCount === 1 ? '' : 's'} · tap to filter`}
          </p>
        </div>
        <div className={`${iconBox} bg-violet-50 border-violet-100 text-violet-600`}>
          <Wallet className="w-4 h-4" />
        </div>
      </button>

      {/* 4. Ready for Pickup */}
      <button
        type="button"
        onClick={() => toggleFilter('READY_FOR_PICKUP')}
        className={`${cardBase} ${
          activeFilter === 'READY_FOR_PICKUP'
            ? 'border-teal-500 ring-2 ring-teal-500/20 bg-teal-50/30'
            : 'border-slate-200/90 hover:shadow-teal-500/10 hover:border-teal-200/80'
        }`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Ready for Pickup</p>
          <h3 className="text-lg sm:text-xl font-extrabold text-teal-600 mt-0.5 font-mono tabular-nums tracking-tight">
            <AnimatedNumber value={readyPickup} />
          </h3>
          <p className="text-[10px] sm:text-[11px] text-teal-700 font-medium mt-0.5 truncate">
            {activeFilter === 'READY_FOR_PICKUP' ? 'Filtering pickup ready' : 'Tap to view & notify'}
          </p>
        </div>
        <div className={`${iconBox} bg-teal-50 border-teal-100 text-teal-600`}>
          <CheckCircle2 className="w-4 h-4" />
        </div>
      </button>
    </div>
  );
};
