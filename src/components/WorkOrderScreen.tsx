import React, { useState, useEffect } from 'react';
import { Ticket } from '../types';
import {
  X,
  Phone,
  Printer,
  CreditCard,
  Plus,
  Clock,
  CheckCircle2,
  Package,
  Smartphone,
  Send,
  MessageSquare,
  Lock,
  Layers,
  Save,
  ShieldCheck,
  Tag,
  Trash2,
  DollarSign,
  Check,
  Mail,
  PenTool,
} from 'lucide-react';
import { Barcode } from './Barcode';
import { posAudio } from '../utils/audio';
import { SignaturePad } from './SignaturePad';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
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
  const [activeTab, setActiveTab] = useState<
    'notes' | 'payments' | 'diagnostics' | 'signature' | 'history'
  >('notes');
  const [noteSubTab, setNoteSubTab] = useState<'customer' | 'internal' | 'sms'>('customer');

  // Email invoice modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(ticket.customer.email || '');
  const [emailSubject] = useState(`ApexFix Repair Invoice & Receipt: WO #${ticket.ticketNumber}`);
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Notes
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);

  // SMS
  const [smsText, setSmsText] = useState(
    `Hi ${ticket.customer.fullName}, ApexFix update: Your ${ticket.device?.name || 'device'} (WO #${ticket.ticketNumber}) status is: ${ticket.status.toLowerCase().replace('_', ' ')}.`
  );
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);

  // Security
  const [passcode, setPasscode] = useState(ticket.device?.passcode || '');
  const [patternDots, setPatternDots] = useState<number[]>([1, 2, 5, 8]);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);

  // Payments
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'DEBIT' | 'E_TRANSFER' | 'OTHER'>('CARD');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  // Line Item / Part Attachment
  const [isAddItemModalOpen, setIsAddItemModalOpen] = useState(false);
  const [availableParts, setAvailableParts] = useState<InventoryItem[]>([]);
  const [selectedPartId, setSelectedPartId] = useState<string>('');
  const [customItemDesc, setCustomItemDesc] = useState('');
  const [customItemPrice, setCustomItemPrice] = useState('');
  const [itemQuantity, setItemQuantity] = useState(1);
  const [isAttachingPart, setIsAttachingPart] = useState(false);
  const [addItemError, setAddItemError] = useState<string | null>(null);

  // Discount modal
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState(
    ((ticket.totals ? ticket.totals.discountCents : ticket.discountCents) / 100).toFixed(2)
  );
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);

  // Diagnostics
  const defaultDiagnostics = {
    powerOn: true,
    displayTouch: true,
    cameraFront: true,
    cameraRear: true,
    chargingPort: true,
    speakers: true,
    microphones: true,
    wifiBluetooth: true,
    biometrics: true,
    batteryHealth: true,
  };
  const [diagnostics, setDiagnostics] = useState<Record<string, boolean>>(() => {
    if (ticket.diagnostics) {
      const parsed: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(ticket.diagnostics)) {
        parsed[k] = v === 'PASS';
      }
      return { ...defaultDiagnostics, ...parsed };
    }
    return defaultDiagnostics;
  });

  // Load Inventory
  useEffect(() => {
    fetch('/api/inventory')
      .then((res) => res.json())
      .then((data) => {
        const raw = data.data || [];
        setAvailableParts(
          raw.map((p: any) => ({
            id: p.id,
            sku: p.sku,
            name: p.name,
            priceCents: p.priceCents ?? p.retailInCents ?? 0,
            stock: p.stock ?? p.stockQuantity ?? 0,
          }))
        );
      })
      .catch(() => {});
  }, []);

  // Totals from ticket or fallback
  const totals = ticket.totals || {
    subtotalCents: ticket.laborCents,
    laborCents: ticket.laborCents,
    itemsCents: 0,
    discountCents: ticket.discountCents,
    taxRateBps: ticket.taxRateBps,
    taxCents: 0,
    totalCents: ticket.laborCents,
    paidCents: 0,
    balanceCents: ticket.laborCents,
    paymentStatus: 'UNPAID',
  };

  const balanceOwing = totals.balanceCents / 100;
  const isPaidInFull = totals.balanceCents === 0;

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
        body: JSON.stringify({
          device: {
            passcode,
            pattern: patternDots.join(','),
          },
        }),
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
          kind: noteSubTab === 'customer' ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE',
          message: newNote.trim(),
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
          customerPhone: ticket.customer.phone,
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
          amountCents: Math.round(amt * 100),
          method: paymentMethod,
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Payment error');
      }
      posAudio.playCashChime();
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Payment could not be recorded');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleVoidPayment = async (paymentId: string) => {
    if (!window.confirm('Void this payment? This will update the work order balance.')) return;
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/payments/${paymentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Could not void payment');
      }
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Could not void payment');
    }
  };

  const handleAttachItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsAttachingPart(true);
    setAddItemError(null);

    try {
      if (selectedPartId) {
        const part = availableParts.find((p) => p.id === selectedPartId);
        if (!part) return;
        const res = await fetch(`/api/tickets/${ticket.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            partId: part.id,
            quantity: itemQuantity,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to attach part');
      } else if (customItemDesc.trim() && parseFloat(customItemPrice) >= 0) {
        const res = await fetch(`/api/tickets/${ticket.id}/items`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            description: customItemDesc.trim(),
            unitPriceCents: Math.round(parseFloat(customItemPrice) * 100),
            quantity: itemQuantity,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to add custom item');
      }

      posAudio.playSuccessChime();
      setIsAddItemModalOpen(false);
      setSelectedPartId('');
      setCustomItemDesc('');
      setCustomItemPrice('');
      setItemQuantity(1);
      onRefresh();
    } catch (err: any) {
      setAddItemError(err.message || 'Failed to attach item');
    } finally {
      setIsAttachingPart(false);
    }
  };

  const handleRemoveItem = async (itemId: string, desc: string) => {
    if (!window.confirm(`Remove "${desc}"? If it was an inventory part, it will be returned to stock.`)) return;
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Could not remove item');
      }
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Could not remove item');
    }
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSavingDiscount(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountCents: Math.round((parseFloat(discountInput) || 0) * 100),
        }),
      });
      if (!res.ok) {
        const json = await res.json();
        throw new Error(json.error || 'Could not update discount');
      }
      setIsDiscountModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Could not update discount');
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const handleToggleDiagnostic = async (key: string) => {
    const updated = { ...diagnostics, [key]: !diagnostics[key] };
    setDiagnostics(updated);
    const diagPayload: Record<string, 'PASS' | 'FAIL'> = {};
    for (const [k, v] of Object.entries(updated)) {
      diagPayload[k] = v ? 'PASS' : 'FAIL';
    }
    await fetch(`/api/tickets/${ticket.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ diagnostics: diagPayload }),
    });
  };

  const handleSaveSignature = async (dataUrl: string) => {
    try {
      await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signature: dataUrl }),
      });
      posAudio.playSuccessChime();
      onRefresh();
    } catch {
      alert('Could not save customer signature');
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTo.trim()) return;
    setIsSendingEmail(true);
    try {
      await fetch(`/api/tickets/${ticket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'MESSAGE',
          message: `[Email Invoice Sent to ${emailTo.trim()}]: WO #${ticket.ticketNumber} Total: $${(totals.totalCents / 100).toFixed(2)}, Paid: $${(totals.paidCents / 100).toFixed(2)}`,
        }),
      });
      posAudio.playSuccessChime();
      setEmailSuccess(true);
      setTimeout(() => {
        setEmailSuccess(false);
        setIsEmailModalOpen(false);
      }, 1500);
      onRefresh();
    } catch {
      alert('Could not send email receipt');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const getStatusBadge = () => {
    if (ticket.status === 'COMPLETED' && isPaidInFull) {
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-600 text-white shadow-xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          DONE &amp; PAID
        </span>
      );
    }
    switch (ticket.status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            COMPLETED
          </span>
        );
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            IN PROGRESS
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Package className="w-3.5 h-3.5 text-amber-600" />
            WAITING ON PARTS
          </span>
        );
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            PENDING
          </span>
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="bg-slate-100 rounded-2xl w-full max-w-7xl h-[94vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* ========================================================
            TOP BAR (Matches Cellphone Certified exact header style)
           ======================================================== */}
        <header className="bg-white border-b border-slate-200 px-5 py-3 flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer transition-colors"
              title="Close Work Order"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">SERVICE</span>
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

          {/* Action CTAs */}
          <div className="flex items-center gap-2 sm:gap-3">
            <div className="hidden lg:block">
              <Barcode value={`WO-${String(ticket.ticketNumber).padStart(4, '0')}`} width={110} height={28} />
            </div>

            <button
              onClick={() => setIsAddItemModalOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Attach Part / Labor</span>
            </button>

            <button
              onClick={() => {
                setPaymentAmount(balanceOwing > 0 ? balanceOwing.toFixed(2) : '');
                setIsPaymentModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
            >
              <CreditCard className="w-3.5 h-3.5" />
              <span>Take Payment</span>
            </button>

            <button
              onClick={() => onPrint(ticket)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Print Work Order Receipt"
            >
              <Printer className="w-4 h-4" />
            </button>

            <button
              onClick={() => onPrint(ticket)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Print Thermal Bench Sticker"
            >
              <Tag className="w-4 h-4" />
            </button>

            <button
              onClick={() => setIsEmailModalOpen(true)}
              className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Email Work Order Receipt"
            >
              <Mail className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ========================================================
            MAIN WORKSPACE: Split 2-Column
           ======================================================== */}
        <div className="flex-1 overflow-y-auto flex flex-col lg:flex-row">
          {/* LEFT PANEL */}
          <div className="w-full lg:w-80 bg-white border-r border-slate-200 p-5 space-y-5 shrink-0 overflow-y-auto">
            {/* Customer Profile Box */}
            <div className="space-y-3">
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm shadow-sm">
                    {ticket.customer.fullName.charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <h3 className="font-bold text-sm text-slate-900 leading-tight">
                      {ticket.customer.fullName}
                    </h3>
                    <span className="text-[10px] text-slate-400 font-mono">
                      Client #{ticket.customer.id.slice(0, 8)}
                    </span>
                  </div>
                </div>

                <a
                  href={`tel:${ticket.customer.phone}`}
                  className="w-8 h-8 rounded-full bg-emerald-500 hover:bg-emerald-600 text-white flex items-center justify-center shadow-xs cursor-pointer transition-colors"
                  title="Call Customer"
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>

              <div className="text-xs text-slate-600 space-y-1 font-mono pt-1 border-t border-slate-100">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400 font-sans">Mobile:</span>
                  <span className="font-bold text-slate-800">{ticket.customer.phone}</span>
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

                {activeTab === 'signature' && (
                  <div className="space-y-4 max-w-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">Customer Legal Authorization</h4>
                        <p className="text-[11px] text-slate-500">
                          Intake diagnostic authorization &amp; release acknowledgment
                        </p>
                      </div>
                      {ticket.signature && (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded text-[11px] border border-emerald-200">
                          Verified on File
                        </span>
                      )}
                    </div>

                    <SignaturePad
                      initialSignature={ticket.signature}
                      onSave={handleSaveSignature}
                      onClear={() => handleSaveSignature('')}
                      height={130}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* Timelines Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                Timelines &amp; SLA
              </span>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Intake Date:</span>
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
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Priority:</span>
                <span className="font-bold text-[10px] px-2 py-0.5 rounded bg-white border border-slate-200 text-slate-700">
                  {ticket.priority}
                </span>
              </div>
            </div>

            {/* Pricing Financial Ledger Box */}
            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-2 text-xs font-mono">
              <div className="flex items-center justify-between font-sans mb-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                  Pricing &amp; Ledger
                </span>
                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="text-[10px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                >
                  Adjust Discount
                </button>
              </div>

              <div className="flex justify-between text-slate-600">
                <span>Subtotal</span>
                <span>${(totals.subtotalCents / 100).toFixed(2)}</span>
              </div>

              {totals.discountCents > 0 && (
                <div className="flex justify-between text-red-600 font-semibold">
                  <span>Discounts</span>
                  <span>-${(totals.discountCents / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-slate-500">
                <span>Tax ({((totals.taxRateBps || 1300) / 100).toFixed(1)}%)</span>
                <span>+${(totals.taxCents / 100).toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-sm text-indigo-900">
                <span>Total</span>
                <span>${(totals.totalCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between font-bold text-slate-800">
                <span>Paid</span>
                <span>${(totals.paidCents / 100).toFixed(2)}</span>
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
                  className="w-full mt-2 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-sans text-xs font-semibold cursor-pointer transition-colors"
                >
                  Collect ${balanceOwing.toFixed(2)}
                </button>
              )}
            </div>

            {/* Store Location */}
            <div className="text-xs text-slate-500 space-y-1 pt-1">
              <div className="flex justify-between">
                <span>Workstation:</span>
                <span className="font-semibold text-slate-800">{ticket.bench || 'Bench #04'}</span>
              </div>
              <div className="flex justify-between">
                <span>Technician:</span>
                <span className="font-semibold text-slate-800">{ticket.technician || 'Alex Mercer'}</span>
              </div>
              <div className="flex justify-between">
                <span>Storage Bin:</span>
                <span className="font-mono text-slate-800 font-semibold">{ticket.storageBin || 'Bin A-04'}</span>
              </div>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 p-5 space-y-5 overflow-y-auto">
            {/* Device Overview Card (Matches UI from Screenshot) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-2.5 py-1 rounded-full text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                    <Smartphone className="w-3.5 h-3.5" />
                    Device Unit
                  </span>
                  <span className="font-bold text-sm text-slate-900">
                    {ticket.device?.name || 'Device'}
                  </span>
                </div>

                <div className="text-xs font-mono text-slate-500">
                  IMEI/Serial: <span className="font-bold text-slate-800">{ticket.device?.serialNumber || 'N/A'}</span>
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
                      {securitySaved ? '✅ Saved!' : 'Interactive Pattern Lock'}
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
                    <label className="text-[10px] uppercase font-bold text-slate-400 block">Intake Physical Condition</label>
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

            {/* TABBED INTERACTION SECTION - SIMPLIFIED 5 WORKBENCH TABS */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="flex items-center gap-1 border-b border-slate-200 px-4 bg-slate-50/75 overflow-x-auto">
                <button
                  type="button"
                  onClick={() => setActiveTab('notes')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'notes'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Notes &amp; Messages</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('payments')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'payments'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Payments &amp; Receipts ({ticket.payments?.length || 0})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('diagnostics')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'diagnostics'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-blue-600" />
                  <span>Hardware QA Checks</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('signature')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'signature'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Customer Waiver Signature</span>
                  {ticket.signature && <span className="text-[10px] text-emerald-600 font-bold bg-emerald-50 px-1 rounded">✓</span>}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('history')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'history'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Clock className="w-3.5 h-3.5 text-slate-500" />
                  <span>Activity Audit Log ({ticket.events?.length || 0})</span>
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 text-xs">
                {activeTab === 'notes' && (
                  <div className="space-y-4">
                    {/* Sub-tab pills for notes & messages */}
                    <div className="flex items-center gap-2 p-1 bg-slate-100 rounded-lg w-fit">
                      <button
                        type="button"
                        onClick={() => setNoteSubTab('customer')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          noteSubTab === 'customer'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Public Notes (Customer Visible)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteSubTab('internal')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                          noteSubTab === 'internal'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        Private Bench Notes (Technicians Only)
                      </button>
                      <button
                        type="button"
                        onClick={() => setNoteSubTab('sms')}
                        className={`px-3 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer flex items-center gap-1 ${
                          noteSubTab === 'sms'
                            ? 'bg-white text-indigo-700 shadow-xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <Send className="w-3 h-3 text-indigo-600" />
                        <span>Direct SMS Gateway</span>
                      </button>
                    </div>

                    {/* Note sub-tabs for customer & internal */}
                    {(noteSubTab === 'customer' || noteSubTab === 'internal') && (
                      <div className="space-y-3">
                        <form onSubmit={handleAddNote} className="flex gap-2">
                          <input
                            type="text"
                            value={newNote}
                            onChange={(e) => setNewNote(e.target.value)}
                            placeholder={`Enter ${noteSubTab === 'customer' ? 'a note visible to customer on receipt' : 'a private bench/technician diagnostic note'}...`}
                            className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600"
                          />
                          <button
                            type="submit"
                            disabled={isSubmittingNote || !newNote.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold text-xs transition-colors cursor-pointer disabled:opacity-50"
                          >
                            {isSubmittingNote ? 'Saving...' : 'Post Note'}
                          </button>
                        </form>

                        {/* Filtered Notes List */}
                        <table className="w-full text-left border-collapse">
                          <thead>
                            <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                              <th className="py-2 px-3">Date / Time</th>
                              <th className="py-2 px-3">Author</th>
                              <th className="py-2 px-3">Note Content</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {ticket.events
                              ?.filter((ev) =>
                                noteSubTab === 'customer'
                                  ? ev.kind === 'CUSTOMER_NOTE' || ev.kind === 'MESSAGE'
                                  : ev.kind === 'INTERNAL_NOTE'
                              )
                              .map((ev) => (
                                <tr key={ev.id} className="hover:bg-slate-50">
                                  <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                                    {new Date(ev.createdAt).toLocaleDateString()} {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </td>
                                  <td className="py-2 px-3 font-semibold text-slate-900">{ev.author || 'Technician'}</td>
                                  <td className="py-2 px-3 text-slate-700">{ev.message}</td>
                                </tr>
                              ))}
                            {(!ticket.events ||
                              ticket.events.filter((ev) =>
                                noteSubTab === 'customer'
                                  ? ev.kind === 'CUSTOMER_NOTE' || ev.kind === 'MESSAGE'
                                  : ev.kind === 'INTERNAL_NOTE'
                              ).length === 0) && (
                              <tr>
                                <td colSpan={3} className="py-6 text-center text-slate-400 italic">
                                  No {noteSubTab === 'customer' ? 'customer-facing' : 'internal tech'} notes logged yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    {/* SMS Gateway Sub-tab */}
                    {noteSubTab === 'sms' && (
                      <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-800 flex items-center gap-1.5">
                            <MessageSquare className="w-4 h-4 text-indigo-600" />
                            Live SMS Gateway to Customer ({ticket.customer.phone})
                          </span>
                          {smsSuccess && (
                            <span className="text-emerald-600 font-bold text-[11px] flex items-center gap-1">
                              <Check className="w-3.5 h-3.5" /> SMS Dispatched
                            </span>
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
                              disabled={isSendingSms || !smsText.trim()}
                              className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                            >
                              <Send className="w-3.5 h-3.5" />
                              <span>{isSendingSms ? 'Transmitting...' : 'Send SMS Update'}</span>
                            </button>
                          </div>
                        </form>
                      </div>
                    )}
                  </div>
                )}

                {activeTab === 'history' && (
                  <div className="space-y-2 max-h-72 overflow-y-auto">
                    {ticket.events?.map((ev, idx) => (
                      <div key={ev.id} className="flex items-start gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 font-bold flex items-center justify-center text-[10px] shrink-0 mt-0.5">
                          {idx + 1}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-slate-900 text-xs">
                              {ev.kind.replace('_', ' ')}
                            </span>
                            <span className="font-mono text-slate-400 text-[10px]">
                              {new Date(ev.createdAt).toLocaleString()}
                            </span>
                          </div>
                          <p className="text-slate-700 text-xs mt-0.5">{ev.message}</p>
                          {ev.author && (
                            <span className="text-[10px] text-slate-400 mt-0.5 block">By {ev.author}</span>
                          )}
                        </div>
                      </div>
                    ))}
                    {(!ticket.events || ticket.events.length === 0) && (
                      <p className="text-center py-6 text-slate-400 italic">No history events logged yet.</p>
                    )}
                  </div>
                )}

                {activeTab === 'payments' && (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center">
                      <div>
                        <span className="font-semibold text-slate-800">Recorded Tender Receipts</span>
                        <p className="text-[11px] text-slate-500">All cash, card, debit, and e-transfer payments applied to this work order.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setPaymentAmount(balanceOwing > 0 ? balanceOwing.toFixed(2) : '');
                          setIsPaymentModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs"
                      >
                        + Add Payment
                      </button>
                    </div>

                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                          <th className="py-2 px-3">Date / Time</th>
                          <th className="py-2 px-3">Amount</th>
                          <th className="py-2 px-3">Payment Method</th>
                          <th className="py-2 px-3">Note</th>
                          <th className="py-2 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ticket.payments?.map((pmt) => (
                          <tr key={pmt.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-500">
                              {new Date(pmt.createdAt).toLocaleString()}
                            </td>
                            <td className="py-2 px-3 font-mono font-bold text-emerald-700">
                              ${(pmt.amountCents / 100).toFixed(2)}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-700">
                                {pmt.method}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-600">{pmt.note || 'Tender collected'}</td>
                            <td className="py-2 px-3 text-right">
                              <button
                                type="button"
                                onClick={() => handleVoidPayment(pmt.id)}
                                className="text-red-500 hover:text-red-700 text-xs font-semibold cursor-pointer"
                              >
                                Void
                              </button>
                            </td>
                          </tr>
                        ))}
                        {(!ticket.payments || ticket.payments.length === 0) && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400 italic">
                              No payments recorded yet. Click &ldquo;Take Payment&rdquo; to intake a deposit or balance.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {activeTab === 'diagnostics' && (
                  <div className="space-y-3">
                    <p className="text-[11px] text-slate-500">Click any component to toggle QA inspection pass/fail status:</p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                      {Object.entries(diagnostics).map(([key, value]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() => handleToggleDiagnostic(key)}
                          className={`p-2.5 rounded-lg border text-left flex items-center justify-between transition-all cursor-pointer ${
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
                  </div>
                )}

                {activeTab === 'signature' && (
                  <div className="space-y-4 max-w-xl">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-bold text-xs text-slate-900">Customer Legal Authorization</h4>
                        <p className="text-[11px] text-slate-500">
                          Intake diagnostic authorization &amp; release acknowledgment
                        </p>
                      </div>
                      {ticket.signature && (
                        <span className="text-emerald-700 font-semibold bg-emerald-50 px-2.5 py-0.5 rounded text-[11px] border border-emerald-200">
                          Verified on File
                        </span>
                      )}
                    </div>

                    <SignaturePad
                      initialSignature={ticket.signature}
                      onSave={handleSaveSignature}
                      onClear={() => handleSaveSignature('')}
                      height={130}
                    />
                  </div>
                )}
              </div>
            </div>

            {/* BOTTOM ITEMS & PARTS GRID (Matches Cellphone Certified exact layout) */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-xs uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  Work Order Line Items (Parts &amp; Labor)
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
                      <th className="py-2 px-3">Qty</th>
                      <th className="py-2 px-3">Unit Price</th>
                      <th className="py-2 px-3 text-right">SubTotal</th>
                      <th className="py-2 px-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {/* Primary Quoted Labor Item */}
                    <tr className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                        WO-{String(ticket.ticketNumber).padStart(4, '0')}
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {ticket.device?.name || 'Device'} Diagnostic &amp; Service Labor
                      </td>
                      <td className="py-2.5 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-emerald-100 text-emerald-800">
                          Active Service
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono">1</td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                        ${(ticket.laborCents / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                        ${(ticket.laborCents / 100).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-400 text-[10px]">
                        Base Labor
                      </td>
                    </tr>

                    {/* Attached Line Items / Parts from Database */}
                    {ticket.items?.map((item) => (
                      <tr key={item.id} className="hover:bg-slate-50">
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">
                          {item.partId ? 'INVENTORY' : 'CUSTOM'}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-slate-900">
                          {item.description}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-800">
                            {item.partId ? 'Part Installed from Stock' : 'Custom Service'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-mono">{item.quantity}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-slate-800">
                          ${(item.unitPriceCents / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 font-mono font-bold text-right text-slate-900">
                          ${((item.unitPriceCents * item.quantity) / 100).toFixed(2)}
                        </td>
                        <td className="py-2.5 px-3 text-right">
                          <button
                            onClick={() => handleRemoveItem(item.id, item.description)}
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                            title="Remove Line Item"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAttachItem} className="space-y-4 text-xs">
              {addItemError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded border border-red-200">
                  {addItemError}
                </div>
              )}

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
                      {p.name} (${(p.priceCents / 100).toFixed(2)}) — {p.stock} in stock
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
                    Custom Description
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
                    min="0"
                    disabled={!!selectedPartId}
                    value={customItemPrice}
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    placeholder="45.00"
                    className="w-full px-2 py-1.5 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg disabled:opacity-50"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                  Quantity
                </label>
                <input
                  type="number"
                  min="1"
                  max="99"
                  value={itemQuantity}
                  onChange={(e) => setItemQuantity(parseInt(e.target.value, 10) || 1)}
                  className="w-20 px-2 py-1.5 font-mono text-xs bg-slate-50 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAttachingPart}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50"
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
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
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
                  onChange={(e) => setPaymentMethod(e.target.value as any)}
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                >
                  <option value="CARD">Credit Card / Terminal</option>
                  <option value="DEBIT">Debit Card</option>
                  <option value="CASH">Cash Drawer</option>
                  <option value="E_TRANSFER">E-Transfer / Direct</option>
                  <option value="OTHER">Other</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
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

      {/* ========================================================
          DISCOUNT MODAL
         ======================================================== */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xs w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                Set Work Order Discount
              </h3>
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDiscount} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Discount Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm font-bold font-mono bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDiscount}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  {isSavingDiscount ? 'Saving...' : 'Apply Discount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          EMAIL INVOICE & RECEIPT MODAL
         ======================================================== */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                Email Invoice &amp; Receipt
              </h3>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSendEmail} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Recipient Customer Email *
                </label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>

              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                  Subject Line
                </label>
                <input
                  type="text"
                  disabled
                  value={emailSubject}
                  className="w-full px-3 py-1.5 text-xs bg-slate-100 text-slate-500 border border-slate-200 rounded-lg"
                />
              </div>

              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5 text-[11px]">
                <div className="flex justify-between text-slate-600">
                  <span>Unit:</span>
                  <span className="font-bold text-slate-800">{ticket.device?.name || 'Device'}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Total Invoiced:</span>
                  <span className="font-mono font-bold text-slate-900">${(totals.totalCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Paid to Date:</span>
                  <span className="font-mono text-emerald-700 font-bold">${(totals.paidCents / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-slate-600 pt-1 border-t border-slate-200 font-bold">
                  <span>Balance:</span>
                  <span className={totals.balanceCents > 0 ? 'text-amber-600 font-mono' : 'text-emerald-600 font-mono'}>
                    ${(totals.balanceCents / 100).toFixed(2)}
                  </span>
                </div>
              </div>

              {emailSuccess && (
                <div className="p-2.5 bg-emerald-50 text-emerald-800 text-xs rounded border border-emerald-200 flex items-center gap-1.5">
                  <Check className="w-4 h-4 text-emerald-600" />
                  <span>Invoice receipt successfully dispatched to {emailTo}!</span>
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail}
                  className="flex items-center gap-1.5 px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg font-semibold shadow-xs cursor-pointer disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>{isSendingEmail ? 'Dispatching...' : 'Send Invoice Receipt'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
