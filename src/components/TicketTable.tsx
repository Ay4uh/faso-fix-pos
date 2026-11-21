import React, { useState, useEffect } from 'react';
import { Ticket, User } from '../types';
import {
  Calendar,
  Phone,
  CheckCircle2,
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

  const DUMMY_IDS = new Set([
    'tkt-test-sync-1',
    '58e737c6-f590-4e65-8e28-3541f5e277e7',
    'cd2f4c06-4d00-4364-958d-fd7bc86e35a2',
    '7070afde-bbb6-421a-af5a-7aa0639fa31d',
    '751fa998-ba4c-4104-a0a9-68718e906d5d',
  ]);
  const DUMMY_NAMES = new Set(['sarah connor', 'john wick', 'arteen', 'marcus vance']);

  const isDummy = (t: any) => {
    if (!t) return false;
    if (DUMMY_IDS.has(t.id)) return true;
    const name = (t.customer?.fullName || '').trim().toLowerCase();
    if (DUMMY_NAMES.has(name)) return true;
    return false;
  };

  const validTickets = tickets.filter((t) => !isDummy(t));
  const filteredTickets = validTickets.filter((t) => statusMatches(t.status, activeFilter));

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
                  ? 'bg-indigo-600 text-white shadow-xs font-bold'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {item.label}
              {item.id !== 'ALL' && (
                <span className="ml-1.5 opacity-80 font-bold">
                  ({validTickets.filter((t) => statusMatches(t.status, item.id)).length})
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
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-xs overflow-visible">
          {/* Desktop/Tablet Data Grid */}
          <div className="hidden sm:block overflow-x-auto overflow-y-visible">
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
                    const paidCents = ticket.totals ? ticket.totals.paidCents : 0;
                    const balanceCents = ticket.totals ? ticket.totals.balanceCents : totalCents;
                    const subtotalCents = ticket.totals ? ticket.totals.subtotalCents : ticket.laborCents;
                    const isPaid = totalCents > 0 && paidCents >= totalCents;
                    const isUnbilled = totalCents === 0 && paidCents === 0;
                    const hasDeposit = totalCents === 0 && paidCents > 0;

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
                          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                            {ticket.device?.serialNumber && (
                              <span className="text-[11px] font-mono text-slate-600 font-medium truncate max-w-[120px]">
                                SN: {ticket.device.serialNumber}
                              </span>
                            )}
                            {ticket.device?.pattern && (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-50 text-purple-700 border border-purple-200/80" title={`Pattern: ${ticket.device.pattern}`}>
                                Pattern: {ticket.device.pattern}
                              </span>
                            )}
                            {ticket.device?.passcode && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200/80" title="Device PIN available">
                                PIN
                              </span>
                            )}
                          </div>
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
                            ) : hasDeposit ? (
                              <span className="text-[10px] font-bold text-indigo-700">Deposit: ${(paidCents / 100).toFixed(2)}</span>
                            ) : isUnbilled ? (
                              <span className="text-[10px] font-medium text-slate-500">Unbilled</span>
                            ) : (
                              <span className="text-[10px] font-bold text-amber-700">
                                Bal: ${(balanceCents / 100).toFixed(2)}
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

          {/* Mobile Stacked Cards List (< sm viewports) */}
          <div className="sm:hidden divide-y divide-slate-100">
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
                const isPaid = totalCents > 0 && paidCents >= totalCents;
                const isUnbilled = totalCents === 0 && paidCents === 0;
                const hasDeposit = totalCents === 0 && paidCents > 0;

                return (
                  <div
                    key={ticket.id}
                    onClick={() => onSelectTicket(ticket)}
                    className="p-3.5 hover:bg-slate-50 active:bg-slate-100 transition cursor-pointer space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="font-mono font-bold text-xs text-indigo-600">
                          #{ticket.ticketNumber}
                        </span>
                        {ticket.priority === 'URGENT' && (
                          <span className="px-1.5 py-0.5 rounded text-[9px] bg-red-100 text-red-700 font-bold">
                            URGENT
                          </span>
                        )}
                      </div>
                      {getStatusBadge(ticket.status)}
                    </div>

                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-slate-900 truncate">{ticket.customer.fullName}</h4>
                        <div className="text-[11px] text-slate-500 font-mono flex items-center gap-1 mt-0.5">
                          <Phone className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{ticket.customer.phone}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-mono font-bold text-xs text-slate-900">
                          ${(totalCents / 100).toFixed(2)}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {isPaid ? (
                            <span className="text-emerald-600 font-bold">Paid</span>
                          ) : hasDeposit ? (
                            <span className="text-indigo-600 font-bold">Deposit ${(paidCents / 100).toFixed(2)}</span>
                          ) : isUnbilled ? (
                            <span className="text-slate-400 font-normal">Unbilled</span>
                          ) : (
                            <span>Bal: ${(balanceCents / 100).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="text-[11px] text-slate-600 bg-slate-50 p-2 rounded-lg border border-slate-100 flex items-center justify-between gap-2">
                      <span className="font-semibold text-slate-800 shrink-0">{ticket.device?.name || 'Device'}</span>
                      <span className="truncate text-slate-500 text-[10px]">{ticket.faultDescription}</span>
                    </div>

                    <div className="flex items-center justify-between pt-1" onClick={(e) => e.stopPropagation()}>
                      <div>
                        {currentUser?.role === 'ADMIN' && onDeleteTicket && (
                          <button
                            type="button"
                            onClick={() => setDeletingTicket(ticket)}
                            className="px-2.5 py-1 rounded-lg border border-red-200 bg-red-50 text-red-600 hover:bg-red-100 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[32px]"
                            title="Delete Ticket (Admin)"
                          >
                            <Trash2 className="w-3 h-3 text-red-600" />
                            <span>Delete</span>
                          </button>
                        )}
                      </div>
                      <div className="flex items-center space-x-1.5">
                        <button
                          type="button"
                          onClick={() => onOpenSmsModal(ticket)}
                          className="px-2.5 py-1 rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-100 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[32px]"
                        >
                          <MessageSquare className="w-3 h-3 text-blue-600" />
                          <span>SMS</span>
                        </button>
                        {ticket.status !== 'COMPLETED' && (
                          <button
                            type="button"
                            onClick={() => onQuickComplete(ticket.id)}
                            className="px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold flex items-center gap-1 cursor-pointer min-h-[32px]"
                          >
                            <Check className="w-3 h-3 text-emerald-600" />
                            <span>Complete</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onSelectTicket(ticket)}
                          className="px-3 py-1 rounded-lg bg-indigo-600 text-white text-xs font-bold hover:bg-indigo-700 cursor-pointer min-h-[32px]"
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

      {/* Confirmation Modal for Admin Ticket Deletion */}
      {deletingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-xl border border-red-200 animate-in zoom-in-95 duration-150">
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
