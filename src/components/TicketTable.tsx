import React, { useState, useEffect } from 'react';
import { Ticket, User, DashboardStats } from '../types';
import {
  Calendar,
  Phone,
  CheckCircle2,
  Check,
  Inbox,
  MessageSquare,
  MoreVertical,
  Printer,
  Trash2,
  ChevronLeft,
  ChevronRight,
  User as UserIcon,
  Wrench,
  ShieldCheck,
  Smartphone,
  Laptop,
  Tv,
  Gamepad2,
  Cpu,
  Lock,
  Sparkles,
  Layers,
  ArrowUpDown,
} from 'lucide-react';
import { deriveTicketQuoteState, isTicketPaidInFull } from '../utils/repairPricing';
import { ConfirmDialog } from './ConfirmDialog';

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasMore: boolean;
}

interface TicketTableProps {
  tickets: Ticket[];
  totalTicketsCount: number;
  stats?: DashboardStats | null;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  currentUser?: User | null;
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateStatus: (ticketId: string, newStatus: Ticket['status']) => void;
  onQuickComplete: (ticketId: string) => void;
  onOpenSmsModal: (ticket: Ticket) => void;
  onPrintTicket: (ticket: Ticket) => void;
  onDeleteTicket?: (ticketId: string) => void;
  pagination?: PaginationMeta | null;
  onPageChange?: (page: number) => void;
}

type DeviceCategory = 'tv' | 'console' | 'laptop' | 'phone' | 'default';

const TERMINAL_STATUSES = new Set<string>(['COMPLETED', 'DECLINED', 'CANCELLED']);

const getDeviceCategory = (deviceName: string): DeviceCategory => {
  const lower = (deviceName || '').toLowerCase();
  if (lower.includes('tv') || lower.includes('television') || lower.includes('samsung soc') || lower.includes('display')) {
    return 'tv';
  }
  if (
    lower.includes('ps5') ||
    lower.includes('playstation') ||
    lower.includes('xbox') ||
    lower.includes('switch') ||
    lower.includes('rog ally') ||
    lower.includes('controller') ||
    lower.includes('console') ||
    lower.includes('hifi') ||
    lower.includes('dvd')
  ) {
    return 'console';
  }
  if (
    lower.includes('macbook') ||
    lower.includes('laptop') ||
    lower.includes('dell') ||
    lower.includes('thinkpad') ||
    lower.includes('hp') ||
    lower.includes('asus') ||
    lower.includes('notebook')
  ) {
    return 'laptop';
  }
  if (
    lower.includes('iphone') ||
    lower.includes('pixel') ||
    lower.includes('phone') ||
    lower.includes('galaxy') ||
    lower.includes('android')
  ) {
    return 'phone';
  }
  return 'default';
};

const DEVICE_STYLE_MAP: Record<DeviceCategory, string> = {
  tv: 'bg-sky-50 border-sky-200/70',
  console: 'bg-purple-50 border-purple-200/70',
  laptop: 'bg-indigo-50 border-indigo-200/70',
  phone: 'bg-emerald-50 border-emerald-200/70',
  default: 'bg-slate-100/90 border-slate-200/70',
};

const getDeviceIcon = (deviceName: string) => {
  switch (getDeviceCategory(deviceName)) {
    case 'tv':
      return <Tv className="w-4 h-4 text-sky-600 shrink-0" />;
    case 'console':
      return <Gamepad2 className="w-4 h-4 text-purple-600 shrink-0" />;
    case 'laptop':
      return <Laptop className="w-4 h-4 text-indigo-600 shrink-0" />;
    case 'phone':
      return <Smartphone className="w-4 h-4 text-emerald-600 shrink-0" />;
    default:
      return <Cpu className="w-4 h-4 text-slate-500 shrink-0" />;
  }
};

const getDeviceBadgeStyle = (deviceName: string): string => {
  return DEVICE_STYLE_MAP[getDeviceCategory(deviceName)];
};

const getCustomerInitials = (name: string): string => {
  const parts = (name || '').trim().split(/\s+/);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return (name || 'CU').slice(0, 2).toUpperCase();
};

const getAvatarGradient = (name: string): string => {
  const gradients = [
    'from-indigo-500 to-indigo-600 text-white',
    'from-blue-500 to-blue-600 text-white',
    'from-violet-500 to-violet-600 text-white',
    'from-sky-500 to-sky-600 text-white',
    'from-teal-500 to-teal-600 text-white',
    'from-emerald-500 to-emerald-600 text-white',
  ];
  let hash = 0;
  for (let i = 0; i < (name || '').length; i++) hash += name.charCodeAt(i);
  return gradients[hash % gradients.length];
};

