export interface StandardRepairService {
  id: string;
  name: string;
  priceCents: number;
}

/** Predefined shop repair catalog matching existing WorkOrderScreen service rates. */
export const STANDARD_REPAIR_SERVICES: readonly StandardRepairService[] = [
  { id: 'screen-labor', name: 'Screen Labor', priceCents: 8500 },
  { id: 'battery-replacement', name: 'Battery Replacement', priceCents: 4500 },
  { id: 'diagnostic-inspection', name: 'Diagnostic Inspection', priceCents: 3500 },
  { id: 'thermal-paste-clean', name: 'Thermal Paste / Clean', priceCents: 2500 },
  { id: 'port-micro-soldering', name: 'Port / Micro-Soldering', priceCents: 9500 },
] as const;

export type PricingStatus =
  | 'PRICE_PENDING'
  | 'DIAGNOSIS_REQUIRED'
  | 'QUOTE_PROVIDED'
  | 'REVISED_QUOTE';

export type ApprovalStatus =
  | 'DIAGNOSIS_REQUIRED'
  | 'AWAITING_APPROVAL'
  | 'APPROVED'
  | 'REJECTED'
  | 'REAPPROVAL_REQUIRED';

export interface TicketQuoteState {
  hasPrice: boolean;
  pricingStatus: PricingStatus;
  pricingLabel: string;
  approvalStatus: ApprovalStatus;
  approvalLabel: string;
  quotedTotalCents: number;
  approvedTotalCents: number | null;
  previousTotalCents: number | null;
  approvedAt: string | null;
  approvedBy: string | null;
  requiresReapproval: boolean;
  isPriceLockedForNonAdmin: boolean;
  maxChargeableCents: number | null;
}

export interface QuoteTotalsInput {
  subtotalCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
}

export interface QuoteEventInput {
  kind: string;
  message: string;
  author?: string | null;
  createdAt: string | Date;
}

export interface QuoteTicketInput {
  status?: string;
  isWarranty?: boolean;
  laborCents?: number;
  items?: { quantity: number; unitPriceCents: number }[];
  events?: QuoteEventInput[];
  quoteState?: TicketQuoteState | null;
}

interface PricingMetaPayload {
  pm: PricingStatus;
  total: number;
  prev?: number | null;
  seq?: number;
}

interface ApprovalMetaPayload {
  as: ApprovalStatus;
  total: number;
  approvedTotal?: number | null;
  prev?: number | null;
  seq?: number;
}

const PRICING_LABEL: Record<PricingStatus, string> = {
  PRICE_PENDING: 'Price Pending',
  DIAGNOSIS_REQUIRED: 'Price Pending Diagnosis',
  QUOTE_PROVIDED: 'Quote Provided',
  REVISED_QUOTE: 'Revised Quote',
};

const APPROVAL_LABEL: Record<ApprovalStatus, string> = {
  DIAGNOSIS_REQUIRED: 'Diagnosis Required',
  AWAITING_APPROVAL: 'Awaiting Customer Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  REAPPROVAL_REQUIRED: 'Reapproval Required',
};

let monotonicSeqCounter = 0;
function nextSeq(): number {
  monotonicSeqCounter = (monotonicSeqCounter + 1) % 1000;
  return Date.now() * 1000 + monotonicSeqCounter;
}

/** Appends structured pricing metadata suffix inside a human-readable TicketEvent message. */
export function buildPricingEventMessage(
  humanText: string,
  meta: Omit<PricingMetaPayload, 'seq'>
): string {
  const payload: PricingMetaPayload = { ...meta, seq: nextSeq() };
  return `${humanText} [qmeta:${JSON.stringify(payload)}]`;
}

/** Appends structured approval metadata suffix inside a human-readable TicketEvent message. */
export function buildApprovalEventMessage(
  humanText: string,
  meta: Omit<ApprovalMetaPayload, 'seq'>
): string {
  const payload: ApprovalMetaPayload = { ...meta, seq: nextSeq() };
  return `${humanText} [ameta:${JSON.stringify(payload)}]`;
}

/** Removes internal quote/approval JSON suffixes before rendering event text to users/printouts. */
export function stripQuoteEventMeta(message: string): string {
  return String(message ?? '')
    .replace(/\s*\[(qmeta|ameta):\{.*\}\]\s*$/i, '')
    .trim();
}

