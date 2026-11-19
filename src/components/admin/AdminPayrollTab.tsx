import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  Lock,
  Download,
  Plus,
  Edit2,
  CheckCircle2,
  AlertCircle,
  Clock,
  Printer,
  X,
  ChevronRight,
  ShieldCheck,
  TrendingUp,
  Percent,
} from 'lucide-react';
import { fetchWithAuth } from '../../utils/auth';
import { PaystubModal } from '../PaystubModal';

export const AdminPayrollTab: React.FC = () => {
  const [overview, setOverview] = useState<any | null>(null);
  const [periods, setPeriods] = useState<any[]>([]);
  const [selectedPeriod, setSelectedPeriod] = useState<any | null>(null);
  const [selectedPaystub, setSelectedPaystub] = useState<any | null>(null);

  const [loading, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Wizard state
  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [periodType, setPeriodType] = useState<'BI_WEEKLY' | 'WEEKLY' | 'MONTHLY' | 'CUSTOM'>('BI_WEEKLY');
  const [wizardStartDate, setWizardStartDate] = useState('');
  const [wizardEndDate, setWizardEndDate] = useState('');
  const [wizardPayDate, setWizardPayDate] = useState('');
  const [calculatedDraft, setCalculatedDraft] = useState<any | null>(null);

  // Paystub draft edit modal
  const [editingPaystub, setEditingPaystub] = useState<any | null>(null);
  const [editBonusCents, setEditBonusCents] = useState(0);
  const [editOtherDeductionsCents, setEditOtherDeductionsCents] = useState(0);
  const [editNotes, setEditNotes] = useState('');

  useEffect(() => {
    loadPayrollOverview();
    loadPeriods();
  }, []);

  const loadPayrollOverview = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/payroll/overview');
      if (res.ok) {
        const json = await res.json();
        setOverview(json.data);
      }
    } catch (err) {
      console.error('[Load Payroll Overview Error]', err);
    }
  };

  const loadPeriods = async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/admin/payroll/periods');
      if (res.ok) {
        const json = await res.json();
        setPeriods(json.data || []);
      }
    } catch (err) {
      console.error('[Load Payroll Periods Error]', err);
    } finally {
      setLoading(false);
    }
  };

  const loadPeriodDetails = async (periodId: string) => {
    try {
      const res = await fetchWithAuth(`/api/admin/payroll/periods/${periodId}`);
      if (res.ok) {
        const json = await res.json();
        setSelectedPeriod(json.data);
      }
    } catch (err) {
      console.error('[Load Period Details Error]', err);
    }
  };

  const handleOpenWizard = () => {
    // Default to last 14 days (bi-weekly)
    const end = new Date();
    const start = new Date(end.getTime() - 13 * 86400000);
    const pay = new Date(end.getTime() + 3 * 86400000);

    setPeriodType('BI_WEEKLY');
    setWizardStartDate(start.toISOString().slice(0, 10));
    setWizardEndDate(end.toISOString().slice(0, 10));
    setWizardPayDate(pay.toISOString().slice(0, 10));
    setCalculatedDraft(null);
    setIsWizardOpen(true);
  };

  const handleCalculateDraft = async () => {
    if (!wizardStartDate || !wizardEndDate) {
      setErrorMsg('Please select both start and end dates.');
      return;
    }
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchWithAuth('/api/admin/payroll/periods/calculate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: wizardStartDate,
          endDate: wizardEndDate,
          payDate: wizardPayDate,
          periodType,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to calculate payroll');

      setCalculatedDraft(json.data);
    } catch (err: any) {
      setErrorMsg(err.message || 'Calculation error');
    } finally {
      setLoading(false);
    }
  };

  const handleSavePeriod = async () => {
    if (!calculatedDraft) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await fetchWithAuth('/api/admin/payroll/periods', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startDate: calculatedDraft.period.startDate,
          endDate: calculatedDraft.period.endDate,
          payDate: wizardPayDate || calculatedDraft.period.payDate,
          periodType,
          paystubs: calculatedDraft.paystubs,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create payroll period');

      setToastMsg(`Payroll Period #${json.data.periodNumber} created as DRAFT.`);
      setIsWizardOpen(false);
      await loadPeriods();
      await loadPayrollOverview();
      await loadPeriodDetails(json.data.id);
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to save payroll period');
    } finally {
      setLoading(false);
    }
  };

  const handleFinalizePeriod = async (periodId: string) => {
    const ok = window.confirm(
      'FINALIZATION & LOCK NOTICE:\n\nFinalizing this payroll period will permanently lock all paystubs against ordinary modification and release official statements to employee portals. Are you sure you wish to proceed?'
    );
    if (!ok) return;

    setLoading(true);
    try {
      const res = await fetchWithAuth(`/api/admin/payroll/periods/${periodId}/finalize`, {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to finalize period');

      setToastMsg('Payroll period successfully finalized and locked against edits.');
      await loadPeriods();
      await loadPayrollOverview();
      if (selectedPeriod?.id === periodId) {
        await loadPeriodDetails(periodId);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error finalizing period');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenEditPaystub = (paystub: any) => {
    setEditingPaystub(paystub);
    setEditBonusCents(paystub.bonusCents || 0);
    setEditOtherDeductionsCents(paystub.otherDeductionsCents || 0);
    setEditNotes(paystub.notes || '');
  };

  const handleSavePaystubDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingPaystub) return;

    try {
      const res = await fetchWithAuth(`/api/admin/payroll/paystubs/${editingPaystub.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          bonusCents: Math.round(Number(editBonusCents)),
          otherDeductionsCents: Math.round(Number(editOtherDeductionsCents)),
          notes: editNotes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update paystub');

      setToastMsg('Paystub draft adjusted and recalculated.');
      setEditingPaystub(null);
      if (selectedPeriod) {
        await loadPeriodDetails(selectedPeriod.id);
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Error adjusting paystub');
    }
  };

  const handleExportCsv = (periodId: string) => {
    window.open(`/api/admin/payroll/periods/${periodId}/export`, '_blank');
  };

  const fmtCurrency = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

  return (
    <div className="space-y-6">
      {/* Toast Alert */}
      {toastMsg && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center justify-between text-xs text-emerald-800">
          <div className="flex items-center space-x-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{toastMsg}</span>
          </div>
          <button onClick={() => setToastMsg(null)} className="text-emerald-700 hover:text-emerald-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-center justify-between text-xs text-red-800">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-red-700 hover:text-red-900">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Dashboard Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Regular Hours</span>
            <Clock className="w-4 h-4 text-indigo-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">
            {overview?.kpis?.totalRegularHours?.toFixed(1) || '0.0'}h
          </p>
          <span className="text-[10px] text-slate-400">Current cycle</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Overtime Hours</span>
            <TrendingUp className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-black text-amber-700 font-mono">
            {overview?.kpis?.totalOvertimeHours?.toFixed(1) || '0.0'}h
          </p>
          <span className="text-[10px] text-slate-400">Ontario &gt;44h @ 1.5x</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Gross Wages</span>
            <DollarSign className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-black text-slate-900 font-mono">
            {fmtCurrency(overview?.kpis?.estimatedGrossPayrollCents || 0)}
          </p>
          <span className="text-[10px] text-slate-400">Wages + 4% vacation</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Deductions</span>
            <Percent className="w-4 h-4 text-red-500" />
          </div>
          <p className="text-2xl font-black text-red-600 font-mono">
            -{fmtCurrency(overview?.kpis?.estimatedDeductionsCents || 0)}
          </p>
          <span className="text-[10px] text-slate-400">CPP, EI &amp; Income Tax</span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
          <div className="flex items-center justify-between text-slate-500 mb-1">
            <span className="text-[10px] font-bold uppercase tracking-wider">Net Take-Home</span>
            <ShieldCheck className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-emerald-700 font-mono">
            {fmtCurrency(overview?.kpis?.estimatedNetPayrollCents || 0)}
          </p>
          <span className="text-[10px] text-slate-400">Direct deposit payout</span>
        </div>
      </div>

      {/* Main Action Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <h3 className="text-sm font-bold text-slate-900">Canadian CRA &amp; Ontario Payroll Engine</h3>
          <p className="text-xs text-slate-500 mt-0.5">
            2026 CRA Statutory Formulas (CPP 5.95%, EI 1.63%, TD1 brackets, Ontario Surtax &amp; 4% ESA Vacation)
          </p>
        </div>
        <button
          onClick={handleOpenWizard}
          className="inline-flex items-center space-x-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold rounded-xl text-xs shadow-sm shadow-indigo-600/30 transition cursor-pointer shrink-0"
        >
          <Plus className="w-4 h-4" />
          <span>Run New Payroll Period</span>
        </button>
      </div>

      {/* Active Selected Period Detail View */}
      {selectedPeriod && (
        <div className="bg-white rounded-2xl border-2 border-indigo-200 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-sm font-black text-slate-900">
                  Payroll Period #{selectedPeriod.periodNumber} ({selectedPeriod.periodType})
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    selectedPeriod.status === 'FINALIZED'
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-amber-100 text-amber-800'
                  }`}
                >
                  {selectedPeriod.status}
                </span>
              </div>
              <p className="text-xs text-slate-500 font-mono mt-0.5">
                {new Date(selectedPeriod.startDate).toLocaleDateString('en-CA')} to{' '}
                {new Date(selectedPeriod.endDate).toLocaleDateString('en-CA')} • Pay Date:{' '}
                {new Date(selectedPeriod.payDate).toLocaleDateString('en-CA')}
              </p>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={() => handleExportCsv(selectedPeriod.id)}
                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Export CSV</span>
              </button>

              {selectedPeriod.status !== 'FINALIZED' && (
                <button
                  onClick={() => handleFinalizePeriod(selectedPeriod.id)}
                  className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
                >
                  <Lock className="w-3.5 h-3.5" />
                  <span>Finalize &amp; Lock Payroll</span>
                </button>
              )}
            </div>
          </div>

          {/* Paystubs in Period Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold">
                <tr>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3 text-right">Reg Hours</th>
                  <th className="py-2.5 px-3 text-right">OT Hours</th>
                  <th className="py-2.5 px-3 text-right">Gross Pay</th>
                  <th className="py-2.5 px-3 text-right">CPP</th>
                  <th className="py-2.5 px-3 text-right">EI</th>
                  <th className="py-2.5 px-3 text-right">Income Tax</th>
                  <th className="py-2.5 px-3 text-right">Net Pay</th>
                  <th className="py-2.5 px-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {selectedPeriod.paystubs?.map((ps: any) => (
                  <tr key={ps.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                      {ps.user?.name}
                      <span className="block text-[10px] font-mono font-normal text-slate-400">
                        {ps.user?.employeeNumber || 'FF-001'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right text-slate-800">{ps.regularHours}h</td>
                    <td className="py-2.5 px-3 text-right">
                      {ps.overtimeHours > 0 ? (
                        <span className="text-amber-600 font-bold">{ps.overtimeHours}h</span>
                      ) : (
                        <span className="text-slate-400">0.0h</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                      {fmtCurrency(ps.grossPayCents)}
                    </td>
                    <td className="py-2.5 px-3 text-right text-red-600">-{fmtCurrency(ps.cppCents)}</td>
                    <td className="py-2.5 px-3 text-right text-red-600">-{fmtCurrency(ps.eiCents)}</td>
                    <td className="py-2.5 px-3 text-right text-red-600">-{fmtCurrency(ps.incomeTaxCents)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                      {fmtCurrency(ps.netPayCents)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-sans">
                      <div className="flex items-center justify-end space-x-1">
                        {selectedPeriod.status !== 'FINALIZED' && (
                          <button
                            onClick={() => handleOpenEditPaystub(ps)}
                            title="Edit bonuses/deductions"
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => setSelectedPaystub(ps)}
                          title="View Official Statement / PDF"
                          className="p-1 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded transition cursor-pointer"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Historical Payroll Periods Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Payroll History &amp; Approved Periods ({periods.length})
          </h3>
          <span className="text-[11px] text-slate-500">
            Immutable archives • Click period to review statements
          </span>
        </div>

        {periods.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No payroll periods generated yet. Click &quot;Run New Payroll Period&quot; above to begin.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Period #</th>
                  <th className="py-3 px-4">Schedule Range</th>
                  <th className="py-3 px-4">Pay Date</th>
                  <th className="py-3 px-4 text-center">Staff Count</th>
                  <th className="py-3 px-4 text-right">Total Gross</th>
                  <th className="py-3 px-4 text-right">Total Net</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {periods.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-4 font-sans font-bold text-slate-900">
                      Period #{p.periodNumber}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {new Date(p.startDate).toLocaleDateString('en-CA')} to{' '}
                      {new Date(p.endDate).toLocaleDateString('en-CA')}
                    </td>
                    <td className="py-3 px-4 text-slate-700">
                      {new Date(p.payDate).toLocaleDateString('en-CA')}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-600 font-sans">
                      {p._count?.paystubs || p.paystubs?.length || 0}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900">
                      {fmtCurrency(p.totalGrossCents)}
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700">
                      {fmtCurrency(p.totalNetCents)}
                    </td>
                    <td className="py-3 px-4 text-center font-sans">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          p.status === 'FINALIZED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {p.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-sans">
                      <button
                        onClick={() => loadPeriodDetails(p.id)}
                        className="inline-flex items-center space-x-1 text-indigo-600 hover:text-indigo-800 font-bold"
                      >
                        <span>View Details</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Wizard Modal: Run New Payroll */}
      {isWizardOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-4xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
            <div className="flex items-center justify-between px-6 py-4 bg-slate-900 text-white">
              <div>
                <h3 className="text-base font-bold">New Payroll Period Calculation Wizard</h3>
                <p className="text-xs text-slate-300">
                  Select pay cycle and preview Canadian &amp; Ontario deductions before committing
                </p>
              </div>
              <button onClick={() => setIsWizardOpen(false)} className="text-slate-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-6 text-xs text-slate-800">
              {/* Controls */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200">
                <div>
                  <label className="block font-bold uppercase text-[10px] text-slate-500 mb-1">
                    Frequency
                  </label>
                  <select
                    value={periodType}
                    onChange={(e: any) => setPeriodType(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  >
                    <option value="BI_WEEKLY">Bi-Weekly (26 Pay Runs/Yr)</option>
                    <option value="WEEKLY">Weekly (52 Pay Runs/Yr)</option>
                    <option value="MONTHLY">Monthly (12 Pay Runs/Yr)</option>
                    <option value="CUSTOM">Custom Range</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold uppercase text-[10px] text-slate-500 mb-1">
                    Period Start
                  </label>
                  <input
                    type="date"
                    value={wizardStartDate}
                    onChange={(e) => setWizardStartDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase text-[10px] text-slate-500 mb-1">
                    Period End
                  </label>
                  <input
                    type="date"
                    value={wizardEndDate}
                    onChange={(e) => setWizardEndDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  />
                </div>

                <div>
                  <label className="block font-bold uppercase text-[10px] text-slate-500 mb-1">
                    Pay Date
                  </label>
                  <input
                    type="date"
                    value={wizardPayDate}
                    onChange={(e) => setWizardPayDate(e.target.value)}
                    className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg bg-white"
                  />
                </div>
              </div>

              <div className="flex justify-center">
                <button
                  onClick={handleCalculateDraft}
                  disabled={loading}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-xs transition cursor-pointer disabled:opacity-50"
                >
                  {loading ? 'Calculating Statutory Rules...' : 'Compute Statutory Deductions & Preview'}
                </button>
              </div>

              {/* Calculated Preview Table */}
              {calculatedDraft && (
                <div className="space-y-4">
                  <div className="p-4 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between">
                    <div>
                      <p className="font-bold text-emerald-900 text-sm">
                        Payroll Draft Preview Ready ({calculatedDraft.paystubs.length} Employees)
                      </p>
                      <p className="text-[11px] text-emerald-700">
                        Total Gross: {fmtCurrency(calculatedDraft.summary.totalGrossCents)} • Total Deductions: -{fmtCurrency(calculatedDraft.summary.totalDeductionsCents)}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-emerald-700">Net Payroll</span>
                      <p className="text-xl font-black text-emerald-900 font-mono">
                        {fmtCurrency(calculatedDraft.summary.totalNetCents)}
                      </p>
                    </div>
                  </div>

                  <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-72 overflow-y-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold sticky top-0">
                        <tr>
                          <th className="py-2.5 px-3">Employee</th>
                          <th className="py-2.5 px-3 text-right">Reg Hrs</th>
                          <th className="py-2.5 px-3 text-right">OT Hrs</th>
                          <th className="py-2.5 px-3 text-right">Gross</th>
                          <th className="py-2.5 px-3 text-right">CPP</th>
                          <th className="py-2.5 px-3 text-right">EI</th>
                          <th className="py-2.5 px-3 text-right">Tax</th>
                          <th className="py-2.5 px-3 text-right">Net Pay</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 font-mono">
                        {calculatedDraft.paystubs.map((ps: any) => (
                          <tr key={ps.userId}>
                            <td className="py-2.5 px-3 font-sans font-bold text-slate-900">
                              {ps.user?.name}
                            </td>
                            <td className="py-2.5 px-3 text-right">{ps.regularHours}h</td>
                            <td className="py-2.5 px-3 text-right">
                              {ps.overtimeHours > 0 ? (
                                <span className="text-amber-600 font-bold">{ps.overtimeHours}h</span>
                              ) : (
                                '0.0h'
                              )}
                            </td>
                            <td className="py-2.5 px-3 text-right font-bold">{fmtCurrency(ps.grossPayCents)}</td>
                            <td className="py-2.5 px-3 text-right text-red-600">-{fmtCurrency(ps.cppCents)}</td>
                            <td className="py-2.5 px-3 text-right text-red-600">-{fmtCurrency(ps.eiCents)}</td>
                            <td className="py-2.5 px-3 text-right text-red-600">-{fmtCurrency(ps.incomeTaxCents)}</td>
                            <td className="py-2.5 px-3 text-right font-bold text-emerald-700">
                              {fmtCurrency(ps.netPayCents)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>

                  <div className="flex justify-end space-x-2 pt-2 border-t border-slate-200">
                    <button
                      onClick={() => setIsWizardOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-bold"
                    >
                      Discard
                    </button>
                    <button
                      onClick={handleSavePeriod}
                      disabled={loading}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                    >
                      Save as Draft Period
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Paystub Adjustment Modal */}
      {editingPaystub && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full overflow-hidden text-xs">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900">Adjust Draft Paystub</h3>
                <p className="text-[11px] text-slate-500">{editingPaystub.user?.name}</p>
              </div>
              <button onClick={() => setEditingPaystub(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePaystubDraft} className="p-5 space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Bonus / Additional Earnings ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editBonusCents / 100).toFixed(2)}
                  onChange={(e) => setEditBonusCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Other Authorized Deductions ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={(editOtherDeductionsCents / 100).toFixed(2)}
                  onChange={(e) => setEditOtherDeductionsCents(Math.round(parseFloat(e.target.value || '0') * 100))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Adjustment Notes</label>
                <input
                  type="text"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="e.g. Performance bonus for phone repairs"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingPaystub(null)}
                  className="px-3 py-1.5 bg-slate-100 rounded-lg font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Save &amp; Recalculate
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paystub Viewer Modal */}
      {selectedPaystub && (
        <PaystubModal
          paystub={selectedPaystub}
          onClose={() => setSelectedPaystub(null)}
        />
      )}
    </div>
  );
};
