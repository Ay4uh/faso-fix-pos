import React, { useState, useEffect } from 'react';
import { ShieldAlert, Lock, User, Eye, EyeOff, X, AlertCircle, CheckCircle2 } from 'lucide-react';
import { markSessionActive } from '../utils/auth';
import { posAudio } from '../utils/audio';
import { User as UserType } from '../types';

interface AdminLoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess: (user: UserType) => void;
}

export const AdminLoginModal: React.FC<AdminLoginModalProps> = ({
  isOpen,
  onClose,
  onLoginSuccess,
}) => {
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [twoFactorCode, setTwoFactorCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setUsernameOrEmail('');
      setPassword('');
      setChallengeToken(null);
      setTwoFactorCode('');
      setErrorMessage(null);
      setShowPassword(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (challengeToken) {
      if (!twoFactorCode.trim()) {
        setErrorMessage('Enter your 6-digit authenticator code or recovery code.');
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
          body: JSON.stringify({ challengeToken, code: twoFactorCode.trim() }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'Two-factor verification failed.');
        markSessionActive(data.expiresAtMs);
        try {
          localStorage.setItem('apexfix_cached_user', JSON.stringify(data.user));
        } catch {}
        posAudio.playSuccessChime();
        setChallengeToken(null);
        setTwoFactorCode('');
        onLoginSuccess(data.user);
        onClose();
      } catch (err: any) {
        setErrorMessage(err.message || 'Verification failed');
        posAudio.playWarningBeep();
      } finally {
        setIsLoading(false);
      }
      return;
    }

    if (!usernameOrEmail.trim() || !password) {
      setErrorMessage('Please enter both your administrator username/email and password.');
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
          adminMode: true,
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
        setTwoFactorCode('');
        setErrorMessage(null);
        return;
      }

      markSessionActive(data.expiresAtMs);
      try {
        localStorage.setItem('apexfix_cached_user', JSON.stringify(data.user));
      } catch {}
      posAudio.playSuccessChime();
      setUsernameOrEmail('');
      setPassword('');
      setErrorMessage(null);
      onLoginSuccess(data.user);
      onClose();
    } catch (err: any) {
      setErrorMessage(err.message || 'Login failed');
      posAudio.playWarningBeep();
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs animate-in fade-in duration-150">
      <div
        className="bg-white rounded-2xl shadow-xl border border-slate-200/90 w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header Banner — Bright Clean Design */}
        <div className="bg-slate-50 px-6 py-4.5 text-slate-900 flex items-center justify-between border-b border-slate-200/90">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 border border-purple-200/60 text-purple-700 flex items-center justify-center shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                Admin Console Login
              </h2>
              <p className="text-xs text-slate-500 font-medium">
                Restricted to authorized system administrators
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content & Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMessage && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-start space-x-2.5 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-red-600" />
              <div className="leading-relaxed font-medium">{errorMessage}</div>
            </div>
          )}

          {!challengeToken ? (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                  <User className="w-3.5 h-3.5 text-slate-400" />
                  Administrator Username or Email
                </label>
                <input
                  type="text"
                  autoFocus
                  value={usernameOrEmail}
                  onChange={(e) => setUsernameOrEmail(e.target.value)}
                  placeholder="Administrator username or email"
                  className="w-full px-3.5 py-2.5 text-xs bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 transition"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    Password
                  </span>
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter administrator password"
                    className="w-full px-3.5 py-2.5 text-xs bg-slate-50/80 border border-slate-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-600 pr-10 transition font-mono"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </>
          ) : (
            <div className="space-y-2.5">
              <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-900">
                Enter your 6-digit authenticator code or recovery code to complete Administrator elevation.
              </div>
              <input
                type="text"
                autoFocus
                required
                value={twoFactorCode}
                onChange={(e) => setTwoFactorCode(e.target.value)}
                placeholder="123456 or ABCD-EFGH"
                className="w-full px-3.5 py-2.5 text-sm tracking-widest text-center font-mono bg-slate-50 border border-slate-200 rounded-xl focus:bg-white"
              />
            </div>
          )}

          <div className="pt-2 flex items-center justify-end space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="px-5 py-2 bg-purple-600 hover:bg-purple-700 active:bg-purple-800 text-white rounded-xl text-xs font-bold shadow-md shadow-purple-600/25 transition flex items-center space-x-2 cursor-pointer disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>Verifying...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Authenticate &amp; Enter</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
