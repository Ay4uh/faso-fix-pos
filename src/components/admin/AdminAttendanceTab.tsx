import React, { useState, useEffect } from 'react';
import {
  Download,
  Plus,
  Edit2,
  Trash2,
  AlertCircle,
  CheckCircle2,
  X,
} from 'lucide-react';
import { fetchWithAuth } from '../../utils/auth';
import { ConfirmDialog } from '../ConfirmDialog';

export const AdminAttendanceTab: React.FC = () => {
  const [liveRoster, setLiveRoster] = useState<any[]>([]);
  const [shifts, setShifts] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [, setLoading] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Filters
  const [selectedUser, setSelectedUser] = useState('ALL');
  const [selectedStatus, setSelectedStatus] = useState('ALL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Modals
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<any | null>(null);
  const [deletingShift, setDeletingShift] = useState<any | null>(null);
  const [isDeletingShift, setIsDeletingShift] = useState(false);

  // Form states for manual add/edit
  const [formUserId, setFormUserId] = useState('');
  const [formClockIn, setFormClockIn] = useState('');
  const [formClockOut, setFormClockOut] = useState('');
  const [formBreakMinutes, setFormBreakMinutes] = useState(0);
  const [formReason, setFormReason] = useState('');
  const [formNotes, setFormNotes] = useState('');

  useEffect(() => {
    loadLiveRoster();
    loadShifts();
    loadEmployees();
  }, [selectedUser, selectedStatus, startDate, endDate]);

  const loadLiveRoster = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/attendance/live');
      if (res.ok) {
        const json = await res.json();
        setLiveRoster(json.data || []);
      }
    } catch (err) {
      console.error('[Load Live Roster Error]', err);
    }
  };

  const loadShifts = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (selectedUser !== 'ALL') params.set('userId', selectedUser);
      if (selectedStatus !== 'ALL') params.set('status', selectedStatus);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetchWithAuth(`/api/admin/attendance?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setShifts(json.data?.shifts || []);
      }
    } catch (err) {
      console.error('[Load Shifts Error]', err);
    } finally {
      setLoading(false);
    }
  };

  const loadEmployees = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/users');
      if (res.ok) {
        const json = await res.json();
        setEmployees(json.users || json.data || []);
      }
    } catch (err) {
      console.error('[Load Employees Error]', err);
    }
  };

  const toLocalDateTimeInput = (val: Date | string) => {
    const d = typeof val === 'string' ? new Date(val) : val;
    if (Number.isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const handleOpenAdd = () => {
    setFormUserId(employees[0]?.id || '');
    const now = new Date();
    const earlier = new Date(now.getTime() - 8 * 3600000);
    setFormClockIn(toLocalDateTimeInput(earlier));
    setFormClockOut(toLocalDateTimeInput(now));
    setFormBreakMinutes(30);
    setFormReason('');
    setFormNotes('');
    setIsAddModalOpen(true);
  };

  const handleSaveAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReason.trim()) {
      setErrorMsg('A modification reason is required for audit compliance.');
      return;
    }

    try {
      const res = await fetchWithAuth('/api/admin/attendance/shifts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: formUserId,
          clockIn: new Date(formClockIn).toISOString(),
          clockOut: formClockOut ? new Date(formClockOut).toISOString() : undefined,
          breakMinutes: Number(formBreakMinutes),
          reason: formReason.trim(),
          notes: formNotes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to create shift');

      setToastMsg('Shift manually added and logged to audit trail.');
      setIsAddModalOpen(false);
      await loadShifts();
      await loadLiveRoster();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error creating shift');
    }
  };

  const handleOpenEdit = (shift: any) => {
    setEditingShift(shift);
    setFormClockIn(toLocalDateTimeInput(shift.clockIn));
    setFormClockOut(shift.clockOut ? toLocalDateTimeInput(shift.clockOut) : '');
    setFormBreakMinutes(shift.breakMinutes || 0);
    setFormReason('');
    setFormNotes(shift.notes || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formReason.trim()) {
      setErrorMsg('A modification reason is required to edit attendance records.');
      return;
    }

    try {
      const res = await fetchWithAuth(`/api/admin/attendance/shifts/${editingShift.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clockIn: new Date(formClockIn).toISOString(),
          clockOut: formClockOut ? new Date(formClockOut).toISOString() : undefined,
          breakMinutes: Number(formBreakMinutes),
          reason: formReason.trim(),
          notes: formNotes.trim(),
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to update shift');

      setToastMsg('Shift updated successfully with audit trail.');
      setEditingShift(null);
      await loadShifts();
      await loadLiveRoster();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error updating shift');
    }
  };

  const executeDeleteShift = async (shiftId: string, reason: string) => {
    if (!reason || !reason.trim()) return;
    setIsDeletingShift(true);
    try {
      const res = await fetchWithAuth(`/api/admin/attendance/shifts/${shiftId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: reason.trim() }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Failed to delete shift');
      }
      setDeletingShift(null);
      setToastMsg('Shift deleted and logged to audit log.');
      await loadShifts();
      await loadLiveRoster();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error deleting shift');
    } finally {
      setIsDeletingShift(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      const params = new URLSearchParams();
      if (selectedUser !== 'ALL') params.set('userId', selectedUser);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);
      const res = await fetchWithAuth(`/api/admin/attendance/export?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to export attendance CSV');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `attendance-export-${new Date().toISOString().slice(0, 10)}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setErrorMsg(err.message || 'Attendance export failed');
    }
  };

  const clockedInCount = liveRoster.filter((r) => r.isClockedIn && !r.isOnBreak).length;
  const onBreakCount = liveRoster.filter((r) => r.isOnBreak).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
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

      {/* Top Section: Live Attendance Roster */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center space-x-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>Real-Time Employee Shift Roster</span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live status across all technicians ({clockedInCount} on shift, {onBreakCount} on break)
            </p>
          </div>
          <div className="flex items-center space-x-2">
            <button
              onClick={handleExportCsv}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleOpenAdd}
              className="inline-flex items-center space-x-1.5 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Manual Shift</span>
            </button>
          </div>
        </div>

        {/* Live Employee Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {liveRoster.map((emp) => (
            <div
              key={emp.id}
              className={`p-3.5 rounded-xl border transition ${
                emp.isOnBreak
                  ? 'bg-amber-50/60 border-amber-300'
                  : emp.isClockedIn
                  ? 'bg-emerald-50/60 border-emerald-300'
                  : 'bg-slate-50/60 border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-xs font-bold text-slate-900 truncate">{emp.name}</p>
                  <p className="text-[10px] text-slate-500 font-mono">
                    ID: {emp.employeeNumber || '—'} • {emp.bench || 'Unassigned'}
                  </p>
                </div>
                <span
                  className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                    emp.isOnBreak
                      ? 'bg-amber-500 animate-ping'
                      : emp.isClockedIn
                      ? 'bg-emerald-500 animate-pulse'
                      : 'bg-slate-300'
                  }`}
                />
              </div>

              <div className="mt-3 pt-2 border-t border-slate-200/60 flex items-center justify-between text-xs">
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                    emp.isOnBreak
                      ? 'bg-amber-200 text-amber-900'
                      : emp.isClockedIn
                      ? 'bg-emerald-200 text-emerald-900'
                      : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {emp.isOnBreak ? 'On Break' : emp.isClockedIn ? 'Clocked In' : 'Clocked Out'}
                </span>
                <span className="font-mono text-[11px] font-bold text-slate-700">
                  {emp.isClockedIn ? `${emp.activeWorkedHours || 0} hrs` : 'Off Duty'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Employee</label>
            <select
              value={selectedUser}
              onChange={(e) => setSelectedUser(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-medium"
            >
              <option value="ALL">All Staff Members</option>
              {employees.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.role})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Status</label>
            <select
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs bg-white font-medium"
            >
              <option value="ALL">All Statuses</option>
              <option value="ACTIVE">Active (On Shift)</option>
              <option value="COMPLETED">Completed</option>
              <option value="MODIFIED">Manually Modified</option>
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">Start Date</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>

          <div>
            <label className="block text-[10px] font-bold uppercase text-slate-500 mb-1">End Date</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="px-2.5 py-1.5 border border-slate-200 rounded-lg text-xs"
            />
          </div>
        </div>

        <button
          onClick={() => {
            setSelectedUser('ALL');
            setSelectedStatus('ALL');
            setStartDate('');
            setEndDate('');
          }}
          className="text-indigo-600 hover:text-indigo-800 font-bold self-end py-1.5"
        >
          Reset Filters
        </button>
      </div>

      {/* Shift Records Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700">
            Attendance Log &amp; Time Entries ({shifts.length})
          </h3>
          <span className="text-[11px] text-slate-500">
            CRA Compliant • Changes audited with administrator signatures
          </span>
        </div>

        {shifts.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-xs">
            No attendance records matching the selected criteria.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-50 text-slate-600 uppercase text-[10px] font-bold border-b border-slate-200">
                <tr>
                  <th className="py-3 px-4">Employee</th>
                  <th className="py-3 px-4">Clock In</th>
                  <th className="py-3 px-4">Clock Out</th>
                  <th className="py-3 px-4 text-center">Breaks</th>
                  <th className="py-3 px-4 text-right">Regular</th>
                  <th className="py-3 px-4 text-right">Overtime</th>
                  <th className="py-3 px-4 text-right">Total Net</th>
                  <th className="py-3 px-4 text-center">Audit State</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-mono">
                {shifts.map((s) => {
                  const regHours = ((s.regularMinutes || 0) / 60).toFixed(2);
                  const otHours = ((s.overtimeMinutes || 0) / 60).toFixed(2);
                  const totalHours = ((s.totalMinutes || 0) / 60).toFixed(2);

                  return (
                    <tr key={s.id} className="hover:bg-slate-50/80">
                      <td className="py-3 px-4 font-sans">
                        <p className="font-bold text-slate-900">{s.user?.name || 'Technician'}</p>
                        <p className="text-[10px] text-slate-400 font-mono">
                          ID: {s.user?.employeeNumber || '—'}
                        </p>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {new Date(s.clockIn).toLocaleDateString('en-CA')}{' '}
                        <span className="text-slate-500">
                          {new Date(s.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-slate-700">
                        {s.clockOut ? (
                          <>
                            {new Date(s.clockOut).toLocaleDateString('en-CA')}{' '}
                            <span className="text-slate-500">
                              {new Date(s.clockOut).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                            </span>
                          </>
                        ) : (
                          <span className="text-emerald-600 font-sans font-bold">Active Shift</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center text-slate-500">{s.breakMinutes || 0}m</td>
                      <td className="py-3 px-4 text-right text-slate-800">{regHours}h</td>
                      <td className="py-3 px-4 text-right">
                        {s.overtimeMinutes > 0 ? (
                          <span className="text-amber-600 font-bold">{otHours}h</span>
                        ) : (
                          <span className="text-slate-400">0.00h</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-bold text-indigo-700">
                        <div>{s.durationFormatted || `${totalHours}h`}</div>
                        <div className="text-[10px] text-slate-400 font-normal">({totalHours}h)</div>
                      </td>
                      <td className="py-3 px-4 text-center font-sans">
                        {s.editedByAdminId ? (
                          <div title={`Reason: ${s.editReason || 'Admin adjustment'}`}>
                            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-purple-100 text-purple-800 uppercase">
                              Modified
                            </span>
                          </div>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 uppercase">
                            Original
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right font-sans">
                        <div className="flex items-center justify-end space-x-1.5">
                          <button
                            onClick={() => handleOpenEdit(s)}
                            title="Edit shift details"
                            className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded transition cursor-pointer"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingShift(s)}
                            title="Delete shift"
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Add Manual Shift */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Add Missing Shift</h3>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAdd} className="p-5 space-y-4 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Employee</label>
                <select
                  value={formUserId}
                  onChange={(e) => setFormUserId(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  required
                >
                  {employees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.role})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Clock In</label>
                  <input
                    type="datetime-local"
                    value={formClockIn}
                    onChange={(e) => setFormClockIn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Clock Out</label>
                  <input
                    type="datetime-local"
                    value={formClockOut}
                    onChange={(e) => setFormClockOut(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Unpaid Break (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={formBreakMinutes}
                  onChange={(e) => setFormBreakMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Modification Reason <span className="text-red-500">* Required for Audit Log</span>
                </label>
                <input
                  type="text"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Enter audit reason for manual shift entry"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Notes (Optional)</label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Bench or work order notes"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Save Shift
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Edit Shift */}
      {editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
            <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">Edit Attendance Record</h3>
                <p className="text-[11px] text-slate-500">Employee: {editingShift.user?.name}</p>
              </div>
              <button
                onClick={() => setEditingShift(null)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEdit} className="p-5 space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Clock In</label>
                  <input
                    type="datetime-local"
                    value={formClockIn}
                    onChange={(e) => setFormClockIn(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                    required
                  />
                </div>
                <div>
                  <label className="block font-bold text-slate-700 mb-1">Clock Out</label>
                  <input
                    type="datetime-local"
                    value={formClockOut}
                    onChange={(e) => setFormClockOut(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Break Duration (Minutes)</label>
                <input
                  type="number"
                  min="0"
                  max="240"
                  value={formBreakMinutes}
                  onChange={(e) => setFormBreakMinutes(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  Reason for Modification <span className="text-red-500">* Required for Audit Trail</span>
                </label>
                <input
                  type="text"
                  value={formReason}
                  onChange={(e) => setFormReason(e.target.value)}
                  placeholder="Enter audit reason for time adjustment"
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg"
                  required
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end space-x-2">
                <button
                  type="button"
                  onClick={() => setEditingShift(null)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg font-bold text-slate-700"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-bold shadow-xs"
                >
                  Update Record
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(deletingShift)}
        title="Delete Attendance Record?"
        message={
          deletingShift && (
            <>
              Are you sure you want to delete the attendance record for{' '}
              <strong className="text-slate-900">{deletingShift.user?.name || 'Technician'}</strong>{' '}
              on{' '}
              <strong className="text-slate-900">
                {new Date(deletingShift.clockIn).toLocaleDateString('en-CA')}
              </strong>{' '}
              ({new Date(deletingShift.clockIn).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})?
            </>
          )
        }
        requireReason={true}
        reasonLabel="Audit Reason for Deletion *"
        reasonPlaceholder="Explain why this attendance record is being removed"
        requireAcknowledge={true}
        acknowledgeLabel="Yes, I am sure I want to permanently delete this attendance shift"
        confirmLabel="Yes, Delete Shift"
        cancelLabel="No, Keep Shift"
        isProcessing={isDeletingShift}
        onCancel={() => setDeletingShift(null)}
        onConfirm={(reason) => {
          if (deletingShift && reason) {
            executeDeleteShift(deletingShift.id, reason);
          }
        }}
      />
    </div>
  );
};
