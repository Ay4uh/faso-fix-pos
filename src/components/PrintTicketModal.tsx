import React, { useState } from 'react';
import { Ticket } from '../types';
import { X, Printer, Tag, FileText } from 'lucide-react';
import { Barcode } from './Barcode';

interface PrintTicketModalProps {
  ticket: Ticket | null;
  onClose: () => void;
}

export const PrintTicketModal: React.FC<PrintTicketModalProps> = ({ ticket, onClose }) => {
  if (!ticket) return null;

  const [printMode, setPrintMode] = useState<'INVOICE' | 'STICKER'>('INVOICE');

  const handlePrint = () => {
    window.print();
  };

  const totals = ticket.totals || {
    subtotalCents: ticket.laborCents,
    laborCents: ticket.laborCents,
    itemsCents: 0,
    discountCents: ticket.discountCents,
    taxRateBps: ticket.taxRateBps,
    taxCents: 0,
    totalCents: ticket.laborCents,
    paidCents: 0,
    balanceCents: ticket.laborCents,
    paymentStatus: 'UNPAID',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden">
        {/* Modal Controls */}
        <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50 print:hidden">
          {/* Mode Switcher */}
          <div className="flex items-center gap-1 bg-slate-200/80 p-0.5 rounded-lg">
            <button
              onClick={() => setPrintMode('INVOICE')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                printMode === 'INVOICE'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Full Work Order</span>
            </button>
            <button
              onClick={() => setPrintMode('STICKER')}
              className={`flex items-center gap-1.5 px-3 py-1 rounded text-xs font-semibold transition-all ${
                printMode === 'STICKER'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Tag className="w-3.5 h-3.5" />
              <span>Thermal Bench Sticker</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-700 shadow-xs cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              Print
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* ========================================================
            MODE A: FULL WORK ORDER & INVOICE
           ======================================================== */}
        {printMode === 'INVOICE' && (
          <div className="p-6 font-mono text-xs text-slate-800 space-y-4 print:p-0">
            <div className="text-center border-b border-dashed border-slate-300 pb-3">
              <div className="font-bold text-sm text-slate-900 tracking-wide font-sans">
                APEXFIX POS & TECH CRM
              </div>
              <div className="text-[10px] text-slate-500 font-sans">1088 Technology Parkway, Dundas Terminal Bench #04</div>
              <div className="text-[10px] text-slate-500 font-sans">Support: (555) 998-FIX1 • Licensed Repair Facility</div>
              
              {/* Barcode */}
              <div className="pt-2">
                <Barcode value={`WO-${String(ticket.ticketNumber).padStart(4, '0')}`} width={180} height={42} />
              </div>
            </div>

            <div className="flex justify-between border-b border-dashed border-slate-200 pb-2">
              <div>
                <span className="text-[10px] text-slate-400 block font-sans">WORK ORDER</span>
                <span className="font-bold text-base text-indigo-700">WO #{ticket.ticketNumber}</span>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 block font-sans">PROMISED DUE</span>
                <span className="font-semibold">{new Date(ticket.dueDate).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Customer */}
            <div className="space-y-1 border-b border-dashed border-slate-200 pb-2">
              <div className="text-[10px] text-slate-400 uppercase font-bold font-sans">Client Contact</div>
              <div className="font-bold text-sm text-slate-900">{ticket.customer.fullName}</div>
              <div>{ticket.customer.phone}</div>
              {ticket.customer.email && <div className="text-[11px] text-slate-500">{ticket.customer.email}</div>}
            </div>

            {/* Device */}
            <div className="space-y-1 border-b border-dashed border-slate-200 pb-2">
              <div className="text-[10px] text-slate-400 uppercase font-bold font-sans">Unit Details & Diagnostics</div>
              <div className="font-bold text-slate-900">{ticket.device?.name || 'Device'}</div>
              {ticket.device?.serialNumber && <div className="text-[10px] text-slate-500">IMEI/Serial: {ticket.device.serialNumber}</div>}
              {ticket.device?.passcode && <div className="text-[10px] text-slate-800 font-bold">Intake PIN: {ticket.device.passcode}</div>}
              <div className="text-[11px] text-slate-700 mt-1 italic">
                Fault: {ticket.faultDescription}
              </div>
            </div>

            {/* Financials */}
            <div className="space-y-1 border-b border-dashed border-slate-300 pb-3">
              <div className="flex justify-between">
                <span>Labor & Service:</span>
                <span>${(totals.laborCents / 100).toFixed(2)}</span>
              </div>
              {totals.itemsCents > 0 && (
                <div className="flex justify-between">
                  <span>Replaced Parts & Supplies:</span>
                  <span>${(totals.itemsCents / 100).toFixed(2)}</span>
                </div>
              )}
              {totals.discountCents > 0 && (
                <div className="flex justify-between text-red-600">
                  <span>Shop Discount:</span>
                  <span>-${(totals.discountCents / 100).toFixed(2)}</span>
                </div>
              )}
              <div className="flex justify-between text-slate-500 text-[11px]">
                <span>Taxes:</span>
                <span>+${(totals.taxCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-sm text-slate-900 pt-1 border-t border-slate-200">
                <span>TOTAL:</span>
                <span>${(totals.totalCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between text-emerald-700 text-[11px]">
                <span>Amount Paid:</span>
                <span>${(totals.paidCents / 100).toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-slate-900">
                <span>Balance Owing:</span>
                <span className={totals.balanceCents > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  ${(totals.balanceCents / 100).toFixed(2)}
                </span>
              </div>
            </div>

            {/* Warranty & Signature */}
            <div className="space-y-3 pt-1">
              <div className="text-[9px] text-slate-500 font-sans leading-tight">
                <strong>90-Day Limited Warranty:</strong> All replaced components carry a 90-day parts and labor guarantee against manufacturer defects. Liquid damage or accidental drops void warranty. Unclaimed units after 30 days subject to storage fees.
              </div>
              <div className="pt-2">
                {ticket.signature ? (
                  <div className="flex flex-col items-center">
                    <img src={ticket.signature} alt="Customer Signature" className="h-14 object-contain max-w-[240px]" />
                    <div className="w-full border-b border-slate-700"></div>
                    <div className="text-[10px] text-slate-700 font-sans mt-0.5 font-semibold">
                      Digitally Signed by {ticket.customer.fullName} • Verified Authorization
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="pt-8 border-b border-slate-400"></div>
                    <div className="text-[10px] text-center text-slate-400 font-sans mt-0.5">Customer Authorization Signature</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            MODE B: THERMAL BENCH STICKER (2"x1" or 4"x2" Sticker)
           ======================================================== */}
        {printMode === 'STICKER' && (
          <div className="p-6 flex justify-center bg-slate-100">
            <div className="w-80 bg-white border border-slate-300 shadow-md p-3.5 rounded-lg font-mono text-xs space-y-2">
              <div className="flex items-center justify-between border-b border-dashed border-slate-300 pb-1.5">
                <span className="font-bold font-sans text-xs">APEXFIX BENCH</span>
                <span className="font-bold text-sm text-indigo-700">WO #{ticket.ticketNumber}</span>
              </div>

              <div>
                <div className="font-bold text-sm truncate">{ticket.customer.fullName}</div>
                <div className="text-[11px] text-slate-600">{ticket.customer.phone}</div>
              </div>

              <div className="p-1.5 bg-slate-100 rounded text-[11px] space-y-0.5">
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

              <div className="pt-1 flex flex-col items-center justify-center border-t border-dashed border-slate-200">
                <Barcode value={`WO-${String(ticket.ticketNumber).padStart(4, '0')}`} width={180} height={36} />
                <span className="text-[9px] text-slate-400 mt-1">DUE: {new Date(ticket.dueDate).toLocaleDateString()}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
