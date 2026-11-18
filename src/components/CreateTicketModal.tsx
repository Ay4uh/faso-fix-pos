import React, { useState, useRef, useEffect } from 'react';
import {
  X,
  Wrench,
  Phone,
  User,
  Smartphone,
  Lock,
  AlertCircle,
  Hash,
  ShieldCheck,
  Check,
  Search,
} from 'lucide-react';
import { Customer } from '../types';
import { posAudio } from '../utils/audio';
import { SignaturePad } from './SignaturePad';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingCustomers: Customer[];
}

const COMMON_DEVICES = [
  'iPhone 15 Pro',
  'iPhone 14 / 13',
  'Samsung Galaxy S24',
  'MacBook Pro / Air',
  'iPad Pro / Air',
  'Google Pixel 8',
  'Windows Laptop',
];

const PRE_CONDITIONS = [
  'Cracked Glass',
  'Touch Not Working',
  'Housing Bent',
  'Liquid Damage',
  'No Power / Dead',
  'Camera Scratched',
  'Missing Screws',
  'Clean / No Defects',
];

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingCustomers,
}) => {
  if (!isOpen) return null;

  // Customer
  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // Device
  const [deviceName, setDeviceName] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [selectedConditions, setSelectedConditions] = useState<string[]>([]);

  // Issue & Signature
  const [issue, setIssue] = useState('');
  const [signatureData, setSignatureData] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Close suggestions on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(e.target as Node)) {
        setCustomerSuggestions([]);
      }
    };
    window.addEventListener('click', handleClick);
    return () => window.removeEventListener('click', handleClick);
  }, []);

  // Quick Customer Search by phone or name
  const handlePhoneOrNameSearch = (val: string, field: 'phone' | 'name') => {
    if (field === 'phone') {
      setPhoneNumber(val);
      setSelectedCustomerId(null);
    } else {
      setFullName(val);
      setSelectedCustomerId(null);
    }

    const query = val.trim().toLowerCase();
    const digits = val.replace(/\D/g, '');

    if (query.length >= 2 || digits.length >= 3) {
      const matches = existingCustomers.filter((c) => {
        const matchName = c.fullName.toLowerCase().includes(query);
        const matchPhone = digits.length >= 3 && c.phone.replace(/\D/g, '').includes(digits);
        return matchName || matchPhone;
      });
      setCustomerSuggestions(matches.slice(0, 5));
    } else {
      setCustomerSuggestions([]);
    }
  };

  const handleSelectCustomer = (c: Customer) => {
    setPhoneNumber(c.phone);
    setFullName(c.fullName);
    setSelectedCustomerId(c.id);
    setCustomerSuggestions([]);
    posAudio.playScanBeep();
  };

  const toggleCondition = (item: string) => {
    if (item === 'Clean / No Defects') {
      if (selectedConditions.includes(item)) {
        setSelectedConditions([]);
      } else {
        setSelectedConditions(['Clean / No Defects']);
      }
      return;
    }

    setSelectedConditions((prev) => {
      const filtered = prev.filter((c) => c !== 'Clean / No Defects');
      if (filtered.includes(item)) {
        return filtered.filter((c) => c !== item);
      } else {
        return [...filtered, item];
      }
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!phoneNumber.trim()) {
      setErrorMsg('Please enter customer phone number');
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('Please enter customer full name');
      return;
    }

    if (!deviceName.trim()) {
      setErrorMsg('Please enter or select device make/model');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetch('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            fullName: fullName.trim(),
            phone: phoneNumber.trim(),
          },
          device: {
            name: deviceName.trim(),
            serialNumber: serialNumber.trim() || undefined,
            passcode: passcode.trim() || undefined,
            condition: selectedConditions.length > 0 ? selectedConditions.join(', ') : undefined,
          },
          faultDescription: issue.trim() || 'General Inspection & Repair',
          laborCents: 0,
          signature: signatureData || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create ticket');
      }

      posAudio.playSuccessChime();
      onSuccess();
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while saving ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-3.5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">60-Second Device Intake</h2>
              <p className="text-[11px] text-slate-500 font-medium">Quick customer, hardware profile &amp; liability sign-off</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4 max-h-[85vh] overflow-y-auto">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Section 1: Customer Quick-Search & Profile */}
          <div className="space-y-2.5" ref={searchBoxRef}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                1. Customer Quick-Search
              </span>
              {selectedCustomerId && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Returning Client Selected
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 relative">
              {/* Phone Input with auto-complete */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Phone className="w-3 h-3 text-slate-400" />
                  Phone Number <span className="text-rose-500">*</span>
                </label>
                <input
                  type="tel"
                  required
                  autoFocus
                  value={phoneNumber}
                  onChange={(e) => handlePhoneOrNameSearch(e.target.value, 'phone')}
                  placeholder="(555) 019-2834"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                />
              </div>

              {/* Full Name Input */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <User className="w-3 h-3 text-slate-400" />
                  Customer Full Name <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => handlePhoneOrNameSearch(e.target.value, 'name')}
                  placeholder="e.g. John Doe"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                />
              </div>

              {/* Live Customer Suggestions Dropdown */}
              {customerSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 divide-y divide-slate-100 overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Search className="w-3 h-3 text-indigo-600" />
                    Matching Existing Customers (Click to auto-fill)
                  </div>
                  {customerSuggestions.map((cust) => (
                    <button
                      key={cust.id}
                      type="button"
                      onClick={() => handleSelectCustomer(cust)}
                      className="w-full text-left px-3 py-2 text-xs hover:bg-indigo-50 transition flex items-center justify-between cursor-pointer"
                    >
                      <div>
                        <span className="font-bold text-slate-900">{cust.fullName}</span>
                        <span className="text-slate-500 font-mono ml-2">({cust.phone})</span>
                      </div>
                      <span className="text-[10px] bg-slate-100 px-2 py-0.5 rounded text-slate-600 font-medium">
                        {cust.ticketCount ?? 1} visits
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Section 2: Essential Device Data */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              2. Essential Device Data
            </span>

            {/* Quick Model Chips */}
            <div className="flex flex-wrap gap-1.5">
              {COMMON_DEVICES.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDeviceName(d)}
                  className={`text-[11px] px-2.5 py-1 rounded-md border transition cursor-pointer font-medium ${
                    deviceName === d
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs font-bold'
                      : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {d}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {/* Make & Model */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Device Make / Model <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro Max"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                />
              </div>

              {/* IMEI / Serial */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Hash className="w-3 h-3 text-slate-400" />
                  IMEI / Serial (Optional)
                </label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="354892019482910"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                />
              </div>

              {/* Passcode / PIN */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                  <Lock className="w-3 h-3 text-slate-400" />
                  Passcode / Pattern PIN
                </label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. 1234 or None"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                />
              </div>
            </div>
          </div>

          {/* Section 3: Pre-Condition Check & Fault Note */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
              3. Pre-Repair Physical Condition Checklist
            </span>

            {/* Fast Toggle Chips */}
            <div className="flex flex-wrap gap-1.5">
              {PRE_CONDITIONS.map((cond) => {
                const isSelected = selectedConditions.includes(cond);
                return (
                  <button
                    key={cond}
                    type="button"
                    onClick={() => toggleCondition(cond)}
                    className={`text-xs px-2.5 py-1 rounded-md border transition cursor-pointer flex items-center gap-1.5 font-medium ${
                      isSelected
                        ? 'bg-slate-900 text-white border-slate-900 shadow-2xs font-bold'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    {isSelected ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <span className="text-slate-400 text-xs">+</span>
                    )}
                    {cond}
                  </button>
                );
              })}
            </div>

            <div className="space-y-1 pt-1">
              <label className="text-xs font-semibold text-slate-700">
                Reported Issue / Diagnostic Request
              </label>
              <input
                type="text"
                value={issue}
                onChange={(e) => setIssue(e.target.value)}
                placeholder="e.g. Front glass broken, touch unresponsive in top left corner"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
              />
            </div>
          </div>

          {/* Section 4: Digital Waiver & E-Signature Pad */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                4. Customer Digital Intake Waiver
              </span>
              <span className="text-[10px] text-slate-500 font-medium">Standard 90-Day Repair Warranty</span>
            </div>

            <p className="text-[11px] text-slate-500 leading-tight">
              Customer authorizes diagnostic inspection and acknowledges pre-existing physical defects noted above. ApexFix is not responsible for data loss or pre-existing liquid damage.
            </p>

            <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
              <SignaturePad
                height={85}
                onSave={(dataUrl) => setSignatureData(dataUrl)}
                onClear={() => setSignatureData(null)}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs cursor-pointer flex items-center gap-2"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Checking In...' : 'Complete Intake (60s)'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
