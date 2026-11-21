import React, { useState } from 'react';
import {
  ShieldAlert,
  Lock,
  User,
  Eye,
  EyeOff,
  Wrench,
  ShieldCheck,
  AlertCircle,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import { setToken } from '../utils/auth';
import { posAudio } from '../utils/audio';
import { User as UserType } from '../types';
import { getCachedRegisteredUsers, saveRegisteredUsers } from '../utils/userSync';

interface LoginPageProps {
  onLoginSuccess: (user: UserType, targetView: 'repairs' | 'admin') => void;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess }) => {
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim() || !password) {
      setErrorMessage('Please enter both your username/email and password.');
      posAudio.playWarningBeep();
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);

    try {
      const clientUsers = getCachedRegisteredUsers();
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmail.trim(),
          password,
          adminMode: isAdminMode,
          clientUsers,
        }),
      });

      const contentType = res.headers.get('content-type') || '';
      let data: any = null;
      if (contentType.includes('application/json')) {
        data = await res.json();
      } else {
        const text = await res.text();
        throw new Error(
          res.status >= 500
            ? 'Server is starting up or temporarily busy. Please wait a moment and try again.'
            : (text.slice(0, 120) || `Server error (${res.status})`)
        );
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Authentication failed. Please verify credentials.');
      }

      setToken(data.token);
      posAudio.playSuccessChime();
      
      const targetView: 'repairs' | 'admin' = (data.user.role === 'ADMIN' && isAdminMode) ? 'admin' : 'repairs';
      onLoginSuccess(data.user, targetView);
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
      posAudio.playWarningBeep();
    } finally {
      setIsLoading(false);
    }
  };

  const handleFillStandardTech = () => {
    setIsAdminMode(false);
    setUsernameOrEmail('tech');
    if (import.meta.env.DEV) setPassword('Tech@FasoFix2026!');
    setErrorMessage(null);
  };

  const handleFillAdmin = () => {
    setIsAdminMode(true);
    setUsernameOrEmail('admin');
    if (import.meta.env.DEV) setPassword('Admin@FasoFix2026!');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 via-white to-slate-100/80 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-800 select-none">
      {/* Soft Ambient Glows */}
      <div className="absolute top-12 left-1/2 -translate-x-1/2 w-96 h-96 bg-blue-100/60 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-indigo-50/70 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center gap-2 px-3 py-1 rounded-full bg-white border border-slate-200 shadow-xs mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[11px] font-mono font-bold tracking-wider text-slate-600">
              Terminal Gate v3.4.2
            </span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25 ring-4 ring-indigo-50">
              <Cpu className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Faso Fix POS</h1>
              <p className="text-xs text-slate-500 font-medium mt-1">Repair &amp; Retail Operations CRM</p>
            </div>
          </div>
        </div>

        {/* Card Container */}
        <div className="bg-white rounded-3xl border border-slate-200/90 shadow-xl shadow-slate-200/60 overflow-hidden">
          {/* Mode Switcher Tabs (Segmented Control) */}
          <div className="grid grid-cols-2 p-1.5 bg-slate-100/80 border-b border-slate-200/80 gap-1.5">
            {/* Standard Login Tab */}
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(false);
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                !isAdminMode
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/80'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
            >
              <Wrench className="w-4 h-4 text-indigo-600" />
              <span>Standard POS</span>
            </button>

            {/* Admin Mode Tab */}
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(true);
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                isAdminMode
                  ? 'bg-purple-600 text-white shadow-xs'
                  : 'text-slate-600 hover:text-purple-700 hover:bg-slate-200/50'
              }`}
            >
              <ShieldAlert className={`w-4 h-4 ${isAdminMode ? 'text-white' : 'text-purple-600'}`} />
              <span>Admin Mode</span>
            </button>
          </div>

          {/* Mode Context Banner */}
          <div className={`px-6 py-3.5 border-b transition-colors ${
            isAdminMode 
              ? 'bg-purple-50/70 border-purple-100 text-purple-900' 
              : 'bg-indigo-50/70 border-indigo-100 text-indigo-900'
          }`}>
            <div className="flex items-center gap-2.5">
              {isAdminMode ? (
                <>
                  <div className="w-7 h-7 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                    <Lock className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-900">Administrator Portal</h2>
                    <p className="text-[11px] text-purple-700/80">User provisioning, password resets, and audit telemetry</p>
                  </div>
                </>
              ) : (
                <>
                  <div className="w-7 h-7 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <User className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <h2 className="text-xs font-bold text-slate-900">Technician Terminal Login</h2>
                    <p className="text-[11px] text-indigo-700/80">Authorized access to work orders, parts inventory &amp; billing</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-snug font-medium">{errorMessage}</span>
              </div>
            )}

            {/* Username / Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Username or Email</span>
                <span className="text-[10px] text-slate-400 font-normal">Case-insensitive</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <User className="w-4 h-4" />
                </div>
                <input
                  type="text"
                  required
                  autoFocus
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder={isAdminMode ? 'admin or admin@fasofix.ca' : 'tech or tech@fasofix.ca'}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                <span>Password</span>
                <span className="text-[10px] text-slate-400 font-normal">Encrypted Scrypt</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 transition cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 ${
                isAdminMode
                  ? 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 shadow-purple-600/25'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-600/25'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying Credentials...</span>
                </>
              ) : (
                <>
                  <span>{isAdminMode ? 'Authenticate Administrator' : 'Sign In to POS Terminal'}</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>

          {/* Dev Demo Fill Helper (Dev only) */}
          {import.meta.env.DEV && (
            <div className="px-6 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
              <span className="font-semibold text-slate-500">Dev Quick Fill:</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleFillStandardTech}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-indigo-700 font-semibold shadow-2xs hover:bg-indigo-50 transition cursor-pointer"
                >
                  Standard Tech
                </button>
                <button
                  type="button"
                  onClick={handleFillAdmin}
                  className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 text-purple-700 font-semibold shadow-2xs hover:bg-purple-50 transition cursor-pointer"
                >
                  Admin Mode
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Security & Access Policies Footnote */}
        <div className="text-center space-y-1 text-slate-400 text-[11px]">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
            <span className="text-slate-500">NIST SP 800-63B Scrypt Hashing &bull; Public registration disabled</span>
          </p>
          <p className="text-[10px] text-slate-400">Account provisioning is restricted to authorized store administrators.</p>
        </div>
      </div>
    </div>
  );
};
