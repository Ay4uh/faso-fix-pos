import { Ticket } from '../types';
import { fetchWithAuth } from './auth';

interface ReceiptShop {
  shopName?: string;
  address?: string;
  phone?: string;
  email?: string;
  taxLabel?: string;
  receiptFooter?: string;
  warrantyDays?: number;
  currencySymbol?: string;
}

const esc = (s: unknown) =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

const METHOD_LABEL: Record<string, string> = {
  CASH: 'Cash', CARD: 'Card', DEBIT: 'Debit', E_TRANSFER: 'E-Transfer', OTHER: 'Other',
};

export type ReceiptWidth = '80mm' | '58mm';

/** Builds a self-contained thermal receipt HTML document (public info only — never private bench notes or passcodes). */
export function buildReceiptHtml(ticket: Ticket, shop: ReceiptShop, width: ReceiptWidth = '80mm'): string {
  const cur = shop.currencySymbol || '$';
  const money = (c: number) => `${c < 0 ? '-' : ''}${cur}${(Math.abs(c) / 100).toFixed(2)}`;
  const t = ticket.totals;
  const taxPct = ((t?.taxRateBps ?? ticket.taxRateBps ?? 0) / 100).toFixed(2);
  const row = (l: string, r: string, bold = false) =>
    `<div class="row${bold ? ' b' : ''}"><span>${l}</span><span>${r}</span></div>`;

  const items = (ticket.items || [])
    .map((i) => `<div class="item"><div>${esc(i.description)}</div>${row(`&nbsp;&nbsp;${i.quantity} × ${money(i.unitPriceCents)}`, money(i.quantity * i.unitPriceCents))}</div>`)
    .join('');

  const payments = (ticket.payments || [])
    .map((p) => row(`${esc(METHOD_LABEL[p.method] || p.method)} ${new Date(p.createdAt).toLocaleDateString()}`, money(p.amountCents)))
    .join('');

  const publicNotes = (ticket.events || [])
    .filter((e) => e.kind === 'CUSTOMER_NOTE')
    .map((e) => `<div class="note">• ${esc(e.message)}</div>`)
    .join('');

  const paperPx = width === '58mm' ? '58mm' : '80mm';
  const status = t ? (t.balanceCents <= 0 ? 'PAID IN FULL' : t.paidCents > 0 ? 'PARTIALLY PAID' : 'BALANCE DUE') : '';

  return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt WO #${ticket.ticketNumber}</title>
<style>
@page { size: ${paperPx} auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; width: ${paperPx}; padding: 3mm 3mm 6mm; font: 12px/1.35 'Courier New', ui-monospace, monospace; color: #000; }
.c { text-align: center; } .b { font-weight: bold; }
h1 { font-size: 16px; margin: 0 0 2px; text-align: center; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row span:last-child { white-space: nowrap; }
.big { font-size: 15px; }
.item { margin-bottom: 3px; } .note { margin: 2px 0; }
.small { font-size: 10px; }
</style></head><body>
<h1>${esc(shop.shopName || 'Repair Shop')}</h1>
${shop.address ? `<div class="c small">${esc(shop.address)}</div>` : ''}
${shop.phone ? `<div class="c small">${esc(shop.phone)}</div>` : ''}
${shop.email ? `<div class="c small">${esc(shop.email)}</div>` : ''}
<hr>
${row('Work Order', `#${ticket.ticketNumber}`, true)}
${row('Date', new Date().toLocaleString())}
${row('Customer', esc(ticket.customer?.fullName))}
${row('Phone', esc(ticket.customer?.phone))}
${row('Device', esc(ticket.device?.name))}
${ticket.device?.serialNumber ? row('Serial/IMEI', esc(ticket.device.serialNumber)) : ''}
<hr>
<div class="b">Issue</div><div>${esc(ticket.faultDescription)}</div>
${publicNotes ? `<hr><div class="b">Work Performed</div>${publicNotes}` : ''}
<hr>
${ticket.laborCents ? row('Labour', money(ticket.laborCents)) : ''}
${items}
${t ? `<hr>
${row('Subtotal', money(t.subtotalCents))}
${t.discountCents ? row('Discount', money(-t.discountCents)) : ''}
${row(`${esc(shop.taxLabel || 'Tax')} (${taxPct}%)`, money(t.taxCents))}
<div class="big">${row('TOTAL', money(t.totalCents), true)}</div>
${payments ? `<hr><div class="b">Payments</div>${payments}` : ''}
${row('Paid', money(t.paidCents))}
<div class="big">${row('BALANCE', money(Math.max(t.balanceCents, 0)), true)}</div>
<div class="c b" style="margin-top:4px">*** ${status} ***</div>` : ''}
<hr>
${shop.warrantyDays ? `<div class="c small">${shop.warrantyDays}-day warranty on parts &amp; labour.</div>` : ''}
${shop.receiptFooter ? `<div class="c small">${esc(shop.receiptFooter)}</div>` : '<div class="c small">Thank you for your business!</div>'}
</body></html>`;
}

let cachedShop: ReceiptShop | null = null;

async function loadShop(): Promise<ReceiptShop> {
  if (cachedShop) return cachedShop;
  try {
    const res = await fetchWithAuth('/api/settings');
    if (res.ok) {
      const j = await res.json();
      cachedShop = j.data || j;
      setTimeout(() => (cachedShop = null), 60_000);
      return cachedShop!;
    }
  } catch {}
  return {};
}

/** Prints the receipt through a hidden iframe so only the receipt (not the app) is sent to the printer. */
export async function printReceipt(ticket: Ticket, width: ReceiptWidth = '80mm'): Promise<void> {
  const shop = await loadShop();
  const html = buildReceiptHtml(ticket, shop, width);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  Object.assign(iframe.style, { position: 'fixed', right: '0', bottom: '0', width: '0', height: '0', border: '0' });
  document.body.appendChild(iframe);
  const doc = iframe.contentDocument!;
  doc.open();
  doc.write(html);
  doc.close();
  await new Promise((r) => setTimeout(r, 150));
  iframe.contentWindow!.focus();
  iframe.contentWindow!.print();
  setTimeout(() => iframe.remove(), 2000);
}
