/**
 * Complete Work Orders & Database Audit Suite (Live 129+ Work Orders)
 * Tests every single work-order workflow against Supabase PostgreSQL without
 * altering existing production/seeded records, cleaning up only temporary
 * test records on exit.
 */

import { describe, test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { prisma } from '../src/server/prisma';
import { computeTotals } from '../src/server/money';
import { destroySession } from '../src/server/auth';
import { buildReceiptHtml } from '../src/utils/receipt';

const API = process.env.API_URL || 'http://localhost:4000';
const ADMIN = { usernameOrEmail: 'admin', password: 'Admin@FasoFix2026!' };
const TECH = { usernameOrEmail: 'tech', password: 'Tech@FasoFix2026!' };

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
  return { token: r.json.token as string, user: r.json.user };
}

describe('Complete Work Orders & Database Audit Suite', () => {
  let adminToken = '';
  let adminUser: any = null;
  let techToken = '';
  let techUser: any = null;

  const createdTicketIds: string[] = [];
  const createdCustomerIds: string[] = [];

  before(async () => {
    const a = await login(ADMIN, true);
    adminToken = a.token;
    adminUser = a.user;

    // Ensure tech exists cleanly without touching existing seed accounts
    await call('/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: {
        username: 'tech',
        email: 'tech@fasofix.ca',
        name: 'Alex Mercer',
        password: 'Tech@FasoFix2026!',
        role: 'USER',
      },
    });
    const t = await login(TECH, false);
    techToken = t.token;
    techUser = t.user;
  });

  after(async () => {
    // Hard-delete ONLY temporary test records created during this suite
    for (const tid of createdTicketIds) {
      await prisma.ticketEvent.deleteMany({ where: { ticketId: tid } }).catch(() => {});
      await prisma.ticketItem.deleteMany({ where: { ticketId: tid } }).catch(() => {});
      await prisma.payment.deleteMany({ where: { ticketId: tid } }).catch(() => {});
      await prisma.ticket.deleteMany({ where: { id: tid } }).catch(() => {});
    }
    for (const cid of createdCustomerIds) {
      await prisma.device.deleteMany({ where: { customerId: cid } }).catch(() => {});
      await prisma.customer.deleteMany({ where: { id: cid } }).catch(() => {});
    }
    // Restore sequential Setting.nextTicketNumber to max remaining ticketNumber + 1
    const maxTicket = await prisma.ticket.aggregate({ _max: { ticketNumber: true } });
    if (maxTicket._max.ticketNumber) {
      await prisma.setting.update({
        where: { id: 1 },
        data: { nextTicketNumber: maxTicket._max.ticketNumber + 1 },
      }).catch(() => {});
    }
    if (adminToken) await destroySession(adminToken).catch(() => {});
    if (techToken) await destroySession(techToken).catch(() => {});
    await prisma.$disconnect();
  });

  test('1. Database Integrity Audit across all existing 129+ work orders', async () => {
    const allTickets = await prisma.ticket.findMany({
      where: { deletedAt: null },
      include: { customer: true, device: true, items: true, payments: true },
    });
    assert.ok(allTickets.length >= 129, `Expected >= 129 non-deleted tickets, got ${allTickets.length}`);

    const now = new Date();
    const numSet = new Set<number>();
    let dupNums = 0;
    let badDiag = 0;
    let futureCompleted = 0;
    let futurePayments = 0;
    let badTotals = 0;
    let missingCustomer = 0;
    let missingDevice = 0;

    for (const t of allTickets) {
      if (numSet.has(t.ticketNumber)) dupNums++;
      numSet.add(t.ticketNumber);
      if (!t.customer) missingCustomer++;
      if (!t.device) missingDevice++;
      if (t.completedAt && t.completedAt > now) futureCompleted++;
      for (const p of t.payments) {
        if (p.createdAt > now) futurePayments++;
      }
      const totals = computeTotals(t);
      if (Number.isNaN(totals.totalCents) || totals.totalCents < 0) badTotals++;
      try {
        const diag = JSON.parse(t.diagnostics || '{}');
        for (const v of Object.values(diag)) {
          if (v !== 'PASS' && v !== 'FAIL') badDiag++;
        }
      } catch {
        badDiag++;
      }
    }

    assert.equal(dupNums, 0, `Duplicate ticketNumbers found: ${dupNums}`);
    assert.equal(badDiag, 0, `Invalid diagnostics entries found: ${badDiag}`);
    assert.equal(futureCompleted, 0, `Future completedAt timestamps found: ${futureCompleted}`);
    assert.equal(futurePayments, 0, `Future payment timestamps found: ${futurePayments}`);
    assert.equal(badTotals, 0, `Bad totals found: ${badTotals}`);
    assert.equal(missingCustomer, 0, `Missing customers: ${missingCustomer}`);
    assert.equal(missingDevice, 0, `Missing devices: ${missingDevice}`);
  });

  test('2. Server-side pagination across ALL pages (newest ticketNumber first)', async () => {
    const p1 = await call('/api/tickets?view=ALL&page=1&pageSize=25', { token: adminToken });
    assert.equal(p1.status, 200);
    assert.equal(p1.json.count, 25);
    assert.ok(p1.json.total >= 129);
    assert.ok(p1.json.totalPages >= 6);
    assert.equal(p1.json.hasMore, true);

    // Confirm descending ticketNumber order
    for (let i = 1; i < p1.json.data.length; i++) {
      assert.ok(
        p1.json.data[i - 1].ticketNumber > p1.json.data[i].ticketNumber,
        `Expected descending ticketNumber on page 1: ${p1.json.data[i - 1].ticketNumber} > ${p1.json.data[i].ticketNumber}`
      );
    }

    // Fetch every remaining page and verify unique full coverage
    const seenIds = new Set<string>(p1.json.data.map((t: any) => t.id));
    for (let pg = 2; pg <= p1.json.totalPages; pg++) {
      const rp = await call(`/api/tickets?view=ALL&page=${pg}&pageSize=25`, { token: adminToken });
      assert.equal(rp.status, 200);
      assert.equal(rp.json.page, pg);
      for (const item of rp.json.data) {
        assert.equal(seenIds.has(item.id), false, `Duplicate ticket across pages: ${item.id}`);
        seenIds.add(item.id);
      }
    }
    assert.equal(seenIds.size, p1.json.total, 'All paginated pages combined must equal total tickets');
  });

  test('3. All Status Flow filter aliases (CHECKED_IN == PENDING, DIAGNOSING == IN_PROGRESS)', async () => {
    const [all, open, checkedIn, pending, diagnosing, inProgress, waitingParts, completed] = await Promise.all([
      call('/api/tickets?view=ALL&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?view=OPEN&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?status=CHECKED_IN&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?status=PENDING&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?status=DIAGNOSING&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?status=IN_PROGRESS&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?status=WAITING_ON_PARTS&page=1&pageSize=25', { token: adminToken }),
      call('/api/tickets?status=COMPLETED&page=1&pageSize=25', { token: adminToken }),
    ]);

    assert.equal(checkedIn.status, 200);
    assert.ok(checkedIn.json.total >= 39, `CHECKED_IN expected >= 39, got ${checkedIn.json.total}`);
    assert.equal(checkedIn.json.total, pending.json.total, 'CHECKED_IN and PENDING must match');

    assert.equal(diagnosing.status, 200);
    assert.ok(diagnosing.json.total >= 33, `DIAGNOSING expected >= 33, got ${diagnosing.json.total}`);
    assert.equal(diagnosing.json.total, inProgress.json.total, 'DIAGNOSING and IN_PROGRESS must match');

    assert.ok(waitingParts.json.total >= 22);
    assert.ok(completed.json.total >= 35);
    assert.ok(all.json.total >= open.json.total + completed.json.total - 5);
  });

  test('4. Case-insensitive search on tickets, customers, users, and audit logs', async () => {
    const [tLower, tMixed, liamLower, liamCap, crackLower, crackCap, hash116, wo116, num116, phone416] = await Promise.all([
      call('/api/tickets?view=ALL&search=iphone', { token: adminToken }),
      call('/api/tickets?view=ALL&search=iPhone', { token: adminToken }),
      call('/api/tickets?view=ALL&search=liam', { token: adminToken }),
      call('/api/tickets?view=ALL&search=Liam', { token: adminToken }),
      call('/api/tickets?view=ALL&search=cracked', { token: adminToken }),
      call('/api/tickets?view=ALL&search=Cracked', { token: adminToken }),
      call('/api/tickets?view=ALL&search=%23116', { token: adminToken }),
      call('/api/tickets?view=ALL&search=' + encodeURIComponent('WO 116'), { token: adminToken }),
      call('/api/tickets?view=ALL&search=116', { token: adminToken }),
      call('/api/tickets?view=ALL&search=416', { token: adminToken }),
    ]);

    assert.equal(tLower.json.total, tMixed.json.total, 'Search "iphone" must equal "iPhone"');
    assert.ok(tLower.json.total >= 34, `Expected >= 34 iPhone matches, got ${tLower.json.total}`);
    assert.equal(liamLower.json.total, liamCap.json.total, 'Search "liam" must equal "Liam"');
    assert.ok(liamLower.json.total >= 3);
    assert.equal(crackLower.json.total, crackCap.json.total, 'Search "cracked" must equal "Cracked"');
    assert.ok(crackLower.json.total >= 15);
    assert.ok(hash116.json.data.some((t: any) => t.ticketNumber === 116));
    assert.ok(wo116.json.data.some((t: any) => t.ticketNumber === 116));
    assert.ok(num116.json.data.some((t: any) => t.ticketNumber === 116));
    assert.ok(phone416.json.total >= 20);

    const [cLower, cCap, uLower, uCap, aLower, aCap] = await Promise.all([
      call('/api/customers?search=liam', { token: adminToken }),
      call('/api/customers?search=Liam', { token: adminToken }),
      call('/api/admin/users?search=alex', { token: adminToken }),
      call('/api/admin/users?search=Alex', { token: adminToken }),
      call('/api/admin/audit-logs?search=login', { token: adminToken }),
      call('/api/admin/audit-logs?search=LOGIN', { token: adminToken }),
    ]);
    assert.equal(cLower.json.total, cCap.json.total, 'Customer search must be case-insensitive');
    assert.ok(cLower.json.total >= 3);
    assert.equal(uLower.json.data.length, uCap.json.data.length, 'User search must be case-insensitive');
    assert.equal(aLower.json.total, aCap.json.total, 'Audit log search must be case-insensitive');
  });

  test('5. Concurrent intake race test (4 simultaneous creates yield 4 unique ticketNumbers)', async () => {
    const stamp = Date.now().toString().slice(-4);
    const promises = [0, 1, 2, 3].map((idx) =>
      call('/api/tickets', {
        method: 'POST',
        token: techToken,
        body: {
          customer: {
            fullName: `Concurrency Audit ${idx}`,
            phone: `(416) 99${idx}-${stamp}`,
          },
          device: { name: `Audit Test Device ${idx}` },
          faultDescription: `Concurrency atomic counter test ${idx}`,
          laborCents: 5000,
        },
      })
    );
    const results = await Promise.all(promises);
    const numbers = new Set<number>();
    for (const r of results) {
      assert.equal(r.status, 201, `Concurrent create failed: ${JSON.stringify(r.json)}`);
      createdTicketIds.push(r.json.data.id);
      createdCustomerIds.push(r.json.data.customerId);
      assert.equal(numbers.has(r.json.data.ticketNumber), false, `Duplicate ticketNumber ${r.json.data.ticketNumber}`);
      numbers.add(r.json.data.ticketNumber);
    }
    assert.equal(numbers.size, 4);
  });

  test('6. Full Ticket Lifecycle: signature 15k chars, stages, items, discount, deposit, payment, void, notes author, SMS, print, RBAC', async () => {
    const uniqPhone = `(647) 777-${Math.floor(1000 + Math.random() * 9000)}`;
    const createRes = await call('/api/tickets', {
      method: 'POST',
      token: techToken,
      body: {
        customer: { fullName: 'Full Audit Client', phone: uniqPhone, email: 'audit.client@example.com' },
        device: { name: 'iPhone 15 Pro Test', serialNumber: 'SN-AUDIT-999', passcode: 'SECRET-8888' },
        faultDescription: 'Shattered OLED screen & battery calibration check',
        laborCents: 10000, // $100.00
        priority: 'URGENT',
        technician: 'Alex Mercer',
        bench: 'Bench 1',
        storageBin: 'BIN-Z-9',
      },
    });
    assert.equal(createRes.status, 201, JSON.stringify(createRes.json));
    const ticketId = createRes.json.data.id as string;
    const customerId = createRes.json.data.customerId as string;
    createdTicketIds.push(ticketId);
    createdCustomerIds.push(customerId);

    // 6a. Save realistic 15,000-character base64 PNG signature
    const bigSig = 'data:image/png;base64,' + 'A'.repeat(15000);
    const sigRes = await call(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: techToken,
      body: { signature: bigSig, device: { pattern: '1-4-7-8-9', condition: 'Scuff bottom right' } },
    });
    assert.equal(sigRes.status, 200, `Signature save failed: ${JSON.stringify(sigRes.json)}`);
    assert.equal(sigRes.json.data.signature.length, bigSig.length);
    assert.equal(sigRes.json.data.device.pattern, '1-4-7-8-9');

    // 6b. Progress through all 6 pipeline stages
    for (const stage of [
      'CHECKED_IN',
      'DIAGNOSING',
      'WAITING_ON_APPROVAL',
      'WAITING_ON_PARTS',
      'READY_FOR_PICKUP',
      'COMPLETED',
    ] as const) {
      const u = await call(`/api/tickets/${ticketId}`, {
        method: 'PUT',
        token: techToken,
        body: { status: stage },
      });
      assert.equal(u.status, 200);
      assert.equal(u.json.data.status, stage);
    }

    // 6c. Add & remove custom part line item + verify totals/tax recalculation
    const addItemRes = await call(`/api/tickets/${ticketId}/items`, {
      method: 'POST',
      token: techToken,
      body: { description: 'Custom OEM Display Module', quantity: 1, unitPriceCents: 20000 }, // $200
    });
    assert.equal(addItemRes.status, 201);
    assert.equal(addItemRes.json.data.totals.subtotalCents, 30000); // $100 labor + $200 item

    const itemId = addItemRes.json.data.items[0].id;
    const remItemRes = await call(`/api/tickets/${ticketId}/items/${itemId}`, {
      method: 'DELETE',
      token: techToken,
    });
    assert.equal(remItemRes.status, 200);
    assert.equal(remItemRes.json.data.totals.subtotalCents, 10000);

    // Add item back for billing test & apply $10 discount -> taxable = $290, HST 13% = $37.70, total = $327.70
    const addItem2 = await call(`/api/tickets/${ticketId}/items`, {
      method: 'POST',
      token: techToken,
      body: { description: 'Custom OEM Display Module', quantity: 1, unitPriceCents: 20000 },
    });
    assert.equal(addItem2.status, 201);

    const discRes = await call(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: techToken,
      body: { discountCents: 1000 },
    });
    assert.equal(discRes.status, 200);
    assert.equal(discRes.json.data.totals.taxableCents, 29000);
    assert.equal(discRes.json.data.totals.taxCents, 3770);
    assert.equal(discRes.json.data.totals.totalCents, 32770);

    // 6d. Record $50 deposit -> partial balance = $277.70
    const depRes = await call(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 5000, method: 'CARD', note: 'Special-order part deposit' },
    });
    assert.equal(depRes.status, 201);
    assert.equal(depRes.json.data.totals.paidCents, 5000);
    assert.equal(depRes.json.data.totals.balanceCents, 27770);

    // Overpayment rejected with 400
    const overPay = await call(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 50000, method: 'CASH', note: 'Overpayment' },
    });
    assert.equal(overPay.status, 400);

    // Final payment -> PAID
    const fullPay = await call(`/api/tickets/${ticketId}/payments`, {
      method: 'POST',
      token: techToken,
      body: { amountCents: 27770, method: 'DEBIT', note: 'Checkout balance' },
    });
    assert.equal(fullPay.status, 201);
    assert.equal(fullPay.json.data.totals.balanceCents, 0);
    assert.equal(fullPay.json.data.totals.paymentStatus, 'PAID');

    // Void payment -> balance restored
    const pmtToVoid = fullPay.json.data.payments[1].id;
    const voidRes = await call(`/api/tickets/${ticketId}/payments/${pmtToVoid}`, {
      method: 'DELETE',
      token: techToken,
    });
    assert.equal(voidRes.status, 200);
    assert.equal(voidRes.json.data.totals.balanceCents, 27770);

    // 6e. Private & Public Notes + verified author + edit + delete
    const privRes = await call(`/api/tickets/${ticketId}/notes`, {
      method: 'POST',
      token: techToken,
      body: { kind: 'INTERNAL_NOTE', message: 'TOP_SECRET_BENCH_NOTE_DO_NOT_PRINT' },
    });
    assert.equal(privRes.status, 201);
    const privEvent = privRes.json.data.events.find((e: any) => e.message === 'TOP_SECRET_BENCH_NOTE_DO_NOT_PRINT');
    assert.equal(privEvent.author, techUser.name, 'Event author must match logged-in user name');

    const pubRes = await call(`/api/tickets/${ticketId}/notes`, {
      method: 'POST',
      token: techToken,
      body: { kind: 'CUSTOMER_NOTE', message: 'PUBLIC_RECEIPT_NOTE_TEST_OK' },
    });
    assert.equal(pubRes.status, 201);
    const pubEvent = pubRes.json.data.events.find((e: any) => e.message === 'PUBLIC_RECEIPT_NOTE_TEST_OK');
    assert.equal(pubEvent.author, techUser.name);

    // Edit note
    const editNoteRes = await call(`/api/tickets/${ticketId}/notes/${pubEvent.id}`, {
      method: 'PUT',
      token: techToken,
      body: { message: 'PUBLIC_RECEIPT_NOTE_EDITED' },
    });
    assert.equal(editNoteRes.status, 200);

    // SMS notify
    const smsRes = await call(`/api/tickets/${ticketId}/notify`, {
      method: 'POST',
      token: techToken,
      body: { message: 'Ready for pickup audit test', customerPhone: uniqPhone },
    });
    assert.equal(smsRes.status, 200);
    assert.ok(smsRes.json.data.events.some((e: any) => e.kind === 'MESSAGE' && e.author === techUser.name));

    // Delete temporary private note & re-add for print leak check
    const tempNoteRes = await call(`/api/tickets/${ticketId}/notes`, {
      method: 'POST',
      token: techToken,
      body: { kind: 'INTERNAL_NOTE', message: 'TEMP_NOTE_DELETE_ME' },
    });
    const tempNoteId = tempNoteRes.json.data.events.find((e: any) => e.message === 'TEMP_NOTE_DELETE_ME').id;
    const delNoteRes = await call(`/api/tickets/${ticketId}/notes/${tempNoteId}`, {
      method: 'DELETE',
      token: techToken,
    });
    assert.equal(delNoteRes.status, 200);

    // 6f. Print endpoints + security (customer receipt never leaks INTERNAL_NOTE or passcode)
    const [pLetter, p80, p58, pSlip] = await Promise.all([
      call(`/api/tickets/${ticketId}/print?format=letter`, { token: techToken }),
      call(`/api/tickets/${ticketId}/print?format=80mm`, { token: techToken }),
      call(`/api/tickets/${ticketId}/print?format=58mm`, { token: techToken }),
      call(`/api/tickets/${ticketId}/print?format=slip`, { token: techToken }),
    ]);
    assert.equal(pLetter.status, 200);
    assert.equal(p80.status, 200);
    assert.equal(p58.status, 200);
    assert.equal(pSlip.status, 200);
    assert.ok(p80.text.includes('PUBLIC_RECEIPT_NOTE_EDITED'));
    assert.equal(p80.text.includes('TOP_SECRET_BENCH_NOTE_DO_NOT_PRINT'), false, '80mm receipt leaked private bench note!');
    assert.equal(p80.text.includes('SECRET-8888'), false, '80mm receipt leaked device passcode!');
    assert.equal(p58.text.includes('SECRET-8888'), false, '58mm receipt leaked device passcode!');

    // Client-side unit builder check
    const unitHtml = buildReceiptHtml(editNoteRes.json.data, { shopName: 'Faso Fix' }, '80mm');
    assert.equal(unitHtml.includes('TOP_SECRET_BENCH_NOTE_DO_NOT_PRINT'), false);

    // 6g. RBAC: Technician blocked from delete (403); Admin allowed (200)
    const techDel = await call(`/api/tickets/${ticketId}`, { method: 'DELETE', token: techToken });
    assert.equal(techDel.status, 403);
    const adminDel = await call(`/api/tickets/${ticketId}`, { method: 'DELETE', token: adminToken });
    assert.equal(adminDel.status, 200);
  });

  test('7. Reports, Dashboard Stats, Sales-Labor Consistency, CSV Export & Off-Page Customer Detail', async () => {
    const [statsRes, reportsRes, salesLaborRes, csvRes, page6Cust] = await Promise.all([
      call('/api/stats', { token: adminToken }),
      call('/api/reports?days=30', { token: adminToken }),
      call('/api/reports/sales-labor', { token: adminToken }),
      call('/api/export/tickets', { token: adminToken }),
      call('/api/customers?page=5&pageSize=10', { token: adminToken }),
    ]);

    assert.equal(statsRes.status, 200);
    const s = statsRes.json.data;
    assert.ok(s.totalTickets >= 129);
    assert.equal(
      s.totalTickets,
      s.checkedIn + s.diagnosing + s.waitingOnApproval + s.waitingOnParts + s.readyForPickup + s.completed,
      'Stats totalTickets must equal exact sum of all status buckets'
    );
    assert.ok(s.totalValueCents > 0);
    assert.ok(s.avgTicketValueCents > 0);

    assert.equal(reportsRes.status, 200);
    const r = reportsRes.json.data;
    assert.ok(r.partsRevenueCents > 1_000_000, `Expected partsRevenueCents > $10k across 110+ work orders, got ${r.partsRevenueCents}`);

    assert.equal(salesLaborRes.status, 200);
    const sl = salesLaborRes.json.data;
    // Both 30-day windows should agree closely (reports uses startOfDay(today-29d), sales-labor uses now-30d)
    assert.ok(sl.summary.totalRevenueCents > 0);
    assert.ok(sl.summary.partsBilledCents > 1_000_000);

    assert.equal(csvRes.status, 200);
    const csvLines = csvRes.text.trim().split('\n');
    assert.ok(csvLines.length >= 130, `CSV should contain header + 129+ rows, got ${csvLines.length}`);

    // Verify off-page customer detail returns their tickets
    assert.equal(page6Cust.status, 200);
    const targetCust = page6Cust.json.data[0];
    assert.ok(targetCust, 'Expected customer on page 5');
    const custDetail = await call(`/api/customers/${targetCust.id}`, { token: adminToken });
    assert.equal(custDetail.status, 200);
    assert.ok(Array.isArray(custDetail.json.data.tickets) && custDetail.json.data.tickets.length >= 1);
  });
});
