import React, { useState, useEffect } from 'react';
import { Ticket } from '../types';
import {
  X,
  Phone,
  Printer,
  CreditCard,
  Plus,
  ShoppingBag,
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Package,
  Wrench,
  Smartphone,
  Send,
  MessageSquare,
  Lock,
  Layers,
  Save,
  Check,
  ShieldCheck,
  Tag,
} from 'lucide-react';
import { Barcode } from './Barcode';
import { posAudio } from '../utils/audio';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  retailInCents: number;
  stockQuantity: number;
}

interface WorkOrderScreenProps {
  ticket: Ticket;
  onClose: () => void;
  onUpdateStatus: (id: string, status: Ticket['status']) => Promise<void>;
  onRefresh: () => void;
  onPrint: (ticket: Ticket) => void;
}

export const WorkOrderScreen: React.FC<WorkOrderScreenProps> = ({
  ticket,
  onClose,
  onUpdateStatus,
  onRefresh,
  onPrint,
}) => {
  const [activeTab, setActiveTab] = useState<'customerNotes' | 'internalNotes' | 'history' | 'inbox' | 'diagnostics'>('customerNotes');
  
  // Note inputs
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // SMS input
  const [smsText, setSmsText] = useState(`Hi ${ticket.customer.fullName}, ApexFix update: Your ${ticket.deviceMakeModel} work order #${ticket.ticketNumber} is currently ${ticket.status}.`);
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);

  // Passcode & Pattern lock state
  const [passcode, setPasscode] = useState(ticket.device?.passcode || '');
  const [patternDots, setPatternDots] = useState<number[]>([1, 2, 5, 8]);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);

  // Payment modal state
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('CREDIT_CARD');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Add Item / Part modal state
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [availableParts, setAvailableParts] = useState<InventoryItem[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [customItemDesc, setCustomItemDesc] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [isAttachingPart, setIsAttachingPart] = useState(false);

  // Load available inventory parts
  useEffect(() => {
    fetch('/api/inventory')
      .then((res) => res.json())
      .then((data) => setAvailableParts(data.data || []))
      .catch(() => {});
  }, []);

  // Diagnostics checklist
  const [diagnostics, setDiagnostics] = useState({
    powerOn: true,
    displayTouch: true,
    cameraFront: true,
    cameraRear: true,
    chargingPort: true,
    speakers: true,
    microphones: true,
    wifiBluetooth: true,
  });

  // Financial calculations
  const invoice = (ticket as any).invoice;
  const subtotal = ticket.price;
  const discount = 15.0; // standard shop promo discount
  const taxableSubtotal = Math.max(0, subtotal - discount);
  const gst = taxableSubtotal * 0.08;
  const pst = taxableSubtotal * 0.05;
  const total = taxableSubtotal + gst + pst;
  const paid = invoice ? invoice.amountPaidInCents / 100 : (ticket.status === 'COMPLETED' ? total : 0);
  const balanceOwing = Math.max(0, total - paid);

  // Pattern toggle
  const togglePatternDot = (dotIndex: number) => {
    setPatternDots((prev) =>
      prev.includes(dotIndex) ? prev.filter((d) => d !== dotIndex) : [...prev, dotIndex]
    );
  };

  const handleSaveSecurity = async () => {
    setIsSavingSecurity(true);
    try {
      await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      setSecuritySaved(true);
      setTimeout(() => setSecuritySaved(false), 2000);
      onRefresh();
    } catch {
      alert('Failed to save security details');
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;

    setIsSubmittingNote(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          note: newNote.trim(),
          type: activeTab === 'customerNotes' ? 'CUSTOMER' : 'INTERNAL',
        }),
      });
      setNewNote('');
      onRefresh();
    } catch {
      alert('Failed to save note');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!smsText.trim()) return;

    setIsSendingSms(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: smsText.trim(),
          customerPhone: ticket.customer.phoneNumber,
        }),
      });
      if (!res.ok) throw new Error('SMS failed');
      posAudio.playScanBeep();
      setSmsSuccess(true);
      setTimeout(() => setSmsSuccess(false), 3000);
      onRefresh();
    } catch {
      alert('Could not dispatch SMS');
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseFloat(paymentAmount);
    if (isNaN(amt) || amt <= 0) return;

    setIsRecordingPayment(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amount: amt,
          method: paymentMethod,
        }),
      });
      if (!res.ok) throw new Error('Payment error');
      posAudio.playCashChime();
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      onRefresh();
    } catch {
      alert('Payment could not be recorded');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleAttachPart = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAttachingPart(true);

    try {
      if (selectedPartId) {
        const part = availableParts.find((p) => p.id === selectedPartId);
        if (!part) return;
        await fetch(`/api/tickets/${ticket.id}/parts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partId: part.id,
            customName: part.name,
            price: part.retailInCents / 100,
            quantity: 1,
          }),
        });
      } else if (customItemDesc.trim() && parseFloat(customItemPrice) > 0) {
        await fetch(`/api/tickets/${ticket.id}/parts`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customName: customItemDesc.trim(),
            price: parseFloat(customItemPrice),
            quantity: 1,
          }),
        });
      }

      posAudio.playSuccessChime();
      setIsAddItemModalOpen(false);
      setSelectedPartId('');
      setCustomItemDesc('');
      setCustomItemPrice('');
      onRefresh();
    } catch {
      alert('Failed to attach component to ticket');
    } finally {
      setIsAttachingPart(false);
    }
  };

  const getStatusBadge = () => {
    switch (ticket.status) {
      case 'COMPLETED':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-emerald-600 text-white uppercase tracking-wider flex items-center gap-1">
            <CheckCircle2 className="w-3 h-3" /> DONE & PAID
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-amber-500 text-white uppercase tracking-wider flex items-center gap-1">
            <Package className="w-3 h-3" /> PARTS ORDERED
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-blue-600 text-white uppercase tracking-wider flex items-center gap-1">
            <Clock className="w-3 h-3" /> IN BENCH REPAIR
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="px-2.5 py-0.5 rounded text-[11px] font-bold bg-slate-700 text-white uppercase tracking-wider">
            INTAKE PENDING
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto font-sans">
      <div className="bg-[#f8fafc] w-full max-w-7xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[96vh] animate-in fade-in zoom-in-95 duration-150">
        {/* ========================================================
            TOP HEADER (Service WO #, Barcode, Actions)
           ======================================================== */}
        <header className="bg-white border-b border-slate-200 px-5 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Return to Dashboard"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400 tracking-wider uppercase">SERVICE</span>
              <h1 className="text-base font-extrabold text-slate-900 font-mono flex items-center gap-2">
                WO # {ticket.ticketNumber}
              </h1>
              {getStatusBadge()}
            </div>

            {/* Quick Status Dropdown */}
            <select
              value={ticket.status}
              onChange={async (e) => {
                const nextStatus = e.target.value as any;
                if (nextStatus === 'COMPLETED') posAudio.playSuccessChime();
                await onUpdateStatus(ticket.id, nextStatus);
                onRefresh();
              }}
              className="bg-slate-50 border border-slate-200 rounded-md text-xs font-semibold px-2.5 py-1 text-slate-700 hover:bg-slate-100 cursor-pointer focus:outline-none"
            >
              <option value="PENDING">Pending</option>
              <option value="IN_PROGRESS">In-Progress</option>
              <option value="WAITING_ON_PARTS">Waiting on Parts</option>
              <option value="COMPLETED">Completed</option>
            </select>
          </div>

          {/* Action CTAs & Barcode */}
          <div className="flex items-center gap-3">
            {/* Header Barcode */}
            <div className="hidden sm:block">
              <Barcode value={`WO-${ticket.ticketNumber.padStart(4, '0')}`} width={120} height={32} />
            </div>

            <button
              onClick={() => setIsAddItemModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach Inventory Part</span>
            </button>

            <button
              onClick={() => {
                setPaymentAmount(balanceOwing.toFixed(2));
                setIsPaymentModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Take Payment</span>
            </button>

            <button
              onClick={() => onPrint(ticket)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Print Work Order"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={() => onPrint(ticket)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors"
              title="Print Thermal Tag"
            >
              <FileText className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ========================================================
            MAIN WORKSPACE: Split 2-Column
           ======================================================== */}
        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
          {/* LEFT PANEL */}
          <div className="w-full lg:w-80 bg-white border-r border-slate-200 p-5 space-y-5 shrink-0">
            {/* Customer Profile Box */}
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {ticket.customer.fullName.charAt(0)}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-tight">
                      {ticket.customer.fullName}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Client ID: {ticket.customer.id.slice(0, 8)}
                    </span>
                  </div>
                </div>

                <a
                  href={`tel:${ticket.customer.phoneNumber}`}
                  className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-xs cursor-pointer transition-colors"
                  title="Call Customer"
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>

              <div className="text-xs text-slate-600 space-y-1 font-mono pt-1 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Mobile:</span>
                  <span className="font-bold text-slate-800">{ticket.customer.phoneNumber}</span>
                </div>
                {ticket.customer.email && (
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-sans">Email:</span>
                    <span className="truncate max-w-[170px] text-slate-700">{ticket.customer.email}</span>
                  </div>
                )}
                {ticket.customer.address && (
                  <div className="flex justify-between items-center text-[11px]">
                    <span className="text-slate-400 font-sans">Address:</span>
                    <span className="truncate max-w-[170px] text-slate-700">{ticket.customer.address}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Timelines Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Timelines & SLA
              </span>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Intake Time:</span>
                <span className="font-mono text-slate-800 font-semibold">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Promised Due:</span>
                <span className="font-mono text-indigo-700 font-bold">
                  {new Date(ticket.dueDate).toLocaleDateString()}
                </span>
              </div>
            </div>

            {/* Pricing Financial Ledger Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs font-mono">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-sans block mb-1">
                Pricing & Invoicing
              </span>

              <div className="flex justify-between text-slate-600">
                <span>Subtotal (Parts & Labor)</span>
                <span>${subtotal.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-red-600 font-semibold">
                <span>Discounts</span>
                <span>-${discount.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-emerald-700">
                <span>GST (8%)</span>
                <span>+${gst.toFixed(2)}</span>
              </div>

              <div className="flex justify-between text-emerald-700">
                <span>PST (5%)</span>
                <span>+${pst.toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-indigo-900">
                <span>Total</span>
                <span>${total.toFixed(2)}</span>
              </div>

              <div className="flex justify-between font-bold text-slate-800">
                <span>Paid</span>
                <span>${paid.toFixed(2)}</span>
              </div>

              <div className="flex justify-between font-extrabold text-sm pt-1 border-t border-dashed border-slate-200 text-slate-900">
                <span>Balance Owing</span>
                <span className={balanceOwing > 0 ? 'text-amber-600' : 'text-emerald-600'}>
                  ${balanceOwing.toFixed(2)}
                </span>
              </div>

              {balanceOwing > 0 && (
                <button
                  onClick={() => {
                    setPaymentAmount(balanceOwing.toFixed(2));
                    setIsPaymentModalOpen(true);
                  }}
                  className="w-full mt-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-sans text-xs font-semibold cursor-pointer"
                >
                  Collect ${balanceOwing.toFixed(2)}
                </button>
              )}
            </div>

            {/* Store Location */}
            <div className="text-xs text-slate-500 space-y-1">
              <div className="flex justify-between">
                <span>Device Store Location:</span>
                <span className="font-semibold text-slate-800">{ticket.benchNumber || 'Bench #04'}</span>
              </div>
              <div className="flex justify-between">
                <span>Storage Bin:</span>
                <span className="font-mono text-slate-800 font-semibold">Shelf B-12</span>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 p-5 space-y-6 overflow-y-auto">
            {/* Device Specification Box */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    Unit Specification
                  </span>
                  <span className="font-bold text-sm text-slate-900">
                    {ticket.deviceMakeModel}
                  </span>
                </div>

                <div className="text-xs font-mono text-slate-500">
                  IMEI/Serial: <span className="font-bold text-slate-800">{ticket.serialNumber || 'N/A'}</span>
                </div>
              </div>

              {/* Hardware & Security Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-3 text-xs">
                {/* 1. Device Security & Pattern Grid */}
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                      <Lock className="w-3 h-3 text-slate-400" /> Passcode / Pattern
                    </span>
                    <div className="flex items-center gap-1">
                      <input
                        type="text"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        placeholder="PIN e.g. 2580"
                        className="w-20 px-2 py-0.5 bg-white border border-slate-200 rounded font-mono text-xs text-center"
                      />
                      <button
                        type="button"
                        onClick={handleSaveSecurity}
                        disabled={isSavingSecurity}
                        className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-700 cursor-pointer"
                        title="Save PIN"
                      >
                        <Save className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* 3x3 Pattern Lock Grid */}
                  <div className="flex flex-col items-center justify-center pt-1">
                    <div className="grid grid-cols-3 gap-2.5 p-2 bg-white rounded-lg border border-slate-200">
                      {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((dot) => {
                        const isConnected = patternDots.includes(dot);
                        return (
                          <button
                            key={dot}
                            type="button"
                            onClick={() => togglePatternDot(dot)}
                            className={`w-4 h-4 rounded-full border transition-all cursor-pointer ${
                              isConnected
                                ? 'bg-indigo-600 border-indigo-600 scale-110 shadow-xs'
                                : 'bg-slate-200 border-slate-300 hover:bg-slate-300'
                            }`}
                            title={`Pattern Node ${dot}`}
                          />
                        );
                      })}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1">
                      {securitySaved ? '✅ Passcode Saved!' : 'Interactive Pattern Lock'}
                    </span>
                  </div>
                </div>

                {/* 2. Device Attributes */}
                <div className="space-y-2 text-slate-600">
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block">Reported Fault</label>
                    <p className="font-semibold text-slate-800 mt-0.5 leading-snug">{ticket.faultDescription}</p>
                  </div>
                  <div>
                    <label className="text-[10px] uppercase font-bold text-slate-400 block">Intake Conditions</label>
                    <p className="text-slate-700 text-[11px] mt-0.5">{ticket.device?.condition || 'No cosmetic defects logged'}</p>
                  </div>
                </div>

                {/* 3. Carrier & Warranty Status */}
                <div className="space-y-2 bg-slate-50 p-3 rounded-lg border border-slate-200 text-[11px]">
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Blacklist Status:</span>
                    <span className="font-bold text-emerald-700 bg-emerald-100/80 px-1.5 py-0.5 rounded">
                      CLEAN / WHITELISTED
                    </span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Carrier Lock:</span>
                    <span className="font-semibold text-slate-700">Factory Unlocked</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-slate-500">Warranty SLA:</span>
                    <span className="font-bold text-indigo-700 flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                      90-Day Guarantee
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* TABS */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="flex items-center gap-1 border-b border-slate-200 px-4 bg-slate-50/75 overflow-x-auto">
                <button
                  onClick={() => setActiveTab('customerNotes')}
                  className={`px-3 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === 'customerNotes'
                      ? 'border-indigo-600 text-indigo-700 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  CUSTOMER NOTES
                </button>
                <button
                  onClick={() => setActiveTab('internalNotes')}
                  className={`px-3 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === 'internalNotes'
                      ? 'border-indigo-600 text-indigo-700 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  INTERNAL BENCH NOTES
                </button>
                <button
                  onClick={() => setActiveTab('history')}
                  className={`px-3 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === 'history'
                      ? 'border-indigo-600 text-indigo-700 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  HANDLING HISTORY ({ticket.history?.length || 1})
                </button>
                <button
                  onClick={() => setActiveTab('inbox')}
                  className={`px-3 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === 'inbox'
                      ? 'border-indigo-600 text-indigo-700 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  UNIFIED SMS INBOX
                </button>
                <button
                  onClick={() => setActiveTab('diagnostics')}
                  className={`px-3 py-2.5 text-xs font-bold transition-all border-b-2 ${
                    activeTab === 'diagnostics'
                      ? 'border-indigo-600 text-indigo-700 bg-white'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  HARDWARE QA CHECKLIST
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 text-xs">
                {(activeTab === 'customerNotes' || activeTab === 'internalNotes') && (
                  <div className="space-y-4">
                    <form onSubmit={handleAddNote} className="flex gap-2">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder={`Add ${activeTab === 'customerNotes' ? 'customer-visible note' : 'private technician note'}...`}
                        className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingNote}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {isSubmittingNote ? 'Saving...' : 'Add Note'}
                      </button>
                    </form>

                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                          <th className="py-2 px-3">Technician</th>
                          <th className="py-2 px-3">Date / Time</th>
                          <th className="py-2 px-3">Note Description</th>
                          <th className="py-2 px-3 text-right">Channel</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ticket.history?.map((h) => (
                          <tr key={h.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-900">{h.changedBy}</td>
                            <td className="py-2 px-3 font-mono text-slate-500">
                              {new Date(h.createdAt).toLocaleDateString()} {new Date(h.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-2 px-3 text-slate-700">{h.note || 'Status update logged.'}</td>
                            <td className="py-2 px-3 text-right">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600">
                                {h.toStatus}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-3">
                    <div className="space-y-2">
                      {ticket.history?.map((item, idx) => (
                        <div key={item.id} className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                            {idx + 1}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-slate-900">
                                {item.fromStatus} &rarr; <span className="text-indigo-600">{item.toStatus}</span>
                              </span>
                              <span className="font-mono text-slate-400 text-[11px]">
                                {new Date(item.createdAt).toLocaleString()}
                              </span>
                            </div>
                            <p className="text-slate-600 text-[11px] mt-0.5">{item.note}</p>
                            <span className="text-[10px] text-slate-400 mt-1 block">Logged by {item.changedBy}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeTab === 'inbox' && (
                  <div className="space-y-4">
                    <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-bold text-slate-800 flex items-center gap-1.5">
                          <MessageSquare className="w-4 h-4 text-indigo-600" />
                          Live Mobile Thread with {ticket.customer.fullName} ({ticket.customer.phoneNumber})
                        </span>
                        {smsSuccess && (
                          <span className="text-emerald-600 font-bold text-[11px]">SMS Delivered</span>
                        )}
                      </div>

                      <form onSubmit={handleSendSms} className="space-y-2">
                        <textarea
                          rows={2}
                          value={smsText}
                          onChange={(e) => setSmsText(e.target.value)}
                          className="w-full p-2.5 bg-white border border-slate-200 rounded-lg text-xs font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                        />
                        <div className="flex justify-end">
                          <button
                            type="submit"
                            disabled={isSendingSms}
                            className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            <span>{isSendingSms ? 'Transmitting...' : 'Send Text to Customer'}</span>
                          </button>
                        </div>
                      </form>
                    </div>
                  </div>
                )}

                {activeTab === 'diagnostics' && (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {Object.entries(diagnostics).map(([key, value]) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() =>
                          setDiagnostics((prev) => ({ ...prev, [key]: !prev[key as keyof typeof prev] }))
                        }
                        className={`p-3 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
                          value
                            ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                            : 'bg-red-50 border-red-200 text-red-900'
                        }`}
                      >
                        <span className="capitalize font-semibold text-xs">
                          {key.replace(/([A-Z])/g, ' $1')}
                        </span>
                        <CheckCircle2 className={`w-4 h-4 ${value ? 'text-emerald-600' : 'text-slate-300'}`} />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM ITEMS & PARTS GRID */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Work Order Line Items (Parts & Labor)
                </h4>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setIsAddItemModalOpen(true)}
                    className="flex items-center gap-1 px-2.5 py-1 text-xs font-semibold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-lg cursor-pointer transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Attach Part / Labor</span>
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase">
                      <th className="py-2 px-3">System ID / SKU</th>
                      <th className="py-2 px-3">Description</th>
                      <th className="py-2 px-3">Status</th>
                      <th className="py-2 px-3">Grade</th>
                      <th className="py-2 px-3">Qty</th>
                      <th className="py-2 px-3">Unit Price</th>
                      <th className="py-2 px-3">Discount</th>
                      <th className="py-2 px-3 text-right">SubTotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Primary Intake Item */}
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                        WO-{ticket.ticketNumber.padStart(4, '0')}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {ticket.deviceMakeModel} Initial Diagnostic & Bench Triage
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Active Service
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-500">Shop Rate</td>
                      <td className="py-2.5 px-3 font-mono">1</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        ${ticket.price.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-red-600">
                        -${discount.toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                        ${taxableSubtotal.toFixed(2)}
                      </td>
                    </tr>

                    {/* Attached Parts from Database */}
                    {(ticket as any).partsUsed?.map((pu: any) => (
                      <tr key={pu.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                          {pu.part?.sku || 'CUSTOM'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {pu.customName || pu.part?.name}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                            Part Deducted from Stock
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">OEM Spec</td>
                        <td className="py-2.5 px-3 font-mono">{pu.quantity}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          ${(pu.unitSellInCents / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-400">$0.00</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                          ${((pu.unitSellInCents * pu.quantity) / 100).toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================
          ATTACH PART / INVENTORY ITEM MODAL
         ======================================================== */}
      {isAddItemModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                Attach Component to WO #{ticket.ticketNumber}
              </h3>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAttachPart} className="space-y-4 text-xs">
              {/* Select from Inventory */}
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Select from Live Inventory Catalog
                </label>
                <select
                  value={selectedPartId}
                  onChange={(e) => {
                    setSelectedPartId(e.target.value);
                    if (e.target.value) {
                      setCustomItemDesc('');
                      setCustomItemPrice('');
                    }
                  }}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                >
                  <option value="">-- Choose Stock Component --</option>
                  {availableParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} (${(p.retailInCents / 100).toFixed(2)}) — {p.stockQuantity} in stock
                    </option>
                  ))}
                </select>
              </div>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-2 text-[10px] text-slate-400 uppercase font-bold">OR Custom Labor / Part</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              {/* Custom item inputs */}
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Custom Labor Description
                  </label>
                  <input
                    type="text"
                    disabled={!!selectedPartId}
                    value={customItemDesc}
                    onChange={(e) => setCustomItemDesc(e.target.value)}
                    placeholder="e.g. Ultrasonic board cleaning"
                    className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs disabled:opacity-50"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    disabled={!!selectedPartId}
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    placeholder="45.00"
                    className="w-full px-2 py-1.5 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAttachingPart}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer"
                >
                  {isAttachingPart ? 'Attaching...' : 'Add Line Item'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          PAYMENT MODAL
         ======================================================== */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <CreditCard className="w-4 h-4 text-emerald-600" />
                Collect Payment for WO #{ticket.ticketNumber}
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Payment Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm font-bold font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Payment Method
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="CREDIT_CARD">Credit Card / POS Terminal</option>
                  <option value="DEBIT">Debit Card (Interac)</option>
                  <option value="CASH">Cash Drawer</option>
                  <option value="STRIPE">Stripe Link</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingPayment}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isRecordingPayment ? 'Recording...' : 'Authorize & Pay'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
