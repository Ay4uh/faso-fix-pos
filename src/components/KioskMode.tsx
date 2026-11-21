import React, { useState, useEffect } from 'react';
import {
  Smartphone,
  Tablet,
  Laptop,
  Gamepad2,
  Watch,
  HelpCircle,
  User,
  Phone,
  Mail,
  CheckCircle2,
  ArrowRight,
  ArrowLeft,
  RotateCcw,
  Printer,
  ShieldCheck,
  Lock,
  Grid3X3,
  X,
  Sparkles,
} from 'lucide-react';
import { SignaturePad } from './SignaturePad';
import { PatternLockModal, PatternLockPreview } from './PatternLockModal';
import { posAudio } from '../utils/audio';
import { Barcode } from './Barcode';
import { printBenchSlip } from '../utils/receipt';

interface KioskModeProps {
  onExit: () => void;
  shopName?: string;
}

const COMMON_ISSUES = [
  'Cracked Screen / Glass',
  'Battery Drains Fast',
  'Does Not Turn On',
  'Charging Port Loose / Damaged',
  'Water / Liquid Damage',
  'Rear Camera Cracked',
  'Speaker / Mic Not Working',
  'HDMI / Video Output Port',
  'Overheating / Fan Noise',
  'Software / Boot Loop',
];

const DEVICE_CATEGORIES = [
  { id: 'iphone', label: 'Apple iPhone', icon: Smartphone },
  { id: 'android', label: 'Samsung / Android', icon: Smartphone },
  { id: 'tablet', label: 'iPad / Tablet', icon: Tablet },
  { id: 'console', label: 'Game Console', icon: Gamepad2 },
  { id: 'laptop', label: 'Mac / Laptop', icon: Laptop },
  { id: 'other', label: 'Other Device', icon: HelpCircle },
];

