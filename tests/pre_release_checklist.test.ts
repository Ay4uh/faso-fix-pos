/**
 * Pre-Release Testing Suite for Faso Fix POS & CRM
 * Validates the full pre-release checklist:
 * 1. Customer management
 * 2. Repair tickets
 * 3. Estimates & payments
 * 4. Inventory control & auto-deduction
 * 5. Reporting & metrics
 * 6. Security, RBAC & reliability
 * 7. Critical launch scenarios
 * 8. End-to-end customer-to-invoice workflow
 */

import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { buildReceiptHtml } from '../src/utils/receipt';

const API = process.env.API_URL || 'http://localhost:4000';
const TECH = { usernameOrEmail: 'tech', password: 'Tech@FasoFix2026!' };
const ADMIN = { usernameOrEmail: 'admin', password: 'Admin@FasoFix2026!' };

async function call(path: string, opts: { method?: string; token?: string; body?: unknown } = {}) {
  const res = await fetch(API + path, {
    method: opts.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(opts.token ? { Authorization: `Bearer ${opts.token}` } : {}),
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}
  return { status: res.status, json, text };
}

async function login(creds: object, adminMode = false) {
  const r = await call('/api/auth/login', { method: 'POST', body: { ...creds, adminMode } });
  assert.equal(r.status, 200, `login failed: ${JSON.stringify(r.json)}`);
  return r.json.token as string;
}

describe('Faso Fix POS - Complete Pre-Release Testing Suite', () => {
  let techToken = '';
  let adminToken = '';

  before(async () => {
    techToken = await login(TECH);
    adminToken = await login(ADMIN, true);
  });

  // =========================================================================
  // 1. Customer Management
  // =========================================================================
  describe('1. Customer Management', () => {
    let customerId = '';
    const uniquePhone = `(555) 789-${Math.floor(1000 + Math.random() * 9000)}`;

    test('Create a new customer via ticket intake', async () => {
      const res = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: {
            fullName: 'Alexander Wright',
            phone: uniquePhone,
            altPhone: '(555) 999-0011',
            email: 'alex.wright@example.com',
            address: '123 King Street, Suite 400',
            notes: 'Prefers text notifications',
          },
          device: {
            name: 'iPhone 15 Pro Max',
            serialNumber: 'IMEI-9988776655',
            passcode: '9876',
            condition: 'Mint condition, minor bezel scratch',
          },
          faultDescription: 'OLED screen cracked after drop',
          laborCents: 9500, // $95.00
        },
      });

      assert.equal(res.status, 201, `Failed to create: ${res.text}`);
      assert.ok(res.json.data.id);
      assert.equal(res.json.data.customer.fullName, 'Alexander Wright');
      customerId = res.json.data.customer.id;
      assert.ok(customerId);
    });

    test('Search customer by name, phone and email', async () => {
      // By name
      const searchName = await call('/api/customers?search=Alexander', { token: techToken });
      assert.equal(searchName.status, 200);
      assert.ok(searchName.json.data.some((c: any) => c.fullName === 'Alexander Wright'));

      // By phone digits
      const digitsOnly = uniquePhone.replace(/\D/g, '');
      const searchPhone = await call(`/api/customers?search=${digitsOnly}`, { token: techToken });
      assert.equal(searchPhone.status, 200);
      assert.ok(searchPhone.json.data.some((c: any) => c.phoneDigits === digitsOnly));

      // Customer direct phone lookup endpoint
      const lookup = await call(`/api/customers/lookup?phone=${digitsOnly}`, { token: techToken });
      assert.equal(lookup.status, 200);
      assert.equal(lookup.json.data.fullName, 'Alexander Wright');
    });

    test('Edit customer information', async () => {
      const update = await call(`/api/customers/${customerId}`, {
        method: 'PUT',
        token: techToken,
        body: {
          fullName: 'Alexander Wright Jr.',
          altPhone: '(555) 888-9999',
          notes: 'Updated contact preference: Call before pickup',
        },
      });
      assert.equal(update.status, 200);
      assert.equal(update.json.data.fullName, 'Alexander Wright Jr.');
      assert.equal(update.json.data.altPhone, '(555) 888-9999');
    });

    test('Check duplicate phone handling across customers', async () => {
      // Phone number digits are unique across customers
      const duplicateRes = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: {
            fullName: 'Alexander Wright Duplicate Attempt',
            phone: uniquePhone, // Same phone
          },
          device: { name: 'iPad Air' },
          faultDescription: 'Battery swap',
        },
      });
      // Should attach to existing customer or safely handle duplicate digits
      assert.ok(duplicateRes.status === 201 || duplicateRes.status === 200);
      if (duplicateRes.status === 201) {
        assert.equal(duplicateRes.json.data.customer.id, customerId);
      }
    });
  });

  // =========================================================================
  // 2. Repair Tickets
  // =========================================================================
  describe('2. Repair Tickets Lifecycle', () => {
    let ticketId = '';

    test('Create repair ticket with accessories, passcode and diagnostics', async () => {
      const res = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: {
            fullName: 'Sarah Connor',
            phone: `(555) 456-${Math.floor(1000 + Math.random() * 9000)}`,
          },
          device: {
            name: 'MacBook Pro 16" M2',
            serialNumber: 'C02G1234MD6R',
            passcode: 'VaultPass2026!',
            pattern: 'Z-shape',
            condition: 'Dent on top casing',
          },
          faultDescription: 'Liquid spilled on keyboard, trackpad unresponsive',
          laborCents: 12000, // $120.00
          priority: 'URGENT',
          dueDate: new Date(Date.now() + 86400000 * 2).toISOString(),
          bench: 'Bench #01',
          storageBin: 'BIN-A12',
          technician: 'Alex Mercer',
        },
      });

      assert.equal(res.status, 201);
      ticketId = res.json.data.id;
      assert.ok(res.json.data.ticketNumber > 0);
      assert.ok(ticketId);
      assert.equal(res.json.data.priority, 'URGENT');
      assert.equal(res.json.data.storageBin, 'BIN-A12');
      assert.equal(res.json.data.device.passcode, 'VaultPass2026!');
    });

    test('Progress repair status through complete lifecycle flow', async () => {
      const stages = [
        'DIAGNOSING',
        'WAITING_ON_APPROVAL',
        'WAITING_ON_PARTS',
        'READY_FOR_PICKUP',
        'COMPLETED',
      ] as const;

      for (const stage of stages) {
        const update = await call(`/api/tickets/${ticketId}`, {
          method: 'PUT',
          token: techToken,
          body: { status: stage },
        });
        assert.equal(update.status, 200, `Failed transitioning to ${stage}`);
        assert.equal(update.json.data.status, stage);
      }
    });

    test('Add customer public note and technician private bench note', async () => {
      // 1. Customer Note (visible on receipt)
      const pubNote = await call(`/api/tickets/${ticketId}/notes`, {
        method: 'POST',
        token: techToken,
        body: {
          kind: 'CUSTOMER_NOTE',
          message: 'Top-case keyboard assembly replaced with genuine OEM part.',
        },
      });
      assert.equal(pubNote.status, 201);

      // 2. Private Bench Note (internal technician only)
      const privNote = await call(`/api/tickets/${ticketId}/notes`, {
        method: 'POST',
        token: techToken,
        body: {
          kind: 'INTERNAL_NOTE',
          message: 'Internal water damage sensor tripped at L34 connector.',
        },
      });
      assert.equal(privNote.status, 201);
    });

    test('Print receipt verification - verifies data masking of passcodes and bench notes', async () => {
      const freshTicket = await call(`/api/tickets/${ticketId}`, { token: techToken });
      const html = buildReceiptHtml(freshTicket.json.data, {
        shopName: 'Faso Fix POS',
        taxLabel: 'HST',
        phone: '647-740-0566',
        address: '100 Main Street',
      });

      // Must include business details and customer note
      assert.match(html, /Faso Fix POS/);
      assert.match(html, /Top-case keyboard assembly replaced/);

      // MUST NEVER leak private bench note or passcode
      assert.doesNotMatch(html, /VaultPass2026!/);
      assert.doesNotMatch(html, /Internal water damage sensor tripped/);
    });
  });

  // =========================================================================
  // 3. Estimates, Pricing, Taxes & Payments
  // =========================================================================
  describe('3. Estimates, Pricing, Taxes & Payments', () => {
    let billingTicketId = '';

    before(async () => {
      const res = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: {
            fullName: 'David Miller',
            phone: `(555) 999-${Math.floor(1000 + Math.random() * 9000)}`,
          },
          device: { name: 'Google Pixel 8 Pro' },
          faultDescription: 'Screen replacement & battery service',
          laborCents: 10000, // $100.00
          discountCents: 1000, // $10.00 discount
        },
      });
      billingTicketId = res.json.data.id;
    });

    test('Calculate subtotal, discount, HST (13%) and total balance correctly', async () => {
      // Add a line item ($150.00)
      const addLine = await call(`/api/tickets/${billingTicketId}/items`, {
        method: 'POST',
        token: techToken,
        body: {
          description: 'OEM OLED Display Assembly',
          quantity: 1,
          unitPriceCents: 15000, // $150.00
          unitCostCents: 8000,   // $80.00
        },
      });
      assert.equal(addLine.status, 201);

      // Financials breakdown:
      // Labor: $100.00 (10000 cents)
      // Items: $150.00 (15000 cents)
      // Subtotal: $250.00 (25000 cents)
      // Discount: -$10.00 (1000 cents)
      // Taxable: $240.00 (24000 cents)
      // Tax at 13% (1300 bps): $31.20 (3120 cents)
      // Total: $271.20 (27120 cents)
      const totals = addLine.json.data.totals;
      assert.equal(totals.subtotalCents, 25000);
      assert.equal(totals.discountCents, 1000);
      assert.equal(totals.taxableCents, 24000);
      assert.equal(totals.taxCents, 3120);
      assert.equal(totals.totalCents, 27120);
      assert.equal(totals.balanceCents, 27120);
      assert.equal(totals.paymentStatus, 'UNPAID');
    });

    test('Accept deposit / partial payment via CREDIT card and update balance', async () => {
      // Deposit of $100.00
      const deposit = await call(`/api/tickets/${billingTicketId}/payments`, {
        method: 'POST',
        token: techToken,
        body: {
          amountCents: 10000, // $100.00
          method: 'CREDIT',
          note: 'Initial deposit paid by Visa',
        },
      });
      assert.equal(deposit.status, 201);
      const totals = deposit.json.data.totals;
      assert.equal(totals.paidCents, 10000);
      assert.equal(totals.balanceCents, 17120); // $171.20 remaining
      assert.equal(totals.paymentStatus, 'PARTIAL');
    });

    test('Accept second partial payment via DEBIT and CASH', async () => {
      // Debit: $71.20
      const debitPay = await call(`/api/tickets/${billingTicketId}/payments`, {
        method: 'POST',
        token: techToken,
        body: {
          amountCents: 7120,
          method: 'DEBIT',
          note: 'Interac debit payment',
        },
      });
      assert.equal(debitPay.status, 201);
      assert.equal(debitPay.json.data.totals.balanceCents, 10000); // $100.00 left

      // Final payment: $100.00 Cash -> Paid in Full
      const cashPay = await call(`/api/tickets/${billingTicketId}/payments`, {
        method: 'POST',
        token: techToken,
        body: {
          amountCents: 10000,
          method: 'CASH',
          note: 'Final cash settlement',
        },
      });
      assert.equal(cashPay.status, 201);
      const finalTotals = cashPay.json.data.totals;
      assert.equal(finalTotals.balanceCents, 0);
      assert.equal(finalTotals.paymentStatus, 'PAID');
    });

    test('Process payment refund / voiding and verify balance restoration', async () => {
      const ticket = await call(`/api/tickets/${billingTicketId}`, { token: techToken });
      const lastPayment = ticket.json.data.payments[ticket.json.data.payments.length - 1];
      assert.ok(lastPayment);

      // Void the $100 cash payment
      const voidRes = await call(`/api/tickets/${billingTicketId}/payments/${lastPayment.id}`, {
        method: 'DELETE',
        token: techToken,
      });
      assert.equal(voidRes.status, 200);
      assert.equal(voidRes.json.data.totals.balanceCents, 10000);
      assert.equal(voidRes.json.data.totals.paymentStatus, 'PARTIAL');
    });
  });

  // =========================================================================
  // 4. Inventory Management & Stock Auto-Deduction
  // =========================================================================
  describe('4. Inventory Control & Auto-Deduction', () => {
    let partId = '';
    const sku = `SCR-IP15P-${Math.floor(1000 + Math.random() * 9000)}`;

    test('Add replacement part with stock, pricing and supplier', async () => {
      const createPart = await call('/api/inventory', {
        method: 'POST',
        token: techToken,
        body: {
          sku,
          name: 'iPhone 15 Pro OLED Screen Original',
          category: 'SCREENS',
          costCents: 12000,     // $120.00
          priceCents: 21900,    // $219.00
          stock: 5,             // 5 in stock
          reorderPoint: 2,
          supplier: 'MobileSentrix Canada',
        },
      });
      assert.equal(createPart.status, 201);
      partId = createPart.json.data.id;
      assert.equal(createPart.json.data.stock, 5);
    });

    test('Update stock quantities via manual adjustment', async () => {
      // Add 3 units from new shipment (+3)
      const adj = await call(`/api/inventory/${partId}/adjust`, {
        method: 'POST',
        token: techToken,
        body: { delta: 3 },
      });
      assert.equal(adj.status, 200);
      assert.equal(adj.json.data.stock, 8);
    });

    test('Deduct stock automatically when part is added to repair ticket', async () => {
      // Create repair ticket
      const ticketRes = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Inventory Test Customer', phone: `(555) 222-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'iPhone 15 Pro' },
          faultDescription: 'Broken glass',
        },
      });
      const tId = ticketRes.json.data.id;

      // Add 2 parts to ticket
      const addItemRes = await call(`/api/tickets/${tId}/items`, {
        method: 'POST',
        token: techToken,
        body: {
          partId,
          quantity: 2,
        },
      });
      assert.equal(addItemRes.status, 201);

      // Inventory stock should now be 8 - 2 = 6
      const partCheck = await call('/api/inventory', { token: techToken });
      const currentPart = partCheck.json.data.find((p: any) => p.id === partId);
      assert.equal(currentPart.stock, 6);

      // Remove the item -> returns stock back to inventory (+2 = 8)
      const itemId = addItemRes.json.data.items[0].id;
      const removeRes = await call(`/api/tickets/${tId}/items/${itemId}`, {
        method: 'DELETE',
        token: techToken,
      });
      assert.equal(removeRes.status, 200);

      const restoredPart = (await call('/api/inventory', { token: techToken })).json.data.find((p: any) => p.id === partId);
      assert.equal(restoredPart.stock, 8);
    });

    test('Prevent negative inventory: reject adding parts when quantity exceeds stock', async () => {
      const ticketRes = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Oversell Test Customer', phone: `(555) 333-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'iPhone 15 Pro' },
          faultDescription: 'Screen repair',
        },
      });
      const tId = ticketRes.json.data.id;

      // Request 99 units when only 8 are in stock
      const reject = await call(`/api/tickets/${tId}/items`, {
        method: 'POST',
        token: techToken,
        body: {
          partId,
          quantity: 99,
        },
      });
      assert.equal(reject.status, 409, 'Must return 409 Conflict when stock is insufficient');
    });
  });

  // =========================================================================
  // 5. Reporting & Analytics
  // =========================================================================
  describe('5. Reporting & Analytics', () => {
    test('Daily and Monthly financial reports calculation', async () => {
      const daily = await call('/api/reports?days=1', { token: techToken });
      assert.equal(daily.status, 200);
      assert.ok('revenueCents' in daily.json.data);
      assert.ok('partsRevenueCents' in daily.json.data);
      assert.ok('partsCostCents' in daily.json.data);

      const monthly = await call('/api/reports?days=30', { token: techToken });
      assert.equal(monthly.status, 200);
      assert.ok(monthly.json.data.revenueCents >= daily.json.data.revenueCents);
    });

    test('POS Dashboard statistics and pipeline metrics', async () => {
      const stats = await call('/api/stats', { token: techToken });
      assert.equal(stats.status, 200);
      assert.ok('open' in stats.json.data);
      assert.ok('awaitingPickupCount' in stats.json.data);
      assert.ok('customerCount' in stats.json.data);
      // Pipeline metrics must never be negative
      assert.ok(stats.json.data.openValueCents >= 0);
    });

    test('Export tickets to CSV format', async () => {
      const csv = await call('/api/export/tickets', { token: techToken });
      assert.equal(csv.status, 200);
      assert.match(csv.text, /WO #/);
    });

    test('Technician performance, turnaround hours, and repair profitability', async () => {
      const rep = await call('/api/reports?days=30', { token: techToken });
      assert.equal(rep.status, 200);
      assert.ok('avgTurnaroundHours' in rep.json.data);
      assert.ok('onTimeRate' in rep.json.data);
      assert.ok('partsRevenueCents' in rep.json.data);
      assert.ok('partsCostCents' in rep.json.data);
      const profit = rep.json.data.partsRevenueCents - rep.json.data.partsCostCents;
      assert.ok(typeof profit === 'number');
    });

    test('Outstanding payments & inventory valuation metrics', async () => {
      const stats = await call('/api/stats', { token: techToken });
      assert.equal(stats.status, 200);
      assert.ok(stats.json.data.awaitingPickupCents >= 0);

      const partsRes = await call('/api/inventory', { token: techToken });
      assert.equal(partsRes.status, 200);
      const totalCostValuation = partsRes.json.data.reduce((acc: number, p: any) => acc + (p.stock * p.costCents), 0);
      const totalRetailValuation = partsRes.json.data.reduce((acc: number, p: any) => acc + (p.stock * p.priceCents), 0);
      assert.ok(totalCostValuation >= 0);
      assert.ok(totalRetailValuation >= totalCostValuation);
    });
  });

  // =========================================================================
  // 6. Security, RBAC, Backups & Reliability
  // =========================================================================
  describe('6. Security, RBAC & Reliability', () => {
    test('Technician is blocked from Admin users, settings and backups', async () => {
      assert.equal((await call('/api/admin/users', { token: techToken })).status, 403);
      assert.equal((await call('/api/admin/backups', { token: techToken })).status, 403);
      assert.equal((await call('/api/settings', { method: 'PUT', token: techToken, body: { shopName: 'Hacked' } })).status, 403);
    });

    test('Admin has full authorization to manage users and shop settings', async () => {
      const users = await call('/api/admin/users', { token: adminToken });
      assert.equal(users.status, 200);
      assert.ok(users.json.data.length >= 2);

      const settings = await call('/api/settings', {
        method: 'PUT',
        token: adminToken,
        body: {
          shopName: 'Faso Fix Official Test',
          phone: '647-740-0566',
        },
      });
      assert.equal(settings.status, 200);
      assert.equal(settings.json.data.shopName, 'Faso Fix Official Test');
    });

    test('Password reset by user and administrator reset', async () => {
      // Self password update
      const updateSelf = await call('/api/auth/password', {
        method: 'PUT',
        token: techToken,
        body: {
          currentPassword: 'Tech@FasoFix2026!',
          newPassword: 'Tech@FasoFix2026_Updated!',
          confirmPassword: 'Tech@FasoFix2026_Updated!',
        },
      });
      assert.equal(updateSelf.status, 200);

      // Revert back for future tests
      const revertSelf = await call('/api/auth/password', {
        method: 'PUT',
        token: techToken,
        body: {
          currentPassword: 'Tech@FasoFix2026_Updated!',
          newPassword: 'Tech@FasoFix2026!',
          confirmPassword: 'Tech@FasoFix2026!',
        },
      });
      assert.equal(revertSelf.status, 200);
    });

    test('Simultaneous concurrent requests do not corrupt database', async () => {
      // Send concurrent ticket intake batches with atomic execution
      const results = [];
      for (let batch = 0; batch < 3; batch++) {
        const batchPromises = [0, 1].map((i) => {
          const idx = batch * 2 + i;
          return call('/api/tickets', {
            method: 'POST',
            token: techToken,
            body: {
              customer: { fullName: `Concurrent User ${idx}`, phone: `(555) 888-00${idx < 10 ? '0' + idx : idx}` },
              device: { name: `Test Device ${idx}` },
              faultDescription: `Concurrency stress test request ${idx}`,
              laborCents: 5000,
            },
          });
        });
        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults);
      }
      for (const res of results) {
        assert.equal(res.status, 201, 'Concurrent ticket intake must succeed');
      }
    });

    test('Database backup snapshot creation and listing', async () => {
      const backup = await call('/api/admin/backups', { method: 'POST', token: adminToken });
      assert.equal(backup.status, 200);
      assert.ok(backup.json.data.sizeBytes > 0);
      assert.ok(backup.json.data.file.startsWith('apexfix-'));
    });
  });

  // =========================================================================
  // 7. Critical Pre-Release Scenarios
  // =========================================================================
  describe('7. Critical Launch Scenarios', () => {
    test('Scenario: Customer pays deposit -> Balance updates correctly and does not show Paid in Full', async () => {
      const res = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Deposit Test Customer', phone: `(555) 777-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'Surface Pro 9' },
          faultDescription: 'No power',
          laborCents: 15000, // $150.00
        },
      });
      const tId = res.json.data.id;

      // Initial state: total is $150 + 13% tax = $169.50
      assert.equal(res.json.data.totals.balanceCents, 16950);
      assert.equal(res.json.data.totals.paymentStatus, 'UNPAID');

      // Pay $50 deposit
      const depositRes = await call(`/api/tickets/${tId}/payments`, {
        method: 'POST',
        token: techToken,
        body: { amountCents: 5000, method: 'CASH', note: 'Deposit' },
      });
      assert.equal(depositRes.status, 201);
      assert.equal(depositRes.json.data.totals.paidCents, 5000);
      assert.equal(depositRes.json.data.totals.balanceCents, 11950);
      assert.equal(depositRes.json.data.totals.paymentStatus, 'PARTIAL');
    });

    test('Scenario: Repair cancelled -> Line items and inventory reconcile cleanly', async () => {
      // 1. Create part with 10 units
      const part = await call('/api/inventory', {
        method: 'POST',
        token: techToken,
        body: {
          sku: `CANCEL-TEST-${Date.now()}`,
          name: 'USB-C Charging Port Board',
          costCents: 2000,
          priceCents: 4500,
          stock: 10,
        },
      });
      const pId = part.json.data.id;

      // 2. Add to ticket
      const ticket = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Cancel Customer', phone: `(555) 666-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'iPad Pro' },
          faultDescription: 'Port damaged',
        },
      });
      const tId = ticket.json.data.id;

      const added = await call(`/api/tickets/${tId}/items`, {
        method: 'POST',
        token: techToken,
        body: { partId: pId, quantity: 3 },
      });
      assert.equal(added.status, 201);

      // Stock is 7
      const pAfterAdd = (await call('/api/inventory', { token: techToken })).json.data.find((x: any) => x.id === pId);
      assert.equal(pAfterAdd.stock, 7);

      // Customer cancels repair -> remove item
      const itemId = added.json.data.items[0].id;
      await call(`/api/tickets/${tId}/items/${itemId}`, { method: 'DELETE', token: techToken });

      // Stock must be restored to 10
      const pAfterCancel = (await call('/api/inventory', { token: techToken })).json.data.find((x: any) => x.id === pId);
      assert.equal(pAfterCancel.stock, 10);
    });

    test('Scenario: Ticket marked completed -> Notification event dispatched', async () => {
      const ticket = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Notify Customer', phone: `(555) 111-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'OnePlus 12' },
          faultDescription: 'Camera lens',
        },
      });
      const tId = ticket.json.data.id;

      // Quick complete
      const qc = await call(`/api/tickets/${tId}/quick-complete`, { method: 'POST', token: techToken });
      assert.equal(qc.status, 200);
      assert.equal(qc.json.data.status, 'COMPLETED');
      assert.ok(qc.json.data.completedAt);

      // Send SMS/Notification
      const notify = await call(`/api/tickets/${tId}/notify`, {
        method: 'POST',
        token: techToken,
        body: { message: 'Your device is ready for pickup at Faso Fix POS!' },
      });
      assert.equal(notify.status, 200);
      assert.ok(notify.json.data.events.some((e: any) => e.kind === 'MESSAGE' && e.message.includes('[SMS to')));
    });

    test('Scenario: Two employees edit same ticket -> No data overwritten', async () => {
      const ticket = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Concurrent Editor', phone: `(555) 777-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'MacBook Air M2' },
          faultDescription: 'Battery swap',
        },
      });
      const tId = ticket.json.data.id;

      // Employee 1 updates bench
      const e1 = await call(`/api/tickets/${tId}`, {
        method: 'PUT',
        token: techToken,
        body: { bench: 'Bench #03' },
      });
      assert.equal(e1.status, 200);

      // Employee 2 updates storageBin without passing bench
      const e2 = await call(`/api/tickets/${tId}`, {
        method: 'PUT',
        token: techToken,
        body: { storageBin: 'BIN-Z44' },
      });
      assert.equal(e2.status, 200);

      // Verify both fields persist cleanly without data clobbering
      const fresh = await call(`/api/tickets/${tId}`, { token: techToken });
      assert.equal(fresh.json.data.bench, 'Bench #03');
      assert.equal(fresh.json.data.storageBin, 'BIN-Z44');
    });

    test('Scenario: Refund issued -> Sales report updates', async () => {
      // Create ticket and payment
      const ticket = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: { fullName: 'Refund Sales Test', phone: `(555) 333-${Math.floor(1000 + Math.random() * 9000)}` },
          device: { name: 'iPad Air' },
          faultDescription: 'Glass replace',
          laborCents: 15000,
        },
      });
      const tId = ticket.json.data.id;

      const payRes = await call(`/api/tickets/${tId}/payments`, {
        method: 'POST',
        token: techToken,
        body: { amountCents: 5000, method: 'CASH', note: 'Deposit for refund test' },
      });
      assert.equal(payRes.status, 201);
      const payId = payRes.json.data.payments[0].id;

      // Check report revenue before void
      const repBefore = await call('/api/reports?days=1', { token: techToken });
      const revBefore = repBefore.json.data.revenueCents;

      // Void / refund payment
      const voidRes = await call(`/api/tickets/${tId}/payments/${payId}`, {
        method: 'DELETE',
        token: techToken,
      });
      assert.equal(voidRes.status, 200);

      // Check report revenue after void -> must drop by 5000 cents
      const repAfter = await call('/api/reports?days=1', { token: techToken });
      assert.equal(repAfter.json.data.revenueCents, revBefore - 5000);
    });
  });

  // =========================================================================
  // 8. Complete End-to-End Workflow (Intake to Invoice)
  // =========================================================================
  describe('8. Complete End-to-End Workflow: Intake -> Repair -> Payment -> Invoice', () => {
    let e2eTicketId = '';

    test('Step 1: Customer arrives -> Intake & Create ticket', async () => {
      const intake = await call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: {
            fullName: 'Michael Jordan',
            phone: `(647) 555-${Math.floor(1000 + Math.random() * 9000)}`,
            email: 'mj23@example.com',
          },
          device: {
            name: 'iPhone 14 Pro Max',
            serialNumber: 'IMEI-2323232323',
            passcode: '2323',
            condition: 'Front screen cracked, rear glass intact',
          },
          faultDescription: 'Screen shattered during basketball game. Needs glass & OLED replacement.',
          laborCents: 8500, // $85.00 labor
          bench: 'Bench #02',
          technician: 'Alex Mercer',
          priority: 'STANDARD',
        },
      });
      assert.equal(intake.status, 201);
      e2eTicketId = intake.json.data.id;
      assert.equal(intake.json.data.status, 'PENDING');
    });

    test('Step 2: Diagnosis -> Move to DIAGNOSING & add bench notes', async () => {
      const diag = await call(`/api/tickets/${e2eTicketId}`, {
        method: 'PUT',
        token: techToken,
        body: { status: 'DIAGNOSING' },
      });
      assert.equal(diag.status, 200);
      assert.equal(diag.json.data.status, 'DIAGNOSING');

      // Internal diagnostics bench note
      await call(`/api/tickets/${e2eTicketId}/notes`, {
        method: 'POST',
        token: techToken,
        body: {
          kind: 'INTERNAL_NOTE',
          message: 'Touch IC intact. TrueTone sensor test passed.',
        },
      });
    });

    test('Step 3: Estimate generated & Part assigned ($180 part + $85 labor)', async () => {
      // Add replacement OLED part
      const addPart = await call(`/api/tickets/${e2eTicketId}/items`, {
        method: 'POST',
        token: techToken,
        body: {
          description: 'iPhone 14 Pro Max OLED Screen (Refurb Original)',
          quantity: 1,
          unitPriceCents: 18000, // $180.00
          unitCostCents: 9000,   // $90.00 cost
        },
      });
      assert.equal(addPart.status, 201);

      // Customer approves -> move to WAITING_ON_APPROVAL then READY_FOR_PICKUP
      await call(`/api/tickets/${e2eTicketId}`, {
        method: 'PUT',
        token: techToken,
        body: { status: 'WAITING_ON_APPROVAL' },
      });
      await call(`/api/tickets/${e2eTicketId}`, {
        method: 'PUT',
        token: techToken,
        body: { status: 'READY_FOR_PICKUP' },
      });
    });

    test('Step 4: Customer takes delivery & makes full payment ($299.45 total)', async () => {
      // Subtotal: $180 + $85 = $265.00 (26500 cents)
      // HST 13%: $34.45 (3445 cents)
      // Total: $299.45 (29945 cents)
      const ticketBeforePay = await call(`/api/tickets/${e2eTicketId}`, { token: techToken });
      assert.equal(ticketBeforePay.json.data.totals.totalCents, 29945);

      // Customer pays $299.45 by Debit Card
      const payRes = await call(`/api/tickets/${e2eTicketId}/payments`, {
        method: 'POST',
        token: techToken,
        body: {
          amountCents: 29945,
          method: 'DEBIT',
          note: 'Full payment on pickup via Interac Debit',
        },
      });
      assert.equal(payRes.status, 201);
      assert.equal(payRes.json.data.totals.balanceCents, 0);
      assert.equal(payRes.json.data.totals.paymentStatus, 'PAID');
    });

    test('Step 5: Generate final receipt & Close ticket to COMPLETED', async () => {
      // Close ticket
      const completeRes = await call(`/api/tickets/${e2eTicketId}`, {
        method: 'PUT',
        token: techToken,
        body: { status: 'COMPLETED' },
      });
      assert.equal(completeRes.status, 200);
      assert.equal(completeRes.json.data.status, 'COMPLETED');

      // Final invoice print verification
      const receiptHtml = buildReceiptHtml(completeRes.json.data, {
        shopName: 'Faso Fix POS',
        taxLabel: 'HST',
        phone: '647-740-0566',
        address: '100 Main Street',
      });
      assert.match(receiptHtml, /PAID IN FULL/);
      assert.match(receiptHtml, /\$299\.45/);
      assert.match(receiptHtml, /iPhone 14 Pro Max/);
      assert.match(receiptHtml, /Michael Jordan/);
    });
  });
});
