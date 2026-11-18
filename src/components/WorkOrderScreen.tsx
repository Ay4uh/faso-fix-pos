import React, { useState, useEffect } from 'react';
import { Ticket, User } from '../types';
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
  currentUser?: User | null;
  onClose: () => void;
  onUpdateStatus: (id: string, status: Ticket['status']) => Promise<void>;
  onRefresh: () => void;
  onPrint: (ticket: Ticket) => void;
  onTicketUpdated?: (ticket: Ticket) => void;
  onDeleteTicket?: (ticketId: string) => void;
}

export const WorkOrderScreen: React.FC<WorkOrderScreenProps> = ({
  ticket: initialTicket,
  currentUser,
  onClose,
  onUpdateStatus,
  onRefresh,
  onPrint,
  onTicketUpdated,
  onDeleteTicket,
}) => {
  const [ticket, setTicket] = useState<Ticket>(initialTicket);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    setTicket(initialTicket);
    setPasscode(initialTicket.device?.passcode || '');
    setDiscountInput(
      ((initialTicket.totals ? initialTicket.totals.discountCents : initialTicket.discountCents) / 100).toFixed(2)
    );
  }, [initialTicket]);

  const applyTicketUpdate = (freshTicket: Ticket) => {
    setTicket(freshTicket);
    if (onTicketUpdated) onTicketUpdated(freshTicket);
    onRefresh();
  };

  const [activeTab, setActiveTab] = useState<
    'notes' | 'sms' | 'payments' | 'signature' | 'history'
  >('notes');

  // Email invoice modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(ticket.customer.email || '');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Notes (Split-Note Architecture)
  const [newNote, setNewNote] = useState('');
  const [noteKind, setNoteKind] = useState<'INTERNAL_NOTE' | 'CUSTOMER_NOTE'>('INTERNAL_NOTE');
  const [noteFilter, setNoteFilter] = useState<'ALL' | 'INTERNAL_NOTE' | 'CUSTOMER_NOTE'>('ALL');
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

  // Payments & Deposits
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'DEBIT' | 'E_TRANSFER' | 'OTHER'>('CARD');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);

  const [isDepositModalOpen, setIsDepositModalOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState('50.00');
  const [depositMethod, setDepositMethod] = useState<'CASH' | 'CARD' | 'DEBIT' | 'E_TRANSFER'>('CARD');
  const [isRecordingDeposit, setIsRecordingDeposit] = useState(false);

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
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          device: {
            passcode,
          },
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) applyTicketUpdate(json.data);
      }
      setSecuritySaved(true);
      setTimeout(() => setSecuritySaved(false), 2000);
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
      const res = await fetch(`/api/tickets/${ticket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: noteKind,
          message: newNote.trim(),
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) applyTicketUpdate(json.data);
      }
      setNewNote('');
    } catch {
      alert('Failed to save note');
    } finally {
      setIsSubmittingNote(false);
    }
  };

  const handleRecordDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(depositAmount);
    if (!amountVal || amountVal <= 0) return;

    setIsRecordingDeposit(true);
    try {
      const res = await fetch(`/api/tickets/${ticket.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          amountCents: Math.round(amountVal * 100),
          method: depositMethod,
          note: 'Special-order part deposit',
        }),
      });
      if (!res.ok) throw new Error('Deposit failed');
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playCashChime();
      setIsDepositModalOpen(false);
      setDepositAmount('50.00');
    } catch {
      alert('Could not record part deposit');
    } finally {
      setIsRecordingDeposit(false);
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
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      setEditingNoteId(null);
      setEditingNoteText('');
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
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
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
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playCashChime();
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
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

      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playScanBeep();
      setIsAddItemModalOpen(false);
      setSelectedPartId('');
      setCustomItemDesc('');
      setCustomItemPrice('');
      setItemQuantity(1);
    } catch (err: any) {
      setAddItemError(err.message || 'Error attaching line item');
    } finally {
      setIsAttachingPart(false);
    }
  };

  const handleRemoveItem = async (itemId: string, itemDesc: string) => {
    if (!window.confirm(`Remove "${itemDesc}" from work order?`)) return;

    try {
      const res = await fetch(`/api/tickets/${ticket.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) applyTicketUpdate(json.data);
      }
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
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      setIsDiscountModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error updating discount');
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const handleSaveSignature = async (dataUrl: string) => {
    try {
      const res = await fetch(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signature: dataUrl,
        }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.data) applyTicketUpdate(json.data);
      }
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
            COMPLETED / PAID
          </span>
        );
      case 'READY_FOR_PICKUP':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-100 text-teal-800 border border-teal-300">
            READY FOR PICKUP
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Package className="w-3.5 h-3.5 text-amber-600" />
            WAITING ON PART
          </span>
        );
      case 'WAITING_ON_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-100 text-purple-800 border border-purple-300">
            WAITING ON APPROVAL
          </span>
        );
      case 'DIAGNOSING':
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            DIAGNOSING
          </span>
        );
      case 'CHECKED_IN':
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-300">
            CHECKED IN
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

            {/* Quick Status Dropdown (6-Stage Pipeline) */}
            <select
              value={ticket.status}
              onChange={async (e) => {
                const nextStatus = e.target.value as any;
                if (nextStatus === 'COMPLETED') posAudio.playSuccessChime();
                setTicket((prev) => ({ ...prev, status: nextStatus }));
                await onUpdateStatus(ticket.id, nextStatus);
                onRefresh();
              }}
              className="bg-slate-50 border border-slate-200 rounded-md text-xs font-bold px-2.5 py-1 text-slate-800 hover:bg-slate-100 cursor-pointer focus:outline-none"
            >
              <option value="CHECKED_IN">1. Checked In</option>
              <option value="DIAGNOSING">2. Diagnosing</option>
              <option value="WAITING_ON_APPROVAL">3. Waiting on Approval</option>
              <option value="WAITING_ON_PARTS">4. Waiting on Part</option>
              <option value="READY_FOR_PICKUP">5. Ready for Pickup</option>
              <option value="COMPLETED">6. Completed / Paid</option>
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

            {/* Admin-only Work Order Deletion */}
            {currentUser?.role === 'ADMIN' && onDeleteTicket && (
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                title="Delete Work Order (Admin Only)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
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

              {balanceOwing > 0 ? (
                <div className="space-y-1.5 pt-1">
                  <button
                    onClick={() => {
                      setPaymentAmount(balanceOwing.toFixed(2));
                      setIsPaymentModalOpen(true);
                    }}
                    className="w-full py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors shadow-xs flex items-center justify-center gap-1.5"
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Checkout &amp; Pay (${balanceOwing.toFixed(2)})</span>
                  </button>

                  <button
                    onClick={() => setIsDepositModalOpen(true)}
                    className="w-full py-1.5 bg-slate-200/80 hover:bg-slate-300 text-slate-800 rounded-lg text-xs font-semibold cursor-pointer transition-colors flex items-center justify-center gap-1.5"
                  >
                    <DollarSign className="w-3.5 h-3.5 text-indigo-600" />
                    <span>+ Take Part Deposit</span>
                  </button>
                </div>
              ) : (
                <div className="p-2 bg-emerald-50 border border-emerald-200 rounded-lg text-center text-xs font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Invoice Paid in Full</span>
                </div>
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

              {/* Fast 1-Click Common Labor Presets */}
              <div className="px-4 py-2 bg-slate-50 border-b border-slate-100 flex items-center gap-1.5 overflow-x-auto text-[11px]">
                <span className="font-bold text-slate-500 whitespace-nowrap mr-1">Fast Labor:</span>
                {[
                  { name: 'Screen Labor', price: 85 },
                  { name: 'Battery Replacement', price: 45 },
                  { name: 'Diagnostic Inspection', price: 35 },
                  { name: 'Thermal Paste / Clean', price: 25 },
                  { name: 'Port / Micro-Soldering', price: 95 },
                ].map((preset) => (
                  <button
                    key={preset.name}
                    type="button"
                    onClick={async () => {
                      try {
                        const res = await fetch(`/api/tickets/${ticket.id}/items`, {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            description: preset.name,
                            quantity: 1,
                            unitPriceCents: preset.price * 100,
                            unitCostCents: 0,
                          }),
                        });
                        if (res.ok) {
                          const json = await res.json();
                          if (json.data) applyTicketUpdate(json.data);
                          posAudio.playScanBeep();
                        }
                      } catch {
                        alert('Failed to attach labor');
                      }
                    }}
                    className="px-2.5 py-1 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-300 text-slate-700 hover:text-indigo-700 rounded-md font-semibold transition cursor-pointer whitespace-nowrap shadow-2xs"
                  >
                    + {preset.name} (${preset.price})
                  </button>
                ))}
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
                {/* 1. SPLIT-NOTE ARCHITECTURE (Private Bench vs Public Customer Notes) */}
                {activeTab === 'notes' && (
                  <div className="space-y-3.5">
                    {/* Note Type Selector & Audience Warning */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-2.5 bg-slate-50 border border-slate-200/90 rounded-xl">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setNoteKind('INTERNAL_NOTE')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            noteKind === 'INTERNAL_NOTE'
                              ? 'bg-amber-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Lock className="w-3.5 h-3.5" />
                          <span>Private Bench Note (Tech Only)</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setNoteKind('CUSTOMER_NOTE')}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition flex items-center gap-1.5 cursor-pointer ${
                            noteKind === 'CUSTOMER_NOTE'
                              ? 'bg-blue-600 text-white shadow-xs'
                              : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>Public Note (Prints on Receipt)</span>
                        </button>
                      </div>

                      <div className="text-[11px] font-medium text-slate-500">
                        {noteKind === 'INTERNAL_NOTE' ? (
                          <span className="text-amber-700 font-semibold flex items-center gap-1">
                            <Lock className="w-3 h-3" /> Confidential • Bench tech only • Never on receipt
                          </span>
                        ) : (
                          <span className="text-blue-700 font-semibold flex items-center gap-1">
                            <Printer className="w-3 h-3" /> Customer-facing • Appears on printed invoice
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Note Creation Form */}
                    <form onSubmit={handleAddNote} className="flex gap-2">
                      <input
                        type="text"
                        value={newNote}
                        onChange={(e) => setNewNote(e.target.value)}
                        placeholder={
                          noteKind === 'INTERNAL_NOTE'
                            ? "Enter tech notes (e.g. Screw stripped on bottom left, motherboard shield missing...)"
                            : "Enter public note for customer receipt (e.g. Replaced display assembly and tested functions OK)..."
                        }
                        className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-600 transition"
                      />
                      <button
                        type="submit"
                        disabled={isSubmittingNote || !newNote.trim()}
                        className={`px-4 py-2.5 text-white rounded-lg font-bold text-xs transition shadow-xs cursor-pointer disabled:opacity-50 flex items-center gap-1.5 ${
                          noteKind === 'INTERNAL_NOTE'
                            ? 'bg-amber-600 hover:bg-amber-700'
                            : 'bg-blue-600 hover:bg-blue-700'
                        }`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isSubmittingNote ? 'Saving...' : noteKind === 'INTERNAL_NOTE' ? 'Post Bench Note' : 'Post Public Note'}</span>
                      </button>
                    </form>

                    {/* Filter Pills */}
                    <div className="flex items-center justify-between pt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mr-1">View:</span>
                        {[
                          { id: 'ALL', label: 'All Notes' },
                          { id: 'INTERNAL_NOTE', label: 'Private Bench Only' },
                          { id: 'CUSTOMER_NOTE', label: 'Public Receipt Only' },
                        ].map((f) => (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setNoteFilter(f.id as any)}
                            className={`px-2.5 py-1 rounded text-xs font-semibold transition cursor-pointer ${
                              noteFilter === f.id
                                ? 'bg-slate-900 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {f.label}
                          </button>
                        ))}
                      </div>

                      <span className="text-[11px] text-slate-400 font-mono">
                        {ticket.events?.filter((ev) => ev.kind === 'INTERNAL_NOTE' || ev.kind === 'CUSTOMER_NOTE').length || 0} total entries
                      </span>
                    </div>

                    {/* Filtered Notes List */}
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="border-b border-slate-200 text-[11px] font-bold text-slate-400 uppercase">
                          <th className="py-2 px-3">Audience / Type</th>
                          <th className="py-2 px-3">Date / Time</th>
                          <th className="py-2 px-3">Author</th>
                          <th className="py-2 px-3">Note Content</th>
                          <th className="py-2 px-3 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ticket.events
                          ?.filter((ev) => {
                            if (ev.kind !== 'INTERNAL_NOTE' && ev.kind !== 'CUSTOMER_NOTE') return false;
                            if (noteFilter === 'ALL') return true;
                            return ev.kind === noteFilter;
                          })
                          .map((ev) => {
                            const isEditing = editingNoteId === ev.id;
                            const isPublic = ev.kind === 'CUSTOMER_NOTE';

                            return (
                              <tr key={ev.id} className="hover:bg-slate-50 transition-colors">
                                <td className="py-2 px-3 whitespace-nowrap align-top text-xs">
                                  {isPublic ? (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-blue-50 text-blue-800 border border-blue-200">
                                      <Printer className="w-3 h-3 text-blue-600" />
                                      Public Receipt
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                      <Lock className="w-3 h-3 text-amber-600" />
                                      Private Bench
                                    </span>
                                  )}
                                </td>
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
                          ticket.events.filter((ev) => {
                            if (ev.kind !== 'INTERNAL_NOTE' && ev.kind !== 'CUSTOMER_NOTE') return false;
                            if (noteFilter === 'ALL') return true;
                            return ev.kind === noteFilter;
                          }).length === 0) && (
                          <tr>
                            <td colSpan={5} className="py-6 text-center text-slate-400 italic text-xs">
                              No notes found matching this filter.
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
          ONE-CLICK PART DEPOSIT MODAL (Frictionless Invoicing)
         ======================================================== */}
      {isDepositModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-5 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                Collect Part Deposit (WO #{ticket.ticketNumber})
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1 rounded text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleRecordDeposit} className="space-y-3.5 text-xs">
              <p className="text-[11px] text-slate-500 leading-tight">
                Secure a non-refundable deposit before special-ordering supplier parts. Credited directly to balance due.
              </p>

              {/* Quick Preset Deposit Chips */}
              <div className="flex items-center gap-1.5">
                {['25.00', '50.00', '100.00', '150.00'].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setDepositAmount(amt)}
                    className={`flex-1 py-1 text-xs rounded-md border font-mono font-bold transition cursor-pointer ${
                      depositAmount === amt
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    ${amt.split('.')[0]}
                  </button>
                ))}
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Custom Deposit Amount ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={depositAmount}
                  onChange={(e) => setDepositAmount(e.target.value)}
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
                      onClick={() => setDepositMethod(m)}
                      className={`py-2 px-2.5 rounded-lg border text-xs font-semibold transition cursor-pointer ${
                        depositMethod === m
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
                  onClick={() => setIsDepositModalOpen(false)}
                  className="px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingDeposit}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition shadow-xs disabled:opacity-50 flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isRecordingDeposit ? 'Recording...' : `Collect $${depositAmount} Deposit`}</span>
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

      {/* Confirmation Modal for Admin Ticket Deletion */}
      {isDeleteConfirmOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full space-y-4 shadow-2xl border border-red-200">
            <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>
            <div className="text-center space-y-1">
              <h3 className="text-base font-bold text-slate-900">
                Delete Work Order #{ticket.ticketNumber}?
              </h3>
              <p className="text-xs text-slate-500">
                Only shop administrators are permitted to delete work orders. All attached items, payments, and diagnostics will be removed.
              </p>
            </div>
            <div className="flex items-center space-x-2 pt-2">
              <button
                type="button"
                onClick={() => setIsDeleteConfirmOpen(false)}
                className="flex-1 py-2 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  if (onDeleteTicket) onDeleteTicket(ticket.id);
                  setIsDeleteConfirmOpen(false);
                }}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 text-white rounded-xl text-xs font-bold cursor-pointer"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
