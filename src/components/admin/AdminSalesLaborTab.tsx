import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  CreditCard,
  Receipt,
  RefreshCw,
} from 'lucide-react';
import { fetchWithAuth } from '../../utils/auth';

interface SalesLaborAnalytics {
  period: {
    startDate: string;
    endDate: string;
  };
  summary: {
    totalRevenueCents: number;
    laborBilledCents: number;
    partsBilledCents: number;
    taxCollectedCents: number;
    totalLaborCostCents: number;
    laborCostPct: number;
    totalHoursWorked: number;
    revenuePerHourCents: number;
    totalTicketsCreated: number;
    totalTicketsCompleted: number;
    avgTicketValueCents: number;
  };
  byEmployee: Array<{
    userId: string;
    name: string;
    username: string;
    role: string;
    hourlyWageCents: number;
    ticketsCreated: number;
    ticketsCompleted: number;
    laborBilledCents: number;
    partsBilledCents: number;
    totalRevenueCents: number;
    actualHoursWorked: number;
    laborCostCents: number;
    laborRatioPct: number;
    revenuePerHourCents: number;
  }>;
  byShift: Array<{
    shiftId: string;
    userId: string;
    employeeName: string;
    clockIn: string;
    clockOut: string | null;
    durationHours: number;
    shiftLaborCostCents: number;
    shiftRevenueCents: number;
    shiftLaborCostPct: number;
    ticketsCount: number;
  }>;
  salesBreakdown: {
    byPaymentMethod: {
      cashCents: number;
      cardCents: number;
      debitCents: number;
      eTransferCents: number;
      otherCents: number;
    };
    totalDiscountsCents: number;
    totalRefundsCents: number;
    totalVoidedTransactions: number;
  };
}

