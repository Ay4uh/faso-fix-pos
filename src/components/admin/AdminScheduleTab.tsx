import React, { useState, useEffect } from 'react';
import {
  Calendar,
  Clock,
  Plus,
  AlertTriangle,
  CheckCircle2,
  Trash2,
  Edit2,
  Filter,
  RefreshCw,
  XCircle,
  AlertCircle,
  X,
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
  };
  shiftDate: string;
  startTime: string;
  endTime: string;
  startDateTime: string;
  endDateTime: string;
  breakMinutes: number;
  breakType: 'UNPAID_MEAL' | 'PAID_REST';
  totalScheduledHours: number;
  roleOrStation?: string | null;
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

interface AdminScheduleTabProps {
  users: User[];
  currentUser: User;
}

export const AdminScheduleTab: React.FC<AdminScheduleTabProps> = ({ users }) => {
  const [viewMode, setViewMode] = useState<'calendar' | 'compare'>('calendar');
  const [shifts, setShifts] = useState<ScheduledShift[]>([]);
  const [comparison, setComparison] = useState<ScheduleComparison | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string>('ALL');
  const [dateFilter, setDateFilter] = useState<'WEEK' | 'MONTH' | 'ALL'>('WEEK');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingShiftId, setEditingShiftId] = useState<string | null>(null);
  const [shiftForm, setShiftForm] = useState({
    userId: '',
    shiftDate: new Date().toISOString().slice(0, 10),
    startTime: '09:00',
    endTime: '17:00',
    breakMinutes: 30,
    breakType: 'UNPAID_MEAL' as 'UNPAID_MEAL' | 'PAID_REST',
    roleOrStation: 'Main Bench',
    notes: '',
  });
  const [formWarnings, setFormWarnings] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const activeUsers = users.filter((u) => u.status !== 'DISABLED');

  const loadShifts = async () => {
    setIsLoading(true);
    try {
      let url = '/api/schedules';
      const params = new URLSearchParams();
      if (selectedUserId !== 'ALL') params.append('userId', selectedUserId);

      const now = new Date();
      if (dateFilter === 'WEEK') {
        const start = new Date(now.setDate(now.getDate() - now.getDay()));
        const end = new Date(start);
        end.setDate(end.getDate() + 14);
        params.append('startDate', start.toISOString());
        params.append('endDate', end.toISOString());
      } else if (dateFilter === 'MONTH') {
        const start = new Date(now.getFullYear(), now.getMonth(), 1);
        const end = new Date(now.getFullYear(), now.getMonth() + 2, 0);
        params.append('startDate', start.toISOString());
        params.append('endDate', end.toISOString());
      }

      if (params.toString()) url += `?${params.toString()}`;

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
    if (viewMode === 'calendar') {
      loadShifts();
    } else {
      loadComparison();
    }
  }, [viewMode, selectedUserId, dateFilter]);

  const openCreateModal = () => {
    setEditingShiftId(null);
    setShiftForm({
      userId: activeUsers[0]?.id || '',
      shiftDate: new Date().toISOString().slice(0, 10),
      startTime: '09:00',
      endTime: '17:00',
      breakMinutes: 30,
      breakType: 'UNPAID_MEAL',
      roleOrStation: 'Main Bench',
      notes: '',
    });
    setFormWarnings([]);
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
      roleOrStation: shift.roleOrStation || '',
      notes: shift.notes || '',
    });
    setFormWarnings([]);
    setIsModalOpen(true);
  };

  const handleSaveShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!shiftForm.userId) {
      alert('Please select an employee.');
      return;
    }
    setIsSubmitting(true);
    setFormWarnings([]);

    try {
      const url = editingShiftId ? `/api/schedules/${editingShiftId}` : '/api/schedules';
      const method = editingShiftId ? 'PUT' : 'POST';

      const res = await fetchWithAuth(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(shiftForm),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || 'Failed to save shift.');
      }

      posAudio.playSuccessChime();
      if (json.warnings && json.warnings.length > 0) {
        setFormWarnings(json.warnings);
        setActionMessage({
          type: 'success',
          text: `Shift saved! Note ${json.warnings.length} Ontario ESA warning(s) below.`,
        });
      } else {
        setActionMessage({ type: 'success', text: 'Shift successfully saved without scheduling conflicts!' });
        setIsModalOpen(false);
      }
      loadShifts();
    } catch (err: any) {
      posAudio.playWarningBeep();
      setActionMessage({ type: 'error', text: err.message || 'Error saving shift.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteShift = async (shiftId: string) => {
    if (!confirm('Are you sure you want to cancel and delete this scheduled shift?')) return;
    try {
      const res = await fetchWithAuth(`/api/schedules/${shiftId}`, { method: 'DELETE' });
      if (res.ok) {
        posAudio.playSuccessChime();
        setActionMessage({ type: 'success', text: 'Shift successfully removed.' });
        loadShifts();
      } else {
        throw new Error('Failed to delete shift.');
      }
    } catch (err: any) {
      posAudio.playWarningBeep();
      setActionMessage({ type: 'error', text: err.message });
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Sub-navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <h2 className="text-base font-bold text-slate-900">Shift Scheduling & Compliance</h2>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Ontario Employment Standards Act (ESA) compliant scheduling • 44h OT &amp; 11h daily rest monitoring
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* View Switcher */}
          <div className="bg-slate-100 p-1 rounded-xl flex items-center text-xs font-semibold">
            <button
              onClick={() => setViewMode('calendar')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Shift Calendar
            </button>
            <button
              onClick={() => setViewMode('compare')}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                viewMode === 'compare'
                  ? 'bg-white text-indigo-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Schedule vs Actual
            </button>
          </div>

          <button
            onClick={openCreateModal}
            className="flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold transition shadow-xs cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Add Shift</span>
          </button>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-3 rounded-xl border flex items-center justify-between text-xs font-medium ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
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
          <button onClick={() => setActionMessage(null)} className="text-slate-400 hover:text-slate-600 cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* VIEW 1: CALENDAR & SHIFTS LIST */}
      {viewMode === 'calendar' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-xl border border-slate-200 text-xs">
            <div className="flex items-center space-x-3">
              <div className="flex items-center space-x-1.5 text-slate-500 font-medium">
                <Filter className="w-3.5 h-3.5" />
                <span>Filter by Staff:</span>
              </div>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="ALL">All Active Employees ({activeUsers.length})</option>
                {activeUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} ({u.role})
                  </option>
                ))}
              </select>

              <select
                value={dateFilter}
                onChange={(e: any) => setDateFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="WEEK">Next 14 Days</option>
                <option value="MONTH">Next 60 Days</option>
                <option value="ALL">All Scheduled</option>
              </select>
            </div>

            <button
              onClick={loadShifts}
              disabled={isLoading}
              className="flex items-center space-x-1 text-slate-600 hover:text-slate-900 cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>

          {/* Shifts Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Employee</th>
                    <th className="py-3 px-4">Shift Date</th>
                    <th className="py-3 px-4">Scheduled Hours</th>
                    <th className="py-3 px-4">Meal Break</th>
                    <th className="py-3 px-4">Station / Role</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {shifts.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        No scheduled shifts found for the selected criteria.
                      </td>
                    </tr>
                  ) : (
                    shifts.map((s) => (
                      <tr key={s.id} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-semibold text-slate-900">
                          <div className="flex items-center space-x-2">
                            <div className="w-6 h-6 rounded-full bg-indigo-50 text-indigo-700 flex items-center justify-center text-[10px] font-bold">
                              {s.user?.name ? s.user.name.charAt(0).toUpperCase() : 'U'}
                            </div>
                            <div>
                              <span>{s.user?.name || 'Unknown Staff'}</span>
                              <span className="block text-[10px] font-normal text-slate-400">
                                {s.user?.role || 'TECHNICIAN'}
                              </span>
                            </div>
                          </div>
                        </td>
                        <td className="py-3 px-4 font-mono font-medium text-slate-800">
                          {new Date(s.shiftDate).toLocaleDateString('en-CA', {
                            weekday: 'short',
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })}
                        </td>
                        <td className="py-3 px-4 font-mono">
                          <span className="font-bold text-slate-900">
                            {s.startTime} - {s.endTime}
                          </span>
                          <span className="block text-[10px] text-indigo-600 font-semibold">
                            {s.totalScheduledHours} hrs scheduled
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {s.breakMinutes} min ({s.breakType === 'UNPAID_MEAL' ? 'Unpaid Meal' : 'Paid Rest'})
                        </td>
                        <td className="py-3 px-4 text-slate-600">{s.roleOrStation || 'Standard Bench'}</td>
                        <td className="py-3 px-4 text-center">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              s.status === 'CONFIRMED' || s.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : s.status === 'MISSED'
                                ? 'bg-rose-100 text-rose-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {s.status}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end space-x-1">
                            <button
                              onClick={() => openEditModal(s)}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 transition cursor-pointer"
                              title="Edit Shift"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDeleteShift(s.id)}
                              className="p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 transition cursor-pointer"
                              title="Delete Shift"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* VIEW 2: SCHEDULE VS ACTUAL COMPARISON */}
      {viewMode === 'compare' && (
        <div className="space-y-4">
          {comparison && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500">Scheduled vs Actual Hours</span>
                <div className="flex items-baseline space-x-1 mt-1 font-mono">
                  <span className="text-lg font-black text-slate-900">
                    {comparison.summary.totalActualHours.toFixed(1)}h
                  </span>
                  <span className="text-xs text-slate-400">/ {comparison.summary.totalScheduledHours.toFixed(1)}h</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Variance: {comparison.summary.netVarianceHours >= 0 ? '+' : ''}
                  {comparison.summary.netVarianceHours.toFixed(1)}h
                </p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500">On-Time Reliability</span>
                <p className="text-lg font-black text-emerald-600 font-mono mt-1">
                  {comparison.summary.onTimeRatePct}%
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Based on shifts in selected period</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500">Late Arrivals (&gt;10m)</span>
                <p className="text-lg font-black text-amber-600 font-mono mt-1">
                  {comparison.summary.totalLateArrivals}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">Clock-in past scheduled start</p>
              </div>

              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
                <span className="text-[10px] font-bold uppercase text-slate-500">Missed Shifts</span>
                <p className="text-lg font-black text-rose-600 font-mono mt-1">
                  {comparison.summary.totalMissedShifts}
                </p>
                <p className="text-[10px] text-slate-500 mt-1">No attendance logged on shift day</p>
              </div>
            </div>
          )}

          {/* Comparison Details Table */}
          <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-600">
                <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Staff</th>
                    <th className="py-3 px-4">Date</th>
                    <th className="py-3 px-4">Scheduled Window</th>
                    <th className="py-3 px-4">Actual Clock-In/Out</th>
                    <th className="py-3 px-4 text-right">Sched vs Actual</th>
                    <th className="py-3 px-4 text-center">Punctuality Flag</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-mono">
                  {comparison?.details.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-8 text-slate-400 font-sans">
                        No shifts to compare in this timeframe.
                      </td>
                    </tr>
                  ) : (
                    comparison?.details.map((row) => (
                      <tr key={row.shiftId} className="hover:bg-slate-50 transition">
                        <td className="py-3 px-4 font-sans font-semibold text-slate-900">
                          {row.userName}
                        </td>
                        <td className="py-3 px-4 text-slate-700">
                          {new Date(row.shiftDate).toLocaleDateString('en-CA')}
                        </td>
                        <td className="py-3 px-4 text-slate-800">
                          {row.scheduledStart} - {row.scheduledEnd}
                          <span className="block text-[10px] text-slate-400">
                            {row.scheduledHours.toFixed(1)} hrs scheduled
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-800">
                          {row.actualClockIn ? (
                            <>
                              <span>{new Date(row.actualClockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                              <span> - </span>
                              <span>
                                {row.actualClockOut
                                  ? new Date(row.actualClockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                                  : 'Still Active'}
                              </span>
                            </>
                          ) : (
                            <span className="text-rose-600 font-sans font-bold">No Clock-In</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <span className="font-bold text-slate-900">
                            {row.actualHoursWorked.toFixed(2)}h
                          </span>
                          <span
                            className={`block text-[10px] font-bold ${
                              row.varianceHours < -0.5
                                ? 'text-amber-600'
                                : row.varianceHours > 0.5
                                ? 'text-indigo-600'
                                : 'text-slate-400'
                            }`}
                          >
                            {row.varianceHours >= 0 ? '+' : ''}
                            {row.varianceHours.toFixed(2)}h
                          </span>
                        </td>
                        <td className="py-3 px-4 text-center font-sans">
                          {row.isMissed ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-rose-100 text-rose-800">
                              <XCircle className="w-3 h-3" />
                              <span>MISSED</span>
                            </span>
                          ) : row.isLate ? (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                              <AlertTriangle className="w-3 h-3" />
                              <span>LATE ARRIVAL</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center space-x-1 px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <CheckCircle2 className="w-3 h-3" />
                              <span>ON TIME</span>
                            </span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT SHIFT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-200 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center space-x-2">
                <Clock className="w-5 h-5 text-indigo-600" />
                <h3 className="text-base font-bold text-slate-900">
                  {editingShiftId ? 'Edit Scheduled Shift' : 'Create New Scheduled Shift'}
                </h3>
              </div>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {formWarnings.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-1">
                <div className="flex items-center space-x-1.5 text-xs font-bold text-amber-800">
                  <AlertTriangle className="w-4 h-4 text-amber-600" />
                  <span>Ontario ESA Compliance Warnings:</span>
                </div>
                <ul className="list-disc list-inside text-[11px] text-amber-700 space-y-0.5">
                  {formWarnings.map((w, idx) => (
                    <li key={idx}>{w}</li>
                  ))}
                </ul>
              </div>
            )}

            <form onSubmit={handleSaveShift} className="space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Employee Account</label>
                <select
                  value={shiftForm.userId}
                  onChange={(e) => setShiftForm({ ...shiftForm, userId: e.target.value })}
                  required
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="" disabled>Select Employee</option>
                  {activeUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Shift Date</label>
                  <input
                    type="date"
                    value={shiftForm.shiftDate}
                    onChange={(e) => setShiftForm({ ...shiftForm, shiftDate: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Start Time</label>
                  <input
                    type="time"
                    value={shiftForm.startTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, startTime: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">End Time</label>
                  <input
                    type="time"
                    value={shiftForm.endTime}
                    onChange={(e) => setShiftForm({ ...shiftForm, endTime: e.target.value })}
                    required
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    Meal Break (Ontario ESA: &gt;5h requires 30m)
                  </label>
                  <div className="flex items-center space-x-2">
                    <input
                      type="number"
                      min={0}
                      max={120}
                      step={5}
                      value={shiftForm.breakMinutes}
                      onChange={(e) => setShiftForm({ ...shiftForm, breakMinutes: parseInt(e.target.value, 10) || 0 })}
                      className="w-20 bg-slate-50 border border-slate-200 rounded-lg p-2 font-mono"
                    />
                    <span className="text-slate-500">minutes</span>
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Break Classification</label>
                  <select
                    value={shiftForm.breakType}
                    onChange={(e: any) => setShiftForm({ ...shiftForm, breakType: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2 text-slate-800"
                  >
                    <option value="UNPAID_MEAL">Unpaid Meal Break (Standard)</option>
                    <option value="PAID_REST">Paid Rest Period</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Role / Station / Work Bench</label>
                <input
                  type="text"
                  value={shiftForm.roleOrStation}
                  onChange={(e) => setShiftForm({ ...shiftForm, roleOrStation: e.target.value })}
                  placeholder="e.g. Lead Technician, Front Counter, Bench #02"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Shift Notes / Instructions</label>
                <textarea
                  rows={2}
                  value={shiftForm.notes}
                  onChange={(e) => setShiftForm({ ...shiftForm, notes: e.target.value })}
                  placeholder="Optional notes visible to staff"
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg p-2"
                />
              </div>

              <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-xl hover:bg-slate-50 transition font-bold cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSubmitting ? 'Validating...' : editingShiftId ? 'Update Shift' : 'Create & Assign Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