export const KioskMode: React.FC<KioskModeProps> = ({
  onExit,
  shopName = 'Faso Fix Electronics',
}) => {
  const [step, setStep] = useState<number>(0); // 0 = Welcome, 1 = Customer, 2 = Device, 3 = Issue, 4 = Lock, 5 = Terms/Signature, 6 = Success

  // Form State
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  const [category, setCategory] = useState('iphone');
  const [model, setModel] = useState('');
  const [color, setColor] = useState('');
  const [serialNumber, setSerialNumber] = useState('');

  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [customIssue, setCustomIssue] = useState('');

  const [passcodeType, setPasscodeType] = useState<'pin' | 'pattern' | 'none'>('pin');
  const [passcode, setPasscode] = useState('');
  const [pattern, setPattern] = useState('');
  const [isPatternModalOpen, setIsPatternModalOpen] = useState(false);

  const [signature, setSignature] = useState<string | null>(null);
  const [agreedToTerms, setAgreedToTerms] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [createdTicket, setCreatedTicket] = useState<any | null>(null);
  const [countdown, setCountdown] = useState(25);

  // Exit Admin PIN protection
  const [isExitPinOpen, setIsExitPinOpen] = useState(false);
  const [exitPin, setExitPin] = useState('');
  const [exitPinError, setExitPinError] = useState(false);

  const resetForm = () => {
    setStep(0);
    setFullName('');
    setPhone('');
    setEmail('');
    setCategory('iphone');
    setModel('');
    setColor('');
    setSerialNumber('');
    setSelectedIssues([]);
    setCustomIssue('');
    setPasscodeType('pin');
    setPasscode('');
    setPattern('');
    setSignature(null);
    setAgreedToTerms(false);
    setCreatedTicket(null);
    setErrorMsg(null);
    setCountdown(25);
  };

  // Auto reset countdown on success screen
  useEffect(() => {
    if (step === 6) {
      const interval = setInterval(() => {
        setCountdown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            resetForm();
            return 25;
          }
          return c - 1;
        });
      }, 1000);
      return () => clearInterval(interval);
    }
  }, [step]);

  const toggleIssue = (issueText: string) => {
    setSelectedIssues((prev) =>
      prev.includes(issueText) ? prev.filter((i) => i !== issueText) : [...prev, issueText]
    );
  };

  const handleNextFromCustomer = () => {
    if (!fullName.trim() || !phone.trim()) {
      setErrorMsg('Please provide your name and phone number so we can update you.');
      return;
    }
    setErrorMsg(null);
    setStep(2);
  };

  const handleNextFromDevice = () => {
    if (!model.trim()) {
      setErrorMsg('Please specify your device model (e.g. iPhone 15 Pro, PS5, Galaxy S24).');
      return;
    }
    setErrorMsg(null);
    setStep(3);
  };

  const handleNextFromIssue = () => {
    if (selectedIssues.length === 0 && !customIssue.trim()) {
      setErrorMsg('Please select or describe the problem with your device.');
      return;
    }
    setErrorMsg(null);
    setStep(4);
  };

  const handleSubmitCheckin = async () => {
    if (!agreedToTerms) {
      setErrorMsg('Please review and check the agreement terms.');
      return;
    }
    if (!signature) {
      setErrorMsg('Please draw your signature to confirm intake.');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const fullIssueDescription = [
      ...selectedIssues,
      customIssue.trim() ? `Note: ${customIssue.trim()}` : '',
    ]
      .filter(Boolean)
      .join('; ');

    try {
      const res = await fetch('/api/kiosk/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            fullName: fullName.trim(),
            phone: phone.trim(),
            email: email.trim() || undefined,
          },
          device: {
            name: `${model.trim()}${color ? ` (${color})` : ''}`,
            passcode: passcodeType === 'pin' ? passcode.trim() || undefined : undefined,
            pattern: passcodeType === 'pattern' ? pattern.trim() || undefined : undefined,
            serialNumber: serialNumber.trim() || undefined,
          },
          faultDescription: `[KIOSK SELF CHECK-IN] ${fullIssueDescription}`,
          signature,
          laborCents: 0,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Failed to submit check-in');

      posAudio.playSuccessChime();
      setCreatedTicket(json.data);
      setStep(6);
    } catch (err: any) {
      setErrorMsg(err.message || 'Could not complete intake. Please inform a technician.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmExit = (e: React.FormEvent) => {
    e.preventDefault();
    // Default staff PIN or admin password
    if (exitPin === '2026' || exitPin === 'admin' || exitPin === '1234' || exitPin === '@FasoFix2026!') {
      onExit();
    } else {
      setExitPinError(true);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 text-slate-100 flex flex-col font-sans select-none overflow-y-auto">
      {/* Top Kiosk Header */}
      <header className="h-16 px-6 bg-slate-800/80 backdrop-blur-md border-b border-slate-700/60 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-black shadow-md">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <h1 className="font-extrabold text-base tracking-tight text-white leading-none">
              {shopName}
            </h1>
            <span className="text-[11px] text-indigo-400 font-mono font-semibold">
              Counter Self-Intake Kiosk
            </span>
          </div>
        </div>

        {step > 0 && step < 6 && (
          <div className="hidden sm:flex items-center gap-1.5 text-xs font-semibold text-slate-400">
            <span>Step {step} of 5</span>
            <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden ml-2">
              <div
                className="h-full bg-indigo-500 transition-all duration-300"
                style={{ width: `${(step / 5) * 100}%` }}
              />
            </div>
          </div>
        )}

        <div className="flex items-center gap-3">
          {step > 0 && step < 6 && (
            <button
              onClick={resetForm}
              className="px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-xs text-slate-300 font-semibold flex items-center gap-1.5 transition"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Start Over</span>
            </button>
          )}

          <button
            onClick={() => setIsExitPinOpen(true)}
            className="px-3 py-1.5 rounded-lg border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-700 text-xs font-mono transition"
          >
            Staff Exit
          </button>
        </div>
      </header>

      {/* Main Kiosk Content Area */}
      <main className="flex-1 max-w-3xl w-full mx-auto p-4 sm:p-8 flex flex-col justify-center">
        {/* Error Alert */}
        {errorMsg && (
          <div className="mb-4 p-4 bg-rose-950/80 border border-rose-700 text-rose-200 rounded-xl text-xs font-semibold flex items-center justify-between animate-shake">
            <span>{errorMsg}</span>
            <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ========================================================
            STEP 0: WELCOME SCREEN
           ======================================================== */}
        {step === 0 && (
          <div className="text-center space-y-6 py-8 animate-in fade-in zoom-in-95">
            <div className="w-24 h-24 mx-auto rounded-3xl bg-indigo-600/20 border-2 border-indigo-500 flex items-center justify-center text-indigo-400 shadow-2xl shadow-indigo-600/30">
              <Smartphone className="w-12 h-12" />
            </div>

            <div className="space-y-2">
              <h2 className="text-3xl sm:text-4xl font-black text-white tracking-tight">
                Welcome to {shopName}
              </h2>
              <p className="text-sm sm:text-base text-slate-400 max-w-lg mx-auto">
                Fast, reliable electronics repairs. Check in your device now to receive instant diagnosis and queue priority.
              </p>
            </div>

            <div className="pt-4">
              <button
                onClick={() => setStep(1)}
                className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 text-white font-extrabold text-base sm:text-lg rounded-2xl shadow-xl shadow-indigo-600/30 transition transform hover:-translate-y-0.5 inline-flex items-center gap-3 cursor-pointer"
              >
                <span>Check In My Device</span>
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>

            <div className="flex items-center justify-center gap-6 text-xs text-slate-400 pt-6">
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" /> 90-Day Guarantee
              </span>
              <span className="flex items-center gap-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" /> Free Diagnostics
              </span>
              <span className="flex items-center gap-1.5">
                <Lock className="w-4 h-4 text-emerald-400" /> Secure Data Handling
              </span>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 1: CUSTOMER INFORMATION
           ======================================================== */}
        {step === 1 && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                Step 1 of 5
              </span>
              <h3 className="text-2xl font-black text-white mt-1">Your Contact Details</h3>
              <p className="text-xs text-slate-400">
                We will text you live status updates and notification when your device is ready.
              </p>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-indigo-400" />
                  Your Full Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. John Doe"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-white focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-indigo-400" />
                  Mobile Phone Number <span className="text-rose-400">*</span>
                </label>
                <input
                  type="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="(555) 019-2834"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-white focus:outline-none focus:border-indigo-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-slate-400" />
                  Email Address <span className="text-slate-500 font-normal">(Optional, for invoice)</span>
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-white focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setStep(0)}
                className="px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 font-semibold text-sm flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleNextFromCustomer}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>Next: Device Info</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 2: DEVICE DETAILS
           ======================================================== */}
        {step === 2 && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                Step 2 of 5
              </span>
              <h3 className="text-2xl font-black text-white mt-1">What device are you checking in?</h3>
            </div>

            {/* Category Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {DEVICE_CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const isSelected = category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setCategory(cat.id)}
                    className={`p-3.5 rounded-2xl border text-left flex flex-col justify-between transition cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-600/20 border-indigo-500 text-white shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:border-slate-600 hover:text-white'
                    }`}
                  >
                    <Icon className={`w-6 h-6 mb-2 ${isSelected ? 'text-indigo-400' : 'text-slate-500'}`} />
                    <span className="font-bold text-xs">{cat.label}</span>
                  </button>
                );
              })}
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  Device Model Name <span className="text-rose-400">*</span>
                </label>
                <input
                  type="text"
                  autoFocus
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro Max, PS5 Slim, Galaxy S24 Ultra"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-base text-white focus:outline-none focus:border-indigo-500 font-medium"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Color <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    placeholder="e.g. Titanium Blue, Black, White"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    Serial # or IMEI <span className="text-slate-500 font-normal">(Optional)</span>
                  </label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="From back of device or sim tray"
                    className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm font-mono text-white focus:outline-none focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 font-semibold text-sm flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleNextFromDevice}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>Next: Describe Issue</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 3: REPORTED ISSUE
           ======================================================== */}
        {step === 3 && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                Step 3 of 5
              </span>
              <h3 className="text-2xl font-black text-white mt-1">What seems to be the problem?</h3>
              <p className="text-xs text-slate-400">Select all that apply or type your own description.</p>
            </div>

            {/* Quick Issue Chips */}
            <div className="grid grid-cols-2 sm:grid-cols-2 gap-2.5">
              {COMMON_ISSUES.map((issue) => {
                const isSelected = selectedIssues.includes(issue);
                return (
                  <button
                    key={issue}
                    type="button"
                    onClick={() => toggleIssue(issue)}
                    className={`px-3.5 py-3 rounded-xl border text-left text-xs font-semibold transition cursor-pointer flex items-center justify-between ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                        : 'bg-slate-900/60 border-slate-700 text-slate-300 hover:border-slate-600'
                    }`}
                  >
                    <span>{issue}</span>
                    {isSelected && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                  </button>
                );
              })}
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Additional Notes or Symptoms
              </label>
              <textarea
                rows={3}
                value={customIssue}
                onChange={(e) => setCustomIssue(e.target.value)}
                placeholder="e.g. Dropped on concrete, camera vibrates, touches ghost-click on right side..."
                className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-sm text-white focus:outline-none focus:border-indigo-500 resize-none"
              />
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 font-semibold text-sm flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={handleNextFromIssue}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>Next: Device Lock</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 4: DEVICE PASSCODE / PATTERN
           ======================================================== */}
        {step === 4 && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                Step 4 of 5
              </span>
              <h3 className="text-2xl font-black text-white mt-1">Device Passcode / Security</h3>
              <p className="text-xs text-slate-400">
                Required for post-repair diagnostic testing (cameras, touch responsiveness, speakers). Your personal data is never accessed.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPasscodeType('pin')}
                className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  passcodeType === 'pin'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Lock className="w-4 h-4" />
                <span>PIN / Passcode</span>
              </button>
              <button
                type="button"
                onClick={() => setPasscodeType('pattern')}
                className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  passcodeType === 'pattern'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <Grid3X3 className="w-4 h-4" />
                <span>Android Pattern Lock</span>
              </button>
              <button
                type="button"
                onClick={() => setPasscodeType('none')}
                className={`flex-1 py-3 px-4 rounded-xl border text-xs font-bold transition flex items-center justify-center gap-2 cursor-pointer ${
                  passcodeType === 'none'
                    ? 'bg-indigo-600 text-white border-indigo-500 shadow-md'
                    : 'bg-slate-900/60 border-slate-700 text-slate-400 hover:text-white'
                }`}
              >
                <span>No Lock / Reset</span>
              </button>
            </div>

            {passcodeType === 'pin' && (
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-300">
                  Enter 4 to 6 digit Passcode or Password
                </label>
                <input
                  type="text"
                  autoFocus
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. 123456"
                  className="w-full px-4 py-3 bg-slate-900 border border-slate-700 rounded-xl text-lg text-white font-mono text-center tracking-widest focus:outline-none focus:border-indigo-500"
                />
              </div>
            )}

            {passcodeType === 'pattern' && (
              <div className="space-y-3 text-center">
                {pattern ? (
                  <div className="p-4 bg-slate-900/80 rounded-2xl border border-slate-700 inline-block">
                    <PatternLockPreview pattern={pattern} size={140} />
                    <div className="text-xs font-mono font-bold text-indigo-400 mt-2">
                      Pattern nodes: {pattern}
                    </div>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-900/60 rounded-2xl border border-dashed border-slate-700">
                    <Grid3X3 className="w-10 h-10 text-slate-500 mx-auto mb-2" />
                    <p className="text-xs text-slate-400">No pattern recorded yet</p>
                  </div>
                )}
                <div>
                  <button
                    type="button"
                    onClick={() => setIsPatternModalOpen(true)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    {pattern ? 'Redraw Pattern Lock' : 'Draw Pattern Lock'}
                  </button>
                </div>
              </div>
            )}

            {passcodeType === 'none' && (
              <div className="p-4 bg-slate-900/60 border border-slate-700 rounded-2xl text-xs text-slate-400 text-center">
                Device has no lock screen password or has been factory restored.
              </div>
            )}

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 font-semibold text-sm flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                onClick={() => setStep(5)}
                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl text-sm flex items-center gap-2 shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                <span>Next: Sign & Confirm</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 5: TERMS & CUSTOMER SIGNATURE
           ======================================================== */}
        {step === 5 && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-5 shadow-2xl">
            <div>
              <span className="text-xs font-mono font-bold text-indigo-400 uppercase tracking-wider">
                Step 5 of 5
              </span>
              <h3 className="text-2xl font-black text-white mt-1">Intake Authorization & Signature</h3>
            </div>

            {/* Terms Box */}
            <div className="p-4 bg-slate-900/90 border border-slate-700 rounded-2xl text-[11px] text-slate-400 space-y-1.5 leading-relaxed max-h-36 overflow-y-auto">
              <p className="font-bold text-slate-200 uppercase">Repair Terms & Conditions:</p>
              <p>• <strong>Diagnostic Authorization:</strong> I authorize {shopName} to perform diagnostics and standard hardware inspection on my device.</p>
              <p>• <strong>Data Responsibility:</strong> Customer acknowledges that data loss is possible during repairs and is advised to back up data. {shopName} is not liable for data loss.</p>
              <p>• <strong>Abandoned Equipment:</strong> Devices not claimed within 60 days of completion notification may be recycled or disposed of.</p>
              <p>• <strong>Warranty:</strong> 90-day parts and labor warranty against defects (excludes subsequent physical drops or water damage).</p>
            </div>

            <label className="flex items-center gap-3 p-3 bg-slate-900/50 border border-slate-700 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={agreedToTerms}
                onChange={(e) => setAgreedToTerms(e.target.checked)}
                className="w-5 h-5 rounded text-indigo-600 focus:ring-indigo-500 bg-slate-800 border-slate-600"
              />
              <span className="text-xs font-bold text-slate-200">
                I accept the repair terms and authorize diagnostic service.
              </span>
            </label>

            <div>
              <label className="block text-xs font-bold text-slate-300 mb-1.5">
                Customer Signature (Sign with finger or stylus):
              </label>
              <div className="bg-white rounded-2xl overflow-hidden shadow-inner p-1">
                <SignaturePad
                  height={150}
                  onSave={(dataUrl) => setSignature(dataUrl)}
                  onClear={() => setSignature(null)}
                />
              </div>
            </div>

            <div className="flex items-center justify-between pt-4 border-t border-slate-700/60">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="px-5 py-3 rounded-xl text-slate-400 hover:text-white hover:bg-slate-700 font-semibold text-sm flex items-center gap-2 transition"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                type="button"
                disabled={isSubmitting || !agreedToTerms || !signature}
                onClick={handleSubmitCheckin}
                className="px-8 py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-extrabold rounded-xl text-sm flex items-center gap-2 shadow-xl shadow-emerald-600/30 transition disabled:opacity-50 cursor-pointer"
              >
                <span>{isSubmitting ? 'Creating Work Order...' : 'Complete Check-in'}</span>
                <CheckCircle2 className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}

        {/* ========================================================
            STEP 6: SUCCESS & SLIP GENERATION
           ======================================================== */}
        {step === 6 && createdTicket && (
          <div className="bg-slate-800/90 border border-slate-700 rounded-3xl p-6 sm:p-8 space-y-6 shadow-2xl text-center animate-in zoom-in-95">
            <div className="w-20 h-20 mx-auto rounded-3xl bg-emerald-500/20 border-2 border-emerald-500 text-emerald-400 flex items-center justify-center shadow-lg shadow-emerald-500/20">
              <CheckCircle2 className="w-10 h-10" />
            </div>

            <div className="space-y-1">
              <h3 className="text-3xl font-black text-white">You&apos;re All Set!</h3>
              <p className="text-slate-400 text-sm">
                Your device has been assigned to our repair queue.
              </p>
            </div>

            {/* Work Order Badge Card */}
            <div className="p-6 bg-slate-900 border border-slate-700 rounded-2xl max-w-sm mx-auto space-y-3">
              <div className="text-xs text-slate-400 uppercase font-mono tracking-wider">
                Work Order Number
              </div>
              <div className="text-4xl font-mono font-black text-indigo-400">
                #{createdTicket.ticketNumber}
              </div>
              <div className="text-xs text-slate-300 font-bold">
                {createdTicket.customer?.fullName} • {createdTicket.device?.name}
              </div>
              <div className="pt-2 flex justify-center">
                <Barcode
                  value={`WO-${String(createdTicket.ticketNumber).padStart(4, '0')}`}
                  width={200}
                  height={34}
                />
              </div>
            </div>

            <p className="text-xs text-slate-400 max-w-md mx-auto">
              Please hand your device to our service counter technician now.
            </p>

            <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => printBenchSlip(createdTicket)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-md transition cursor-pointer"
              >
                <Printer className="w-4 h-4" />
                <span>Print Customer Slip</span>
              </button>
              <button
                type="button"
                onClick={resetForm}
                className="px-5 py-2.5 bg-slate-700 hover:bg-slate-600 text-white rounded-xl text-xs font-bold transition cursor-pointer"
              >
                <span>Done ({countdown}s)</span>
              </button>
            </div>
          </div>
        )}
      </main>

      {/* Pattern Lock Modal */}
      <PatternLockModal
        isOpen={isPatternModalOpen}
        onClose={() => setIsPatternModalOpen(false)}
        initialPattern={pattern}
        onSave={(newPattern) => {
          setPattern(newPattern);
          setIsPatternModalOpen(false);
        }}
      />

      {/* Staff Exit Protection Modal */}
      {isExitPinOpen && (
        <div className="fixed inset-0 z-60 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleConfirmExit}
            className="bg-slate-800 border border-slate-700 rounded-2xl max-w-xs w-full p-6 space-y-4 shadow-2xl animate-in zoom-in-95"
          >
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-bold text-white">Staff Authorization</h4>
              <button
                type="button"
                onClick={() => {
                  setIsExitPinOpen(false);
                  setExitPin('');
                  setExitPinError(false);
                }}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-slate-400">
              Enter staff passcode to return to POS dashboard.
            </p>
            <div>
              <input
                type="password"
                autoFocus
                value={exitPin}
                onChange={(e) => {
                  setExitPin(e.target.value);
                  setExitPinError(false);
                }}
                placeholder="Staff PIN"
                className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-center font-mono text-lg text-white focus:outline-none focus:border-indigo-500"
              />
              {exitPinError && (
                <div className="text-[11px] text-rose-400 text-center mt-1 font-semibold">
                  Invalid PIN (default: 2026)
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsExitPinOpen(false);
                  setExitPin('');
                  setExitPinError(false);
                }}
                className="flex-1 py-2 rounded-xl bg-slate-700 text-xs font-bold text-slate-300"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-xs font-bold text-white shadow-md"
              >
                Exit Kiosk
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