const getStatusAccentBorder = (status: Ticket['status'], isOverdue: boolean): string => {
  if (isOverdue) return 'border-l-[3px] border-l-rose-500';
  switch (status) {
    case 'DIAGNOSING':
    case 'IN_PROGRESS':
      return 'border-l-[3px] border-l-blue-500';
    case 'WAITING_ON_APPROVAL':
      return 'border-l-[3px] border-l-purple-500';
    case 'WAITING_ON_PARTS':
      return 'border-l-[3px] border-l-amber-500';
    case 'READY_FOR_PICKUP':
      return 'border-l-[3px] border-l-teal-500';
    case 'COMPLETED':
      return 'border-l-[3px] border-l-emerald-500';
    case 'DECLINED':
      return 'border-l-[3px] border-l-rose-400';
    case 'CANCELLED':
      return 'border-l-[3px] border-l-slate-300';
    case 'CHECKED_IN':
    case 'PENDING':
    default:
      return 'border-l-[3px] border-l-indigo-400';
  }
};

const getDueDateMeta = (dueDateStr: string | null | undefined, status: Ticket['status']) => {
  if (!dueDateStr) {
    return {
      formattedDate: 'Pending',
      isOverdue: false,
      relativeLabel: null as string | null,
      isDueSoon: false,
    };
  }
  const due = new Date(dueDateStr);
  if (Number.isNaN(due.getTime())) {
    return {
      formattedDate: 'Pending',
      isOverdue: false,
      relativeLabel: null as string | null,
      isDueSoon: false,
    };
  }

  const formattedDate = due.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const isTerminal = TERMINAL_STATUSES.has(status);
  const isOverdue = due.getTime() < Date.now() && !isTerminal;

  if (isOverdue) {
    return {
      formattedDate,
      isOverdue: true,
      relativeLabel: 'Missed Promise Date',
      isDueSoon: false,
    };
  }

  if (isTerminal) {
    return {
      formattedDate,
      isOverdue: false,
      relativeLabel: null as string | null,
      isDueSoon: false,
    };
  }

  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfDueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate()).getTime();
  const diffDays = Math.round((startOfDueDay - startOfToday) / 86_400_000);

  if (diffDays === 0) {
    return { formattedDate, isOverdue: false, relativeLabel: 'Due today', isDueSoon: true };
  }
  if (diffDays === 1) {
    return { formattedDate, isOverdue: false, relativeLabel: 'Due tomorrow', isDueSoon: true };
  }
  if (diffDays > 1 && diffDays <= 7) {
    return { formattedDate, isOverdue: false, relativeLabel: `In ${diffDays} days`, isDueSoon: false };
  }

  return { formattedDate, isOverdue: false, relativeLabel: null as string | null, isDueSoon: false };
};

