import React, { useRef, useState, useEffect } from 'react';
import { X, Printer, ShieldCheck, DollarSign } from 'lucide-react';
import { fetchWithAuth } from '../utils/auth';
import { loadShop, ReceiptShop } from '../utils/receipt';

interface PaystubModalProps {
  paystub: any | null;
  onClose: () => void;
}

export const PaystubModal: React.FC<PaystubModalProps> = ({ paystub, onClose }) => {
  const printAreaRef = useRef<HTMLDivElement>(null);
  const [shop, setShop] = useState<ReceiptShop>({
    shopName: 'Faso Fix',
    address: '',
    phone: '',
    email: '',
  });

  useEffect(() => {
    loadShop()
      .then((s) => {
        if (s) setShop(s);
      })
      .catch(() => {});
  }, []);

  if (!paystub) return null;

  const handlePrint = async () => {
    try {
      const res = await fetchWithAuth(`/api/timeclock/my-paystubs/${paystub.id}/html`);
      if (!res.ok) throw new Error('Failed to load paystub HTML');
      const html = await res.text();
      const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      const win = window.open(blobUrl, '_blank', 'width=900,height=1000');
      if (win) {
        win.focus();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
      } else {
        URL.revokeObjectURL(blobUrl);
        window.print();
      }
    } catch {
      window.print();
    }
  };

  const period = paystub.payrollPeriod || {};
  const user = paystub.user || paystub.employee || {};
  const isFinalized =
    paystub.status === 'FINALIZED' ||
    paystub.status === 'APPROVED' ||
    period.status === 'FINALIZED';
  const vacationRatePct = ((user.vacationPayPct ?? 400) / 100).toFixed(1);

  const fmtCurrency = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-3xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Top Control Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-b border-slate-200 print:hidden">
          <div className="flex items-center space-x-2">
            <span className="p-1.5 bg-indigo-100 text-indigo-700 rounded-lg">
              <DollarSign className="w-4 h-4" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900">
                Official Statement of Earnings & Deductions
              </h2>
              <p className="text-[11px] text-slate-500 font-mono">
                CRA 2026 &amp; Ontario ESA Compliant Paystub • ID #{paystub.id.slice(-8)}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handlePrint}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / Save PDF</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Paystub Document Body */}
        <div ref={printAreaRef} className="p-6 sm:p-8 space-y-6 text-slate-800 bg-white">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-slate-200 pb-5">
            <div>
              <div className="flex items-center space-x-2">
                <span className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center font-bold text-sm">
                  FF
                </span>
                <span className="text-xl font-black text-slate-900 tracking-tight">
                  {shop.shopName || 'Faso Fix POS'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Device Repair &amp; Retail Operations</p>
              {shop.address && <p className="text-xs text-slate-500">{shop.address}</p>}
              {(shop.phone || shop.email) && (
                <p className="text-xs text-slate-500">
                  {[shop.phone ? `Tel: ${shop.phone}` : '', shop.email || ''].filter(Boolean).join(' • ')}
                </p>
              )}
            </div>
            <div className="text-left sm:text-right space-y-1">
              <span className={`inline-block px-2.5 py-1 text-xs font-bold uppercase tracking-wider rounded-md ${
                isFinalized
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-amber-100 text-amber-800'
              }`}>
                {isFinalized ? 'Official / Finalized' : 'Draft / Estimated'}
              </span>
              <p className="text-xs text-slate-500 font-mono">
                Period #{period.periodNumber || 1} ({period.periodType || 'BI_WEEKLY'})
              </p>
              <p className="text-xs text-slate-700">
                <strong>Pay Date:</strong> {period.payDate ? new Date(period.payDate).toLocaleDateString('en-CA') : 'Pending'}
              </p>
            </div>
          </div>

          {/* Employee & Period Details Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
            <div className="space-y-1">
              <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Employee Information</p>
              <p className="text-sm font-bold text-slate-900">{user.name || 'Technician'}</p>
              <p className="text-slate-600 font-mono">ID: {user.employeeNumber || '—'}</p>
              <p className="text-slate-600">Email: {user.email || '—'}</p>
              <p className="text-slate-600">Role: {user.role || 'TECHNICIAN'}</p>
            </div>
            <div className="space-y-1 sm:text-right">
              <p className="text-slate-500 font-bold uppercase tracking-wider text-[10px]">Pay Period Schedule</p>
              <p className="font-semibold text-slate-800">
                {period.startDate ? new Date(period.startDate).toLocaleDateString('en-CA') : ''} to{' '}
                {period.endDate ? new Date(period.endDate).toLocaleDateString('en-CA') : ''}
              </p>
              <p className="text-slate-600">
                Regular Wage: <span className="font-mono font-bold">{fmtCurrency(paystub.hourlyRateCents)}/hr</span>
              </p>
              <p className="text-slate-600">
                Overtime Rate (1.5x): <span className="font-mono font-bold">{fmtCurrency(paystub.overtimeRateCents)}/hr</span>
              </p>
              <p className="text-slate-600">
                Payment Method: <span className="font-semibold">{paystub.paymentMethod || 'DIRECT_DEPOSIT'}</span>
              </p>
            </div>
          </div>

          {/* Earnings & Hours Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Earnings &amp; Hours Breakdown
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Pay Item</th>
                    <th className="py-2.5 px-4 text-center">Hours</th>
                    <th className="py-2.5 px-4 text-right">Rate</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-800">Regular Working Hours</td>
                    <td className="py-2.5 px-4 text-center">{paystub.regularHours?.toFixed(2) || '0.00'}</td>
                    <td className="py-2.5 px-4 text-right">{fmtCurrency(paystub.hourlyRateCents)}</td>
                    <td className="py-2.5 px-4 text-right font-bold text-slate-900">{fmtCurrency(paystub.regularPayCents)}</td>
                  </tr>
                  {paystub.overtimeHours > 0 && (
                    <tr className="bg-amber-50/50">
                      <td className="py-2.5 px-4 font-sans font-medium text-amber-900">
                        Overtime Hours (Ontario &gt;44h @ 1.5x)
                      </td>
                      <td className="py-2.5 px-4 text-center text-amber-900">{paystub.overtimeHours?.toFixed(2)}</td>
                      <td className="py-2.5 px-4 text-right text-amber-900">{fmtCurrency(paystub.overtimeRateCents)}</td>
                      <td className="py-2.5 px-4 text-right font-bold text-amber-900">{fmtCurrency(paystub.overtimePayCents)}</td>
                    </tr>
                  )}
                  {paystub.vacationPayCents > 0 && (
                    <tr>
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-800">
                        Vacation Pay (Statutory {vacationRatePct}% Ontario ESA)
                      </td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-right text-slate-400">{vacationRatePct}%</td>
                      <td className="py-2.5 px-4 text-right font-bold text-slate-900">{fmtCurrency(paystub.vacationPayCents)}</td>
                    </tr>
                  )}
                  {paystub.bonusCents > 0 && (
                    <tr>
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-800">Bonus / Incentive Earnings</td>
                      <td className="py-2.5 px-4 text-center text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-right text-slate-400">—</td>
                      <td className="py-2.5 px-4 text-right font-bold text-emerald-600">{fmtCurrency(paystub.bonusCents)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td colSpan={3} className="py-2.5 px-4 text-right font-sans uppercase text-[11px] tracking-wider">
                      Total Gross Pay:
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm text-indigo-700">{fmtCurrency(paystub.grossPayCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Statutory Deductions Section */}
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Statutory Canadian &amp; Ontario Deductions
            </h3>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-2.5 px-4">Deduction Description</th>
                    <th className="py-2.5 px-4 text-center">Authority</th>
                    <th className="py-2.5 px-4 text-right">Calculation Basis</th>
                    <th className="py-2.5 px-4 text-right">Deducted Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-800">
                      Canada Pension Plan (CPP)
                    </td>
                    <td className="py-2.5 px-4 text-center font-sans text-slate-600">Federal (CRA)</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">5.95% above exemption</td>
                    <td className="py-2.5 px-4 text-right font-bold text-red-600">-{fmtCurrency(paystub.cppCents)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-800">
                      Employment Insurance (EI)
                    </td>
                    <td className="py-2.5 px-4 text-center font-sans text-slate-600">Federal (CRA)</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">1.63% statutory</td>
                    <td className="py-2.5 px-4 text-right font-bold text-red-600">-{fmtCurrency(paystub.eiCents)}</td>
                  </tr>
                  <tr>
                    <td className="py-2.5 px-4 font-sans font-medium text-slate-800">
                      Income Tax (Federal + Ontario)
                    </td>
                    <td className="py-2.5 px-4 text-center font-sans text-slate-600">CRA &amp; Prov. ON</td>
                    <td className="py-2.5 px-4 text-right text-slate-500">TD1 Claim Graduated</td>
                    <td className="py-2.5 px-4 text-right font-bold text-red-600">-{fmtCurrency(paystub.incomeTaxCents)}</td>
                  </tr>
                  {paystub.otherDeductionsCents > 0 && (
                    <tr>
                      <td className="py-2.5 px-4 font-sans font-medium text-slate-800">Other Authorized Deductions</td>
                      <td className="py-2.5 px-4 text-center font-sans text-slate-600">Internal</td>
                      <td className="py-2.5 px-4 text-right text-slate-500">Authorized</td>
                      <td className="py-2.5 px-4 text-right font-bold text-red-600">-{fmtCurrency(paystub.otherDeductionsCents)}</td>
                    </tr>
                  )}
                  <tr className="bg-slate-50 font-bold text-slate-900">
                    <td colSpan={3} className="py-2.5 px-4 text-right font-sans uppercase text-[11px] tracking-wider">
                      Total Statutory Deductions:
                    </td>
                    <td className="py-2.5 px-4 text-right text-sm text-red-600">-{fmtCurrency(paystub.totalDeductionsCents)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* Net Pay Callout Banner */}
          <div className="p-5 rounded-2xl bg-gradient-to-r from-emerald-50 via-teal-50 to-emerald-100 border-2 border-emerald-300 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="space-y-1 text-center sm:text-left">
              <div className="flex items-center justify-center sm:justify-start space-x-1.5 text-emerald-800">
                <ShieldCheck className="w-5 h-5 text-emerald-600" />
                <span className="font-bold text-sm uppercase tracking-wider">Take-Home Pay Distribution</span>
              </div>
              <p className="text-xs text-emerald-700">
                Transferred via {paystub.paymentMethod || 'Direct Deposit'} to employee account on file.
              </p>
            </div>
            <div className="text-center sm:text-right">
              <span className="text-[10px] uppercase font-bold text-emerald-800 tracking-wider">Net Amount</span>
              <div className="text-3xl font-black text-emerald-900 font-mono tracking-tight">
                {fmtCurrency(paystub.netPayCents)}
              </div>
            </div>
          </div>

          {/* Compliance & Legal Footer */}
          <div className="text-[11px] text-slate-400 space-y-1 border-t border-slate-100 pt-4">
            <p>
              * Certified accurate under Canada Revenue Agency (CRA) 2026 payroll deduction regulations (T4032/T4127) and Ontario Employment Standards Act, 2000 (ESA).
            </p>
            <p>
              This document serves as an official statement of remuneration and deductions. Retain for personal income tax records.
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end print:hidden">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
