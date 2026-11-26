import React, { useState } from 'react';
import {
  Lock,
  User,
  Eye,
  EyeOff,
  AlertCircle,
  ArrowRight,
  Cpu,
} from 'lucide-react';
import { markSessionActive } from '../utils/auth';
import { posAudio } from '../utils/audio';
import { User as UserType } from '../types';

interface LoginPageProps {
  onLoginSuccess: (user: UserType, targetView?: 'repairs' | 'admin') => void;
  sessionExpiredNotice?: string | null;
}

export const LoginPage: React.FC<LoginPageProps> = ({ onLoginSuccess, sessionExpiredNotice }) => {
  const isAdminMode = false;
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [pendingUserLabel, setPendingUserLabel] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (challengeToken) {
      if (!twoFactorCode.trim()) {
        setErrorMessage('Enter your 6-digit authenticator code or recovery code.');
        posAudio.playWarningBeep();
        return;
      }
      setIsLoading(true);
      setErrorMessage(null);
      try {
        const res = await fetch('/api/auth/login/verify-2fa', {
          method: 'POST',
          credentials: 'same-origin',
          headers: {
            'Content-Type': 'application/json',
            'X-Requested-With': 'FasoFixPOS',
          },
          body: JSON.stringify({
            challengeToken,
            code: twoFactorCode.trim(),
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data?.error || 'Two-factor verification failed.');
        }
        markSessionActive(data.expiresAtMs);
        posAudio.playSuccessChime();
        onLoginSuccess(data.user, 'repairs');
      } catch (err: any) {
        setErrorMessage(err.message || 'Verification failed.');
        posAudio.playWarningBeep();
      } finally {
        setIsLoading(false);
      }
      return;
    }

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
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'X-Requested-With': 'FasoFixPOS',
        },
        body: JSON.stringify({
          usernameOrEmail: usernameOrEmail.trim(),
          password,
          adminMode: isAdminMode,
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

      if (data.requiresTwoFactor && data.challengeToken) {
        setChallengeToken(data.challengeToken);
        setPendingUserLabel(data.user?.name || usernameOrEmail.trim());
        setTwoFactorCode('');
        setErrorMessage(null);
        return;
      }

      markSessionActive(data.expiresAtMs);
      posAudio.playSuccessChime();
      
      onLoginSuccess(data.user, 'repairs');
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed. Please check your credentials.');
      posAudio.playWarningBeep();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-50 lg:grid lg:grid-cols-[1.05fr_1fr] text-slate-800 select-none">
      {/* Left Brand Showcase (desktop) */}
      <div className="hidden lg:flex relative flex-col justify-between overflow-hidden bg-gradient-to-br from-indigo-700 via-indigo-600 to-violet-700 p-12 text-white">
        <div className="absolute -top-24 -left-24 w-[28rem] h-[28rem] bg-white/10 rounded-full blur-3xl pointer-events-none ui-float-ambient" />
        <div className="absolute bottom-0 right-0 w-[26rem] h-[26rem] bg-violet-400/30 rounded-full blur-3xl pointer-events-none ui-float-ambient-slow" />
        <div
          className="absolute inset-0 opacity-[0.07] pointer-events-none"
          style={{
            backgroundImage:
              'linear-gradient(rgba(255,255,255,0.9) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.9) 1px, transparent 1px)',
            backgroundSize: '44px 44px',
          }}
        />

        <div className="relative flex items-center gap-3 ui-view-enter">
          <div className="w-11 h-11 rounded-2xl bg-white/15 backdrop-blur border border-white/25 flex items-center justify-center shadow-lg">
            <Cpu className="w-5 h-5" />
          </div>
          <span className="text-xl font-black tracking-tight">Faso Fix POS</span>
        </div>

        <div className="relative space-y-6 max-w-md ui-view-enter">
          <h2 className="text-4xl xl:text-5xl font-black leading-[1.05] tracking-tight text-balance">
            Every repair,
            <br />
            <span className="text-indigo-200">on time.</span>
          </h2>
          <div className="space-y-3">
            {[
              'Track every device from check-in to pickup',
              'Instant alerts when a promise date is missed',
              'Quotes, payments & receipts in one place',
            ].map((line) => (
              <div key={line} className="flex items-center gap-3 text-sm text-indigo-50/95 font-medium">
                <span className="w-6 h-6 rounded-lg bg-white/15 border border-white/20 flex items-center justify-center shrink-0">
                  <ArrowRight className="w-3.5 h-3.5" />
                </span>
                {line}
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-xs text-indigo-200/80 font-medium">© {new Date().getFullYear()} Faso Fix</p>
      </div>

      {/* Right Form Column */}
      <div className="relative min-h-screen flex flex-col justify-center items-center p-4 sm:p-8">
      <div className="absolute top-10 left-1/2 -translate-x-1/2 w-96 h-96 bg-indigo-100/70 rounded-full blur-3xl pointer-events-none ui-float-ambient lg:hidden" />

      <div className="w-full max-w-md relative z-10 space-y-6">
        {/* Brand Header */}
        <div className="space-y-2 ui-view-enter">
          <div className="flex items-center justify-center lg:justify-start gap-3 lg:hidden">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/25 ring-4 ring-indigo-50 ui-icon-spring">
              <Cpu className="w-6 h-6" />
            </div>
            <h1 className="text-2xl font-black text-slate-900 tracking-tight leading-none">Faso Fix POS</h1>
          </div>
          <div className="text-center lg:text-left">
            <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">Welcome back</h2>
            <p className="text-sm text-slate-500 font-medium mt-1">Sign in to continue to your workspace.</p>
          </div>
        </div>

        {/* Card Container */}
        <div className="bg-white/90 backdrop-blur rounded-3xl border border-slate-200/80 shadow-[0_1px_3px_rgba(15,23,42,0.05),0_24px_48px_-16px_rgba(79,70,229,0.18)] overflow-hidden ui-modal">
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-4">
            {sessionExpiredNotice && (
              <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-900 flex items-start gap-2.5 animate-in fade-in slide-in-from-top-1 duration-150">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-bold">Security Session Expired</p>
                  <p className="text-amber-800 text-[11px] mt-0.5 leading-snug">{sessionExpiredNotice}</p>
                </div>
              </div>
            )}

            {errorMessage && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-2xl text-xs text-rose-800 flex items-start gap-2.5 ui-shake">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <span className="leading-snug font-medium">{errorMessage}</span>
              </div>
            )}

            <div key={challengeToken ? '2fa' : 'creds'} className="space-y-4 ui-view-enter">
              {!challengeToken ? (
                <>
                  {/* Username / Email Field */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Username or Email
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
                        placeholder={isAdminMode ? 'Administrator username or email' : 'Username or email'}
                        className="w-full pl-10 pr-3.5 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition-colors"
                      />
                    </div>
                  </div>

                  {/* Password Field with Show/Hide */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">
                      Password
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
                        className="w-full pl-10 pr-10 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-xs text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition-colors font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 ui-press cursor-pointer"
                        title={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-3">
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-2xl text-xs text-indigo-900">
                    <p className="font-bold">Two-Factor Verification Required</p>
                    <p className="text-[11px] text-indigo-700 mt-0.5">
                      Enter the 6-digit code from your authenticator app or an 8-character recovery code for{' '}
                      <strong>{pendingUserLabel}</strong>.
                    </p>
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-slate-700">Authenticator or Recovery Code</label>
                    <input
                      type="text"
                      autoFocus
                      required
                      value={twoFactorCode}
                      onChange={(e) => setTwoFactorCode(e.target.value)}
                      placeholder="123456 or ABCD-EFGH"
                      className="w-full px-3.5 py-3 sm:py-2.5 bg-slate-50/80 border border-slate-200 rounded-xl text-base sm:text-sm tracking-widest text-center font-mono text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition-colors"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setChallengeToken(null);
                      setTwoFactorCode('');
                      setErrorMessage(null);
                    }}
                    className="text-xs font-semibold text-slate-500 hover:text-slate-800 ui-press cursor-pointer"
                  >
                    &larr; Back to Sign In
                  </button>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={isLoading}
              className={`w-full py-3 px-4 rounded-xl text-xs font-bold text-white ui-press ui-btn-glow group shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 mt-2 ${
                isAdminMode
                  ? 'bg-purple-600 hover:bg-purple-700 active:bg-purple-800 shadow-purple-600/25'
                  : 'bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 shadow-indigo-600/30'
              }`}
            >
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>{challengeToken ? 'Verifying 2FA Code...' : 'Verifying Credentials...'}</span>
                </>
              ) : (
                <>
                  <span>
                    {challengeToken
                      ? 'Verify & Sign In'
                      : isAdminMode
                      ? 'Sign In as Administrator'
                      : 'Sign In'}
                  </span>
                  <ArrowRight className="w-4 h-4 transition-transform duration-150 group-hover:translate-x-1" />
                </>
              )}
            </button>
          </form>
        </div>
      </div>
      </div>
    </div>
  );
};
