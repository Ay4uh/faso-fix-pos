/**
 * ApexFix end-to-end API + unit tests.
 * Run with the API server running on :4000:   npm test
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
  try { json = JSON.parse(text); } catch {}
  return { status: res.status, json };
}

async function login(creds: object, adminMode = false) {
  const r = await call('/api/auth/login', { method: 'POST', body: { ...creds, adminMode } });
  assert.equal(r.status, 200, `login failed: ${JSON.stringify(r.json)}`);
  return r.json.token as string;
}

describe('Authentication & access control', () => {
  before(async () => {
    const adminToken = await login(ADMIN, true);
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
  });

  test('unauthenticated requests to POS data are rejected', async () => {
    for (const p of ['/api/tickets', '/api/customers', '/api/stats', '/api/settings', '/api/inventory']) {
      assert.equal((await call(p)).status, 401, p);
    }
  });

  test('wrong password returns 401 with a generic message', async () => {
    const r = await call('/api/auth/login', { method: 'POST', body: { usernameOrEmail: 'tech', password: 'nope' } });
    assert.equal(r.status, 401);
    assert.match(r.json.error, /Invalid username\/email or password/);
  });

  test('brute-force lockout after 5 failures', async () => {
    const user = `ghost_${Date.now()}`;
    for (let i = 0; i < 5; i++) {
      const r = await call('/api/auth/login', { method: 'POST', body: { usernameOrEmail: user, password: 'x' } });
      assert.equal(r.status, 401);
    }
    const locked = await call('/api/auth/login', { method: 'POST', body: { usernameOrEmail: user, password: 'x' } });
    assert.equal(locked.status, 429);
  });

  test('technician cannot use Admin Mode', async () => {
    const r = await call('/api/auth/login', { method: 'POST', body: { ...TECH, adminMode: true } });
    assert.equal(r.status, 403);
  });

  test('technician is blocked from admin endpoints', async () => {
    const t = await login(TECH);
    assert.equal((await call('/api/admin/users', { token: t })).status, 403);
    assert.equal((await call('/api/admin/backups', { token: t })).status, 403);
    assert.equal((await call('/api/settings', { method: 'PUT', token: t, body: { shopName: 'x' } })).status, 403);
  });

  test('logout revokes the session on the server', async () => {
    const t = await login(TECH);
    assert.equal((await call('/api/auth/me', { token: t })).json.authenticated, true);
    await call('/api/auth/logout', { method: 'POST', token: t });
    assert.equal((await call('/api/auth/me', { token: t })).json.authenticated, false);
    assert.equal((await call('/api/tickets', { token: t })).status, 401);
  });
});

describe('Tickets', () => {
  let tech = '';
  let techName = '';
  let admin = '';
  let ticketId = '';

  before(async () => {
    tech = await login(TECH);
    admin = await login(ADMIN, true);
    const me = await call('/api/auth/me', { token: tech });
    techName = me.json.user.name;
  });

  test('technician creates a ticket with optional alt phone', async () => {
    const r = await call('/api/tickets', {
      method: 'POST',
      token: tech,
      body: {
        customer: { fullName: 'Test Runner', phone: '(555) 000-1111', altPhone: '(555) 000-2222' },
        device: { name: 'iPhone 13', passcode: '1234' },
        faultDescription: 'Automated test ticket',
        laborCents: 0,
      },
    });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    ticketId = r.json.data.id;
    assert.ok(ticketId);
    assert.equal(r.json.data.customer.altPhone, '(555) 000-2222');
    assert.equal(r.json.data.createdBy, techName);
  });

  test('ticket preserves original createdBy after admin edits and is searchable by creator', async () => {
    const updated = await call(`/api/tickets/${ticketId}`, {
      method: 'PUT',
      token: admin,
      body: { status: 'DIAGNOSING' },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.json));
    assert.equal(updated.json.data.createdBy, techName);

    const fetched = await call(`/api/tickets/${ticketId}`, { token: tech });
    assert.equal(fetched.status, 200);
    assert.equal(fetched.json.data.createdBy, techName);

    const searched = await call(`/api/tickets?view=ALL&search=${encodeURIComponent(techName)}`, {
      token: tech,
    });
    assert.equal(searched.status, 200);
    const matched = (searched.json.data || []).find((t: any) => t.id === ticketId);
    assert.ok(matched, 'Ticket should appear when searching by creator name');
    assert.equal(matched.createdBy, techName);
  });

  test('GET /api/tickets filters accurately by from/to date range and returns totals', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
    const inMonth = await call(
      `/api/tickets?view=ALL&sort=createdAt&from=${encodeURIComponent(monthStart)}&to=${encodeURIComponent(monthEnd)}`,
      { token: tech }
    );
    assert.equal(inMonth.status, 200);
    const foundInMonth = (inMonth.json.data || []).find((t: any) => t.id === ticketId);
    assert.ok(foundInMonth, 'Created ticket must appear in current month range');
    assert.ok(foundInMonth.totals && typeof foundInMonth.totals.totalCents === 'number');
    assert.ok(Array.isArray(foundInMonth.payments));

    const prevMonthStart = new Date(now.getFullYear(), now.getMonth() - 2, 1, 0, 0, 0, 0).toISOString();
    const prevMonthEnd = new Date(now.getFullYear(), now.getMonth() - 1, 0, 23, 59, 59, 999).toISOString();
    const outOfRange = await call(
      `/api/tickets?view=ALL&from=${encodeURIComponent(prevMonthStart)}&to=${encodeURIComponent(prevMonthEnd)}`,
      { token: tech }
    );
    assert.equal(outOfRange.status, 200);
    const foundOld = (outOfRange.json.data || []).find((t: any) => t.id === ticketId);
    assert.equal(foundOld, undefined, 'Newly created ticket must not appear in an earlier month range');
  });

  test('GET /api/reports returns Master Report financials, daily/weekly series & performance breakdowns', async () => {
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0).toISOString();
    const monthEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999).toISOString();
    const res = await call(
      `/api/reports?from=${encodeURIComponent(monthStart)}&to=${encodeURIComponent(monthEnd)}`,
      { token: admin }
    );
    assert.equal(res.status, 200, JSON.stringify(res.json));
    const r = res.json.data;
    assert.equal(typeof r.revenueCents, 'number');
    assert.equal(typeof r.netRevenueCents, 'number');
    assert.equal(typeof r.grossProfitCents, 'number');
    assert.equal(typeof r.newCustomersCount, 'number');
    assert.equal(typeof r.returningCustomersCount, 'number');
    assert.ok(r.ticketsCreated >= 1, 'Expected at least 1 ticket created in month report');
    assert.ok(Array.isArray(r.daily) && r.daily.length >= 1);
    assert.ok(Array.isArray(r.weekly) && r.weekly.length >= 1);
    assert.ok(Array.isArray(r.staffPerformance) && r.staffPerformance.length >= 1);
    assert.ok(Array.isArray(r.devicePerformance) && r.devicePerformance.some((d: any) => d.name === 'iPhone 13'));
  });

  test('missing required fields are rejected', async () => {
    const r = await call('/api/tickets', { method: 'POST', token: tech, body: { customer: {}, device: {} } });
    assert.equal(r.status, 400);
  });

  test('technician cannot delete tickets', async () => {
    assert.equal((await call(`/api/tickets/${ticketId}`, { method: 'DELETE', token: tech })).status, 403);
  });

  test('admin can delete tickets', async () => {
    assert.equal((await call(`/api/tickets/${ticketId}`, { method: 'DELETE', token: admin })).status, 200);
  });
});

describe('Database backups', () => {
  test('admin can create and list backups', async () => {
    const admin = await login(ADMIN, true);
    const c = await call('/api/admin/backups', { method: 'POST', token: admin });
    assert.equal(c.status, 200, JSON.stringify(c.json));
    assert.ok(c.json.data.sizeBytes > 0);
    const l = await call('/api/admin/backups', { token: admin });
    assert.ok(l.json.data.some((b: any) => b.file === c.json.data.file));
  });

  test('backup download rejects path traversal', async () => {
    const admin = await login(ADMIN, true);
    const r = await call('/api/admin/backups/..%2F.env', { token: admin });
    assert.equal(r.status, 404);
  });
});

describe('Receipt builder (unit)', () => {
  const ticket: any = {
    ticketNumber: 42, laborCents: 5000, taxRateBps: 1300, faultDescription: 'Cracked <screen>',
    customer: { fullName: 'Jane', phone: '555' }, device: { name: 'Pixel 8', passcode: 'SECRET-PIN' },
    items: [{ description: 'Screen', quantity: 1, unitPriceCents: 10000 }],
    payments: [{ method: 'CASH', amountCents: 2000, createdAt: new Date().toISOString() }],
    events: [
      { kind: 'CUSTOMER_NOTE', message: 'Replaced display' },
      { kind: 'INTERNAL_NOTE', message: 'PRIVATE bench note' },
    ],
    totals: { subtotalCents: 15000, discountCents: 0, taxRateBps: 1300, taxCents: 1950, totalCents: 16950, paidCents: 2000, balanceCents: 14950 },
  };
  const html = buildReceiptHtml(ticket, { shopName: 'ApexFix', taxLabel: 'HST' });

  test('includes totals and public notes', () => {
    assert.match(html, /\$169\.50/);
    assert.match(html, /\$149\.50/);
    assert.match(html, /Replaced display/);
    assert.match(html, /HST \(13\.00%\)/);
  });

  test('never leaks private bench notes or passcodes', () => {
    assert.doesNotMatch(html, /PRIVATE bench note/);
    assert.doesNotMatch(html, /SECRET-PIN/);
  });

  test('escapes HTML in user input', () => {
    assert.match(html, /Cracked &lt;screen&gt;/);
  });
});
