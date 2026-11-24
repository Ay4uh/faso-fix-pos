import React, { useEffect, useState } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  KeyRound,
  RefreshCw,
  LogOut,
  AlertTriangle,
  CheckCircle2,
  Monitor,
  Activity,
} from 'lucide-react';
import { fetchWithAuth } from '../../utils/auth';
import { posAudio } from '../../utils/audio';
import { ConfirmDialog } from '../ConfirmDialog';

interface PostureControl {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
}

interface SecurityAlert {
  id: string;
  actorName: string;
  action: string;
  details: string;
  ipAddress?: string | null;
  createdAt: string;
}

interface SecurityPosture {
  provider: string;
  rls: { total: number; enabled: number; allEnabled: boolean };
  auditChain: { checked: number; intact: boolean; tamperedCount: number };
  users: {
    totalActive: number;
    twoFactorEnabled: number;
    adminTotal: number;
    adminTwoFactorEnabled: number;
    defaultPasswordAccounts: string[];
  };
  activeSessionsCount: number;
  failedLogins24h: number;
  env: { databaseUrlConfigured: boolean; fieldEncryptionKeyConfigured: boolean };
  controls: PostureControl[];
  recentAlerts: SecurityAlert[];
}

interface ActiveSessionRow {
  id: string;
  user: {
    id: string;
    username: string;
    name: string;
    role: string;
    twoFactorEnabled?: boolean;
  };
  device: string;
  ipAddress: string;
  lastActiveAt: string;
  expiresAt: string;
  createdAt: string;
  isCurrent: boolean;
}

