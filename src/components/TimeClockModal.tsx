import React, { useState, useEffect } from 'react';
import {
  Clock,
  Play,
  Square,
  Coffee,
  CheckCircle2,
  DollarSign,
  AlertCircle,
  FileText,
  ChevronRight,
  X,
  History,
  Timer,
} from 'lucide-react';
import { fetchWithAuth } from '../utils/auth';
import { PaystubModal } from './PaystubModal';

interface TimeClockModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onStatusChange?: () => void;
}

export const TimeClockModal: React.FC<TimeClockModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onStatusChange,
}) => {
  const [activeTab, setActiveTab] = useState<'clock' | 'history' | 'paystubs'>('clock');
  const [clockStatus, setClockStatus] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [paystubs, setPaystubs] = useState<any[]>([]);
  const [selectedPaystub, setSelectedPaystub] = useState<any | null>(null);

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Live real-time clock state (Toronto/Eastern Time)
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch status whenever modal opens
  useEffect(() => {
    if (isOpen) {
      loadClockStatus();
      loadShifts();
      loadPaystubs();
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isOpen]);

  const loadClockStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/status');
      if (res.ok) {
        const json = await res.json();
        setClockStatus(json.data);
      }
    } catch (err) {
      console.error('[TimeClock Status Fetch Error]', err);
    }
  };

  const loadShifts = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/my-shifts?limit=25');
      if (res.ok) {
        const json = await res.json();
        setShifts(json.data || []);
      }
    } catch (err) {
      console.error('[TimeClock Shifts Fetch Error]', err);
    }
  };

  const loadPaystubs = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/my-paystubs');
      if (res.ok) {
        const json = await res.json();
        setPaystubs(json.data || []);
      }
    } catch (err) {
      console.error('[TimeClock Paystubs Fetch Error]', err);
    }
  };

  const handleClockIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/timeclock/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clock in');

      setSuccessMsg('Successfully clocked in for your shift.');
      setNotes('');
      await loadClockStatus();
      await loadShifts();
      onStatusChange?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error clocking in');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!window.confirm('Are you sure you want to clock out and end your shift?')) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/timeclock/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clock out');

      setSuccessMsg('Shift complete! Successfully clocked out.');
      setNotes('');
      await loadClockStatus();
      await loadShifts();
      onStatusChange?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error clocking out');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBreak = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/timeclock/break-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'UNPAID_MEAL' }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start break');

      setSuccessMsg('Break timer started.');
      await loadClockStatus();
      onStatusChange?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error starting break');
    } finally {
      setLoading(false);
    }
  };

  const handleEndBreak = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/timeclock/break-end', {
        method: 'POST',
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to end break');

      setSuccessMsg('Welcome back! Break ended and shift resumed.');
      await loadClockStatus();
      onStatusChange?.();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error ending break');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isClockedIn = clockStatus?.clockedIn;
  const isOnBreak = clockStatus?.onBreak;
  const activeShift = clockStatus?.activeShift;

  const fmtCurrency = (cents: number) => `$${((cents || 0) / 100).toFixed(2)}`;

  // Calculate elapsed time from active shift
  let elapsedFormatted = '0h 0m';
  if (isClockedIn && activeShift?.clockIn) {
    const startMs = new Date(activeShift.clockIn).getTime();
    const nowMs = currentTime.getTime();
    const diffMins = Math.max(0, Math.floor((nowMs - startMs) / 60000));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    elapsedFormatted = `${hours}h ${mins}m`;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-gradient-to-r from-slate-900 to-indigo-950 text-white">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-500/20 border border-indigo-400/30 flex items-center justify-center text-indigo-300">
              <Clock className="w-5 h-5 animate-pulse" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">
                Staff Time Clock &amp; Paystubs
              </h2>
              <p className="text-xs text-indigo-200">
                {currentUser?.name} • ID #{clockStatus?.employeeNumber || 'FF-001'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-white/10 rounded-lg transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50 px-6 pt-2">
          <button
            onClick={() => setActiveTab('clock')}
            className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'clock'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <Timer className="w-4 h-4" />
            <span>Time Clock</span>
          </button>
          <button
            onClick={() => setActiveTab('history')}
            className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'history'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            <span>Attendance History</span>
          </button>
          <button
            onClick={() => setActiveTab('paystubs')}
            className={`flex items-center space-x-2 py-3 px-4 text-xs font-bold border-b-2 transition cursor-pointer ${
              activeTab === 'paystubs'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>My Paystubs</span>
          </button>
        </div>

        {/* Notification Alerts */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-xs text-red-700">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-xs text-emerald-800">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* Tab 1: Live Time Clock */}
        {activeTab === 'clock' && (
          <div className="p-6 space-y-6">
            {/* Digital Clock Display */}
            <div className="text-center py-6 px-4 bg-gradient-to-b from-slate-50 to-indigo-50/40 rounded-2xl border border-indigo-100">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600">
                Official Business Time (America/Toronto)
              </span>
              <div className="text-4xl sm:text-5xl font-mono font-black text-slate-900 tracking-tight my-2">
                {currentTime.toLocaleTimeString('en-CA', { hour12: true })}
              </div>
              <p className="text-xs text-slate-600 font-medium">
                {currentTime.toLocaleDateString('en-CA', {
                  weekday: 'long',
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>

              {/* Status Badge */}
              <div className="mt-4 flex items-center justify-center space-x-2">
                <span
                  className={`inline-flex items-center space-x-1.5 px-3 py-1 rounded-full text-xs font-bold ${
                    isOnBreak
                      ? 'bg-amber-100 text-amber-800 border border-amber-300'
                      : isClockedIn
                      ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                      : 'bg-slate-200 text-slate-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnBreak
                        ? 'bg-amber-500 animate-ping'
                        : isClockedIn
                        ? 'bg-emerald-500 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {isOnBreak ? 'On Unpaid Break' : isClockedIn ? `Clocked In • ${elapsedFormatted}` : 'Currently Clocked Out'}
                  </span>
                </span>
              </div>
            </div>

            {/* Shift Actions */}
            <div className="space-y-4">
              {!isClockedIn ? (
                <div>
                  <button
                    onClick={handleClockIn}
                    disabled={loading}
                    className="w-full py-4 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-2xl shadow-lg shadow-emerald-600/30 flex items-center justify-center space-x-2 transition cursor-pointer text-base disabled:opacity-50"
                  >
                    <Play className="w-5 h-5 fill-current" />
                    <span>Clock In (Start Shift)</span>
                  </button>
                  <p className="text-center text-[11px] text-slate-400 mt-2">
                    Hourly rate: {fmtCurrency(clockStatus?.hourlyRateCents || 2200)}/hr • Overtime calculated &gt;44h/wk
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* Break Controls */}
                    {!isOnBreak ? (
                      <button
                        onClick={handleStartBreak}
                        disabled={loading}
                        className="py-3 px-4 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold rounded-xl flex items-center justify-center space-x-2 transition cursor-pointer text-xs"
                      >
                        <Coffee className="w-4 h-4 text-amber-600" />
                        <span>Start Unpaid Break</span>
                      </button>
                    ) : (
                      <button
                        onClick={handleEndBreak}
                        disabled={loading}
                        className="py-3 px-4 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs flex items-center justify-center space-x-2 transition cursor-pointer text-xs"
                      >
                        <Play className="w-4 h-4 fill-current" />
                        <span>Resume Shift (End Break)</span>
                      </button>
                    )}

                    {/* Clock Out Control */}
                    <button
                      onClick={handleClockOut}
                      disabled={loading || isOnBreak}
                      className="py-3 px-4 bg-red-600 hover:bg-red-700 active:bg-red-800 text-white font-bold rounded-xl shadow-xs flex items-center justify-center space-x-2 transition cursor-pointer text-xs disabled:opacity-40"
                    >
                      <Square className="w-4 h-4 fill-current" />
                      <span>Clock Out (End Shift)</span>
                    </button>
                  </div>

                  {/* Optional Shift Notes */}
                  <div>
                    <label className="block text-[11px] font-bold text-slate-600 mb-1">
                      Optional Shift Notes / Tasks Completed
                    </label>
                    <input
                      type="text"
                      value={notes}
                      onChange={(e) => setNotes(e.target.value)}
                      placeholder="e.g. Worked on screen replacements at Bench #01"
                      className="w-full text-xs px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Today's & Weekly Working Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500">Today</span>
                <p className="text-base font-black text-slate-900 font-mono">
                  {clockStatus?.todayHours ? `${clockStatus.todayHours} hrs` : '0.0 hrs'}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500">This Week</span>
                <p className="text-base font-black text-indigo-700 font-mono">
                  {clockStatus?.weeklyHours ? `${clockStatus.weeklyHours} hrs` : '0.0 hrs'}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500">Hourly Rate</span>
                <p className="text-base font-black text-slate-900 font-mono">
                  {fmtCurrency(clockStatus?.hourlyRateCents || 2200)}
                </p>
              </div>
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-500">OT Rule</span>
                <p className="text-xs font-bold text-slate-700 font-mono mt-1">&gt;44h @ 1.5x</p>
              </div>
            </div>
          </div>
        )}

        {/* Tab 2: Attendance History */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              Recent Logged Shifts ({shifts.length})
            </h3>
            {shifts.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">No shifts recorded yet.</p>
            ) : (
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] font-bold">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Clock In</th>
                      <th className="py-2.5 px-3">Clock Out</th>
                      <th className="py-2.5 px-3 text-center">Breaks</th>
                      <th className="py-2.5 px-3 text-right">Net Hours</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono">
                    {shifts.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-sans font-medium text-slate-900">
                          {new Date(s.clockIn).toLocaleDateString('en-CA')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {new Date(s.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600">
                          {s.clockOut
                            ? new Date(s.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Active'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">{s.breakMinutes || 0}m</td>
                        <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                          {((s.totalMinutes || 0) / 60).toFixed(2)}h
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              s.status === 'COMPLETED'
                                ? 'bg-slate-100 text-slate-700'
                                : s.status === 'ACTIVE'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-indigo-100 text-indigo-700'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 3: My Paystubs */}
        {activeTab === 'paystubs' && (
          <div className="p-6 space-y-4 max-h-[460px] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Official Paystubs ({paystubs.length})
              </h3>
              <span className="text-[11px] text-slate-500">CRA 2026 Remuneration Statements</span>
            </div>

            {paystubs.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-200">
                <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-bold text-slate-700">No Paystubs Issued Yet</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  Paystubs appear here automatically once your manager finalizes the payroll period.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {paystubs.map((p) => {
                  const period = p.payrollPeriod || {};
                  return (
                    <div
                      key={p.id}
                      className="p-4 bg-white border border-slate-200 rounded-xl hover:border-indigo-400 hover:shadow-xs transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-100 text-indigo-800">
                            Period #{period.periodNumber || 1}
                          </span>
                          <span className="text-xs font-bold text-slate-800">
                            {period.startDate ? new Date(period.startDate).toLocaleDateString('en-CA') : ''} —{' '}
                            {period.endDate ? new Date(period.endDate).toLocaleDateString('en-CA') : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-500 font-mono">
                          Regular: {p.regularHours}h • OT: {p.overtimeHours}h • Gross: {fmtCurrency(p.grossPayCents)} • Deductions: -{fmtCurrency(p.totalDeductionsCents)}
                        </p>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Net Take-Home</span>
                          <p className="text-base font-black text-emerald-700 font-mono">
                            {fmtCurrency(p.netPayCents)}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedPaystub(p)}
                          className="inline-flex items-center space-x-1 px-3 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-lg text-xs transition cursor-pointer"
                        >
                          <span>View Paystub</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between text-[11px] text-slate-500">
          <span>Ontario Employment Standards Act (ESA) Compliant</span>
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-800 rounded-lg font-bold transition cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>

      {/* Paystub Viewer & PDF Print Modal */}
      {selectedPaystub && (
        <PaystubModal
          paystub={selectedPaystub}
          onClose={() => setSelectedPaystub(null)}
        />
      )}
    </div>
  );
};
