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
  Check,
  Search,
  Grid3X3,
} from 'lucide-react';
import { Customer } from '../types';
import { posAudio } from '../utils/audio';
import { fetchWithAuth } from '../utils/auth';
import { PatternLockModal, PatternLockPreview } from './PatternLockModal';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdTicket?: any) => void;
  existingCustomers: Customer[];
  initialCustomer?: Customer | null;
}

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingCustomers,
  initialCustomer,
}) => {
  // 1. Customer Details
  const [phoneNumber, setPhoneNumber] = useState('');
  const [altPhone, setAltPhone] = useState('');
  const [fullName, setFullName] = useState('');
  const [customerSuggestions, setCustomerSuggestions] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  // 2. Essential Device Data
  const [deviceName, setDeviceName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [pattern, setPattern] = useState('');
  const [isPatternModalOpen, setIsPatternModalOpen] = useState(false);
  const [serialNumber, setSerialNumber] = useState('');

  // 3. Reported Issue
  const [issue, setIssue] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchBoxRef = useRef<HTMLDivElement>(null);

  // Reset form fields and apply optional customer prefill when modal opens
  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg(null);
    setCustomerSuggestions([]);
    setDeviceName('');
    setPasscode('');
    setPattern('');
    setSerialNumber('');
    setIssue('');
    if (initialCustomer) {
      setPhoneNumber(initialCustomer.phone || '');
      setAltPhone(initialCustomer.altPhone || '');
      setFullName(initialCustomer.fullName || '');
      setSelectedCustomerId(initialCustomer.id);
    } else {
      setPhoneNumber('');
      setAltPhone('');
      setFullName('');
      setSelectedCustomerId(null);
    }
  }, [isOpen, initialCustomer]);

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

  if (!isOpen) return null;

  // Customer search by phone or name
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
    setAltPhone(c.altPhone || '');
    setFullName(c.fullName);
    setSelectedCustomerId(c.id);
    setCustomerSuggestions([]);
    posAudio.playScanBeep();
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
      setErrorMsg('Please enter device make & model');
      return;
    }

    try {
      setIsSubmitting(true);
      const res = await fetchWithAuth('/api/tickets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customer: {
            fullName: fullName.trim(),
            phone: phoneNumber.trim(),
            altPhone: altPhone.trim() || undefined,
          },
          device: {
            name: deviceName.trim(),
            passcode: passcode.trim() || undefined,
            pattern: pattern.trim() || undefined,
            serialNumber: serialNumber.trim() || undefined,
          },
          faultDescription: issue.trim() || 'Device Diagnostics & Inspection',
          laborCents: 0,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create ticket');
      }

      posAudio.playSuccessChime();
      onSuccess(data.data);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Error occurred while saving ticket');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-5 py-3.5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/90">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">New Ticket</h2>
              <p className="text-[11px] text-slate-500 font-medium">Customer contact, hardware details &amp; reported issue</p>
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
        <form onSubmit={handleSubmit} className="p-5 sm:p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Customer Contact */}
          <div className="space-y-2" ref={searchBoxRef}>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                1. Customer Information
              </span>
              {selectedCustomerId && (
                <span className="text-[11px] font-bold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" /> Returning Client
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

              {/* Suggestions Dropdown */}
              {customerSuggestions.length > 0 && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl z-50 divide-y divide-slate-100 overflow-hidden">
                  <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                    <Search className="w-3 h-3 text-indigo-600" />
                    Matching Existing Clients (Click to auto-fill)
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

            {/* Alternative Phone (Optional) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Phone className="w-3 h-3 text-slate-400" />
                Alternative Phone <span className="text-slate-400 font-normal text-[11px]">(Optional / Secondary)</span>
              </label>
              <input
                type="tel"
                value={altPhone}
                onChange={(e) => setAltPhone(e.target.value)}
                placeholder="e.g. (555) 987-6543 (Work, Spouse, or Home)"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
              />
            </div>
          </div>

          {/* 2. Device Make, Model, Password & Optional Serial */}
          <div className="space-y-2.5 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              2. Device Details &amp; Passcode
            </span>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Make & Model */}
              <div className="space-y-1">
                <label className="text-xs font-semibold text-slate-700">
                  Device Make &amp; Model <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={deviceName}
                  onChange={(e) => setDeviceName(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro / MacBook Air"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
                />
              </div>

              {/* Passcode / Password & Pattern Lock */}
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                    PIN / Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setIsPatternModalOpen(true)}
                    className="text-[11px] text-purple-600 hover:text-purple-800 font-semibold flex items-center gap-1 cursor-pointer transition"
                  >
                    <Grid3X3 className="w-3 h-3" />
                    <span>{pattern ? 'Edit Pattern' : '+ Pattern Lock'}</span>
                  </button>
                </div>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. 1234 or None"
                  className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
                />
                {pattern && (
                  <div className="flex items-center justify-between px-2.5 py-1.5 bg-purple-50 border border-purple-200/90 rounded-lg text-xs text-purple-800 mt-1">
                    <div className="flex items-center gap-2">
                      <PatternLockPreview pattern={pattern} size={16} />
                      <span className="font-medium text-[11px]">
                        Pattern: <strong className="font-mono">{pattern}</strong>
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPattern('')}
                      className="text-purple-500 hover:text-purple-800 text-[11px] font-semibold cursor-pointer"
                    >
                      Remove
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Serial Number / IMEI (Optional) */}
            <div className="space-y-1">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1">
                <Hash className="w-3.5 h-3.5 text-slate-400" />
                Serial Number / IMEI <span className="text-slate-400 font-normal">(Optional)</span>
              </label>
              <input
                type="text"
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                placeholder="e.g. 354892019482910 or C02G..."
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
              />
            </div>
          </div>

          {/* 3. Reported Issue */}
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-indigo-600" />
              3. Reported Issue
            </span>

            <textarea
              rows={2}
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="e.g. Cracked screen, battery draining fast, liquid spill on keyboard..."
              className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition resize-none"
            />
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-2.5 border-t border-slate-100">
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
              className="px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs cursor-pointer flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5" />
              <span>{isSubmitting ? 'Creating...' : 'Create Work Order'}</span>
            </button>
          </div>
        </form>
      </div>

      <PatternLockModal
        isOpen={isPatternModalOpen}
        initialPattern={pattern}
        deviceName={deviceName.trim() || 'New Device'}
        onClose={() => setIsPatternModalOpen(false)}
        onSave={(newPat) => setPattern(newPat)}
      />
    </div>
  );
};