function parseMetaSuffix<T>(message: string, tag: 'qmeta' | 'ameta'): T | null {
  const prefix = `[${tag}:`;
  const idx = message.lastIndexOf(prefix);
  if (idx === -1 || !message.endsWith(']')) return null;
  try {
    return JSON.parse(message.slice(idx + prefix.length, -1)) as T;
  } catch {
    return null;
  }
}

function sortEventsChronological(events: QuoteEventInput[]): QuoteEventInput[] {
  return [...events].sort((a, b) => {
    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;
    const ma = parseMetaSuffix<{ seq?: number }>(a.message, a.kind === 'PRICING' ? 'qmeta' : 'ameta');
    const mb = parseMetaSuffix<{ seq?: number }>(b.message, b.kind === 'PRICING' ? 'qmeta' : 'ameta');
    return (ma?.seq ?? 0) - (mb?.seq ?? 0);
  });
}

/**
 * Derives separate pricing and approval state from ticket totals and PRICING/APPROVAL events
 * while staying 100% backwards-compatible with historical tickets that lack quote events.
 */
export function deriveTicketQuoteState(
  ticket: QuoteTicketInput,
  totals: QuoteTotalsInput
): TicketQuoteState {
  const quoteEvents = sortEventsChronological(
    (ticket.events || []).filter((e) => e.kind === 'PRICING' || e.kind === 'APPROVAL')
  );

  if (quoteEvents.length === 0 && ticket.quoteState && (!ticket.events || ticket.events.length === 0)) {
    const cached = ticket.quoteState;
    if (cached.quotedTotalCents === totals.totalCents && cached.hasPrice === (totals.subtotalCents > 0)) {
      return cached;
    }
  }

  const hasPrice = totals.subtotalCents > 0;
  let latestPricingMeta: PricingMetaPayload | null = null;
  let latestApprovalMeta: ApprovalMetaPayload | null = null;
  let lastApprovedTotal: number | null = null;
  let lastApprovedAt: string | null = null;
  let lastApprovedBy: string | null = null;

  for (const ev of quoteEvents) {
    if (ev.kind === 'PRICING') {
      const m = parseMetaSuffix<PricingMetaPayload>(ev.message, 'qmeta');
      if (m) latestPricingMeta = m;
    } else if (ev.kind === 'APPROVAL') {
      const m = parseMetaSuffix<ApprovalMetaPayload>(ev.message, 'ameta');
      if (m) {
        latestApprovalMeta = m;
        if (m.as === 'APPROVED') {
          lastApprovedTotal = typeof m.approvedTotal === 'number' ? m.approvedTotal : m.total;
          lastApprovedAt = new Date(ev.createdAt).toISOString();
          lastApprovedBy = ev.author || null;
        } else if (m.as === 'REAPPROVAL_REQUIRED' && typeof m.approvedTotal === 'number') {
          lastApprovedTotal = m.approvedTotal;
        }
      }
    }
  }

  if (quoteEvents.length === 0) {
    if (!hasPrice) {
      const rejected = ticket.status === 'DECLINED';
      return {
        hasPrice: false,
        pricingStatus: 'DIAGNOSIS_REQUIRED',
        pricingLabel: PRICING_LABEL.DIAGNOSIS_REQUIRED,
        approvalStatus: rejected ? 'REJECTED' : 'DIAGNOSIS_REQUIRED',
        approvalLabel: rejected ? APPROVAL_LABEL.REJECTED : APPROVAL_LABEL.DIAGNOSIS_REQUIRED,
        quotedTotalCents: totals.totalCents,
        approvedTotalCents: null,
        previousTotalCents: null,
        approvedAt: null,
        approvedBy: null,
        requiresReapproval: false,
        isPriceLockedForNonAdmin: false,
        maxChargeableCents: rejected ? 0 : null,
      };
    }

    const legacyApproval: ApprovalStatus =
      ticket.status === 'DECLINED'
        ? 'REJECTED'
        : ticket.status === 'COMPLETED' || totals.paidCents > 0
        ? 'APPROVED'
        : 'AWAITING_APPROVAL';
    const legacyApprovedTotal = legacyApproval === 'APPROVED' ? totals.totalCents : null;

    return {
      hasPrice: true,
      pricingStatus: 'QUOTE_PROVIDED',
      pricingLabel: PRICING_LABEL.QUOTE_PROVIDED,
      approvalStatus: legacyApproval,
      approvalLabel: APPROVAL_LABEL[legacyApproval],
      quotedTotalCents: totals.totalCents,
      approvedTotalCents: legacyApprovedTotal,
      previousTotalCents: null,
      approvedAt: null,
      approvedBy: null,
      requiresReapproval: false,
      isPriceLockedForNonAdmin: legacyApproval === 'APPROVED',
      maxChargeableCents: legacyApproval === 'REJECTED' ? 0 : legacyApprovedTotal,
    };
  }

  if (!hasPrice && latestApprovalMeta?.as !== 'APPROVED' && lastApprovedTotal === null) {
    const pm: PricingStatus =
      latestPricingMeta?.pm === 'PRICE_PENDING' ? 'PRICE_PENDING' : 'DIAGNOSIS_REQUIRED';
    const approvalStatus: ApprovalStatus =
      ticket.status === 'DECLINED' || latestApprovalMeta?.as === 'REJECTED'
        ? 'REJECTED'
        : 'DIAGNOSIS_REQUIRED';

    return {
      hasPrice: false,
      pricingStatus: pm,
      pricingLabel: PRICING_LABEL.DIAGNOSIS_REQUIRED,
      approvalStatus,
      approvalLabel: APPROVAL_LABEL[approvalStatus],
      quotedTotalCents: totals.totalCents,
      approvedTotalCents: null,
      previousTotalCents: latestPricingMeta?.prev ?? null,
      approvedAt: null,
      approvedBy: null,
      requiresReapproval: false,
      isPriceLockedForNonAdmin: false,
      maxChargeableCents: approvalStatus === 'REJECTED' ? 0 : null,
    };
  }

  let pricingStatus: PricingStatus = latestPricingMeta?.pm || 'QUOTE_PROVIDED';
  if (hasPrice && (pricingStatus === 'DIAGNOSIS_REQUIRED' || pricingStatus === 'PRICE_PENDING')) {
    pricingStatus = 'QUOTE_PROVIDED';
  }

  let approvalStatus: ApprovalStatus =
    latestApprovalMeta?.as || (hasPrice ? 'AWAITING_APPROVAL' : 'DIAGNOSIS_REQUIRED');

  if (ticket.status === 'DECLINED' && approvalStatus !== 'REJECTED') {
    approvalStatus = 'REJECTED';
  }

  // Safety invariant: if the quoted total no longer matches the approved total, force Reapproval Required.
  if (
    approvalStatus === 'APPROVED' &&
    lastApprovedTotal !== null &&
    totals.totalCents !== lastApprovedTotal
  ) {
    approvalStatus = 'REAPPROVAL_REQUIRED';
    pricingStatus = 'REVISED_QUOTE';
  }

  const requiresReapproval = approvalStatus === 'REAPPROVAL_REQUIRED';
  const approvedTotalCents =
    approvalStatus === 'APPROVED' || requiresReapproval ? lastApprovedTotal : null;
  const maxChargeableCents =
    approvalStatus === 'REJECTED'
      ? 0
      : approvedTotalCents !== null
      ? approvedTotalCents
      : null;

  return {
    hasPrice,
    pricingStatus,
    pricingLabel: PRICING_LABEL[pricingStatus],
    approvalStatus,
    approvalLabel: APPROVAL_LABEL[approvalStatus],
    quotedTotalCents: totals.totalCents,
    approvedTotalCents,
    previousTotalCents: latestApprovalMeta?.prev ?? latestPricingMeta?.prev ?? null,
    approvedAt: lastApprovedAt,
    approvedBy: lastApprovedBy,
    requiresReapproval,
    isPriceLockedForNonAdmin: approvalStatus === 'APPROVED' || approvalStatus === 'REAPPROVAL_REQUIRED',
    maxChargeableCents,
  };
}

/** Never treats an unpriced ($0.00) work order as Paid in Full. */
export function isTicketPaidInFull(
  totals: { totalCents: number; balanceCents: number; paidCents?: number },
  quoteState?: Pick<TicketQuoteState, 'hasPrice'> | null
): boolean {
  if (quoteState && !quoteState.hasPrice) return false;
  return totals.totalCents > 0 && totals.balanceCents <= 0;
}
