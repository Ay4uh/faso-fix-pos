import React, { useState, useEffect, useRef } from 'react';
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
  Pencil,
  Tag,
  Shield,
  RotateCcw,
  ChevronDown,
} from 'lucide-react';
import { posAudio } from '../utils/audio';
import { fetchWithAuth } from '../utils/auth';
import { printDeviceStickerLabel } from '../utils/receipt';
import {
  deriveTicketQuoteState,
  stripQuoteEventMeta,
  isTicketPaidInFull,
} from '../utils/repairPricing';
import { PatternLockModal, PatternLockPreview } from './PatternLockModal';
import { ConfirmDialog } from './ConfirmDialog';

interface InventoryItem {
  id: string;
  sku: string;
  name: string;
  priceCents: number;
  stock: number;
}

function getLocalDateOffset(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toLocalDateInputValue(val: string | Date | null | undefined): string {
  if (!val) return getLocalDateOffset(2);
  const d = val instanceof Date ? val : new Date(val);
  if (Number.isNaN(d.getTime())) return getLocalDateOffset(2);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

const WORK_ORDER_STATUS_OPTIONS = [
  { value: 'CHECKED_IN', label: '1. Checked In', dot: 'bg-slate-400' },
  { value: 'DIAGNOSING', label: '2. Diagnosing', dot: 'bg-blue-500' },
  { value: 'WAITING_ON_APPROVAL', label: '3. Waiting on Approval', dot: 'bg-purple-500' },
  { value: 'WAITING_ON_PARTS', label: '4. Waiting on Part', dot: 'bg-amber-500' },
  { value: 'READY_FOR_PICKUP', label: '5. Ready for Pickup', dot: 'bg-teal-500' },
  { value: 'COMPLETED', label: '6. Completed / Paid', dot: 'bg-emerald-500' },
  { value: 'DECLINED', label: '7. Declined', dot: 'bg-rose-500' },
  { value: 'CANCELLED', label: '8. Cancelled', dot: 'bg-slate-400' },
] as const;

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
  }, [initialTicket]);

  useEffect(() => {
    setPasscode(initialTicket.device?.passcode || '');
    setPattern(initialTicket.device?.pattern || '');
    setEmailTo(initialTicket.customer.email || '');
    setSmsText(
      `Hi ${initialTicket.customer.fullName}, Faso Fix update: Your ${initialTicket.device?.name || 'device'} (WO #${initialTicket.ticketNumber}) status is: ${initialTicket.status.toLowerCase().replace(/_/g, ' ')}.`
    );
    setDiscountInput(
      ((initialTicket.totals ? initialTicket.totals.discountCents : initialTicket.discountCents) / 100).toFixed(2)
    );
    setBaseLaborInput((initialTicket.laborCents / 100).toFixed(2));
    setIsEditingDueDate(false);
    setDueDateInput(toLocalDateInputValue(initialTicket.dueDate));
    setDueDateSaved(false);
    setIsStatusMenuOpen(false);
  }, [initialTicket.id]);

  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isStatusMenuOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (statusMenuRef.current && !statusMenuRef.current.contains(e.target as Node)) {
        setIsStatusMenuOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setIsStatusMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    window.addEventListener('keydown', handleEscape, true);
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      window.removeEventListener('keydown', handleEscape, true);
    };
  }, [isStatusMenuOpen]);

  // Promised Due Date inline editor
  const [isEditingDueDate, setIsEditingDueDate] = useState(false);
  const [dueDateInput, setDueDateInput] = useState(() => toLocalDateInputValue(initialTicket.dueDate));
  const [isSavingDueDate, setIsSavingDueDate] = useState(false);
  const [dueDateSaved, setDueDateSaved] = useState(false);

  useEffect(() => {
    if (!isEditingDueDate) {
      setDueDateInput(toLocalDateInputValue(ticket.dueDate));
    }
  }, [ticket.dueDate, isEditingDueDate]);

  const normalizedStatus =
    ticket.status === 'PENDING'
      ? 'CHECKED_IN'
      : ticket.status === 'IN_PROGRESS'
      ? 'DIAGNOSING'
      : ticket.status;
  const activeStatusOption =
    WORK_ORDER_STATUS_OPTIONS.find((opt) => opt.value === normalizedStatus) ||
    WORK_ORDER_STATUS_OPTIONS[0];

  const applyTicketUpdate = (freshTicket: Ticket) => {
    setTicket(freshTicket);
    if (onTicketUpdated) onTicketUpdated(freshTicket);
    onRefresh();
  };

  const [activeTab, setActiveTab] = useState<
    'customer_notes' | 'internal_notes' | 'history' | 'payments' | 'sms'
  >('customer_notes');

  // Email invoice modal
  const [isEmailModalOpen, setIsEmailModalOpen] = useState(false);
  const [emailTo, setEmailTo] = useState(ticket.customer.email || '');
  const [isSendingEmail, setIsSendingEmail] = useState(false);
  const [emailSuccess, setEmailSuccess] = useState(false);

  // Notes (Split-Note Tabs: CUSTOMER_NOTE & INTERNAL_NOTE)
  const [newNote, setNewNote] = useState('');
  const [isSubmittingNote, setIsSubmittingNote] = useState(false);
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [editingNoteText, setEditingNoteText] = useState('');
  const [isUpdatingNote, setIsUpdatingNote] = useState(false);
  const [isDeletingNoteId, setIsDeletingNoteId] = useState<string | null>(null);

  // SMS
  const [smsText, setSmsText] = useState(
    `Hi ${ticket.customer.fullName}, Faso Fix update: Your ${ticket.device?.name || 'device'} (WO #${ticket.ticketNumber}) status is: ${ticket.status.toLowerCase().replace(/_/g, ' ')}.`
  );
  const [isSendingSms, setIsSendingSms] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);

  // Security
  const [passcode, setPasscode] = useState(ticket.device?.passcode || '');
  const [pattern, setPattern] = useState(ticket.device?.pattern || '');
  const [isPatternModalOpen, setIsPatternModalOpen] = useState(false);
  const [isSavingSecurity, setIsSavingSecurity] = useState(false);
  const [securitySaved, setSecuritySaved] = useState(false);

  // Payments & Deposits
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'CASH' | 'CARD' | 'DEBIT' | 'E_TRANSFER' | 'TERMINAL' | 'OTHER'>('TERMINAL');
  const [isRecordingPayment, setIsRecordingPayment] = useState(false);
  const [terminalState, setTerminalState] = useState<'IDLE' | 'WAITING_CARD' | 'PROCESSING' | 'APPROVED'>('IDLE');
  const [terminalCardType, setTerminalCardType] = useState('VISA');
  const [terminalAuthCode, setTerminalAuthCode] = useState('');
  const [isVoidingPaymentId, setIsVoidingPaymentId] = useState<string | null>(null);
  const [paymentIdempotencyKey, setPaymentIdempotencyKey] = useState('');
  const [isTogglingWarranty, setIsTogglingWarranty] = useState(false);
  const [isRefunding, setIsRefunding] = useState(false);
  const [isRefundModalOpen, setIsRefundModalOpen] = useState(false);
  const [refundAmount, setRefundAmount] = useState('');
  const [refundReason, setRefundReason] = useState('Customer refund');
  const [refundError, setRefundError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<
    | { type: 'item'; itemId: string; itemDesc: string }
    | { type: 'note'; noteId: string; preview: string }
    | { type: 'payment'; paymentId: string; amountCents: number }
    | null
  >(null);
  const [isConfirmBusy, setIsConfirmBusy] = useState(false);
  const newPaymentKey = () => `pay-${ticket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

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

  // Discount & Base Labor modals + Edit Line Item modal
  const [isDiscountModalOpen, setIsDiscountModalOpen] = useState(false);
  const [discountInput, setDiscountInput] = useState(
    ((ticket.totals ? ticket.totals.discountCents : ticket.discountCents) / 100).toFixed(2)
  );
  const [isSavingDiscount, setIsSavingDiscount] = useState(false);
  const [isBaseLaborModalOpen, setIsBaseLaborModalOpen] = useState(false);
  const [baseLaborInput, setBaseLaborInput] = useState((ticket.laborCents / 100).toFixed(2));
  const [isSavingBaseLabor, setIsSavingBaseLabor] = useState(false);
  const [editingItem, setEditingItem] = useState<{
    id: string;
    partId?: string | null;
    description: string;
    quantity: number;
    unitPriceCents: number;
  } | null>(null);
  const [editItemDesc, setEditItemDesc] = useState('');
  const [editItemQty, setEditItemQty] = useState('1');
  const [editItemPrice, setEditItemPrice] = useState('0.00');
  const [isSavingEditItem, setIsSavingEditItem] = useState(false);
  const [editItemError, setEditItemError] = useState<string | null>(null);

  // Load Inventory
  useEffect(() => {
    fetchWithAuth('/api/inventory')
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
  const totalPaid = totals.paidCents / 100;
  const quoteState = ticket.quoteState ?? deriveTicketQuoteState(ticket, totals);
  const isPaidInFull = isTicketPaidInFull(totals, quoteState);
  const hasDepositCredit = !quoteState.hasPrice && totals.paidCents > 0;
  const canEditItems = ticket.status !== 'CANCELLED' && ticket.status !== 'DECLINED';

  const getErrorMessage = async (res: Response, fallback: string) => {
    const json = await res.json().catch(() => ({}));
    return json?.error || fallback;
  };

  const handleSaveSecurity = async (newPasscode = passcode, newPattern = pattern) => {
    setIsSavingSecurity(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          expectedUpdatedAt: ticket.updatedAt,
          device: {
            passcode: newPasscode,
            pattern: newPattern,
          },
        }),
      });
      if (res.status === 409) {
        onRefresh();
        throw new Error(await getErrorMessage(res, 'Conflict: Ticket changed elsewhere; refreshed latest data.'));
      }
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to save device security details'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      setSecuritySaved(true);
      setTimeout(() => setSecuritySaved(false), 2000);
    } catch (err: any) {
      alert(err?.message || 'Failed to save device security details');
    } finally {
      setIsSavingSecurity(false);
    }
  };

  const handleSaveDueDate = async (nextDateStr = dueDateInput) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nextDateStr)) return;
    setIsSavingDueDate(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dueDate: nextDateStr,
          expectedUpdatedAt: ticket.updatedAt,
        }),
      });
      if (res.status === 409) {
        onRefresh();
        throw new Error(await getErrorMessage(res, 'Conflict: Ticket changed elsewhere; refreshed latest data.'));
      }
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to update promised due date'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playSuccessChime();
      setIsEditingDueDate(false);
      setDueDateSaved(true);
      setTimeout(() => setDueDateSaved(false), 2000);
    } catch (err: any) {
      alert(err?.message || 'Failed to update promised due date');
    } finally {
      setIsSavingDueDate(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent, explicitKind?: 'CUSTOMER_NOTE' | 'INTERNAL_NOTE') => {
    e.preventDefault();
    if (!newNote.trim()) return;
    const targetKind = explicitKind || (activeTab === 'customer_notes' ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE');

    setIsSubmittingNote(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: targetKind,
          message: newNote.trim(),
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to save note'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      setNewNote('');
    } catch (err: any) {
      alert(err?.message || 'Failed to save note');
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
      const key = newPaymentKey();
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
        body: JSON.stringify({
          amountCents: Math.round(amountVal * 100),
          method: depositMethod,
          note: 'Special-order part deposit',
          idempotencyKey: key,
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Deposit failed'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playCashChime();
      setIsDepositModalOpen(false);
      setDepositAmount('50.00');
    } catch (err: any) {
      alert(err?.message || 'Could not record part deposit');
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
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/notes/${noteId}`, {
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

  const handleDeleteNote = (noteId: string, preview = '') => {
    setPendingConfirm({ type: 'note', noteId, preview });
  };

  const executeDeleteNote = async (noteId: string) => {
    try {
      setIsDeletingNoteId(noteId);
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/notes/${noteId}`, {
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
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: smsText.trim(),
          customerPhone: ticket.customer.phone,
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'SMS failed'));
      const json = await res.json().catch(() => ({}));
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playScanBeep();
      setSmsSuccess(true);
      setTimeout(() => setSmsSuccess(false), 3000);
    } catch (err: any) {
      alert(err?.message || 'Could not dispatch SMS');
    } finally {
      setIsSendingSms(false);
    }
  };

  const handleProcessTerminalPayment = async () => {
    const amountVal = parseFloat(paymentAmount);
    if (!amountVal || amountVal <= 0) return;

    setTerminalState('WAITING_CARD');
    setTimeout(() => {
      setTerminalState('PROCESSING');
      setTimeout(async () => {
        const authCode = `AUTH-${Math.floor(100000 + Math.random() * 900000)}`;
        const last4 = String(Math.floor(1000 + Math.random() * 9000));
        const aid = terminalCardType === 'INTERAC' ? 'A0000002771010' : 'A0000000031010';

        try {
          setIsRecordingPayment(true);
          const key = paymentIdempotencyKey || newPaymentKey();
          const res = await fetchWithAuth(`/api/tickets/${ticket.id}/payments`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
            body: JSON.stringify({
              amountCents: Math.round(amountVal * 100),
              method: 'CARD',
              note: `[Terminal EMV Tap] ${terminalCardType} •••• ${last4} | Auth: ${authCode} | AID: ${aid}`,
              idempotencyKey: key,
            }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok) {
            throw new Error(json.error || 'Terminal payment was declined or failed to record');
          }

          setTerminalAuthCode(authCode);
          setTerminalState('APPROVED');
          posAudio.playCashChime();
          if (json.data) applyTicketUpdate(json.data);

          setTimeout(() => {
            setIsPaymentModalOpen(false);
            setTerminalState('IDLE');
            setTerminalAuthCode('');
            setPaymentAmount('');
            setPaymentIdempotencyKey('');
          }, 1200);
        } catch (err: any) {
          posAudio.playWarningBeep();
          alert(err?.message || 'Could not record terminal payment');
          setTerminalState('IDLE');
        } finally {
          setIsRecordingPayment(false);
        }
      }, 1500);
    }, 1600);
  };

  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (paymentMethod === 'TERMINAL') {
      handleProcessTerminalPayment();
      return;
    }
    const amountVal = parseFloat(paymentAmount);
    if (!amountVal || amountVal <= 0) return;

    setIsRecordingPayment(true);
    try {
      const key = paymentIdempotencyKey || newPaymentKey();
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/payments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
        body: JSON.stringify({
          amountCents: Math.round(amountVal * 100),
          method: paymentMethod,
          note: `Payment collected at checkout`,
          idempotencyKey: key,
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Payment failed'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playCashChime();
      setIsPaymentModalOpen(false);
      setPaymentAmount('');
      setPaymentIdempotencyKey('');
    } catch (err: any) {
      alert(err?.message || 'Could not process payment');
    } finally {
      setIsRecordingPayment(false);
    }
  };

  const handleVoidPayment = (paymentId: string, amountCents: number) => {
    setPendingConfirm({ type: 'payment', paymentId, amountCents });
  };

  const executeVoidPayment = async (paymentId: string) => {
    try {
      setIsVoidingPaymentId(paymentId);
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/payments/${paymentId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Could not void payment'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playWarningBeep();
    } catch (err: any) {
      alert(err?.message || 'Could not void payment');
    } finally {
      setIsVoidingPaymentId(null);
    }
  };

  const handleIssueRefund = () => {
    const netPaidDollars = (totals.paidCents / 100).toFixed(2);
    setRefundAmount(netPaidDollars);
    setRefundReason('Customer refund');
    setRefundError(null);
    setIsRefundModalOpen(true);
  };

  const submitRefund = async (e: React.FormEvent) => {
    e.preventDefault();
    const amountVal = parseFloat(refundAmount);
    const maxDollars = totals.paidCents / 100;
    if (!amountVal || amountVal <= 0 || amountVal > maxDollars + 0.001) {
      setRefundError(`Enter a valid refund amount between $0.01 and $${maxDollars.toFixed(2)}`);
      return;
    }
    if (!refundReason.trim()) {
      setRefundError('Please enter a reason for the refund');
      return;
    }

    setIsRefunding(true);
    setRefundError(null);
    try {
      const key = `ref-${ticket.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/refund`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Idempotency-Key': key },
        body: JSON.stringify({
          amountCents: Math.round(amountVal * 100),
          method: 'CARD',
          reason: refundReason.trim(),
          idempotencyKey: key,
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Refund failed'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playWarningBeep();
      setIsRefundModalOpen(false);
    } catch (err: any) {
      setRefundError(err?.message || 'Could not process refund');
    } finally {
      setIsRefunding(false);
    }
  };

  const handleToggleWarranty = async () => {
    setIsTogglingWarranty(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isWarranty: !ticket.isWarranty,
          expectedUpdatedAt: ticket.updatedAt,
        }),
      });
      if (res.status === 409) {
        onRefresh();
        throw new Error(await getErrorMessage(res, 'Conflict: Ticket changed elsewhere; refreshed latest data.'));
      }
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to update warranty flag'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
    } catch (err: any) {
      alert(err?.message || 'Could not toggle warranty status');
    } finally {
      setIsTogglingWarranty(false);
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
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/items`, {
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

  const handleRemoveItem = (itemId: string, itemDesc: string) => {
    setPendingConfirm({ type: 'item', itemId, itemDesc });
  };

  const executeRemoveItem = async (itemId: string) => {
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/items/${itemId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Could not remove line item'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
    } catch (err: any) {
      alert(err?.message || 'Could not remove line item');
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
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          discountCents: Math.round(discountVal * 100),
          expectedUpdatedAt: ticket.updatedAt,
        }),
      });
      if (res.status === 409) {
        onRefresh();
        throw new Error(await getErrorMessage(res, 'Conflict: Ticket changed elsewhere; refreshed latest data.'));
      }
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to apply discount'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      setIsDiscountModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error updating discount');
    } finally {
      setIsSavingDiscount(false);
    }
  };

  const handleSaveBaseLabor = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(baseLaborInput || '0');
    if (isNaN(val) || val < 0) {
      alert('Enter a valid non-negative service price');
      return;
    }
    setIsSavingBaseLabor(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          laborCents: Math.round(val * 100),
          expectedUpdatedAt: ticket.updatedAt,
        }),
      });
      if (res.status === 409) {
        onRefresh();
        throw new Error(await getErrorMessage(res, 'Conflict: Ticket changed elsewhere; refreshed latest data.'));
      }
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Failed to update base quote'));
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playSuccessChime();
      setIsBaseLaborModalOpen(false);
    } catch (err: any) {
      alert(err.message || 'Error updating base quote');
    } finally {
      setIsSavingBaseLabor(false);
    }
  };

  const openEditItemModal = (item: {
    id: string;
    partId?: string | null;
    description: string;
    quantity: number;
    unitPriceCents: number;
  }) => {
    setEditItemError(null);
    setEditingItem(item);
    setEditItemDesc(item.description);
    setEditItemQty(String(item.quantity));
    setEditItemPrice((item.unitPriceCents / 100).toFixed(2));
  };

  const handleSaveEditItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem) return;
    setEditItemError(null);

    const desc = editItemDesc.trim();
    const qty = parseInt(editItemQty, 10);
    const parsedPrice = parseFloat(editItemPrice);

    if (!desc) {
      setEditItemError('Description is required');
      return;
    }
    if (!Number.isInteger(qty) || qty < 1) {
      setEditItemError('Quantity must be at least 1');
      return;
    }
    if (Number.isNaN(parsedPrice) || parsedPrice < 0) {
      setEditItemError('Enter a valid non-negative unit price');
      return;
    }

    setIsSavingEditItem(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/items/${editingItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: desc,
          quantity: qty,
          unitPriceCents: Math.round(parsedPrice * 100),
        }),
      });
      if (!res.ok) {
        throw new Error(await getErrorMessage(res, 'Failed to update line item'));
      }
      const json = await res.json();
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playSuccessChime();
      setEditingItem(null);
    } catch (err: any) {
      setEditItemError(err?.message || 'Error updating line item');
    } finally {
      setIsSavingEditItem(false);
    }
  };

  const handleSendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!emailTo.trim()) return;
    setIsSendingEmail(true);
    try {
      const res = await fetchWithAuth(`/api/tickets/${ticket.id}/notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'MESSAGE',
          message: `[Email Invoice Sent to ${emailTo.trim()}]: WO #${ticket.ticketNumber} Total: $${(totals.totalCents / 100).toFixed(2)}, Paid: $${(totals.paidCents / 100).toFixed(2)}`,
        }),
      });
      if (!res.ok) throw new Error(await getErrorMessage(res, 'Could not send email receipt'));
      const json = await res.json().catch(() => ({}));
      if (json.data) applyTicketUpdate(json.data);
      posAudio.playSuccessChime();
      setEmailSuccess(true);
      setTimeout(() => {
        setEmailSuccess(false);
        setIsEmailModalOpen(false);
      }, 1500);
    } catch (err: any) {
      alert(err?.message || 'Could not send email receipt');
    } finally {
      setIsSendingEmail(false);
    }
  };

  const getStatusBadge = () => {
    if (ticket.status === 'COMPLETED' && isPaidInFull) {
      return (
        <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-600 text-white shadow-xs">
          <CheckCircle2 className="w-3.5 h-3.5" />
          DONE &amp; PAID
        </span>
      );
    }
    switch (ticket.status) {
      case 'COMPLETED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            {isPaidInFull ? 'COMPLETED / PAID' : 'COMPLETED'}
          </span>
        );
      case 'DECLINED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 text-rose-800 border border-rose-300">
            DECLINED
          </span>
        );
      case 'CANCELLED':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-200 text-slate-600 border border-slate-300 line-through">
            CANCELLED
          </span>
        );
      case 'READY_FOR_PICKUP':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-teal-100 text-teal-800 border border-teal-300">
            READY FOR PICKUP
          </span>
        );
      case 'WAITING_ON_PARTS':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 text-amber-800 border border-amber-300">
            <Package className="w-3.5 h-3.5 text-amber-600" />
            WAITING ON PART
          </span>
        );
      case 'WAITING_ON_APPROVAL':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-purple-100 text-purple-800 border border-purple-300">
            WAITING ON APPROVAL
          </span>
        );
      case 'DIAGNOSING':
      case 'IN_PROGRESS':
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock className="w-3.5 h-3.5 text-blue-600" />
            DIAGNOSING
          </span>
        );
      case 'CHECKED_IN':
      case 'PENDING':
      default:
        return (
          <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-700 border border-slate-300">
            CHECKED IN
          </span>
        );
    }
  };

  const customerNotesCount = (ticket.events || []).filter((ev) => ev.kind === 'CUSTOMER_NOTE').length;
  const internalNotesCount = (ticket.events || []).filter((ev) => ev.kind === 'INTERNAL_NOTE').length;
  const activeNoteKind: 'CUSTOMER_NOTE' | 'INTERNAL_NOTE' =
    activeTab === 'customer_notes' ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE';
  const activeNoteRows = (ticket.events || []).filter((ev) => ev.kind === activeNoteKind);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-0 sm:p-2 lg:p-3 overflow-hidden ui-backdrop">
      <div className="bg-slate-100 rounded-none sm:rounded-2xl lg:rounded-3xl w-full max-w-[1920px] h-[100dvh] sm:h-[calc(100dvh-16px)] lg:h-[calc(100dvh-24px)] shadow-2xl border-0 sm:border border-slate-200 flex flex-col overflow-hidden ui-modal">
        {/* ========================================================
            ZONE A: COMPACT TOP WORKORDER STRIP
           ======================================================== */}
        <header className="relative z-30 bg-white border-b border-slate-200 px-4 sm:px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onClose}
              aria-label="Close Work Order"
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer ui-press shrink-0"
              title="Close Work Order"
            >
              <X className="w-4 h-4" />
            </button>

            <div className="flex items-center gap-2.5 min-w-0">
              <span className="hidden sm:inline text-[11px] font-bold uppercase tracking-wider text-slate-400">
                Service
              </span>
              <h1 className="text-xl sm:text-2xl font-extrabold tracking-tight text-slate-900 font-mono leading-none shrink-0">
                WO #{ticket.ticketNumber}
              </h1>
              {getStatusBadge()}
            </div>

            <div ref={statusMenuRef} className="relative inline-flex items-center shrink-0">
              <button
                type="button"
                aria-label="Work Order Status"
                aria-haspopup="listbox"
                aria-expanded={isStatusMenuOpen}
                onClick={() => setIsStatusMenuOpen((prev) => !prev)}
                className="h-9 inline-flex items-center justify-between gap-2 px-3.5 bg-white border border-slate-300 rounded-xl text-sm font-semibold text-slate-800 hover:bg-slate-50 hover:border-slate-400 cursor-pointer ui-press focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 whitespace-nowrap"
              >
                <span className="inline-flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full shrink-0 ${activeStatusOption.dot}`} />
                  <span className="truncate">{activeStatusOption.label}</span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-slate-400 shrink-0 transition-transform duration-200 ${
                    isStatusMenuOpen ? 'rotate-180 text-indigo-600' : ''
                  }`}
                />
              </button>

              {isStatusMenuOpen && (
                <div
                  role="listbox"
                  aria-label="Select Work Order Status"
                  className="absolute left-0 top-full mt-1.5 w-56 bg-white rounded-2xl shadow-xl border border-slate-200 py-1.5 z-50 ui-pop"
                >
                  {WORK_ORDER_STATUS_OPTIONS.map((opt) => {
                    const isSelected = opt.value === activeStatusOption.value;
                    return (
                      <button
                        key={opt.value}
                        type="button"
                        role="option"
                        aria-selected={isSelected}
                        onClick={async () => {
                          setIsStatusMenuOpen(false);
                          if (opt.value === normalizedStatus) return;
                          if (opt.value === 'COMPLETED') posAudio.playSuccessChime();
                          setTicket((prev) => ({ ...prev, status: opt.value as any }));
                          await onUpdateStatus(ticket.id, opt.value as any);
                          onRefresh();
                        }}
                        className={`w-full text-left px-3.5 py-2 text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-[background-color,transform] duration-150 hover:translate-x-0.5 ${
                          isSelected
                            ? 'bg-indigo-50/80 text-indigo-700'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <span className="inline-flex items-center gap-2.5 min-w-0">
                          <span className={`w-2 h-2 rounded-full shrink-0 ${opt.dot}`} />
                          <span className="truncate">{opt.label}</span>
                        </span>
                        {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <button
              type="button"
              disabled={!canEditItems}
              onClick={() => setIsAddItemModalOpen(true)}
              className="h-9 inline-flex items-center gap-1.5 px-3.5 bg-teal-600 hover:bg-teal-700 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold cursor-pointer ui-press ui-btn-glow group shadow-2xs shrink-0"
            >
              <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
              <span>Add Item</span>
            </button>

            <button
              type="button"
              disabled={isTogglingWarranty}
              onClick={handleToggleWarranty}
              className={`h-9 inline-flex items-center gap-1.5 px-3.5 rounded-xl text-sm font-semibold border ui-press cursor-pointer shrink-0 ${
                ticket.isWarranty
                  ? 'bg-blue-50 text-blue-700 border-blue-300'
                  : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
              }`}
              title="Toggle Warranty Coverage"
            >
              <Shield className="w-4 h-4" />
              <span className="hidden sm:inline">{ticket.isWarranty ? 'Warranty Repair' : 'Mark Warranty'}</span>
              <span className="sm:hidden">Warranty</span>
            </button>

            {ticket.createdBy && (
              <span className="hidden xl:inline text-sm text-slate-500 pl-2">
                Created by <strong className="font-semibold text-slate-700">{ticket.createdBy}</strong>
              </span>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isPaidInFull ? (
              <span className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full text-xs sm:text-sm font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Paid in Full
              </span>
            ) : hasDepositCredit ? (
              <span className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full text-xs sm:text-sm font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 tabular-nums">
                <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                Deposit Credited (${totalPaid.toFixed(2)})
              </span>
            ) : !quoteState.hasPrice ? (
              <span className="h-9 inline-flex items-center gap-1.5 px-3.5 rounded-full text-xs sm:text-sm font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                No Charges Yet
              </span>
            ) : null}

            <button
              onClick={() => printDeviceStickerLabel(ticket)}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-white hover:bg-slate-50 text-slate-700 rounded-xl text-sm font-semibold border border-slate-300 ui-press cursor-pointer"
              title="Print 2x1 Adhesive Device Label"
            >
              <Tag className="w-4 h-4 text-slate-500" />
              <span>Sticker</span>
            </button>

            <button
              onClick={() => onPrint(ticket)}
              className="h-9 flex items-center gap-1.5 px-3.5 bg-[#0f2942] hover:bg-slate-800 text-white rounded-xl text-sm font-semibold shadow-2xs ui-press cursor-pointer"
              title="Print Receipt"
            >
              <Printer className="w-4 h-4" />
              <span>Print</span>
            </button>

            <button
              onClick={() => setIsEmailModalOpen(true)}
              aria-label="Email Invoice"
              className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-600 hover:text-indigo-600 hover:bg-slate-50 ui-press cursor-pointer"
              title="Email Invoice"
            >
              <Mail className="w-4 h-4" />
            </button>

            {currentUser?.role === 'ADMIN' && onDeleteTicket && (
              <button
                onClick={() => setIsDeleteConfirmOpen(true)}
                aria-label="Delete Work Order"
                className="h-9 w-9 flex items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-600 hover:bg-red-50 hover:border-red-200 ui-press cursor-pointer"
                title="Delete Work Order (Admin Only)"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </header>

        {/* ========================================================
            MAIN WORKSPACE: Slim Left Rail + 3-Band Right Workbench
           ======================================================== */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden flex flex-col lg:flex-row">
          {/* ZONE B: SLIM ORGANIZED LEFT SIDEBAR */}
          <aside className="w-full lg:w-[300px] xl:w-[360px] 2xl:w-[400px] bg-white border-b lg:border-b-0 lg:border-r border-slate-200 shrink-0 lg:overflow-y-auto flex flex-col">
            {/* Customer Summary */}
            <div className="p-5 xl:p-6 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="text-xl xl:text-2xl font-extrabold text-slate-900 tracking-tight leading-tight truncate">
                    {ticket.customer.fullName}
                  </h3>
                  <div className="text-sm xl:text-base font-mono font-bold text-slate-700 tabular-nums mt-0.5">
                    {ticket.customer.phone}
                  </div>
                  <span className="text-xs text-slate-400 font-mono block mt-0.5">
                    Client #{ticket.customer.id.slice(0, 8)}
                  </span>
                </div>

                <a
                  href={`tel:${ticket.customer.phone}`}
                  className="w-10 h-10 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white flex items-center justify-center shadow-xs cursor-pointer transition-colors shrink-0"
                  title="Call Customer"
                >
                  <Phone className="w-4 h-4" />
                </a>
              </div>

              {(ticket.customer.altPhone || ticket.customer.email || ticket.customer.address) && (
                <div className="space-y-2 pt-2.5 border-t border-slate-100 text-[13px]">
                  {ticket.customer.altPhone && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs font-medium text-slate-400">Alt Phone</span>
                      <a
                        href={`tel:${ticket.customer.altPhone}`}
                        className="font-mono font-semibold text-indigo-600 hover:underline tabular-nums"
                      >
                        {ticket.customer.altPhone}
                      </a>
                    </div>
                  )}
                  {ticket.customer.email && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 shrink-0">Email</span>
                      <span className="truncate max-w-[200px] xl:max-w-[230px] text-slate-700">{ticket.customer.email}</span>
                    </div>
                  )}
                  {ticket.customer.address && (
                    <div className="flex justify-between items-center gap-2">
                      <span className="text-xs font-medium text-slate-400 shrink-0">Address</span>
                      <span className="truncate max-w-[200px] xl:max-w-[230px] text-slate-700">{ticket.customer.address}</span>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* TIMELINES Section Bar */}
            <div className="bg-slate-100/90 border-y border-slate-200/80 px-5 xl:px-6 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Timelines
            </div>
            <div className="p-5 xl:p-6 space-y-2.5 text-[13px] xl:text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">Intake Date</span>
                <span className="font-mono tabular-nums font-semibold text-slate-900">
                  {new Date(ticket.createdAt).toLocaleDateString()}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between items-center gap-2">
                  <span className="text-slate-500">Promised Due</span>
                  <div className="flex items-center gap-1.5">
                    {dueDateSaved && !isEditingDueDate && (
                      <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full ui-pop">
                        <Check className="w-2.5 h-2.5" /> Saved
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setDueDateInput(toLocalDateInputValue(ticket.dueDate));
                        setIsEditingDueDate((prev) => !prev);
                      }}
                      aria-label="Edit Promised Due Date"
                      title="Edit Promised Due Date"
                      className="inline-flex items-center gap-1.5 font-mono tabular-nums font-bold text-indigo-700 hover:text-indigo-900 bg-indigo-50/70 hover:bg-indigo-100/80 border border-indigo-200/80 px-2.5 py-0.5 rounded-lg cursor-pointer ui-press"
                    >
                      <span>{new Date(ticket.dueDate).toLocaleDateString()}</span>
                      <Pencil className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    </button>
                  </div>
                </div>

                {isEditingDueDate && (
                  <div className="p-2.5 bg-slate-50 border border-indigo-200 rounded-2xl space-y-2 ui-pop">
                    <input
                      type="date"
                      aria-label="Promised Due Date Input"
                      value={dueDateInput}
                      onChange={(e) => setDueDateInput(e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 focus:border-indigo-600"
                    />
                    <div className="flex flex-wrap gap-1">
                      {[
                        { label: 'Today', days: 0 },
                        { label: 'Tomorrow', days: 1 },
                        { label: '+2d', days: 2 },
                        { label: '+1w', days: 7 },
                      ].map((chip) => {
                        const target = getLocalDateOffset(chip.days);
                        const active = dueDateInput === target;
                        return (
                          <button
                            key={chip.label}
                            type="button"
                            onClick={() => setDueDateInput(target)}
                            className={`px-2.5 py-1 rounded-full text-[11px] font-bold border cursor-pointer ui-press ${
                              active
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white text-slate-700 border-slate-200 hover:bg-indigo-50 hover:border-indigo-200'
                            }`}
                          >
                            {chip.label}
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-end gap-1.5 pt-0.5">
                      <button
                        type="button"
                        disabled={isSavingDueDate}
                        onClick={() => {
                          setIsEditingDueDate(false);
                          setDueDateInput(toLocalDateInputValue(ticket.dueDate));
                        }}
                        className="px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-600 border border-slate-300 rounded-lg text-xs font-semibold cursor-pointer ui-press disabled:opacity-50"
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        disabled={isSavingDueDate || !/^\d{4}-\d{2}-\d{2}$/.test(dueDateInput)}
                        onClick={() => handleSaveDueDate(dueDateInput)}
                        className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold cursor-pointer ui-press disabled:opacity-50 inline-flex items-center gap-1"
                      >
                        <Check className="w-3 h-3" />
                        <span>{isSavingDueDate ? 'Saving...' : 'Save'}</span>
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500 shrink-0">Created By</span>
                <span
                  className="font-semibold text-slate-900 truncate max-w-[180px] xl:max-w-[210px] text-right"
                  title={ticket.createdBy || 'Unknown'}
                >
                  {ticket.createdBy || 'Unknown'}
                </span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">Priority</span>
                <span className="font-bold text-xs px-2.5 py-0.5 rounded-full bg-slate-100 border border-slate-200 text-slate-700">
                  {ticket.priority}
                </span>
              </div>
            </div>

            {/* PRICING Section Bar */}
            <div className="bg-slate-100/90 border-y border-slate-200/80 px-5 xl:px-6 py-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Pricing</span>
              {canEditItems && quoteState.hasPrice && (
                <button
                  onClick={() => setIsDiscountModalOpen(true)}
                  className="text-xs text-indigo-600 hover:underline font-semibold cursor-pointer"
                >
                  Adjust Discount
                </button>
              )}
            </div>
            <div className="p-5 xl:p-6 space-y-3.5">
              {!quoteState.hasPrice ? (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-amber-900 space-y-1">
                  <div className="font-bold text-[13px]">No Charges Added</div>
                  <p className="text-xs text-amber-800 leading-relaxed">
                    Add repair items or services on the right to calculate the final total.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Subtotal</span>
                    <span className="text-sm xl:text-[15px] font-mono tabular-nums font-medium text-right text-slate-800">
                      ${(totals.subtotalCents / 100).toFixed(2)}
                    </span>
                  </div>

                  {totals.discountCents > 0 && (
                    <div className="flex justify-between items-center text-rose-600 font-semibold">
                      <span>Discounts</span>
                      <span className="text-sm xl:text-[15px] font-mono tabular-nums text-right">
                        -${(totals.discountCents / 100).toFixed(2)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between items-center text-slate-500">
                    <span>HST ({((totals.taxRateBps || 1300) / 100).toFixed(1)}%)</span>
                    <span className="text-sm xl:text-[15px] font-mono tabular-nums text-right">
                      +${(totals.taxCents / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200 flex justify-between items-center">
                    <span className="font-bold text-slate-900 text-[15px]">Total</span>
                    <span className="font-mono tabular-nums font-bold text-base text-right text-slate-900">
                      ${(totals.totalCents / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="flex justify-between items-center text-slate-600">
                    <span>Paid</span>
                    <span className="font-mono tabular-nums font-semibold text-sm xl:text-[15px] text-right text-indigo-600">
                      ${(totals.paidCents / 100).toFixed(2)}
                    </span>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200 flex justify-between items-baseline gap-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                      Balance Owing
                    </span>
                    <span
                      className={`text-2xl xl:text-[26px] font-extrabold font-mono tabular-nums text-right tracking-tight ${
                        balanceOwing > 0 ? 'text-amber-600' : 'text-emerald-600'
                      }`}
                    >
                      ${balanceOwing.toFixed(2)}
                    </span>
                  </div>
                </div>
              )}

              {balanceOwing > 0 && canEditItems ? (
                <div className="space-y-2 pt-1">
                  <button
                    onClick={() => {
                      setPaymentAmount(balanceOwing.toFixed(2));
                      setPaymentIdempotencyKey(newPaymentKey());
                      setIsPaymentModalOpen(true);
                    }}
                    title="Collect remaining balance"
                    className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-sm font-bold cursor-pointer ui-press ui-btn-glow shadow-xs flex items-center justify-center gap-2 tabular-nums"
                  >
                    <CreditCard className="w-4 h-4" />
                    <span>Checkout &amp; Pay (${balanceOwing.toFixed(2)})</span>
                  </button>

                  <button
                    onClick={() => setIsDepositModalOpen(true)}
                    className="w-full py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 rounded-2xl text-[13px] font-semibold cursor-pointer ui-press flex items-center justify-center gap-1.5"
                  >
                    <DollarSign className="w-4 h-4 text-slate-500" />
                    <span>+ Take Part Deposit</span>
                  </button>
                </div>
              ) : isPaidInFull ? (
                <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-2xl text-center text-sm font-bold text-emerald-800 flex items-center justify-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Invoice Paid in Full</span>
                </div>
              ) : hasDepositCredit ? (
                <div className="p-2.5 bg-indigo-50 border border-indigo-200 rounded-2xl text-center text-sm font-bold text-indigo-800 flex items-center justify-center gap-1.5 tabular-nums">
                  <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                  <span>Deposit Credit: ${totalPaid.toFixed(2)}</span>
                </div>
              ) : null}
            </div>

            {/* ASSIGNMENT Section Bar */}
            <div className="bg-slate-100/90 border-y border-slate-200/80 px-5 xl:px-6 py-2 text-[11px] font-bold uppercase tracking-wider text-slate-500">
              Assignment
            </div>
            <div className="p-5 xl:p-6 space-y-2.5 text-[13px] xl:text-sm">
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">Workstation</span>
                <span className="font-semibold text-slate-900">{ticket.bench || 'Unassigned'}</span>
              </div>
              <div className="flex justify-between items-center gap-2">
                <span className="text-slate-500">Technician</span>
                <span className="font-semibold text-slate-900">{ticket.technician || 'Unassigned'}</span>
              </div>
            </div>
          </aside>

          {/* ZONE C: RIGHT WORKBENCH (3 Reference-Style Horizontal Bands) */}
          <div className="flex-1 flex flex-col lg:overflow-y-auto min-w-0 bg-white">
            {/* ========================================================
                BAND 1: TOP DEVICE, SECURITY & ISSUE STRIP
               ======================================================== */}
            <div className="bg-white border-b border-slate-200 p-4 lg:p-5 xl:p-6">
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 xl:gap-5 items-stretch">
                {/* Card 1: Consolidated Device & Security Card (with visible 3x3 Pattern Grid) */}
                <div className="lg:col-span-7 bg-white border border-slate-200 rounded-2xl p-3 xl:p-5 flex items-center justify-between gap-2.5 xl:gap-4">
                  <div className="min-w-0 flex-1 space-y-2.5">
                    <div>
                      <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                        Device
                      </span>
                      <div className="flex items-center gap-2.5 mt-1">
                        <span className="w-8 h-8 xl:w-9 xl:h-9 rounded-xl bg-indigo-50 border border-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
                          <Smartphone className="w-4 h-4 xl:w-5 xl:h-5" />
                        </span>
                        <div className="min-w-0">
                          <h2 className="text-base xl:text-xl font-bold text-slate-900 leading-tight truncate">
                            {ticket.device?.name || 'Device'}
                          </h2>
                          {ticket.device?.serialNumber && (
                            <span className="text-xs font-mono text-slate-500 block">
                              S/N: <strong className="font-semibold text-slate-700">{ticket.device.serialNumber}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 xl:gap-2 pt-1.5 xl:pt-2">
                      <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="text-[11px] xl:text-xs text-slate-500 font-medium whitespace-nowrap">PIN / Pass:</span>
                      <input
                        type="text"
                        value={passcode}
                        onChange={(e) => setPasscode(e.target.value)}
                        onBlur={() => handleSaveSecurity(passcode, pattern)}
                        placeholder="None"
                        className="w-20 sm:w-24 xl:w-44 px-2 xl:px-3 py-1 xl:py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs xl:text-sm font-mono font-semibold text-slate-800 focus:bg-white focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => handleSaveSecurity(passcode, pattern)}
                        disabled={isSavingSecurity}
                        className={`px-2.5 xl:px-3 py-1 xl:py-1.5 rounded-xl text-xs font-semibold border ui-press cursor-pointer inline-flex items-center gap-1 shrink-0 ${
                          securitySaved
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white border-emerald-600'
                        }`}
                        title="Save PIN"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Save</span>
                      </button>
                    </div>
                  </div>

                  {/* Visible 3x3 Interactive Pattern Lock Matrix */}
                  <button
                    type="button"
                    onClick={() => setIsPatternModalOpen(true)}
                    className={`shrink-0 p-2 xl:p-2.5 rounded-2xl border ui-press cursor-pointer flex flex-col items-center gap-1 xl:gap-1.5 ${
                      pattern
                        ? 'bg-purple-50/70 hover:bg-purple-100/70 border-purple-200'
                        : 'bg-slate-50 hover:bg-slate-100 border-slate-200'
                    }`}
                    title={pattern ? `Pattern: ${pattern} (click to edit)` : 'Record 3x3 unlock pattern'}
                  >
                    <PatternLockPreview pattern={pattern} size={50} />
                    <span className="text-[11px] font-bold font-mono text-slate-600">
                      {pattern ? pattern : '+ Pattern'}
                    </span>
                  </button>
                </div>

                {/* Card 2: Issue & Cosmetic Condition */}
                <div className="lg:col-span-5 bg-white border border-slate-200 rounded-2xl p-3 xl:p-5 flex flex-col justify-between gap-2.5 xl:gap-3">
                  <div>
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                      Reported Issue / Fault
                    </span>
                    <p className="text-sm xl:text-base font-semibold text-slate-900 leading-snug">
                      {ticket.faultDescription}
                    </p>
                  </div>

                  <div className="pt-2 xl:pt-2.5 border-t border-slate-100">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-0.5">
                      Cosmetic Condition
                    </span>
                    <p className="text-xs xl:text-sm text-slate-600 leading-snug">
                      {ticket.device?.condition || 'No cosmetic defects logged at intake'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* ========================================================
                BAND 2: DARK-NAVY WORKBENCH TAB BAR & CONTENT PANEL
               ======================================================== */}
            <div className="bg-white border-b border-slate-200">
              <div className="bg-[#0f2942] px-2 lg:px-2.5 xl:px-6 pt-1.5 flex flex-nowrap overflow-x-auto items-center gap-0.5 xl:gap-1">
                {[
                  { id: 'customer_notes', label: `Customer Notes (${customerNotesCount})` },
                  { id: 'internal_notes', label: `Internal Notes (${internalNotesCount})` },
                  { id: 'history', label: `Audit History (${ticket.events?.length || 0})` },
                  { id: 'payments', label: `Payments (${ticket.payments?.length || 0})` },
                  { id: 'sms', label: 'SMS' },
                ].map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id as typeof activeTab)}
                      className={`px-2 xl:px-4 py-2 xl:py-2.5 text-[10px] xl:text-xs font-bold uppercase tracking-normal xl:tracking-wide whitespace-nowrap shrink-0 transition-colors cursor-pointer rounded-t-xl tabular-nums ${
                        isActive
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-300 hover:text-white hover:bg-white/10'
                      }`}
                    >
                      {tab.label}
                    </button>
                  );
                })}
              </div>

              <div key={activeTab} className="p-4 lg:p-5 xl:p-6 ui-view-enter">
                {/* 1 & 2. UNIFIED CUSTOMER NOTES / INTERNAL NOTES PANEL */}
                {(activeTab === 'customer_notes' || activeTab === 'internal_notes') && (
                  <div className="space-y-3.5">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-base text-slate-900">
                          {activeNoteKind === 'CUSTOMER_NOTE' ? 'Customer Notes' : 'Internal Bench Notes'}
                        </span>
                        {activeNoteKind === 'CUSTOMER_NOTE' ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
                            <Printer className="w-3.5 h-3.5" /> Visible on printed receipt
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
                            <Lock className="w-3.5 h-3.5" /> Confidential &bull; Tech only (never prints)
                          </span>
                        )}
                      </div>

                      <form
                        onSubmit={(e) => handleAddNote(e, activeNoteKind)}
                        className="flex flex-1 md:max-w-xl xl:max-w-2xl gap-2.5"
                      >
                        <input
                          type="text"
                          value={newNote}
                          onChange={(e) => setNewNote(e.target.value)}
                          placeholder={
                            activeNoteKind === 'CUSTOMER_NOTE'
                              ? 'Add note visible on customer receipt...'
                              : 'Add confidential bench tech note...'
                          }
                          className="flex-1 px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                        />
                        <button
                          type="submit"
                          disabled={isSubmittingNote || !newNote.trim()}
                          className="px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl font-bold text-sm ui-press cursor-pointer disabled:opacity-45 inline-flex items-center gap-1.5 whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-4 h-4" />
                          <span>{isSubmittingNote ? 'Saving...' : 'Create'}</span>
                        </button>
                      </form>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Technician</th>
                            <th className="py-2.5 px-4">Date / Time</th>
                            <th className="py-2.5 px-4">Note</th>
                            <th className="py-2.5 px-4 text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody key={activeTab} className="divide-y divide-slate-100 ui-row-stagger">
                          {activeNoteRows.map((ev) => {
                            const isEditing = editingNoteId === ev.id;
                            return (
                              <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                                <td className="py-3 px-4 font-semibold text-slate-700 whitespace-nowrap text-[13px] align-top">
                                  {ev.author || 'Technician'}
                                </td>
                                <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap text-[13px] align-top">
                                  {new Date(ev.createdAt).toLocaleDateString()} {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </td>
                                <td className="py-3 px-4 text-slate-800 text-sm leading-relaxed">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <input
                                        type="text"
                                        value={editingNoteText}
                                        onChange={(e) => setEditingNoteText(e.target.value)}
                                        className="flex-1 px-2.5 py-1 text-sm bg-white border border-indigo-300 rounded focus:outline-none focus:ring-1 focus:ring-indigo-500"
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
                                        className="px-2.5 py-1 bg-indigo-600 text-white rounded text-xs font-semibold hover:bg-indigo-700 cursor-pointer"
                                      >
                                        {isUpdatingNote ? 'Saving...' : 'Save'}
                                      </button>
                                      <button
                                        type="button"
                                        onClick={handleCancelEditNote}
                                        className="px-2.5 py-1 bg-slate-200 text-slate-700 rounded text-xs font-medium hover:bg-slate-300 cursor-pointer"
                                      >
                                        Cancel
                                      </button>
                                    </div>
                                  ) : (
                                    <span>{ev.message}</span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                                  {!isEditing && (
                                    <div className="flex items-center justify-end gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() => handleStartEditNote(ev.id, ev.message)}
                                        className="p-1.5 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-100 cursor-pointer"
                                        title="Edit note"
                                      >
                                        <Pencil className="w-4 h-4" />
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteNote(ev.id, ev.message)}
                                        disabled={isDeletingNoteId === ev.id}
                                        className="p-1.5 text-slate-400 hover:text-rose-600 rounded hover:bg-slate-100 cursor-pointer"
                                        title="Delete note"
                                      >
                                        <Trash2 className="w-4 h-4" />
                                      </button>
                                    </div>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                          {activeNoteRows.length === 0 && (
                            <tr>
                              <td colSpan={4} className="py-7 text-center text-slate-400 italic text-sm">
                                {activeNoteKind === 'CUSTOMER_NOTE'
                                  ? 'No customer receipt notes recorded yet.'
                                  : 'No internal bench notes recorded yet.'}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 3. AUDIT HISTORY */}
                {activeTab === 'history' && (
                  <div className="space-y-3">
                    <span className="font-bold text-base text-slate-900 block">
                      Chronological Action History
                    </span>
                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Timestamp</th>
                            <th className="py-2.5 px-4">Type</th>
                            <th className="py-2.5 px-4">Author</th>
                            <th className="py-2.5 px-4">Details</th>
                          </tr>
                        </thead>
                        <tbody key={activeTab} className="divide-y divide-slate-100 ui-row-stagger">
                          {ticket.events?.map((ev) => (
                            <tr key={ev.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono tabular-nums text-slate-500 whitespace-nowrap text-[13px]">
                                {new Date(ev.createdAt).toLocaleDateString()} {new Date(ev.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                              </td>
                              <td className="py-3 px-4 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded font-mono text-[11px] font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                                  {ev.kind}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-[13px] font-medium text-slate-600 whitespace-nowrap">
                                {ev.author || 'System'}
                              </td>
                              <td className="py-3 px-4 text-slate-800 text-sm leading-relaxed">
                                {ev.kind === 'PHOTO'
                                  ? (() => {
                                      try {
                                        const meta = JSON.parse(ev.message);
                                        return `Photo uploaded: ${meta.filename}${meta.caption ? ` — ${meta.caption}` : ''}`;
                                      } catch {
                                        return 'Device photo attached';
                                      }
                                    })()
                                  : stripQuoteEventMeta(ev.message)}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 4. PAYMENTS & RECEIPTS */}
                {activeTab === 'payments' && (
                  <div className="space-y-3.5">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-bold text-base text-slate-900">
                        Payment &amp; Transaction Ledger
                      </span>
                      <div className="flex flex-wrap items-center gap-2">
                        {currentUser?.role === 'ADMIN' && totals.paidCents > 0 && (
                          <button
                            type="button"
                            disabled={isRefunding}
                            onClick={handleIssueRefund}
                            className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-md text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>{isRefunding ? 'Refunding...' : 'Issue Refund'}</span>
                          </button>
                        )}
                        {balanceOwing > 0 && canEditItems && (
                          <button
                            type="button"
                            onClick={() => {
                              setPaymentAmount(balanceOwing.toFixed(2));
                              setPaymentIdempotencyKey(newPaymentKey());
                              setIsPaymentModalOpen(true);
                            }}
                            className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-bold shadow-2xs flex items-center gap-1.5 transition-colors cursor-pointer"
                          >
                            <CreditCard className="w-3.5 h-3.5" />
                            <span>Record Payment</span>
                          </button>
                        )}
                      </div>
                    </div>

                    <div className="overflow-x-auto border border-slate-200 rounded-lg">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="bg-slate-100/90 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                            <th className="py-2.5 px-4">Date</th>
                            <th className="py-2.5 px-4">Method</th>
                            <th className="py-2.5 px-4 text-right">Amount</th>
                            <th className="py-2.5 px-4">Note</th>
                            <th className="py-2.5 px-4 text-right">Action</th>
                          </tr>
                        </thead>
                        <tbody key={activeTab} className="divide-y divide-slate-100 ui-row-stagger">
                          {ticket.payments?.map((pmt) => (
                            <tr key={pmt.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono tabular-nums text-[13px] text-slate-500 whitespace-nowrap">
                                {new Date(pmt.createdAt).toLocaleDateString()}
                              </td>
                              <td className="py-3 px-4 text-sm font-semibold text-slate-900">{pmt.method}</td>
                              <td className={`py-3 px-4 text-sm font-mono tabular-nums font-bold text-right whitespace-nowrap ${pmt.amountCents < 0 ? 'text-rose-600' : 'text-emerald-700'}`}>
                                {pmt.amountCents < 0 ? `-$${(Math.abs(pmt.amountCents) / 100).toFixed(2)}` : `+$${(pmt.amountCents / 100).toFixed(2)}`}
                              </td>
                              <td className="py-3 px-4 text-sm text-slate-600">{pmt.note || 'N/A'}</td>
                              <td className="py-3 px-4 text-right whitespace-nowrap">
                                {currentUser?.role === 'ADMIN' && (
                                  <button
                                    type="button"
                                    disabled={isVoidingPaymentId === pmt.id}
                                    onClick={() => handleVoidPayment(pmt.id, pmt.amountCents)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded cursor-pointer disabled:opacity-40"
                                    title="Void Payment (Admin Only)"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>{isVoidingPaymentId === pmt.id ? 'Voiding...' : 'Void'}</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                          {(!ticket.payments || ticket.payments.length === 0) && (
                            <tr>
                              <td colSpan={5} className="py-7 text-center text-slate-400 italic text-sm">
                                No payments recorded yet.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 5. DIRECT SMS GATEWAY */}
                {activeTab === 'sms' && (
                  <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-base text-slate-900 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-indigo-600" />
                        Send SMS to Customer ({ticket.customer.phone})
                      </span>
                      {smsSuccess && (
                        <span className="text-emerald-600 font-bold text-xs flex items-center gap-1">
                          <Check className="w-3.5 h-3.5" /> SMS Dispatched
                        </span>
                      )}
                    </div>

                    <form onSubmit={handleSendSms} className="space-y-3">
                      <textarea
                        rows={2}
                        value={smsText}
                        onChange={(e) => setSmsText(e.target.value)}
                        className="w-full p-3 bg-white border border-slate-200 rounded-md text-sm font-sans text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                      <div className="flex justify-end">
                        <button
                          type="submit"
                          disabled={isSendingSms || !smsText.trim()}
                          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-sm font-bold shadow-2xs cursor-pointer disabled:opacity-50"
                        >
                          <Send className="w-4 h-4" />
                          <span>{isSendingSms ? 'Transmitting...' : 'Send SMS'}</span>
                        </button>
                      </div>
                    </form>
                  </div>
                )}
              </div>
            </div>

            {/* ========================================================
                BAND 3: ITEMS WORKBENCH
               ======================================================== */}
            <div className="bg-white flex-1">
              <div className="bg-slate-100/90 border-b border-slate-200 px-4 lg:px-5 xl:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-slate-600" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-600">
                    Items ({(ticket.items?.length || 0) + (ticket.laborCents > 0 ? 1 : 0)})
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    disabled={!canEditItems}
                    onClick={() => setIsAddItemModalOpen(true)}
                    className="flex items-center gap-1.5 px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-45 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold shadow-2xs ui-press ui-btn-glow group cursor-pointer"
                  >
                    <Plus className="w-4 h-4 transition-transform duration-200 group-hover:rotate-90" />
                    <span>Attach Part / Labor</span>
                  </button>
                </div>
              </div>

              {/* Full-Width Work Order Line Items Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-100/80 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5">System ID</th>
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5">Description</th>
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5">Status</th>
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5 text-right">Qty</th>
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5 text-right">Subtotal</th>
                      <th className="py-2.5 px-3 xl:py-3 xl:px-5 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 ui-row-stagger">
                    {ticket.laborCents > 0 && (
                      <tr className="hover:bg-indigo-50/40 transition-colors duration-150">
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 whitespace-nowrap">
                          <span className="px-2 xl:px-2.5 py-1 rounded-lg bg-sky-600 text-white font-mono text-xs font-bold">
                            WO-{String(ticket.ticketNumber).padStart(4, '0')}
                          </span>
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-semibold text-slate-900">
                          {ticket.device?.name || 'Device'} Diagnostic &amp; Service Labor
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 whitespace-nowrap">
                          <span className="px-2 xl:px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
                            Base Labor
                          </span>
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-mono tabular-nums text-right text-slate-700">1</td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-mono tabular-nums text-right font-semibold text-emerald-700 whitespace-nowrap">
                          ${(ticket.laborCents / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-mono tabular-nums font-bold text-right text-slate-900 whitespace-nowrap">
                          ${(ticket.laborCents / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-right whitespace-nowrap">
                          <button
                            type="button"
                            disabled={!canEditItems}
                            onClick={() => {
                              setBaseLaborInput((ticket.laborCents / 100).toFixed(2));
                              setIsBaseLaborModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-35 disabled:cursor-not-allowed rounded-xl ui-press cursor-pointer"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>Edit</span>
                          </button>
                        </td>
                      </tr>
                    )}

                    {ticket.items?.map((item) => (
                      <tr key={item.id} className="hover:bg-indigo-50/40 transition-colors duration-150">
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 whitespace-nowrap">
                          <span
                            className={`px-2 xl:px-2.5 py-1 rounded-lg font-mono text-xs font-bold ${
                              item.partId
                                ? 'bg-sky-600 text-white'
                                : 'bg-indigo-600 text-white'
                            }`}
                          >
                            {item.partId ? 'INVENTORY' : 'SERVICE'}
                          </span>
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-semibold text-slate-900">
                          {item.description}
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 whitespace-nowrap">
                          <span className="px-2 xl:px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200">
                            {item.partId ? 'Part Installed' : 'Service'}
                          </span>
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-mono tabular-nums text-right text-slate-700">
                          {item.quantity}
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-mono tabular-nums text-right font-semibold text-emerald-700 whitespace-nowrap">
                          ${(item.unitPriceCents / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-sm xl:text-[15px] font-mono tabular-nums font-bold text-right text-slate-900 whitespace-nowrap">
                          ${((item.unitPriceCents * item.quantity) / 100).toFixed(2)}
                        </td>
                        <td className="py-3 px-3 xl:py-3.5 xl:px-5 text-right whitespace-nowrap">
                          <div className="inline-flex items-center justify-end gap-1.5 xl:gap-2">
                            <button
                              type="button"
                              disabled={!canEditItems}
                              onClick={() => openEditItemModal(item)}
                              className="inline-flex items-center gap-1.5 px-2.5 xl:px-3 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-35 disabled:cursor-not-allowed rounded-xl ui-press cursor-pointer"
                              title="Edit Line Item"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                              <span>Edit</span>
                            </button>
                            <button
                              type="button"
                              disabled={!canEditItems}
                              onClick={() => handleRemoveItem(item.id, item.description)}
                              className="p-1.5 xl:p-2 text-rose-500 hover:text-rose-700 hover:bg-rose-50 disabled:opacity-35 disabled:cursor-not-allowed rounded-xl ui-press cursor-pointer"
                              title="Remove Line Item"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}

                    {ticket.laborCents === 0 && (!ticket.items || ticket.items.length === 0) && (
                      <tr>
                        <td colSpan={7} className="py-10 px-5 text-center text-sm text-slate-400 italic">
                          No repair items or services added yet. Click + Attach Part / Labor to add a line item.
                        </td>
                      </tr>
                    )}
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
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                Attach Component to WO #{ticket.ticketNumber}
              </h3>
              <button
                onClick={() => setIsAddItemModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {addItemError && (
              <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-xl font-medium">
                {addItemError}
              </div>
            )}

            <form onSubmit={handleAttachItem} className="space-y-3 text-xs">
              {/* Select from Inventory (only shown when inventory parts exist) */}
              {availableParts.length > 0 && (
                <>
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
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-indigo-600"
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
                </>
              )}

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
                  placeholder="Part or service description"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-600"
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-600 disabled:opacity-60"
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
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono focus:outline-none focus:border-indigo-600"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddItemModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isAttachingPart}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isAttachingPart ? 'Saving...' : 'Add to Work Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          EDIT LINE ITEM MODAL
         ======================================================== */}
      {editingItem && (() => {
        const parsedQty = Math.max(1, parseInt(editItemQty, 10) || 1);
        const parsedPriceVal = parseFloat(editItemPrice);
        const parsedPriceCents =
          !Number.isNaN(parsedPriceVal) && parsedPriceVal >= 0 ? Math.round(parsedPriceVal * 100) : 0;
        const previewLineSubtotalCents = parsedQty * parsedPriceCents;
        const oldLineSubtotalCents = editingItem.quantity * editingItem.unitPriceCents;
        const previewOrderSubtotalCents = Math.max(0, totals.subtotalCents - oldLineSubtotalCents + previewLineSubtotalCents);
        const previewDiscountCents = Math.min(Math.max(totals.discountCents, 0), previewOrderSubtotalCents);
        const previewTaxableCents = previewOrderSubtotalCents - previewDiscountCents;
        const previewTaxRateBps = totals.taxRateBps || 1300;
        const previewTaxCents = Math.round((previewTaxableCents * previewTaxRateBps) / 10000);
        const previewOrderTotalCents = previewTaxableCents + previewTaxCents;

        return (
          <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
            <div className="bg-white rounded-3xl max-w-md w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                  <Pencil className="w-4 h-4 text-indigo-600" />
                  Edit Line Item — WO #{ticket.ticketNumber}
                </h3>
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {editItemError && (
                <div className="p-2.5 bg-red-50 text-red-700 text-xs rounded-xl font-medium border border-red-200">
                  {editItemError}
                </div>
              )}

              <form onSubmit={handleSaveEditItem} className="space-y-3 text-xs">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Description
                  </label>
                  <input
                    type="text"
                    required
                    value={editItemDesc}
                    onChange={(e) => setEditItemDesc(e.target.value)}
                    placeholder="Part or service description"
                    className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Unit Price ($)
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={editItemPrice}
                      onChange={(e) => setEditItemPrice(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Quantity
                    </label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      required
                      value={editItemQty}
                      onChange={(e) => setEditItemQty(e.target.value)}
                      className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:bg-white focus:outline-none focus:border-indigo-600"
                    />
                  </div>
                </div>

                <div className="p-3 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5">
                  <div className="flex justify-between items-center text-slate-600">
                    <span>Line Subtotal</span>
                    <span className="font-mono tabular-nums font-bold text-slate-900">
                      ${(previewLineSubtotalCents / 100).toFixed(2)}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pt-1.5 border-t border-slate-200/80 text-slate-800">
                    <span className="font-semibold">Updated Order Total (incl. HST)</span>
                    <span className="font-mono tabular-nums font-extrabold text-sm text-indigo-700">
                      ${(previewOrderTotalCents / 100).toFixed(2)}
                    </span>
                  </div>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setEditingItem(null)}
                    className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isSavingEditItem}
                    className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                  >
                    {isSavingEditItem ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* ========================================================
          COLLECT PAYMENT MODAL
         ======================================================== */}
      {isPaymentModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-emerald-600" />
                Collect Payment for WO #{ticket.ticketNumber}
              </h3>
              <button
                onClick={() => setIsPaymentModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
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
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Tender Method
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('TERMINAL')}
                    className={`col-span-2 py-2 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 ui-press cursor-pointer ${
                      paymentMethod === 'TERMINAL'
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm'
                        : 'bg-indigo-50/70 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>Card Terminal (Tap / Chip & PIN)</span>
                  </button>
                  {(['CARD', 'CASH', 'DEBIT', 'E_TRANSFER'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => setPaymentMethod(m)}
                      className={`py-2 px-2 rounded-xl border text-xs font-semibold ui-press cursor-pointer ${
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

              {/* Integrated Counter Terminal Widget */}
              {paymentMethod === 'TERMINAL' && (
                <div className="p-3 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-bold text-indigo-900 flex items-center gap-1.5">
                      <CreditCard className="w-3.5 h-3.5 text-indigo-600" />
                      Smart Terminal (WisePOS / Lane 3000)
                    </span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                      PAIRED
                    </span>
                  </div>

                  <div className="flex gap-2">
                    {(['VISA', 'MASTERCARD', 'INTERAC'] as const).map((brand) => (
                      <button
                        key={brand}
                        type="button"
                        onClick={() => setTerminalCardType(brand)}
                        className={`px-2 py-1 rounded text-[10px] font-mono font-bold border transition ${
                          terminalCardType === brand
                            ? 'bg-indigo-600 text-white border-indigo-600'
                            : 'bg-white text-slate-700 border-slate-200'
                        }`}
                      >
                        {brand}
                      </button>
                    ))}
                  </div>

                  {terminalState === 'WAITING_CARD' && (
                    <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-lg text-center animate-pulse">
                      <div className="font-bold text-amber-900 text-xs">📱 Terminal Prompt Active</div>
                      <div className="text-[10px] text-amber-700 mt-0.5">Please tap, insert or swipe customer card on physical reader...</div>
                    </div>
                  )}

                  {terminalState === 'PROCESSING' && (
                    <div className="p-2.5 bg-blue-50 border border-blue-200 rounded-lg text-center">
                      <div className="font-bold text-blue-900 text-xs">🔐 Authorizing EMV Chip...</div>
                      <div className="text-[10px] text-blue-700 mt-0.5">Contactless cryptogram verification</div>
                    </div>
                  )}

                  {terminalState === 'APPROVED' && (
                    <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-lg text-center">
                      <div className="font-bold text-emerald-900 text-xs">✅ Approved! Receipt Generated</div>
                      <div className="text-[10px] text-emerald-700 mt-0.5">Auth Code: {terminalAuthCode || 'APPROVED'} • Recorded to Work Order</div>
                    </div>
                  )}
                </div>
              )}

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingPayment || (paymentMethod === 'TERMINAL' && terminalState !== 'IDLE')}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {paymentMethod === 'TERMINAL'
                    ? terminalState === 'IDLE'
                      ? '⚡ Send to Terminal'
                      : terminalState === 'WAITING_CARD'
                      ? 'Present Card to Reader...'
                      : terminalState === 'PROCESSING'
                      ? 'Authorizing EMV...'
                      : 'Finalizing Ticket...'
                    : isRecordingPayment
                    ? 'Recording...'
                    : 'Complete Payment'}
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
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-indigo-600" />
                Collect Part Deposit (WO #{ticket.ticketNumber})
              </h3>
              <button
                onClick={() => setIsDepositModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
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
                    className={`flex-1 py-1.5 text-xs rounded-full border font-mono font-bold ui-press cursor-pointer ${
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
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
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
                      className={`py-2 px-2.5 rounded-xl border text-xs font-semibold ui-press cursor-pointer ${
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
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRecordingDeposit}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 flex items-center gap-1.5 cursor-pointer"
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
          BASE LABOR PRICE MODAL
         ======================================================== */}
      {isBaseLaborModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                Edit Base Labor
              </h3>
              <button
                type="button"
                onClick={() => setIsBaseLaborModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveBaseLabor} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Base Service / Labor Price ($)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  required
                  value={baseLaborInput}
                  onChange={(e) => setBaseLaborInput(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsBaseLaborModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBaseLabor}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSavingBaseLabor ? 'Saving...' : 'Save Labor'}
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
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">Adjust Discount</h3>
              <button
                onClick={() => setIsDiscountModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
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
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-mono font-bold text-slate-900 focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsDiscountModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingDiscount}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
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
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-slate-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <Mail className="w-4 h-4 text-indigo-600" />
                Email Receipt to Customer
              </h3>
              <button
                onClick={() => setIsEmailModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {emailSuccess && (
              <div className="p-2.5 bg-emerald-50 text-emerald-700 text-xs rounded-xl font-bold flex items-center gap-1.5">
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
                  placeholder="Recipient email address"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-indigo-600"
                />
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsEmailModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingEmail || !emailTo.trim()}
                  className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isSendingEmail ? 'Sending...' : 'Transmit Invoice'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================
          ISSUE REFUND MODAL (ADMIN)
         ======================================================== */}
      {isRefundModalOpen && (
        <div className="fixed inset-0 z-60 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto ui-backdrop">
          <div className="bg-white rounded-3xl max-w-sm w-full max-h-[90dvh] overflow-y-auto my-auto p-5 shadow-2xl border border-rose-200 space-y-4 ui-modal">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-rose-600" />
                Issue Payment Refund?
              </h3>
              <button
                type="button"
                onClick={() => setIsRefundModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 ui-press cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {refundError && (
              <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                {refundError}
              </div>
            )}

            <form onSubmit={submitRefund} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Refund Amount (USD/CAD, max ${(totals.paidCents / 100).toFixed(2)})
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={(totals.paidCents / 100).toFixed(2)}
                  required
                  value={refundAmount}
                  onChange={(e) => setRefundAmount(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl font-mono text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Reason for Refund *
                </label>
                <input
                  type="text"
                  required
                  value={refundReason}
                  onChange={(e) => setRefundReason(e.target.value)}
                  placeholder="Enter reason for refund"
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="pt-2 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setIsRefundModalOpen(false)}
                  disabled={isRefunding}
                  className="min-h-[40px] px-3 py-2 text-xs font-bold border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl ui-press cursor-pointer"
                >
                  No, Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRefunding || !refundReason.trim()}
                  className="min-h-[40px] px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-xl text-xs font-bold ui-press shadow-xs disabled:opacity-50 cursor-pointer"
                >
                  {isRefunding ? 'Refunding...' : 'Yes, Issue Refund'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Confirmation Dialog for In-Ticket Destructive Actions */}
      <ConfirmDialog
        isOpen={Boolean(pendingConfirm)}
        title={
          pendingConfirm?.type === 'item'
            ? 'Remove line item?'
            : pendingConfirm?.type === 'note'
            ? 'Delete this note?'
            : pendingConfirm?.type === 'payment'
            ? `Void payment of $${(pendingConfirm.amountCents / 100).toFixed(2)}?`
            : ''
        }
        message={
          pendingConfirm?.type === 'item' ? (
            <>
              Are you sure you want to remove <strong className="text-slate-900">{pendingConfirm.itemDesc}</strong>{' '}
              from work order #{ticket.ticketNumber}?
            </>
          ) : pendingConfirm?.type === 'note' ? (
            <>
              Are you sure you want to permanently delete this note?
              {pendingConfirm.preview && (
                <span className="block mt-1.5 px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-[11px] text-slate-600 italic truncate">
                  &ldquo;{pendingConfirm.preview.slice(0, 80)}&rdquo;
                </span>
              )}
            </>
          ) : pendingConfirm?.type === 'payment' ? (
            <>
              Are you sure you want to void this{' '}
              <strong className="text-slate-900">${(pendingConfirm.amountCents / 100).toFixed(2)}</strong>{' '}
              payment entry?
            </>
          ) : null
        }
        confirmLabel={
          pendingConfirm?.type === 'item'
            ? 'Yes, Remove Item'
            : pendingConfirm?.type === 'note'
            ? 'Yes, Delete Note'
            : 'Yes, Void Payment'
        }
        cancelLabel={
          pendingConfirm?.type === 'item'
            ? 'No, Keep Item'
            : pendingConfirm?.type === 'note'
            ? 'No, Keep Note'
            : 'No, Keep Payment'
        }
        requireAcknowledge={pendingConfirm?.type === 'payment'}
        acknowledgeLabel="Yes, I am sure I want to void this payment"
        isProcessing={isConfirmBusy}
        onCancel={() => setPendingConfirm(null)}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          setIsConfirmBusy(true);
          try {
            if (pendingConfirm.type === 'item') {
              await executeRemoveItem(pendingConfirm.itemId);
            } else if (pendingConfirm.type === 'note') {
              await executeDeleteNote(pendingConfirm.noteId);
            } else if (pendingConfirm.type === 'payment') {
              await executeVoidPayment(pendingConfirm.paymentId);
            }
            setPendingConfirm(null);
          } finally {
            setIsConfirmBusy(false);
          }
        }}
      />

      {/* Confirmation Modal for Admin Ticket Deletion */}
      <ConfirmDialog
        isOpen={isDeleteConfirmOpen}
        title={`Delete Work Order #${ticket.ticketNumber}?`}
        message="Only shop administrators are permitted to delete work orders. All attached items, payments, and diagnostics will be permanently removed."
        confirmLabel="Yes, Delete Permanently"
        cancelLabel="No, Keep Ticket"
        requireAcknowledge={true}
        acknowledgeLabel="Yes, I am sure I want to permanently delete this work order"
        onCancel={() => setIsDeleteConfirmOpen(false)}
        onConfirm={() => {
          if (onDeleteTicket) onDeleteTicket(ticket.id);
          setIsDeleteConfirmOpen(false);
          onClose();
        }}
      />
      {/* Interactive 3x3 Android Pattern Lock Modal */}
      <PatternLockModal
        isOpen={isPatternModalOpen}
        initialPattern={pattern}
        deviceName={ticket.device?.name || 'Device'}
        onClose={() => setIsPatternModalOpen(false)}
        onSave={(newPat) => {
          setPattern(newPat);
          handleSaveSecurity(passcode, newPat);
        }}
      />
    </div>
  );
};