export const AdminSecurityTab: React.FC = () => {
  const [posture, setPosture] = useState<SecurityPosture | null>(null);
  const [sessions, setSessions] = useState<ActiveSessionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pendingSessionAction, setPendingSessionAction] = useState<
    | { type: 'kick'; sessionId: string; device: string; username: string }
    | { type: 'logoutAll'; userId: string; username: string }
    | null
  >(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([
        fetchWithAuth('/api/admin/security/posture'),
        fetchWithAuth('/api/admin/sessions'),
      ]);
      if (pRes.ok) {
        const pJson = await pRes.json();
        setPosture(pJson.data || null);
      }
      if (sRes.ok) {
        const sJson = await sRes.json();
        setSessions(sJson.data || []);
      }
    } catch (err) {
      console.error('[AdminSecurityTab]', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRevokeSession = async (sessionId: string) => {
    setBusyId(sessionId);
    try {
      const res = await fetchWithAuth(`/api/admin/sessions/${encodeURIComponent(sessionId)}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        posAudio.playSuccessChime();
        setNotice('Session terminated immediately.');
        setTimeout(() => setNotice(null), 3000);
        await loadData();
      }
    } catch {
      posAudio.playWarningBeep();
    } finally {
      setBusyId(null);
    }
  };

  const handleForceLogoutUser = async (userId: string, username: string) => {
    setBusyId(`user:${userId}`);
    try {
      const res = await fetchWithAuth(`/api/admin/users/${encodeURIComponent(userId)}/revoke-sessions`, {
        method: 'POST',
      });
      if (res.ok) {
        posAudio.playSuccessChime();
        setNotice(`Terminated all active sessions for @${username}.`);
        setTimeout(() => setNotice(null), 3500);
        await loadData();
      }
    } catch {
      posAudio.playWarningBeep();
    } finally {
      setBusyId(null);
    }
  };

  const passedControls = posture ? posture.controls.filter((c) => c.ok).length : 0;
  const totalControls = posture ? posture.controls.length : 11;

  return (
    <div className="space-y-5">
      <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-emerald-600" />
            <h3 className="text-base font-extrabold text-slate-900">Security Center &amp; Threat Telemetry</h3>
          </div>
          <p className="text-xs text-slate-500">
            Live verification of database RLS, tamper-evident audit hash chains, active staff devices, and 2FA enrollment.
          </p>
        </div>

        <button
          type="button"
          onClick={loadData}
          disabled={loading}
          className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer shrink-0 shadow-2xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Telemetry</span>
        </button>
      </div>

      {notice && (
        <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{notice}</span>
        </div>
      )}

      {posture && (
        <>
          {/* Advisory Action Banner if bootstrap passwords or fallback DB URL are still active */}
          {(posture.users.defaultPasswordAccounts.length > 0 || !posture.env.databaseUrlConfigured) && (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-950 space-y-1.5">
              <div className="font-bold flex items-center gap-2 text-amber-900">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Recommended Dashboard Hardening Actions Remaining</span>
              </div>
              {posture.users.defaultPasswordAccounts.length > 0 && (
                <p className="text-[11px] text-amber-900">
                  Rotate default credentials in Settings &rarr; Password &amp; Security for:{' '}
                  <strong className="font-mono">{posture.users.defaultPasswordAccounts.join(', ')}</strong>
                </p>
              )}
              {!posture.env.databaseUrlConfigured && (
                <p className="text-[11px] text-amber-900">
                  Rotate your Supabase PostgreSQL password and add <code className="font-mono font-bold">DATABASE_URL</code> in Vercel Environment Variables.
                </p>
              )}
            </div>
          )}

          {/* KPI Bento Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>PostgreSQL RLS</span>
                <Lock className="w-4 h-4 text-emerald-600" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {posture.rls.enabled}/{posture.rls.total || 'Local'}
              </div>
              <div className="text-[11px] font-semibold text-emerald-700">
                {posture.rls.allEnabled ? 'All Tables Locked' : 'Protected'}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>Audit Hash Chain</span>
                <ShieldCheck className="w-4 h-4 text-indigo-600" />
              </div>
              <div className={`text-xl font-black ${posture.auditChain.intact ? 'text-emerald-700' : 'text-rose-600'}`}>
                {posture.auditChain.intact ? 'INTACT' : 'ALERT'}
              </div>
              <div className="text-[11px] text-slate-500">
                {posture.auditChain.checked} recent entries verified
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>2FA Enrollment</span>
                <KeyRound className="w-4 h-4 text-purple-600" />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">
                {posture.users.twoFactorEnabled}/{posture.users.totalActive}
              </div>
              <div className="text-[11px] text-slate-500">
                Admins w/ 2FA: {posture.users.adminTwoFactorEnabled}/{posture.users.adminTotal}
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200/90 shadow-xs space-y-1.5">
              <div className="text-[11px] font-bold text-slate-500 flex items-center justify-between">
                <span>24h Failed Auth</span>
                <ShieldAlert className={`w-4 h-4 ${posture.failedLogins24h > 0 ? 'text-amber-600' : 'text-slate-400'}`} />
              </div>
              <div className="text-xl font-black text-slate-900 font-mono">{posture.failedLogins24h}</div>
              <div className="text-[11px] text-slate-500">
                {posture.activeSessionsCount} live session(s)
              </div>
            </div>
          </div>

          {/* Enterprise Controls Checklist */}
          <div className="bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-slate-900">Active Security Hardening Controls</h4>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                {passedControls}/{totalControls} Verified Active
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {posture.controls.map((c) => (
                <div
                  key={c.id}
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 ${
                    c.ok ? 'bg-emerald-50/40 border-emerald-200/70' : 'bg-amber-50/50 border-amber-200/80'
                  }`}
                >
                  {c.ok ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-slate-900">{c.label}</div>
                    <div className="text-[11px] text-slate-600 mt-0.5">{c.detail}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Active Shop Sessions */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Monitor className="w-4 h-4 text-indigo-600" />
            <h4 className="text-sm font-bold text-slate-900">Active Staff Devices &amp; Sessions ({sessions.length})</h4>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-[11px]">
                <th className="py-3 px-4">Staff Member</th>
                <th className="py-3 px-4">Device / Client</th>
                <th className="py-3 px-4">IP Address</th>
                <th className="py-3 px-4">Last Active</th>
                <th className="py-3 px-4 text-right">Control</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-400">
                    No active sessions recorded.
                  </td>
                </tr>
              ) : (
                sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50/70">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900 flex items-center gap-1.5">
                        <span>{s.user.name}</span>
                        {s.isCurrent && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[9px] font-bold">
                            THIS DEVICE
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 font-mono">
                        @{s.user.username} &bull; {s.user.role}
                      </div>
                    </td>
                    <td className="py-3 px-4 text-slate-700 font-medium">{s.device}</td>
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-600">{s.ipAddress}</td>
                    <td className="py-3 px-4 text-[11px] text-slate-500">
                      {new Date(s.lastActiveAt).toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="inline-flex items-center gap-1.5">
                        {!s.isCurrent && (
                          <button
                            type="button"
                            disabled={busyId === s.id}
                            onClick={() =>
                              setPendingSessionAction({
                                type: 'kick',
                                sessionId: s.id,
                                device: s.device,
                                username: s.user.username,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>Kick</span>
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busyId === `user:${s.user.id}`}
                          onClick={() =>
                            setPendingSessionAction({
                              type: 'logoutAll',
                              userId: s.user.id,
                              username: s.user.username,
                            })
                          }
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-bold cursor-pointer disabled:opacity-50"
                        >
                          Logout All
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

      {/* Recent Security & Auth Alerts */}
      {posture && (
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-2">
            <Activity className="w-4 h-4 text-amber-600" />
            <h4 className="text-sm font-bold text-slate-900">Recent Auth &amp; Security Alerts</h4>
          </div>
          <div className="divide-y divide-slate-100">
            {posture.recentAlerts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                No security alerts or failed authentication events recorded.
              </div>
            ) : (
              posture.recentAlerts.map((a) => (
                <div key={a.id} className="px-5 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-mono text-[10px] font-bold shrink-0">
                      {a.action}
                    </span>
                    <span className="font-bold text-slate-800 truncate">{a.actorName}</span>
                    <span className="text-slate-600 truncate">{a.details}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 font-mono shrink-0">
                    {a.ipAddress || 'internal'} &bull; {new Date(a.createdAt).toLocaleString()}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        isOpen={Boolean(pendingSessionAction)}
        tone="warning"
        title={
          pendingSessionAction?.type === 'kick'
            ? 'Terminate Active Session?'
            : pendingSessionAction
            ? `Sign Out All Sessions for @${pendingSessionAction.username}?`
            : ''
        }
        message={
          pendingSessionAction?.type === 'kick' ? (
            <>
              Are you sure you want to terminate <strong className="text-slate-900">{pendingSessionAction.device}</strong>{' '}
              for @{pendingSessionAction.username}?
            </>
          ) : pendingSessionAction ? (
            <>
              Are you sure you want to sign out every active session for{' '}
              <strong className="text-slate-900">@{pendingSessionAction.username}</strong>?
            </>
          ) : null
        }
        confirmLabel={
          pendingSessionAction?.type === 'kick' ? 'Yes, Terminate' : 'Yes, Sign Out All'
        }
        cancelLabel="No, Cancel"
        isProcessing={Boolean(busyId)}
        onCancel={() => setPendingSessionAction(null)}
        onConfirm={async () => {
          if (!pendingSessionAction) return;
          if (pendingSessionAction.type === 'kick') {
            await handleRevokeSession(pendingSessionAction.sessionId);
          } else {
            await handleForceLogoutUser(pendingSessionAction.userId, pendingSessionAction.username);
          }
          setPendingSessionAction(null);
        }}
      />
    </div>
  );
};
