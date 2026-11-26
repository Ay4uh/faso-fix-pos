import React from 'react';
import { DashboardStats, Ticket } from '../types';
import { Cpu, AlarmClock, Wallet, CheckCircle2 } from 'lucide-react';
import { AnimatedNumber } from './AnimatedNumber';

interface MetricCardsProps {
  stats: DashboardStats | null;
  tickets?: Ticket[];
  onSelectFilter?: (filter: string) => void;
}

const TERMINAL = new Set(['COMPLETED', 'DECLINED', 'CANCELLED']);

export const MetricCards: React.FC<MetricCardsProps> = ({ stats, tickets = [], onSelectFilter }) => {
  const activeCount = stats?.totalActive ?? stats?.open ?? 0;
  const readyPickup = stats?.readyForPickup ?? stats?.awaitingPickupCount ?? 0;

  const now = Date.now();
  const endOfToday = new Date();
  endOfToday.setHours(23, 59, 59, 999);

  const activeTickets = tickets.filter((t) => !TERMINAL.has(t.status));
  const overdue = activeTickets.filter((t) => t.dueDate && new Date(t.dueDate).getTime() < now).length;
  const dueToday = activeTickets.filter((t) => {
    if (!t.dueDate) return false;
    const ms = new Date(t.dueDate).getTime();
    return ms >= now && ms <= endOfToday.getTime();
  }).length;

  const unpaidCents = tickets.reduce((sum, t) => {
    if (t.status === 'CANCELLED' || t.status === 'DECLINED') return sum;
    const bal = t.totals?.balanceCents ?? 0;
    return bal > 0 ? sum + bal : sum;
  }, 0);
  const unpaidCount = tickets.filter(
    (t) => t.status !== 'CANCELLED' && t.status !== 'DECLINED' && (t.totals?.balanceCents ?? 0) > 0
  ).length;

  const cardBase =
    'text-left w-full bg-white p-3.5 sm:p-5 rounded-2xl border border-slate-200/90 shadow-xs hover:shadow-lg ui-card-lift group flex items-center justify-between gap-2 min-w-0 cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400';
  const labelCls = 'font-semibold text-slate-500 uppercase tracking-wider text-[10px] sm:text-[11px] leading-tight';
  const iconBox =
    'w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl border flex items-center justify-center shadow-xs shrink-0 ui-icon-spring';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 ui-stagger">
      {/* 1. Active Work Orders */}
      <button
        type="button"
        onClick={() => onSelectFilter?.('ALL')}
        className={`${cardBase} hover:shadow-indigo-500/10 hover:border-indigo-200/80`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Active Work Orders</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-indigo-600 mt-1 font-mono tabular-nums tracking-tight">
            <AnimatedNumber value={activeCount} />
          </h3>
          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 truncate">On the bench right now</p>
        </div>
        <div className={`${iconBox} bg-indigo-50 border-indigo-100 text-indigo-600`}>
          <Cpu className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </button>

      {/* 2. Due Today / Overdue */}
      <button
        type="button"
        onClick={() => onSelectFilter?.('ALL')}
        className={`${cardBase} ${
          overdue > 0
            ? 'border-rose-200 bg-gradient-to-br from-white to-rose-50/60 hover:shadow-rose-500/10'
            : 'hover:shadow-amber-500/10 hover:border-amber-200/80'
        }`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Due Today</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-amber-600 mt-1 font-mono tabular-nums tracking-tight">
            <AnimatedNumber value={dueToday} />
          </h3>
          <p
            className={`text-[10px] sm:text-[11px] font-semibold mt-0.5 truncate ${
              overdue > 0 ? 'text-rose-700' : 'text-emerald-700'
            }`}
          >
            {overdue > 0 ? `${overdue} overdue · act now` : 'Nothing overdue'}
          </p>
        </div>
        <div
          className={`${iconBox} ${
            overdue > 0 ? 'bg-rose-50 border-rose-100 text-rose-600' : 'bg-amber-50 border-amber-100 text-amber-600'
          }`}
        >
          <AlarmClock className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </button>

      {/* 3. Unpaid Balances */}
      <button
        type="button"
        onClick={() => onSelectFilter?.('ALL')}
        className={`${cardBase} hover:shadow-violet-500/10 hover:border-violet-200/80`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Unpaid Balances</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-violet-600 mt-1 font-mono tabular-nums tracking-tight truncate">
            ${(unpaidCents / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </h3>
          <p className="text-[10px] sm:text-[11px] text-slate-600 font-medium mt-0.5 truncate">
            Across {unpaidCount} ticket{unpaidCount === 1 ? '' : 's'}
          </p>
        </div>
        <div className={`${iconBox} bg-violet-50 border-violet-100 text-violet-600`}>
          <Wallet className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </button>

      {/* 4. Ready for Pickup */}
      <button
        type="button"
        onClick={() => onSelectFilter?.('READY_FOR_PICKUP')}
        className={`${cardBase} hover:shadow-teal-500/10 hover:border-teal-200/80`}
      >
        <div className="min-w-0">
          <p className={labelCls}>Ready for Pickup</p>
          <h3 className="text-2xl sm:text-3xl font-extrabold text-teal-600 mt-1 font-mono tabular-nums tracking-tight">
            <AnimatedNumber value={readyPickup} />
          </h3>
          <p className="text-[10px] sm:text-[11px] text-teal-700 font-medium mt-0.5 truncate">Tap to view &amp; notify</p>
        </div>
        <div className={`${iconBox} bg-teal-50 border-teal-100 text-teal-600`}>
          <CheckCircle2 className="w-4 h-4 sm:w-5 sm:h-5" />
        </div>
      </button>
    </div>
  );
};
