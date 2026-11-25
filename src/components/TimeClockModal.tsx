import React, { useState, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  Coffee,
  Play,
  CheckCircle2,
  AlertCircle,
  X,
  History,
  Calendar,
  DollarSign,
  User,
  ArrowLeft,
  UtensilsCrossed,
  Clock,
  Download,
  Printer,
} from 'lucide-react';
import { fetchWithAuth } from '../utils/auth';
import { PaystubModal } from './PaystubModal';

interface TimeClockModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: any;
  onStatusChange?: () => void;
  initialTab?: 'clock' | 'history' | 'schedule' | 'paystubs';
}

const toLocalDateStr = (d: Date) => {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

export const TimeClockModal: React.FC<TimeClockModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onStatusChange,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'clock' | 'history' | 'schedule' | 'paystubs'>(
    initialTab || 'clock'
  );
  const [clockStatus, setClockStatus] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [scheduledShifts, setScheduledShifts] = useState<any[]>([]);
  const [paystubs, setPaystubs] = useState<any[]>([]);
  const [selectedPaystub, setSelectedPaystub] = useState<any | null>(null);

  // Time off & Shift Swaps
  const [timeOffRequests, setTimeOffRequests] = useState<any[]>([]);
  const [shiftSwaps, setShiftSwaps] = useState<any[]>([]);
  const [colleagues, setColleagues] = useState<any[]>([]);
  const [isTimeOffModalOpen, setIsTimeOffModalOpen] = useState(false);
  const [isSwapModalOpen, setIsSwapModalOpen] = useState(false);
  const [timeOffForm, setTimeOffForm] = useState({
    requestType: 'VACATION',
    startDate: toLocalDateStr(new Date()),
    endDate: toLocalDateStr(new Date()),
    reason: '',
  });
  const [swapForm, setSwapForm] = useState({
    requesterShiftId: '',
    targetUserId: '',
    reason: '',
  });

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState<Date>(new Date());
  const [breakMenuOpen, setBreakMenuOpen] = useState(false);

  // Live seconds ticker
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getActiveShiftKey = () => `apexfix_active_shift_${currentUser?.id || 'guest'}`;

  const loadStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/status');
      if (res.ok) {
        const json = await res.json();
        const data = json.data || json;
        setClockStatus(data);
        if (data.activeShift) {
          localStorage.setItem(getActiveShiftKey(), JSON.stringify(data.activeShift));
        } else {
          localStorage.removeItem(getActiveShiftKey());
        }
      } else {
        const raw = localStorage.getItem(getActiveShiftKey());
        if (raw) {
          try {
            const shift = JSON.parse(raw);
            setClockStatus((prev: any) => ({
              ...prev,
              isClockedIn: shift.status === 'ACTIVE' || shift.status === 'ON_BREAK',
              clockedIn: shift.status === 'ACTIVE' || shift.status === 'ON_BREAK',
              isOnBreak: shift.status === 'ON_BREAK',
              onBreak: shift.status === 'ON_BREAK',
              activeShift: shift,
            }));
          } catch {}
        }
      }
    } catch {
      const raw = localStorage.getItem(getActiveShiftKey());
      if (raw) {
        try {
          const shift = JSON.parse(raw);
          setClockStatus((prev: any) => ({
            ...prev,
            isClockedIn: shift.status === 'ACTIVE' || shift.status === 'ON_BREAK',
            clockedIn: shift.status === 'ACTIVE' || shift.status === 'ON_BREAK',
            isOnBreak: shift.status === 'ON_BREAK',
            onBreak: shift.status === 'ON_BREAK',
            activeShift: shift,
          }));
        } catch {}
      }
    }
  };

  const loadShifts = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/my-shifts');
      if (res.ok) {
        const json = await res.json();
        setShifts(json.data || json.shifts || []);
      }
    } catch {}
  };

  const loadSchedule = async () => {
    try {
      const res = await fetchWithAuth('/api/schedules/my-schedule');
      if (res.ok) {
        const json = await res.json();
        setScheduledShifts(json.data || json.schedules || []);
      }
    } catch {}
  };

  const loadPaystubs = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/my-paystubs');
      if (res.ok) {
        const json = await res.json();
        setPaystubs(json.data || json.paystubs || []);
      }
    } catch {}
  };

  const loadEmployeeRequests = async () => {
    try {
      const [toRes, swRes, usersRes] = await Promise.all([
        fetchWithAuth('/api/time-off'),
        fetchWithAuth('/api/shift-swaps'),
        fetchWithAuth('/api/users'),
      ]);
      if (toRes.ok) {
        const json = await toRes.json();
        setTimeOffRequests(json.data || []);
      }
      if (swRes.ok) {
        const json = await swRes.json();
        setShiftSwaps(json.data || []);
      }
      if (usersRes.ok) {
        const json = await usersRes.json();
        setColleagues((json.users || json.data || []).filter((u: any) => u.id !== currentUser?.id));
      }
    } catch {}
  };

  const handleSubmitTimeOff = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/time-off', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(timeOffForm),
      });
      if (res.ok) {
        setSuccessMsg('Time-off request submitted successfully!');
        setIsTimeOffModalOpen(false);
        loadEmployeeRequests();
      } else {
        const json = await res.json();
        throw new Error(json.error || 'Failed to submit request');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmitSwap = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    try {
      const res = await fetchWithAuth('/api/shift-swaps', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(swapForm),
      });
      if (res.ok) {
        setSuccessMsg('Shift swap request sent for administrator approval!');
        setIsSwapModalOpen(false);
        loadEmployeeRequests();
      } else {
        const json = await res.json();
        throw new Error(json.error || 'Failed to submit shift swap');
      }
    } catch (err: any) {
      setErrorMsg(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      if (initialTab) setActiveTab(initialTab);
      loadStatus();
      loadShifts();
      loadSchedule();
      loadPaystubs();
      loadEmployeeRequests();
      setErrorMsg(null);
      setSuccessMsg(null);
      setBreakMenuOpen(false);
    }
  }, [isOpen, initialTab]);

  const handleClockIn = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    const nowIso = new Date().toISOString();
    const optimisticShift = {
      id: `local-${Date.now()}`,
      userId: currentUser?.id,
      clockIn: nowIso,
      status: 'ACTIVE',
      hourlyRateCents: clockStatus?.hourlyRateCents || 2200,
    };

    setClockStatus((prev: any) => ({
      ...prev,
      isClockedIn: true,
      clockedIn: true,
      isOnBreak: false,
      onBreak: false,
      activeShift: optimisticShift,
    }));
    try {
      localStorage.setItem(getActiveShiftKey(), JSON.stringify(optimisticShift));
    } catch {}
    setSuccessMsg('Punched in successfully! Shift started.');
    onStatusChange?.();

    try {
      const res = await fetchWithAuth('/api/timeclock/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to clock in');

      const serverShift = json.data || json.shift || optimisticShift;
      setClockStatus((prev: any) => ({
        ...prev,
        isClockedIn: true,
        clockedIn: true,
        isOnBreak: false,
        onBreak: false,
        activeShift: serverShift,
      }));
      try {
        localStorage.setItem(getActiveShiftKey(), JSON.stringify(serverShift));
      } catch {}

      setNotes('');
      await Promise.all([loadStatus(), loadShifts()]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error clocking in');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    let localShift: any = null;
    try {
      const raw = localStorage.getItem(getActiveShiftKey());
      if (raw) localShift = JSON.parse(raw);
    } catch {}

    const shiftData = activeShift || localShift || undefined;

    setClockStatus((prev: any) => ({
      ...prev,
      isClockedIn: false,
      clockedIn: false,
      isOnBreak: false,
      onBreak: false,
      activeShift: null,
    }));
    try {
      localStorage.removeItem(getActiveShiftKey());
    } catch {}
    setSuccessMsg('Shift complete! Successfully clocked out.');
    onStatusChange?.();

    try {
      const res = await fetchWithAuth('/api/timeclock/clock-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes, shiftData }),
      });
      await res.json().catch(() => ({}));

      setNotes('');
      await Promise.all([loadStatus(), loadShifts()]);
    } catch (err: any) {
      setErrorMsg(err.message || 'Error clocking out');
    } finally {
      setLoading(false);
    }
  };

  const handleStartBreak = async (breakType: 'UNPAID_MEAL' | 'PAID_REST' = 'UNPAID_MEAL') => {
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    setBreakMenuOpen(false);

    setClockStatus((prev: any) => ({
      ...prev,
      isOnBreak: true,
      onBreak: true,
      activeBreakType: breakType,
    }));
    try {
      const raw = localStorage.getItem(getActiveShiftKey());
      if (raw) {
        const shift = JSON.parse(raw);
        shift.status = 'ON_BREAK';
        localStorage.setItem(getActiveShiftKey(), JSON.stringify(shift));
      }
    } catch {}
    setSuccessMsg(breakType === 'PAID_REST' ? 'Paid rest break started.' : 'Unpaid meal break started.');
    onStatusChange?.();

    try {
      const res = await fetchWithAuth('/api/timeclock/break-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: breakType }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to start break');
      await loadStatus();
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

    setClockStatus((prev: any) => ({
      ...prev,
      isOnBreak: false,
      onBreak: false,
    }));
    try {
      const raw = localStorage.getItem(getActiveShiftKey());
      if (raw) {
        const shift = JSON.parse(raw);
        shift.status = 'ACTIVE';
        localStorage.setItem(getActiveShiftKey(), JSON.stringify(shift));
      }
    } catch {}
    setSuccessMsg('Break ended! Shift resumed.');
    onStatusChange?.();

    try {
      const res = await fetchWithAuth('/api/timeclock/break-end', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to end break');
      await loadStatus();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error ending break');
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const isClockedIn = Boolean(clockStatus?.isClockedIn ?? clockStatus?.clockedIn);
  const isOnBreak = Boolean(clockStatus?.isOnBreak ?? clockStatus?.onBreak);
  const activeShift = clockStatus?.activeShift;

  const fmtCurrency = (cents: number) => `$${(cents / 100).toFixed(2)}`;

  let elapsedFormatted = '00:00:00';
  if (isClockedIn && activeShift?.clockIn) {
    const startMs = new Date(activeShift.clockIn).getTime();
    let breakDeductionSec = (activeShift.breakMinutes || 0) * 60;
    if (isOnBreak && activeShift.activeBreak?.startTime && activeShift.activeBreak.type !== 'PAID_REST') {
      const extraOpenSec = Math.max(
        0,
        Math.floor((currentTime.getTime() - new Date(activeShift.activeBreak.startTime).getTime()) / 1000)
      );
      // activeShift.breakMinutes from server already includes open break up to last fetch; use whichever paused point is cleaner
      const totalElapsedSec = Math.max(0, Math.floor((currentTime.getTime() - startMs) / 1000));
      const priorCompletedBreakSec = Math.max(0, (activeShift.breakMinutes || 0) * 60);
      breakDeductionSec = Math.max(priorCompletedBreakSec, extraOpenSec);
      const netSec = Math.max(0, totalElapsedSec - breakDeductionSec);
      const hours = Math.floor(netSec / 3600);
      const mins = Math.floor((netSec % 3600) / 60);
      const secs = netSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      elapsedFormatted = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    } else {
      const diffSec = Math.max(0, Math.floor((currentTime.getTime() - startMs) / 1000) - breakDeductionSec);
      const hours = Math.floor(diffSec / 3600);
      const mins = Math.floor((diffSec % 3600) / 60);
      const secs = diffSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      elapsedFormatted = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
    }
  }

  const hoursThisPeriod = Number(clockStatus?.weeklyHours ?? clockStatus?.weekHours ?? 0).toFixed(2);
  const firstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Staff';

  const handleExportTimesheetCsv = () => {
    if (!shifts || shifts.length === 0) {
      alert('No recorded shifts to export');
      return;
    }
    const lines: string[] = [];
    lines.push('FASO FIX POS - EMPLOYEE ATTENDANCE & SHIFT TIMESHEET EXPORT');
    lines.push(`Staff Member: ${currentUser?.name || currentUser?.username || 'Staff'}`);
    lines.push(`Exported At: ${new Date().toLocaleString()}`);
    lines.push('');
    lines.push('Date,Clock In,Clock Out,Break (Mins),Exact Duration,Net Hours,Status');
    shifts.forEach((s) => {
      const clockInDate = new Date(s.clockIn);
      const clockOutDate = s.clockOut ? new Date(s.clockOut) : null;
      const durSec = clockOutDate
        ? Math.max(0, Math.floor((clockOutDate.getTime() - clockInDate.getTime()) / 1000) - (s.breakMinutes || 0) * 60)
        : Math.max(0, Math.floor((currentTime.getTime() - clockInDate.getTime()) / 1000) - (s.breakMinutes || 0) * 60);

      const hrs = Math.floor(durSec / 3600);
      const mins = Math.floor((durSec % 3600) / 60);
      const secs = durSec % 60;
      const pad = (n: number) => String(n).padStart(2, '0');
      const exactDurationStr = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
      const hoursDecimal = (durSec / 3600).toFixed(2);
      const dateStr = clockInDate.toLocaleDateString('en-CA');
      const inStr = clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
      const outStr = clockOutDate
        ? clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
        : 'Active';

      lines.push(`${dateStr},"${inStr}","${outStr}",${s.breakMinutes || 0},"${exactDurationStr}",${hoursDecimal},${s.status || 'COMPLETED'}`);
    });

    const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `FasoFix-Timesheet-${(currentUser?.username || 'staff').toLowerCase()}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  const handlePrintTimesheet = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto ui-backdrop">
      {/* Light Clean Frame with TimeTrakGO Tablet Styling */}
      <div className="relative w-full max-w-3xl max-h-[92dvh] flex flex-col bg-white text-slate-800 rounded-2xl sm:rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-auto ui-modal">
        
        {/* Top Header Bar - High-End Ocean Blue Tablet Header (Matching TimeTrakGO Reference) */}
        <div className="flex items-center justify-between px-4 sm:px-6 py-3.5 sm:py-4 gap-2 bg-[#0284c7] text-white shrink-0">
          {/* Left: Brand & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white">
              <Clock className="w-5 h-5" />
            </div>
            <div className="flex flex-col">
              <span className="text-base sm:text-lg font-bold tracking-tight text-white leading-none">
                Staff Time Clock
              </span>
              <span className="text-[11px] text-sky-100 font-medium mt-0.5">
                Attendance &amp; Shift Management
              </span>
            </div>
          </div>

          {/* Center: Employee ID Badge Pill */}
          <div className="hidden sm:flex items-center space-x-2 bg-white text-slate-900 px-4 py-1.5 rounded-full shadow-sm">
            <div className="w-5 h-5 rounded-full bg-sky-100 text-[#0284c7] flex items-center justify-center text-xs font-bold">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold text-slate-800">
              {currentUser?.name || 'Staff Member'}
            </span>
          </div>

          {/* Right: Clean White Digital Clock & Close */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-base sm:text-lg font-mono font-bold text-white tracking-tight leading-none tabular-nums">
                {currentTime.toLocaleTimeString('en-CA', { hour12: true })}
              </div>
              <div className="text-[10px] text-sky-100 font-medium mt-0.5">
                {currentTime.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-white/80 hover:text-white hover:bg-white/15 rounded-xl ui-press cursor-pointer"
              title="Close Time Clock"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts / Error & Success banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-200 rounded-xl flex items-center space-x-2 text-xs text-red-800 ui-shake">
            <AlertCircle className="w-4 h-4 text-red-600 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl flex items-center space-x-2 text-xs text-emerald-800 ui-pop">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ========================================================
            VIEW 1: CLEAN LIGHT 3-CARD PUNCH TERMINAL (Reference Image)
           ======================================================== */}
        <div className="flex-1 overflow-y-auto">
          <div key={activeTab} className="ui-view-enter">
        {activeTab === 'clock' && (
          <div className="p-4 sm:p-8 space-y-5 sm:space-y-6 bg-white">
            {/* Greeting & Shift Status Line */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <p className="text-sm text-slate-700 font-medium">
                Good day <strong className="text-slate-900 font-bold">{firstName}</strong>, please select a function:
              </p>

              {/* Status Badge */}
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold ${
                    isOnBreak
                      ? 'bg-amber-100 text-amber-900 border border-amber-300'
                      : isClockedIn
                      ? 'bg-emerald-100 text-emerald-900 border border-emerald-300'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnBreak
                        ? 'bg-amber-500 animate-ping'
                        : isClockedIn
                        ? 'bg-emerald-600 animate-pulse'
                        : 'bg-slate-400'
                    }`}
                  />
                  <span>
                    {isOnBreak
                      ? `On Break • ${elapsedFormatted}`
                      : isClockedIn
                      ? `Clocked In • ${elapsedFormatted}`
                      : 'Currently Clocked Out'}
                  </span>
                </span>
              </div>
            </div>

            {/* THREE LARGE ACTION CARDS (TimeTrakGO Design in Light Theme) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* CARD 1: CLOCK IN */}
              <button
                type="button"
                onClick={handleClockIn}
                disabled={isClockedIn || loading}
                className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                  !isClockedIn
                    ? 'bg-white hover:bg-slate-50 border-slate-200 hover:border-emerald-500 shadow-sm hover:shadow-md active:scale-[0.98]'
                    : 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed opacity-45'
                }`}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border ${
                  !isClockedIn ? 'bg-emerald-50 border-emerald-200 text-emerald-600' : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}>
                  <LogIn className="w-8 h-8" />
                </div>
                <span className="text-base font-bold text-slate-900 tracking-tight">Clock In</span>
                <span className="text-[11px] text-slate-500 mt-1">Start Scheduled Shift</span>
                
                {/* Bottom Green Accent Strip */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl transition ${
                    !isClockedIn ? 'bg-emerald-500' : 'bg-transparent'
                  }`}
                />
              </button>

              {/* CARD 2: TAKE BREAK / END BREAK */}
              {!isOnBreak ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      if (!isClockedIn) return;
                      setBreakMenuOpen(!breakMenuOpen);
                    }}
                    disabled={!isClockedIn || loading}
                    className={`w-full h-full relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                      isClockedIn
                        ? 'bg-white hover:bg-slate-50 border-slate-200 hover:border-amber-500 shadow-sm hover:shadow-md active:scale-[0.98]'
                        : 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed opacity-45'
                    }`}
                  >
                    <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border ${
                      isClockedIn ? 'bg-amber-50 border-amber-200 text-amber-600' : 'bg-slate-100 border-slate-200 text-slate-400'
                    }`}>
                      <Coffee className="w-8 h-8" />
                    </div>
                    <span className="text-base font-bold text-slate-900 tracking-tight">Take Break</span>
                    <span className="text-[11px] text-slate-500 mt-1">Meal (Unpaid) or Rest (Paid)</span>

                    {/* Bottom Amber Accent Strip */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl transition ${
                        isClockedIn ? 'bg-amber-500' : 'bg-transparent'
                      }`}
                    />
                  </button>

                  {/* Dropdown Options for Meal vs Rest */}
                  {breakMenuOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-20 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden p-1 space-y-1">
                      <button
                        onClick={() => handleStartBreak('UNPAID_MEAL')}
                        className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-amber-50 rounded-lg text-amber-900 flex items-center space-x-2 transition cursor-pointer"
                      >
                        <UtensilsCrossed className="w-4 h-4 text-amber-600" />
                        <div>
                          <span className="font-bold">Unpaid Meal Break</span>
                          <span className="block text-[10px] text-slate-500 font-normal">Standard 30 minutes</span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleStartBreak('PAID_REST')}
                        className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-sky-50 rounded-lg text-sky-900 flex items-center space-x-2 transition cursor-pointer"
                      >
                        <Coffee className="w-4 h-4 text-[#0284c7]" />
                        <div>
                          <span className="font-bold">Paid Rest Break</span>
                          <span className="block text-[10px] text-slate-500 font-normal">15 minutes paid rest</span>
                        </div>
                      </button>
                    </div>
                  )}
                </div>
              ) : (
                <button
                  type="button"
                  onClick={handleEndBreak}
                  disabled={loading}
                  className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-amber-500 hover:bg-amber-600 border-2 border-amber-600 text-white shadow-md transition-all duration-200 cursor-pointer active:scale-[0.98]"
                >
                  <div className="w-16 h-16 rounded-2xl bg-amber-600/40 border border-amber-300 flex items-center justify-center mb-3">
                    <Play className="w-8 h-8 fill-current text-white animate-pulse" />
                  </div>
                  <span className="text-base font-bold text-white tracking-wide">End Break</span>
                  <span className="text-[11px] text-amber-100 mt-1">Resume active shift</span>

                  {/* Bottom Yellow Accent Strip */}
                  <div className="absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl bg-yellow-300" />
                </button>
              )}

              {/* CARD 3: CLOCK OUT */}
              <button
                type="button"
                onClick={handleClockOut}
                disabled={!isClockedIn || loading}
                className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border-2 transition-all duration-200 cursor-pointer ${
                  isClockedIn
                    ? 'bg-white hover:bg-slate-50 border-slate-200 hover:border-rose-500 shadow-sm hover:shadow-md active:scale-[0.98]'
                    : 'bg-slate-50 border-slate-100 text-slate-400 cursor-not-allowed opacity-45'
                }`}
              >
                <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-3 border ${
                  isClockedIn ? 'bg-rose-50 border-rose-200 text-rose-600' : 'bg-slate-100 border-slate-200 text-slate-400'
                }`}>
                  <LogOut className="w-8 h-8" />
                </div>
                <span className="text-base font-bold text-slate-900 tracking-tight">Clock Out</span>
                <span className="text-[11px] text-slate-500 mt-1">End Working Shift</span>

                {/* Bottom Red Accent Strip */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl transition ${
                    isClockedIn ? 'bg-rose-500' : 'bg-transparent'
                  }`}
                />
              </button>
            </div>

            {/* Shift Status Details & Notes */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5">
              <div className="flex items-center justify-between text-xs text-slate-600">
                <span className="font-medium">
                  {activeShift?.clockIn
                    ? `Started Shift at ${new Date(activeShift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${new Date(activeShift.clockIn).toLocaleDateString('en-CA')}`
                    : 'Ready to punch clock'}
                </span>
                <span className="font-mono text-[11px] font-bold text-[#0284c7] bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                  Rate: {fmtCurrency(clockStatus?.hourlyRateCents || 2200)}/hr
                </span>
              </div>

              {isClockedIn && (
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional shift notes"
                  className="w-full text-xs px-3.5 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-500/20 focus:border-[#0284c7]"
                />
              )}
            </div>

            {/* BOTTOM SUMMARY & SELF-SERVICE BAR (Matching TimeTrakGO Reference) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-3 border-t border-slate-100">
              {/* Big Bold Typography: Hours this period */}
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black font-mono text-slate-900 tracking-tight">
                    {hoursThisPeriod}
                  </span>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Hours this period
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ontario ESA Compliant • Overtime calculated after 44.0 hrs/wk @ 1.5x
                </p>
              </div>

              {/* Self-Service Navigation Action Pills */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-slate-600" />
                  <span>History</span>
                </button>

                <button
                  type="button"
                  onClick={handleExportTimesheetCsv}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition cursor-pointer shadow-2xs"
                  title="Export shift timesheet to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export CSV</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-slate-600" />
                  <span>Schedule</span>
                  {scheduledShifts.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-sky-100 text-sky-800 font-mono font-bold">
                      {scheduledShifts.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('paystubs')}
                  className="flex items-center space-x-1.5 px-4 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-xl text-xs font-bold transition shadow-sm cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>My Paystubs</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 2: ATTENDANCE HISTORY (Light Theme)
           ======================================================== */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-4 bg-white">
            <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
              <button
                onClick={() => setActiveTab('clock')}
                className="flex items-center space-x-1.5 text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Time Clock</span>
              </button>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  onClick={handleExportTimesheetCsv}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold ui-press cursor-pointer shadow-2xs"
                  title="Export shifts to CSV"
                >
                  <Download className="w-3.5 h-3.5 text-slate-500" />
                  <span>Export CSV</span>
                </button>
                <button
                  type="button"
                  onClick={handlePrintTimesheet}
                  className="flex items-center space-x-1 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold ui-press cursor-pointer"
                  title="Print timesheet"
                >
                  <Printer className="w-3.5 h-3.5 text-slate-500" />
                  <span>Print</span>
                </button>
                <span className="text-xs text-slate-500 font-medium pl-1">Shifts ({shifts.length})</span>
              </div>
            </div>

            {/* Role-based permissions banner */}
            <div className={`p-2.5 rounded-xl border text-xs flex items-center justify-between gap-2 ${
              currentUser?.role === 'ADMIN'
                ? 'bg-purple-50 border-purple-200 text-purple-900'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <div className="flex items-center space-x-2">
                <span className="text-sm">{currentUser?.role === 'ADMIN' ? '👑' : '🔒'}</span>
                <span>
                  {currentUser?.role === 'ADMIN'
                    ? 'Administrator Access: You can manually adjust, add, or correct time entries with audit logs in the Admin Console.'
                    : 'Technician View: Shift time periods and punches are permanent records. Only store administrators can modify time entries.'}
                </span>
              </div>
            </div>

            <div className="max-h-[380px] overflow-auto rounded-xl border border-slate-200 shadow-2xs">
              {shifts.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">No shifts recorded yet.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold sticky top-0 border-b border-slate-200">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Clock In (Exact)</th>
                      <th className="py-2.5 px-3">Clock Out (Exact)</th>
                      <th className="py-2.5 px-3 text-center">Breaks</th>
                      <th className="py-2.5 px-3 text-right">Exact Duration</th>
                      <th className="py-2.5 px-3 text-right">Hours</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-mono text-slate-700">
                    {shifts.map((s) => {
                      const clockInDate = new Date(s.clockIn);
                      const clockOutDate = s.clockOut ? new Date(s.clockOut) : null;
                      const durSec = clockOutDate
                        ? Math.max(0, Math.floor((clockOutDate.getTime() - clockInDate.getTime()) / 1000) - (s.breakMinutes || 0) * 60)
                        : Math.max(0, Math.floor((currentTime.getTime() - clockInDate.getTime()) / 1000) - (s.breakMinutes || 0) * 60);

                      const hrs = Math.floor(durSec / 3600);
                      const mins = Math.floor((durSec % 3600) / 60);
                      const secs = durSec % 60;
                      const pad = (n: number) => String(n).padStart(2, '0');
                      const exactDurationStr = `${pad(hrs)}:${pad(mins)}:${pad(secs)}`;
                      const hoursDecimal = (durSec / 3600).toFixed(2);

                      return (
                        <tr key={s.id} className="hover:bg-slate-50 transition">
                          <td className="py-2.5 px-3 font-sans font-semibold text-slate-900">
                            {clockInDate.toLocaleDateString('en-CA')}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {clockInDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                          </td>
                          <td className="py-2.5 px-3 text-slate-700">
                            {clockOutDate ? (
                              clockOutDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
                            ) : (
                              <span className="text-emerald-600 font-bold font-sans">Active</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center text-slate-500">{s.breakMinutes || 0}m</td>
                          <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                            {exactDurationStr}
                          </td>
                          <td className="py-2.5 px-3 text-right text-slate-600">
                            {hoursDecimal}h
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans ${
                                  s.status === 'COMPLETED'
                                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                                    : s.status === 'ACTIVE'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : 'bg-sky-100 text-sky-800 border border-sky-300'
                                }`}
                              >
                                {s.status}
                              </span>
                              {s.editedByAdminId && (
                                <span
                                  className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-purple-100 text-purple-800 uppercase font-sans"
                                  title={`Edited by admin: ${s.editReason || 'Correction'}`}
                                >
                                  Audited
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 3: ASSIGNED SHIFTS & ONTARIO ESA RULES (Light Theme)
           ======================================================== */}
        {activeTab === 'schedule' && (
          <div className="p-6 space-y-5 bg-white">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
              <button
                onClick={() => setActiveTab('clock')}
                className="flex items-center space-x-1.5 text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Time Clock</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsTimeOffModalOpen(true)}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg text-xs font-bold transition cursor-pointer"
                >
                  + Request Time Off
                </button>
                <button
                  type="button"
                  onClick={() => setIsSwapModalOpen(true)}
                  disabled={scheduledShifts.length === 0}
                  className="px-3 py-1.5 bg-sky-50 hover:bg-sky-100 text-[#0284c7] border border-sky-200 rounded-lg text-xs font-bold transition cursor-pointer disabled:opacity-40"
                >
                  ⇄ Swap Shift
                </button>
              </div>
            </div>

            {/* Total Scheduled Hours Banner */}
            <div className="p-3 bg-sky-50 border border-sky-200 rounded-xl flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-700">Upcoming Shifts Total:</span>
              <span className="font-mono font-bold text-[#0284c7]">
                {scheduledShifts.reduce((acc, s) => acc + (s.scheduledHours || s.totalHours || 0), 0).toFixed(1)} scheduled hours
              </span>
            </div>

            {/* Upcoming Shifts List */}
            <div className="space-y-2 max-h-[220px] overflow-y-auto">
              <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                My Assigned Shifts ({scheduledShifts.length})
              </div>
              {scheduledShifts.length === 0 ? (
                <div className="text-center py-6 text-slate-400 text-xs">No upcoming shifts scheduled.</div>
              ) : (
                scheduledShifts.map((sh) => (
                  <div
                    key={sh.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900">{sh.shiftDate?.slice(0, 10)}</div>
                      <div className="text-slate-600 font-mono text-[11px] mt-0.5">
                        {sh.startTime} - {sh.endTime} ({sh.scheduledHours || sh.totalHours} hrs)
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">
                        Break: {sh.breakMinutes}m ({sh.breakType === 'PAID_REST' || sh.isPaidBreak ? 'Paid' : 'Unpaid Meal'})
                      </div>
                    </div>
                    <span
                      className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                        sh.status === 'SCHEDULED'
                          ? 'bg-sky-100 text-sky-800 border border-sky-200'
                          : sh.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                          : 'bg-rose-100 text-rose-800 border border-rose-200'
                      }`}
                    >
                      {sh.status}
                    </span>
                  </div>
                ))
              )}
            </div>

            {/* My Time Off & Shift Swap Status */}
            {(timeOffRequests.length > 0 || shiftSwaps.length > 0) && (
              <div className="pt-3 border-t border-slate-100 space-y-2">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  My Requests & Approvals
                </div>
                <div className="space-y-1.5 max-h-[140px] overflow-y-auto">
                  {timeOffRequests.map((to) => (
                    <div key={to.id} className="p-2 bg-slate-50 rounded-lg text-xs flex items-center justify-between">
                      <span className="text-slate-700">
                        <strong>Time Off ({to.requestType}):</strong> {new Date(to.startDate).toLocaleDateString('en-CA')} to {new Date(to.endDate).toLocaleDateString('en-CA')}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        to.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : to.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {to.status}
                      </span>
                    </div>
                  ))}
                  {shiftSwaps.map((sw) => (
                    <div key={sw.id} className="p-2 bg-slate-50 rounded-lg text-xs flex items-center justify-between">
                      <span className="text-slate-700">
                        <strong>Shift Trade:</strong> Swap with {sw.targetUser?.name || 'Peer'}
                      </span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        sw.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-800' : sw.status === 'REJECTED' ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {sw.status}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Time Off Modal Dialog */}
            {isTimeOffModalOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 max-w-sm w-full space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Request Time Off</h4>
                    <button onClick={() => setIsTimeOffModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={handleSubmitTimeOff} className="space-y-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Reason / Leave Type</label>
                      <select
                        value={timeOffForm.requestType}
                        onChange={(e) => setTimeOffForm({ ...timeOffForm, requestType: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                      >
                        <option value="VACATION">Vacation Leave</option>
                        <option value="PERSONAL">Personal Day</option>
                        <option value="SICK">Sick Leave</option>
                        <option value="BEREAVEMENT">Bereavement</option>
                      </select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="font-semibold text-slate-600 block mb-1">Start Date</label>
                        <input
                          type="date"
                          required
                          value={timeOffForm.startDate}
                          onChange={(e) => setTimeOffForm({ ...timeOffForm, startDate: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="font-semibold text-slate-600 block mb-1">End Date</label>
                        <input
                          type="date"
                          required
                          value={timeOffForm.endDate}
                          onChange={(e) => setTimeOffForm({ ...timeOffForm, endDate: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Notes</label>
                      <input
                        type="text"
                        value={timeOffForm.reason}
                        onChange={(e) => setTimeOffForm({ ...timeOffForm, reason: e.target.value })}
                        placeholder="Optional details..."
                        className="w-full p-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsTimeOffModalOpen(false)}
                        className="px-3 py-1.5 bg-slate-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading}
                        className="px-4 py-1.5 bg-[#0284c7] text-white rounded-lg font-bold cursor-pointer"
                      >
                        Submit Request
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}

            {/* Shift Swap Modal Dialog */}
            {isSwapModalOpen && (
              <div className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-slate-900/40">
                <div className="bg-white rounded-2xl p-5 border border-slate-200 max-w-sm w-full space-y-3 shadow-xl">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-slate-900 text-sm">Request Shift Swap</h4>
                    <button onClick={() => setIsSwapModalOpen(false)} className="text-slate-400 hover:text-slate-700">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <form onSubmit={handleSubmitSwap} className="space-y-3 text-xs">
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Select Your Shift to Swap</label>
                      <select
                        required
                        value={swapForm.requesterShiftId}
                        onChange={(e) => setSwapForm({ ...swapForm, requesterShiftId: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                      >
                        <option value="">Choose shift...</option>
                        {scheduledShifts.map((sh) => (
                          <option key={sh.id} value={sh.id}>
                            {sh.shiftDate?.slice(0, 10)} ({sh.startTime} - {sh.endTime})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Trade With Colleague</label>
                      <select
                        required
                        value={swapForm.targetUserId}
                        onChange={(e) => setSwapForm({ ...swapForm, targetUserId: e.target.value })}
                        className="w-full p-2 border border-slate-300 rounded-lg"
                      >
                        <option value="">Select colleague...</option>
                        {colleagues.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.role})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="font-semibold text-slate-600 block mb-1">Reason</label>
                      <input
                        type="text"
                        value={swapForm.reason}
                        onChange={(e) => setSwapForm({ ...swapForm, reason: e.target.value })}
                        placeholder="Reason for shift swap (optional)"
                        className="w-full p-2 border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setIsSwapModalOpen(false)}
                        className="px-3 py-1.5 bg-slate-100 rounded-lg font-bold"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={loading || !swapForm.requesterShiftId || !swapForm.targetUserId}
                        className="px-4 py-1.5 bg-[#0284c7] text-white rounded-lg font-bold cursor-pointer disabled:opacity-40"
                      >
                        Send Swap Request
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ========================================================
            VIEW 4: CRA REMUNERATION & PAYSTUBS (Light Theme)
           ======================================================== */}
        {activeTab === 'paystubs' && (
          <div className="p-6 space-y-4 bg-white">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <button
                onClick={() => setActiveTab('clock')}
                className="flex items-center space-x-1.5 text-xs font-bold text-[#0284c7] hover:underline cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Time Clock</span>
              </button>
              <span className="text-xs text-slate-500 font-medium">My Official CRA Paystubs ({paystubs.length})</span>
            </div>

            <div className="space-y-2 max-h-[380px] overflow-y-auto">
              {paystubs.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">No finalized paystubs available yet.</div>
              ) : (
                paystubs.map((p) => {
                  const pStart = p.payrollPeriod?.startDate
                    ? new Date(p.payrollPeriod.startDate).toLocaleDateString('en-CA')
                    : (p.periodStart || 'N/A');
                  const pEnd = p.payrollPeriod?.endDate
                    ? new Date(p.payrollPeriod.endDate).toLocaleDateString('en-CA')
                    : (p.periodEnd || 'N/A');
                  const pDate = p.payrollPeriod?.payDate
                    ? new Date(p.payrollPeriod.payDate).toLocaleDateString('en-CA')
                    : (p.paymentDate || 'Pending');

                  return (
                    <div
                      key={p.id}
                      className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs hover:border-[#0284c7] transition"
                    >
                      <div>
                        <div className="font-bold text-slate-900">
                          Pay Period: {pStart} to {pEnd}
                        </div>
                        <div className="text-slate-600 font-mono text-[11px] mt-0.5">
                          Gross: {fmtCurrency(p.grossPayCents)} • Deductions: {fmtCurrency(p.totalDeductionsCents)}
                        </div>
                        <div className="text-[10px] text-slate-500">Payment Date: {pDate}</div>
                      </div>
                      <div className="text-right flex items-center space-x-3">
                        <div>
                          <div className="text-sm font-black font-mono text-emerald-600">
                            {fmtCurrency(p.netPayCents)}
                          </div>
                          <span className="text-[10px] text-slate-500 uppercase font-bold">Net Pay</span>
                        </div>
                        <button
                          onClick={() => setSelectedPaystub({ ...p, user: p.user || currentUser })}
                          className="px-3 py-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-lg text-xs font-bold cursor-pointer"
                        >
                          View Slip
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
          </div>
        </div>

      </div>

      {selectedPaystub && (
        <PaystubModal
          onClose={() => setSelectedPaystub(null)}
          paystub={selectedPaystub}
        />
      )}
    </div>
  );
};
