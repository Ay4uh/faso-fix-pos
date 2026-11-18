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
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmail.trim(),
          password,
          adminMode: isAdminMode,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Authentication failed. Please verify credentials.');
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
    if (import.meta.env.DEV) setPassword('Tech@ApexFix2026!');
    setErrorMessage(null);
  };

  const handleFillAdmin = () => {
    setIsAdminMode(true);
    setUsernameOrEmail('admin');
    if (import.meta.env.DEV) setPassword('Admin@ApexFix2026!');
    setErrorMessage(null);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950 flex flex-col justify-center items-center p-4 sm:p-6 text-slate-100 select-none">
      {/* Background Glow Decorations */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-indigo-600/15 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 right-10 w-80 h-80 bg-purple-600/10 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md relative z-10 space-y-5">
        {/* Brand Header */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center gap-2.5 px-3 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 shadow-inner mb-1">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-slate-300">
              Terminal Security Gate v3.4.2
            </span>
          </div>

          <div className="flex items-center justify-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/40 ring-4 ring-indigo-500/20">
              <Cpu className="w-6 h-6" />
            </div>
            <div className="text-left">
              <h1 className="text-2xl font-black text-white tracking-tight leading-none">ApexFix POS</h1>
              <p className="text-xs text-indigo-300/80 font-medium mt-0.5">Repair &amp; Retail Operations CRM</p>
            </div>
          </div>
        </div>

        {/* Card Container */}
        <div className="bg-slate-900/90 backdrop-blur-md rounded-3xl border border-slate-800/90 shadow-2xl shadow-black/60 overflow-hidden">
          {/* Mode Switcher Tabs (Visually Separated) */}
          <div className="grid grid-cols-2 p-1.5 bg-slate-950/70 border-b border-slate-800/80 gap-1.5">
            {/* Standard Login Tab */}
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(false);
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer ${
                !isAdminMode
                  ? 'bg-indigo-600 text-white shadow-md shadow-indigo-600/30'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
              }`}
            >
              <Wrench className="w-4 h-4" />
              <span>Standard POS</span>
            </button>

            {/* Admin Mode Tab */}
            <button
              type="button"
              onClick={() => {
                setIsAdminMode(true);
                setErrorMessage(null);
              }}
              className={`py-2.5 px-3 rounded-2xl text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border ${
                isAdminMode
                  ? 'bg-gradient-to-r from-purple-700 to-indigo-700 text-white border-purple-500/50 shadow-md shadow-purple-900/40'
                  : 'text-purple-300 hover:text-white border-transparent hover:bg-slate-900/60'
              }`}
            >
              <ShieldAlert className="w-4 h-4 text-purple-300" />
              <span>Admin Mode</span>
            </button>
          </div>

          {/* Mode Context Banner */}
          <div className={`px-6 py-3.5 border-b transition-colors ${
            isAdminMode 
              ? 'bg-purple-950/40 border-purple-900/40 text-purple-200' 
              : 'bg-indigo-950/30 border-indigo-900/30 text-indigo-200'
          }`}>
            <div className="flex items-center gap-2">
              {isAdminMode ? (
                <>
                  <Lock className="w-4 h-4 text-purple-400 shrink-0" />
                  <div>
                    <h2 className="text-xs font-extrabold text-white">Administrator Portal</h2>
                    <p className="text-[11px] text-purple-300/80">User provisioning, password resets, and audit telemetry</p>
                  </div>
                </>
              ) : (
                <>
                  <User className="w-4 h-4 text-indigo-400 shrink-0" />
                  <div>
                    <h2 className="text-xs font-extrabold text-white">Technician Terminal Login</h2>
                    <p className="text-[11px] text-indigo-300/80">Authorized access to work orders, parts inventory &amp; billing</p>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {errorMessage && (
              <div className="p-3.5 bg-rose-950/60 border border-rose-800/80 rounded-2xl text-xs text-rose-200 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                <span className="leading-snug">{errorMessage}</span>
              </div>
            )}

            {/* Username / Email Field */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Username or Email</span>
                <span className="text-[10px] text-slate-500 font-normal">Case-insensitive</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
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
                  placeholder={isAdminMode ? 'admin or admin@apexfix.ca' : 'tech or tech@apexfix.ca'}
                  className="w-full pl-10 pr-3.5 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition"
                />
              </div>
            </div>

            {/* Password Field with Show/Hide */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-300 flex items-center justify-between">
                <span>Password</span>
                <span className="text-[10px] text-slate-500 font-normal">Encrypted Scrypt</span>
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••••••"
                  className="w-full pl-10 pr-10 py-2.5 bg-slate-950/70 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/40 focus:border-indigo-500 transition font-mono"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition cursor-pointer"
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
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white transition-all shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 ${
                isAdminMode
                  ? 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 shadow-purple-900/40'
                  : 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 shadow-indigo-900/40'
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

          {/* Demo Account Fill Helper — dev builds only, stripped from production */}
          {import.meta.env.DEV && (
          <div className="px-6 py-3 bg-slate-950/60 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-400">
            <span className="font-semibold text-slate-500">Dev Demo Fill:</span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleFillStandardTech}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-indigo-300 font-medium transition cursor-pointer hover:underline"
              >
                Standard Tech
              </button>
              <button
                type="button"
                onClick={handleFillAdmin}
                className="px-2 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-purple-300 font-medium transition cursor-pointer hover:underline"
              >
                Admin Mode
              </button>
            </div>
          </div>
          )}
        </div>

        {/* Security & Access Policies Footnote */}
        <div className="text-center space-y-1 text-slate-500 text-[11px]">
          <p className="flex items-center justify-center gap-1.5 font-medium">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
            <span>NIST SP 800-63B Scrypt Hashing &bull; Public registration disabled</span>
          </p>
          <p className="text-[10px] text-slate-600">
            Account provisioning is restricted to authorized store administrators.
          </p>
        </div>
      </div>
    </div>
  );
};
