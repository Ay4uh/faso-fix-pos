import { Ticket } from '../types';
import { fetchWithAuth } from './auth';

export interface ReceiptShop {
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
  CASH: 'Cash', CARD: 'Credit Card', DEBIT: 'Debit', E_TRANSFER: 'E-Transfer', OTHER: 'Other',
};

export type ReceiptWidth = '80mm' | '58mm';

/** Deterministic barcode pattern generation matching Barcode.tsx */
export function generateBarcodeSvg(value: string, width = 160, height = 36): string {
  const hash = value.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
  let barsHtml = '';
  let curX = 10;
  const totalWidth = width - 20;
  let i = 0;
  while (curX < totalWidth) {
    const w = ((hash + i * 7) % 3) + 1;
    barsHtml += `<rect x="${curX}" y="2" width="${w}" height="${height - 12}" fill="#000000" />`;
    curX += w + (((hash + i * 13) % 2) + 1);
    i++;
  }
  return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;margin:0 auto;overflow:visible">${barsHtml}</svg>`;
}

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
body { margin: 0; width: ${paperPx}; padding: 3mm 3mm 6mm; font: 12px/1.35 'Courier New', ui-monospace, monospace; color: #000; background: #fff; }
.c { text-align: center; } .b { font-weight: bold; }
h1 { font-size: 16px; margin: 0 0 2px; text-align: center; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row span:last-child { white-space: nowrap; }
.big { font-size: 15px; }
.item { margin-bottom: 3px; } .note { margin: 2px 0; }
.small { font-size: 10px; }
</style></head><body>
<h1>${esc(shop.shopName || 'Faso Fix Electronics')}</h1>
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
<div class="c small">Thank you for your business!</div>
</body></html>`;
}

/** Builds a self-contained thermal bench slip / device sticker HTML. */
export function buildBenchSlipHtml(ticket: Ticket, shop: ReceiptShop): string {
  const woBarcode = `WO-${String(ticket.ticketNumber).padStart(4, '0')}`;
  const barcodeSvg = generateBarcodeSvg(woBarcode, 180, 36);

  return `<!doctype html><html><head><meta charset="utf-8"><title>Bench Slip #${ticket.ticketNumber}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; width: 80mm; padding: 4mm 4mm 8mm; font: 12px/1.35 'Arial', system-ui, -apple-system, sans-serif; color: #000; background: #fff; }
.b { font-weight: bold; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
.wo { font-size: 16px; font-weight: 900; }
.box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; margin: 6px 0; font-family: monospace; font-size: 11px; }
.desc { font-style: italic; font-size: 11px; margin: 6px 0; line-height: 1.3; }
.barcode-box { text-align: center; margin-top: 8px; border-top: 1px dashed #64748b; padding-top: 6px; }
.footer { font-size: 9px; color: #475569; margin-top: 4px; font-family: monospace; }
</style></head><body>
<div class="header">
  <span class="b" style="font-size:12px">${esc(shop.shopName || 'APEXFIX BENCH')}</span>
  <span class="wo">WO #${ticket.ticketNumber}</span>
</div>
<div style="font-size:14px;font-weight:900;margin-bottom:2px">${esc(ticket.customer?.fullName)}</div>
<div style="font-size:11px;color:#334155;margin-bottom:4px">
  ${esc(ticket.customer?.phone)}${ticket.customer?.altPhone ? ` / ${esc(ticket.customer.altPhone)}` : ''}
</div>
<div class="box">
  <div style="font-weight:bold;font-size:12px;font-family:sans-serif;margin-bottom:2px">${esc(ticket.device?.name || 'Device')}</div>
  ${ticket.device?.passcode ? `<div><strong>PIN/Passcode:</strong> ${esc(ticket.device.passcode)}</div>` : ''}
  ${ticket.device?.pattern ? `<div><strong>Pattern Lock:</strong> ${esc(ticket.device.pattern)}</div>` : ''}
  ${ticket.device?.serialNumber ? `<div style="font-size:10px;color:#64748b">S/N: ${esc(ticket.device.serialNumber)}</div>` : ''}
</div>
<div class="desc">&ldquo;${esc(ticket.faultDescription)}&rdquo;</div>
<div class="barcode-box">
  ${barcodeSvg}
  <div style="font-family:monospace;font-size:10px;font-weight:bold;margin-top:2px">*${woBarcode}*</div>
  <div class="footer">DUE: ${new Date(ticket.dueDate).toLocaleDateString()} • BENCH #${esc(ticket.bench || '01')}</div>
</div>
</body></html>`;
}

/** Builds a full Letter (8.5×11) Work Order & Invoice HTML. */
export function buildLetterInvoiceHtml(ticket: Ticket, shop: ReceiptShop): string {
  const cur = shop.currencySymbol || '$';
  const money = (c: number) => `${c < 0 ? '-' : ''}${cur}${(Math.abs(c) / 100).toFixed(2)}`;
  const t = ticket.totals || {
    subtotalCents: ticket.laborCents,
    laborCents: ticket.laborCents,
    itemsCents: 0,
    discountCents: ticket.discountCents || 0,
    taxRateBps: ticket.taxRateBps || 1300,
    taxCents: Math.round((ticket.laborCents * (ticket.taxRateBps || 1300)) / 10000),
    totalCents: ticket.laborCents + Math.round((ticket.laborCents * (ticket.taxRateBps || 1300)) / 10000),
    paidCents: 0,
    balanceCents: ticket.laborCents + Math.round((ticket.laborCents * (ticket.taxRateBps || 1300)) / 10000),
    paymentStatus: 'UNPAID',
  };

  const isPaid = t.balanceCents <= 0;
  const woBarcode = `WO-${String(ticket.ticketNumber).padStart(4, '0')}`;
  const barcodeSvg = generateBarcodeSvg(woBarcode, 160, 36);

  const itemsHtml = (ticket.items || []).map((i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${esc(i.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${i.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${money(i.unitPriceCents)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${money(i.quantity * i.unitPriceCents)}</td>
    </tr>
  `).join('');

  const paymentsHtml = (ticket.payments || []).map((p) => `
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#334155;padding:2px 0">
      <span>${esc(METHOD_LABEL[p.method] || p.method)} (${new Date(p.createdAt).toLocaleDateString()})</span>
      <span style="font-weight:bold">${money(p.amountCents)}</span>
    </div>
  `).join('');

  return `<!doctype html><html><head><meta charset="utf-8"><title>Work Order #${ticket.ticketNumber}</title>
<style>
@page { size: letter portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; line-height: 1.4; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 12px; }
.shop-name { font-size: 20px; font-weight: 900; color: #0f172a; line-height: 1.1; }
.badge { display: inline-block; padding: 3px 8px; font-size: 10px; font-weight: bold; border-radius: 4px; text-transform: uppercase; }
.badge-paid { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.badge-due { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
.card-label { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
.card-val { font-size: 12px; font-weight: bold; color: #0f172a; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
.totals-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
.total-highlight { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; }
.terms { font-size: 9px; color: #64748b; line-height: 1.35; margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
.sig-box { border: 1px solid #cbd5e1; border-radius: 6px; height: 42px; padding: 4px; display: flex; align-items: center; justify-content: space-between; background: #fff; margin-top: 2px; }
</style></head><body>

<div class="header">
  <div>
    <div class="shop-name">${esc(shop.shopName || 'Faso Fix Electronics')}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">Diagnostics • Board-Level Repair • Micro-Soldering Lab</div>
    <div style="font-size:10px;color:#64748b">${esc(shop.address || '1084 Tech Boulevard, Suite 200 • San Jose, CA 95110')}</div>
    <div style="font-size:10px;color:#4f46e5;font-weight:600">Tel: ${esc(shop.phone || '(555) 902-3482')} • Lic: #REP-99214 • HST/Tax: #ESD-4402</div>
  </div>
  <div style="text-align:right">
    <div class="badge ${isPaid ? 'badge-paid' : 'badge-due'}">
      ${isPaid ? 'PAID • READY FOR RELEASE' : 'INSPECTION / BALANCE DUE'}
    </div>
    <div style="margin-top:6px">${barcodeSvg}</div>
    <div style="font-family:monospace;font-size:10px;color:#64748b;margin-top:2px">*${woBarcode}*</div>
  </div>
</div>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
  <div style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px">Official Work Order &amp; Repair Invoice</div>
  <div style="font-size:12px;font-weight:bold;color:#4f46e5">Work Order #${ticket.ticketNumber}</div>
</div>

<div class="grid-4">
  <div class="card">
    <div class="card-label">Date Received</div>
    <div class="card-val">${new Date(ticket.createdAt).toLocaleDateString()}</div>
    <div style="font-size:9px;color:#64748b">${new Date(ticket.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
  </div>
  <div class="card">
    <div class="card-label">Promised Date</div>
    <div class="card-val">${new Date(ticket.dueDate).toLocaleDateString()}</div>
    <div style="font-size:9px;color:#059669;font-weight:600">Priority: ${ticket.priority}</div>
  </div>
  <div class="card">
    <div class="card-label">Lead Technician</div>
    <div class="card-val">${esc(ticket.technician || 'Alex Mercer')}</div>
    <div style="font-size:9px;color:#64748b">Station: ${esc(ticket.bench || 'Bench #01')}</div>
  </div>
  <div class="card">
    <div class="card-label">Payment Status</div>
    <div class="card-val" style="color:${isPaid ? '#059669' : '#d97706'}">${isPaid ? 'PAID IN FULL' : 'BALANCE DUE'}</div>
    <div style="font-size:9px;color:#64748b">Ref: #TXN-${ticket.ticketNumber}89</div>
  </div>
</div>

<div class="grid-2">
  <div class="card">
    <div class="card-label">Client Identification</div>
    <div style="font-size:13px;font-weight:bold">${esc(ticket.customer?.fullName)}</div>
    <div style="font-size:11px;color:#334155;margin-top:2px">Phone: ${esc(ticket.customer?.phone)}${ticket.customer?.altPhone ? ` (Alt: ${esc(ticket.customer.altPhone)})` : ''}</div>
    ${ticket.customer?.email ? `<div style="font-size:10px;color:#64748b">Email: ${esc(ticket.customer.email)}</div>` : ''}
    <div style="font-size:10px;color:#64748b">Address: ${esc(ticket.customer?.address || '742 Evergreen Terrace')}</div>
  </div>
  <div class="card">
    <div class="card-label">Device Hardware Profile</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:bold">${esc(ticket.device?.name || 'Device')}</span>
      <span style="font-size:9px;background:#e2e8f0;padding:2px 6px;border-radius:3px;font-weight:bold">Verified</span>
    </div>
    <div style="font-size:11px;color:#334155;margin-top:4px">
      S/N: ${esc(ticket.device?.serialNumber || 'N/A')}
    </div>
    <div style="font-size:11px;color:#4f46e5;font-weight:bold">
      ${ticket.device?.pattern ? `Pattern: ${esc(ticket.device.pattern)}${ticket.device.passcode ? ` • PIN: ${esc(ticket.device.passcode)}` : ''}` : `Passcode / PIN: ${esc(ticket.device?.passcode || 'Verified by Owner')}`}
    </div>
    <div style="font-size:10px;color:#64748b;margin-top:2px">Condition: ${esc(ticket.device?.condition || 'Standard')}</div>
  </div>
</div>

<div class="card" style="margin-bottom:10px">
  <div class="card-label">Phase 1 • Initial Physical &amp; Digital Intake</div>
  <div style="font-size:11px;color:#1e293b;margin-top:2px"><strong>Reported Issue:</strong> ${esc(ticket.faultDescription)}</div>
</div>

<table style="margin-bottom:10px">
  <thead>
    <tr>
      <th>Component / Scope of Work</th>
      <th style="text-align:center;width:60px">Qty</th>
      <th style="text-align:right;width:90px">Unit Price</th>
      <th style="text-align:right;width:90px">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">
        <strong>Bench Labor &amp; Diagnostic Calibration</strong>
        <div style="font-size:9px;color:#64748b">Disassembly, microscopic board inspection, testing &amp; quality assurance</div>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center">1</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${money(t.laborCents)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${money(t.laborCents)}</td>
    </tr>
    ${itemsHtml}
  </tbody>
</table>

<div class="grid-2" style="margin-bottom:10px">
  <div class="card">
    <div class="card-label">Payment &amp; Transaction Ledger</div>
    ${paymentsHtml || '<div style="font-size:10px;color:#64748b;padding:4px 0">No prior deposits recorded</div>'}
    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;font-weight:bold;font-size:11px">
      <span>Total Paid to Date:</span>
      <span style="color:#059669">${money(t.paidCents)}</span>
    </div>
  </div>

  <div class="card">
    <div class="card-label">Invoice Calculation Summary</div>
    <div class="totals-row">
      <span>Parts Subtotal:</span>
      <span>${money(t.itemsCents)}</span>
    </div>
    <div class="totals-row">
      <span>Labor Subtotal:</span>
      <span>${money(t.laborCents)}</span>
    </div>
    ${t.discountCents > 0 ? `
    <div class="totals-row" style="color:#e11d48">
      <span>Discount:</span>
      <span>-${money(t.discountCents)}</span>
    </div>` : ''}
    <div class="totals-row" style="border-top:1px solid #e2e8f0;padding-top:4px;font-weight:bold">
      <span>Subtotal (Pre-Tax):</span>
      <span>${money(t.subtotalCents)}</span>
    </div>
    <div class="totals-row" style="color:#64748b;font-size:10px">
      <span>Sales Tax (${((t.taxRateBps || 1300) / 100).toFixed(1)}%):</span>
      <span>+${money(t.taxCents)}</span>
    </div>
    <div class="total-highlight">
      <span>TOTAL INVOICE:</span>
      <span>${money(t.totalCents)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-top:4px;color:${t.balanceCents > 0 ? '#d97706' : '#059669'}">
      <span>BALANCE DUE:</span>
      <span>${money(Math.max(t.balanceCents, 0))}</span>
    </div>
  </div>
</div>

<div class="grid-2">
  <div>
    <div class="card-label">Lead Technician Sign-off</div>
    <div class="sig-box">
      <div style="font-weight:bold;font-style:italic;color:#4338ca;font-size:12px">${esc(ticket.technician || 'Alex Mercer')}</div>
      <div style="font-size:9px;color:#64748b;font-family:monospace">DIGITALLY CERTIFIED • ${esc(ticket.bench || 'Bench 01')}</div>
    </div>
  </div>
  <div>
    <div class="card-label">Customer Acceptance</div>
    <div class="sig-box">
      ${ticket.signature ? `<img src="${ticket.signature}" style="height:34px;object-fit:contain" alt="Signature" />` : '<div style="font-size:10px;color:#64748b;font-style:italic">Signature on electronic intake acknowledgment</div>'}
      <div style="font-size:9px;color:#059669;font-weight:bold">VERIFIED</div>
    </div>
  </div>
</div>

</body></html>`;
}

let cachedShop: ReceiptShop | null = null;

export async function loadShop(): Promise<ReceiptShop> {
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
  return {
    shopName: 'Faso Fix Electronics',
    address: '1084 Tech Boulevard, Suite 200 • San Jose, CA 95110',
    phone: '(555) 902-3482',
    email: 'service@fasofix.ca',
    taxLabel: 'HST',
    currencySymbol: '$',
    warrantyDays: 0,
    receiptFooter: 'Thank you for your business!',
  };
}

/**
 * Directly prints HTML without opening about:blank popup windows that hang Chrome's preview engine.
 * Uses an off-screen iframe attached to document.body, ensuring:
 * 1. Same-origin security context (Chrome resolves printer destination instantly in <50ms)
 * 2. No popup blockers or about:blank compositor deadlocks
 * 3. Exact @page layout and vector barcode rendering
 */
export function printDirectDocument(html: string): Promise<void> {
  return new Promise((resolve) => {
    try {
      // Remove any previously created print iframe
      const oldFrame = document.getElementById('pos-direct-print-frame');
      if (oldFrame) {
        oldFrame.remove();
      }

      const iframe = document.createElement('iframe');
      iframe.id = 'pos-direct-print-frame';
      // Use zero-opacity off-pointer fixed frame without visibility:hidden
      // Chromium skips painting when visibility:hidden is set, causing Mac print preview to hang
      iframe.setAttribute(
        'style',
        'position: fixed; right: 0; bottom: 0; width: 1024px; height: 1024px; border: 0; opacity: 0; pointer-events: none; z-index: -9999;'
      );

      document.body.appendChild(iframe);

      const frameDoc = iframe.contentWindow?.document;
      if (!frameDoc) {
        resolve();
        return;
      }

      frameDoc.open();
      frameDoc.write(html);
      frameDoc.close();

      // Wait 300ms for fonts, SVGs, and styles to complete paint, then trigger print
      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          iframe.contentWindow?.print();
        } catch (err) {
          console.error('Print execution error:', err);
        }
        resolve();

        // Clean up iframe after print dialog resolves
        setTimeout(() => {
          try {
            iframe.remove();
          } catch {}
        }, 30000);
      }, 300);
    } catch (e) {
      console.error('Direct print failed:', e);
      resolve();
    }
  });
}

