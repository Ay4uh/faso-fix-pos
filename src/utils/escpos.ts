import { Ticket } from '../types';
import { ReceiptShop } from './receipt';
import { deriveTicketQuoteState, isTicketPaidInFull } from './repairPricing';

/**
 * ESC/POS binary command set for thermal receipt printers (Epson, Star, Munbyn, Xprinter, etc.)
 */
const ESC = 0x1b;
const GS = 0x1d;

export const ESCPOS_COMMANDS = {
  INIT: [ESC, 0x40], // Initialize printer
  ALIGN_LEFT: [ESC, 0x61, 0x00],
  ALIGN_CENTER: [ESC, 0x61, 0x01],
  ALIGN_RIGHT: [ESC, 0x61, 0x02],
  BOLD_ON: [ESC, 0x45, 0x01],
  BOLD_OFF: [ESC, 0x45, 0x00],
  TEXT_NORMAL: [GS, 0x21, 0x00],
  TEXT_DOUBLE_HEIGHT: [GS, 0x21, 0x01],
  TEXT_DOUBLE_WIDTH: [GS, 0x21, 0x10],
  TEXT_DOUBLE_SIZE: [GS, 0x21, 0x11],
  CUT_FEED: [GS, 0x56, 0x41, 0x03], // Full cut with 3 line feed
  DRAWER_KICK: [ESC, 0x70, 0x00, 0x19, 0xfa], // Pulse pin 2 for cash drawer (50ms on, 500ms off)
};

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.buffer.push(...ESCPOS_COMMANDS.INIT);
  }

  alignCenter(): this {
    this.buffer.push(...ESCPOS_COMMANDS.ALIGN_CENTER);
    return this;
  }

  alignLeft(): this {
    this.buffer.push(...ESCPOS_COMMANDS.ALIGN_LEFT);
    return this;
  }

  alignRight(): this {
    this.buffer.push(...ESCPOS_COMMANDS.ALIGN_RIGHT);
    return this;
  }

  bold(enable: boolean = true): this {
    this.buffer.push(...(enable ? ESCPOS_COMMANDS.BOLD_ON : ESCPOS_COMMANDS.BOLD_OFF));
    return this;
  }

  doubleSize(enable: boolean = true): this {
    this.buffer.push(...(enable ? ESCPOS_COMMANDS.TEXT_DOUBLE_SIZE : ESCPOS_COMMANDS.TEXT_NORMAL));
    return this;
  }

  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (const b of bytes) this.buffer.push(b);
    return this;
  }

  line(str: string = ''): this {
    this.text(str + '\n');
    return this;
  }

  divider(char: string = '-', width: number = 42): this {
    this.line(char.repeat(width));
    return this;
  }

  twoColumnRow(left: string, right: string, width: number = 42): this {
    const spaces = Math.max(1, width - left.length - right.length);
    this.line(left + ' '.repeat(spaces) + right);
    return this;
  }

  kickDrawer(): this {
    this.buffer.push(...ESCPOS_COMMANDS.DRAWER_KICK);
    return this;
  }

  cut(): this {
    this.buffer.push(...ESCPOS_COMMANDS.CUT_FEED);
    return this;
  }

  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}

/**
 * Builds standard 80mm ESC/POS byte sequence for a repair ticket receipt
 */
