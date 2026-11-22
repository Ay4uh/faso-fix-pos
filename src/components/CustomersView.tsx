import React, { useState } from 'react';
import { Customer, Ticket } from '../types';
import {
  Search,
  User,
  Phone,
  Mail,
  MapPin,
  Calendar,
  Smartphone,
  Plus,
  ChevronRight,
  Receipt,
  MessageSquare,
  AlertTriangle,
  CreditCard,
  Award,
  ShieldCheck,
  ArrowLeft,
  ChevronLeft,
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
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  tickets,
  onOpenCreateWithCustomer,
  onSelectTicket,
  onPrintTicket,
  onOpenSmsModal,
  pagination,
  onPageChange,
  searchQuery,
  onSearchChange,
}) => {
  const [localSearch, setLocalSearch] = useState('');
  const search = searchQuery !== undefined ? searchQuery : localSearch;
  const setSearch = (val: string) => {
    if (onSearchChange) onSearchChange(val);
    else setLocalSearch(val);
  };
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const activeCustomer =
    customers.find((c) => c.id === selectedCustomerId) || (customers.length > 0 ? customers[0] : null);

  const filteredCustomers = customers.filter(
    (c) =>
      c.fullName.toLowerCase().includes(search.toLowerCase()) ||
      c.phone.includes(search) ||
      (c.altPhone && c.altPhone.includes(search)) ||
      (c.email && c.email.toLowerCase().includes(search.toLowerCase()))
  );

  const customerTickets = activeCustomer
    ? tickets.filter((t) => t.customerId === activeCustomer.id)
    : [];

  const totalSpendDollars = activeCustomer
    ? activeCustomer.totalPaidCents !== undefined
      ? activeCustomer.totalPaidCents / 100
      : customerTickets.reduce((acc, t) => acc + (t.totals ? t.totals.paidCents / 100 : 0), 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* Top Bar / Client Directory Selector */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 px-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {selectedCustomerId ? (
            <button
              onClick={() => setSelectedCustomerId(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Directory</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
              <span className="text-slate-400">Directory</span>
              <span>/</span>
              <span className="font-semibold text-slate-800">
                All Registered Clients ({pagination?.total ?? customers.length})
              </span>
            </div>
          )}
        </div>

        {/* Customer Quick Selector & Search */}
        <div className="flex items-center gap-2">
          <div className="relative w-64">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search clients..."
              className="w-full pl-8 pr-3 py-1 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
            />
          </div>

          <div className="flex items-center gap-1 overflow-x-auto max-w-xs">
            {filteredCustomers.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCustomerId(c.id)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition whitespace-nowrap ${
                  activeCustomer?.id === c.id
                    ? 'bg-indigo-600 text-white font-semibold shadow-xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {c.fullName.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeCustomer ? (
        <div className="space-y-6">
          {/* Top Breadcrumb & Live Context Banner */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-slate-500">
              <button onClick={() => setSelectedCustomerId(null)} className="hover:text-indigo-600 transition-colors">
                Directory
              </button>
              <span>/</span>
              <span className="hover:text-indigo-600 transition-colors">Clients</span>
              <span>/</span>
              <span className="text-slate-900 font-semibold font-mono">
                CUST-{activeCustomer.id.slice(0, 5).toUpperCase()} [{activeCustomer.fullName}]
              </span>
            </div>
            <div className="flex items-center gap-3">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-mono text-[11px] font-semibold border border-emerald-200/80">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                SMS Notifications Active
              </span>
              <span className="text-slate-400 font-mono text-[11px]">Bench #04</span>
            </div>
          </div>

          {/* Hero Profile Header Card */}
          <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-6 shadow-xs">
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-indigo-50/50 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                {/* Client Avatar */}
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 text-white flex items-center justify-center font-bold text-2xl shadow-md shrink-0">
                  {activeCustomer.fullName.charAt(0).toUpperCase()}
                </div>

                {/* Bio & Contact Info */}
                <div className="flex flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold text-slate-900 tracking-tight">
                      {activeCustomer.fullName}
                    </h1>
                    <span className="px-2 py-0.5 rounded bg-purple-100 text-purple-800 font-mono text-[10px] font-bold tracking-wider uppercase">
                      Client
                    </span>
                    <span className="font-mono text-xs text-slate-400">
                      ID: CUST-{activeCustomer.id.slice(0, 5).toUpperCase()}
                    </span>
                  </div>

                  <div className="flex flex-wrap items-center gap-y-1 gap-x-5 text-xs text-slate-600 pt-1">
                    <a
                      className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors font-mono font-medium text-slate-800"
                      href={`tel:${activeCustomer.phone}`}
                    >
                      <Phone className="w-3.5 h-3.5 text-indigo-600" />
                      <span>{activeCustomer.phone}</span>
                    </a>
                    {activeCustomer.email && (
                      <a
                        className="flex items-center gap-1.5 hover:text-indigo-600 transition-colors"
                        href={`mailto:${activeCustomer.email}`}
                      >
                        <Mail className="w-3.5 h-3.5 text-slate-400" />
                        <span>{activeCustomer.email}</span>
                      </a>
                    )}
                    {activeCustomer.address && (
                      <span className="flex items-center gap-1.5 text-slate-500">
                        <MapPin className="w-3.5 h-3.5 text-slate-400" />
                        <span>{activeCustomer.address}</span>
                      </span>
                    )}
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Member since {new Date(activeCustomer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                {customerTickets.length > 0 && onOpenSmsModal && (
                  <button
                    type="button"
                    onClick={() => onOpenSmsModal(customerTickets[0])}
                    className="h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>Send SMS</span>
                  </button>
                )}
                {activeCustomer.email && (
                  <button
                    type="button"
                    onClick={() => {
                      window.location.href = `mailto:${activeCustomer.email}`;
                    }}
                    className="h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                  >
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    <span>Email</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => onOpenCreateWithCustomer && onOpenCreateWithCustomer(activeCustomer)}
                  className="h-9 px-4 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1.5 hover:bg-indigo-700 transition-colors shadow-xs"
                >
                  <Plus className="w-4 h-4" />
                  <span>New Ticket</span>
                </button>
              </div>
            </div>
          </div>

          {/* Metrics Overview Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Total Repairs
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-900">
                    {customerTickets.length}
                  </span>
                  <span className="text-xs text-slate-500">tickets logged</span>
                </div>
                <span className="font-mono text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Client account verified
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600">
                <Smartphone className="w-6 h-6" />
              </div>
            </div>

            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Lifetime Spend
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-900 font-mono">
                    ${totalSpendDollars.toFixed(2)}
                  </span>
                  <span className="text-xs text-slate-500">across {customerTickets.length} repairs</span>
                </div>
                <span className="font-mono text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" /> Recorded ledger transactions
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Award className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Main Content Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 of 12 cols): Registered Devices & Real Work Orders */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Work Orders & Hardware History
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-mono text-[11px] text-slate-600 font-semibold">
                      {customerTickets.length} Work Orders
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenCreateWithCustomer && onOpenCreateWithCustomer(activeCustomer)}
                    className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>New Ticket</span>
                  </button>
                </div>

                {/* Real Tickets for this Customer */}
                {customerTickets.length === 0 ? (
                  <div className="py-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                    <p className="text-xs text-slate-400">No work orders on record for this customer yet.</p>
                  </div>
                ) : (
                  customerTickets.map((t) => (
                    <div
                      key={t.id}
                      className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-4 flex flex-col gap-3"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                            <Smartphone className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-bold text-slate-900 text-sm">
                                {t.device?.name || 'Device'}
                              </span>
                              <span
                                className={`px-2 py-0.5 rounded font-mono text-[10px] font-bold ${
                                  t.status === 'COMPLETED'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-blue-100 text-blue-800'
                                }`}
                              >
                                {t.status.replace(/_/g, ' ')}
                              </span>
                            </div>
                            <div className="flex items-center gap-2 text-slate-400 font-mono text-xs mt-0.5">
                              <span>Work Order: <strong className="text-indigo-600">#{t.ticketNumber}</strong></span>
                              {t.device?.passcode && <span>• PIN: {t.device.passcode}</span>}
                              {t.device?.pattern && <span>• Pattern: {t.device.pattern}</span>}
                            </div>
                          </div>
                        </div>

                        <div className="text-right">
                          <span className="text-base font-bold text-slate-900 font-mono">
                            ${t.totals ? (t.totals.totalCents / 100).toFixed(2) : (t.laborCents / 100).toFixed(2)}
                          </span>
                          <span className="block font-mono text-[10px] text-slate-400">Total Inc. Tax</span>
                        </div>
                      </div>

                      <div className="rounded-lg bg-white border border-slate-200 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {t.faultDescription}
                        </p>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {onPrintTicket && (
                            <button
                              type="button"
                              onClick={() => onPrintTicket(t)}
                              className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                            >
                              <Receipt className="w-3.5 h-3.5" />
                              <span>Work Order</span>
                            </button>
                          )}
                          {onSelectTicket && (
                            <button
                              type="button"
                              onClick={() => onSelectTicket(t)}
                              className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1 hover:bg-indigo-700 transition shadow-2xs"
                            >
                              <span>Workbench</span>
                              <ChevronRight className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Right Column: Account Details */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-6 flex flex-col gap-4">
                <div className="flex items-center gap-1.5 pb-2 border-b border-slate-100">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  <h3 className="text-sm font-bold text-slate-900">
                    Customer Account Summary
                  </h3>
                </div>

                <div className="space-y-2 text-xs text-slate-600">
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Primary Phone:</span>
                    <span className="font-mono font-bold text-slate-800">{activeCustomer.phone}</span>
                  </div>
                  {activeCustomer.altPhone && (
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-400">Alt Phone:</span>
                      <a
                        href={`tel:${activeCustomer.altPhone}`}
                        className="font-mono font-bold text-indigo-600 hover:underline"
                      >
                        {activeCustomer.altPhone}
                      </a>
                    </div>
                  )}
                  {activeCustomer.email && (
                    <div className="flex justify-between py-1 border-b border-slate-50">
                      <span className="text-slate-400">Email:</span>
                      <span className="text-slate-800">{activeCustomer.email}</span>
                    </div>
                  )}
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Account Age:</span>
                    <span>{new Date(activeCustomer.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-50">
                    <span className="text-slate-400">Total Work Orders:</span>
                    <span className="font-bold text-slate-900">{customerTickets.length}</span>
                  </div>
                  <div className="flex justify-between py-1">
                    <span className="text-slate-400">Total Spend:</span>
                    <span className="font-mono font-bold text-emerald-600">${totalSpendDollars.toFixed(2)}</span>
                  </div>
                </div>

                {activeCustomer.notes && (
                  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700">
                    <strong className="block text-slate-900 mb-1">Customer Note:</strong>
                    {activeCustomer.notes}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Empty State */
        <div className="py-20 text-center bg-white rounded-2xl border border-slate-200">
          <User className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">No Customer Accounts Found</h3>
          <p className="text-xs text-slate-400 mt-1">
            Create a repair ticket to automatically register your first customer account.
          </p>
        </div>
      )}

      {pagination && pagination.totalPages > 1 && onPageChange && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white px-4 py-3 rounded-xl border border-slate-200/80 shadow-xs text-xs">
          <span className="text-slate-600 font-medium">
            Page <strong className="text-slate-900">{pagination.page}</strong> of{' '}
            <strong className="text-slate-900">{pagination.totalPages}</strong> &bull;{' '}
            <strong className="text-slate-900">{pagination.total}</strong> total customers
          </span>
          <div className="flex items-center space-x-2">
            <button
              type="button"
              disabled={pagination.page <= 1}
              onClick={() => onPageChange(pagination.page - 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold transition cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              <span>Previous</span>
            </button>
            <button
              type="button"
              disabled={!pagination.hasMore}
              onClick={() => onPageChange(pagination.page + 1)}
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold transition cursor-pointer"
            >
              <span>Next</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
