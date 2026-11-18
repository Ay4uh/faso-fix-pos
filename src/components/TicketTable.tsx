import React, { useState, useEffect } from 'react';
import { Ticket, User } from '../types';
import {
  Calendar,
  Phone,
  CheckCircle2,
  Clock,
  Check,
  Inbox,
  ExternalLink,
  MessageSquare,
  MoreVertical,
  Printer,
  Pencil,
  Trash2,
} from 'lucide-react';

interface TicketTableProps {
  tickets: Ticket[];
  totalTicketsCount: number;
  activeFilter: string;
  setActiveFilter: (filter: string) => void;
  viewMode?: 'list' | 'kanban';
  currentUser?: User | null;
  onSelectTicket: (ticket: Ticket) => void;
  onUpdateStatus: (ticketId: string, newStatus: Ticket['status']) => void;
  onQuickComplete: (ticketId: string) => void;
  onOpenSmsModal: (ticket: Ticket) => void;
  onPrintTicket: (ticket: Ticket) => void;
  onDeleteTicket?: (ticketId: string) => void;
}

export const TicketTable: React.FC<TicketTableProps> = ({
  tickets,
  totalTicketsCount,
  activeFilter,
  setActiveFilter,
  viewMode = 'list',
  currentUser,
  onSelectTicket,
  onUpdateStatus,
  onQuickComplete,
  onOpenSmsModal,
  onPrintTicket,
  onDeleteTicket,
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
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-50 text-blue-700 border border-blue-200 ring-1 ring-blue-600/10">
            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse mr-1.5"></span>
            Diagnosing
          </span>
        );
      case 'WAITING_ON_APPROVAL':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-50 text-purple-700 border border-purple-200 ring-1 ring-purple-600/10">
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 mr-1.5"></span>
            Waiting on Approval
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 ring-1 ring-amber-600/10">
            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 mr-1.5"></span>
            Waiting on Part
          </span>
        );
      case 'READY_FOR_PICKUP':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-teal-50 text-teal-800 border border-teal-200 ring-1 ring-teal-600/10">
            <span className="w-1.5 h-1.5 rounded-full bg-teal-500 mr-1.5"></span>
            Ready for Pickup
          </span>
        );
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 ring-1 ring-emerald-600/10">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 mr-1.5"></span>
            Completed / Paid
          </span>
        );
      case 'CHECKED_IN':
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200 ring-1 ring-slate-600/10">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-500 mr-1.5"></span>
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

  const filteredTickets = tickets.filter((t) => statusMatches(t.status, activeFilter));

  const filterPills = [
    { id: 'ALL', label: 'All' },
    { id: 'CHECKED_IN', label: 'Checked In' },
    { id: 'DIAGNOSING', label: 'Diagnosing' },
    { id: 'WAITING_ON_APPROVAL', label: 'Waiting Approval' },
    { id: 'WAITING_ON_PARTS', label: 'Waiting on Part' },
    { id: 'READY_FOR_PICKUP', label: 'Ready for Pickup' },
    { id: 'COMPLETED', label: 'Completed / Paid' },
  ];

  return (
    <div className="space-y-3.5">
      {/* Filter Toolbar with linear status flow */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center space-x-1.5 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-semibold text-slate-500 mr-1 whitespace-nowrap">Status Flow:</span>
          {filterPills.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveFilter(item.id)}
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                activeFilter === item.id
                  ? 'bg-slate-900 text-white shadow-xs font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
              {item.id !== 'ALL' && (
                <span className="ml-1.5 opacity-80 font-bold">
                  ({tickets.filter((t) => statusMatches(t.status, item.id)).length})
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="flex items-center space-x-2 text-xs text-slate-600 font-medium whitespace-nowrap">
          <span>
            Showing <strong className="text-slate-900">{filteredTickets.length}</strong> of {totalTicketsCount} tickets
          </span>
        </div>
      </div>

      {/* ===================== LIST VIEW (HIGH DENSITY DATA GRID) ===================== */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-visible">
          <div className="overflow-x-auto overflow-y-visible">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3.5">Ticket ID</th>
                  <th className="py-2.5 px-3.5">Customer Name</th>
                  <th className="py-2.5 px-3.5">Device Info</th>
                  <th className="py-2.5 px-3.5">Fault Description</th>
                  <th className="py-2.5 px-3.5">Due Date</th>
                  <th className="py-2.5 px-3.5">
                    <div className="flex flex-col">
                      <span>Total (Inc. Tax)</span>
                      <span className="text-[10px] text-slate-500 normal-case font-medium">Pre-tax subtotal</span>
                    </div>
                  </th>
                  <th className="py-2.5 px-3.5">Status</th>
                  <th className="py-2.5 px-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
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
                    const subtotalCents = ticket.totals ? ticket.totals.subtotalCents : ticket.laborCents;
                    const isPaid = ticket.totals?.balanceCents === 0;

                    return (
                      <tr
                        key={ticket.id}
                        onClick={() => onSelectTicket(ticket)}
                        className="hover:bg-slate-50/80 transition-colors group cursor-pointer"
                      >
                        {/* Ticket ID */}
                        <td className="py-2 px-3.5 font-mono font-bold text-indigo-600 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5">
                            <span>#{ticket.ticketNumber}</span>
                            {ticket.priority === 'URGENT' && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="Urgent Priority"></span>
                            )}
                          </div>
                        </td>

                        {/* Customer */}
                        <td className="py-2 px-3.5">
                          <div className="font-bold text-slate-900 leading-tight">{ticket.customer.fullName}</div>
                          <div className="text-[11px] text-slate-600 font-mono font-medium flex items-center gap-1 mt-0.5">
                            <Phone className="w-3 h-3 text-slate-500 shrink-0" />
                            <span>{ticket.customer.phone}</span>
                          </div>
                        </td>

                        {/* Device */}
                        <td className="py-2 px-3.5">
                          <div className="font-bold text-slate-900 leading-tight">{ticket.device?.name || 'Device'}</div>
                          {ticket.device?.serialNumber && (
                            <div className="text-[11px] font-mono text-slate-600 font-medium truncate max-w-[130px] mt-0.5">
                              SN: {ticket.device.serialNumber}
                            </div>
                          )}
                        </td>

                        {/* Fault */}
                        <td className="py-2 px-3.5 max-w-xs">
                          <p className="text-slate-700 font-normal line-clamp-1 leading-snug" title={ticket.faultDescription}>
                            {ticket.faultDescription}
                          </p>
                        </td>

                        {/* Due Date */}
                        <td className="py-2 px-3.5 whitespace-nowrap">
                          <div className="flex items-center space-x-1.5 text-slate-700 font-medium text-xs">
                            <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            <span>
                              {ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : 'Pending'}
                            </span>
                          </div>
                        </td>

                        {/* Price: Explicit Before-Tax vs After-Tax with dark readable contrast */}
                        <td className="py-2 px-3.5 whitespace-nowrap">
                          <div className="flex flex-col">
                            <span className="font-bold text-slate-900 font-mono text-xs">
                              ${(totalCents / 100).toFixed(2)}
                            </span>
                            <span className="text-[11px] text-slate-600 font-mono font-medium">
                              Pre-tax: ${(subtotalCents / 100).toFixed(2)}
                            </span>
                            {isPaid ? (
                              <span className="text-[10px] font-bold text-emerald-700">Paid in full</span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700">
                                Bal: ${((ticket.totals?.balanceCents ?? totalCents) / 100).toFixed(2)}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Status Badge */}
                        <td className="py-2 px-3.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="relative inline-block">{getStatusBadge(ticket.status)}</div>
                        </td>

                        {/* Actions: Quick Icon Buttons + 3-Dot (Kebab) Menu */}
                        <td className="py-2 px-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-end space-x-1">
                            {/* 1. Quick Complete Checkmark */}
                            {ticket.status !== 'COMPLETED' ? (
                              <button
                                onClick={() => onQuickComplete(ticket.id)}
                                className="p-1.5 text-slate-500 hover:text-emerald-600 rounded-md hover:bg-emerald-50 transition cursor-pointer"
                                title="Quick mark Complete"
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="p-1.5 text-emerald-600" title="Completed">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                              </span>
                            )}

                            {/* 2. Message Customer Quick Action */}
                            <button
                              onClick={() => onOpenSmsModal(ticket)}
                              className="p-1.5 text-slate-500 hover:text-blue-600 rounded-md hover:bg-blue-50 transition cursor-pointer"
                              title="Message Customer (SMS)"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                            </button>

                            {/* 3. Edit / Open Details Quick Action */}
                            <button
                              onClick={() => onSelectTicket(ticket)}
                              className="p-1.5 text-slate-500 hover:text-indigo-600 rounded-md hover:bg-indigo-50 transition cursor-pointer"
                              title="Edit / Open Work Order"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>

                            {/* 4. 3-Dot (Kebab) Menu for Secondary Tasks */}
                            <div className="relative inline-block text-left">
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setOpenMenuTicketId(openMenuTicketId === ticket.id ? null : ticket.id);
                                }}
                                className="p-1.5 text-slate-400 hover:text-slate-700 rounded-md hover:bg-slate-100 transition cursor-pointer"
                                title="More options"
                              >
                                <MoreVertical className="w-3.5 h-3.5" />
                              </button>

                              {openMenuTicketId === ticket.id && (
                                <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-xl border border-slate-200 py-1 z-50 text-left animate-in fade-in duration-100">
                                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                                    Set Linear Status
                                  </div>
                                  <button
                                    onClick={() => {
                                      onUpdateStatus(ticket.id, 'CHECKED_IN');
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-slate-400"></span>
                                    1. Checked In
                                  </button>
                                  <button
                                    onClick={() => {
                                      onUpdateStatus(ticket.id, 'DIAGNOSING');
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                                    2. Diagnosing
                                  </button>
                                  <button
                                    onClick={() => {
                                      onUpdateStatus(ticket.id, 'WAITING_ON_APPROVAL');
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                                    3. Waiting on Approval
                                  </button>
                                  <button
                                    onClick={() => {
                                      onUpdateStatus(ticket.id, 'WAITING_ON_PARTS');
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                                    4. Waiting on Part
                                  </button>
                                  <button
                                    onClick={() => {
                                      onUpdateStatus(ticket.id, 'READY_FOR_PICKUP');
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-teal-500"></span>
                                    5. Ready for Pickup
                                  </button>
                                  <button
                                    onClick={() => {
                                      onUpdateStatus(ticket.id, 'COMPLETED');
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                                    6. Completed / Paid
                                  </button>

                                  <div className="border-t border-slate-100 my-1"></div>

                                  <button
                                    onClick={() => {
                                      onPrintTicket(ticket);
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <Printer className="w-3.5 h-3.5 text-slate-400" />
                                    Print Work Order
                                  </button>
                                  <button
                                    onClick={() => {
                                      onSelectTicket(ticket);
                                      setOpenMenuTicketId(null);
                                    }}
                                    className="w-full text-left px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                                  >
                                    <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
                                    Open Full Ticket
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
                                        className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center justify-between cursor-pointer font-semibold"
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
        </div>
      )}

      {/* ===================== KANBAN BOARD VIEW (6-Stage Linear Pipeline) ===================== */}
      {viewMode === 'kanban' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3.5 overflow-x-auto pb-4">
          {(
            [
              { id: 'CHECKED_IN', label: 'Checked In', dot: 'bg-slate-400', match: (s: string) => s === 'CHECKED_IN' || s === 'PENDING' },
              { id: 'DIAGNOSING', label: 'Diagnosing', dot: 'bg-blue-500 animate-pulse', match: (s: string) => s === 'DIAGNOSING' || s === 'IN_PROGRESS' },
              { id: 'WAITING_ON_APPROVAL', label: 'Waiting Approval', dot: 'bg-purple-500', match: (s: string) => s === 'WAITING_ON_APPROVAL' },
              { id: 'WAITING_ON_PARTS', label: 'Waiting on Part', dot: 'bg-amber-500', match: (s: string) => s === 'WAITING_ON_PARTS' },
              { id: 'READY_FOR_PICKUP', label: 'Ready for Pickup', dot: 'bg-teal-500', match: (s: string) => s === 'READY_FOR_PICKUP' },
              { id: 'COMPLETED', label: 'Completed / Paid', dot: 'bg-emerald-500', match: (s: string) => s === 'COMPLETED' },
            ] as const
          ).map((lane) => {
            const laneTickets = tickets.filter((t) => lane.match(t.status));

            return (
              <div key={lane.id} className="bg-slate-100/80 rounded-xl p-3 border border-slate-200 flex flex-col min-w-[210px]">
                {/* Column Header */}
                <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-200">
                  <div className="flex items-center space-x-1.5 truncate">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${lane.dot}`}></span>
                    <h4 className="font-bold text-[11px] text-slate-800 uppercase tracking-wider truncate">{lane.label}</h4>
                  </div>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-white text-slate-700 font-bold border border-slate-200 shadow-2xs shrink-0">
                    {laneTickets.length}
                  </span>
                </div>

                {/* Card Stack */}
                <div className="space-y-2.5 flex-1 overflow-y-auto max-h-[640px] pr-0.5">
                  {laneTickets.length === 0 ? (
                    <div className="text-center py-6 text-slate-400 text-[11px] italic bg-white/50 rounded-lg border border-dashed border-slate-300">
                      Empty
                    </div>
                  ) : (
                    laneTickets.map((ticket) => {
                      const totalCents = ticket.totals ? ticket.totals.totalCents : ticket.laborCents;
                      const subtotalCents = ticket.totals ? ticket.totals.subtotalCents : ticket.laborCents;

                      return (
                        <div
                          key={ticket.id}
                          onClick={() => onSelectTicket(ticket)}
                          className="bg-white p-3 rounded-lg border border-slate-200/90 shadow-2xs hover:shadow-md hover:border-indigo-300 transition cursor-pointer space-y-2"
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-mono font-bold text-indigo-600">
                              #{ticket.ticketNumber}
                            </span>
                            <div className="text-right">
                              <span className="text-xs font-mono font-bold text-slate-900 block">
                                ${(totalCents / 100).toFixed(2)}
                              </span>
                              <span className="text-[10px] font-mono text-slate-500 font-medium block">
                                Pre-tax: ${(subtotalCents / 100).toFixed(2)}
                              </span>
                            </div>
                          </div>

                          <div>
                            <h5 className="text-xs font-bold text-slate-900 leading-tight">{ticket.customer.fullName}</h5>
                            <p className="text-[11px] font-semibold text-slate-700 mt-0.5">{ticket.device?.name || 'Device'}</p>
                          </div>

                          <p className="text-[11px] text-slate-600 line-clamp-2 leading-tight bg-slate-50 p-1.5 rounded border border-slate-100">
                            {ticket.faultDescription}
                          </p>

                          <div className="pt-1.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-500">
                            <span className="flex items-center space-x-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              <span>{ticket.dueDate ? new Date(ticket.dueDate).toLocaleDateString() : 'N/A'}</span>
                            </span>
                            <span className="text-indigo-600 font-bold hover:underline">
                              View →
                            </span>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Confirmation Modal for Admin Ticket Deletion */}
      {deletingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-red-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Delete Work Order #{deletingTicket.ticketNumber}?
              </h3>
              <p className="text-xs text-slate-500">
                This action is restricted to Administrators. Are you sure you want to remove this work order for <strong className="text-slate-800">{deletingTicket.customer.fullName}</strong>?
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setDeletingTicket(null)}
                className="flex-1 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  if (onDeleteTicket) onDeleteTicket(deletingTicket.id);
                  setDeletingTicket(null);
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
