import React, { useState, useEffect } from 'react';
import {
  SlidersHorizontal,
  Building2,
  Percent,
  Users,
  Volume2,
  VolumeX,
  Database,
  Check,
  AlertCircle,
  Save,
  Wrench,
  Shield,
  Play,
  Lock,
  LogOut,
  User,
  KeyRound,
  Bell,
  Sliders,
  DollarSign,
  Monitor,
  CheckCircle2,
  ArrowRight,
  ShieldAlert,
  ShieldCheck,
  Copy,
  RefreshCw,
  Smartphone,
} from 'lucide-react';
import { posAudio } from '../utils/audio';
import { fetchWithAuth, hasActiveSession } from '../utils/auth';
import { ShopSettings, User as UserType, UserPreferences } from '../types';
import { ConfirmDialog } from './ConfirmDialog';

interface SettingsViewProps {
  currentUser: UserType | null;
  onSettingsUpdated?: () => void;
  onUserUpdated?: (user: UserType) => void;
  onOpenAdminConsole?: () => void;
  onLogout?: () => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  currentUser,
  onSettingsUpdated,
  onUserUpdated,
  onOpenAdminConsole,
  onLogout,
}) => {
  const [activeTab, setActiveTab] = useState<
    'account' | 'security' | 'notifications' | 'preferences' | 'system' | 'users'
  >('account');

  // Loading & Feedback states
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Shop Settings State (Database Setting table)
  const [settings, setSettings] = useState<ShopSettings | null>(null);
  const [shopName, setShopName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [receiptFooter, setReceiptFooter] = useState('');
  const [taxLabel, setTaxLabel] = useState('HST');
  const [taxRatePercent, setTaxRatePercent] = useState('13.00');
  const [warrantyDays, setWarrantyDays] = useState(90);
  const [defaultLaborRate, setDefaultLaborRate] = useState('85.00');
  const [currencySymbol, setCurrencySymbol] = useState('$');
  const [technicians, setTechnicians] = useState('');
  const [benches, setBenches] = useState('');

  // User Profile & Account State
  const [fullName, setFullName] = useState(currentUser?.name || '');
  const [userEmail, setUserEmail] = useState(currentUser?.email || '');
  const [userPhone, setUserPhone] = useState(currentUser?.phone || '');
  const [userBench, setUserBench] = useState(currentUser?.bench || '');
  const [userBio, setUserBio] = useState(currentUser?.bio || '');

  // Password Change State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  // Two-Factor Authentication & Active Sessions State
  const [twoFactorStatus, setTwoFactorStatus] = useState<{
    available: boolean;
    enabled: boolean;
    hasPendingSetup?: boolean;
    recoveryCodesRemaining: number;
  }>({
    available: false,
    enabled: Boolean(currentUser?.twoFactorEnabled),
    recoveryCodesRemaining: 0,
  });
  const [setupData, setSetupData] = useState<{ qrDataUrl: string; manualSecret: string } | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [manageMode, setManageMode] = useState<'none' | 'disable' | 'regen'>('none');
  const [managePassword, setManagePassword] = useState('');
  const [manageCode, setManageCode] = useState('');
  const [twoFactorBusy, setTwoFactorBusy] = useState(false);
  const [sessionsList, setSessionsList] = useState<any[]>([]);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [pendingSessionRevoke, setPendingSessionRevoke] = useState<
    { type: 'single'; sessionId: string; device: string } | { type: 'other' } | null
  >(null);
  const [isRevokingSession, setIsRevokingSession] = useState(false);

  // User Preferences & Notification Toggles
  let initialPrefs: UserPreferences = {
    soundFX: true,
    compactView: false,
    autoPrint: false,
    emailAlerts: true,
    highPriorityAudio: true,
    lowStockAlerts: true,
    autoLockMinutes: 0,
  };
  try {
    if (currentUser?.preferences) {
      initialPrefs = { ...initialPrefs, ...JSON.parse(currentUser.preferences) };
    }
  } catch {}

  const [soundFXEnabled, setSoundFXEnabled] = useState(initialPrefs.soundFX);
  const [compactViewEnabled, setCompactViewEnabled] = useState(initialPrefs.compactView);
  const [autoPrintEnabled, setAutoPrintEnabled] = useState(initialPrefs.autoPrint);
  const [emailAlertsEnabled, setEmailAlertsEnabled] = useState(initialPrefs.emailAlerts);
  const [highPriorityAudioEnabled, setHighPriorityAudioEnabled] = useState(initialPrefs.highPriorityAudio);
  const [lowStockAlertsEnabled, setLowStockAlertsEnabled] = useState(initialPrefs.lowStockAlerts);
  const [autoLockMinutes, setAutoLockMinutes] = useState<number>(initialPrefs.autoLockMinutes || 0);

  // Sync state if currentUser changes
  useEffect(() => {
    if (currentUser) {
      setFullName(currentUser.name);
      setUserEmail(currentUser.email);
      setUserPhone(currentUser.phone || '');
      setUserBench(currentUser.bench || '');
      setUserBio(currentUser.bio || '');
      setTwoFactorStatus((prev) => ({ ...prev, enabled: Boolean(currentUser.twoFactorEnabled) }));

      try {
        const p = JSON.parse(currentUser.preferences || '{}');
        if (p.soundFX !== undefined) setSoundFXEnabled(p.soundFX);
        if (p.compactView !== undefined) setCompactViewEnabled(p.compactView);
        if (p.autoPrint !== undefined) setAutoPrintEnabled(p.autoPrint);
        if (p.emailAlerts !== undefined) setEmailAlertsEnabled(p.emailAlerts);
        if (p.highPriorityAudio !== undefined) setHighPriorityAudioEnabled(p.highPriorityAudio);
        if (p.lowStockAlerts !== undefined) setLowStockAlertsEnabled(p.lowStockAlerts);
        if (p.autoLockMinutes !== undefined) setAutoLockMinutes(Number(p.autoLockMinutes) || 0);
      } catch {}
    }
  }, [currentUser]);

  const loadSecurityData = async () => {
    if (!currentUser || !hasActiveSession()) return;
    setSessionsLoading(true);
    try {
      const [tfRes, sessRes] = await Promise.all([
        fetchWithAuth('/api/auth/2fa/status'),
        fetchWithAuth('/api/auth/sessions'),
      ]);
      if (tfRes.ok) {
        const tfJson = await tfRes.json();
        if (tfJson.data) {
          setTwoFactorStatus({
            available: Boolean(tfJson.data.available),
            enabled: Boolean(tfJson.data.enabled),
            hasPendingSetup: Boolean(tfJson.data.hasPendingSetup),
            recoveryCodesRemaining: Number(tfJson.data.recoveryCodesRemaining || 0),
          });
        }
      }
      if (sessRes.ok) {
        const sessJson = await sessRes.json();
        setSessionsList(sessJson.data || []);
      }
    } catch {} finally {
      setSessionsLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'security') {
      loadSecurityData();
    }
  }, [activeTab]);

  const fetchSettings = async () => {
    try {
      setIsLoading(true);
      const res = await fetchWithAuth('/api/settings');
      if (res.ok) {
        const json = await res.json();
        const data: ShopSettings = json.data;
        setSettings(data);

        setShopName(data.shopName || 'Faso Fix');
        setPhone(data.phone || '');
        setEmail(data.email || '');
        setAddress(data.address || '');
        setReceiptFooter(data.receiptFooter || '');
        setTaxLabel(data.taxLabel || 'HST');
        setTaxRatePercent(((data.taxRateBps || 1300) / 100).toFixed(2));
        setWarrantyDays(data.warrantyDays || 90);
        setDefaultLaborRate(((data.defaultLaborRateCents || 8500) / 100).toFixed(2));
        setCurrencySymbol(data.currencySymbol || '$');
        setTechnicians(data.technicians || '');
        setBenches(data.benches || '');
      }
    } catch (err) {
      console.error(err);
      setErrorMessage('Could not load current settings');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const triggerToast = (msg: string) => {
    setSaveSuccess(msg);
    setTimeout(() => setSaveSuccess(null), 3000);
  };

  // 1. SAVE USER PROFILE & ACCOUNT
  const handleSaveProfile = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      if (!fullName.trim() || !userEmail.trim()) {
        throw new Error('Name and email are required');
      }

      if (currentUser && hasActiveSession()) {
        const res = await fetchWithAuth('/api/auth/profile', {
          method: 'PUT',
          body: JSON.stringify({
            name: fullName.trim(),
            email: userEmail.trim(),
            phone: userPhone.trim(),
            bench: userBench.trim(),
            bio: userBio.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to update user profile');

        if (onUserUpdated) onUserUpdated(data.user);
      }

      posAudio.playSuccessChime();
      triggerToast('User profile & account details saved successfully');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating profile');
      posAudio.playWarningBeep();
    } finally {
      setIsSaving(false);
    }
  };

  // 2. CHANGE PASSWORD
  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentPassword) {
      setErrorMessage('Please enter your current password');
      return;
    }
    if (newPassword.length < 8) {
      setErrorMessage('New password must be at least 8 characters long');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMessage('New passwords do not match');
      return;
    }

    setIsSaving(true);
    setErrorMessage(null);

    try {
      const res = await fetchWithAuth('/api/auth/password', {
        method: 'PUT',
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Password update failed');

      posAudio.playSuccessChime();
      triggerToast('Password successfully changed');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating password');
      posAudio.playWarningBeep();
    } finally {
      setIsSaving(false);
    }
  };

  // 3. SAVE NOTIFICATION PREFERENCES (PERSISTED TO DB)
  const handleSavePreferences = async (newPrefs: Partial<UserPreferences>) => {
    const updated: UserPreferences = {
      soundFX: soundFXEnabled,
      compactView: compactViewEnabled,
      autoPrint: autoPrintEnabled,
      emailAlerts: emailAlertsEnabled,
      highPriorityAudio: highPriorityAudioEnabled,
      lowStockAlerts: lowStockAlertsEnabled,
      autoLockMinutes,
      ...newPrefs,
    };

    if (newPrefs.soundFX !== undefined) {
      setSoundFXEnabled(newPrefs.soundFX);
      posAudio.setMuted(!newPrefs.soundFX);
      if (newPrefs.soundFX) posAudio.playBeep();
    }
    if (newPrefs.compactView !== undefined) setCompactViewEnabled(newPrefs.compactView);
    if (newPrefs.autoPrint !== undefined) setAutoPrintEnabled(newPrefs.autoPrint);
    if (newPrefs.emailAlerts !== undefined) setEmailAlertsEnabled(newPrefs.emailAlerts);
    if (newPrefs.highPriorityAudio !== undefined) setHighPriorityAudioEnabled(newPrefs.highPriorityAudio);
    if (newPrefs.lowStockAlerts !== undefined) setLowStockAlertsEnabled(newPrefs.lowStockAlerts);
    if (newPrefs.autoLockMinutes !== undefined) setAutoLockMinutes(newPrefs.autoLockMinutes);

    if (currentUser && hasActiveSession()) {
      try {
        const res = await fetchWithAuth('/api/auth/preferences', {
          method: 'PUT',
          body: JSON.stringify({ preferences: JSON.stringify(updated) }),
        });
        if (res.ok && onUserUpdated) {
          onUserUpdated({ ...currentUser, preferences: JSON.stringify(updated) });
        }
        triggerToast('Preferences saved');
      } catch (err) {
        console.error(err);
      }
    } else {
      triggerToast('Preferences updated locally');
    }
  };

  const handleStartTwoFactorSetup = async () => {
    if (!twoFactorStatus.available) return;
    setTwoFactorBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetchWithAuth('/api/auth/2fa/setup', { method: 'POST' });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Could not start 2FA setup');
      setSetupData(json.data);
      setConfirmCode('');
    } catch (err: any) {
      setErrorMessage(err.message);
      posAudio.playWarningBeep();
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleConfirmTwoFactorSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorBusy(true);
    setErrorMessage(null);
    try {
      const res = await fetchWithAuth('/api/auth/2fa/confirm', {
        method: 'POST',
        body: JSON.stringify({ code: confirmCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Verification failed');
      setSetupData(null);
      setConfirmCode('');
      setRecoveryCodes(json.data.recoveryCodes || []);
      setTwoFactorStatus((prev) => ({
        ...prev,
        enabled: true,
        recoveryCodesRemaining: (json.data.recoveryCodes || []).length,
      }));
      if (currentUser && onUserUpdated) {
        onUserUpdated({ ...currentUser, twoFactorEnabled: true });
      }
      posAudio.playSuccessChime();
      triggerToast('Two-Factor Authentication enabled');
    } catch (err: any) {
      setErrorMessage(err.message);
      posAudio.playWarningBeep();
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleManageTwoFactor = async (e: React.FormEvent) => {
    e.preventDefault();
    setTwoFactorBusy(true);
    setErrorMessage(null);
    try {
      const endpoint = manageMode === 'regen' ? '/api/auth/2fa/recovery' : '/api/auth/2fa/disable';
      const res = await fetchWithAuth(endpoint, {
        method: 'POST',
        body: JSON.stringify({ currentPassword: managePassword, code: manageCode.trim() }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Request failed');
      if (manageMode === 'regen') {
        setRecoveryCodes(json.data.recoveryCodes || []);
        setTwoFactorStatus((s) => ({ ...s, recoveryCodesRemaining: (json.data.recoveryCodes || []).length }));
        triggerToast('Fresh recovery codes generated');
      } else {
        setTwoFactorStatus((s) => ({ ...s, enabled: false, recoveryCodesRemaining: 0 }));
        setRecoveryCodes(null);
        if (currentUser && onUserUpdated) {
          onUserUpdated({ ...currentUser, twoFactorEnabled: false });
        }
        triggerToast('Two-Factor Authentication disabled');
      }
      setManageMode('none');
      setManagePassword('');
      setManageCode('');
      posAudio.playSuccessChime();
    } catch (err: any) {
      setErrorMessage(err.message);
      posAudio.playWarningBeep();
    } finally {
      setTwoFactorBusy(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      const res = await fetchWithAuth(`/api/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE' });
      if (res.ok) {
        triggerToast('Remote session signed out');
        loadSecurityData();
      }
    } catch {}
  };

  const handleRevokeOtherSessions = async () => {
    try {
      const res = await fetchWithAuth('/api/auth/sessions/other', { method: 'DELETE' });
      if (res.ok) {
        triggerToast('Signed out all other devices');
        loadSecurityData();
      }
    } catch {}
  };

  // 4. SAVE SYSTEM / SHOP CONFIGURATION (ADMIN ONLY / DB PERSISTENCE)
  const handleSaveSystemSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSaving(true);
    setErrorMessage(null);

    try {
      const taxBps = Math.round(parseFloat(taxRatePercent || '0') * 100);
      const defaultLaborCents = Math.round(parseFloat(defaultLaborRate || '0') * 100);

      const res = await fetchWithAuth('/api/settings', {
        method: 'PUT',
        body: JSON.stringify({
          shopName: shopName.trim(),
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          taxLabel: taxLabel.trim(),
          taxRateBps: taxBps,
          warrantyDays: Number(warrantyDays) || 90,
          defaultLaborRateCents: defaultLaborCents,
          currencySymbol: currencySymbol.trim() || '$',
          technicians: technicians.trim(),
          benches: benches.trim(),
          receiptFooter: receiptFooter.trim(),
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to update system settings');
      }

      posAudio.playSuccessChime();
      triggerToast('System & shop configuration saved live');
      if (onSettingsUpdated) onSettingsUpdated();
    } catch (err: any) {
      setErrorMessage(err.message || 'Error updating settings');
      posAudio.playWarningBeep();
    } finally {
      setIsSaving(false);
    }
  };

  const isAdmin = currentUser?.role === 'ADMIN';

  return (
    <div className="space-y-5 animate-in fade-in duration-150 pb-10">
      {/* Top Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex items-center space-x-3.5">
          <div className="w-11 h-11 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
            <SlidersHorizontal className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-base font-extrabold text-slate-900 leading-tight">
              Application Settings &amp; Preferences
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Manage your profile, password security, audio notifications, and store configuration
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2.5">
          {saveSuccess && (
            <span className="text-xs font-bold text-emerald-600 flex items-center gap-1.5 animate-in fade-in">
              <Check className="w-4 h-4 text-emerald-500" />
              {saveSuccess}
            </span>
          )}
          {isLoading && (
            <span className="text-xs text-slate-400 font-medium animate-pulse">
              Syncing settings...
            </span>
          )}
        </div>
      </div>

      {errorMessage && (
        <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}

      {/* Main Settings Navigation & Content */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
        {/* Sub-Navigation Sidebar */}
        <div className="bg-white p-2.5 rounded-2xl border border-slate-200/90 shadow-xs space-y-1 h-fit">
          <div className="px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400">
            Personal &amp; Security
          </div>

          {[
            { id: 'account', label: 'Account & Profile', icon: User },
            { id: 'security', label: 'Password & Security', icon: Lock },
            { id: 'notifications', label: 'Notification Preferences', icon: Bell },
            { id: 'preferences', label: 'Application Preferences', icon: Sliders },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setErrorMessage(null);
                }}
                className={`w-full flex items-center space-x-2.5 px-3 py-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}

          <div className="pt-3 px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-slate-400 border-t border-slate-100">
            System &amp; Store Admin
          </div>

          {[
            { id: 'system', label: 'System Configuration', icon: Building2, adminOnly: true },
            { id: 'users', label: 'Staff & User Management', icon: Users, adminOnly: true },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => {
                  setActiveTab(tab.id as any);
                  setErrorMessage(null);
                }}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-xs font-bold transition text-left cursor-pointer ${
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 border border-indigo-100 shadow-2xs'
                    : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                }`}
              >
                <div className="flex items-center space-x-2.5">
                  <Icon className={`w-4 h-4 ${isActive ? 'text-indigo-600' : 'text-slate-400'}`} />
                  <span>{tab.label}</span>
                </div>
                {!isAdmin && (
                  <Lock className="w-3 h-3 text-slate-300" />
                )}
              </button>
            );
          })}
        </div>

        {/* Content Panel */}
        <div className="lg:col-span-3 space-y-5">
          {/* ========================================================
              TAB 1: ACCOUNT & PROFILE
             ======================================================== */}
          {activeTab === 'account' && (
            <div className="bg-white p-4 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-5">
              <div className="border-b border-slate-100 pb-3 flex flex-wrap items-center justify-between gap-2">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-600" />
                    Account &amp; Personal Profile
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Your technician identity, assigned repair bench, and customer-facing contact details.
                  </p>
                </div>
                <span className="px-2.5 py-1 bg-indigo-50 text-indigo-700 border border-indigo-100 rounded-lg text-xs font-bold">
                  {currentUser?.role === 'ADMIN' ? '👑 Master Administrator' : '🔧 Shop Technician'}
                </span>
              </div>

              <form onSubmit={handleSaveProfile} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Enter full name"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Username (Account ID)</label>
                    <input
                      type="text"
                      disabled
                      value={currentUser?.username || ''}
                      className="w-full px-3 py-2 text-xs bg-slate-100 border border-slate-200 rounded-xl text-slate-500 font-mono cursor-not-allowed"
                    />
                    <span className="text-[10px] text-slate-400">Usernames are immutable for audit traceability.</span>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Email Address *</label>
                    <input
                      type="email"
                      required
                      value={userEmail}
                      onChange={(e) => setUserEmail(e.target.value)}
                      placeholder="Enter email address"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                    />
                    <span className="text-[10px] text-slate-400">Any personal or business email domain works.</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Direct Phone Number</label>
                    <input
                      type="text"
                      value={userPhone}
                      onChange={(e) => setUserPhone(e.target.value)}
                      placeholder="Enter phone number"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 font-mono transition"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Assigned Workstation / Bench</label>
                  <input
                    type="text"
                    value={userBench}
                    onChange={(e) => setUserBench(e.target.value)}
                    placeholder="Workstation or bench"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Specialty &amp; Technician Bio</label>
                  <textarea
                    rows={3}
                    value={userBio}
                    onChange={(e) => setUserBio(e.target.value)}
                    placeholder="Optional diagnostic specialty or technician notes"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition resize-none"
                  />
                </div>

                <div className="pt-2 flex items-center justify-between">
                  {onLogout && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        onLogout();
                      }}
                      className="px-4 py-2 bg-red-50 hover:bg-red-100 text-red-700 text-xs font-bold rounded-xl border border-red-200 transition cursor-pointer flex items-center gap-1.5 shadow-2xs"
                    >
                      <LogOut className="w-3.5 h-3.5 text-red-600" />
                      <span>Log Out of Session</span>
                    </button>
                  )}
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="ml-auto px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Saving...' : 'Save Profile Details'}</span>
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* ========================================================
              TAB 2: PASSWORD & SECURITY
             ======================================================== */}
          {activeTab === 'security' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Lock className="w-4 h-4 text-indigo-600" />
                  Password &amp; Security Authentication
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Update your account password.
                </p>
              </div>

              <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Current Password *</label>
                  <input
                    type="password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">New Password * (Min 8 chars)</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new strong password"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                  />
                  {newPassword.length > 0 && (() => {
                    const checks = [
                      { label: '8+ chars', ok: newPassword.length >= 8 },
                      { label: 'Upper', ok: /[A-Z]/.test(newPassword) },
                      { label: 'Lower', ok: /[a-z]/.test(newPassword) },
                      { label: 'Number', ok: /\d/.test(newPassword) },
                      { label: 'Symbol/12+', ok: newPassword.length >= 12 || /[^A-Za-z0-9]/.test(newPassword) },
                    ];
                    const score = checks.filter((c) => c.ok).length;
                    const barColor =
                      score <= 2 ? 'bg-rose-500' : score <= 4 ? 'bg-amber-500' : 'bg-emerald-500';
                    return (
                      <div className="pt-1.5 space-y-1.5">
                        <div className="h-1.5 w-full bg-slate-200 rounded-full overflow-hidden">
                          <div className={`h-full transition-all ${barColor}`} style={{ width: `${(score / 5) * 100}%` }} />
                        </div>
                        <div className="flex flex-wrap gap-1.5 text-[10px]">
                          {checks.map((c) => (
                            <span
                              key={c.label}
                              className={`px-1.5 py-0.5 rounded font-semibold ${
                                c.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                              }`}
                            >
                              {c.ok ? '✓' : '·'} {c.label}
                            </span>
                          ))}
                        </div>
                      </div>
                    );
                  })()}
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-bold text-slate-700">Confirm New Password *</label>
                  <input
                    type="password"
                    required
                    minLength={8}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter new password"
                    className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 transition"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={isSaving}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                  >
                    <KeyRound className="w-3.5 h-3.5" />
                    <span>{isSaving ? 'Updating...' : 'Update Password'}</span>
                  </button>
                </div>
              </form>

              {/* Two-Factor Authentication (TOTP Authenticator App) */}
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <ShieldCheck className={`w-4 h-4 ${twoFactorStatus.enabled ? 'text-emerald-600' : twoFactorStatus.available ? 'text-indigo-600' : 'text-amber-600'}`} />
                      <span className="text-xs font-bold text-slate-900">Two-Factor Authentication (Authenticator App)</span>
                      <span
                        className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          twoFactorStatus.enabled
                            ? 'bg-emerald-100 text-emerald-800'
                            : !twoFactorStatus.available
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-slate-200 text-slate-600'
                        }`}
                      >
                        {twoFactorStatus.enabled
                          ? 'ENABLED'
                          : !twoFactorStatus.available
                          ? 'TEMPORARILY UNAVAILABLE'
                          : 'OFF'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500">
                      {!twoFactorStatus.enabled && !twoFactorStatus.available
                        ? 'Two-Factor Authentication is temporarily disabled by your administrator. Sign-ins currently use username and password only.'
                        : 'Protect your account with a 6-digit TOTP authenticator code (Google Authenticator, 1Password, Apple Passwords) and single-use recovery codes.'}
                    </p>
                  </div>

                  {!twoFactorStatus.enabled && !setupData && (
                    twoFactorStatus.available ? (
                      <button
                        type="button"
                        disabled={twoFactorBusy}
                        onClick={handleStartTwoFactorSetup}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-xs cursor-pointer shrink-0 disabled:opacity-50"
                      >
                        Enable 2FA
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled
                        aria-disabled="true"
                        className="px-4 py-2 bg-slate-200 text-slate-500 rounded-xl text-xs font-bold shrink-0 cursor-not-allowed"
                      >
                        Temporarily Unavailable
                      </button>
                    )
                  )}

                  {twoFactorStatus.enabled && manageMode === 'none' && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setManageMode('regen')}
                        className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        New Recovery Codes ({twoFactorStatus.recoveryCodesRemaining} left)
                      </button>
                      <button
                        type="button"
                        onClick={() => setManageMode('disable')}
                        className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-xl text-[11px] font-bold cursor-pointer"
                      >
                        Disable 2FA
                      </button>
                    </div>
                  )}
                </div>

                {setupData && (
                  <form onSubmit={handleConfirmTwoFactorSetup} className="bg-white p-4 rounded-xl border border-indigo-200 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-4 items-center">
                      <img
                        src={setupData.qrDataUrl}
                        alt="Authenticator QR Code"
                        className="w-40 h-40 rounded-lg border border-slate-200 bg-white p-1 shrink-0"
                      />
                      <div className="space-y-2.5 flex-1 min-w-0 text-xs">
                        <p className="font-bold text-slate-900">1. Scan this QR code in your authenticator app</p>
                        <div className="space-y-1">
                          <span className="text-[11px] text-slate-500">Or enter manual key:</span>
                          <div className="flex items-center gap-2">
                            <code className="px-2.5 py-1.5 bg-slate-100 rounded-lg font-mono text-[11px] text-slate-800 break-all">
                              {setupData.manualSecret}
                            </code>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard?.writeText(setupData.manualSecret).catch(() => {});
                                triggerToast('Secret key copied');
                              }}
                              className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 cursor-pointer shrink-0"
                              title="Copy manual key"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="space-y-1">
                          <label className="text-[11px] font-bold text-slate-700">2. Enter 6-digit confirmation code</label>
                          <div className="flex flex-wrap gap-2">
                            <input
                              type="text"
                              required
                              maxLength={8}
                              value={confirmCode}
                              onChange={(e) => setConfirmCode(e.target.value)}
                              placeholder="123456"
                              className="w-36 px-3 py-2 text-xs font-mono tracking-widest text-center bg-slate-50 border border-slate-200 rounded-xl"
                            />
                            <button
                              type="submit"
                              disabled={twoFactorBusy}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold cursor-pointer disabled:opacity-50"
                            >
                              Confirm &amp; Activate
                            </button>
                            <button
                              type="button"
                              onClick={() => setSetupData(null)}
                              className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </form>
                )}

                {manageMode !== 'none' && (
                  <form onSubmit={handleManageTwoFactor} className="bg-white p-4 rounded-xl border border-slate-200 space-y-3 max-w-md text-xs">
                    <div className="font-bold text-slate-900">
                      {manageMode === 'disable' ? 'Confirm Identity to Disable 2FA' : 'Generate Fresh Recovery Codes'}
                    </div>
                    <input
                      type="password"
                      required
                      value={managePassword}
                      onChange={(e) => setManagePassword(e.target.value)}
                      placeholder="Current account password"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <input
                      type="text"
                      required
                      value={manageCode}
                      onChange={(e) => setManageCode(e.target.value)}
                      placeholder="6-digit authenticator code"
                      className="w-full px-3 py-2 text-xs font-mono bg-slate-50 border border-slate-200 rounded-xl"
                    />
                    <div className="flex gap-2">
                      <button
                        type="submit"
                        disabled={twoFactorBusy}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
                      >
                        {manageMode === 'disable' ? 'Disable 2FA' : 'Generate Codes'}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setManageMode('none');
                          setManagePassword('');
                          setManageCode('');
                        }}
                        className="px-3 py-2 border border-slate-200 text-slate-600 rounded-xl text-xs font-semibold cursor-pointer"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}

                {recoveryCodes && recoveryCodes.length > 0 && (
                  <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 space-y-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-amber-950">Save These One-Time Backup Recovery Codes</span>
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard?.writeText(recoveryCodes.join('\n')).catch(() => {});
                          triggerToast('Recovery codes copied');
                        }}
                        className="px-2.5 py-1 bg-white border border-amber-300 rounded-lg text-[11px] font-bold text-amber-900 inline-flex items-center gap-1 cursor-pointer"
                      >
                        <Copy className="w-3 h-3" />
                        <span>Copy All</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-900">
                      Each code works once if you ever lose your phone. Keep them offline — they will not be shown again.
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 font-mono text-[11px]">
                      {recoveryCodes.map((rc) => (
                        <div key={rc} className="bg-white px-2.5 py-1.5 rounded-lg border border-amber-200 text-center font-bold text-slate-800">
                          {rc}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Shared Counter Auto-Lock Setting */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                <div className="space-y-0.5">
                  <div className="font-bold text-slate-900 flex items-center gap-1.5">
                    <Lock className="w-4 h-4 text-indigo-600" />
                    <span>Shared Counter Inactivity Lock</span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    Automatically lock this screen on inactivity so counter staff must unlock with their password before viewing work orders.
                  </p>
                </div>
                <select
                  value={autoLockMinutes}
                  onChange={(e) => handleSavePreferences({ autoLockMinutes: Number(e.target.value) })}
                  className="px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 cursor-pointer shrink-0"
                >
                  <option value={0}>Off (Manual Lock Only)</option>
                  <option value={5}>Lock after 5 minutes</option>
                  <option value={15}>Lock after 15 minutes</option>
                  <option value={30}>Lock after 30 minutes</option>
                </select>
              </div>

              {/* Active Devices & Sessions */}
              <div className="p-4 sm:p-5 bg-slate-50 rounded-2xl border border-slate-200 space-y-3 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Smartphone className="w-4 h-4 text-emerald-600" />
                    <span>Active Devices &amp; Sessions ({sessionsList.length})</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={loadSecurityData}
                      className="px-2.5 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded-lg text-[11px] font-semibold text-slate-600 inline-flex items-center gap-1 cursor-pointer"
                    >
                      <RefreshCw className={`w-3 h-3 ${sessionsLoading ? 'animate-spin' : ''}`} />
                      <span>Refresh</span>
                    </button>
                    {sessionsList.filter((s) => !s.isCurrent).length > 0 && (
                      <button
                        type="button"
                        onClick={() => setPendingSessionRevoke({ type: 'other' })}
                        className="px-2.5 py-1 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg text-[11px] font-bold text-rose-700 cursor-pointer"
                      >
                        Sign Out Other Devices
                      </button>
                    )}
                  </div>
                </div>
                <div className="divide-y divide-slate-200 bg-white rounded-xl border border-slate-200 overflow-hidden">
                  {sessionsList.length === 0 ? (
                    <div className="p-4 text-[11px] text-slate-500">
                      {sessionsLoading ? 'Loading active devices...' : 'Current HttpOnly cookie session is active (24h strict max TTL).'}
                    </div>
                  ) : (
                    sessionsList.map((s) => (
                      <div key={s.id} className="px-4 py-3 flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-slate-800 flex items-center gap-1.5">
                            <span>{s.device}</span>
                            {s.isCurrent && (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold">
                                THIS DEVICE
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 font-mono">
                            {s.ipAddress} &bull; Active {new Date(s.lastActiveAt).toLocaleString()}
                          </div>
                        </div>
                        {!s.isCurrent && (
                          <button
                            type="button"
                            onClick={() =>
                              setPendingSessionRevoke({
                                type: 'single',
                                sessionId: s.id,
                                device: s.device,
                              })
                            }
                            className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-rose-50 hover:text-rose-700 text-slate-700 text-[11px] font-bold cursor-pointer shrink-0"
                          >
                            Revoke
                          </button>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 3: NOTIFICATION PREFERENCES (REAL DB PERSISTENCE)
             ======================================================== */}
          {activeTab === 'notifications' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-600" />
                  Live Notification Preferences
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Customize interactive audio feedback, workbench chimes, and ticket alerts. Changes save immediately to your profile.
                </p>
              </div>

              <div className="space-y-4">
                {/* Toggle 1: Sound FX */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      {soundFXEnabled ? <Volume2 className="w-4 h-4 text-indigo-600" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
                      Sound FX &amp; Audio Feedback
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Play synthesized Web Audio beeps on barcode scans, ticket completion chimes, and payment tender.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePreferences({ soundFX: !soundFXEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      soundFXEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                        soundFXEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle 2: High Priority Ticket Alert */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      Urgent Priority Work Order Alerts
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Highlight rush repair work orders with visual badges and urgent bench sound chimes.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePreferences({ highPriorityAudio: !highPriorityAudioEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      highPriorityAudioEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                        highPriorityAudioEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle 3: Low Stock Parts Warning */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-indigo-600" />
                      Low Inventory Reorder Notifications
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Show persistent warning badges on the dashboard when component quantities drop below reorder levels.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePreferences({ lowStockAlerts: !lowStockAlertsEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      lowStockAlertsEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                        lowStockAlertsEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Toggle 4: Customer Email Invoicing */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                      Customer Invoice Auto-Emailing
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Automatically generate digital receipt slips with payment ledger when tickets transition to Completed.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePreferences({ emailAlerts: !emailAlertsEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      emailAlertsEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                        emailAlertsEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 4: APPLICATION PREFERENCES
             ======================================================== */}
          {activeTab === 'preferences' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
              <div className="border-b border-slate-100 pb-3">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-indigo-600" />
                  Application Display &amp; Operational Defaults
                </h3>
                <p className="text-xs text-slate-500 font-medium mt-0.5">
                  Configure default labor charge benchmarks and table layout density across the POS dashboard.
                </p>
              </div>

              <div className="space-y-5">
                {/* Density Mode */}
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex items-center justify-between">
                  <div className="space-y-0.5">
                    <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                      <Monitor className="w-4 h-4 text-indigo-600" />
                      Compact Table Density Mode
                    </span>
                    <p className="text-[11px] text-slate-500">
                      Reduces vertical padding in the ticket data grid to fit 40% more work orders on screen without scrolling.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSavePreferences({ compactView: !compactViewEnabled })}
                    className={`w-12 h-6 rounded-full transition-colors relative cursor-pointer ${
                      compactViewEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                    }`}
                  >
                    <span
                      className={`block w-4 h-4 bg-white rounded-full shadow-md transform transition-transform ${
                        compactViewEnabled ? 'translate-x-7' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>

                {/* Default Diagnostic Labor Rate */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Default Intake Labor Rate ($)</label>
                    <div className="relative">
                      <DollarSign className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="number"
                        step="0.01"
                        value={defaultLaborRate}
                        onChange={(e) => setDefaultLaborRate(e.target.value)}
                        placeholder="85.00"
                        className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
                      />
                    </div>
                    <span className="text-[10px] text-slate-400">Pre-populates new check-in tickets with this standard labor rate.</span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Regional Currency Symbol</label>
                    <input
                      type="text"
                      value={currencySymbol}
                      onChange={(e) => setCurrencySymbol(e.target.value)}
                      placeholder="$"
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
                    />
                    <span className="text-[10px] text-slate-400">Used for customer invoice prints and ledger reports.</span>
                  </div>
                </div>

                {isAdmin && (
                  <div className="pt-2 flex justify-end">
                    <button
                      type="button"
                      onClick={() => handleSaveSystemSettings()}
                      disabled={isSaving}
                      className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Save App Defaults'}</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              TAB 5: SYSTEM & STORE CONFIGURATION (ADMIN ONLY)
             ======================================================== */}
          {activeTab === 'system' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-6">
              {!isAdmin ? (
                <div className="p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-base font-bold text-slate-900">Administrator Access Required</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Only verified shop administrators can modify tax rates, corporate trading details, and receipt legal disclaimers.
                    </p>
                  </div>
                  {onOpenAdminConsole && (
                    <button
                      onClick={onOpenAdminConsole}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer inline-flex items-center space-x-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Log in as Administrator</span>
                    </button>
                  )}
                </div>
              ) : (
                <form onSubmit={handleSaveSystemSettings} className="space-y-5">
                  <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                        <Building2 className="w-4 h-4 text-indigo-600" />
                        Store Profile, Regional Taxes &amp; Invoicing
                      </h3>
                      <p className="text-xs text-slate-500 font-medium mt-0.5">
                        These settings govern financial ledger calculations and legal receipt disclaimers.
                      </p>
                    </div>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm flex items-center space-x-2 cursor-pointer disabled:opacity-50"
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{isSaving ? 'Saving...' : 'Save Store Config'}</span>
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Shop Trading Name *</label>
                      <input
                        type="text"
                        required
                        value={shopName}
                        onChange={(e) => setShopName(e.target.value)}
                        placeholder="Enter business name"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Storefront Support Phone</label>
                      <input
                        type="text"
                        value={phone}
                        onChange={(e) => setPhone(e.target.value)}
                        placeholder="Enter business phone"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Invoicing / Support Email</label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Enter business email"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Storefront Physical Address</label>
                      <input
                        type="text"
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Enter business address"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 border-t border-slate-100">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Regional Tax Label</label>
                      <input
                        type="text"
                        value={taxLabel}
                        onChange={(e) => setTaxLabel(e.target.value)}
                        placeholder="HST / GST / VAT"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Tax Percentage (%)</label>
                      <div className="relative">
                        <input
                          type="number"
                          step="0.01"
                          value={taxRatePercent}
                          onChange={(e) => setTaxRatePercent(e.target.value)}
                          placeholder="13.00"
                          className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono font-bold pr-8"
                        />
                        <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Warranty Guarantee (Days)</label>
                      <input
                        type="number"
                        value={warrantyDays}
                        onChange={(e) => setWarrantyDays(Number(e.target.value))}
                        placeholder="90"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono"
                      />
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-bold text-slate-700">Customer Receipt Terms &amp; Waiver Footer</label>
                    <textarea
                      rows={3}
                      value={receiptFooter}
                      onChange={(e) => setReceiptFooter(e.target.value)}
                      className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white resize-none"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Technician Roster (Newline Separated)</label>
                      <textarea
                        rows={3}
                        value={technicians}
                        onChange={(e) => setTechnicians(e.target.value)}
                        placeholder="One technician per line"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono resize-none"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-xs font-bold text-slate-700">Repair Benches (Newline Separated)</label>
                      <textarea
                        rows={3}
                        value={benches}
                        onChange={(e) => setBenches(e.target.value)}
                        placeholder="One workstation per line"
                        className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:bg-white font-mono resize-none"
                      />
                    </div>
                  </div>

                  {/* Audio Test & Database Health */}
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="space-y-0.5">
                      <span className="font-bold text-slate-900 text-xs flex items-center gap-2">
                        <Database className="w-4 h-4 text-purple-600" />
                        ACID Relational Database Engine (Auto-Synced)
                      </span>
                      <p className="text-[11px] text-slate-500">
                        Next Sequential Ticket Counter: #{settings?.nextTicketNumber || 1} &bull; All transactions sync atomically.
                      </p>
                    </div>

                    <div className="flex items-center space-x-2">
                      <button
                        type="button"
                        onClick={() => posAudio.playBeep()}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3 text-indigo-600" />
                        <span>Test Beep</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => posAudio.playSuccessChime()}
                        className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-bold flex items-center space-x-1 cursor-pointer"
                      >
                        <Play className="w-3 h-3 text-emerald-600" />
                        <span>Test Chime</span>
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          )}

          {/* ========================================================
              TAB 6: USER & STAFF MANAGEMENT (ADMIN ONLY)
             ======================================================== */}
          {activeTab === 'users' && (
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-5">
              <div className="border-b border-slate-100 pb-3 flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <Users className="w-4 h-4 text-indigo-600" />
                    Technician &amp; Staff User Administration
                  </h3>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Provision new technician accounts, manage access roles, and handle credential resets.
                  </p>
                </div>
              </div>

              {!isAdmin ? (
                <div className="p-8 text-center space-y-4">
                  <div className="w-12 h-12 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                    <ShieldAlert className="w-6 h-6" />
                  </div>
                  <div className="max-w-md mx-auto space-y-1">
                    <h3 className="text-base font-bold text-slate-900">Administrator Access Required</h3>
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Only verified shop administrators can provision accounts, edit roles, and delete staff users.
                    </p>
                  </div>
                  {onOpenAdminConsole && (
                    <button
                      onClick={onOpenAdminConsole}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm cursor-pointer inline-flex items-center space-x-2"
                    >
                      <Lock className="w-3.5 h-3.5" />
                      <span>Log in as Administrator</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-5 bg-indigo-50/70 border border-indigo-100 rounded-2xl flex items-center justify-between">
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                        <Shield className="w-4 h-4 text-indigo-600" />
                        Full User Management Console Available
                      </div>
                      <p className="text-xs text-indigo-800/80">
                        Access live user creation, account activation/deactivation, credential resets, and RBAC matrix.
                      </p>
                    </div>
                    {onOpenAdminConsole && (
                      <button
                        onClick={onOpenAdminConsole}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-md shadow-indigo-600/30 flex items-center space-x-2 cursor-pointer"
                      >
                        <span>Launch Admin Dashboard</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmDialog
        isOpen={Boolean(pendingSessionRevoke)}
        tone="warning"
        title={
          pendingSessionRevoke?.type === 'other'
            ? 'Sign Out Other Devices?'
            : 'Revoke Device Session?'
        }
        message={
          pendingSessionRevoke?.type === 'other' ? (
            'Are you sure you want to sign out all other active devices? Your current session will remain signed in.'
          ) : pendingSessionRevoke ? (
            <>
              Are you sure you want to revoke access for{' '}
              <strong className="text-slate-900">{pendingSessionRevoke.device}</strong>?
            </>
          ) : null
        }
        confirmLabel="Yes, Sign Out"
        cancelLabel="No, Cancel"
        isProcessing={isRevokingSession}
        onCancel={() => setPendingSessionRevoke(null)}
        onConfirm={async () => {
          if (!pendingSessionRevoke) return;
          setIsRevokingSession(true);
          try {
            if (pendingSessionRevoke.type === 'other') {
              await handleRevokeOtherSessions();
            } else {
              await handleRevokeSession(pendingSessionRevoke.sessionId);
            }
            setPendingSessionRevoke(null);
          } finally {
            setIsRevokingSession(false);
          }
        }}
      />
    </div>
  );
};