export const TicketTable: React.FC<TicketTableProps> = ({
  tickets,
  totalTicketsCount,
  stats,
  activeFilter,
  setActiveFilter,
  currentUser,
  onSelectTicket,
  onUpdateStatus,
  onQuickComplete,
  onOpenSmsModal,
  onPrintTicket,
  onDeleteTicket,
  pagination,
  onPageChange,
}) => {
  const [openMenuTicketId, setOpenMenuTicketId] = useState<string | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);

  // Close kebab menu on outside click
  useEffect(() => {
    const handleGlobalClick = () => setOpenMenuTicketId(null);
    window.addEventListener('click', handleGlobalClick);
    return () => window.removeEventListener('click', handleGlobalClick);
  }, []);

  // Status Badge Configuration matching linear lifecycle
  const getStatusBadge = (status: Ticket['status']) => {
    switch (status) {
      case 'DIAGNOSING':
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-blue-50 text-blue-700 border border-blue-200/80 shadow-2xs ring-1 ring-blue-500/10">
            <span className="relative flex h-2 w-2 mr-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-blue-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-blue-600"></span>
            </span>
            Diagnosing
          </span>
        );
      case 'WAITING_ON_APPROVAL':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200/80 shadow-2xs ring-1 ring-purple-500/10">
            <span className="w-2 h-2 rounded-full bg-purple-600 mr-1.5"></span>
            Waiting Approval
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200/80 shadow-2xs ring-1 ring-amber-500/10">
            <span className="w-2 h-2 rounded-full bg-amber-500 mr-1.5"></span>
            Waiting on Part
          </span>
        );
      case 'READY_FOR_PICKUP':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-teal-50 text-teal-800 border border-teal-200/80 shadow-2xs ring-1 ring-teal-500/10">
            <Sparkles className="w-3 h-3 text-teal-600 mr-1" />
            Ready for Pickup
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/80 shadow-2xs ring-1 ring-emerald-500/10">
            <CheckCircle2 className="w-3 h-3 text-emerald-600 mr-1" />
            Completed / Paid
          </span>
        );
      case 'DECLINED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200/80 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-rose-500 mr-1.5"></span>
            Declined
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs line-through">
            <span className="w-2 h-2 rounded-full bg-slate-400 mr-1.5"></span>
            Cancelled
          </span>
        );
      case 'CHECKED_IN':
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200/80 shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-slate-500 mr-1.5"></span>
            Checked In
          </span>
        );
    }
  };

  const statusMatches = (tStatus: string, filterId: string) => {
    if (filterId === 'ALL') return true;
    if (filterId === 'CHECKED_IN') return tStatus === 'CHECKED_IN' || tStatus === 'PENDING';
    if (filterId === 'DIAGNOSING') return tStatus === 'DIAGNOSING' || tStatus === 'IN_PROGRESS';
    return tStatus === filterId;
  };

  const [sortKey, setSortKey] = useState<'urgency' | 'due' | 'total' | 'number'>('urgency');

  const statusFiltered = tickets.filter((t) => statusMatches(t.status, activeFilter));

  const dueMs = (t: Ticket) => (t.dueDate ? new Date(t.dueDate).getTime() : Number.MAX_SAFE_INTEGER);
  const filteredTickets = [...statusFiltered].sort((a, b) => {
    if (sortKey === 'number') return b.ticketNumber - a.ticketNumber;
    if (sortKey === 'total') return (b.totals?.totalCents ?? b.laborCents) - (a.totals?.totalCents ?? a.laborCents);
    if (sortKey === 'due') return dueMs(a) - dueMs(b);
    // urgency: active first, then soonest due, terminal last
    const aT = TERMINAL_STATUSES.has(a.status) ? 1 : 0;
    const bT = TERMINAL_STATUSES.has(b.status) ? 1 : 0;
    if (aT !== bT) return aT - bT;
    return dueMs(a) - dueMs(b);
  });

  const filterPills = [
    { id: 'ALL', label: 'All', dotClass: 'bg-indigo-500', count: stats?.totalTickets },
    { id: 'CHECKED_IN', label: 'Checked In', dotClass: 'bg-slate-400', count: stats ? (stats.checkedIn ?? stats.pending) : undefined },
    { id: 'DIAGNOSING', label: 'Diagnosing', dotClass: 'bg-blue-500', count: stats ? (stats.diagnosing ?? stats.inProgress) : undefined },
    { id: 'WAITING_ON_APPROVAL', label: 'Waiting Approval', dotClass: 'bg-purple-500', count: stats ? (stats.waitingOnApproval ?? 0) : undefined },
    { id: 'WAITING_ON_PARTS', label: 'Waiting on Part', dotClass: 'bg-amber-500', count: stats?.waitingOnParts },
    { id: 'READY_FOR_PICKUP', label: 'Ready for Pickup', dotClass: 'bg-teal-500', count: stats ? (stats.readyForPickup ?? 0) : undefined },
    { id: 'COMPLETED', label: 'Completed / Paid', dotClass: 'bg-emerald-500', count: stats?.completed },
    { id: 'DECLINED', label: 'Declined', dotClass: 'bg-rose-500', count: stats ? (stats.declined ?? 0) : undefined },
    { id: 'CANCELLED', label: 'Cancelled', dotClass: 'bg-slate-300', count: stats ? (stats.cancelled ?? 0) : undefined },
  ];

  return (
    <div className="space-y-3.5">
      {/* Filter Toolbar with linear status flow */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 bg-white p-3 rounded-2xl border border-slate-200/80 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 mr-1 whitespace-nowrap flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-indigo-600" />
            Status:
          </span>
          {filterPills.map((item) => {
            const isActive = activeFilter === item.id;
            const pillCount =
              item.count !== undefined
                ? item.count
                : tickets.filter((t) => statusMatches(t.status, item.id)).length;
            return (
              <button
                key={item.id}
                onClick={() => setActiveFilter(item.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold ui-press cursor-pointer whitespace-nowrap tabular-nums transition-[background-color,color,border-color,box-shadow,transform] duration-150 ${
                  isActive
                    ? 'bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-[0_2px_8px_rgba(79,70,229,0.28)] font-bold border border-transparent'
                    : 'bg-slate-50 text-slate-700 hover:bg-slate-100 border border-slate-200/70'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-white/90' : item.dotClass}`} />
                <span>{item.label}</span>
                {(item.id !== 'ALL' || item.count !== undefined) && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-black tabular-nums ${
                      isActive
                        ? 'bg-white/20 text-white'
                        : 'bg-white text-slate-600 border border-slate-200/70'
                    }`}
                  >
                    {pillCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-medium shrink-0">
          <div className="relative">
            <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as typeof sortKey)}
              className="pl-8 pr-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-xs font-semibold text-slate-700 cursor-pointer focus:outline-none focus:ring-2 focus:ring-indigo-300"
              aria-label="Sort tickets"
            >
              <option value="urgency">Most urgent</option>
              <option value="due">Due date</option>
              <option value="total">Highest total</option>
              <option value="number">Newest ticket</option>
            </select>
          </div>
          <span className="px-2.5 py-1 rounded-xl bg-slate-50 text-slate-600 font-medium border border-slate-200/70 tabular-nums whitespace-nowrap">
            Showing <strong className="text-indigo-600 font-black">{filteredTickets.length}</strong> of {totalTicketsCount} tickets
          </span>
        </div>
      </div>

      {/* ===================== LIST VIEW (ELEVATED DATA GRID) ===================== */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.04),0_6px_20px_-6px_rgba(15,23,42,0.05)] overflow-visible">
        {/* Desktop/Tablet Data Grid */}
        <div className="hidden sm:block overflow-x-auto xl:overflow-x-visible overflow-y-visible">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-gradient-to-b from-slate-50/90 to-slate-100/50 border-b border-slate-200/90 text-slate-500 font-bold uppercase tracking-[0.06em] text-[10.5px]">
                <th className="py-3 px-3 xl:px-4 rounded-tl-2xl">Ticket ID</th>
                <th className="py-3 px-3 xl:px-4">Customer Name</th>
                <th className="py-3 px-3 xl:px-4">Device Info</th>
                <th className="py-3 px-3 xl:px-4">Fault Description</th>
                <th className="py-3 px-3 xl:px-4">Due Date</th>
                <th className="py-3 px-3 xl:px-4">
                  <div className="flex flex-col">
                    <span>Total (Inc. Tax)</span>
                    <span className="text-[10px] text-slate-400 normal-case font-medium tracking-normal">Pre-tax subtotal</span>
                  </div>
                </th>
                <th className="py-3 px-3 xl:px-4">Status</th>
                <th className="py-3 px-3 xl:px-4 text-right rounded-tr-2xl">Actions</th>
              </tr>
            </thead>
            <tbody key={`${activeFilter}-${pagination?.page ?? 1}`} className="divide-y divide-slate-100/90 ui-row-stagger">
              {filteredTickets.length === 0 ? (
                <tr>
                  <td colSpan={8} className="text-center py-12 text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <Inbox className="w-8 h-8 text-slate-300" />
                      <p className="font-semibold text-sm text-slate-600">No repair tickets found matching this status</p>
                      <button
                        onClick={() => setActiveFilter('ALL')}
                        className="text-indigo-600 text-xs font-bold hover:underline cursor-pointer"
                      >
                        Show all tickets
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTickets.map((ticket) => {
                  const totalCents = ticket.totals ? ticket.totals.totalCents : ticket.laborCents;
                  const paidCents = ticket.totals ? ticket.totals.paidCents : 0;
                  const balanceCents = ticket.totals ? ticket.totals.balanceCents : totalCents;
                  const subtotalCents = ticket.totals ? ticket.totals.subtotalCents : ticket.laborCents;
                  const quoteState =
                    ticket.quoteState ??
                    deriveTicketQuoteState(ticket, { subtotalCents, totalCents, paidCents, balanceCents });
                  const isPaid = isTicketPaidInFull({ totalCents, balanceCents, paidCents }, quoteState);
                  const hasDeposit = !quoteState.hasPrice && paidCents > 0;
                  const dueMeta = getDueDateMeta(ticket.dueDate, ticket.status);
                  const deviceName = ticket.device?.name || 'Device';

                  return (
                    <tr
                      key={ticket.id}
                      onClick={() => onSelectTicket(ticket)}
                      className="hover:bg-indigo-50/40 transition-[background-color] duration-150 group cursor-pointer"
                    >
                      {/* Ticket ID */}
                      <td className={`py-3 px-3 xl:px-4 whitespace-nowrap ${getStatusAccentBorder(ticket.status, dueMeta.isOverdue)}`}>
                        <div className="flex items-center space-x-1.5">
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-indigo-50/90 text-indigo-700 font-mono font-extrabold text-xs tabular-nums border border-indigo-200/60 group-hover:bg-indigo-600 group-hover:text-white group-hover:border-indigo-600 transition-[background-color,color,border-color] duration-150">
                            #{ticket.ticketNumber}
                          </span>
                          {ticket.priority === 'URGENT' && (
                            <span
                              className="px-1.5 py-0.5 rounded-lg bg-red-100 text-red-700 text-[9px] font-black uppercase tracking-tight flex items-center gap-1"
                              title="Urgent Priority"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-pulse"></span>
                              Urgent
                            </span>
                          )}
                          {ticket.isWarranty && (
                            <span className="px-1.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-black uppercase tracking-tight inline-flex items-center gap-1 shadow-2xs">
                              <ShieldCheck className="w-3 h-3 text-blue-600" />
                              Warranty
                            </span>
                          )}
                        </div>
                        {ticket.createdBy && (
                          <div
                            className="text-[10.5px] font-sans font-medium text-slate-400 flex items-center gap-1 mt-1 max-w-[130px]"
                            title={`Created by ${ticket.createdBy}`}
                          >
                            <UserIcon className="w-2.5 h-2.5 text-slate-400 shrink-0" />
                            <span className="truncate">By {ticket.createdBy}</span>
                          </div>
                        )}
                      </td>

                      {/* Customer */}
                      <td className="py-3 px-3 xl:px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getAvatarGradient(
                              ticket.customer.fullName
                            )} font-bold text-xs flex items-center justify-center shrink-0 ring-2 ring-white shadow-xs`}
                          >
                            {getCustomerInitials(ticket.customer.fullName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] font-bold text-slate-900 group-hover:text-indigo-700 transition-[color] duration-150 leading-tight truncate max-w-[160px]">
                              {ticket.customer.fullName}
                            </div>
                            <div className="text-[11px] text-slate-500 font-mono tabular-nums font-medium flex items-center gap-1 mt-0.5">
                              <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{ticket.customer.phone}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Device */}
                      <td className="py-3 px-3 xl:px-4">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 shadow-2xs transition-[background-color,border-color] duration-150 ${getDeviceBadgeStyle(
                              deviceName
                            )}`}
                          >
                            {getDeviceIcon(deviceName)}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[12.5px] font-bold text-slate-900 leading-tight truncate max-w-[190px]" title={deviceName}>
                              {deviceName}
                            </div>
                            {(ticket.device?.serialNumber || ticket.device?.pattern || ticket.device?.passcode) && (
                              <div className="flex flex-wrap items-center gap-1 mt-1">
                                {ticket.device?.serialNumber && (
                                  <span
                                    className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-600 bg-slate-100/90 border border-slate-200/80 font-medium truncate max-w-[125px]"
                                    title={`Serial Number: ${ticket.device.serialNumber}`}
                                  >
                                    SN: {ticket.device.serialNumber}
                                  </span>
                                )}
                                {ticket.device?.pattern && (
                                  <span
                                    className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200/80 shadow-2xs"
                                    title={`Unlock Pattern: ${ticket.device.pattern}`}
                                  >
                                    <Lock className="w-2.5 h-2.5" />
                                    Pattern: {ticket.device.pattern}
                                  </span>
                                )}
                                {ticket.device?.passcode && (
                                  <span
                                    className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs"
                                    title="Device PIN available"
                                  >
                                    PIN
                                  </span>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Fault */}
                      <td className="py-3 px-3 xl:px-4">
                        <div className="flex items-start gap-1.5 max-w-[210px] xl:max-w-[240px]">
                          <Wrench className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-500 mt-0.5 shrink-0 transition-[color] duration-150" />
                          <p
                            className="text-slate-700 font-medium text-xs leading-relaxed line-clamp-2 text-pretty"
                            title={ticket.faultDescription}
                          >
                            {ticket.faultDescription}
                          </p>
                        </div>
                      </td>

                      {/* Due Date */}
                      <td className="py-3 px-3 xl:px-4 whitespace-nowrap">
                        {dueMeta.isOverdue ? (
                          <div className="inline-flex flex-col px-2.5 py-1.5 rounded-xl bg-rose-50 border border-rose-200/90 text-rose-700">
                            <div className="flex items-center space-x-1.5 text-xs font-semibold tabular-nums">
                              <Calendar className="w-3.5 h-3.5 shrink-0 text-rose-600" />
                              <span>{dueMeta.formattedDate}</span>
                            </div>
                            <span className="inline-flex items-center gap-1 mt-0.5 text-[10px] font-extrabold text-rose-700">
                              <span className="w-1.5 h-1.5 rounded-full bg-rose-600 animate-pulse" />
                              Missed Promise Date
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col">
                            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-700 tabular-nums">
                              <Calendar className="w-3.5 h-3.5 shrink-0 text-slate-400 group-hover:text-indigo-500 transition-[color] duration-150" />
                              <span>{dueMeta.formattedDate}</span>
                            </div>
                            {dueMeta.relativeLabel && (
                              <span
                                className={`mt-0.5 text-[10px] font-semibold ${
                                  dueMeta.isDueSoon ? 'text-amber-600' : 'text-slate-400'
                                }`}
                              >
                                {dueMeta.relativeLabel}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      {/* Price: Explicit Before-Tax vs After-Tax or Pending Diagnosis */}
                      <td className="py-3 px-3 xl:px-4 whitespace-nowrap">
                        {!quoteState.hasPrice && !hasDeposit ? (
                          <div className="inline-flex flex-col items-start">
                            <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-bold">
                              Price Pending
                            </span>
                            <span className="text-[10.5px] text-slate-400 font-medium mt-0.5">
                              {quoteState.approvalStatus === 'REJECTED' ? 'Quote Rejected' : 'Diagnosis Required'}
                            </span>
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-start">
                            <span className="font-extrabold text-[13px] text-slate-900 font-mono tabular-nums tracking-tight leading-tight">
                              ${(totalCents / 100).toFixed(2)}
                            </span>
                            <span className="text-[10.5px] text-slate-400 font-mono tabular-nums font-medium mt-0.5">
                              Pre-tax: ${(subtotalCents / 100).toFixed(2)}
                            </span>
                            <div className="mt-1">
                              {isPaid ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 text-[10px] font-bold tracking-tight border border-emerald-200/70">
                                  <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                  Paid in full
                                </span>
                              ) : hasDeposit ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold tracking-tight border border-indigo-200/70 tabular-nums">
                                  Deposit: ${(paidCents / 100).toFixed(2)}
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 text-[10px] font-bold tracking-tight border border-amber-200/80 tabular-nums">
                                  Bal: ${(balanceCents / 100).toFixed(2)}
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      {/* Status Badge */}
                      <td className="py-3 px-3 xl:px-4 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-block">{getStatusBadge(ticket.status)}</div>
                      </td>

                      {/* Actions: Distinct Quick Actions (SMS, Print) + Status Menu */}
                      <td className="py-3 px-3 xl:px-4 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end space-x-1">
                          {/* 1. Message Customer Quick Action */}
                          <button
                            onClick={() => onOpenSmsModal(ticket)}
                            className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:text-blue-700 rounded-xl bg-slate-50/70 group-hover:bg-white hover:bg-blue-50 border border-transparent group-hover:border-slate-200/80 hover:border-blue-200 shadow-none group-hover:shadow-2xs ui-press cursor-pointer transition-[background-color,color,border-color,box-shadow,transform] duration-150"
                            title="Message Customer (SMS)"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* 2. Print Work Order Quick Action */}
                          <button
                            onClick={() => onPrintTicket(ticket)}
                            className="h-8 w-8 inline-flex items-center justify-center text-slate-500 hover:text-indigo-700 rounded-xl bg-slate-50/70 group-hover:bg-white hover:bg-indigo-50 border border-transparent group-hover:border-slate-200/80 hover:border-indigo-200 shadow-none group-hover:shadow-2xs ui-press cursor-pointer transition-[background-color,color,border-color,box-shadow,transform] duration-150"
                            title="Print Work Order"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>

                          {/* 3. Status & Admin Menu */}
                          <div className="relative inline-block text-left">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setOpenMenuTicketId(openMenuTicketId === ticket.id ? null : ticket.id);
                              }}
                              className="h-8 w-8 inline-flex items-center justify-center text-slate-400 hover:text-slate-700 rounded-xl bg-slate-50/70 group-hover:bg-white hover:bg-slate-100 border border-transparent group-hover:border-slate-200/80 shadow-none group-hover:shadow-2xs ui-press cursor-pointer transition-[background-color,color,border-color,box-shadow,transform] duration-150"
                              title="Change status or delete"
                            >
                              <MoreVertical className="w-3.5 h-3.5" />
                            </button>

                            {openMenuTicketId === ticket.id && (
                              <div className="absolute right-0 mt-1 w-48 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 text-left ui-pop">
                                <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                  Set Linear Status
                                </div>
                                <button
                                  onClick={() => {
                                    onUpdateStatus(ticket.id, 'CHECKED_IN');
                                    setOpenMenuTicketId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                  1. Checked In
                                </button>
                                <button
                                  onClick={() => {
                                    onUpdateStatus(ticket.id, 'DIAGNOSING');
                                    setOpenMenuTicketId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                  2. Diagnosing
                                </button>
                                <button
                                  onClick={() => {
                                    onUpdateStatus(ticket.id, 'WAITING_ON_APPROVAL');
                                    setOpenMenuTicketId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                  3. Waiting on Approval
                                </button>
                                <button
                                  onClick={() => {
                                    onUpdateStatus(ticket.id, 'WAITING_ON_PARTS');
                                    setOpenMenuTicketId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                  4. Waiting on Part
                                </button>
                                <button
                                  onClick={() => {
                                    onUpdateStatus(ticket.id, 'READY_FOR_PICKUP');
                                    setOpenMenuTicketId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                  5. Ready for Pickup
                                </button>
                                <button
                                  onClick={() => {
                                    onUpdateStatus(ticket.id, 'COMPLETED');
                                    setOpenMenuTicketId(null);
                                  }}
                                  className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                >
                                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                  6. Completed / Paid
                                </button>

                                {/* Admin-only ticket deletion */}
                                {currentUser?.role === 'ADMIN' && onDeleteTicket && (
                                  <>
                                    <div className="border-t border-slate-100 my-1"></div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setDeletingTicket(ticket);
                                        setOpenMenuTicketId(null);
                                      }}
                                      className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center justify-between cursor-pointer font-semibold transition-[background-color,transform] duration-150 hover:translate-x-0.5"
                                    >
                                      <span className="flex items-center gap-2">
                                        <Trash2 className="w-3.5 h-3.5" />
                                        Delete Ticket
                                      </span>
                                      <span className="text-[9px] px-1 bg-red-100 text-red-700 font-bold rounded">
                                        Admin
                                      </span>
                                    </button>
                                  </>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Stacked Cards List (< sm viewports) */}
        <div key={`${activeFilter}-${pagination?.page ?? 1}-mobile`} className="sm:hidden divide-y divide-slate-100 ui-row-stagger">
          {filteredTickets.length === 0 ? (
            <div className="text-center py-10 px-4 text-slate-400">
              <Inbox className="w-8 h-8 mx-auto text-slate-300 mb-2" />
              <p className="font-semibold text-xs text-slate-600">No tickets found</p>
              <button
                onClick={() => setActiveFilter('ALL')}
                className="text-indigo-600 text-xs font-bold hover:underline mt-1 cursor-pointer"
              >
                Show all
              </button>
            </div>
          ) : (
            filteredTickets.map((ticket) => {
              const totalCents = ticket.totals ? ticket.totals.totalCents : ticket.laborCents;
              const paidCents = ticket.totals ? ticket.totals.paidCents : 0;
              const balanceCents = ticket.totals ? ticket.totals.balanceCents : totalCents;
              const subtotalCents = ticket.totals ? ticket.totals.subtotalCents : ticket.laborCents;
              const quoteState =
                ticket.quoteState ??
                deriveTicketQuoteState(ticket, { subtotalCents, totalCents, paidCents, balanceCents });
              const isPaid = isTicketPaidInFull({ totalCents, balanceCents, paidCents }, quoteState);
              const hasDeposit = !quoteState.hasPrice && paidCents > 0;
              const dueMeta = getDueDateMeta(ticket.dueDate, ticket.status);
              const deviceName = ticket.device?.name || 'Device';

              return (
                <div
                  key={ticket.id}
                  onClick={() => onSelectTicket(ticket)}
                  className={`p-4 hover:bg-indigo-50/40 active:bg-slate-100 transition-[background-color] duration-150 cursor-pointer space-y-3 ${getStatusAccentBorder(
                    ticket.status,
                    dueMeta.isOverdue
                  )}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center space-x-1.5 flex-wrap">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-indigo-50/90 text-indigo-700 font-mono font-extrabold text-xs tabular-nums border border-indigo-200/60 shadow-2xs">
                        #{ticket.ticketNumber}
                      </span>
                      {ticket.priority === 'URGENT' && (
                        <span className="px-1.5 py-0.5 rounded-lg text-[9px] bg-red-100 text-red-700 font-black uppercase">
                          URGENT
                        </span>
                      )}
                      {ticket.isWarranty && (
                        <span className="px-1.5 py-0.5 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-[9px] font-black uppercase inline-flex items-center gap-0.5">
                          <ShieldCheck className="w-2.5 h-2.5 text-blue-600" />
                          Warranty
                        </span>
                      )}
                    </div>
                    {getStatusBadge(ticket.status)}
                  </div>

                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-8 h-8 rounded-xl bg-gradient-to-br ${getAvatarGradient(
                          ticket.customer.fullName
                        )} font-bold text-xs flex items-center justify-center shrink-0 ring-2 ring-white shadow-xs`}
                      >
                        {getCustomerInitials(ticket.customer.fullName)}
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-[13px] text-slate-900 truncate">{ticket.customer.fullName}</h4>
                        <div className="text-[11px] text-slate-500 font-mono tabular-nums flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{ticket.customer.phone}</span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      {!quoteState.hasPrice && !hasDeposit ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-lg bg-amber-50 text-amber-800 border border-amber-200/80 text-[11px] font-bold">
                          Price Pending
                        </span>
                      ) : (
                        <>
                          <div className="font-mono font-extrabold text-[13px] text-slate-900 tabular-nums">
                            ${(totalCents / 100).toFixed(2)}
                          </div>
                          <div className="text-[10px] mt-0.5 tabular-nums">
                            {isPaid ? (
                              <span className="inline-flex items-center gap-1 text-emerald-700 font-bold bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/70">
                                <CheckCircle2 className="w-2.5 h-2.5" />
                                Paid
                              </span>
                            ) : hasDeposit ? (
                              <span className="text-indigo-700 font-bold">Dep ${(paidCents / 100).toFixed(2)}</span>
                            ) : (
                              <span className="text-amber-700 font-bold">Bal: ${(balanceCents / 100).toFixed(2)}</span>
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5 bg-slate-50/90 p-2.5 rounded-xl border border-slate-200/70">
                    <div
                      className={`w-7 h-7 rounded-lg border flex items-center justify-center shrink-0 ${getDeviceBadgeStyle(
                        deviceName
                      )}`}
                    >
                      {getDeviceIcon(deviceName)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-slate-900 truncate">{deviceName}</div>
                      <p className="text-[11px] text-slate-600 line-clamp-2 mt-0.5 leading-snug text-pretty">
                        {ticket.faultDescription}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10.5px] text-slate-500">
                    <div className="flex items-center gap-1.5 min-w-0">
                      {ticket.createdBy && (
                        <>
                          <UserIcon className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">
                            By <strong className="font-semibold text-slate-700">{ticket.createdBy}</strong>
                          </span>
                        </>
                      )}
                    </div>
                    <div
                      className={`inline-flex items-center gap-1 shrink-0 font-semibold tabular-nums ${
                        dueMeta.isOverdue
                          ? 'text-rose-700 bg-rose-50 px-2 py-0.5 rounded-lg border border-rose-200/80 font-bold'
                          : dueMeta.isDueSoon
                          ? 'text-amber-700'
                          : 'text-slate-600'
                      }`}
                    >
                      <Calendar className="w-3 h-3 shrink-0" />
                      <span>{dueMeta.formattedDate}</span>
                      {dueMeta.isOverdue && <span>• Overdue</span>}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                    <div>
                      {currentUser?.role === 'ADMIN' && onDeleteTicket && (
                        <button
                          type="button"
                          onClick={() => setDeletingTicket(ticket)}
                          className="px-2.5 py-1 rounded-xl border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[34px] transition-[background-color,transform] duration-150 ui-press"
                          title="Delete Ticket (Admin)"
                        >
                          <Trash2 className="w-3 h-3 text-red-600" />
                          <span>Delete</span>
                        </button>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => onOpenSmsModal(ticket)}
                        className="px-2.5 py-1 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[34px] shadow-2xs transition-[background-color,transform] duration-150 ui-press"
                      >
                        <MessageSquare className="w-3 h-3 text-blue-600" />
                        <span>SMS</span>
                      </button>
                      {ticket.status !== 'COMPLETED' && (
                        <button
                          type="button"
                          onClick={() => onQuickComplete(ticket.id)}
                          className="px-2.5 py-1 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[34px] shadow-2xs transition-[background-color,transform] duration-150 ui-press"
                        >
                          <Check className="w-3 h-3 text-emerald-600" />
                          <span>Complete</span>
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => onSelectTicket(ticket)}
                        className="px-3 py-1 rounded-xl bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer min-h-[34px] shadow-xs transition-[background-color,transform] duration-150 ui-press"
                      >
                        Open &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {pagination && pagination.totalPages > 1 && onPageChange && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white px-4 py-3 rounded-2xl border border-slate-200/80 shadow-xs text-xs">
          <span className="text-slate-600 font-medium tabular-nums">
            Page <strong className="text-slate-900">{pagination.page}</strong> of{' '}
            <strong className="text-slate-900">{pagination.totalPages}</strong> &bull;{' '}
            <strong className="text-slate-900">{pagination.total}</strong> total work orders
          </span>
          <div className="w-full sm:w-auto flex items-center gap-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="flex-1 sm:flex-initial justify-center min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold ui-press cursor-pointer transition-[background-color,transform] duration-150"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={!pagination.hasMore}
              onClick={() => onPageChange(pagination.page + 1)}
              className="flex-1 sm:flex-initial justify-center min-h-[38px] inline-flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold ui-press cursor-pointer transition-[background-color,transform] duration-150"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Confirmation Modal for Admin Ticket Deletion */}
      <ConfirmDialog
        isOpen={Boolean(deletingTicket)}
        title={deletingTicket ? `Delete Work Order #${deletingTicket.ticketNumber}?` : ''}
        message={
          deletingTicket && (
            <>
              Are you sure you want to permanently delete this work order for{' '}
              <strong className="text-slate-900">{deletingTicket.customer.fullName}</strong>? All attached
              items, payments, notes, and diagnostics will be permanently removed.
            </>
          )
        }
        confirmLabel="Yes, Delete Permanently"
        cancelLabel="No, Keep Ticket"
        requireAcknowledge={true}
        acknowledgeLabel="Yes, I am sure I want to permanently delete this work order"
        onCancel={() => setDeletingTicket(null)}
        onConfirm={() => {
          if (deletingTicket && onDeleteTicket) onDeleteTicket(deletingTicket.id);
          setDeletingTicket(null);
        }}
      />
    </div>
  );
};
