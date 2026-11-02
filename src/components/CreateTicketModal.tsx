import React, { useState } from 'react';
import { X, Check, AlertCircle, Wrench, DollarSign, User, Phone, Mail, Hash, PenTool } from 'lucide-react';
import { Customer } from '../types';
import { posAudio } from '../utils/audio';
import { SignaturePad } from './SignaturePad';

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

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [deviceMakeModel, setDeviceMakeModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [faultDescription, setFaultDescription] = useState('');
  const [price, setPrice] = useState('85.00');
  const [benchNumber, setBenchNumber] = useState('Bench #04');
  const [selectedConditions, setSelectedConditions] = useState<string[]>(['No Screen Cracks']);
  const [signature, setSignature] = useState<string | null>(null);

  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [priority, setPriority] = useState<'LOW' | 'STANDARD' | 'URGENT'>('STANDARD');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [customerLookupStatus, setCustomerLookupStatus] = useState<string | null>(null);

  const conditionOptions = [
    'No Screen Cracks',
    'Cracked Glass',
    'Dented Housing',
    'LDI Liquid Triggered',
    'Missing Screws',
    'No Power / Unresponsive',
    'Camera Scratched',
  ];

  const toggleCondition = (cond: string) => {
    setSelectedConditions((prev) =>
      prev.includes(cond) ? prev.filter((c) => c !== cond) : [...prev, cond]
    );
  };

  const handlePhoneChange = async (val: string) => {
    setPhoneNumber(val);
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length >= 7) {
      // First check local list
      const localMatch = existingCustomers.find((c) =>
        c.phone.replace(/\D/g, '').includes(cleaned)
      );
      if (localMatch) {
        setFullName(localMatch.fullName);
        setEmail(localMatch.email || '');
        setAddress(localMatch.address || '');
        setCustomerLookupStatus(`Found returning customer: ${localMatch.fullName}`);
        posAudio.playScanBeep();
        return;
      }

      // Check remote lookup
      try {
        const res = await fetch(`/api/customers/lookup?phone=${encodeURIComponent(cleaned)}`);
        const json = await res.json();
        if (json.data) {
          setFullName(json.data.fullName);
          setEmail(json.data.email || '');
          setAddress(json.data.address || '');
          setCustomerLookupStatus(`Found returning customer: ${json.data.fullName}`);
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

    if (!fullName.trim() || !phoneNumber.trim()) {
      setErrorMsg('Customer name and phone number are required');
      return;
    }

    if (!deviceMakeModel.trim() || !faultDescription.trim()) {
      setErrorMsg('Device make/model and fault description are required');
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
            email: email.trim() || undefined,
            address: address.trim() || undefined,
          },
          device: {
            name: deviceMakeModel.trim(),
            serialNumber: serialNumber.trim() || undefined,
            passcode: passcode.trim() || undefined,
            condition: selectedConditions.join(', ') || undefined,
          },
          faultDescription: faultDescription.trim(),
          laborCents: Math.round((parseFloat(price) || 0) * 100),
          dueDate: dueDate,
          priority,
          bench: benchNumber,
          technician: 'Alex Mercer',
          signature: signature || undefined,
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
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Work Order Intake Terminal</h2>
              <p className="text-[11px] text-slate-500">Record customer unit, cosmetic condition & generate work order</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 text-red-500 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Customer Section */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                1. Customer Contact & Profile
              </span>
              {customerLookupStatus && (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                  <Check className="w-3 h-3" />
                  {customerLookupStatus}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Phone Number *
                </label>
                <div className="relative">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="tel"
                    required
                    value={phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="(555) 019-2834"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Full Customer Name *
                </label>
                <input
                  type="text"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="e.g. Marcus Vance"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Email (Optional for Invoice)
                </label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="marcus@example.com"
                    className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Street Address (Optional)
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="123 King St W"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>
          </div>

          {/* Device & Hardware Section */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Hash className="w-3.5 h-3.5 text-indigo-600" />
              2. Device Intake & Physical Details
            </span>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Device Make & Model *
                </label>
                <input
                  type="text"
                  required
                  value={deviceMakeModel}
                  onChange={(e) => setDeviceMakeModel(e.target.value)}
                  placeholder="e.g. iPhone 15 Pro Max / Galaxy S24"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Passcode / Pattern PIN
                </label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. 123456 or None"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Serial Number / IMEI (Optional)
                </label>
                <input
                  type="text"
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                  placeholder="354892019482910"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono uppercase focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>
            </div>

            {/* Condition Badges */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Pre-Repair Physical Condition:
              </label>
              <div className="flex flex-wrap gap-1.5">
                {conditionOptions.map((cond) => {
                  const isChecked = selectedConditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleCondition(cond)}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all cursor-pointer ${
                        isChecked
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {isChecked ? '✓ ' : '+ '}
                      {cond}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Repair Details & Logistics */}
          <div className="space-y-3 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
              3. Service Diagnostics & Quoted Labor
            </span>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Reported Fault Description *
              </label>
              <textarea
                required
                rows={2}
                value={faultDescription}
                onChange={(e) => setFaultDescription(e.target.value)}
                placeholder="e.g. Cracked OLED panel, vertical green line on screen, touch unresponsive in top corner..."
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Labor / Service ($)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xs font-mono">$</span>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    value={price}
                    onChange={(e) => setPrice(e.target.value)}
                    className="w-full pl-6 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Promised Due Date
                </label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Priority Urgency
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                >
                  <option value="LOW">Low</option>
                  <option value="STANDARD">Standard</option>
                  <option value="URGENT">Urgent Rush (+Rush Fee)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Workstation Bench
                </label>
                <select
                  value={benchNumber}
                  onChange={(e) => setBenchNumber(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                >
                  <option value="Bench #01">Bench #01</option>
                  <option value="Bench #02">Bench #02</option>
                  <option value="Bench #03">Bench #03</option>
                  <option value="Bench #04">Bench #04 (Current)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Customer Signature & Authorization Section */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <PenTool className="w-3.5 h-3.5 text-indigo-600" />
              4. Customer Authorization & Intake Sign-off
            </span>
            <SignaturePad
              initialSignature={signature}
              onSave={(dataUrl) => setSignature(dataUrl)}
              onClear={() => setSignature(null)}
              height={110}
            />
          </div>

          {/* Modal Footer Actions */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-between">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancel Intake
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white rounded-lg text-xs font-bold shadow-md shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
            >
              <Check className="w-4 h-4" />
              <span>{isSubmitting ? 'Registering Work Order...' : 'Create Work Order'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
