import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Users,
  KeyRound,
  ShieldCheck,
  Activity,
  UserPlus,
  Search,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Trash2,
  Edit3,
  ArrowRight,
  Server,
  Database,
  Check,
  Clock,
  Layers,
  LogOut,
  UserCheck,
  UserX,
  Wrench,
  Phone,
  DollarSign,
  Calendar,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { fetchWithAuth } from '../utils/auth';
import { posAudio } from '../utils/audio';
import { User, AdminOverview, AuditLog, UserRole, UserStatus, Ticket } from '../types';
import { AdminAttendanceTab } from './admin/AdminAttendanceTab';
import { AdminPayrollTab } from './admin/AdminPayrollTab';
import { AdminScheduleTab } from './admin/AdminScheduleTab';
import { AdminSalesLaborTab } from './admin/AdminSalesLaborTab';
import { saveRegisteredUsers, recordDeletedUser } from '../utils/userSync';

interface AdminDashboardProps {
  currentUser: User;
  onLogout: () => void;
  onNavigateToTab?: (tab: string) => void;
  initialSection?: 'overview' | 'users' | 'tickets' | 'roles' | 'audit' | 'attendance' | 'payroll' | 'schedule' | 'sales-labor';
}

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  currentUser,
  onLogout,
  onNavigateToTab,
  initialSection,
}) => {
  const [activeSection, setActiveSection] = useState<'overview' | 'users' | 'tickets' | 'roles' | 'audit' | 'attendance' | 'payroll' | 'schedule' | 'sales-labor'>(initialSection || 'overview');

  useEffect(() => {
    if (initialSection) {
      setActiveSection(initialSection);
    }
  }, [initialSection]);
  const [overview, setOverview] = useState<AdminOverview | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<string | null>(null);
  const [errorBanner, setErrorBanner] = useState<string | null>(null);

  // User filters & search
  const [userSearch, setUserSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'ADMIN' | 'USER'>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'DISABLED'>('ALL');

  // Ticket filters & search
  const [ticketSearch, setTicketSearch] = useState('');

  // Audit filters & search
  const [auditSearch, setAuditSearch] = useState('');
  const [auditActionFilter, setAuditActionFilter] = useState('ALL');
  const [auditPage, setAuditPage] = useState(1);
  const [auditTotal, setAuditTotal] = useState(0);
  const [auditTotalPages, setAuditTotalPages] = useState(1);

  // Modals
  const [isCreateUserModalOpen, setIsCreateUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [passwordResetUser, setPasswordResetUser] = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deletingTicket, setDeletingTicket] = useState<Ticket | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const fetchOverview = async () => {
    try {
      const res = await fetchWithAuth('/api/admin/overview');
      if (res.ok) {
        const json = await res.json();
        setOverview(json.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchUsersList = async () => {
    try {
      const params = new URLSearchParams();
      if (userSearch.trim()) params.set('search', userSearch.trim());
      if (roleFilter !== 'ALL') params.set('role', roleFilter);
      if (statusFilter !== 'ALL') params.set('status', statusFilter);

      const res = await fetchWithAuth(`/api/admin/users?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setUsers(json.data || []);
        if (Array.isArray(json.data)) {
          saveRegisteredUsers(json.data);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchAuditList = async (targetPage = auditPage) => {
    try {
      const params = new URLSearchParams();
      params.set('page', String(targetPage));
      params.set('pageSize', '25');
      if (auditSearch.trim()) params.set('search', auditSearch.trim());
      if (auditActionFilter !== 'ALL') params.set('action', auditActionFilter);

      const res = await fetchWithAuth(`/api/admin/audit-logs?${params.toString()}`);
      if (res.ok) {
        const json = await res.json();
        setAuditLogs(json.data || []);
        setAuditTotal(json.total ?? (json.data?.length || 0));
        setAuditTotalPages(json.totalPages ?? 1);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchTicketsList = async () => {
    try {
      const res = await fetchWithAuth('/api/tickets?view=ALL');
      if (res.ok) {
        const json = await res.json();
        setTickets(json.data || []);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const loadAll = async () => {
    setIsLoading(true);
    setErrorBanner(null);
    try {
      await Promise.all([fetchOverview(), fetchUsersList(), fetchAuditList(), fetchTicketsList()]);
    } catch (err: any) {
      setErrorBanner(err.message || 'Failed loading admin data');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAll();
  }, []);

  useEffect(() => {
    if (activeSection === 'users') {
      fetchUsersList();
    }
  }, [userSearch, roleFilter, statusFilter, activeSection]);

  useEffect(() => {
    if (activeSection === 'tickets') {
      fetchTicketsList();
    }
  }, [activeSection]);

  useEffect(() => {
    if (activeSection === 'audit') {
      fetchAuditList(auditPage);
    }
  }, [auditSearch, auditActionFilter, auditPage, activeSection]);

  // Actions: User Management
  const handleToggleStatus = async (user: User) => {
    const newStatus: UserStatus = user.status === 'ACTIVE' ? 'DISABLED' : 'ACTIVE';
    try {
      const res = await fetchWithAuth(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: newStatus }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user status');

      posAudio.playSuccessChime();
      showToast(`User ${user.username} is now ${newStatus}`);
      fetchUsersList();
      fetchOverview();
    } catch (err: any) {
      posAudio.playWarningBeep();
      showToast(`Error: ${err.message}`);
    }
  };

  const handleDeleteUser = async () => {
    if (!deletingUser) return;
    try {
      const res = await fetchWithAuth(`/api/admin/users/${deletingUser.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete user');

      recordDeletedUser(deletingUser.id);
      posAudio.playSuccessChime();
      showToast(`User ${deletingUser.username} permanently deleted`);
      setDeletingUser(null);
      fetchUsersList();
      fetchOverview();
    } catch (err: any) {
      posAudio.playWarningBeep();
      showToast(`Delete Error: ${err.message}`);
    }
  };

  const handleDeleteTicket = async () => {
    if (!deletingTicket) return;
    try {
      const res = await fetchWithAuth(`/api/tickets/${deletingTicket.id}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to delete work order');

      posAudio.playSuccessChime();
      showToast(`Work order #${deletingTicket.ticketNumber} permanently deleted`);
      setDeletingTicket(null);
      fetchTicketsList();
      fetchOverview();
    } catch (err: any) {
      posAudio.playWarningBeep();
      showToast(`Delete Error: ${err.message}`);
    }
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-150 pb-12">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 bg-white text-slate-900 px-4 py-3 rounded-xl shadow-xl border border-slate-200 flex items-center space-x-2 text-xs font-semibold animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header Banner — Bright Clean Design */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 text-slate-900 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center space-x-4">
          <div className="w-12 h-12 rounded-2xl bg-purple-50 border border-purple-200 text-purple-700 flex items-center justify-center shadow-xs">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-extrabold tracking-tight text-slate-900">Faso Fix Master Admin Console</h1>
              <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-[10px] font-bold uppercase tracking-wider">
                Production Guard Active
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Logged in as <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.username}) &bull; Role: {currentUser.role}
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('repairs')}
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-xs"
            >
              <span>Back to POS</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            onClick={() => loadAll()}
            disabled={isLoading}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-200 rounded-xl text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            <span>Refresh Data</span>
          </button>
          <button
            onClick={onLogout}
            className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold transition flex items-center space-x-1.5 shadow-sm shadow-rose-600/25 cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </div>

      {errorBanner && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorBanner}</span>
        </div>
      )}

      {/* Navigation Tabs */}
      <div className="flex items-center space-x-1 bg-white p-1.5 rounded-xl border border-slate-200 shadow-2xs overflow-x-auto">
        {[
          { id: 'overview', label: 'Admin Overview', icon: Activity },
          { id: 'users', label: 'User & Staff Management', icon: Users, badge: overview?.users.total },
          { id: 'attendance', label: 'Time & Attendance', icon: Clock },
          { id: 'schedule', label: 'Shift Calendar & Scheduling', icon: Calendar },
          { id: 'payroll', label: 'Payroll & Remuneration', icon: DollarSign },
          { id: 'sales-labor', label: 'Sales & Labor ROI', icon: TrendingUp },
          { id: 'tickets', label: 'Work Orders & Tickets', icon: Wrench, badge: tickets.length },
          { id: 'roles', label: 'Roles & RBAC Permissions', icon: ShieldCheck },
          { id: 'audit', label: 'System Audit Logs', icon: Layers, badge: auditTotal || auditLogs.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeSection === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSection(tab.id as any)}
              className={`flex items-center space-x-2 px-4 py-2.5 rounded-lg text-xs font-bold transition whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
              }`}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
              {tab.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono ${
                    isActive ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                  }`}
                >
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* ========================================================
          SECTION 1: ADMIN OVERVIEW
         ======================================================== */}
      {activeSection === 'overview' && overview && (
        <div className="space-y-5">
          {/* Key Metric Bento Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold text-slate-600">Total System Users</span>
                <Users className="w-4 h-4 text-indigo-600" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-slate-900">{overview.users.total}</span>
                <span className="text-[11px] font-semibold text-emerald-600">
                  {overview.users.active} Active
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                <span>Admins: {overview.users.admins}</span>
                <span>Technicians: {overview.users.technicians}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold text-slate-600">Active Work Orders</span>
                <Layers className="w-4 h-4 text-blue-600" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-slate-900">{overview.shop.activeTickets}</span>
                <span className="text-[11px] font-semibold text-slate-500">
                  / {overview.shop.totalTickets} Total
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                <span>Completed: {overview.shop.completedTickets}</span>
                <span>Benches: {overview.system.activeWorkstations}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold text-slate-600">Lifetime Revenue</span>
                <Server className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-2xl font-black text-emerald-600 font-mono">
                  ${(overview.shop.lifetimeRevenueCents / 100).toFixed(2)}
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                <span>Customers: {overview.shop.totalCustomers}</span>
                <span>Inventory: {overview.shop.totalInventoryItems}</span>
              </div>
            </div>

            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-2">
              <div className="flex items-center justify-between text-slate-500">
                <span className="text-xs font-bold text-slate-600">System Integrity</span>
                <Database className="w-4 h-4 text-purple-600" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-base font-extrabold text-slate-900">ACID Relational</span>
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 rounded font-bold text-[10px]">
                  Online
                </span>
              </div>
              <div className="text-[11px] text-slate-400 flex items-center justify-between pt-1 border-t border-slate-100">
                <span>Prisma ORM</span>
                <span className="font-mono">SQLite (dev.db)</span>
              </div>
            </div>
          </div>

          {/* Quick Management Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            {/* Recent Users */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Users className="w-4 h-4 text-indigo-600" />
                  Recently Registered Accounts
                </h3>
                <button
                  onClick={() => setActiveSection('users')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>Manage All</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="divide-y divide-slate-100">
                {overview.users.recent.map((u) => (
                  <div key={u.id} className="py-2.5 flex items-center justify-between">
                    <div>
                      <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                        <span>{u.name}</span>
                        <span className="font-mono text-slate-400 font-normal">@{u.username}</span>
                        <span
                          className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            u.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' : 'bg-slate-100 text-slate-700'
                          }`}
                        >
                          {u.role}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">{u.email}</div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                        u.status === 'ACTIVE' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {u.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent Audit Activities */}
            <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-600" />
                  Live Administrative Audit Trail
                </h3>
                <button
                  onClick={() => setActiveSection('audit')}
                  className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                >
                  <span>View All Logs</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="space-y-2">
                {overview.recentAudits.slice(0, 6).map((log) => (
                  <div
                    key={log.id}
                    className="p-2.5 bg-slate-50 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                  >
                    <div>
                      <div className="font-bold text-slate-800 flex items-center gap-2">
                        <span className="px-1.5 py-0.5 bg-slate-200 text-slate-800 rounded font-mono text-[10px]">
                          {log.action}
                        </span>
                        <span className="text-slate-600 font-normal">{log.details}</span>
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">
                        By: <strong className="text-slate-600">{log.actorName}</strong> &bull; {new Date(log.createdAt).toLocaleString()}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 2: USER MANAGEMENT
         ======================================================== */}
      {activeSection === 'users' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2.5">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={userSearch}
                  onChange={(e) => setUserSearch(e.target.value)}
                  placeholder="Search user name, username, or email..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
              </div>

              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Roles</option>
                <option value="ADMIN">Administrators</option>
                <option value="USER">Technicians (Standard)</option>
              </select>

              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as any)}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Status</option>
                <option value="ACTIVE">Active Only</option>
                <option value="DISABLED">Disabled Only</option>
              </select>
            </div>

            <button
              onClick={() => setIsCreateUserModalOpen(true)}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/30 flex items-center justify-center space-x-2 transition cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>Create New User</span>
            </button>
          </div>

          {/* Users Table */}
          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Email / Phone</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4">Bench Assignment</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4">Created / Last Login</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-10 text-slate-400">
                        No registered users match your search or filter.
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelf = u.id === currentUser.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/80 transition">
                          <td className="py-3.5 px-4">
                            <div className="flex items-center space-x-3">
                              <div className="w-8 h-8 rounded-full bg-slate-100 border border-slate-200 text-slate-700 font-bold text-xs flex items-center justify-center">
                                {u.name.charAt(0)}
                              </div>
                              <div>
                                <div className="font-bold text-slate-900 flex items-center gap-1.5">
                                  <span>{u.name}</span>
                                  {isSelf && (
                                    <span className="px-1.5 py-0.2 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold">
                                      YOU
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-slate-500 font-mono">@{u.username}</div>
                              </div>
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600">
                            <div>{u.email}</div>
                            <div className="text-[11px] text-slate-400 font-mono">{u.phone || 'No phone'}</div>
                          </td>
                          <td className="py-3.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded-md font-bold text-[10px] ${
                                u.role === 'ADMIN'
                                  ? 'bg-purple-100 text-purple-800 border border-purple-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {u.role === 'ADMIN' ? '👑 Administrator' : '🔧 Technician'}
                            </span>
                          </td>
                          <td className="py-3.5 px-4 text-slate-600 font-medium">
                            {u.bench || 'Unassigned'}
                          </td>
                          <td className="py-3.5 px-4">
                            <button
                              onClick={() => handleToggleStatus(u)}
                              disabled={isSelf}
                              title={isSelf ? 'Cannot disable your own account' : 'Click to toggle status'}
                              className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center space-x-1 cursor-pointer disabled:opacity-50 transition ${
                                u.status === 'ACTIVE'
                                  ? 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                                  : 'bg-red-100 text-red-800 hover:bg-red-200'
                              }`}
                            >
                              {u.status === 'ACTIVE' ? (
                                <>
                                  <UserCheck className="w-3 h-3 text-emerald-600" />
                                  <span>Active</span>
                                </>
                              ) : (
                                <>
                                  <UserX className="w-3 h-3 text-red-600" />
                                  <span>Disabled</span>
                                </>
                              )}
                            </button>
                          </td>
                          <td className="py-3.5 px-4 text-slate-500 text-[11px]">
                            <div>Created: {new Date(u.createdAt).toLocaleDateString()}</div>
                            <div className="text-slate-400">
                              Last login: {u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : 'Never'}
                            </div>
                          </td>
                          <td className="py-3.5 px-4 text-right">
                            <div className="inline-flex items-center space-x-1">
                              <button
                                onClick={() => setEditingUser(u)}
                                title="Edit User Information"
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition cursor-pointer"
                              >
                                <Edit3 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setPasswordResetUser(u)}
                                title="Reset User Password"
                                className="p-1.5 text-slate-500 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition cursor-pointer"
                              >
                                <KeyRound className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeletingUser(u)}
                                disabled={isSelf}
                                title={isSelf ? 'Cannot delete your own account' : 'Delete User Account'}
                                className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 2.5: WORK ORDERS & TICKETS DIRECTORY (ADMIN)
         ======================================================== */}
      {activeSection === 'tickets' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-[11px] font-bold text-indigo-600 uppercase tracking-wider">
                  Admin Authority
                </span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200">
                  {tickets.length} Active Work Orders
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 tracking-tight">
                Work Orders & Ticket Management
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Inspect, audit, or permanently delete repair tickets across all benches and statuses.
              </p>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={ticketSearch}
                  onChange={(e) => setTicketSearch(e.target.value)}
                  placeholder="Search by ticket #, client, phone, device..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                />
              </div>
              <button
                type="button"
                onClick={() => fetchTicketsList()}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition flex items-center gap-1.5 cursor-pointer shadow-2xs"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Refresh</span>
              </button>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Ticket #</th>
                    <th className="py-3 px-4">Customer</th>
                    <th className="py-3 px-4">Device</th>
                    <th className="py-3 px-4">Reported Issue</th>
                    <th className="py-3 px-4">Status</th>
                    <th className="py-3 px-4 text-right">Balance</th>
                    <th className="py-3 px-4 text-right">Admin Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {tickets.filter((t) => {
                    const q = ticketSearch.trim().toLowerCase();
                    if (!q) return true;
                    return (
                      t.ticketNumber.toString().includes(q) ||
                      t.customer.fullName.toLowerCase().includes(q) ||
                      t.customer.phone.includes(q) ||
                      (t.device?.name && t.device.name.toLowerCase().includes(q)) ||
                      (t.faultDescription && t.faultDescription.toLowerCase().includes(q))
                    );
                  }).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-12 text-slate-400 italic">
                        No work orders found matching your search.
                      </td>
                    </tr>
                  ) : (
                    tickets
                      .filter((t) => {
                        const q = ticketSearch.trim().toLowerCase();
                        if (!q) return true;
                        return (
                          t.ticketNumber.toString().includes(q) ||
                          t.customer.fullName.toLowerCase().includes(q) ||
                          t.customer.phone.includes(q) ||
                          (t.device?.name && t.device.name.toLowerCase().includes(q)) ||
                          (t.faultDescription && t.faultDescription.toLowerCase().includes(q))
                        );
                      })
                      .map((ticket) => {
                        const totalCents = ticket.totals ? ticket.totals.totalCents : ticket.laborCents;
                        const paidCents = ticket.totals ? ticket.totals.paidCents : 0;
                        const balanceCents = ticket.totals ? ticket.totals.balanceCents : (ticket.laborCents - paidCents);
                        const isPaid = totalCents > 0 && paidCents >= totalCents;
                        const isUnbilled = totalCents === 0 && paidCents === 0;

                        return (
                          <tr key={ticket.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4 font-mono font-bold text-indigo-600">
                              #{ticket.ticketNumber}
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-bold text-slate-900 block">{ticket.customer.fullName}</span>
                              <span className="text-[11px] text-slate-500 font-mono flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {ticket.customer.phone}
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-semibold text-slate-800">{ticket.device?.name || 'Device'}</span>
                            </td>
                            <td className="py-3 px-4 max-w-xs truncate text-slate-600" title={ticket.faultDescription}>
                              {ticket.faultDescription}
                            </td>
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-700">
                                {ticket.status.replace(/_/g, ' ')}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                              {isPaid ? (
                                <span className="text-emerald-600 text-[11px] font-bold">Paid</span>
                              ) : isUnbilled ? (
                                <span className="text-slate-400 text-[11px] font-medium">Unbilled</span>
                              ) : paidCents > 0 && balanceCents <= 0 ? (
                                <span className="text-teal-600 text-[11px] font-bold">Deposit ${(paidCents / 100).toFixed(2)}</span>
                              ) : (
                                <span>${(balanceCents / 100).toFixed(2)}</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-right">
                              <button
                                type="button"
                                onClick={() => setDeletingTicket(ticket)}
                                className="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded-lg text-xs font-bold transition cursor-pointer shadow-2xs"
                                title="Delete Work Order Permanently"
                              >
                                <Trash2 className="w-3.5 h-3.5 text-red-600" />
                                <span>Delete Ticket</span>
                              </button>
                            </td>
                          </tr>
                        );
                      })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 3: ROLES & RBAC PERMISSIONS
         ======================================================== */}
      {activeSection === 'roles' && (
        <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
          <div className="border-b border-slate-100 pb-4">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-indigo-600" />
              Role-Based Access Control (RBAC) Specification
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Faso Fix enforces strict server-side authentication and authorization guards. Frontend controls adapt automatically to the verified JWT session.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Administrator Role Card */}
            <div className="p-5 rounded-2xl border border-purple-200 bg-purple-50/30 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 bg-purple-100 text-purple-800 rounded-lg font-bold text-xs">
                  👑 Role: ADMINISTRATOR
                </span>
                <span className="text-[11px] font-mono text-purple-600 font-semibold">Tier 1 &bull; Full Access</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Full governance over application operations, financial configuration, user provisioning, technician credential resets, and raw immutable audit logs.
              </p>
              <ul className="text-xs text-slate-700 space-y-2 pt-2">
                {[
                  'User creation, role assignment, password resets, and deactivation',
                  'Modify store profile, tax percentages (HST/GST/VAT), and legal waiver terms',
                  'View sensitive administrative activity and authentication logs',
                  'Direct POS ticket intake, parts attachment, payments, and invoice printing',
                  'Global database inspection and sequential WO counter controls',
                ].map((perm, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-purple-600 shrink-0 mt-0.5" />
                    <span>{perm}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Standard User Role Card */}
            <div className="p-5 rounded-2xl border border-slate-200 bg-slate-50/50 space-y-3">
              <div className="flex items-center justify-between">
                <span className="px-2.5 py-1 bg-slate-200 text-slate-800 rounded-lg font-bold text-xs">
                  🔧 Role: TECHNICIAN (STANDARD USER)
                </span>
                <span className="text-[11px] font-mono text-slate-500 font-semibold">Tier 2 &bull; Shop Floor</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Daily workbench operations: device check-in, repair diagnostic QA checkpoints, parts inventory stock tracking, customer notifications, and taking tender.
              </p>
              <ul className="text-xs text-slate-700 space-y-2 pt-2">
                {[
                  'Execute 60-Second intake workflow and record customer digital waivers',
                  'Perform multi-stage diagnostic checks and add internal bench notes',
                  'Take payments, collect deposits, and issue customer receipts',
                  'Update own personal profile, bio, password, and notification sound FX',
                  'Restricted from creating users, changing tax rates, or viewing system audit logs',
                ].map((perm, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <Check className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                    <span>{perm}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          SECTION 4: SYSTEM AUDIT & ACTIVITY LOGS
         ======================================================== */}
      {activeSection === 'audit' && (
        <div className="space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
            <div className="flex flex-1 items-center gap-2.5">
              <div className="relative flex-1 max-w-sm">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={auditSearch}
                  onChange={(e) => {
                    setAuditPage(1);
                    setAuditSearch(e.target.value);
                  }}
                  placeholder="Search actor, action, or log details..."
                  className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                />
              </div>

              <select
                value={auditActionFilter}
                onChange={(e) => {
                  setAuditPage(1);
                  setAuditActionFilter(e.target.value);
                }}
                className="px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl text-slate-700 font-semibold focus:outline-none cursor-pointer"
              >
                <option value="ALL">All Actions</option>
                <option value="LOGIN">Logins</option>
                <option value="LOGOUT">Logouts</option>
                <option value="USER_CREATE">User Created</option>
                <option value="USER_UPDATE">User Updated</option>
                <option value="USER_DELETE">User Deleted</option>
                <option value="ROLE_CHANGE">Role Changes</option>
                <option value="STATUS_CHANGE">Status Changes</option>
                <option value="PASSWORD_RESET">Password Resets</option>
                <option value="SETTINGS_UPDATE">Settings Changed</option>
              </select>
            </div>

            <span className="text-xs text-slate-500 font-medium">
              Showing {auditLogs.length} of {auditTotal || auditLogs.length} immutable events
            </span>
          </div>

          <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                    <th className="py-3 px-4">Timestamp</th>
                    <th className="py-3 px-4">Actor</th>
                    <th className="py-3 px-4">Action</th>
                    <th className="py-3 px-4">Event Description / Details</th>
                    <th className="py-3 px-4 text-right">IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {auditLogs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="text-center py-10 text-slate-400">
                        No audit logs recorded matching this filter.
                      </td>
                    </tr>
                  ) : (
                    auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition">
                        <td className="py-3 px-4 text-slate-500 font-mono text-[11px] whitespace-nowrap">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                        <td className="py-3 px-4 font-bold text-slate-900">
                          {log.actorName}
                        </td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-0.5 rounded-md font-mono text-[10px] font-bold bg-slate-100 text-slate-800 border border-slate-200">
                            {log.action}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-slate-700 leading-relaxed max-w-md">
                          {log.details}
                        </td>
                        <td className="py-3 px-4 text-right font-mono text-slate-400 text-[11px]">
                          {log.ipAddress || 'internal'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {auditTotalPages > 1 && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white px-4 py-3 rounded-xl border border-slate-200/90 shadow-xs text-xs">
              <span className="text-slate-600 font-medium">
                Page <strong className="text-slate-900">{auditPage}</strong> of{' '}
                <strong className="text-slate-900">{auditTotalPages}</strong> &bull;{' '}
                <strong className="text-slate-900">{auditTotal}</strong> total audit entries
              </span>
              <div className="flex items-center space-x-2">
                <button
                  type="button"
                  disabled={auditPage <= 1}
                  onClick={() => setAuditPage((p) => Math.max(1, p - 1))}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold transition cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Previous</span>
                </button>
                <button
                  type="button"
                  disabled={auditPage >= auditTotalPages}
                  onClick={() => setAuditPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed text-slate-700 font-bold transition cursor-pointer"
                >
                  <span>Next</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================
          SECTION 6: TIME & ATTENDANCE DASHBOARD
         ======================================================== */}
      {activeSection === 'attendance' && (
        <AdminAttendanceTab />
      )}

      {/* ========================================================
          SECTION 7: PAYROLL & STATUTORY REMUNERATION
         ======================================================== */}
      {activeSection === 'payroll' && (
        <AdminPayrollTab />
      )}

      {/* ========================================================
          SECTION 8: SHIFT CALENDAR & SCHEDULING (ONTARIO ESA)
         ======================================================== */}
      {activeSection === 'schedule' && (
        <AdminScheduleTab users={users} currentUser={currentUser} />
      )}

      {/* ========================================================
          SECTION 9: POS SALES ATTRIBUTION & LABOR ANALYTICS
         ======================================================== */}
      {activeSection === 'sales-labor' && (
        <AdminSalesLaborTab />
      )}

      {/* ========================================================
          MODAL: CREATE NEW USER
         ======================================================== */}
      {isCreateUserModalOpen && (
        <CreateUserModal
          onClose={() => setIsCreateUserModalOpen(false)}
          onSuccess={() => {
            setIsCreateUserModalOpen(false);
            showToast('New user account created successfully');
            fetchUsersList();
            fetchOverview();
          }}
        />
      )}

      {/* ========================================================
          MODAL: EDIT USER
         ======================================================== */}
      {editingUser && (
        <EditUserModal
          user={editingUser}
          onClose={() => setEditingUser(null)}
          onSuccess={() => {
            setEditingUser(null);
            showToast('User updated successfully');
            fetchUsersList();
            fetchOverview();
          }}
        />
      )}

      {/* ========================================================
          MODAL: RESET PASSWORD
         ======================================================== */}
      {passwordResetUser && (
        <ResetPasswordModal
          user={passwordResetUser}
          onClose={() => setPasswordResetUser(null)}
          onSuccess={() => {
            setPasswordResetUser(null);
            showToast(`Password updated for ${passwordResetUser.username}`);
            fetchAuditList();
          }}
        />
      )}

      {/* ========================================================
          MODAL: DELETE USER CONFIRMATION
         ======================================================== */}
      {deletingUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-red-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Permanently Delete User?
              </h3>
              <p className="text-xs text-slate-500">
                Are you sure you want to delete <strong className="text-slate-800">{deletingUser.name}</strong> (@{deletingUser.username})? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                onClick={() => setDeletingUser(null)}
                className="flex-1 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteUser}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
      {/* ========================================================
          MODAL: DELETE TICKET CONFIRMATION (ADMIN)
         ======================================================== */}
      {deletingTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-red-200 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Delete Work Order #{deletingTicket.ticketNumber}?
              </h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Are you sure you want to delete this repair order for <strong className="text-slate-800">{deletingTicket.customer.fullName}</strong>? Any inventory parts will be returned to stock.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingTicket(null)}
                className="flex-1 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteTicket}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUB-MODAL: CREATE USER
// ---------------------------------------------------------------------------

interface CreateUserModalProps {
  onClose: () => void;
  onSuccess: () => void;
}

const CreateUserModal: React.FC<CreateUserModalProps> = ({ onClose, onSuccess }) => {
  const [name, setName] = useState('');
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'ADMIN' | 'USER'>('USER');
  const [phone, setPhone] = useState('');
  const [bench, setBench] = useState('Bench #01');
  const [bio, setBio] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth('/api/admin/users', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          email: email.trim(),
          password,
          role,
          phone: phone.trim() || undefined,
          bench: bench.trim() || undefined,
          bio: bio.trim() || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create user');

      if (data.data?.syncPayload) {
        saveRegisteredUsers([data.data]);
      }

      posAudio.playSuccessChime();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error creating user');
      posAudio.playWarningBeep();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="bg-slate-50 px-6 py-4 text-slate-900 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center space-x-2.5">
            <UserPlus className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Provision New Staff User</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Full Name *</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Marcus Vance"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Username *</label>
              <input
                type="text"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="marcus"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="e.g. tech@gmail.com (any email domain)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
              <p className="text-[10px] text-slate-400">Can be personal or shop email (@gmail.com, etc.). User can sign in using username OR email.</p>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="(555) 019-2834"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Role Authority *</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-bold"
              >
                <option value="USER">Technician (Standard)</option>
                <option value="ADMIN">Master Administrator</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Assigned Bench</label>
              <input
                type="text"
                value={bench}
                onChange={(e) => setBench(e.target.value)}
                placeholder="Bench #02"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Technician Bio / Specialization</label>
            <textarea
              rows={2}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="e.g. Master soldering technician, mobile screen specialist..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white resize-none"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Initial Password * (Min 8 chars)</label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Set secure password"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Creating...' : 'Provision User'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUB-MODAL: EDIT USER
// ---------------------------------------------------------------------------

interface EditUserModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

const EditUserModal: React.FC<EditUserModalProps> = ({ user, onClose, onSuccess }) => {
  const [name, setName] = useState(user.name);
  const [email, setEmail] = useState(user.email);
  const [phone, setPhone] = useState(user.phone || '');
  const [bench, setBench] = useState(user.bench || '');
  const [role, setRole] = useState<UserRole>(user.role);
  const [status, setStatus] = useState<UserStatus>(user.status);
  const [hourlyWage, setHourlyWage] = useState('22.00');
  const [vacationPct, setVacationPct] = useState('4.0');
  const [initialWage, setInitialWage] = useState('22.00');
  const [initialVacationPct, setInitialVacationPct] = useState('4.0');
  const [wageReason, setWageReason] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Fetch wage history on open
    fetchWithAuth(`/api/admin/users/${user.id}/wages`)
      .then((res) => res.json())
      .then((json) => {
        const wageSource = json.data?.user || json.data?.currentWage;
        if (wageSource) {
          const val = ((wageSource.hourlyRateCents || 2200) / 100).toFixed(2);
          const vacVal = ((wageSource.vacationPayPct ?? 400) / 100).toFixed(1);
          setHourlyWage(val);
          setInitialWage(val);
          setVacationPct(vacVal);
          setInitialVacationPct(vacVal);
        }
      })
      .catch(() => {});
  }, [user.id]);

  const isWageChanged = hourlyWage !== initialWage || vacationPct !== initialVacationPct;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isWageChanged && !wageReason.trim()) {
      setError('A reason is required to adjust employee wage rates for CRA audit records.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/admin/users/${user.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim(),
          phone: phone.trim() || undefined,
          bench: bench.trim() || undefined,
          role,
          status,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to update user');

      // Update wage if modified
      if (isWageChanged) {
        const wageRes = await fetchWithAuth(`/api/admin/users/${user.id}/wages`, {
          method: 'POST',
          body: JSON.stringify({
            hourlyRateCents: Math.round(parseFloat(hourlyWage) * 100),
            vacationPayPct: Math.round(parseFloat(vacationPct) * 100),
            reason: wageReason.trim(),
          }),
        });
        if (!wageRes.ok) {
          const wData = await wageRes.json();
          throw new Error(wData.error || 'Failed to update wage rate');
        }
      }

      posAudio.playSuccessChime();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error updating user');
      posAudio.playWarningBeep();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="bg-slate-50 px-6 py-4 text-slate-900 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center space-x-2.5">
            <Edit3 className="w-5 h-5 text-indigo-600" />
            <h3 className="text-sm font-bold text-slate-900">Edit User: {user.username}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Full Name *</label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Email Address *</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Phone Number</label>
              <input
                type="text"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">System Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="USER">Technician (Standard)</option>
                <option value="ADMIN">Master Administrator</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-700">Account Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl font-bold"
              >
                <option value="ACTIVE">Active</option>
                <option value="DISABLED">Disabled</option>
              </select>
            </div>
          </div>

          {/* Wage & Compensation Section */}
          <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-900">
                Wage &amp; Compensation (CRA)
              </span>
              <span className="text-[10px] text-slate-500 font-mono">OT: &gt;44h @ 1.5x</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Hourly Wage ($)</label>
                <input
                  type="number"
                  step="0.25"
                  min="0"
                  value={hourlyWage}
                  onChange={(e) => setHourlyWage(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold text-slate-600 block mb-0.5">Vacation Pay %</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={vacationPct}
                  onChange={(e) => setVacationPct(e.target.value)}
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-mono"
                />
              </div>
            </div>
            {isWageChanged && (
              <div>
                <label className="text-[10px] font-bold text-red-600 block mb-0.5">
                  Wage Adjustment Reason *
                </label>
                <input
                  type="text"
                  required
                  value={wageReason}
                  onChange={(e) => setWageReason(e.target.value)}
                  placeholder="e.g. Annual merit increase / certification"
                  className="w-full px-2.5 py-1.5 text-xs bg-white border border-red-200 rounded-lg"
                />
              </div>
            )}
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Assigned Workstation</label>
            <input
              type="text"
              value={bench}
              onChange={(e) => setBench(e.target.value)}
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// SUB-MODAL: RESET PASSWORD
// ---------------------------------------------------------------------------

interface ResetPasswordModalProps {
  user: User;
  onClose: () => void;
  onSuccess: () => void;
}

const ResetPasswordModal: React.FC<ResetPasswordModalProps> = ({ user, onClose, onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters long');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const res = await fetchWithAuth(`/api/admin/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to reset password');

      if (data.syncPayload) {
        saveRegisteredUsers([{ ...user, syncPayload: data.syncPayload }]);
      }

      posAudio.playSuccessChime();
      onSuccess();
    } catch (err: any) {
      setError(err.message || 'Error resetting password');
      posAudio.playWarningBeep();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-150">
        <div className="bg-slate-50 px-6 py-4 text-slate-900 flex items-center justify-between border-b border-slate-200">
          <div className="flex items-center space-x-2.5">
            <KeyRound className="w-5 h-5 text-amber-600" />
            <h3 className="text-sm font-bold text-slate-900">Reset Password: {user.username}</h3>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer">
            &times;
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-3.5">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700">
              {error}
            </div>
          )}

          <p className="text-xs text-slate-500">
            Enter a new password for <strong className="text-slate-800">{user.name}</strong>. Their active sessions will be terminated immediately.
          </p>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">New Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            />
          </div>

          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700">Confirm New Password *</label>
            <input
              type="password"
              required
              minLength={8}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter password"
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
            />
          </div>

          <div className="pt-2 flex items-center justify-end space-x-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md cursor-pointer disabled:opacity-50"
            >
              {isSubmitting ? 'Resetting...' : 'Set Password'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
