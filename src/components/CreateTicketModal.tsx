import React, { useState } from 'react';
import { X, Wrench, Phone, User, Smartphone, Lock, AlertCircle } from 'lucide-react';
import { Customer } from '../types';
import { posAudio } from '../utils/audio';

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  existingCustomers: Customer[];
}

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingCustomers,
}) => {
  if (!isOpen) return null;

  const [phoneNumber, setPhoneNumber] = useState('');
  const [fullName, setFullName] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [passcode, setPasscode] = useState('');
  const [issue, setIssue] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customerLookupStatus, setCustomerLookupStatus] = useState<string | null>(null);

  const handlePhoneChange = async (val: string) => {
    setPhoneNumber(val);
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length >= 7) {
      // Check local cache
      const localMatch = existingCustomers.find((c) =>
        c.phone.replace(/\D/g, '').includes(cleaned)
      );
      if (localMatch) {
        setFullName(localMatch.fullName);
        setCustomerLookupStatus(`Returning client: ${localMatch.fullName}`);
        posAudio.playScanBeep();
        return;
      }

      // Check remote lookup
      try {
        const res = await fetch(`/api/customers/lookup?phone=${encodeURIComponent(cleaned)}`);
        const json = await res.json();
        if (json.data) {
          setFullName(json.data.fullName);
          setCustomerLookupStatus(`Returning client: ${json.data.fullName}`);
          posAudio.playScanBeep();
          return;
        }
      } catch {
        // ignore
      }
    }
    setCustomerLookupStatus(null);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!phoneNumber.trim()) {
      setErrorMsg('Please enter customer phone number');
      return;
    }

    if (!fullName.trim()) {
      setErrorMsg('Please enter customer name');
      return;
    }

    if (!deviceName.trim()) {
      setErrorMsg('Please enter device name');
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
            passcode: passcode.trim() || undefined,
          },
          faultDescription: issue.trim() || 'General Inspection & Repair',
          laborCents: 0,
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">New Repair Ticket</h2>
              <p className="text-xs text-slate-500">Quick customer & device intake</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Phone Number */}
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-indigo-600" />
                Phone Number <span className="text-rose-500">*</span>
              </label>
              {customerLookupStatus && (
                <span className="text-[11px] font-semibold text-emerald-600 animate-pulse">
                  {customerLookupStatus}
                </span>
              )}
            </div>
            <input
              type="tel"
              required
              autoFocus
              value={phoneNumber}
              onChange={(e) => handlePhoneChange(e.target.value)}
              placeholder="(555) 019-2834"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono transition"
            />
          </div>

          {/* 2. Customer Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-indigo-600" />
              Customer Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Eleanor Vance"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
            />
          </div>

          {/* 3. Device Name */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
              Device Name <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              required
              value={deviceName}
              onChange={(e) => setDeviceName(e.target.value)}
              placeholder="e.g. iPhone 15 Pro, Galaxy S24, MacBook Air"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
            />
          </div>

          {/* 4. Password / Passcode PIN */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-indigo-600" />
              Password / Passcode PIN
            </label>
            <input
              type="text"
              value={passcode}
              onChange={(e) => setPasscode(e.target.value)}
              placeholder="e.g. 123456 or None"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono transition"
            />
          </div>

          {/* 5. Issue / Problem (Clean 1-line note) */}
          <div className="space-y-1">
            <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
              <Wrench className="w-3.5 h-3.5 text-slate-400" />
              Problem / Issue (Optional)
            </label>
            <input
              type="text"
              value={issue}
              onChange={(e) => setIssue(e.target.value)}
              placeholder="e.g. Cracked screen, battery drain, liquid damage"
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
            />
          </div>

          {/* Actions */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2.5 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs cursor-pointer flex items-center gap-2"
            >
              {isSubmitting ? 'Creating...' : 'Create Ticket'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
