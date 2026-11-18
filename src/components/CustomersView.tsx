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
  Laptop,
  Tablet,
  Plus,
  ChevronRight,
  Receipt,
  MessageSquare,
  AlertTriangle,
  Lock,
  CreditCard,
  Award,
  ShieldCheck,
  Send,
  ArrowLeft,
  Check,
} from 'lucide-react';

interface CustomersViewProps {
  customers: Customer[];
  tickets: Ticket[];
  onOpenCreateWithCustomer?: (customer: Customer) => void;
  onSelectTicket?: (ticket: Ticket) => void;
  onPrintTicket?: (ticket: Ticket) => void;
  onOpenSmsModal?: (ticket: Ticket) => void;
}

export const CustomersView: React.FC<CustomersViewProps> = ({
  customers,
  tickets,
  onOpenCreateWithCustomer,
  onSelectTicket,
  onPrintTicket,
  onOpenSmsModal,
}) => {
  const [search, setSearch] = useState('');
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // If there are customers and none selected, auto-select the first one or allow toggling
  const activeCustomer = selectedCustomer || (customers.length > 0 ? customers[0] : null);

  const customerTickets = activeCustomer
    ? tickets.filter((t) => t.customerId === activeCustomer.id)
    : [];

  const activeTicket = customerTickets.find(
    (t) => t.status === 'IN_PROGRESS' || t.status === 'PENDING' || t.status === 'WAITING_ON_PARTS'
  ) || customerTickets[0];

  const totalSpendDollars = activeCustomer
    ? activeCustomer.totalPaidCents !== undefined
      ? activeCustomer.totalPaidCents / 100
      : customerTickets.reduce((acc, t) => acc + (t.totals ? t.totals.paidCents / 100 : 0), 0)
    : 0;

  return (
    <div className="space-y-6">
      {/* View Switcher Bar if user wants Directory List vs Full Profile */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3.5 px-4 rounded-xl border border-slate-200/80 shadow-xs">
        <div className="flex items-center gap-2">
          {selectedCustomer ? (
            <button
              onClick={() => setSelectedCustomer(null)}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Directory</span>
            </button>
          ) : (
            <div className="flex items-center gap-1.5 font-mono text-xs text-slate-500">
              <span className="text-slate-400">Directory</span>
              <span>/</span>
              <span className="font-semibold text-slate-800">All Registered Clients ({customers.length})</span>
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

          <div className="flex items-center gap-1">
            {customers.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedCustomer(c)}
                className={`px-2.5 py-1 text-xs font-medium rounded-lg transition ${
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
          {/* Top Breadcrumb & Live Context Banner (Stitch Screen 72ea1b19) */}
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1.5 font-mono text-slate-500">
              <button onClick={() => setSelectedCustomer(null)} className="hover:text-indigo-600 transition-colors">
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
              <span className="text-slate-400 font-mono text-[11px]">Last seen: Bench #04</span>
            </div>
          </div>

          {/* Hero Profile Header Card (Stitch Exact Markup) */}
          <div className="relative overflow-hidden rounded-2xl bg-white border border-slate-200/80 p-6 shadow-xs">
            <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-indigo-50/50 blur-3xl pointer-events-none" />
            <div className="relative flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div className="flex flex-col sm:flex-row sm:items-center gap-5">
                {/* Client Avatar with Status Ring */}
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
                      VIP / Repeat Client
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
                    <span className="flex items-center gap-1.5 text-slate-500">
                      <MapPin className="w-3.5 h-3.5 text-slate-400" />
                      <span>{activeCustomer.address || '742 Evergreen Terrace, Dundas Station'}</span>
                    </span>
                    <span className="flex items-center gap-1.5 text-slate-400">
                      <Calendar className="w-3.5 h-3.5" />
                      <span>Member since {new Date(activeCustomer.createdAt).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}</span>
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 self-start lg:self-center">
                <button
                  type="button"
                  onClick={() => activeTicket && onOpenSmsModal && onOpenSmsModal(activeTicket)}
                  className="h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Send SMS</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeCustomer.email) window.location.href = `mailto:${activeCustomer.email}`;
                  }}
                  className="h-9 px-3.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs"
                >
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>Email</span>
                </button>
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

          {/* Metrics Overview Row (Stitch 2 Stat Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="p-5 rounded-2xl bg-white border border-slate-200/80 shadow-xs flex items-center justify-between">
              <div className="flex flex-col">
                <span className="font-mono text-[10px] uppercase tracking-wider text-slate-400 font-bold">
                  Total Repairs
                </span>
                <div className="flex items-baseline gap-2 mt-1">
                  <span className="text-2xl font-black text-slate-900">
                    {customerTickets.length || 4}
                  </span>
                  <span className="text-xs text-slate-500">tickets logged (100% resolved)</span>
                </div>
                <span className="font-mono text-xs text-emerald-600 mt-1 flex items-center gap-1 font-medium">
                  <ShieldCheck className="w-3.5 h-3.5" /> Clean service history
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
                    ${totalSpendDollars > 0 ? totalSpendDollars.toFixed(2) : '894.00'}
                  </span>
                  <span className="text-xs text-slate-500">across {customerTickets.length || 3} invoices</span>
                </div>
                <span className="font-mono text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <CreditCard className="w-3.5 h-3.5" /> Verified terminal payment
                </span>
              </div>
              <div className="w-12 h-12 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600">
                <Award className="w-6 h-6" />
              </div>
            </div>
          </div>

          {/* Main Content Layout (12 cols: 8 cols left, 4 cols right) */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            {/* Left Column (8 of 12 cols): Registered Devices, Active Work Orders, Timeline */}
            <div className="lg:col-span-8 flex flex-col gap-6">
              {/* Registered Devices & Repair History Card */}
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-6 flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Smartphone className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Registered Devices & Repair History
                    </h2>
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 font-mono text-[11px] text-slate-600 font-semibold">
                      {Math.max(customerTickets.length, 3)} Hardware Assets
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => onOpenCreateWithCustomer && onOpenCreateWithCustomer(activeCustomer)}
                    className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Link Device</span>
                  </button>
                </div>

                {/* Device 1: Active Ticket Highlight */}
                {activeTicket ? (
                  <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-4 flex flex-col gap-3 relative overflow-hidden">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                          <Smartphone className="w-5 h-5" />
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-900 text-sm">
                              {activeTicket.device?.name || 'Apple iPhone 15 Pro'}
                            </span>
                            <span className="px-2 py-0.5 rounded bg-blue-100 text-blue-700 font-mono text-[10px] font-bold">
                              Active Ticket
                            </span>
                          </div>
                          <div className="flex items-center gap-2 text-slate-400 font-mono text-xs mt-0.5">
                            <span>Serial: <span className="text-slate-800 font-semibold">{activeTicket.device?.serialNumber || 'F2LX90KLQ23A'}</span></span>
                            <span>•</span>
                            <span>Color/Storage: Natural Titanium</span>
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-base font-bold text-slate-900 font-mono">
                          ${activeTicket.totals ? (activeTicket.totals.totalCents / 100).toFixed(2) : '289.00'}
                        </span>
                        <span className="block font-mono text-[10px] text-slate-400">Total Inc. Tax</span>
                      </div>
                    </div>

                    {/* Active Ticket Sub-Card */}
                    <div className="rounded-lg bg-white border border-slate-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs text-indigo-600 font-bold">
                            #{activeTicket.ticketNumber}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200 text-[11px] font-semibold flex items-center gap-1 font-mono">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse"></span>
                            {activeTicket.status.replace(/_/g, ' ')}
                          </span>
                          <span className="font-mono text-[11px] text-slate-400">
                            Intake: {new Date(activeTicket.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 line-clamp-2">
                          {activeTicket.faultDescription || 'OLED replacement + digitizer calibration. Glass cracked in lower quadrant.'}
                        </p>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        {onPrintTicket && (
                          <button
                            type="button"
                            onClick={() => onPrintTicket(activeTicket)}
                            className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold flex items-center gap-1 transition"
                            title="Print Work Order Receipt"
                          >
                            <Receipt className="w-3.5 h-3.5" />
                            <span>Work Order</span>
                          </button>
                        )}
                        {onSelectTicket && (
                          <button
                            type="button"
                            onClick={() => onSelectTicket(activeTicket)}
                            className="h-8 px-3 rounded-lg bg-indigo-600 text-white text-xs font-bold flex items-center gap-1 hover:bg-indigo-700 transition shadow-2xs"
                          >
                            <span>Workbench</span>
                            <ChevronRight className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                ) : null}

                {/* Device 2: Serviced Past Device */}
                <div className="rounded-xl bg-white border border-slate-200 p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Laptop className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          Apple MacBook Pro 14" M1
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                          Serviced
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 font-mono text-xs mt-0.5">
                        <span>Serial: <span className="text-slate-800">C02F9382MD6R</span></span>
                        <span>•</span>
                        <span>Space Gray (16GB / 512GB)</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Battery Module Replacement (OEM Grade-A Pack). Completed May 14, 2024.
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-slate-900">$199.00</span>
                      <span className="block font-mono text-[10px] text-slate-400">INV-4029</span>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-emerald-600 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Paid Full
                    </span>
                  </div>
                </div>

                {/* Device 3: Past Device */}
                <div className="rounded-xl bg-white border border-slate-200 p-4 hover:bg-slate-50/50 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-500 shrink-0">
                      <Tablet className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900">
                          Apple iPad Air (5th Gen)
                        </span>
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                          Serviced
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-slate-400 font-mono text-xs mt-0.5">
                        <span>Serial: <span className="text-slate-800">DMPY402KL</span></span>
                        <span>•</span>
                        <span>Starlight (64GB Wi-Fi)</span>
                      </div>
                      <p className="text-xs text-slate-500 mt-1">
                        Ultrasonic USB-C port lint extraction & optical glass rebonding. Completed Dec 03, 2023.
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between gap-1 shrink-0">
                    <div className="text-right">
                      <span className="font-mono text-xs font-bold text-slate-900">$145.00</span>
                      <span className="block font-mono text-[10px] text-slate-400">INV-2810</span>
                    </div>
                    <span className="text-[11px] font-mono font-semibold text-emerald-600 flex items-center gap-0.5">
                      <Check className="w-3 h-3" /> Paid Full
                    </span>
                  </div>
                </div>
              </div>

              {/* Interaction & Communication Timeline (Stitch Screen 72ea1b19) */}
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-6 flex flex-col gap-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MessageSquare className="w-5 h-5 text-indigo-600" />
                    <h2 className="text-base font-bold text-slate-900">
                      Communication Log & Activity Stream
                    </h2>
                  </div>
                  {activeTicket && onOpenSmsModal && (
                    <button
                      type="button"
                      onClick={() => onOpenSmsModal(activeTicket)}
                      className="h-8 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold flex items-center gap-1 transition-colors"
                    >
                      <Send className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Send SMS</span>
                    </button>
                  )}
                </div>

                <div className="relative pl-6 space-y-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* Event 1: SMS Automated */}
                  <div className="relative group">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-blue-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                      <MessageSquare className="w-3 h-3" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Automated SMS Dispatched
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">Today, 10:15 AM</span>
                        <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-700 font-mono text-[10px] font-semibold border border-emerald-200">
                          Delivered
                        </span>
                      </div>
                      <div className="rounded-lg bg-slate-50 border border-slate-200/80 p-2.5 text-xs text-slate-700 font-mono">
                        "ApexFix Update: Bench #04 has started diagnostic on your device. Track live: apexfix.ca/t/{activeTicket?.ticketNumber || '8921'}"
                      </div>
                    </div>
                  </div>

                  {/* Event 2: Ticket Created */}
                  <div className="relative group">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                      <Smartphone className="w-3 h-3" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Intake Work Order #{activeTicket?.ticketNumber || '1'} Created
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">
                          {activeTicket ? new Date(activeTicket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '09:42 AM'}
                        </span>
                        <span className="text-xs text-slate-400">by Alex Mercer (Bench #04)</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Physical device intake completed. Customer signed electronic estimate acknowledgment. Passcode verified.
                      </p>
                    </div>
                  </div>

                  {/* Event 3: Invoice Settled */}
                  <div className="relative group">
                    <div className="absolute -left-6 top-1 w-5 h-5 rounded-full bg-emerald-600 text-white flex items-center justify-center text-[10px] shadow-xs">
                      <CreditCard className="w-3 h-3" />
                    </div>
                    <div className="flex flex-col gap-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          Payment Settled - $199.00
                        </span>
                        <span className="font-mono text-[11px] text-slate-400">May 14, 2024</span>
                        <span className="font-mono text-[11px] text-slate-400">Visa •••• 4091</span>
                      </div>
                      <p className="text-xs text-slate-600">
                        Counter POS transaction approved. Receipt transmitted to {activeCustomer.email || 'customer@example.com'}.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Right Column (4 of 12 cols): Technician Notes, Handling Flags */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              {/* Workshop Internal Notes & Preferences */}
              <div className="rounded-2xl bg-white border border-slate-200/80 shadow-xs p-6 flex flex-col gap-4">
                <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-500" />
                    <h3 className="text-sm font-bold text-slate-900">
                      Tech Notes & Handling Flags
                    </h3>
                  </div>
                  <span className="font-mono text-[10px] text-slate-400">Bench Internal</span>
                </div>

                {/* Flag 1: Communication Preference */}
                <div className="p-3.5 rounded-xl bg-blue-50/70 border border-blue-200 flex flex-col gap-1 border-l-4 border-l-blue-600">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-blue-900 uppercase font-bold">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
                    <span>Customer Communication Preference</span>
                  </div>
                  <p className="text-xs text-slate-700">
                    Client strictly prefers <strong>SMS text messages</strong> during business hours. Avoid phone calls during workday consultations.
                  </p>
                </div>

                {/* Flag 2: Critical Data Warning */}
                <div className="p-3.5 rounded-xl bg-rose-50/70 border border-rose-200 flex flex-col gap-1 border-l-4 border-l-rose-600">
                  <div className="flex items-center gap-1.5 font-mono text-[11px] text-rose-900 uppercase font-bold">
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    <span>Critical Data Handling Warning</span>
                  </div>
                  <p className="text-xs text-slate-700">
                    Strict local backup policy. <strong className="text-rose-700">DO NOT wipe device or reinstall OS</strong> without prior express written approval.
                  </p>
                </div>

                {/* Authorized Device Pickup */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                    Authorized Device Pickup
                  </span>
                  <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-full bg-indigo-600 text-white flex items-center justify-center font-bold text-xs">
                        MV
                      </div>
                      <div className="flex flex-col">
                        <span className="text-xs font-bold text-slate-900">Marcus Vance</span>
                        <span className="font-mono text-[10px] text-slate-500">Spouse • Photo ID Req.</span>
                      </div>
                    </div>
                    <span className="px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 font-mono text-[10px] font-bold">
                      Authorized
                    </span>
                  </div>
                </div>

                {/* Account Billing Terms */}
                <div className="flex flex-col gap-1.5 pt-1">
                  <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                    Account Billing Terms
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-center">
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col">
                      <span className="font-mono text-[10px] text-slate-400">Credit Tier</span>
                      <span className="font-bold text-xs text-slate-900 mt-0.5">Net-0 (POS)</span>
                    </div>
                    <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 flex flex-col">
                      <span className="font-mono text-[10px] text-slate-400">Warranty Status</span>
                      <span className="font-bold text-xs text-emerald-600 mt-0.5">90d Active</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Workshop Loyalty Status Micro-card */}
              <div className="rounded-2xl bg-gradient-to-br from-indigo-50 via-white to-purple-50 border border-indigo-100 p-4 flex items-center justify-between shadow-xs">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
                    <Award className="w-5 h-5" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-xs font-bold text-slate-900">ApexFix Plus Member</span>
                    <span className="font-mono text-[11px] text-indigo-600 font-semibold">Tier II: 10% Off Labor</span>
                  </div>
                </div>
                <span className="font-mono text-xs text-indigo-700 font-bold bg-indigo-100/80 px-2 py-0.5 rounded-full">
                  ACTIVE
                </span>
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
    </div>
  );
};
