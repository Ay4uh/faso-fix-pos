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
  DollarSign,
  Calendar,
} from 'lucide-react';
import { Customer } from '../types';
import { posAudio } from '../utils/audio';
import { fetchWithAuth } from '../utils/auth';
import { STANDARD_REPAIR_SERVICES } from '../utils/repairPricing';
import { PatternLockModal, PatternLockPreview } from './PatternLockModal';

function getLocalDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

interface CreateTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (createdTicket?: any) => void;
  existingCustomers: Customer[];
  initialCustomer?: Customer | null;
  shopTaxRateBps?: number;
  shopTaxLabel?: string;
}

export const CreateTicketModal: React.FC<CreateTicketModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  existingCustomers,
  initialCustomer,
  shopTaxRateBps = 1300,
  shopTaxLabel = 'HST',
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

  // 3. Reported Issue & Promised Due Date
  const [issue, setIssue] = useState('');
  const [dueDate, setDueDate] = useState(() => getLocalDateOffset(2));

  // 4. Optional Upfront Pricing & Service Selection (NEVER auto-approves)
  const [pricingChoice, setPricingChoice] = useState<'PENDING_DIAGNOSIS' | 'QUOTED'>('PENDING_DIAGNOSIS');
  const [selectedServiceId, setSelectedServiceId] = useState('');
  const [quotedServiceDesc, setQuotedServiceDesc] = useState('');
  const [quotedPriceDollars, setQuotedPriceDollars] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const searchBoxRef = useRef<HTMLDivElement>(null);
  const customerSearchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Reset form fields and apply optional customer prefill when modal opens
  useEffect(() => {
    if (!isOpen) {
      if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
      return;
    }
    setErrorMsg(null);
    setCustomerSuggestions([]);
    setDeviceName('');
    setPasscode('');
    setPattern('');
    setSerialNumber('');
    setIssue('');
    setDueDate(getLocalDateOffset(2));
    setPricingChoice('PENDING_DIAGNOSIS');
    setSelectedServiceId('');
    setQuotedServiceDesc('');
    setQuotedPriceDollars('');
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
    return () => {
      window.removeEventListener('click', handleClick);
      if (customerSearchTimerRef.current) clearTimeout(customerSearchTimerRef.current);
    };
  }, []);

  if (!isOpen) return null;

  // Customer search by phone or name (immediate local match + debounced server search across all 129+ clients)
  const handlePhoneOrNameSearch = (val: string, field: 'phone' | 'name') => {
    if (field === 'phone') {
      setPhoneNumber(val);
      setSelectedCustomerId(null);
    } else {
      setFullName(val);
      setSelectedCustomerId(null);
    }

    if (customerSearchTimerRef.current) {
      clearTimeout(customerSearchTimerRef.current);
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

      customerSearchTimerRef.current = setTimeout(() => {
        fetchWithAuth(`/api/customers?search=${encodeURIComponent(val.trim())}&page=1&pageSize=5`)
          .then((res) => (res.ok ? res.json() : null))
          .then((json) => {
            if (Array.isArray(json?.data)) {
              setCustomerSuggestions(json.data.slice(0, 5));
            }
          })
          .catch(() => {});
      }, 200);
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

    if (!dueDate) {
      setErrorMsg('Please select a promised due date');
      return;
    }

    const parsedPrice = parseFloat(quotedPriceDollars);
    const hasQuotedAmount =
      pricingChoice === 'QUOTED' && quotedPriceDollars.trim() !== '' && !Number.isNaN(parsedPrice);
    if (pricingChoice === 'QUOTED' && quotedPriceDollars.trim() !== '' && (Number.isNaN(parsedPrice) || parsedPrice < 0)) {
      setErrorMsg('Please enter a valid non-negative quoted price or leave blank for diagnosis');
      return;
    }

    const quotedCents = hasQuotedAmount ? Math.round(parsedPrice * 100) : 0;
    const effectiveDescription =
      quotedServiceDesc.trim() || issue.trim() || `${deviceName.trim()} Repair Service`;

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
          faultDescription: issue.trim() || quotedServiceDesc.trim() || 'Device Diagnostics & Inspection',
          dueDate,
          laborCents: 0,
          pricingMode: quotedCents > 0 ? 'QUOTE_PROVIDED' : 'DIAGNOSIS_REQUIRED',
          ...(quotedCents > 0
            ? {
                initialItems: [
                  {
                    description: effectiveDescription,
                    quantity: 1,
                    unitPriceCents: quotedCents,
                  },
                ],
              }
            : {}),
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
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center p-2.5 sm:p-4 bg-slate-900/40 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92dvh] flex flex-col shadow-2xl border border-slate-200 overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* Modal Header */}
        <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200/90 flex items-center justify-between bg-slate-50/90 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-600 text-white flex items-center justify-center shadow-xs shrink-0">
              <Wrench className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 leading-tight">New Ticket</h2>
              <p className="text-[11px] text-slate-500 font-medium">Customer contact, hardware details &amp; reported issue</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200 transition cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 p-4 sm:p-6 space-y-4">
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
                  placeholder="Customer phone number"
                  className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
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
                  placeholder="Customer full name"
                  className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
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
                placeholder="Secondary phone number (optional)"
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
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
                  placeholder="Device make and model"
                  className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
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
                  placeholder="Passcode (optional)"
                  className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
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
                placeholder="Serial number or IMEI (optional)"
                className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 font-mono transition"
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
              placeholder="Describe reported issue or requested repair"
              className="w-full px-3 py-2.5 sm:py-2 text-base sm:text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition resize-none"
            />
          </div>

          {/* 3.5 Promised Due Date */}
          <div className="space-y-2 pt-2 border-t border-slate-100">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <label
                htmlFor="new-ticket-due-date"
                className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                Promised Due Date
              </label>
              <span className="text-[11px] font-medium text-slate-500">Default: +2 Days</span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center gap-2">
              <input
                id="new-ticket-due-date"
                type="date"
                required
                aria-label="Promised Due Date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="px-3 py-2 text-base sm:text-xs font-mono font-semibold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600 transition"
              />
              <div className="flex flex-wrap gap-1.5">
                {[
                  { label: 'Today', days: 0 },
                  { label: 'Tomorrow', days: 1 },
                  { label: '+2 Days', days: 2 },
                  { label: '+3 Days', days: 3 },
                  { label: '+1 Week', days: 7 },
                ].map((preset) => {
                  const target = getLocalDateOffset(preset.days);
                  const active = dueDate === target;
                  return (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setDueDate(target)}
                      className={`px-2.5 py-1.5 rounded-md text-[11px] font-bold border transition cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          {/* 4. Repair Pricing & Initial Quote (Optional — never auto-approves) */}
          {(() => {
            const parsedNum = parseFloat(quotedPriceDollars);
            const validCents =
              pricingChoice === 'QUOTED' &&
              quotedPriceDollars.trim() !== '' &&
              !Number.isNaN(parsedNum) &&
              parsedNum > 0
                ? Math.round(parsedNum * 100)
                : 0;
            const taxCents = Math.round((validCents * shopTaxRateBps) / 10000);
            const estimatedTotalCents = validCents + taxCents;
            const taxPctLabel = (shopTaxRateBps / 100).toFixed(1).replace(/\.0$/, '');

            return (
              <div className="space-y-2.5 pt-2 border-t border-slate-100">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                    <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                    4. Repair Quote / Pricing
                  </span>
                  <div className="inline-flex rounded-lg bg-slate-100 p-0.5 border border-slate-200">
                    <button
                      type="button"
                      onClick={() => {
                        setPricingChoice('PENDING_DIAGNOSIS');
                        setSelectedServiceId('');
                        setQuotedPriceDollars('');
                      }}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        pricingChoice === 'PENDING_DIAGNOSIS'
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Price Pending Diagnosis
                    </button>
                    <button
                      type="button"
                      onClick={() => setPricingChoice('QUOTED')}
                      className={`px-2.5 py-1 rounded-md text-[11px] font-bold transition cursor-pointer ${
                        pricingChoice === 'QUOTED'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Enter Quoted Price
                    </button>
                  </div>
                </div>

                {pricingChoice === 'PENDING_DIAGNOSIS' ? (
                  <div className="px-3 py-2.5 rounded-lg bg-amber-50/70 border border-amber-200/80 text-[11px] text-amber-900">
                    Ticket will be created as <strong>Price Pending Diagnosis</strong>. You can add parts or
                    a repair quote after bench inspection without showing $0.00 to the customer.
                  </div>
                ) : (
                  <div className="space-y-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Predefined Repair Service (Optional)
                      </label>
                      <select
                        value={selectedServiceId}
                        onChange={(e) => {
                          const id = e.target.value;
                          setSelectedServiceId(id);
                          const svc = STANDARD_REPAIR_SERVICES.find((s) => s.id === id);
                          if (svc) {
                            setQuotedServiceDesc(svc.name);
                            setQuotedPriceDollars((svc.priceCents / 100).toFixed(2));
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:border-indigo-600"
                      >
                        <option value="">-- Custom repair or select standard service --</option>
                        {STANDARD_REPAIR_SERVICES.map((svc) => (
                          <option key={svc.id} value={svc.id}>
                            {svc.name} — ${(svc.priceCents / 100).toFixed(2)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Quoted Repair / Scope
                        </label>
                        <input
                          type="text"
                          value={quotedServiceDesc}
                          onChange={(e) => setQuotedServiceDesc(e.target.value)}
                          placeholder="Service or diagnostic description"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-600"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Quoted Price (Pre-Tax $)
                        </label>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          value={quotedPriceDollars}
                          onChange={(e) => setQuotedPriceDollars(e.target.value)}
                          placeholder="Leave blank if pending"
                          className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                        />
                      </div>
                    </div>

                    {validCents > 0 ? (
                      <div className="bg-white border border-indigo-200/80 rounded-lg p-2.5 space-y-1 text-xs">
                        <div className="flex justify-between text-slate-600">
                          <span>Quoted Subtotal:</span>
                          <span className="font-mono font-semibold">${(validCents / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between text-slate-500">
                          <span>
                            {shopTaxLabel} ({taxPctLabel}%):
                          </span>
                          <span className="font-mono">+${(taxCents / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between font-bold text-indigo-900 pt-1 border-t border-slate-100">
                          <span>Estimated Total:</span>
                          <span className="font-mono">${(estimatedTotalCents / 100).toFixed(2)}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 pt-1 text-[10px]">
                          <span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-200">
                            Pricing: Quote Provided
                          </span>
                          <span className="px-2 py-0.5 rounded bg-purple-50 text-purple-700 font-bold border border-purple-200">
                            Approval: Awaiting Customer Approval
                          </span>
                        </div>
                        <p className="text-[10px] text-slate-500 pt-0.5">
                          Entering a quoted price never auto-approves the repair. Record customer approval on the work order once confirmed.
                        </p>
                      </div>
                    ) : (
                      <p className="text-[10px] text-slate-500">
                        Leave Quoted Price blank if a diagnostic check is needed before quoting.
                      </p>
                    )}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Footer Actions */}
          <div className="pt-3 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2 sm:gap-2.5 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-0 px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition cursor-pointer flex items-center"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full sm:w-auto justify-center min-h-[42px] sm:min-h-0 px-5 py-2 bg-indigo-600 text-white text-xs font-bold rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-xs cursor-pointer flex items-center gap-1.5"
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
