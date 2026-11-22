import React, { useState, useEffect } from 'react';
import {
  LogIn,
  LogOut,
  Coffee,
  Play,
  CheckCircle2,
  AlertCircle,
  FileText,
  ChevronRight,
  X,
  History,
  Calendar,
  DollarSign,
  User,
  ArrowLeft,
  UtensilsCrossed,
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
  const [activeTab, setActiveTab] = useState<'clock' | 'history' | 'schedule' | 'paystubs'>('clock');
  const [clockStatus, setClockStatus] = useState<any>(null);
  const [shifts, setShifts] = useState<any[]>([]);
  const [scheduledShifts, setScheduledShifts] = useState<any[]>([]);
  const [paystubs, setPaystubs] = useState<any[]>([]);
  const [selectedPaystub, setSelectedPaystub] = useState<any | null>(null);

  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [breakMenuOpen, setBreakMenuOpen] = useState(false);

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
      loadScheduledShifts();
      loadPaystubs();
      setErrorMsg(null);
      setSuccessMsg(null);
      setBreakMenuOpen(false);
    }
  }, [isOpen]);

  const loadScheduledShifts = async () => {
    try {
      const res = await fetchWithAuth(`/api/schedules?userId=${currentUser?.id}`);
      if (res.ok) {
        const json = await res.json();
        setScheduledShifts(json.data || []);
      }
    } catch {}
  };

  const getActiveShiftKey = () => `apexfix_active_shift_${currentUser?.id || 'default'}`;

  const loadClockStatus = async () => {
    try {
      const res = await fetchWithAuth('/api/timeclock/status');
      if (res.ok) {
        const json = await res.json();
        let statusData = json.data;

        // Multi-container synchronization check
        const localRaw = localStorage.getItem(getActiveShiftKey());
        if (localRaw) {
          try {
            const localShift = JSON.parse(localRaw);
            const serverClockedIn = Boolean(statusData?.isClockedIn ?? statusData?.clockedIn);
            if (!serverClockedIn && localShift?.clockIn) {
              const clockInDate = new Date(localShift.clockIn);
              const elapsedMin = Math.max(0, Math.round((Date.now() - clockInDate.getTime()) / 60000) - (localShift.breakMinutes || 0));
              statusData = {
                ...statusData,
                isClockedIn: true,
                clockedIn: true,
                isOnBreak: localShift.status === 'ON_BREAK',
                onBreak: localShift.status === 'ON_BREAK',
                activeShift: {
                  ...localShift,
                  clockIn: localShift.clockIn,
                  activeDurationMinutes: elapsedMin,
                },
              };
            }
          } catch {}
        } else if (statusData?.activeShift) {
          try {
            localStorage.setItem(getActiveShiftKey(), JSON.stringify(statusData.activeShift));
          } catch {}
        }

        setClockStatus(statusData);
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
    if (isClockedIn) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    const nowIso = new Date().toISOString();
    const tempShift = {
      id: `shift_${Date.now()}`,
      userId: currentUser?.id,
      clockIn: nowIso,
      status: 'ACTIVE',
      breakMinutes: 0,
    };
    setClockStatus((prev: any) => ({
      ...prev,
      isClockedIn: true,
      clockedIn: true,
      isOnBreak: false,
      onBreak: false,
      activeShift: tempShift,
    }));
    try {
      localStorage.setItem(getActiveShiftKey(), JSON.stringify(tempShift));
    } catch {}
    setSuccessMsg('Successfully clocked in for your shift.');
    onStatusChange?.();

    try {
      const res = await fetchWithAuth('/api/timeclock/clock-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      const json = await res.json();

      if (!res.ok) {
        if (res.status === 409) {
          const recoveredShift = json.activeShift || tempShift;
          localStorage.setItem(getActiveShiftKey(), JSON.stringify(recoveredShift));
          await loadClockStatus();
          onStatusChange?.();
          return;
        }
        throw new Error(json.error || 'Failed to clock in');
      }

      if (json.data) {
        localStorage.setItem(getActiveShiftKey(), JSON.stringify(json.data));
        setClockStatus((prev: any) => ({
          ...prev,
          activeShift: json.data,
        }));
      }

      setNotes('');
      await loadShifts();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error clocking in');
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!isClockedIn) return;
    setLoading(true);
    setErrorMsg(null);
    setSuccessMsg(null);
    let localShift = null;
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
      await loadShifts();
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
    const diffSec = Math.max(0, Math.floor((currentTime.getTime() - startMs) / 1000));
    const hours = Math.floor(diffSec / 3600);
    const mins = Math.floor((diffSec % 3600) / 60);
    const secs = diffSec % 60;
    const pad = (n: number) => String(n).padStart(2, '0');
    elapsedFormatted = `${pad(hours)}:${pad(mins)}:${pad(secs)}`;
  }

  const hoursThisPeriod = Number(clockStatus?.weeklyHours ?? clockStatus?.weekHours ?? 0).toFixed(2);
  const firstName = currentUser?.name ? currentUser.name.split(' ')[0] : 'Staff';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/75 backdrop-blur-xs overflow-y-auto">
      {/* Outer Card with Sleek Hardware/Terminal Frame */}
      <div className="relative w-full max-w-3xl bg-[#0f172a] text-slate-100 rounded-3xl shadow-2xl border border-slate-700/80 overflow-hidden my-4">
        
        {/* Top Header Bar (Matching TimeTrakGO Reference) */}
        <div className="flex items-center justify-between px-6 py-4 bg-[#1e293b] border-b border-slate-700/70">
          {/* Left: Brand & Title */}
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black text-sm shadow-inner">
              FF
            </div>
            <div>
              <h2 className="text-sm font-black tracking-wide text-white uppercase font-sans">
                Faso Fix <span className="text-indigo-400 font-semibold lowercase">time clock</span>
              </h2>
            </div>
          </div>

          {/* Center: Employee ID Badge Pill */}
          <div className="hidden sm:flex items-center space-x-2 bg-white text-slate-900 px-3.5 py-1.5 rounded-full shadow-xs border border-slate-200">
            <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center text-xs font-bold">
              <User className="w-3.5 h-3.5" />
            </div>
            <span className="text-xs font-bold font-sans">
              {currentUser?.name || 'Employee'}
            </span>
          </div>

          {/* Right: Clean Time Display & Close */}
          <div className="flex items-center space-x-4">
            <div className="text-right">
              <div className="text-base sm:text-lg font-mono font-bold text-white tracking-tight">
                {currentTime.toLocaleTimeString('en-CA', { hour12: true })}
              </div>
              <div className="text-[10px] text-slate-400 font-medium">
                {currentTime.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-700/50 rounded-lg transition cursor-pointer"
              title="Close Time Clock"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Alerts / Error & Success banners */}
        {errorMsg && (
          <div className="mx-6 mt-4 p-3 bg-red-950/80 border border-red-700/80 rounded-xl flex items-center space-x-2 text-xs text-red-200">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
        )}
        {successMsg && (
          <div className="mx-6 mt-4 p-3 bg-emerald-950/80 border border-emerald-700/80 rounded-xl flex items-center space-x-2 text-xs text-emerald-200">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* ========================================================
            VIEW 1: CLEAN 3-CARD PUNCH TERMINAL (Reference Image)
           ======================================================== */}
        {activeTab === 'clock' && (
          <div className="p-6 sm:p-8 space-y-6">
            {/* Greeting & Shift Status Line */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-slate-800">
              <p className="text-sm text-slate-300 font-medium">
                Good day <strong className="text-white font-bold">{firstName}</strong>, please select a function:
              </p>

              {/* Status Badge */}
              <div className="flex items-center space-x-2">
                <span
                  className={`inline-flex items-center space-x-2 px-3 py-1 rounded-full text-xs font-bold ${
                    isOnBreak
                      ? 'bg-amber-950/70 text-amber-300 border border-amber-600/60'
                      : isClockedIn
                      ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-600/60'
                      : 'bg-slate-800 text-slate-400 border border-slate-700'
                  }`}
                >
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isOnBreak
                        ? 'bg-amber-400 animate-ping'
                        : isClockedIn
                        ? 'bg-emerald-400 animate-pulse'
                        : 'bg-slate-500'
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

            {/* THREE LARGE ACTION CARDS (TimeTrakGO Design) */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              
              {/* CARD 1: CLOCK IN */}
              <button
                type="button"
                onClick={handleClockIn}
                disabled={isClockedIn || loading}
                className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  !isClockedIn
                    ? 'bg-[#1e293b] hover:bg-[#334155] border-slate-700 hover:border-emerald-500/60 shadow-lg hover:shadow-emerald-500/10 active:scale-[0.98]'
                    : 'bg-[#0f172a]/60 border-slate-800 text-slate-500 cursor-not-allowed opacity-40'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-[#0f172a] border border-slate-700 flex items-center justify-center mb-3">
                  <LogIn className={`w-8 h-8 ${!isClockedIn ? 'text-emerald-400' : 'text-slate-600'}`} />
                </div>
                <span className="text-base font-bold text-white tracking-wide">Clock In</span>
                <span className="text-[11px] text-slate-400 mt-1">Start Scheduled Shift</span>
                
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
                    className={`w-full h-full relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-200 cursor-pointer ${
                      isClockedIn
                        ? 'bg-[#1e293b] hover:bg-[#334155] border-slate-700 hover:border-amber-500/60 shadow-lg hover:shadow-amber-500/10 active:scale-[0.98]'
                        : 'bg-[#0f172a]/60 border-slate-800 text-slate-500 cursor-not-allowed opacity-40'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-2xl bg-[#0f172a] border border-slate-700 flex items-center justify-center mb-3">
                      <Coffee className={`w-8 h-8 ${isClockedIn ? 'text-amber-400' : 'text-slate-600'}`} />
                    </div>
                    <span className="text-base font-bold text-white tracking-wide">Take Break</span>
                    <span className="text-[11px] text-slate-400 mt-1">Meal (Unpaid) or Rest (Paid)</span>

                    {/* Bottom Amber Accent Strip */}
                    <div
                      className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl transition ${
                        isClockedIn ? 'bg-amber-500' : 'bg-transparent'
                      }`}
                    />
                  </button>

                  {/* Dropdown Options for Meal vs Rest */}
                  {breakMenuOpen && (
                    <div className="absolute top-full left-0 right-0 mt-2 z-20 bg-[#1e293b] border border-slate-700 rounded-xl shadow-xl overflow-hidden p-1 space-y-1">
                      <button
                        onClick={() => handleStartBreak('UNPAID_MEAL')}
                        className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-700 rounded-lg text-amber-300 flex items-center space-x-2 transition cursor-pointer"
                      >
                        <UtensilsCrossed className="w-4 h-4 text-amber-400" />
                        <div>
                          <span>Unpaid Meal Break</span>
                          <span className="block text-[10px] text-slate-400 font-normal">Standard 30 minutes</span>
                        </div>
                      </button>
                      <button
                        onClick={() => handleStartBreak('PAID_REST')}
                        className="w-full text-left px-3 py-2 text-xs font-semibold hover:bg-slate-700 rounded-lg text-indigo-300 flex items-center space-x-2 transition cursor-pointer"
                      >
                        <Coffee className="w-4 h-4 text-indigo-400" />
                        <div>
                          <span>Paid Rest Break</span>
                          <span className="block text-[10px] text-slate-400 font-normal">15 minutes paid rest</span>
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
                  className="relative flex flex-col items-center justify-center p-6 rounded-2xl bg-amber-600 hover:bg-amber-500 border border-amber-400 text-white shadow-xl shadow-amber-600/30 transition-all duration-200 cursor-pointer active:scale-[0.98]"
                >
                  <div className="w-16 h-16 rounded-2xl bg-amber-700/60 border border-amber-300/40 flex items-center justify-center mb-3">
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
                className={`relative flex flex-col items-center justify-center p-6 rounded-2xl border transition-all duration-200 cursor-pointer ${
                  isClockedIn
                    ? 'bg-[#1e293b] hover:bg-[#334155] border-slate-700 hover:border-rose-500/60 shadow-lg hover:shadow-rose-500/10 active:scale-[0.98]'
                    : 'bg-[#0f172a]/60 border-slate-800 text-slate-500 cursor-not-allowed opacity-40'
                }`}
              >
                <div className="w-16 h-16 rounded-2xl bg-[#0f172a] border border-slate-700 flex items-center justify-center mb-3">
                  <LogOut className={`w-8 h-8 ${isClockedIn ? 'text-rose-400' : 'text-slate-600'}`} />
                </div>
                <span className="text-base font-bold text-white tracking-wide">Clock Out</span>
                <span className="text-[11px] text-slate-400 mt-1">End Working Shift</span>

                {/* Bottom Red Accent Strip */}
                <div
                  className={`absolute bottom-0 left-0 right-0 h-1.5 rounded-b-2xl transition ${
                    isClockedIn ? 'bg-rose-500' : 'bg-transparent'
                  }`}
                />
              </button>
            </div>

            {/* Optional Shift Notes & Last Action Status */}
            <div className="bg-[#1e293b] p-3.5 rounded-xl border border-slate-800 space-y-2">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>
                  {activeShift?.clockIn
                    ? `Started Shift at ${new Date(activeShift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} on ${new Date(activeShift.clockIn).toLocaleDateString('en-CA')}`
                    : 'Ready to punch clock'}
                </span>
                <span className="font-mono text-[11px] text-indigo-400">
                  Rate: {fmtCurrency(clockStatus?.hourlyRateCents || 2200)}/hr
                </span>
              </div>

              {isClockedIn && (
                <input
                  type="text"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Optional shift notes (e.g. Completed 4 screen repairs at Bench #01)..."
                  className="w-full text-xs px-3 py-2 bg-[#0f172a] border border-slate-700 rounded-lg text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              )}
            </div>

            {/* BOTTOM SUMMARY & SELF-SERVICE BAR (Matching Image 2 Reference) */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pt-2 border-t border-slate-800">
              {/* Big Bold Typography: Hours this period */}
              <div>
                <div className="flex items-baseline space-x-2">
                  <span className="text-3xl font-black font-mono text-white tracking-tight">
                    {hoursThisPeriod}
                  </span>
                  <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    Hours this period
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Ontario ESA Compliant • Overtime calculated after 44.0 hrs/wk @ 1.5x
                </p>
              </div>

              {/* Self-Service Navigation Action Pills */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <History className="w-3.5 h-3.5 text-indigo-400" />
                  <span>History</span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('schedule')}
                  className="flex items-center space-x-1.5 px-3 py-2 bg-[#1e293b] hover:bg-[#334155] text-slate-200 border border-slate-700 rounded-xl text-xs font-semibold transition cursor-pointer"
                >
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>Schedule</span>
                  {scheduledShifts.length > 0 && (
                    <span className="ml-1 px-1.5 py-0.2 rounded-full text-[10px] bg-indigo-500/30 text-indigo-300 font-mono">
                      {scheduledShifts.length}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab('paystubs')}
                  className="flex items-center space-x-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  <span>My Paystubs</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 2: ATTENDANCE HISTORY
           ======================================================== */}
        {activeTab === 'history' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <button
                onClick={() => setActiveTab('clock')}
                className="flex items-center space-x-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Time Clock</span>
              </button>
              <span className="text-xs text-slate-400">Recent Logged Shifts ({shifts.length})</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto rounded-xl border border-slate-800">
              {shifts.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">No shifts recorded yet.</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-[#1e293b] text-slate-400 uppercase text-[10px] font-bold sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Clock In</th>
                      <th className="py-2.5 px-3">Clock Out</th>
                      <th className="py-2.5 px-3 text-center">Breaks</th>
                      <th className="py-2.5 px-3 text-right">Net Hours</th>
                      <th className="py-2.5 px-3 text-center">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/80 font-mono text-slate-300">
                    {shifts.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-800/40 transition">
                        <td className="py-2.5 px-3 font-sans font-medium text-white">
                          {new Date(s.clockIn).toLocaleDateString('en-CA')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {new Date(s.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400">
                          {s.clockOut
                            ? new Date(s.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                            : 'Active'}
                        </td>
                        <td className="py-2.5 px-3 text-center text-slate-500">{s.breakMinutes || 0}m</td>
                        <td className="py-2.5 px-3 text-right font-bold text-white">
                          {((s.totalMinutes || 0) / 60).toFixed(2)}h
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-sans ${
                              s.status === 'COMPLETED'
                                ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                : s.status === 'ACTIVE'
                                ? 'bg-emerald-950 text-emerald-300 border border-emerald-700'
                                : 'bg-indigo-950 text-indigo-300 border border-indigo-700'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 3: ASSIGNED SHIFTS SCHEDULE
           ======================================================== */}
        {activeTab === 'schedule' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <button
                onClick={() => setActiveTab('clock')}
                className="flex items-center space-x-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Time Clock</span>
              </button>
              <span className="text-xs text-indigo-300 font-semibold">Ontario ESA Regulated Schedule</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-2.5">
              {scheduledShifts.length === 0 ? (
                <div className="text-center py-10 text-slate-500 text-xs">
                  No upcoming shifts assigned by your manager.
                </div>
              ) : (
                scheduledShifts.map((shift) => (
                  <div
                    key={shift.id}
                    className="p-3.5 bg-[#1e293b] border border-slate-700/80 rounded-xl flex items-center justify-between gap-3 font-mono"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center space-x-2">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold font-sans uppercase bg-indigo-950 text-indigo-300 border border-indigo-800">
                          {shift.status}
                        </span>
                        <span className="text-xs font-bold text-white font-sans">
                          {new Date(shift.shiftDate).toLocaleDateString('en-CA', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">
                        <strong>{shift.startTime} - {shift.endTime}</strong> • {shift.scheduledHours} hrs scheduled
                      </p>
                      <p className="text-[11px] text-slate-400 font-sans">
                        Station: {shift.roleOrStation || 'Standard Bench'} • {shift.breakMinutes}m {shift.breakType === 'UNPAID_MEAL' ? 'Meal Break' : 'Rest Break'}
                      </p>
                    </div>

                    <div className="text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 font-sans">Scheduled</span>
                      <p className="text-base font-black text-white">{shift.scheduledHours}h</p>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* ========================================================
            VIEW 4: OFFICIAL PAYSTUBS
           ======================================================== */}
        {activeTab === 'paystubs' && (
          <div className="p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <button
                onClick={() => setActiveTab('clock')}
                className="flex items-center space-x-1.5 text-xs font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back to Time Clock</span>
              </button>
              <span className="text-xs text-slate-400">CRA 2026 Remuneration Statements</span>
            </div>

            <div className="max-h-[380px] overflow-y-auto space-y-3">
              {paystubs.length === 0 ? (
                <div className="text-center py-10 bg-[#1e293b]/50 rounded-2xl border border-slate-800">
                  <FileText className="w-8 h-8 text-slate-600 mx-auto mb-2" />
                  <p className="text-xs font-bold text-slate-300">No Paystubs Issued Yet</p>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Paystubs appear here automatically once your manager finalizes the payroll period.
                  </p>
                </div>
              ) : (
                paystubs.map((p) => {
                  const period = p.payrollPeriod || {};
                  return (
                    <div
                      key={p.id}
                      className="p-4 bg-[#1e293b] border border-slate-700 rounded-xl hover:border-indigo-500/60 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="space-y-1">
                        <div className="flex items-center space-x-2">
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-indigo-950 text-indigo-300 border border-indigo-800">
                            Period #{period.periodNumber || 1}
                          </span>
                          <span className="text-xs font-bold text-white">
                            {period.startDate ? new Date(period.startDate).toLocaleDateString('en-CA') : ''} —{' '}
                            {period.endDate ? new Date(period.endDate).toLocaleDateString('en-CA') : ''}
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400 font-mono">
                          Regular: {p.regularHours}h • OT: {p.overtimeHours}h • Gross: {fmtCurrency(p.grossPayCents)} • Deductions: -{fmtCurrency(p.totalDeductionsCents)}
                        </p>
                      </div>

                      <div className="flex items-center space-x-4">
                        <div className="text-right">
                          <span className="text-[10px] uppercase font-bold text-slate-400">Net Take-Home</span>
                          <p className="text-base font-black text-emerald-400 font-mono">
                            {fmtCurrency(p.netPayCents)}
                          </p>
                        </div>
                        <button
                          onClick={() => setSelectedPaystub(p)}
                          className="inline-flex items-center space-x-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-lg text-xs transition cursor-pointer"
                        >
                          <span>View Paystub</span>
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="px-6 py-3 bg-[#1e293b]/70 border-t border-slate-800 flex items-center justify-between text-[11px] text-slate-400">
          <span>Ontario Employment Standards Act (ESA) Compliant System</span>
          <button
            onClick={onClose}
            className="px-3.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg font-semibold transition cursor-pointer"
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