export function buildTicketEscPos(ticket: Ticket, shop: ReceiptShop): Uint8Array {
  const b = new EscPosBuilder();
  const cur = shop.currencySymbol || '$';
  const money = (c: number) => `${c < 0 ? '-' : ''}${cur}${(Math.abs(c) / 100).toFixed(2)}`;

  // Header
  b.alignCenter()
    .bold(true)
    .doubleSize(true)
    .line(shop.shopName || 'FASO FIX POS')
    .doubleSize(false)
    .bold(false);

  if (shop.address) b.line(shop.address);
  if (shop.phone) b.line(`Tel: ${shop.phone}`);
  b.divider('=');

  // Work Order & Customer Info
  b.alignLeft()
    .bold(true)
    .twoColumnRow('WORK ORDER:', `#${ticket.ticketNumber}`)
    .bold(false)
    .twoColumnRow('Date:', new Date(ticket.createdAt).toLocaleDateString())
    .twoColumnRow('Customer:', ticket.customer?.fullName || '')
    .twoColumnRow('Phone:', ticket.customer?.phone || '')
    .twoColumnRow('Device:', ticket.device?.name || 'Device');

  if (ticket.device?.serialNumber) {
    b.twoColumnRow('Serial/IMEI:', ticket.device.serialNumber);
  }

  b.divider('-');
  b.bold(true).line('ISSUE REPORTED:').bold(false);
  b.line(ticket.faultDescription || 'General inspection and diagnosis');

  const totals = ticket.totals;
  const quoteState = ticket.quoteState ?? deriveTicketQuoteState(
    ticket,
    totals || {
      subtotalCents: ticket.laborCents || 0,
      totalCents: ticket.laborCents || 0,
      paidCents: 0,
      balanceCents: ticket.laborCents || 0,
    }
  );
  const isPaid = totals ? isTicketPaidInFull(totals, quoteState) : false;
  b.twoColumnRow('Pricing:', quoteState.pricingLabel);
  b.twoColumnRow('Approval:', quoteState.approvalLabel);
  b.divider('-');

  if (!quoteState.hasPrice) {
    b.bold(true).line('PRICING: Price Pending Diagnosis').bold(false);
    if (totals && totals.paidCents > 0) {
      b.twoColumnRow('Deposit Paid:', money(totals.paidCents));
    }
  } else {
    // Items & Labor
    if (ticket.laborCents) {
      b.twoColumnRow('Labour / Service', money(ticket.laborCents));
    }
    for (const item of ticket.items || []) {
      b.twoColumnRow(
        `${item.description} (x${item.quantity})`,
        money(item.quantity * item.unitPriceCents)
      );
    }

    // Totals
    b.divider('-');
    if (totals) {
      b.twoColumnRow('Subtotal', money(totals.subtotalCents));
      if (totals.discountCents) {
        b.twoColumnRow('Discount', money(-totals.discountCents));
      }
      const taxLabel = shop.taxLabel || 'Tax';
      const taxPct = ((totals.taxRateBps || 1300) / 100).toFixed(1);
      b.twoColumnRow(`${taxLabel} (${taxPct}%)`, money(totals.taxCents));
      b.divider('=');
      b.bold(true)
        .doubleSize(true)
        .twoColumnRow(isPaid ? 'TOTAL:' : 'EST. TOTAL:', money(totals.totalCents))
        .doubleSize(false)
        .bold(false);

      if (totals.paidCents > 0) {
        b.twoColumnRow('Paid to Date:', money(totals.paidCents));
        b.bold(true).twoColumnRow('BALANCE DUE:', money(Math.max(totals.balanceCents, 0))).bold(false);
      }
    }
  }

  // Footer & Cut
  b.divider('-');
  b.alignCenter();
  b.line(shop.receiptFooter || 'Thank you for your business!');
  b.line(`Warranty: ${shop.warrantyDays || 90} Days Parts & Labour`);
  b.line('Keep this slip for pickup verification.');
  b.cut();

  return b.build();
}

/**
 * Sends raw bytes directly to thermal printer via WebUSB
 */
export async function printDirectWebUsb(data: Uint8Array): Promise<boolean> {
  if (!('usb' in navigator)) {
    throw new Error('WebUSB is not supported in this browser. Please use Google Chrome or Edge.');
  }

  try {
    const device = await (navigator as any).usb.requestDevice({
      filters: [], // Prompts user to select any connected USB receipt printer
    });

    await device.open();
    if (device.configuration === null) {
      await device.selectConfiguration(1);
    }
    await device.claimInterface(0);

    // Find bulk OUT endpoint
    const endpoint = device.configuration.interfaces[0].alternate.endpoints.find(
      (e: any) => e.direction === 'out' && e.type === 'bulk'
    );

    const endpointNumber = endpoint ? endpoint.endpointNumber : 1;
    await device.transferOut(endpointNumber, data);
    await device.close();
    return true;
  } catch (err: any) {
    console.error('[WebUSB Print Error]', err);
    throw err;
  }
}

/**
 * Sends raw bytes directly to thermal printer via WebSerial
 */
export async function printDirectWebSerial(data: Uint8Array): Promise<boolean> {
  if (!('serial' in navigator)) {
    throw new Error('WebSerial is not supported in this browser. Please use Google Chrome or Edge.');
  }

  try {
    const port = await (navigator as any).serial.requestPort();
    await port.open({ baudRate: 9600 });
    const writer = port.writable.getWriter();
    await writer.write(data);
    writer.releaseLock();
    await port.close();
    return true;
  } catch (err: any) {
    console.error('[WebSerial Print Error]', err);
    throw err;
  }
}
