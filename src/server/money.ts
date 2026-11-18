// All money is stored as integer cents. Every total shown anywhere in the app
// (ticket page, receipts, reports, dashboard) is computed by this one function
// so the numbers can never disagree with each other.

export interface MoneyInputs {
  laborCents: number;
  discountCents: number;
  taxRateBps: number;
  items: { quantity: number; unitPriceCents: number }[];
  payments: { amountCents: number }[];
}

export interface Totals {
  laborCents: number;
  itemsCents: number;
  subtotalCents: number;
  discountCents: number;
  taxableCents: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number; // negative means the shop owes the customer a refund
  paymentStatus: 'UNPAID' | 'PARTIAL' | 'PAID';
}

export function computeTotals(t: MoneyInputs): Totals {
  const itemsCents = t.items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
  const subtotalCents = t.laborCents + itemsCents;
  const discountCents = Math.min(Math.max(t.discountCents, 0), subtotalCents);
  const taxableCents = subtotalCents - discountCents;
  const taxCents = Math.round((taxableCents * t.taxRateBps) / 10000);
  const totalCents = taxableCents + taxCents;
  const paidCents = t.payments.reduce((sum, p) => sum + p.amountCents, 0);
  const balanceCents = totalCents - paidCents;

  let paymentStatus: Totals['paymentStatus'] = 'UNPAID';
  if (paidCents > 0) {
    paymentStatus = balanceCents <= 0 ? 'PAID' : 'PARTIAL';
  } else {
    paymentStatus = 'UNPAID';
  }

  return {
    laborCents: t.laborCents,
    itemsCents,
    subtotalCents,
    discountCents,
    taxableCents,
    taxCents,
    totalCents,
    paidCents,
    balanceCents,
    paymentStatus,
  };
}

export const digitsOnly = (s: string) => s.replace(/\D/g, '');
