import React, { useState, useEffect } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  Filter,
  RefreshCw,
  AlertCircle,
  X,
  ChevronLeft,
  ChevronRight,
  Copy,
  Download,
  Repeat,
  Check,
  ArrowRightLeft,
  CalendarCheck,
} from 'lucide-react';
import { fetchWithAuth } from '../../utils/auth';
import { posAudio } from '../../utils/audio';
import { User } from '../../types';

interface ScheduledShift {
  id: string;
  userId: string;
  user?: {
    id: string;
    name: string;
    username: string;
    role: string;
    employeeNumber?: string;
    bench?: string;
  };
  shiftDate: string;
  startTime: string;
  endTime: string;
  startDateTime: string;
  endDateTime: string;
  breakMinutes: number;
  breakType: 'UNPAID_MEAL' | 'PAID_REST';
  scheduledHours: number;
  roleOrStation?: string | null;
  branchLocation?: string | null;
  recurrenceRule?: string | null;
  isPublished?: boolean;
  notes?: string | null;
  status: 'SCHEDULED' | 'CONFIRMED' | 'COMPLETED' | 'MISSED' | 'CANCELLED';
  createdById?: string | null;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ScheduleComparison {
  summary: {
    totalScheduledShifts: number;
    totalScheduledHours: number;
    totalActualHours: number;
    netVarianceHours: number;
    totalLateArrivals: number;
    totalMissedShifts: number;
    onTimeRatePct: number;
  };
  details: Array<{
    shiftId: string;
    userId: string;
    userName: string;
    userRole: string;
    shiftDate: string;
    scheduledStart: string;
    scheduledEnd: string;
    scheduledHours: number;
    actualClockIn: string | null;
    actualClockOut: string | null;
    actualHoursWorked: number;
    varianceHours: number;
    isLate: boolean;
    isMissed: boolean;
    status: string;
  }>;
}

interface TimeOffRequest {
  id: string;
  userId: string;
  user?: { id: string; name: string; username: string; role: string; employeeNumber?: string };
  requestType: string;
  startDate: string;
  endDate: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  reviewNotes?: string;
  createdAt: string;
}

interface ShiftSwapRequest {
  id: string;
  requesterId: string;
  requesterShiftId: string;
  targetUserId: string;
  targetShiftId?: string;
  reason?: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  requester?: { id: string; name: string };
  targetUser?: { id: string; name: string };
  createdAt: string;
}

interface AdminScheduleTabProps {
  users: User[];
  currentUser: User;
}

// Consistent employee color generator for calendar badges
const EMPLOYEE_COLORS = [
  { bg: 'bg-sky-50 text-sky-800 border-sky-300', dot: 'bg-sky-500' },
  { bg: 'bg-emerald-50 text-emerald-800 border-emerald-300', dot: 'bg-emerald-500' },
  { bg: 'bg-violet-50 text-violet-800 border-violet-300', dot: 'bg-violet-500' },
  { bg: 'bg-amber-50 text-amber-800 border-amber-300', dot: 'bg-amber-500' },
  { bg: 'bg-rose-50 text-rose-800 border-rose-300', dot: 'bg-rose-500' },
  { bg: 'bg-indigo-50 text-indigo-800 border-indigo-300', dot: 'bg-indigo-500' },
  { bg: 'bg-teal-50 text-teal-800 border-teal-300', dot: 'bg-teal-500' },
];

function getEmployeeColor(userId: string, activeUsers: User[]) {
  const index = activeUsers.findIndex((u) => u.id === userId);
  return EMPLOYEE_COLORS[(index >= 0 ? index : 0) % EMPLOYEE_COLORS.length];
}

function toLocalDateStr(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const AdminScheduleTab: React.FC<AdminScheduleTabProps> = ({ users }) => {
  const [calendarView, setCalendarView] = useState<'month' | 'week' | 'day' | 'list' | 'requests' | 'compare'>('week');
  const [shifts, setShifts] = useState<ScheduledShift[]>([]);
  const [comparison, setComparison] = useState<ScheduleComparison | null>(null);
  const [timeOffRequests, setTimeOffRequests] = useState<TimeOffRequest[]>([]);
  const [shiftSwaps, setShiftSwaps] = useState<ShiftSwapRequest[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');

  // Navigation Date Anchor
  const [currentDateAnchor, setCurrentDateAnchor] = useState<Date>(new Date());

  // Modal State for Shift Create / Edit
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({
    userId: '',
    shiftDate: toLocalDateStr(new Date()),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    breakType: 'UNPAID_MEAL' as 'UNPAID_MEAL' | 'PAID_REST',
    roleOrStation: 'Bench #01',
    branchLocation: 'Main Shop - Toronto',
    recurrenceRule: 'NONE' as 'NONE' | 'DAILY' | 'WEEKLY' | 'BIWEEKLY',
    recurrenceCount: 4,
    notes: '',
  });
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [savedWithWarnings, setSavedWithWarnings] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeUsers = users.filter((u) => u.status !== 'DISABLED');

  const getApprovedTimeOffForDate = (dateStr: string) =>
    timeOffRequests.filter((to) => {
      if (to.status !== 'APPROVED') return false;
      const startStr = to.startDate.slice(0, 10);
      const endStr = to.endDate.slice(0, 10);
      return dateStr >= startStr && dateStr <= endStr && (selectedUserId === 'ALL' || to.userId === selectedUserId);
    });

  // Load shifts for current anchor range
  const loadShifts = async () => {
    setIsLoading(true);
    try {
      let url = '/api/schedules';
      const params = new URLSearchParams();
      if (selectedUserId !== 'ALL') params.append('userId', selectedUserId);

      // Determine date window depending on view
      const anchor = new Date(currentDateAnchor);
      const start = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
      const end = new Date(anchor.getFullYear(), anchor.getMonth() + 2, 0);
      params.append('startDate', start.toISOString());
      params.append('endDate', end.toISOString());

      url += `?${params.toString()}`;

      const res = await fetchWithAuth(url);
      if (res.ok) {
        const json = await res.json();
        setShifts(json.data || []);
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to load scheduled shifts.' });
    } finally {
      setIsLoading(false);
    }
  };

  const loadRequests = async () => {
    try {
      const [toRes, swapRes] = await Promise.all([
        fetchWithAuth('/api/time-off'),
        fetchWithAuth('/api/shift-swaps'),
      ]);
      if (toRes.ok) {
        const json = await toRes.json();
        setTimeOffRequests(json.data || []);
      }
      if (swapRes.ok) {
        const json = await swapRes.json();
        setShiftSwaps(json.data || []);
      }
    } catch {}
  };

  const loadComparison = async () => {
    setIsLoading(true);
    try {
      const start = new Date(Date.now() - 14 * 86400000).toISOString();
      const end = new Date().toISOString();
      const res = await fetchWithAuth(`/api/schedules/compare?startDate=${start}&endDate=${end}`);
      if (res.ok) {
        const json = await res.json();
        setComparison(json.data || null);
      }
    } catch {
      setActionMessage({ type: 'error', text: 'Failed to load schedule vs actual comparisons.' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  useEffect(() => {
    if (calendarView === 'compare') {
      loadComparison();
    } else if (calendarView === 'requests') {
      loadRequests();
    } else {
      loadShifts();
    }
  }, [calendarView, selectedUserId, currentDateAnchor]);

  // Navigate calendar
  const handleNavPrev = () => {
    const d = new Date(currentDateAnchor);
    if (calendarView === 'month') {
      d.setMonth(d.getMonth() - 1);
    } else if (calendarView === 'week') {
      d.setDate(d.getDate() - 7);
    } else if (calendarView === 'day') {
      d.setDate(d.getDate() - 1);
    }
    setCurrentDateAnchor(d);
  };

  const handleNavNext = () => {
    const d = new Date(currentDateAnchor);
    if (calendarView === 'month') {
      d.setMonth(d.getMonth() + 1);
    } else if (calendarView === 'week') {
      d.setDate(d.getDate() + 7);
    } else if (calendarView === 'day') {
      d.setDate(d.getDate() + 1);
    }
    setCurrentDateAnchor(d);
  };

  const handleNavToday = () => {
    setCurrentDateAnchor(new Date());
  };

  const openCreateModal = (targetDateStr?: string) => {
    setEditingShiftId(null);
    setShiftForm({
      userId: activeUsers[0]?.id || '',
      shiftDate: targetDateStr || toLocalDateStr(new Date()),
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      breakType: 'UNPAID_MEAL',
      roleOrStation: 'Bench #01',
      branchLocation: 'Main Shop - Toronto',
      recurrenceRule: 'NONE',
      recurrenceCount: 4,
      notes: '',
    });
    setFormWarnings([]);
    setSavedWithWarnings(false);
    setIsModalOpen(true);
  };

  const openEditModal = (shift: ScheduledShift) => {
    setEditingShiftId(shift.id);
    setShiftForm({
      userId: shift.userId,
      shiftDate: shift.shiftDate.slice(0, 10),
      startTime: shift.startTime,
      endTime: shift.endTime,
      breakMinutes: shift.breakMinutes,
      breakType: shift.breakType,
      roleOrStation: shift.roleOrStation || 'Bench #01',
      branchLocation: shift.branchLocation || 'Main Shop - Toronto',
      recurrenceRule: 'NONE',
      recurrenceCount: 1,
      notes: shift.notes || '',
    });
    setFormWarnings([]);
    setSavedWithWarnings(false);
    setIsModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savedWithWarnings) {
      setIsModalOpen(false);
      setSavedWithWarnings(false);
      return;
    }
    setIsSubmitting(true);
    setActionMessage(null);

    try {
      let res;
      if (editingShiftId) {
        res = await fetchWithAuth(`/api/schedules/${editingShiftId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shiftForm),
        });
      } else {
        res = await fetchWithAuth('/api/schedules', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(shiftForm),
        });
      }

      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'Failed to save shift');
      }

      posAudio.playSuccessChime();
      setActionMessage({
        type: 'success',
        text: editingShiftId
          ? 'Scheduled shift updated successfully.'
          : `Shift scheduled successfully${json.createdShifts?.length > 1 ? ` (${json.createdShifts.length} recurring shifts created)` : ''}!`,
      });

      if (json.warnings && json.warnings.length > 0) {
        setFormWarnings(json.warnings);
        setSavedWithWarnings(true);
        posAudio.playWarningBeep();
      } else {
        setIsModalOpen(false);
      }
      loadShifts();
    } catch (err: any) {
      posAudio.playWarningBeep();
      setActionMessage({ type: 'error', text: err.message || 'Operation failed.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    if (!window.confirm('Are you sure you want to cancel and remove this shift from the schedule?')) return;
    try {
      const res = await fetchWithAuth(`/api/schedules/${shiftId}`, { method: 'DELETE' });
      if (res.ok) {
        posAudio.playSuccessChime();
        setActionMessage({ type: 'success', text: 'Shift removed from calendar.' });
        loadShifts();
      } else {
        throw new Error('Failed to delete shift');
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleDuplicateShift = async (shift: ScheduledShift) => {
    const nextDay = new Date(new Date(shift.shiftDate).getTime() + 86400000).toISOString().slice(0, 10);
    const targetDate = window.prompt('Enter target date to duplicate this shift to (YYYY-MM-DD):', nextDay);
    if (!targetDate) return;

    try {
      const res = await fetchWithAuth(`/api/schedules/${shift.id}/duplicate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetDate }),
      });
      if (res.ok) {
        posAudio.playSuccessChime();
        setActionMessage({ type: 'success', text: `Shift duplicated to ${targetDate}!` });
        loadShifts();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleExportCsv = async () => {
    try {
      const res = await fetchWithAuth('/api/schedules/export-csv');
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `faso-fix-schedules-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        window.URL.revokeObjectURL(url);
      }
    } catch {
      alert('Failed to download CSV export');
    }
  };

  const handleReviewTimeOff = async (requestId: string, status: 'APPROVED' | 'REJECTED') => {
    const notes = window.prompt(`Optional notes for ${status.toLowerCase()} this time off request:`, '');
    try {
      const res = await fetchWithAuth(`/api/time-off/${requestId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewNotes: notes || undefined }),
      });
      if (res.ok) {
        posAudio.playSuccessChime();
        setActionMessage({ type: 'success', text: `Time-off request ${status.toLowerCase()}!` });
        loadRequests();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  const handleReviewShiftSwap = async (swapId: string, status: 'APPROVED' | 'REJECTED') => {
    const notes = window.prompt(`Optional notes for ${status.toLowerCase()} this shift swap:`, '');
    try {
      const res = await fetchWithAuth(`/api/shift-swaps/${swapId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, reviewNotes: notes || undefined }),
      });
      if (res.ok) {
        posAudio.playSuccessChime();
        setActionMessage({ type: 'success', text: `Shift swap ${status.toLowerCase()}!` });
        loadRequests();
        loadShifts();
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  // Helper date math for weekly view
  const getWeekDates = () => {
    const anchor = new Date(currentDateAnchor);
    const day = (anchor.getDay() + 6) % 7; // Monday = 0
    const monday = new Date(anchor);
    monday.setDate(anchor.getDate() - day);

    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      week.push(d);
    }
    return week;
  };

  // Helper for monthly calendar cells
  const getMonthMatrix = () => {
    const year = currentDateAnchor.getFullYear();
    const month = currentDateAnchor.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);

    const matrix: Array<Date | null>[] = [];
    let currentWeek: Array<Date | null> = [];

    // Empty lead cells
    const startDay = (firstDay.getDay() + 6) % 7;
    for (let i = 0; i < startDay; i++) {
      currentWeek.push(null);
    }

    for (let day = 1; day <= lastDay.getDate(); day++) {
      currentWeek.push(new Date(year, month, day));
      if (currentWeek.length === 7) {
        matrix.push(currentWeek);
        currentWeek = [];
      }
    }

    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) {
        currentWeek.push(null);
      }
      matrix.push(currentWeek);
    }

    return matrix;
  };

  return (
    <div className="space-y-6">
      {/* Top Action & Navigation Header */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarIcon className="w-5 h-5 text-[#0284c7]" />
              Workforce Shift Scheduling & Roster
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Interactive Canadian employee calendar • Ontario ESA compliant • 44h weekly overtime tracking
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* View Mode Switcher Pills */}
            <div className="flex bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                onClick={() => setCalendarView('week')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  calendarView === 'week' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Week
              </button>
              <button
                onClick={() => setCalendarView('month')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  calendarView === 'month' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setCalendarView('day')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  calendarView === 'day' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Day
              </button>
              <button
                onClick={() => setCalendarView('list')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  calendarView === 'list' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                List
              </button>
              <button
                onClick={() => setCalendarView('requests')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                  calendarView === 'requests' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <span>Requests</span>
                {(timeOffRequests.filter((r) => r.status === 'PENDING').length +
                  shiftSwaps.filter((s) => s.status === 'PENDING').length >
                  0) && (
                  <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                )}
              </button>
              <button
                onClick={() => setCalendarView('compare')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition cursor-pointer ${
                  calendarView === 'compare' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Variance
              </button>
            </div>

            {/* Export CSV Button */}
            <button
              onClick={handleExportCsv}
              className="flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>

            {/* Add Shift Button */}
            <button
              onClick={() => openCreateModal()}
              className="flex items-center space-x-1.5 px-4 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Create Shift</span>
            </button>
          </div>
        </div>

        {/* Date Navigator Bar & Employee Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-3 border-t border-slate-100">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleNavPrev}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
              title="Previous period"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleNavToday}
              className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-xs font-bold text-slate-700 transition cursor-pointer"
            >
              Today
            </button>
            <button
              onClick={loadShifts}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
              title="Refresh"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-[#0284c7]' : ''}`} />
            </button>
            <button
              onClick={handleNavNext}
              className="p-1.5 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-700 transition cursor-pointer"
              title="Next period"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <span className="text-sm font-black text-slate-800 ml-2">
              {calendarView === 'month'
                ? currentDateAnchor.toLocaleDateString('en-CA', { month: 'long', year: 'numeric' })
                : calendarView === 'week'
                ? `Week of ${getWeekDates()[0]?.toLocaleDateString('en-CA', { month: 'short', day: 'numeric' })} – ${getWeekDates()[6]?.toLocaleDateString('en-CA', { month: 'short', day: 'numeric', year: 'numeric' })}`
                : currentDateAnchor.toLocaleDateString('en-CA', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>

          <div className="flex items-center space-x-3">
            <label className="text-xs text-slate-500 font-semibold flex items-center gap-1.5">
              <Filter className="w-3.5 h-3.5" />
              Filter Employee:
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="text-xs bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-slate-800 font-medium focus:outline-none focus:border-[#0284c7]"
            >
              <option value="ALL">All Employees ({activeUsers.length})</option>
              {activeUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Action toast */}
        {actionMessage && (
          <div
            className={`p-3 rounded-xl flex items-center justify-between text-xs font-semibold ${
              actionMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center space-x-2">
              {actionMessage.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{actionMessage.text}</span>
            </div>
            <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-700">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* ========================================================
          VIEW 1: WEEKLY TIMETABLE GRID VIEW
         ======================================================== */}
      {calendarView === 'week' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold">
            {getWeekDates().map((d, i) => {
              const isToday = d.toDateString() === new Date().toDateString();
              const dateStr = toLocalDateStr(d);
              const dayShifts = shifts.filter((s) => s.shiftDate.slice(0, 10) === dateStr);
              const totalDayHours = dayShifts.reduce((acc, s) => acc + s.scheduledHours, 0);

              return (
                <div
                  key={i}
                  className={`p-3 text-center border-r border-slate-200 last:border-r-0 ${
                    isToday ? 'bg-sky-50/70 text-[#0284c7]' : ''
                  }`}
                >
                  <div className="uppercase tracking-wider text-[10px] text-slate-400">
                    {d.toLocaleDateString('en-CA', { weekday: 'short' })}
                  </div>
                  <div className="text-base font-black mt-0.5">{d.getDate()}</div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    {dayShifts.length} {dayShifts.length === 1 ? 'shift' : 'shifts'} • {totalDayHours.toFixed(1)}h
                  </div>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-7 min-h-[480px] divide-x divide-slate-100 bg-slate-50/30">
            {getWeekDates().map((d, i) => {
              const dateStr = toLocalDateStr(d);
              const dayShifts = shifts.filter((s) => s.shiftDate.slice(0, 10) === dateStr);
              const dayTimeOffs = getApprovedTimeOffForDate(dateStr);

              return (
                <div key={i} className="p-2 space-y-2 flex flex-col justify-between group">
                  <div className="space-y-2">
                    {dayTimeOffs.map((to) => (
                      <div
                        key={`to-${to.id}-${dateStr}`}
                        className="px-2 py-1 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-[10px] font-semibold truncate"
                        title={`${to.user?.name || 'Staff'}: Approved ${to.requestType}`}
                      >
                        Off: {to.user?.name || 'Staff'} ({to.requestType})
                      </div>
                    ))}
                    {dayShifts.map((shift) => {
                      const color = getEmployeeColor(shift.userId, activeUsers);
                      return (
                        <div
                          key={shift.id}
                          className={`p-2.5 rounded-xl border ${color.bg} shadow-2xs hover:shadow-sm transition text-xs space-y-1 relative group/card`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold truncate text-slate-900">
                              {shift.user?.name || 'Technician'}
                            </span>
                            <span className="font-mono text-[10px] font-bold text-slate-500">
                              {shift.scheduledHours}h
                            </span>
                          </div>

                          <div className="font-mono text-[11px] text-slate-600 flex items-center gap-1">
                            <Clock className="w-3 h-3 text-slate-400" />
                            {shift.startTime} – {shift.endTime}
                          </div>

                          <div className="text-[10px] text-slate-500 truncate flex items-center justify-between">
                            <span>{shift.roleOrStation || 'Bench #01'}</span>
                            <span className="text-[9px] font-semibold text-slate-400">{shift.breakMinutes}m brk</span>
                          </div>

                          {/* Quick action buttons on card hover */}
                          <div className="pt-1.5 flex items-center justify-end gap-1.5 border-t border-slate-200/50 opacity-90 group-hover/card:opacity-100">
                            <button
                              onClick={() => handleDuplicateShift(shift)}
                              title="Duplicate to tomorrow"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            >
                              <Copy className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => openEditModal(shift)}
                              title="Edit shift"
                              className="p-1 text-slate-400 hover:text-slate-700 rounded cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => handleDeleteShift(shift.id)}
                              title="Delete shift"
                              className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      );
                    })}

                    {dayShifts.length === 0 && (
                      <div className="h-28 flex items-center justify-center text-[11px] text-slate-300 font-medium">
                        No shifts
                      </div>
                    )}
                  </div>

                  {/* Add Shift button for this exact day */}
                  <button
                    onClick={() => openCreateModal(dateStr)}
                    className="w-full py-1.5 border border-dashed border-slate-300 hover:border-[#0284c7] hover:bg-sky-50/50 rounded-lg text-slate-400 hover:text-[#0284c7] text-[11px] font-bold transition flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    <span>Add Shift</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ========================================================
          VIEW 2: FULL MONTH CALENDAR GRID
         ======================================================== */}
      {calendarView === 'month' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 text-slate-600 text-xs font-bold text-center py-2.5">
            <div>Mon</div>
            <div>Tue</div>
            <div>Wed</div>
            <div>Thu</div>
            <div>Fri</div>
            <div>Sat</div>
            <div>Sun</div>
          </div>

          <div className="divide-y divide-slate-100">
            {getMonthMatrix().map((week, wIndex) => (
              <div key={wIndex} className="grid grid-cols-7 divide-x divide-slate-100 min-h-[110px]">
                {week.map((date, dIndex) => {
                  if (!date) {
                    return <div key={dIndex} className="bg-slate-50/50 p-2" />;
                  }

                  const dateStr = toLocalDateStr(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const dayShifts = shifts.filter((s) => s.shiftDate.slice(0, 10) === dateStr);
                  const dayTimeOffs = getApprovedTimeOffForDate(dateStr);

                  return (
                    <div
                      key={dIndex}
                      onClick={(e) => {
                        if ((e.target as HTMLElement).tagName !== 'BUTTON') {
                          openCreateModal(dateStr);
                        }
                      }}
                      className={`p-2 flex flex-col justify-between hover:bg-sky-50/20 transition cursor-pointer ${
                        isToday ? 'bg-sky-50/40' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span
                          className={`text-xs font-bold ${
                            isToday
                              ? 'w-6 h-6 rounded-full bg-[#0284c7] text-white flex items-center justify-center'
                              : 'text-slate-700'
                          }`}
                        >
                          {date.getDate()}
                        </span>
                        {dayShifts.length > 0 && (
                          <span className="text-[10px] font-bold text-slate-400">
                            {dayShifts.length} {dayShifts.length === 1 ? 'shift' : 'shifts'}
                          </span>
                        )}
                      </div>

                      <div className="space-y-1 my-1">
                        {dayTimeOffs.slice(0, 1).map((to) => (
                          <div
                            key={`mto-${to.id}-${dateStr}`}
                            className="px-1.5 py-0.5 rounded text-[9px] font-semibold bg-amber-50 text-amber-800 border border-amber-200 truncate"
                          >
                            Off: {to.user?.name || 'Staff'}
                          </div>
                        ))}
                        {dayShifts.slice(0, 3).map((shift) => {
                          const color = getEmployeeColor(shift.userId, activeUsers);
                          return (
                            <div
                              key={shift.id}
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditModal(shift);
                              }}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-semibold border ${color.bg} truncate flex items-center justify-between`}
                            >
                              <span className="truncate">{shift.user?.name || 'Staff'}</span>
                              <span className="font-mono text-[9px] text-slate-500 shrink-0 ml-1">
                                {shift.startTime}
                              </span>
                            </div>
                          );
                        })}
                        {dayShifts.length > 3 && (
                          <div className="text-[9px] font-bold text-slate-400 text-center">
                            +{dayShifts.length - 3} more
                          </div>
                        )}
                      </div>

                      <div className="text-[10px] text-slate-300 text-right opacity-0 hover:opacity-100 transition">
                        + click to add
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ========================================================
          VIEW 3: DAILY TIMELINE & COVERAGE VIEW
         ======================================================== */}
      {calendarView === 'day' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                Staff Coverage for {currentDateAnchor.toLocaleDateString('en-CA', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
              </h3>
              <p className="text-xs text-slate-500">
                Hourly roster overview • Bench assignment and break schedule
              </p>
            </div>
            <button
              onClick={() => openCreateModal(toLocalDateStr(currentDateAnchor))}
              className="flex items-center space-x-1.5 px-3 py-1.5 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-lg text-xs font-bold transition shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Shift Today</span>
            </button>
          </div>

          {shifts.filter((s) => s.shiftDate.slice(0, 10) === toLocalDateStr(currentDateAnchor)).length === 0 ? (
            <div className="text-center py-16 text-slate-400 text-xs">
              No shifts scheduled for this day.{' '}
              <button
                onClick={() => openCreateModal(toLocalDateStr(currentDateAnchor))}
                className="text-[#0284c7] font-bold hover:underline"
              >
                Click here to schedule staff.
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {shifts
                .filter((s) => s.shiftDate.slice(0, 10) === toLocalDateStr(currentDateAnchor))
                .map((shift) => {
                  const color = getEmployeeColor(shift.userId, activeUsers);
                  return (
                    <div
                      key={shift.id}
                      className="p-4 rounded-xl border border-slate-200 bg-white hover:border-[#0284c7] transition flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                    >
                      <div className="flex items-center space-x-3">
                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${color.bg}`}>
                          {shift.user?.name ? shift.user.name.slice(0, 2).toUpperCase() : 'TC'}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{shift.user?.name}</div>
                          <div className="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                            <span className="font-medium text-slate-700">{shift.roleOrStation || 'Bench #01'}</span>
                            <span>•</span>
                            <span>{shift.branchLocation || 'Main Shop'}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-6 text-xs">
                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Hours</span>
                          <span className="font-mono font-bold text-slate-800 text-sm">
                            {shift.startTime} – {shift.endTime}
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Break</span>
                          <span className="text-slate-700 font-medium">
                            {shift.breakMinutes}m ({shift.breakType === 'PAID_REST' ? 'Paid' : 'Unpaid Meal'})
                          </span>
                        </div>

                        <div>
                          <span className="text-[10px] text-slate-400 uppercase font-bold block">Scheduled</span>
                          <span className="font-mono font-bold text-emerald-600 text-sm">
                            {shift.scheduledHours} hrs
                          </span>
                        </div>

                        <div className="flex items-center space-x-1.5">
                          <button
                            onClick={() => openEditModal(shift)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title="Edit"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteShift(shift.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Delete"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          VIEW 4: LIST VIEW OF ALL SCHEDULED SHIFTS
         ======================================================== */}
      {calendarView === 'list' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Scheduled Shifts Roster ({shifts.length})
            </h3>
            <span className="text-xs text-slate-500 font-medium">
              Total Hours: {shifts.reduce((acc, s) => acc + s.scheduledHours, 0).toFixed(1)}h
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Date</th>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Role / Station</th>
                  <th className="py-3 px-4">Time Window</th>
                  <th className="py-3 px-4 text-center">Break</th>
                  <th className="py-3 px-4 text-right">Hours</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {shifts.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-mono font-bold text-slate-900">
                      {s.shiftDate.slice(0, 10)}
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-800">
                      {s.user?.name || 'Technician'}
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {s.roleOrStation || 'Bench #01'}
                    </td>
                    <td className="py-3 px-4 font-mono">
                      {s.startTime} – {s.endTime}
                    </td>
                    <td className="py-3 px-4 text-center text-slate-500">
                      {s.breakMinutes}m
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                      {s.scheduledHours.toFixed(2)}h
                    </td>
                    <td className="py-3 px-4 text-center">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-sky-100 text-sky-800">
                        {s.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right space-x-1.5">
                      <button
                        onClick={() => handleDuplicateShift(s)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Duplicate"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => openEditModal(s)}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                        title="Edit"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteShift(s.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          VIEW 5: PENDING TIME-OFF & SHIFT SWAP REQUESTS
         ======================================================== */}
      {calendarView === 'requests' && (
        <div className="space-y-6">
          {/* Time Off Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CalendarCheck className="w-4 h-4 text-[#0284c7]" />
                  Employee Time-Off Requests ({timeOffRequests.length})
                </h3>
                <p className="text-xs text-slate-500">Vacation, personal, sick and bereavement leaves</p>
              </div>
            </div>

            {timeOffRequests.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">No time-off requests submitted.</div>
            ) : (
              <div className="space-y-2">
                {timeOffRequests.map((req) => (
                  <div
                    key={req.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {req.user?.name || 'Staff Member'} – <span className="text-[#0284c7]">{req.requestType}</span>
                      </div>
                      <div className="text-slate-600 font-mono mt-0.5">
                        {new Date(req.startDate).toLocaleDateString('en-CA')} to {new Date(req.endDate).toLocaleDateString('en-CA')}
                      </div>
                      {req.reason && <div className="text-slate-500 italic mt-0.5">"{req.reason}"</div>}
                    </div>

                    <div className="flex items-center space-x-2">
                      {req.status === 'PENDING' ? (
                        <>
                          <button
                            onClick={() => handleReviewTimeOff(req.id, 'APPROVED')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve</span>
                          </button>
                          <button
                            onClick={() => handleReviewTimeOff(req.id, 'REJECTED')}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            req.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {req.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Shift Swaps Section */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <ArrowRightLeft className="w-4 h-4 text-[#0284c7]" />
                  Shift Swap Requests ({shiftSwaps.length})
                </h3>
                <p className="text-xs text-slate-500">Peer technician shift trade requests awaiting admin sign-off</p>
              </div>
            </div>

            {shiftSwaps.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">No shift swap requests submitted.</div>
            ) : (
              <div className="space-y-2">
                {shiftSwaps.map((swap) => (
                  <div
                    key={swap.id}
                    className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-900 text-sm">
                        {swap.requester?.name || 'Staff'} ➔ Swap with {swap.targetUser?.name || 'Peer'}
                      </div>
                      {swap.reason && <div className="text-slate-500 italic mt-0.5">"{swap.reason}"</div>}
                    </div>

                    <div className="flex items-center space-x-2">
                      {swap.status === 'PENDING' ? (
                        <>
                          <button
                            onClick={() => handleReviewShiftSwap(swap.id, 'APPROVED')}
                            className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <Check className="w-3.5 h-3.5" />
                            <span>Approve Swap</span>
                          </button>
                          <button
                            onClick={() => handleReviewShiftSwap(swap.id, 'REJECTED')}
                            className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold transition cursor-pointer flex items-center gap-1"
                          >
                            <X className="w-3.5 h-3.5" />
                            <span>Reject</span>
                          </button>
                        </>
                      ) : (
                        <span
                          className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                            swap.status === 'APPROVED'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-rose-100 text-rose-800'
                          }`}
                        >
                          {swap.status}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ========================================================
          VIEW 6: SCHEDULE VS ACTUAL ATTENDANCE VARIANCE
         ======================================================== */}
      {calendarView === 'compare' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 space-y-6">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Attendance & Punctuality Audit (Schedule vs Actual Clock-In)
            </h3>
            <p className="text-xs text-slate-500">
              Audit log of scheduled hours vs actual POS punch records • Late arrival & absence detection
            </p>
          </div>

          {comparison && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Scheduled Hours</span>
                <span className="text-2xl font-black font-mono text-slate-900">
                  {comparison.summary.totalScheduledHours}
                </span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Actual Hours Worked</span>
                <span className="text-2xl font-black font-mono text-slate-900">
                  {comparison.summary.totalActualHours}
                </span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">On-Time Rate</span>
                <span className="text-2xl font-black font-mono text-emerald-600">
                  {comparison.summary.onTimeRatePct}%
                </span>
              </div>
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl">
                <span className="text-[10px] text-slate-400 uppercase font-bold block">Late / Missed</span>
                <span className="text-2xl font-black font-mono text-rose-600">
                  {comparison.summary.totalLateArrivals} / {comparison.summary.totalMissedShifts}
                </span>
              </div>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Employee</th>
                  <th className="py-2.5 px-3">Scheduled Window</th>
                  <th className="py-2.5 px-3">Actual Clock In</th>
                  <th className="py-2.5 px-3">Actual Clock Out</th>
                  <th className="py-2.5 px-3 text-right">Variance</th>
                  <th className="py-2.5 px-3 text-center">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {comparison?.details.map((d, i) => (
                  <tr key={i} className="hover:bg-slate-50 transition">
                    <td className="py-2.5 px-3 font-mono font-bold text-slate-900">{d.shiftDate.slice(0, 10)}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-800">{d.userName}</td>
                    <td className="py-2.5 px-3 font-mono">
                      {d.scheduledStart} – {d.scheduledEnd} ({d.scheduledHours}h)
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {d.actualClockIn ? new Date(d.actualClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-600">
                      {d.actualClockOut ? new Date(d.actualClockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '—'}
                    </td>
                    <td
                      className={`py-2.5 px-3 text-right font-mono font-bold ${
                        d.varianceHours < 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      {d.varianceHours > 0 ? `+${d.varianceHours}` : d.varianceHours}h
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          d.status === 'ON_TIME'
                            ? 'bg-emerald-100 text-emerald-800'
                            : d.status === 'LATE'
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        {d.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ========================================================
          MODAL: CREATE / EDIT SHIFT
         ======================================================== */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs overflow-y-auto">
          <div className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden my-6">
            <div className="flex items-center justify-between px-6 py-4 bg-[#0284c7] text-white">
              <h3 className="text-base font-bold flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-sky-200" />
                {editingShiftId ? 'Edit Scheduled Shift' : 'Create Employee Shift'}
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveShift} className="p-6 space-y-4">
              {/* Ontario ESA & Conflict Warnings */}
              {formWarnings.length > 0 && (
                <div className="p-3.5 bg-amber-50 border border-amber-300 rounded-xl space-y-1 text-xs text-amber-900">
                  <div className="font-bold flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    Ontario Employment Standards & Scheduling Notice:
                  </div>
                  {formWarnings.map((w, idx) => (
                    <div key={idx} className="text-[11px] leading-relaxed">
                      {w}
                    </div>
                  ))}
                  <p className="text-[10px] text-amber-700 italic pt-1">
                    {savedWithWarnings
                      ? 'This shift has been saved with the compliance notices recorded above.'
                      : 'Review notices above before closing.'}
                  </p>
                </div>
              )}

              {/* Employee Selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">
                  Assign Employee / Technician *
                </label>
                <select
                  required
                  value={shiftForm.userId}
                  onChange={(e) => setShiftForm({ ...shiftForm, userId: e.target.value })}
                  className="w-full text-xs px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#0284c7]"
                >
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} — {u.role} ({(u as any).employeeNumber || 'ID: Staff'})
                    </option>
                  ))}
                </select>
              </div>

              {/* Shift Date & Station */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Shift Date *</label>
                  <input
                    type="date"
                    required
                    value={shiftForm.shiftDate}
                    onChange={(e) => setShiftForm({ ...shiftForm, shiftDate: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#0284c7]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Bench / Role</label>
                  <input
                    type="text"
                    value={shiftForm.roleOrStation}
                    onChange={(e) => setShiftForm({ ...shiftForm, roleOrStation: e.target.value })}
                    placeholder="e.g. Bench #01"
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#0284c7]"
                  />
                </div>
              </div>

              {/* Start & End Times */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Start Time (24h) *</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-[#0284c7]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">End Time (24h) *</label>
                  <input
                    type="time"
                    required
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 font-mono focus:outline-none focus:border-[#0284c7]"
                  />
                </div>
              </div>

              {/* Break Configuration */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Break Duration (Minutes)</label>
                  <input
                    type="number"
                    min="0"
                    step="5"
                    value={shiftForm.breakMinutes}
                    onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: parseInt(e.target.value, 10) || 0 })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#0284c7]"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">Break Classification</label>
                  <select
                    value={shiftForm.breakType}
                    onChange={(e) => setShiftForm({ ...shiftForm, breakType: e.target.value as any })}
                    className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#0284c7]"
                  >
                    <option value="UNPAID_MEAL">Unpaid Meal Break (Deducted)</option>
                    <option value="PAID_REST">Paid Rest Break (Counted)</option>
                  </select>
                </div>
              </div>

              {/* Recurrence (Only on creation) */}
              {!editingShiftId && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                      <Repeat className="w-3.5 h-3.5 text-[#0284c7]" />
                      Recurring Shift Schedule
                    </span>
                    <select
                      value={shiftForm.recurrenceRule}
                      onChange={(e) => setShiftForm({ ...shiftForm, recurrenceRule: e.target.value as any })}
                      className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 text-slate-800"
                    >
                      <option value="NONE">Do Not Repeat</option>
                      <option value="DAILY">Repeat Daily</option>
                      <option value="WEEKLY">Repeat Weekly</option>
                      <option value="BIWEEKLY">Repeat Every 2 Weeks</option>
                    </select>
                  </div>

                  {shiftForm.recurrenceRule !== 'NONE' && (
                    <div className="flex items-center justify-between text-xs text-slate-600 pt-1">
                      <span>Occurrences (number of shifts):</span>
                      <input
                        type="number"
                        min="2"
                        max="12"
                        value={shiftForm.recurrenceCount}
                        onChange={(e) => setShiftForm({ ...shiftForm, recurrenceCount: parseInt(e.target.value, 10) || 4 })}
                        className="w-16 px-2 py-1 text-center bg-white border border-slate-300 rounded-lg font-bold"
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Optional Notes */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1">Shift Notes / Duties</label>
                <input
                  type="text"
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  placeholder="e.g. Lead morning intake & bench diagnostic assignments"
                  className="w-full text-xs px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-800 focus:outline-none focus:border-[#0284c7]"
                />
              </div>

              {/* Form Buttons */}
              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                {savedWithWarnings ? (
                  <button
                    type="button"
                    onClick={() => {
                      setIsModalOpen(false);
                      setSavedWithWarnings(false);
                    }}
                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Acknowledge Warnings &amp; Close</span>
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={() => setIsModalOpen(false)}
                      className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="px-5 py-2 bg-[#0284c7] hover:bg-[#0369a1] text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer flex items-center gap-1.5"
                    >
                      {isSubmitting ? (
                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Check className="w-3.5 h-3.5" />
                      )}
                      <span>{editingShiftId ? 'Update Shift' : 'Save & Publish Shift'}</span>
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
