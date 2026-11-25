/**
 * Flexible Repair Pricing & Separate Customer Approval Staging Test Suite.
 * STRICTLY requires a local staging DATABASE_URL (127.0.0.1 / localhost).
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { app } from '../src/server/index';
import { prisma } from '../src/server/prisma';
import { ensureAdminProvisioning, hashPassword } from '../src/server/auth';
import {
  STANDARD_REPAIR_SERVICES,
  deriveTicketQuoteState,
  isTicketPaidInFull,
  stripQuoteEventMeta,
} from '../src/utils/repairPricing';
import {
  buildReceiptHtml,
  buildLetterInvoiceHtml,
  buildBenchSlipHtml,
} from '../src/utils/receipt';
import { buildTicketEscPos } from '../src/utils/escpos';

const dbUrl = process.env.DATABASE_URL || '';
if (!dbUrl.includes('127.0.0.1') && !dbUrl.includes('localhost')) {
  throw new Error(
    `SAFETY ABORT: tests/flexible_pricing.test.ts must ONLY run against an isolated local staging DB, got "${dbUrl.slice(0, 40)}"`
  );
}

describe('Flexible Repair Pricing & Approval Workflow (Staging PostgreSQL)', () => {
  let server: http.Server;
  let baseUrl = '';
  let adminToken = '';
  let techToken = '';
  const suffix = String(Date.now());
  const techUsername = `pricing_tech_${suffix}`;

  async function req(
    path: string,
    opts: { method?: string; token?: string; body?: unknown } = {}
  ) {
    const res = await fetch(`${baseUrl}${path}`, {
      method: opts.method || 'GET',
      headers: {
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { status: res.status, json, text };
  }

  before(async () => {
    await ensureAdminProvisioning();
    await prisma.setting.upsert({
      where: { id: 1 },
      update: { shopName: 'Faso Fix Staging', taxLabel: 'HST', taxRateBps: 1300 },
      create: { id: 1, shopName: 'Faso Fix Staging', taxLabel: 'HST', taxRateBps: 1300 },
    });

    const passwordHash = await hashPassword('Tech@FasoFix2026!');
    await prisma.user.create({
      data: {
        username: techUsername,
        email: `${techUsername}@staging.local`,
        name: 'Staging Tech',
        passwordHash,
        role: 'USER',
        status: 'ACTIVE',
      },
    });

    server = http.createServer(app);
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const addr = server.address() as any;
    baseUrl = `http://127.0.0.1:${addr.port}`;

    const adminLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: 'admin', password: process.env.ADMIN_PASSWORD || 'Admin@FasoFix2026!', adminMode: true },
    });
    assert.equal(adminLogin.status, 200);
    adminToken = adminLogin.json.token;

    const techLogin = await req('/api/auth/login', {
      method: 'POST',
      body: { usernameOrEmail: techUsername, password: 'Tech@FasoFix2026!' },
    });
    assert.equal(techLogin.status, 200);
    techToken = techLogin.json.token;
  });

  after(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await prisma.$disconnect();
  });

  test('1. Predefined catalog uses only standard services and creates quote WITHOUT auto-approval', async () => {
    const screenSvc = STANDARD_REPAIR_SERVICES.find((s) => s.id === 'screen-labor');
    assert.ok(screenSvc);
    assert.equal(screenSvc.priceCents, 8500);

    const created = await req('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Jordan Lee', phone: '4165550101' },
        device: { name: 'iPhone 14' },
        faultDescription: screenSvc.name,
        laborCents: 0,
        pricingMode: 'QUOTE_PROVIDED',
        initialItems: [{ description: screenSvc.name, quantity: 1, unitPriceCents: screenSvc.priceCents }],
      },
    });
    assert.equal(created.status, 201);
    const t = created.json.data;
    assert.equal(t.totals.subtotalCents, 8500);
    assert.equal(t.totals.taxCents, 1105);
    assert.equal(t.totals.totalCents, 9605);
    assert.equal(t.quoteState.hasPrice, true);
    assert.equal(t.quoteState.pricingStatus, 'QUOTE_PROVIDED');
    assert.equal(t.quoteState.approvalStatus, 'AWAITING_APPROVAL');
    assert.equal(isTicketPaidInFull(t.totals, t.quoteState), false);
  });

  test('2. Blank / diagnosis-required intake displays Price Pending Diagnosis and NEVER $0.00 or PAID', async () => {
    const created = await req('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Sam Patel', phone: '4165550102' },
        device: { name: 'MacBook Pro 14' },
        faultDescription: 'Liquid spill inspection',
        laborCents: 0,
        pricingMode: 'DIAGNOSIS_REQUIRED',
      },
    });
    assert.equal(created.status, 201);
    const t = created.json.data;
    assert.equal(t.totals.totalCents, 0);
    assert.equal(t.quoteState.hasPrice, false);
    assert.equal(t.quoteState.pricingStatus, 'DIAGNOSIS_REQUIRED');
    assert.equal(t.quoteState.pricingLabel, 'Price Pending Diagnosis');
    assert.equal(t.quoteState.approvalStatus, 'DIAGNOSIS_REQUIRED');
    assert.equal(isTicketPaidInFull(t.totals, t.quoteState), false);

    const shop = { shopName: 'Faso Fix Staging', taxLabel: 'HST', currencySymbol: '$' };
    const letter = buildLetterInvoiceHtml(t, shop);
    const r80 = buildReceiptHtml(t, shop, '80mm');
    const r58 = buildReceiptHtml(t, shop, '58mm');
    const slip = buildBenchSlipHtml(t, shop);
    const escpos = new TextDecoder().decode(buildTicketEscPos(t, shop));

    for (const output of [letter, r80, r58, escpos]) {
      assert.ok(output.includes('Price Pending Diagnosis'), 'Print output must show Price Pending Diagnosis');
      assert.ok(!output.includes('PAID IN FULL'), 'Unpriced ticket must NEVER say PAID IN FULL');
      assert.ok(!output.includes('$0.00'), 'Unpriced ticket must NEVER show $0.00 total');
    }
    assert.ok(slip.includes('Price Pending Diagnosis'));
    assert.ok(slip.includes('Created:'));
    assert.ok(slip.includes('Total:'));
    assert.ok(!slip.includes('Pricing:'), 'Compact slip must NOT show Pricing row');
    assert.ok(!slip.includes('Approval:'), 'Compact slip must NOT show Approval row');
    assert.ok(!letter.includes('Customer Acceptance'), 'Letter invoice must NOT show Customer Acceptance signature block');
    assert.ok(!letter.includes('Signature on electronic intake acknowledgment'));
  });

  test('3. Direct line-item editing & settlement: PUT /api/tickets/:id/items/:itemId updates totals, audit logs & settles with deposit without reapproval locks', async () => {
    // Intake work order with an initial custom line item ($30.00 x 2 = $60.00 subtotal, $67.80 w/ 13% HST)
    const intake = await req('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Taylor Kim', phone: '4165550103' },
        device: { name: 'PS5 Controller' },
        faultDescription: 'Stick drift',
        laborCents: 0,
        pricingMode: 'QUOTE_PROVIDED',
        initialItems: [{ description: 'hall sensor stick', quantity: 2, unitPriceCents: 3000 }],
      },
    });
    assert.equal(intake.status, 201);
    const ticketId = intake.json.data.id;
    const itemId = intake.json.data.items[0].id;
    assert.equal(intake.json.data.totals.subtotalCents, 6000);
    assert.equal(intake.json.data.totals.taxCents, 780);
    assert.equal(intake.json.data.totals.totalCents, 6780);

    // Take a $20.00 partial deposit first
    const depositRes = await req(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 2000, method: 'CARD', note: 'Special-order part deposit' },
    });
    assert.equal(depositRes.status, 201);
    assert.equal(depositRes.json.data.totals.paidCents, 2000);
    assert.equal(depositRes.json.data.totals.balanceCents, 4780);

    // Even after a deposit (or even if ticket had an approval event), staff can directly edit line items upward!
    await req(`/api/tickets/${ticketId}/approval`, {
      method: 'POST',
      token: techToken,
      body: { status: 'APPROVED', note: 'Legacy approval check' },
    });

    const editRes = await req(`/api/tickets/${ticketId}/items/${itemId}`, {
      method: 'PUT',
      token: techToken,
      body: {
        description: 'TMR Hall Effect Stick Pair',
        quantity: 2,
        unitPriceCents: 4000,
      },
    });
    assert.equal(editRes.status, 200);
    const edited = editRes.json.data;
    assert.equal(edited.items[0].description, 'TMR Hall Effect Stick Pair');
    assert.equal(edited.items[0].quantity, 2);
    assert.equal(edited.items[0].unitPriceCents, 4000);
    assert.equal(edited.totals.subtotalCents, 8000);
    assert.equal(edited.totals.taxCents, 1040);
    assert.equal(edited.totals.totalCents, 9040);
    assert.equal(edited.totals.paidCents, 2000);
    assert.equal(edited.totals.balanceCents, 7040);

    // ITEM event and TICKET_ITEM_UPDATE audit entry logged
    assert.ok(
      edited.events.some(
        (ev: any) => ev.kind === 'ITEM' && ev.message.includes('TMR Hall Effect Stick Pair') && ev.message.includes('$40.00')
      )
    );
    const auditRes = await req('/api/admin/audit-logs?action=TICKET_ITEM_UPDATE', { token: adminToken });
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.json.data.some((a: any) => a.action === 'TICKET_ITEM_UPDATE' && a.details.includes('TMR Hall Effect Stick Pair')));

    // Remaining balance ($70.40) can be charged immediately with NO reapproval block!
    const paidRes = await req(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 7040, method: 'CASH' },
    });
    assert.equal(paidRes.status, 201);
    assert.equal(paidRes.json.data.totals.paidCents, 9040);
    assert.equal(paidRes.json.data.totals.balanceCents, 0);
    assert.equal(isTicketPaidInFull(paidRes.json.data.totals, paidRes.json.data.quoteState), true);

    for (const ev of paidRes.json.data.events || []) {
      assert.ok(!stripQuoteEventMeta(ev.message).includes('[qmeta:'));
      assert.ok(!stripQuoteEventMeta(ev.message).includes('[ameta:'));
    }
  });

  test('4. Inventory item quantity editing syncs stock atomically and blocks edits on cancelled work orders', async () => {
    const part = await prisma.inventoryPart.create({
      data: {
        sku: `HALL-${suffix}`,
        name: `Hall Stick Module ${suffix}`,
        category: 'PARTS',
        costCents: 900,
        priceCents: 2500,
        stock: 5,
        reorderPoint: 1,
      },
    });

    const created = await req('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Morgan Reid', phone: '4165550104' },
        device: { name: 'Nintendo Switch' },
        faultDescription: 'Joy-Con Stick Drift',
        laborCents: 0,
        pricingMode: 'DIAGNOSIS_REQUIRED',
      },
    });
    assert.equal(created.status, 201);
    const ticketId = created.json.data.id;

    // Attach 2 from inventory -> stock drops 5 -> 3
    const attached = await req(`/api/tickets/${ticketId}/items`, {
      method: 'POST',
      token: techToken,
      body: { partId: part.id, quantity: 2 },
    });
    assert.equal(attached.status, 201);
    const itemId = attached.json.data.items[0].id;
    let dbPart = await prisma.inventoryPart.findUnique({ where: { id: part.id } });
    assert.equal(dbPart?.stock, 3);

    // Edit qty up 2 -> 4 -> stock drops 3 -> 1
    const incRes = await req(`/api/tickets/${ticketId}/items/${itemId}`, {
      method: 'PUT',
      token: techToken,
      body: { quantity: 4, unitPriceCents: 2800 },
    });
    assert.equal(incRes.status, 200);
    assert.equal(incRes.json.data.totals.subtotalCents, 11200);
    dbPart = await prisma.inventoryPart.findUnique({ where: { id: part.id } });
    assert.equal(dbPart?.stock, 1);

    // Reject edit exceeding remaining stock (4 -> 10 needs +6, only 1 available)
    const overStockRes = await req(`/api/tickets/${ticketId}/items/${itemId}`, {
      method: 'PUT',
      token: techToken,
      body: { quantity: 10 },
    });
    assert.equal(overStockRes.status, 409);
    dbPart = await prisma.inventoryPart.findUnique({ where: { id: part.id } });
    assert.equal(dbPart?.stock, 1);

    // Edit qty down 4 -> 1 -> stock returns 1 -> 4
    const decRes = await req(`/api/tickets/${ticketId}/items/${itemId}`, {
      method: 'PUT',
      token: techToken,
      body: { quantity: 1 },
    });
    assert.equal(decRes.status, 200);
    assert.equal(decRes.json.data.totals.subtotalCents, 2800);
    dbPart = await prisma.inventoryPart.findUnique({ where: { id: part.id } });
    assert.equal(dbPart?.stock, 4);

    // Unpaid printout shows $31.64 and never PAID IN FULL
    const shop = { shopName: 'Faso Fix Staging', taxLabel: 'HST', currencySymbol: '$' };
    const letter = buildLetterInvoiceHtml(decRes.json.data, shop);
    assert.ok(letter.includes('$31.64'));
    assert.ok(!letter.includes('PAID IN FULL'));
    const slip = buildBenchSlipHtml(decRes.json.data, shop);
    assert.ok(slip.includes('Created:'));
    assert.ok(slip.includes('Total:'));
    assert.ok(slip.includes('$31.64'));
    assert.ok(!slip.includes('Pricing:'));
    assert.ok(!slip.includes('Approval:'));

    // Cancel work order -> restocks remaining 1 item (4 -> 5), and further item edits return 409
    const cancelled = await req(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: techToken,
      body: { status: 'CANCELLED' },
    });
    assert.equal(cancelled.status, 200);
    dbPart = await prisma.inventoryPart.findUnique({ where: { id: part.id } });
    assert.equal(dbPart?.stock, 5);

    const editCancelled = await req(`/api/tickets/${ticketId}/items/${itemId}`, {
      method: 'PUT',
      token: techToken,
      body: { unitPriceCents: 1500 },
    });
    assert.equal(editCancelled.status, 409);
    dbPart = await prisma.inventoryPart.findUnique({ where: { id: part.id } });
    assert.equal(dbPart?.stock, 5);
  });

  test('5. Backwards compatibility with historical pre-feature tickets lacking quote events', () => {
    const legacyUnpriced = {
      status: 'CHECKED_IN',
      laborCents: 0,
      items: [],
      events: [],
    };
    const qs1 = deriveTicketQuoteState(legacyUnpriced, {
      subtotalCents: 0,
      totalCents: 0,
      paidCents: 0,
      balanceCents: 0,
    });
    assert.equal(qs1.hasPrice, false);
    assert.equal(qs1.pricingLabel, 'Price Pending Diagnosis');
    assert.equal(isTicketPaidInFull({ totalCents: 0, balanceCents: 0, paidCents: 0 }, qs1), false);

    const legacyCompletedPaid = {
      status: 'COMPLETED',
      laborCents: 10000,
      items: [],
      events: [],
    };
    const qs2 = deriveTicketQuoteState(legacyCompletedPaid, {
      subtotalCents: 10000,
      totalCents: 11300,
      paidCents: 11300,
      balanceCents: 0,
    });
    assert.equal(qs2.hasPrice, true);
    assert.equal(qs2.approvalStatus, 'APPROVED');
    assert.equal(isTicketPaidInFull({ totalCents: 11300, balanceCents: 0, paidCents: 11300 }, qs2), true);
  });
});
