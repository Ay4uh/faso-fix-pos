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
  Trash2,
  DollarSign,
  Check,
  Mail,
  PenTool,
  Pencil,
} from 'lucide-react';
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
    'notes' | 'sms' | 'payments' | 'signature' | 'history'
  >('notes');

  // Email invoice modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(ticket.customer.email || '');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Notes
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [isDeletingNoteId, setIsDeletingNoteId] = useState<string | null>(null);

  // SMS
  const [smsText, setSmsText] = useState(
    `Hi ${ticket.customer.fullName}, ApexFix update: Your ${ticket.device?.name || 'device'} (WO #${ticket.ticketNumber}) status is: ${ticket.status.toLowerCase().replace('_', ' ')}.`
  );
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);

  // Security
  const [passcode, setPasscode] = useState(ticket.device?.passcode || '');
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

  const handleSaveSecurity = async () => {
    setIsSavingSecurity(true);
    try {
      await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: {
            passcode,
          },
        }),
      });
      setSecuritySaved(true);
      setTimeout(() => setSecuritySaved(false), 2000);
      onRefresh();
    } catch {
      alert('Failed to save device PIN');
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
          kind: 'INTERNAL_NOTE',
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

  const handleStartEditNote = (noteId: string, currentText: string) => {
    setEditingNoteId(noteId);
    setEditingNoteText(currentText);
  };

  const handleCancelEditNote = () => {
    setEditingNoteId(null);
    setEditingNoteText('');
  };

  const handleSaveEditNote = async (noteId: string) => {
    if (!editingNoteText.trim()) return;
    try {
      setIsUpdatingNote(true);
      const res = await fetch(`/api/tickets/${ticket.id}/notes/${noteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: editingNoteText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to update note');
      setEditingNoteId(null);
      setEditingNoteText('');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error updating note');
    } finally {
      setIsUpdatingNote(false);
    }
  };

  const handleDeleteNote = async (noteId: string) => {
    if (!window.confirm('Are you sure you want to delete this note?')) return;
    try {
      setIsDeletingNoteId(noteId);
      const res = await fetch(`/api/tickets/${ticket.id}/notes/${noteId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error('Failed to delete note');
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error deleting note');
    } finally {
      setIsDeletingNoteId(null);
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
    const amountVal = parseFloat(paymentAmount);
    if (!amountVal || amountVal <= 0) return;

    setIsRecordingPayment(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(amountVal * 100),
          method: paymentMethod,
          note: `Payment collected at checkout`,
        }),
      });
      if (!res.ok) throw new Error('Payment failed');
      posAudio.playCashChime();
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      onRefresh();
    } catch {
      alert('Could not process payment');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleAttachItem = async (e: React.FormEvent) => {
    e.preventDefault();
    setAddItemError(null);

    let desc = customItemDesc.trim();
    let unitPrice = Math.round(parseFloat(customItemPrice || '0') * 100);
    let partId: string | undefined = undefined;

    if (selectedPartId) {
      const p = availableParts.find((x) => x.id === selectedPartId);
      if (p) {
        desc = p.name;
        unitPrice = p.priceCents;
        partId = p.id;
      }
    }

    if (!desc) {
      setAddItemError('Please select a part or enter a description');
      return;
    }

    try {
      setIsAttachingPart(true);
      const res = await fetch(`/api/tickets/${ticket.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          partId,
          description: desc,
          quantity: itemQuantity,
          unitPriceCents: unitPrice,
          unitCostCents: 0,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || 'Failed to attach item');
      }

      posAudio.playScanBeep();
      setIsAddItemModalOpen(false);
      setSelectedPartId('');
      setCustomItemDesc('');
      setCustomItemPrice('');
      setItemQuantity(1);
      onRefresh();
    } catch (err: any) {
      setAddItemError(err.message || 'Error attaching line item');
    } finally {
      setIsAttachingPart(false);
    }
  };

  const handleRemoveItem = async (itemId: string, itemDesc: string) => {
    if (!window.confirm(`Remove "${itemDesc}" from work order?`)) return;

    try {
      await fetch(`/api/tickets/${ticket.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      onRefresh();
    } catch {
      alert('Could not remove line item');
    }
  };

  const handleSaveDiscount = async (e: React.FormEvent) => {
    e.preventDefault();
    const discountVal = parseFloat(discountInput);
    if (isNaN(discountVal) || discountVal < 0) {
      alert('Invalid discount amount');
      return;
    }

    setIsSavingDiscount(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountCents: Math.round(discountVal * 100),
        }),
      });
      if (!res.ok) throw new Error('Failed to apply discount');
      setIsDiscountModalOpen(false);
      onRefresh();
    } catch (err: any) {
      alert(err.message || 'Error updating discount');
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const handleSaveSignature = async (dataUrl: string) => {
    try {
      await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: dataUrl,
        }),
      });
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
            TOP BAR
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
              <span className="text-[11px] font-bold text-slate-400 tracking-wider">Service</span>
              <h1 className="text-base font-extrabold text-slate-900 font-mono flex items-center gap-2">
                WO #{ticket.ticketNumber}
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
          <div className="flex items-center gap-2">
            {balanceOwing > 0 ? (
              <button
                onClick={() => {
                  setPaymentAmount(balanceOwing.toFixed(2));
                  setIsPaymentModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer transition-colors"
              >
                <CreditCard className="w-3.5 h-3.5" />
                <span>Pay Balance (${balanceOwing.toFixed(2)})</span>
              </button>
            ) : (
              <span className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                Paid in Full
              </span>
            )}

            <button
              onClick={() => onPrint(ticket)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold shadow-xs transition-colors cursor-pointer"
              title="Print Receipt"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print</span>
            </button>

            <button
              onClick={() => setIsEmailModalOpen(true)}
              className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-slate-100 transition-colors cursor-pointer"
              title="Email Invoice"
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
              </div>
            </div>

            {/* Timelines Box */}
            <div className="bg-slate-50 rounded-xl p-3.5 space-y-2 text-xs">
              <span className="text-xs font-bold text-slate-800 block">
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

            {/* Pricing Financial Ledger Box (Strict right-alignment) */}
            <div className="bg-slate-50 rounded-xl p-4 space-y-2 text-xs">
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-bold text-slate-800">
                  Pricing &amp; Ledger
                </span>
                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="text-[11px] text-indigo-600 hover:underline font-semibold cursor-pointer"
                >
                  Adjust Discount
                </button>
              </div>

              <div className="flex justify-between items-center text-slate-600">
                <span>Subtotal (Pre-Tax)</span>
                <span className="font-mono font-medium tabular-nums text-right">${(totals.subtotalCents / 100).toFixed(2)}</span>
              </div>

              {totals.discountCents > 0 && (
                <div className="flex justify-between items-center text-rose-600 font-semibold">
                  <span>Discounts</span>
                  <span className="font-mono tabular-nums text-right">-${(totals.discountCents / 100).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between items-center text-slate-500">
                <span>HST ({((totals.taxRateBps || 1300) / 100).toFixed(1)}%)</span>
                <span className="font-mono tabular-nums text-right">+${(totals.taxCents / 100).toFixed(2)}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex justify-between items-center font-bold text-sm text-indigo-900">
                <span>Total (Inc. Tax)</span>
                <span className="font-mono font-bold tabular-nums text-right">${(totals.totalCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center font-bold text-slate-800">
                <span>Paid</span>
                <span className="font-mono tabular-nums text-right">${(totals.paidCents / 100).toFixed(2)}</span>
              </div>

              <div className="flex justify-between items-center font-extrabold text-sm pt-1 border-t border-dashed border-slate-200 text-slate-900">
                <span>Balance Owing</span>
                <span className={`font-mono tabular-nums text-right ${balanceOwing > 0 ? 'text-amber-600' : 'text-emerald-600'}`}>
                  ${balanceOwing.toFixed(2)}
                </span>
              </div>

              {balanceOwing > 0 && (
                <button
                  onClick={() => {
                    setPaymentAmount(balanceOwing.toFixed(2));
                    setIsPaymentModalOpen(true);
                  }}
                  className="w-full mt-2 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs"
                >
                  Collect ${balanceOwing.toFixed(2)}
                </button>
              )}
            </div>

            {/* Workstation Info */}
            <div className="text-xs text-slate-500 pt-2 border-t border-slate-100 flex items-center justify-between">
              <span>Station: <strong className="text-slate-800">{ticket.bench || 'Bench #01'}</strong></span>
              <span>Tech: <strong className="text-slate-800">{ticket.technician || 'Alex Mercer'}</strong></span>
            </div>
          </div>

          {/* RIGHT PANEL */}
          <div className="flex-1 p-5 space-y-5 overflow-y-auto">
            {/* 1. CONSOLIDATED INTAKE DETAILS PANEL (Minimalistic & High Contrast) */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-xs space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1.5">
                    <Smartphone className="w-3.5 h-3.5" />
                    {ticket.device?.name || 'Device'}
                  </span>
                  {ticket.device?.serialNumber && (
                    <span className="text-xs font-mono text-slate-500">
                      Serial: <strong className="text-slate-800">{ticket.device.serialNumber}</strong>
                    </span>
                  )}
                </div>

                {/* Subtle Passcode Micro-Action */}
                <div className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                  <Lock className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-xs text-slate-500 font-medium">PIN / Password:</span>
                  <input
                    type="text"
                    value={passcode}
                    onChange={(e) => setPasscode(e.target.value)}
                    onBlur={handleSaveSecurity}
                    placeholder="None"
                    className="w-24 px-1.5 py-0.5 bg-white border border-slate-200 rounded text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-indigo-600"
                  />
                  <button
                    type="button"
                    onClick={handleSaveSecurity}
                    disabled={isSavingSecurity}
                    className="p-1 text-slate-400 hover:text-emerald-600 rounded transition"
                    title="Save PIN"
                  >
                    {securitySaved ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Check className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              {/* Problem & Condition in clean, unboxed layout */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Reported Issue / Fault
                  </span>
                  <p className="font-semibold text-slate-900 text-sm leading-snug">
                    {ticket.faultDescription}
                  </p>
                </div>

                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Intake Cosmetic Condition
                  </span>
                  <p className="text-slate-700 text-xs font-medium">
                    {ticket.device?.condition || 'No cosmetic defects logged at intake'}
                  </p>
                </div>
              </div>
            </div>

            {/* 2. REALIGNED BILLING FLOW: WORK ORDER LINE ITEMS (Immediately adjacent) */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  <h4 className="font-bold text-sm text-slate-900">
                    Work Order Line Items (Parts &amp; Labor)
                  </h4>
                </div>
                {/* Prominent Primary CTA */}
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Attach Part / Labor</span>
                </button>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-bold text-slate-500 uppercase">
                      <th className="py-2.5 px-3">System ID / SKU</th>
                      <th className="py-2.5 px-3">Description</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3">Qty</th>
                      <th className="py-2.5 px-3">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 text-right">Action</th>
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
                            {item.partId ? 'Part Installed' : 'Custom Service'}
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
                            className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer transition"
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

            {/* 3. SIMPLIFIED WORKBENCH TABS (Public Notes removed, single-layer navigation) */}
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
                  <span>Bench Notes</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('sms')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'sms'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Send className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Customer SMS</span>
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
                  onClick={() => setActiveTab('signature')}
                  className={`px-3.5 py-2.5 text-xs font-bold transition-all border-b-2 whitespace-nowrap cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'signature'
                      ? 'border-indigo-600 text-indigo-700 bg-white shadow-xs'
                      : 'border-transparent text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <PenTool className="w-3.5 h-3.5 text-indigo-600" />
                  <span>Waiver Signature</span>
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
                  <span>Audit Log ({ticket.events?.length || 0})</span>
                </button>
              </div>

              {/* Tab Content */}
              <div className="p-4 text-xs">
                {/* 1. BENCH TECH NOTES */}
                {activeTab === 'notes' && (
                  <div className="space-y-3">
                    <form onSubmit={handleAddNote} className="flex gap-2">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder="Enter internal technician diagnostic note..."
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
                          <th className="py-2 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ticket.events
                          ?.filter((ev) => ev.kind === 'INTERNAL_NOTE' || ev.kind === 'CUSTOMER_NOTE')
                          .map((ev) => {
                            const isEditing = editingNoteId === ev.id;
                            return (
                              <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap align-top text-xs">
                                  {new Date(ev.createdAt).toLocaleDateString()} {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-2 px-3 font-semibold text-slate-900 align-top whitespace-nowrap text-xs">
                                  {ev.author || 'Technician'}
                                </td>
                                <td className="py-2 px-3 text-slate-700 text-xs">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={editingNoteText}
                                        onChange={(e) => setEditingNoteText(e.target.value)}
                                        className="flex-1 px-2.5 py-1 text-xs bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleSaveEditNote(ev.id);
                                          if (e.key === 'Escape') handleCancelEditNote();
                                        }}
                                      />
                                      <button
                                        type="button"
                                        onClick={() => handleSaveEditNote(ev.id)}
                                        disabled={isUpdatingNote || !editingNoteText.trim()}
                                        className="px-2 py-1 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 transition"
                                      >
                                        {isUpdatingNote ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelEditNote}
                                        className="px-2 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300 transition"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <span>{ev.message}</span>
                                  )}
                                </td>
                                <td className="py-2 px-3 text-right whitespace-nowrap align-top">
                                  {!isEditing && (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditNote(ev.id, ev.message)}
                                        className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 transition"
                                        title="Edit note"
                                      >
                                        <Pencil className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteNote(ev.id)}
                                        disabled={isDeletingNoteId === ev.id}
                                        className="p-1 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 transition"
                                        title="Delete note"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        {(!ticket.events ||
                          ticket.events.filter((ev) => ev.kind === 'INTERNAL_NOTE' || ev.kind === 'CUSTOMER_NOTE').length === 0) && (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400 italic text-xs">
                              No internal technician notes logged yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 2. DIRECT SMS GATEWAY */}
                {activeTab === 'sms' && (
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
                          <span>{isSendingSms ? 'Transmitting...' : 'Send SMS'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* 3. PAYMENTS & RECEIPTS */}
                {activeTab === 'payments' && (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">
                        Payment &amp; Transaction Ledger
                      </span>
                      {balanceOwing > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setPaymentAmount(balanceOwing.toFixed(2));
                            setIsPaymentModalOpen(true);
                          }}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs flex items-center gap-1.5 transition"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>Record Payment</span>
                        </button>
                      )}
                    </div>

                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                          <th className="py-2 px-3">Date</th>
                          <th className="py-2 px-3">Method</th>
                          <th className="py-2 px-3">Amount</th>
                          <th className="py-2 px-3">Note</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ticket.payments?.map((pmt) => (
                          <tr key={pmt.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap">
                              {new Date(pmt.createdAt).toLocaleDateString()}
                            </td>
                            <td className="py-2 px-3 font-semibold text-slate-900">{pmt.method}</td>
                            <td className="py-2 px-3 font-mono font-bold text-emerald-700">
                              +${(pmt.amountCents / 100).toFixed(2)}
                            </td>
                            <td className="py-2 px-3 text-slate-500">{pmt.note || 'N/A'}</td>
                          </tr>
                        ))}
                        {(!ticket.payments || ticket.payments.length === 0) && (
                          <tr>
                            <td colSpan={4} className="py-6 text-center text-slate-400 italic">
                              No payments recorded yet.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* 4. CUSTOMER SIGNATURE WAIVER */}
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

                {/* 5. AUDIT LOG */}
                {activeTab === 'history' && (
                  <div className="space-y-3">
                    <span className="font-bold text-xs text-slate-800">
                      Chronological Action History
                    </span>
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                          <th className="py-2 px-3">Timestamp</th>
                          <th className="py-2 px-3">Type</th>
                          <th className="py-2 px-3">Details</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ticket.events?.map((ev) => (
                          <tr key={ev.id} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-mono text-slate-500 whitespace-nowrap text-xs">
                              {new Date(ev.createdAt).toLocaleDateString()} {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </td>
                            <td className="py-2 px-3">
                              <span className="px-2 py-0.5 rounded font-mono text-[10px] font-bold bg-slate-100 text-slate-700">
                                {ev.kind}
                              </span>
                            </td>
                            <td className="py-2 px-3 text-slate-700 text-xs">{ev.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
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

            {addItemError && (
              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-lg font-medium">
                {addItemError}
              </div>
            )}

            <form onSubmit={handleAttachItem} className="space-y-3 text-xs">
              {/* Select from Inventory */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Select from Shop Inventory
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
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:border-indigo-600"
                >
                  <option value="">-- Choose in-stock component --</option>
                  {availableParts.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} - ${(p.priceCents / 100).toFixed(2)} ({p.stock} in stock)
                    </option>
                  ))}
                </select>
              </div>

              <div className="text-center font-bold text-slate-400 text-[10px]">OR CUSTOM ITEM</div>

              {/* Custom Description */}
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Custom Part / Labor Description
                </label>
                <input
                  type="text"
                  value={customItemDesc}
                  onChange={(e) => {
                    setCustomItemDesc(e.target.value);
                    if (e.target.value) setSelectedPartId('');
                  }}
                  placeholder="e.g. OEM Battery Adhesive Strip"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-600"
                />
              </div>

              {/* Price & Qty */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Price ($)
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    disabled={!!selectedPartId}
                    value={
                      selectedPartId
                        ? ((availableParts.find((x) => x.id === selectedPartId)?.priceCents || 0) / 100).toFixed(2)
                        : customItemPrice
                    }
                    onChange={(e) => setCustomItemPrice(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-600 disabled:opacity-60"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Quantity
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={itemQuantity}
                    onChange={(e) => setItemQuantity(parseInt(e.target.value) || 1)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAttachingPart}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isAttachingPart ? 'Saving...' : 'Add to Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          COLLECT PAYMENT MODAL
         ======================================================== */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
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
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Payment Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tender Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {(['CARD', 'CASH', 'DEBIT', 'E_TRANSFER'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition ${
                        paymentMethod === m
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {m.replace('_', ' ')}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingPayment}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isRecordingPayment ? 'Recording...' : 'Complete Payment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          ADJUST DISCOUNT MODAL
         ======================================================== */}
      {isDiscountModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Adjust Discount</h3>
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDiscount} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Discount Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={discountInput}
                  onChange={(e) => setDiscountInput(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDiscount}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSavingDiscount ? 'Saving...' : 'Apply Discount'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          EMAIL INVOICE MODAL
         ======================================================== */}
      {isEmailModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                Email Receipt to Customer
              </h3>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emailSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-700 text-xs rounded-lg font-bold flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Receipt sent successfully!
              </div>
            )}

            <form onSubmit={handleSendEmail} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Recipient Email
                </label>
                <input
                  type="email"
                  required
                  value={emailTo}
                  onChange={(e) => setEmailTo(e.target.value)}
                  placeholder="customer@example.com"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail || !emailTo.trim()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50"
                >
                  {isSendingEmail ? 'Sending...' : 'Transmit Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