/**
 * Opens a dedicated printable view in a clean top-level window using in-memory ticket data.
 * Uses a real Blob URL so Chrome commits navigation immediately with a valid blob: URL,
 * preventing about:blank hangs.
 */
export async function openPrintSlip(ticket: Ticket, format: string): Promise<void> {
  const shop = await loadShop();
  let html = '';
  if (format === '80mm') {
    html = buildReceiptHtml(ticket, shop, '80mm');
  } else if (format === '58mm') {
    html = buildReceiptHtml(ticket, shop, '58mm');
  } else if (format === 'slip' || format === 'bench') {
    html = buildBenchSlipHtml(ticket, shop);
  } else {
    html = buildLetterInvoiceHtml(ticket, shop);
  }

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
  const blobUrl = URL.createObjectURL(blob);
  const win = window.open(blobUrl, '_blank');
  if (win) {
    win.focus();
    setTimeout(() => URL.revokeObjectURL(blobUrl), 120000);
  }
}

/** Prints a thermal receipt (80mm or 58mm) directly from in-memory ticket data. */
export async function printReceipt(ticket: Ticket, width: ReceiptWidth = '80mm'): Promise<void> {
  const shop = await loadShop();
  const html = buildReceiptHtml(ticket, shop, width);
  await printDirectDocument(html);
}

/** Prints a compact thermal bench slip / sticker directly from in-memory ticket data. */
export async function printBenchSlip(ticket: Ticket): Promise<void> {
  const shop = await loadShop();
  const html = buildBenchSlipHtml(ticket, shop);
  await printDirectDocument(html);
}

/** Prints a full Letter (8.5×11) Work Order & Invoice directly from in-memory ticket data. */
export async function printLetterInvoice(ticket: Ticket): Promise<void> {
  const shop = await loadShop();
  const html = buildLetterInvoiceHtml(ticket, shop);
  await printDirectDocument(html);
}

