import React from 'react';
import { Ticket } from '../types';
import {
  Calendar,
  Phone,
  Eye,
  Printer,
  CheckCircle2,
  Clock,
  AlertCircle,
  Package,
  MessageSquare,
  Check,
  AlertTriangle,
} from 'lucide-react';

interface TicketTableProps {
  tickets: Ticket[];
  totalTicketsCount: number;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateStatus: (ticketId: string, newStatus: Ticket['status']) => void;
  onQuickComplete: (ticketId: string) => void;
  onOpenSmsModal: (ticket: Ticket) => void;
  onPrintTicket: (ticket: Ticket) => void;
}

export const TicketTable: React.FC<TicketTableProps> = ({
  tickets,
  totalTicketsCount,
  activeFilter,
  setActiveFilter,
  onSelectTicket,
  onUpdateStatus,
  onQuickComplete,
  onOpenSmsModal,
  onPrintTicket,
}) => {
  const getStatusBadge = (status: Ticket['status']) => {
    switch (status) {
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-100/90 text-blue-800 border border-blue-200">
            <Clock className="w-3 h-3 text-blue-600" />
            In-Progress
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-100/90 text-amber-800 border border-amber-300">
            <Package className="w-3 h-3 text-amber-600" />
            Waiting on Parts
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-100/90 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
            Completed
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-300">
            <AlertCircle className="w-3 h-3 text-slate-500" />
            Pending
          </span>
        );
    }
  };

  // Status-based row color highlighting
  const getRowHighlightClass = (status: Ticket['status']) => {
    switch (status) {
      case 'COMPLETED':
        return 'bg-emerald-50/35 hover:bg-emerald-50/70 border-l-4 border-l-emerald-500';
      case 'WAITING_ON_PARTS':
        return 'bg-amber-50/35 hover:bg-amber-50/70 border-l-4 border-l-amber-500';
      case 'IN_PROGRESS':
        return 'bg-blue-50/35 hover:bg-blue-50/70 border-l-4 border-l-blue-500';
      case 'PENDING':
      default:
        return 'bg-white hover:bg-slate-50/80 border-l-4 border-l-slate-300';
    }
  };

  // Color-coded Due Date Urgency
  const renderDueDate = (dateStr: string, status: Ticket['status']) => {
    if (status === 'COMPLETED') {
      return (
        <span className="text-slate-500 font-mono text-[11px] flex items-center gap-1">
          <Check className="w-3 h-3 text-emerald-600" />
          Delivered
        </span>
      );
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const due = new Date(dateStr);
    const dueDay = new Date(dateStr);
    dueDay.setHours(0, 0, 0, 0);

    const diffTime = dueDay.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    const formatted = due.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
    });

    if (diffDays < 0) {
      // Past due!
      return (
        <div className="flex flex-col">
          <span className="inline-flex items-center gap-1 text-red-600 font-bold font-mono text-[11px]">
            <span className="w-1.5 h-1.5 rounded-full bg-red-600 animate-ping"></span>
            {formatted}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-red-700 bg-red-100/90 px-1.5 py-0.2 rounded w-fit mt-0.5 border border-red-200">
            <AlertTriangle className="w-2.5 h-2.5" /> Overdue ({Math.abs(diffDays)}d)
          </span>
        </div>
      );
    }

    if (diffDays === 0) {
      // Due Today!
      return (
        <div className="flex flex-col">
          <span className="text-amber-700 font-bold font-mono text-[11px]">
            {formatted}
          </span>
          <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.2 rounded w-fit mt-0.5 border border-amber-200">
            Due Today
          </span>
        </div>
      );
    }

    if (diffDays === 1) {
      // Due Tomorrow
      return (
        <div className="flex flex-col">
          <span className="text-slate-700 font-semibold font-mono text-[11px]">
            {formatted}
          </span>
          <span className="text-[9px] font-semibold text-amber-700 bg-amber-50 px-1 rounded w-fit mt-0.5">
            Tomorrow
          </span>
        </div>
      );
    }

    // Future
    return (
      <span className="text-slate-600 font-mono text-[11px] flex items-center gap-1">
        <Calendar className="w-3 h-3 text-slate-400" />
        {formatted}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm overflow-hidden">
      {/* Filter Tabs Header */}
      <div className="px-5 py-3 border-b border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-50/50">
        <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto">
          <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mr-2">
            Filter:
          </span>
          <button
            onClick={() => setActiveFilter('ALL')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'ALL'
                ? 'bg-slate-900 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            All ({totalTicketsCount})
          </button>
          <button
            onClick={() => setActiveFilter('PENDING')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'PENDING'
                ? 'bg-slate-700 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Pending
          </button>
          <button
            onClick={() => setActiveFilter('IN_PROGRESS')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'IN_PROGRESS'
                ? 'bg-blue-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            In-Progress
          </button>
          <button
            onClick={() => setActiveFilter('WAITING_ON_PARTS')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'WAITING_ON_PARTS'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Waiting on Parts
          </button>
          <button
            onClick={() => setActiveFilter('COMPLETED')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              activeFilter === 'COMPLETED'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            Completed
          </button>
        </div>

        <div className="text-xs font-medium text-slate-500">
          Showing <span className="font-bold text-slate-900">{tickets.length}</span> of {totalTicketsCount} tickets
        </div>
      </div>

      {/* Responsive Data Grid */}
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              <th className="py-2.5 px-4 w-28">Ticket ID</th>
              <th className="py-2.5 px-4 w-44">Customer Name</th>
              <th className="py-2.5 px-4 w-52">Device Info</th>
              <th className="py-2.5 px-4 min-w-[220px]">Fault Description</th>
              <th className="py-2.5 px-4 w-32">Due Date</th>
              <th className="py-2.5 px-4 w-28">Est. Price</th>
              <th className="py-2.5 px-4 w-36">Status</th>
              <th className="py-2.5 px-4 w-36 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 text-xs">
            {tickets.length === 0 ? (
              <tr>
                <td colSpan={8} className="py-16 text-center">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center text-slate-400">
                      <Clock className="w-6 h-6 text-slate-400" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-700">No Repair Tickets in Queue</h3>
                    <p className="text-xs text-slate-400 max-w-sm">
                      All dummy records have been removed. Intake a customer device using &ldquo;+ Create Ticket&rdquo; to start tracking live work orders.
                    </p>
                  </div>
                </td>
              </tr>
            ) : (
              tickets.map((t) => (
                <tr
                  key={t.id}
                  className={`transition-colors group ${getRowHighlightClass(t.status)}`}
                >
                  {/* Ticket ID */}
                  <td className="py-2.5 px-4 font-mono font-bold text-indigo-600 whitespace-nowrap">
                    <button
                      onClick={() => onSelectTicket(t)}
                      className="hover:underline cursor-pointer"
                    >
                      #{t.ticketNumber}
                    </button>
                  </td>

                  {/* Customer Info */}
                  <td className="py-2.5 px-4">
                    <div className="font-semibold text-slate-900 leading-tight">
                      {t.customer.fullName}
                    </div>
                    <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                      <Phone className="w-2.5 h-2.5 text-slate-400" />
                      {t.customer.phone}
                    </div>
                  </td>

                  {/* Device Info */}
                  <td className="py-2.5 px-4">
                    <div className="font-bold text-slate-900 leading-tight">
                      {t.device?.name || 'Device'}
                    </div>
                    {t.device?.serialNumber && (
                      <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                        {t.device.serialNumber}
                      </div>
                    )}
                  </td>

                  {/* Fault Description (2-line wrap) */}
                  <td className="py-2.5 px-4 text-slate-600 line-clamp-2 max-w-xs leading-relaxed">
                    {t.faultDescription}
                  </td>

                  {/* Due Date with Color-Coded Urgency */}
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {renderDueDate(t.dueDate, t.status)}
                  </td>

                  {/* Price */}
                  <td className="py-2.5 px-4 font-bold text-slate-900 font-mono whitespace-nowrap">
                    ${((t.totals ? t.totals.totalCents : t.laborCents) / 100).toFixed(2)}
                  </td>

                  {/* Status Badge */}
                  <td className="py-2.5 px-4 whitespace-nowrap">
                    {getStatusBadge(t.status)}
                  </td>

                  {/* Quick Action Icons & Dropdown */}
                  <td className="py-2.5 px-4 text-right whitespace-nowrap">
                    <div className="inline-flex items-center gap-1.5 justify-end">
                      {/* 1-Click Quick Complete Button */}
                      {t.status !== 'COMPLETED' ? (
                        <button
                          onClick={() => onQuickComplete(t.id)}
                          className="p-1.5 text-emerald-600 bg-emerald-50 hover:bg-emerald-600 hover:text-white rounded border border-emerald-200 transition-all cursor-pointer"
                          title="1-Click Mark Completed"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                      ) : (
                        <span className="p-1.5 text-slate-300">
                          <Check className="w-3.5 h-3.5" />
                        </span>
                      )}

                      {/* 1-Click Send Customer SMS Icon */}
                      <button
                        onClick={() => onOpenSmsModal(t)}
                        className="p-1.5 text-blue-600 bg-blue-50 hover:bg-blue-600 hover:text-white rounded border border-blue-200 transition-all cursor-pointer"
                        title="Send Customer SMS Update"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                      </button>

                      {/* Fast status switcher dropdown */}
                      <select
                        value={t.status}
                        onChange={(e) => onUpdateStatus(t.id, e.target.value as any)}
                        className="bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-[11px] font-semibold rounded py-1 px-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500 cursor-pointer"
                        title="Change Status"
                      >
                        <option value="PENDING">Pending</option>
                        <option value="IN_PROGRESS">In-Progress</option>
                        <option value="WAITING_ON_PARTS">Waiting on Parts</option>
                        <option value="COMPLETED">Completed</option>
                      </select>

                      {/* View details */}
                      <button
                        onClick={() => onSelectTicket(t)}
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded transition-colors"
                        title="View Full Details & History"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      {/* Print work order */}
                      <button
                        onClick={() => onPrintTicket(t)}
                        className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded transition-colors"
                        title="Print Work Order Tag"
                      >
                        <Printer className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
};
