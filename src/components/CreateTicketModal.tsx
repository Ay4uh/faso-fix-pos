import React, { useState } from 'react';
import { X, Search, Check, AlertCircle, Wrench, Calendar, DollarSign, User, Phone, MapPin, Mail, Hash, ShieldAlert } from 'lucide-react';
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

  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');

  const [deviceMakeModel, setDeviceMakeModel] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [passcode, setPasscode] = useState('');
  const [faultDescription, setFaultDescription] = useState('');
  const [price, setPrice] = useState('85.00');
  const [technicianNote, setTechnicianNote] = useState('');
  const [benchNumber, setBenchNumber] = useState('Bench #04');
  const [selectedConditions, setSelectedConditions] = useState<string[]>(['No Screen Cracks']);

  const [dueDate, setDueDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  });
  const [status, setStatus] = useState<'PENDING' | 'IN_PROGRESS' | 'WAITING_ON_PARTS' | 'COMPLETED'>('PENDING');
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

  const handlePhoneChange = (val: string) => {
    setPhoneNumber(val);
    const cleaned = val.replace(/\D/g, '');
    if (cleaned.length >= 7) {
      const match = existingCustomers.find((c) =>
        c.phoneNumber.replace(/\D/g, '').includes(cleaned)
      );
      if (match) {
        setFullName(match.fullName);
        setEmail(match.email || '');
        setAddress(match.address || '');
        setCustomerLookupStatus(`Found returning customer: ${match.fullName}`);
        posAudio.playScanBeep();
        return;
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
            phoneNumber: phoneNumber.trim(),
            email: email.trim() || undefined,
            address: address.trim() || undefined,
          },
          deviceMakeModel: deviceMakeModel.trim(),
          serialNumber: serialNumber.trim() || undefined,
          passcode: passcode.trim() || undefined,
          condition: selectedConditions.join(', '),
          faultDescription: faultDescription.trim(),
          price: parseFloat(price) || 0,
          technicianNote: technicianNote.trim() || undefined,
          dueDate: new Date(dueDate).toISOString(),
          status,
          priority,
          benchNumber,
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
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-xs text-red-700">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Customer Information */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-indigo-600" />
                Customer Contact Details
              </h3>
              {customerLookupStatus && (
                <span className="text-[11px] font-semibold text-emerald-600 flex items-center gap-1">
                  <Check className="w-3 h-3" />
                  {customerLookupStatus}
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Phone Number * (Lookup Key)
                </label>
                <div className="relative">
                  <Phone className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={phoneNumber}
                    onChange={(e) => handlePhoneChange(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Customer Full Name *
                </label>
                <div className="relative">
                  <User className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="e.g. John Doe"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <Mail className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="john@example.com"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Workstation Bench Assignment
                </label>
                <select
                  value={benchNumber}
                  onChange={(e) => setBenchNumber(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                >
                  <option value="Bench #01">Bench #01 (Display Diagnostic)</option>
                  <option value="Bench #02">Bench #02 (Battery Cleanroom)</option>
                  <option value="Bench #03">Bench #03 (Console & Micro-solder)</option>
                  <option value="Bench #04">Bench #04 (Hardware Diagnostic)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Device & Fault Details */}
          <div className="space-y-3">
            <div className="border-b border-slate-100 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <Wrench className="w-3.5 h-3.5 text-indigo-600" />
                Device Specification & Security
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Make & Model *
                </label>
                <input
                  type="text"
                  required
                  value={deviceMakeModel}
                  onChange={(e) => setDeviceMakeModel(e.target.value)}
                  placeholder="e.g. Apple iPhone 15 Pro"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  IMEI / Serial Number
                </label>
                <div className="relative">
                  <Hash className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="SN / IMEI"
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  PIN Passcode
                </label>
                <input
                  type="text"
                  value={passcode}
                  onChange={(e) => setPasscode(e.target.value)}
                  placeholder="e.g. 2580"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none font-mono"
                />
              </div>
            </div>

            {/* Cosmetic Condition Checklist */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1.5">
                Intake Cosmetic Assessment (Condition Tags)
              </label>
              <div className="flex flex-wrap gap-1.5">
                {conditionOptions.map((cond) => {
                  const isSel = selectedConditions.includes(cond);
                  return (
                    <button
                      key={cond}
                      type="button"
                      onClick={() => toggleCondition(cond)}
                      className={`px-2.5 py-1 rounded-full text-[10px] font-semibold border transition-all cursor-pointer ${
                        isSel
                          ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                          : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100'
                      }`}
                    >
                      {cond}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Reported Fault Description *
              </label>
              <textarea
                required
                rows={2}
                value={faultDescription}
                onChange={(e) => setFaultDescription(e.target.value)}
                placeholder="Describe symptom, drop damage, liquid ingress, error codes..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
              />
            </div>
          </div>

          {/* Pricing, Due Date, Status */}
          <div className="space-y-3">
            <div className="border-b border-slate-100 pb-1.5">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                Work Order Parameters
              </h3>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Est. Price ($) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Due Date *
                </label>
                <input
                  type="date"
                  required
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg font-mono"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Initial Status
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="PENDING">Pending</option>
                  <option value="IN_PROGRESS">In-Progress</option>
                  <option value="WAITING_ON_PARTS">Waiting on Parts</option>
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Priority
                </label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as any)}
                  className="w-full px-2 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
                >
                  <option value="LOW">Low</option>
                  <option value="STANDARD">Standard</option>
                  <option value="URGENT">Urgent Rush</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                Technician Diagnostic Notes
              </label>
              <input
                type="text"
                value={technicianNote}
                onChange={(e) => setTechnicianNote(e.target.value)}
                placeholder="Initial diagnosis, test bench assignment..."
                className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg"
              />
            </div>
          </div>

          {/* Action Buttons */}
          <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs shadow-indigo-200 transition-all disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
            >
              {isSubmitting ? 'Generating...' : 'Intake Unit & Generate Work Order'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
