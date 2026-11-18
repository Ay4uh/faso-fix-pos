import React, { useState } from 'react';
import { Ticket } from '../types';
import {
  X,
  Printer,
  FileText,
  Tag,
  CheckCircle2,
  Wrench,
  Smartphone,
  User,
  ShieldCheck,
  Check,
  CreditCard,
  Phone,
  Mail,
  MapPin,
} from 'lucide-react';
import { Barcode } from './Barcode';

interface PrintTicketModalProps {
  ticket: Ticket | null;
  onClose: () => void;
}

export const PrintTicketModal: React.FC<PrintTicketModalProps> = ({ ticket, onClose }) => {
  if (!ticket) return null;

  const [paperFormat, setPaperFormat] = useState<'letter' | 'receipt'>('letter');

  const totals = ticket.totals || {
    subtotalCents: ticket.laborCents,
    laborCents: ticket.laborCents,
    itemsCents: 0,
    discountCents: ticket.discountCents,
    taxRateBps: ticket.taxRateBps || 1300,
    taxCents: Math.round((ticket.laborCents * (ticket.taxRateBps || 1300)) / 10000),
    totalCents: ticket.laborCents + Math.round((ticket.laborCents * (ticket.taxRateBps || 1300)) / 10000),
    paidCents: 0,
    balanceCents: ticket.laborCents + Math.round((ticket.laborCents * (ticket.taxRateBps || 1300)) / 10000),
    paymentStatus: 'UNPAID',
  };

  const isPaid = totals.balanceCents <= 0;
  const woBarcode = `WO-${String(ticket.ticketNumber).padStart(4, '0')}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto print:p-0 print:bg-white print:overflow-visible">
      <div className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto print:border-none print:shadow-none print:max-w-none print:rounded-none">
        {/* Interactive Top Control Bar (Hidden during window.print) */}
        <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-slate-900">Print Copy & Invoice</span>
            <span className="px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-mono text-xs font-bold border border-indigo-200/80">
              #{ticket.ticketNumber}
            </span>
            <span className="text-xs text-slate-500 hidden sm:inline">
              {ticket.customer.fullName} • {ticket.device?.name || 'Device'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Paper Format Switcher */}
            <div className="inline-flex p-0.5 bg-slate-200/80 rounded-lg text-xs font-semibold">
              <button
                type="button"
                onClick={() => setPaperFormat('letter')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                  paperFormat === 'letter'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                <span>Letter (8.5×11)</span>
              </button>
              <button
                type="button"
                onClick={() => setPaperFormat('receipt')}
                className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition ${
                  paperFormat === 'receipt'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Tag className="w-3.5 h-3.5" />
                <span>Compact Thermal Slip</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => window.print()}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-bold hover:bg-indigo-700 shadow-xs cursor-pointer transition"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================
            FORMAT 1: LETTER (8.5x11) FULL INVOICE & WORK ORDER (Stitch Screen a7773021)
           ======================================================== */}
        {paperFormat === 'letter' && (
          <div className="p-6 sm:p-10 font-sans text-xs text-slate-800 space-y-6 print:p-0">
            {/* Top Sheet Header & Shop Identity */}
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 pb-4 border-b border-slate-200">
              <div className="flex items-start gap-3">
                <div className="w-12 h-12 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
                  <Wrench className="w-6 h-6" />
                </div>
                <div className="flex flex-col">
                  <span className="text-xl font-black text-slate-900 tracking-tight leading-tight">
                    ApexFix Electronics
                  </span>
                  <span className="text-xs text-slate-500 font-medium">
                    Diagnostics • Board-Level Repair • Micro-Soldering Lab
                  </span>
                  <span className="text-xs text-slate-500">
                    1084 Tech Boulevard, Suite 200 • San Jose, CA 95110
                  </span>
                  <span className="font-mono text-[11px] text-indigo-600 mt-0.5">
                    Tel: (555) 902-3482 • BAR Lic: #REP-99214 • EPA: #ESD-4402
                  </span>
                </div>
              </div>

              {/* Document Tag & Barcode Module */}
              <div className="flex flex-col sm:items-end justify-between shrink-0">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-mono font-bold ${
                    isPaid
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                      : 'bg-amber-50 text-amber-700 border border-amber-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isPaid ? 'bg-emerald-500' : 'bg-amber-500 animate-pulse'
                    }`}
                  />
                  <span>{isPaid ? 'PAID • READY FOR RELEASE' : 'INSPECTION / BALANCE DUE'}</span>
                </div>

                <div className="mt-2 flex flex-col sm:items-end">
                  <div className="bg-slate-50 border border-slate-200 p-1.5 rounded flex flex-col items-center">
                    <Barcode value={woBarcode} width={160} height={36} />
                    <span className="font-mono text-[10px] text-slate-500 font-semibold mt-0.5">
                      *{woBarcode}*
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Document Title Banner */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-2 border-b border-slate-200">
              <div>
                <h1 className="text-sm font-black text-slate-900 uppercase tracking-wide">
                  Official Work Order & Repair Invoice
                </h1>
                <p className="text-slate-500 text-[11px]">
                  Proof of completed diagnosis, component replacement, post-repair bench testing, and finalized billing.
                </p>
              </div>
              <div className="font-mono text-xs text-slate-400 sm:text-right mt-1 sm:mt-0">
                Work Order ID: <span className="text-slate-900 font-bold text-sm">#{ticket.ticketNumber}</span>
              </div>
            </div>

            {/* Telemetry & Diagnostic Metadata Bento Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                  Date Received
                </span>
                <span className="font-bold text-slate-900 mt-0.5">
                  {new Date(ticket.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  {new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                  Promised Date
                </span>
                <span className="font-bold text-slate-900 mt-0.5">
                  {new Date(ticket.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
                <span className="font-mono text-[10px] text-emerald-600 font-medium">
                  Priority: {ticket.priority}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                  Lead Technician
                </span>
                <span className="font-bold text-slate-900 mt-0.5">
                  {ticket.technician || 'Alex Mercer'}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  Station: {ticket.bench || 'Bench #04'}
                </span>
              </div>

              <div className="bg-slate-50 border border-slate-200/80 p-3 rounded-xl flex flex-col">
                <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                  Payment Status
                </span>
                <span
                  className={`font-black mt-0.5 font-mono ${
                    isPaid ? 'text-emerald-600' : 'text-amber-600'
                  }`}
                >
                  {isPaid ? 'PAID IN FULL' : 'BALANCE OWING'}
                </span>
                <span className="font-mono text-[10px] text-slate-500">
                  Ref: #TXN-{ticket.ticketNumber}89
                </span>
              </div>
            </div>

            {/* Customer & Device Identification Twin Modules */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Customer Profile */}
              <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center gap-1.5 mb-2">
                  <User className="w-4 h-4 text-indigo-600" />
                  <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                    Client Identification
                  </span>
                </div>
                <div className="space-y-1">
                  <div className="font-bold text-slate-900 text-sm">{ticket.customer.fullName}</div>
                  <div className="flex items-center gap-1.5 text-slate-600 font-mono text-xs">
                    <Phone className="w-3.5 h-3.5 text-slate-400" />
                    <span>{ticket.customer.phone}</span>
                  </div>
                  {ticket.customer.email && (
                    <div className="flex items-center gap-1.5 text-slate-600 text-xs">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      <span>{ticket.customer.email}</span>
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs">
                    <MapPin className="w-3.5 h-3.5 text-slate-400" />
                    <span>{ticket.customer.address || '742 Evergreen Terrace, Dundas Station'}</span>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-slate-400 font-mono text-[10px]">
                  <span>Account: #CUST-{ticket.customerId.slice(0, 5).toUpperCase()}</span>
                  <span>Intake: Walk-in Desk</span>
                </div>
              </div>

              {/* Device Hardware Profile */}
              <div className="bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex flex-col justify-between">
                <div className="flex items-center gap-1.5 mb-2">
                  <Smartphone className="w-4 h-4 text-indigo-600" />
                  <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                    Device Telemetry & Intake
                  </span>
                </div>
                <div>
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 text-sm">
                      {ticket.device?.name || 'Device'}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-slate-200 font-mono text-[10px] text-slate-700 font-bold">
                      Verified
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-x-2 gap-y-1 mt-2 font-mono text-xs">
                    <div>
                      <span className="text-slate-400 block text-[10px]">Serial Number:</span>
                      <span className="text-slate-800 font-semibold truncate block">
                        {ticket.device?.serialNumber || 'F2LX90KLQ23A'}
                      </span>
                    </div>
                    <div>
                      <span className="text-slate-400 block text-[10px]">Passcode / PIN:</span>
                      <span className="text-indigo-600 font-bold">
                        {ticket.device?.passcode || 'Verified by Owner'}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-slate-400 font-mono text-[10px]">
                  <span>Condition: {ticket.device?.condition || 'Grade A- Minor Scuffs'}</span>
                  <span>Find My: Suspended for Service</span>
                </div>
              </div>
            </div>

            {/* Diagnostic Intake & Symptoms */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-1">
              <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                <span className="font-mono text-[10px] uppercase text-slate-700 font-bold">
                  Phase 1 • Initial Physical & Digital Intake
                </span>
                <span className="px-2 py-0.5 bg-slate-200 rounded text-slate-700 font-mono text-[10px] font-semibold">
                  Bench Checked OK
                </span>
              </div>
              <p className="text-xs text-slate-700 pt-1 leading-relaxed">
                <strong>Reported Issue:</strong> {ticket.faultDescription}
              </p>
            </div>

            {/* Line Items & Scope Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <div className="px-4 py-2 bg-slate-100 flex items-center justify-between font-mono text-[10px] uppercase text-slate-600 font-bold">
                <span>Item Description & Technical Scope</span>
                <div className="flex items-center gap-8">
                  <span className="w-16 text-right">Qty / Rate</span>
                  <span className="w-20 text-right">Ext. Amount</span>
                </div>
              </div>

              {/* Parts Line Items */}
              {ticket.items && ticket.items.length > 0 ? (
                ticket.items.map((item, idx) => (
                  <div
                    key={item.id || idx}
                    className="p-3 px-4 flex items-center justify-between border-b border-slate-100 text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{item.description}</div>
                      <div className="font-mono text-[10px] text-slate-400">
                        SKU: {item.partId ? item.partId.slice(0, 8).toUpperCase() : 'PART-GEN'} • OEM Replacement
                      </div>
                    </div>
                    <div className="flex items-center gap-8 shrink-0 font-mono text-xs">
                      <span className="w-16 text-right text-slate-500">
                        {item.quantity} × ${(item.unitPriceCents / 100).toFixed(2)}
                      </span>
                      <span className="w-20 text-right font-bold text-slate-900">
                        ${((item.quantity * item.unitPriceCents) / 100).toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="p-3 px-4 flex items-center justify-between border-b border-slate-100 text-xs">
                  <div>
                    <div className="font-bold text-slate-900">Hardware Component & Diagnostic Testing</div>
                    <div className="font-mono text-[10px] text-slate-400">OEM Grade-A Screen / Battery / Port replacement</div>
                  </div>
                  <div className="flex items-center gap-8 shrink-0 font-mono text-xs">
                    <span className="w-16 text-right text-slate-500">1 × $0.00</span>
                    <span className="w-20 text-right font-bold text-slate-900">$0.00</span>
                  </div>
                </div>
              )}

              {/* Labor Row */}
              <div className="p-3 px-4 flex items-center justify-between bg-slate-50 text-xs">
                <div>
                  <div className="font-bold text-slate-900">
                    Bench Tech Labor: Diagnostics, Repair & Pressure Regasket
                  </div>
                  <div className="font-mono text-[10px] text-slate-400">
                    Station {ticket.bench || 'Bench #04'} • Lead Tech {ticket.technician || 'Alex Mercer'}
                  </div>
                </div>
                <div className="flex items-center gap-8 shrink-0 font-mono text-xs">
                  <span className="w-16 text-right text-slate-500">Service</span>
                  <span className="w-20 text-right font-bold text-slate-900">
                    ${(totals.laborCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Phase 3 QA Checklist Grid */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] uppercase text-slate-700 font-bold">
                  Phase 3 • Final Quality Assurance Checklist (Passed)
                </span>
                <span className="font-mono text-[10px] text-emerald-600 font-bold">
                  Bench QA Verified OK
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                {[
                  { name: 'FaceID / Biometrics', sub: 'Passcode & 3D Scan OK' },
                  { name: 'Display Calibration', sub: 'Sensor Matched & Synced' },
                  { name: 'Surface Digitizer', sub: 'Multi-touch Grid OK' },
                  { name: 'Front & Rear Optics', sub: 'OIS & Autofocus Locked' },
                  { name: 'Proximity & Lux Sensor', sub: 'Screen Blanking OK' },
                  { name: 'PD Quick Charging', sub: 'Draw Current Verified' },
                ].map((item, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-2 bg-white border border-slate-200/60 p-2 rounded-lg"
                  >
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <div>
                      <div className="font-bold text-slate-800 leading-tight text-[11px]">{item.name}</div>
                      <div className="font-mono text-[9px] text-slate-400 leading-tight">{item.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Financial Accounting Table & Payment Method (Stitch Screen a7773021) */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
              {/* Left: Payment Audit Log */}
              <div className="md:col-span-7 bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center gap-1.5 mb-2">
                    <CreditCard className="w-4 h-4 text-emerald-600" />
                    <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                      Payment Audit Log
                    </span>
                  </div>
                  <div className="space-y-1 text-xs text-slate-600 font-mono">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Method:</span>
                      <span className="font-bold text-slate-800">Counter POS / Stripe Terminal</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Gateway Ref:</span>
                      <span>TXN_{ticket.ticketNumber}89_APX</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Terminal Station:</span>
                      <span>{ticket.bench || 'Bench #04'} (Alex Mercer)</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Timestamp:</span>
                      <span>{new Date().toLocaleDateString()}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-indigo-600 shrink-0" />
                  <div>
                    <span className="font-bold text-slate-900 text-xs block">
                      Covered Under ApexFix 90-Day Warranty
                    </span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      Covers component failure & workmanship. Excludes liquid or physical drop damage.
                    </span>
                  </div>
                </div>
              </div>

              {/* Right: Explicit Before-Tax & After-Tax Totals */}
              <div className="md:col-span-5 bg-slate-50 border border-slate-200/80 p-4 rounded-xl flex flex-col justify-between">
                <div className="space-y-1.5 text-xs text-slate-600">
                  <div className="flex items-center justify-between">
                    <span>Parts Subtotal:</span>
                    <span className="font-mono font-medium text-slate-800">
                      ${(totals.itemsCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Labor Subtotal:</span>
                    <span className="font-mono font-medium text-slate-800">
                      ${(totals.laborCents / 100).toFixed(2)}
                    </span>
                  </div>
                  {totals.discountCents > 0 && (
                    <div className="flex items-center justify-between text-rose-600">
                      <span>Discount:</span>
                      <span className="font-mono">-${(totals.discountCents / 100).toFixed(2)}</span>
                    </div>
                  )}
                  <div className="flex items-center justify-between font-bold text-slate-700 pt-1 border-t border-slate-200">
                    <span>Subtotal (Pre-Tax):</span>
                    <span className="font-mono">${(totals.subtotalCents / 100).toFixed(2)}</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500 font-mono text-[11px] pb-1">
                    <span>Sales Tax ({(totals.taxRateBps / 100).toFixed(1)}%):</span>
                    <span>+${(totals.taxCents / 100).toFixed(2)}</span>
                  </div>
                </div>

                <div className="pt-2 mt-2 bg-white border border-slate-200 p-3 rounded-lg flex items-center justify-between shadow-2xs">
                  <div className="flex flex-col">
                    <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                      Total Invoice
                    </span>
                    <span
                      className={`font-mono text-[11px] font-bold ${
                        totals.balanceCents > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      Balance Due: ${(totals.balanceCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <span className="text-xl font-black text-slate-900 font-mono tracking-tight">
                    ${(totals.totalCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>
            </div>

            {/* Terms, Policy & Signatures */}
            <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-4 space-y-3">
              <div className="text-[10px] text-slate-500 leading-relaxed">
                <strong>Service Terms & Warranty Policy:</strong> ApexFix warrants the specified replacement components and associated craftsmanship for a period of ninety (90) calendar days from device release. Warranty explicitly excludes secondary accidental drops, liquid immersion, unauthorized third-party board modifications, or deliberate abuse. Customer acknowledges device data retention is the client's sole responsibility; all diagnostic and hardware tests were completed satisfactorily prior to release.
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                {/* Tech Sign-off */}
                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                      Lead Technician Sign-off
                    </span>
                    <span className="font-mono text-[10px] text-emerald-600 font-bold">ID #2084 VALID</span>
                  </div>
                  <div className="h-12 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between shadow-2xs">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-indigo-600 text-white flex items-center justify-center text-xs">
                        <CheckCircle2 className="w-4 h-4" />
                      </div>
                      <div>
                        <div className="font-bold text-xs text-indigo-700 italic">
                          {ticket.technician || 'Alex Mercer'}
                        </div>
                        <div className="font-mono text-[9px] text-slate-400">
                          Digitally Certified • Station {ticket.bench || 'Bench 04'}
                        </div>
                      </div>
                    </div>
                    <span className="font-mono text-[10px] text-slate-400">*{woBarcode}*</span>
                  </div>
                </div>

                {/* Customer Signature */}
                <div className="flex flex-col justify-end">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-mono text-[10px] uppercase text-slate-400 font-bold">
                      Customer Acceptance
                    </span>
                    <span className="font-mono text-[10px] text-slate-400">
                      Received In Good Order
                    </span>
                  </div>
                  <div className="h-12 bg-white border border-slate-200 rounded-lg p-2 flex items-center justify-between shadow-2xs">
                    {ticket.signature ? (
                      <div className="flex items-center gap-2">
                        <img
                          src={ticket.signature}
                          alt="Customer Signature"
                          className="h-9 object-contain max-w-[140px]"
                        />
                        <span className="font-mono text-[10px] text-slate-500">
                          {ticket.customer.fullName}
                        </span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between w-full">
                        <span className="font-mono text-[11px] text-slate-400 italic">
                          Signature on electronic intake acknowledgment
                        </span>
                        <Check className="w-4 h-4 text-emerald-600" />
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            FORMAT 2: COMPACT THERMAL BENCH SLIP (2"x1" or 4"x2" Sticker)
           ======================================================== */}
        {paperFormat === 'receipt' && (
          <div className="p-6 flex justify-center bg-slate-100 print:bg-white print:p-0">
            <div className="w-80 bg-white border border-slate-300 shadow-md p-4 rounded-xl font-mono text-xs space-y-2.5 print:border-none print:shadow-none print:w-full">
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-2">
                <span className="font-bold font-sans text-xs">APEXFIX BENCH</span>
                <span className="font-bold text-sm text-indigo-700">WO #{ticket.ticketNumber}</span>
              </div>

              <div>
                <div className="font-bold text-sm truncate">{ticket.customer.fullName}</div>
                <div className="text-[11px] text-slate-600">{ticket.customer.phone}</div>
              </div>

              <div className="p-2 bg-slate-100 rounded-lg text-[11px] space-y-0.5">
                <div className="font-bold truncate">{ticket.device?.name || 'Device'}</div>
                {ticket.device?.passcode && (
                  <div className="font-bold text-slate-900">PIN: {ticket.device.passcode}</div>
                )}
                {ticket.device?.serialNumber && (
                  <div className="text-[9px] text-slate-500 truncate">{ticket.device.serialNumber}</div>
                )}
              </div>

              <div className="text-[10px] text-slate-600 italic line-clamp-2">
                &ldquo;{ticket.faultDescription}&rdquo;
              </div>

              <div className="pt-2 flex flex-col items-center justify-center border-t border-dashed border-slate-200">
                <Barcode value={woBarcode} width={180} height={36} />
                <span className="text-[9px] text-slate-400 mt-1">
                  DUE: {new Date(ticket.dueDate).toLocaleDateString()} • BENCH #{ticket.bench || '04'}
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