export const AdminSalesLaborTab: React.FC = () => {
  const [analytics, setAnalytics] = useState<SalesLaborAnalytics | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [timeRange, setTimeRange] = useState<'TODAY' | 'WEEK' | 'MONTH' | 'ALL'>('WEEK');
  const [activeSubTab, setActiveSubTab] = useState<'employees' | 'shifts' | 'payments'>('employees');

  const fmtCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  const loadAnalytics = async () => {
    setIsLoading(true);
    try {
      const now = new Date();
      let start = new Date();
      if (timeRange === 'TODAY') {
        start.setHours(0, 0, 0, 0);
      } else if (timeRange === 'WEEK') {
        start.setDate(now.getDate() - 7);
      } else if (timeRange === 'MONTH') {
        start.setDate(now.getDate() - 30);
      } else {
        start.setDate(now.getDate() - 90);
      }

      const res = await fetchWithAuth(
        `/api/reports/sales-labor?startDate=${start.toISOString()}&endDate=${now.toISOString()}`
      );
      if (res.ok) {
        const json = await res.json();
        setAnalytics(json.data || null);
      }
    } catch (err) {
      console.error('Failed to load sales labor analytics', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [timeRange]);

  return (
    <div className="space-y-6">
      {/* Header and Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <TrendingUp className="w-5 h-5 text-emerald-600" />
            <h2 className="text-base font-bold text-slate-900">POS Sales Attribution &amp; Labor Analytics</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Connect ticket sales, technician productivity, and actual clocked labor hours to calculate true labor ROI
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 max-w-full">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-semibold max-w-full overflow-x-auto">
            <button
              onClick={() => setTimeRange('TODAY')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === 'TODAY'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setTimeRange('WEEK')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === 'WEEK'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last 7 Days
            </button>
            <button
              onClick={() => setTimeRange('MONTH')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                timeRange === 'MONTH'
                  ? 'bg-white text-emerald-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last 30 Days
            </button>
          </div>

          <button
            onClick={loadAnalytics}
            disabled={isLoading}
            className="p-2 border border-slate-200 text-slate-600 hover:text-slate-900 rounded-xl hover:bg-slate-50 transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Top Level Metric Cards */}
      {analytics && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500">POS Revenue</span>
            <p className="text-xl font-black text-slate-900 font-mono mt-1">
              {fmtCurrency(analytics.summary.totalRevenueCents)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {analytics.summary.totalTicketsCompleted} tickets finalized
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500">Clocked Labor Cost</span>
            <p className="text-xl font-black text-indigo-700 font-mono mt-1">
              {fmtCurrency(analytics.summary.totalLaborCostCents)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">
              {analytics.summary.totalHoursWorked.toFixed(1)} hrs total
            </p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500">Labor Cost Ratio</span>
            <div className="flex items-center space-x-1.5 mt-1 font-mono">
              <span
                className={`text-xl font-black ${
                  analytics.summary.laborCostPct > 35
                    ? 'text-rose-600'
                    : analytics.summary.laborCostPct < 25
                    ? 'text-emerald-600'
                    : 'text-indigo-600'
                }`}
              >
                {analytics.summary.laborCostPct.toFixed(1)}%
              </span>
            </div>
            <p className="text-[10px] text-slate-400 mt-1">Target range: 20% - 30%</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            <span className="text-[10px] font-bold uppercase text-slate-500">Revenue per Labor Hr</span>
            <p className="text-xl font-black text-emerald-600 font-mono mt-1">
              {fmtCurrency(analytics.summary.revenuePerHourCents)}/h
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Efficiency metric</p>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs col-span-2 sm:col-span-1">
            <span className="text-[10px] font-bold uppercase text-slate-500">Avg Ticket Value</span>
            <p className="text-xl font-black text-slate-900 font-mono mt-1">
              {fmtCurrency(analytics.summary.avgTicketValueCents)}
            </p>
            <p className="text-[10px] text-slate-400 mt-1">Parts + labor combined</p>
          </div>
        </div>
      )}

      {/* Sub Tabs */}
      <div className="flex items-center space-x-2 border-b border-slate-200 pb-2 text-xs font-semibold">
        <button
          onClick={() => setActiveSubTab('employees')}
          className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
            activeSubTab === 'employees'
              ? 'bg-indigo-600 text-white font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Productivity by Employee
        </button>
        <button
          onClick={() => setActiveSubTab('shifts')}
          className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
            activeSubTab === 'shifts'
              ? 'bg-indigo-600 text-white font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Sales by Clocked Shift
        </button>
        <button
          onClick={() => setActiveSubTab('payments')}
          className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
            activeSubTab === 'payments'
              ? 'bg-indigo-600 text-white font-bold'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          Payment &amp; Tender Reconciliation
        </button>
      </div>

      {/* SUB-TAB 1: PRODUCTIVITY BY EMPLOYEE */}
      {activeSubTab === 'employees' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4 text-center">Tickets Created</th>
                  <th className="py-3 px-4 text-center">Tickets Completed</th>
                  <th className="py-3 px-4 text-right">Labor Billed</th>
                  <th className="py-3 px-4 text-right">Total Revenue</th>
                  <th className="py-3 px-4 text-right">Clocked Hours</th>
                  <th className="py-3 px-4 text-right">Labor Cost</th>
                  <th className="py-3 px-4 text-right">Labor Cost %</th>
                  <th className="py-3 px-4 text-right">Revenue / Hr</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {analytics?.byEmployee.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-8 text-slate-400 font-sans">
                      No sales or shift records found in this date range.
                    </td>
                  </tr>
                ) : (
                  analytics?.byEmployee.map((emp) => (
                    <tr key={emp.userId} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                        <div className="flex items-center space-x-2">
                          <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                            {emp.name.charAt(0).toUpperCase()}
                          </div>
                          <div>
                            <span>{emp.name}</span>
                            <span className="block text-[10px] font-normal text-slate-400 font-sans">
                              {emp.role} • {fmtCurrency(emp.hourlyWageCents)}/hr
                            </span>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">{emp.ticketsCreated}</td>
                      <td className="py-3 px-4 text-center font-bold text-indigo-600">{emp.ticketsCompleted}</td>
                      <td className="py-3 px-4 text-right text-slate-700">{fmtCurrency(emp.laborBilledCents)}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {fmtCurrency(emp.totalRevenueCents)}
                      </td>
                      <td className="py-3 px-4 text-right text-slate-700">{emp.actualHoursWorked.toFixed(1)}h</td>
                      <td className="py-3 px-4 text-right text-indigo-700">{fmtCurrency(emp.laborCostCents)}</td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-bold ${
                            emp.laborRatioPct > 35
                              ? 'text-rose-600'
                              : emp.laborRatioPct < 25
                              ? 'text-emerald-600'
                              : 'text-slate-800'
                          }`}
                        >
                          {emp.laborRatioPct.toFixed(1)}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-emerald-600">
                        {fmtCurrency(emp.revenuePerHourCents)}/h
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 2: SALES BY SHIFT */}
      {activeSubTab === 'shifts' && (
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Shift Date &amp; Window</th>
                  <th className="py-3 px-4 text-right">Duration</th>
                  <th className="py-3 px-4 text-center">Tickets Paid in Shift</th>
                  <th className="py-3 px-4 text-right">Shift Revenue</th>
                  <th className="py-3 px-4 text-right">Shift Labor Cost</th>
                  <th className="py-3 px-4 text-right">Shift Labor Cost %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {analytics?.byShift.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-8 text-slate-400 font-sans">
                      No shift records found for this timeframe.
                    </td>
                  </tr>
                ) : (
                  analytics?.byShift.map((s) => (
                    <tr key={s.shiftId} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4 font-sans font-semibold text-slate-900">{s.employeeName}</td>
                      <td className="py-3 px-4 text-slate-700">
                        <span>{new Date(s.clockIn).toLocaleDateString('en-CA')}</span>
                        <span className="block text-[10px] text-slate-400">
                          {new Date(s.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} -{' '}
                          {s.clockOut
                            ? new Date(s.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Active'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right text-slate-800">{s.durationHours.toFixed(2)}h</td>
                      <td className="py-3 px-4 text-center font-bold text-slate-700">{s.ticketsCount}</td>
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        {fmtCurrency(s.shiftRevenueCents)}
                      </td>
                      <td className="py-3 px-4 text-right text-indigo-700">{fmtCurrency(s.shiftLaborCostCents)}</td>
                      <td className="py-3 px-4 text-right">
                        <span
                          className={`font-bold ${
                            s.shiftLaborCostPct > 35
                              ? 'text-rose-600'
                              : s.shiftLaborCostPct < 25
                              ? 'text-emerald-600'
                              : 'text-slate-800'
                          }`}
                        >
                          {s.shiftLaborCostPct.toFixed(1)}%
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB-TAB 3: PAYMENT & TENDER RECONCILIATION */}
      {activeSubTab === 'payments' && analytics && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
              <CreditCard className="w-4 h-4 text-indigo-600" />
              <span>Payments by Tender Method</span>
            </h3>
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Credit Card</span>
                <span className="font-bold text-slate-900">
                  {fmtCurrency(analytics.salesBreakdown.byPaymentMethod.cardCents)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Debit (Interac)</span>
                <span className="font-bold text-slate-900">
                  {fmtCurrency(analytics.salesBreakdown.byPaymentMethod.debitCents)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Cash Register</span>
                <span className="font-bold text-emerald-700">
                  {fmtCurrency(analytics.salesBreakdown.byPaymentMethod.cashCents)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Interac e-Transfer</span>
                <span className="font-bold text-slate-900">
                  {fmtCurrency(analytics.salesBreakdown.byPaymentMethod.eTransferCents)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Other / Voucher</span>
                <span className="font-bold text-slate-900">
                  {fmtCurrency(analytics.salesBreakdown.byPaymentMethod.otherCents)}
                </span>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs space-y-4">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 flex items-center space-x-1.5">
              <Receipt className="w-4 h-4 text-rose-600" />
              <span>Discounts, Refunds &amp; Voids</span>
            </h3>
            <div className="space-y-3 font-mono text-xs">
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Total Discounts Given</span>
                <span className="font-bold text-amber-600">
                  {fmtCurrency(analytics.salesBreakdown.totalDiscountsCents)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Total Refunds Issued</span>
                <span className="font-bold text-rose-600">
                  {fmtCurrency(analytics.salesBreakdown.totalRefundsCents)}
                </span>
              </div>
              <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl">
                <span className="font-sans font-medium text-slate-700">Voided Transactions</span>
                <span className="font-bold text-slate-900">
                  {analytics.salesBreakdown.totalVoidedTransactions}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
