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
  });

  test('3. Pricing & approval governance: pre-approval edit, Admin-only edit after approval, Reapproval & payment cap', async () => {
    // Intake with manual diagnostic fee $35 -> Awaiting Approval
    const intake = await req('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Taylor Kim', phone: '4165550103' },
        device: { name: 'Laptop Dell XPS' },
        faultDescription: 'Diagnostic Inspection',
        laborCents: 3500,
        pricingMode: 'QUOTE_PROVIDED',
      },
    });
    assert.equal(intake.status, 201);
    const ticketId = intake.json.data.id;
    assert.equal(intake.json.data.totals.totalCents, 3955);

    // Technician can adjust price BEFORE customer approval ($35 -> $45 = $50.85 w/ HST)
    const techPreEdit = await req(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: techToken,
      body: { laborCents: 4500 },
    });
    assert.equal(techPreEdit.status, 200);
    assert.equal(techPreEdit.json.data.totals.totalCents, 5085);
    assert.equal(techPreEdit.json.data.quoteState.approvalStatus, 'AWAITING_APPROVAL');

    // Explicit Customer Approval required to lock quote
    const approved = await req(`/api/tickets/${ticketId}/approval`, {
      method: 'POST',
      token: techToken,
      body: { status: 'APPROVED', note: 'Approved by phone' },
    });
    assert.equal(approved.status, 200);
    assert.equal(approved.json.data.quoteState.approvalStatus, 'APPROVED');
    assert.equal(approved.json.data.quoteState.approvedTotalCents, 5085);
    assert.equal(approved.json.data.quoteState.isPriceLockedForNonAdmin, true);

    // Technician (USER) must be blocked (403) from changing an already-approved quote
    const techEditAfter = await req(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: techToken,
      body: { laborCents: 6500 },
    });
    assert.equal(techEditAfter.status, 403);

    const techAddItemAfter = await req(`/api/tickets/${ticketId}/items`, {
      method: 'POST',
      token: techToken,
      body: { description: 'Extra component', quantity: 1, unitPriceCents: 2000 },
    });
    assert.equal(techAddItemAfter.status, 403);

    // Admin increases price ($45 -> $95 = $107.35 w/ HST) -> MUST trigger REVISED_QUOTE + REAPPROVAL_REQUIRED
    const adminRevise = await req(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: adminToken,
      body: { laborCents: 9500 },
    });
    assert.equal(adminRevise.status, 200);
    assert.equal(adminRevise.json.data.totals.totalCents, 10735);
    assert.equal(adminRevise.json.data.quoteState.pricingStatus, 'REVISED_QUOTE');
    assert.equal(adminRevise.json.data.quoteState.approvalStatus, 'REAPPROVAL_REQUIRED');
    assert.equal(adminRevise.json.data.quoteState.approvedTotalCents, 5085);
    assert.equal(adminRevise.json.data.quoteState.requiresReapproval, true);

    // Attempting to charge revised amount ($107.35) above approved cap ($50.85) MUST be blocked (409)
    const overApprovedCharge = await req(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: adminToken,
      body: { amountCents: 10735, method: 'CARD' },
    });
    assert.equal(overApprovedCharge.status, 409);
    assert.match(overApprovedCharge.json.error, /reapproval/i);

    // Audit trail logged previous/revised quote event + AuditLog
    const auditRes = await req('/api/admin/audit-logs?action=QUOTE_REVISED', { token: adminToken });
    assert.equal(auditRes.status, 200);
    assert.ok(auditRes.json.data.some((a: any) => a.action === 'QUOTE_REVISED' && a.details.includes('$107.35')));

    // Customer re-approves revised quote ($107.35)
    const reapproved = await req(`/api/tickets/${ticketId}/approval`, {
      method: 'POST',
      token: adminToken,
      body: { status: 'APPROVED', note: 'Customer approved revised total' },
    });
    assert.equal(reapproved.status, 200);
    assert.equal(reapproved.json.data.quoteState.approvalStatus, 'APPROVED');
    assert.equal(reapproved.json.data.quoteState.approvedTotalCents, 10735);

    // Now charging $107.35 succeeds!
    const paidRes = await req(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 10735, method: 'CARD' },
    });
    assert.equal(paidRes.status, 201);
    assert.equal(paidRes.json.data.totals.balanceCents, 0);
    assert.equal(isTicketPaidInFull(paidRes.json.data.totals, paidRes.json.data.quoteState), true);

    // Verify stripQuoteEventMeta strips internal JSON markers
    for (const ev of paidRes.json.data.events || []) {
      assert.ok(!stripQuoteEventMeta(ev.message).includes('[qmeta:'));
      assert.ok(!stripQuoteEventMeta(ev.message).includes('[ameta:'));
    }
  });

  test('4. Rejected quote blocks payment and customer printouts show quoted breakdown when priced', async () => {
    const created = await req('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Morgan Reid', phone: '4165550104' },
        device: { name: 'Nintendo Switch' },
        faultDescription: 'Joy-Con Stick Drift',
        laborCents: 4500,
        pricingMode: 'QUOTE_PROVIDED',
      },
    });
    assert.equal(created.status, 201);
    const id = created.json.data.id;

    const shop = { shopName: 'Faso Fix Staging', taxLabel: 'HST', currencySymbol: '$' };
    const preApprovalLetter = buildLetterInvoiceHtml(created.json.data, shop);
    assert.ok(preApprovalLetter.includes('Quote Provided'));
    assert.ok(preApprovalLetter.includes('Awaiting Customer Approval'));
    assert.ok(preApprovalLetter.includes('$50.85'));
    assert.ok(!preApprovalLetter.includes('PAID IN FULL'));

    const rejected = await req(`/api/tickets/${id}/approval`, {
      method: 'POST',
      token: techToken,
      body: { status: 'REJECTED', note: 'Customer declined repair' },
    });
    assert.equal(rejected.status, 200);
    assert.equal(rejected.json.data.quoteState.approvalStatus, 'REJECTED');

    const payRejected = await req(`/api/tickets/${id}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 5085, method: 'CASH' },
    });
    assert.equal(payRejected.status, 409);

    const rejectedLetter = buildLetterInvoiceHtml(rejected.json.data, shop);
    assert.ok(rejectedLetter.includes('QUOTE REJECTED'));
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
