import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { EscPosBuilder, buildTicketEscPos } from '../src/utils/escpos';
import { buildDeviceStickerHtml } from '../src/utils/receipt';
import { Ticket } from '../src/types';

const mockTicket: Ticket = {
  id: 'tkt-test-kiosk-99',
  ticketNumber: 42,
  customerId: 'cust-99',
  deviceId: 'dev-99',
  customer: {
    id: 'cust-99',
    fullName: 'Jane Customer',
    phone: '4165559988',
    phoneDigits: '4165559988',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  device: {
    id: 'dev-99',
    name: 'iPhone 15 Pro Max',
    passcode: '8842',
    pattern: '1-2-5-8',
    serialNumber: 'F2LL8934',
    customerId: 'cust-99',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  faultDescription: 'Screen cracked and battery swelling',
  status: 'CHECKED_IN',
  priority: 'STANDARD',
  laborCents: 8500,
  discountCents: 0,
  taxRateBps: 1300,
  dueDate: new Date().toISOString(),
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  items: [
    {
      id: 'item-1',
      ticketId: 'tkt-test-kiosk-99',
      description: 'OLED Display Assembly',
      quantity: 1,
      unitPriceCents: 18000,
      unitCostCents: 10000,
      createdAt: new Date().toISOString(),
    },
  ],
  payments: [],
  events: [],
  totals: {
    subtotalCents: 26500,
    laborCents: 8500,
    itemsCents: 18000,
    discountCents: 0,
    taxRateBps: 1300,
    taxCents: 3445,
    totalCents: 29945,
    paidCents: 0,
    balanceCents: 29945,
    paymentStatus: 'UNPAID',
  },
};

describe('Hardware Printing & ESC/POS Enhancements', () => {
  test('EscPosBuilder generates valid binary byte sequence with cut command', () => {
    const builder = new EscPosBuilder();
    builder.alignCenter().bold(true).line('TEST RECEIPT').cut();
    const bytes = builder.build();

    assert.ok(bytes.length > 10, 'Byte array should contain header and commands');
    assert.equal(bytes[0], 0x1b, 'First byte should be ESC (0x1b)');
    assert.equal(bytes[1], 0x40, 'Second byte should be @ (0x40)');
  });

  test('buildTicketEscPos contains ticket number, customer name and total', () => {
    const raw = buildTicketEscPos(mockTicket, {
      shopName: 'Faso Fix POS',
      currencySymbol: '$',
      taxLabel: 'HST',
    });
    const text = new TextDecoder().decode(raw);

    assert.ok(text.includes('#42'), 'Should contain work order #42');
    assert.ok(text.includes('Jane Customer'), 'Should contain customer name');
    assert.ok(text.includes('iPhone 15 Pro Max'), 'Should contain device name');
    assert.ok(text.includes('$299.45'), 'Should contain total balance');
  });

  test('buildDeviceStickerHtml formats 54x32mm adhesive label correctly', () => {
    const html = buildDeviceStickerHtml(mockTicket, { shopName: 'Faso Fix' });

    assert.ok(html.includes('54mm 32mm'), 'CSS page size should be 54mm 32mm');
    assert.ok(html.includes('#42'), 'Should contain work order #42');
    assert.ok(html.includes('Jane Customer'), 'Should contain customer name');
    assert.ok(html.includes('8842'), 'Should contain passcode');
    assert.ok(html.includes('1-2-5-8'), 'Should contain pattern');
    assert.ok(html.includes('<svg'), 'Should contain barcode svg');
  });
});
