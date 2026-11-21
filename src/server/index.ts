import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import { ZodError } from 'zod';
import {
  HttpError,
  getSettings,
  updateSettings,
  listTickets,
  getTicket,
  createTicket,
  updateTicket,
  deleteTicket,
  addItem,
  removeItem,
  addPayment,
  voidPayment,
  addNote,
  updateNote,
  deleteNote,
  listCustomers,
  lookupCustomerByPhone,
  getCustomer,
  updateCustomer,
  listParts,
  createPart,
  updatePart,
  adjustStock,
  deletePart,
  getDashboard,
  getReport,
  exportTicketsCsv,
  loginUser,
  logoutUser,
  listUsers,
  getUser,
  createUser,
  updateUser,
  deleteUser,
  changeUserPassword,
  adminResetUserPassword,
  updateUserPreferences,
  listAuditLogs,
  getAdminOverview,
} from './service';
import { authenticateSession, ensureAdminProvisioning, recordAudit, verifySignedUserPayload } from './auth';
import { configureSqlite, createBackup, listBackups, resolveBackup, startBackupSchedule } from './backup';
import { ensureDatabaseSchema, ensureInitialInventory } from './initDb';
import * as payrollService from './payrollService';
import { prisma } from './prisma';
import { buildReceiptHtml, buildBenchSlipHtml, buildLetterInvoiceHtml } from '../utils/receipt';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        name: string;
        role: string;
        status: string;
        phone: string | null;
        bench: string | null;
        bio: string | null;
        preferences: string;
        lastLoginAt: Date | null;
        createdAt: Date;
      };
      token?: string;
    }
  }
}

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// Prevent any browser or CDN edge caching of dynamic POS API responses
app.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  res.setHeader('Pragma', 'no-cache');
  res.setHeader('Expires', '0');
  next();
});

// Session resolution middleware
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    let token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-session-token'] as string | undefined);

    if (!token && typeof req.query?.token === 'string') {
      token = req.query.token;
    }

    if (token) {
      req.token = token;
      const clientHeaders = {
        userId: req.headers['x-user-id'] as string | undefined,
        userName: req.headers['x-user-name'] as string | undefined,
        userRole: req.headers['x-user-role'] as string | undefined,
      };
      const user = await authenticateSession(token, clientHeaders);
      if (user) {
        req.user = user;
      }
    }
  } catch (err) {
    console.error('[Auth Middleware Error]', err);
  }
  next();
});

const wrap = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
};

const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }
  next();
};

const requireAdmin = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required. Please log in.' });
  }
  if (req.user.role !== 'ADMIN') {
    return res.status(403).json({ success: false, error: 'Access forbidden: Administrator privileges required.' });
  }
  next();
};

const getParam = (req: Request, name: string): string => {
  const val = req.params[name];
  return Array.isArray(val) ? val[0] : (val || '');
};

// ---------------------------------------------------------------------------
// Real-Time Server-Sent Events (SSE) Live Bus
// ---------------------------------------------------------------------------
interface SseClient {
  id: string;
  res: Response;
}

const sseClients: SseClient[] = [];

export function broadcastLiveEvent(event: string, data: any = {}) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (let i = sseClients.length - 1; i >= 0; i--) {
    try {
      sseClients[i].res.write(payload);
    } catch {
      sseClients.splice(i, 1);
    }
  }
}

app.get('/api/live/stream', (req: Request, res: Response) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  });
  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', time: Date.now() })}\n\n`);

  const clientId = crypto.randomUUID();
  const client: SseClient = { id: clientId, res };
  sseClients.push(client);

  const heartbeat = setInterval(() => {
    try {
      res.write(': heartbeat\n\n');
    } catch {
      clearInterval(heartbeat);
    }
  }, 15000);

  req.on('close', () => {
    clearInterval(heartbeat);
    const index = sseClients.findIndex((c) => c.id === clientId);
    if (index !== -1) sseClients.splice(index, 1);
  });
});

// ---------------------------------------------------------------------------
// Authentication & Current User Profile Routes
// ---------------------------------------------------------------------------

function getClientIp(req: Request): string {
  try {
    const forwarded = req.headers['x-forwarded-for'];
    if (typeof forwarded === 'string') {
      return forwarded.split(',')[0].trim();
    }
    if (Array.isArray(forwarded) && forwarded.length > 0) {
      return forwarded[0].trim();
    }
    const realIp = req.headers['x-real-ip'];
    if (typeof realIp === 'string') {
      return realIp.trim();
    }
    if (req.socket && req.socket.remoteAddress) {
      return req.socket.remoteAddress;
    }
    return req.ip || '127.0.0.1';
  } catch {
    return '127.0.0.1';
  }
}

// Brute-force protection: max 5 failed attempts per IP+username per 15 minutes
const LOGIN_WINDOW_MS = 15 * 60_000;
const LOGIN_MAX_FAILS = 5;
const loginFails = new Map<string, { count: number; first: number }>();

app.post('/api/auth/login', wrap(async (req, res) => {
  const ip = getClientIp(req);
  const who = String(req.body?.usernameOrEmail || '').trim().toLowerCase();
  const key = `${ip}|${who}`;
  const now = Date.now();
  const rec = loginFails.get(key);
  if (rec && now - rec.first > LOGIN_WINDOW_MS) loginFails.delete(key);
  const cur = loginFails.get(key);
  if (cur && cur.count >= LOGIN_MAX_FAILS) {
    const mins = Math.ceil((LOGIN_WINDOW_MS - (now - cur.first)) / 60_000);
    return res.status(429).json({ success: false, error: `Too many failed attempts. Try again in ${mins} minute(s).` });
  }
  try {
    const result = await loginUser(req.body, ip);
    loginFails.delete(key);
    res.json({ success: true, ...result });
  } catch (err) {
    if (err instanceof HttpError && err.status === 401) {
      const r = loginFails.get(key) || { count: 0, first: now };
      r.count += 1;
      loginFails.set(key, r);
    }
    throw err;
  }
}));

app.post('/api/auth/logout', wrap(async (req, res) => {
  const token = req.token;
  if (token) {
    await logoutUser(token, req.user?.name);
  }
  res.json({ success: true, message: 'Logged out successfully' });
}));

app.get('/api/auth/me', wrap(async (req, res) => {
  if (!req.user) {
    return res.json({ success: true, authenticated: false, user: null });
  }
  res.json({ success: true, authenticated: true, user: req.user });
}));

app.put('/api/auth/profile', requireAuth, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const updated = await updateUser(req.user!.id, req.body, actor);
  res.json({ success: true, user: updated });
}));

app.put('/api/auth/password', requireAuth, wrap(async (req, res) => {
  const result = await changeUserPassword(req.user!.id, req.body, req.user!.name);
  res.json(result);
}));

app.put('/api/auth/preferences', requireAuth, wrap(async (req, res) => {
  const updated = await updateUserPreferences(req.user!.id, req.body.preferences || req.body);
  res.json({ success: true, preferences: updated.preferences });
}));

// ---------------------------------------------------------------------------
// Administrator Management Endpoints (Strictly requireAdmin)
// ---------------------------------------------------------------------------

app.get('/api/admin/overview', requireAdmin, wrap(async (_req, res) => {
  const overview = await getAdminOverview();
  res.json({ success: true, data: overview });
}));

app.get('/api/users', requireAuth, wrap(async (req, res) => {
  const users = await listUsers({});
  res.json({ success: true, count: users.length, data: users, users });
}));

app.post('/api/sync/users', wrap(async (req, res) => {
  const { clientUsers, deletedUserIds } = req.body || {};
  if (Array.isArray(deletedUserIds) && deletedUserIds.length > 0) {
    await prisma.session.deleteMany({ where: { userId: { in: deletedUserIds } } }).catch(() => {});
    await prisma.user.deleteMany({ where: { id: { in: deletedUserIds } } }).catch(() => {});
  }
  if (Array.isArray(clientUsers) && clientUsers.length > 0) {
    for (const cu of clientUsers) {
      if (cu.payload && cu.signature) {
        const verified = verifySignedUserPayload(cu.payload, cu.signature);
        if (verified && verified.username && verified.passwordHash) {
          try {
            await prisma.user.upsert({
              where: { username: verified.username.toLowerCase() },
              update: {
                passwordHash: verified.passwordHash,
                name: verified.name,
                role: verified.role,
                status: verified.status || 'ACTIVE',
                phone: verified.phone ?? null,
                bench: verified.bench ?? 'Bench #01',
                bio: verified.bio ?? '',
              },
              create: {
                id: verified.id,
                username: verified.username.toLowerCase(),
                email: verified.email.toLowerCase(),
                name: verified.name,
                passwordHash: verified.passwordHash,
                role: verified.role,
                status: verified.status || 'ACTIVE',
                phone: verified.phone ?? null,
                bench: verified.bench ?? 'Bench #01',
                bio: verified.bio ?? '',
                preferences: verified.preferences ?? '{}',
              },
            });
          } catch {}
        }
      }
    }
  }
  const allUsers = await listUsers({});
  res.json({ success: true, count: allUsers.length, data: allUsers });
}));

app.get('/api/admin/users', requireAdmin, wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const role = req.query.role as string | undefined;
  const status = req.query.status as string | undefined;
  const users = await listUsers({ search, role, status });
  res.json({ success: true, count: users.length, data: users });
}));

app.post('/api/admin/users', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const user = await createUser(req.body, actor);
  res.status(201).json({ success: true, data: user });
}));

app.get('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const user = await getUser(getParam(req, 'id'));
  res.json({ success: true, data: user });
}));

app.put('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const user = await updateUser(getParam(req, 'id'), req.body, actor);
  res.json({ success: true, data: user });
}));

app.delete('/api/admin/users/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const result = await deleteUser(getParam(req, 'id'), actor);
  res.json(result);
}));

app.post('/api/admin/users/:id/reset-password', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const result = await adminResetUserPassword(getParam(req, 'id'), req.body, actor);
  res.json(result);
}));

app.get('/api/admin/audit-logs', requireAdmin, wrap(async (req, res) => {
  const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 100;
  const action = req.query.action as string | undefined;
  const search = req.query.search as string | undefined;
  const logs = await listAuditLogs({ limit, action, search });
  res.json({ success: true, count: logs.length, data: logs });
}));

// ---------------------------------------------------------------------------
// Dashboard, Stats & Reports
// ---------------------------------------------------------------------------

app.get('/api/dashboard', requireAuth, wrap(async (_req, res) => {
  const data = await getDashboard();
  res.json({ success: true, data });
}));

// Backwards compatibility endpoint for any dashboard KPI widgets
app.get('/api/stats', requireAuth, wrap(async (_req, res) => {
  const data = await getDashboard();
  res.json({
    success: true,
    data: {
      ...data,
      totalActive: data.open,
      waitingOnParts: data.waitingOnParts,
      completed: data.completed,
      pending: data.pending,
      inProgress: data.inProgress,
      totalPipeline: data.openValueCents / 100,
      projectedPipeline: data.openValueCents / 100,
      securedInvoiced: data.collectedMonthCents / 100,
      customerCount: data.customerCount,
    },
  });
}));

app.get('/api/reports', requireAuth, wrap(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
  const data = await getReport(days);
  res.json({ success: true, data });
}));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

app.get('/api/settings', requireAuth, wrap(async (_req, res) => {
  const settings = await getSettings();
  res.json({ success: true, data: settings });
}));

app.put('/api/settings', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const settings = await updateSettings(req.body, actor);
  broadcastLiveEvent('settings_updated', settings);
  res.json({ success: true, data: settings });
}));

// ---------------------------------------------------------------------------
// Tickets (Work Orders)
// ---------------------------------------------------------------------------

app.get('/api/tickets', requireAuth, wrap(async (req, res) => {
  const view = (req.query.view || req.query.status || 'OPEN') as string;
  const search = req.query.search as string | undefined;
  const bench = req.query.bench as string | undefined;
  const tickets = await listTickets({ view, search, bench });
  res.json({ success: true, count: tickets.length, data: tickets });
}));

app.get('/api/tickets/:id', requireAuth, wrap(async (req, res) => {
  const ticket = await getTicket(getParam(req, 'id'));
  res.json({ success: true, data: ticket });
}));

app.get('/api/tickets/:id/print', requireAuth, wrap(async (req, res) => {
  let ticket: any = null;
  try {
    ticket = await getTicket(getParam(req, 'id'));
  } catch {
    return res.status(200).send(`
      <!doctype html><html><head><title>Print Preview</title></head>
      <body style="font-family:sans-serif;padding:40px;text-align:center;color:#334155">
        <h2 style="color:#0f172a">Faso Fix POS • Print Dispatch</h2>
        <p>This work order is stored in your active POS browser session. Please click Print directly from your open work order screen in the POS terminal.</p>
        <button onclick="window.close()" style="margin-top:15px;padding:8px 18px;border-radius:6px;border:1px solid #cbd5e1;background:#f8fafc;font-weight:bold;cursor:pointer">Close Window</button>
      </body></html>
    `);
  }
  const shop = await getSettings();
  const format = (req.query.format as string) || 'letter';
  let html = '';

  if (format === '80mm') {
    html = buildReceiptHtml(ticket as any, shop, '80mm');
  } else if (format === '58mm') {
    html = buildReceiptHtml(ticket as any, shop, '58mm');
  } else if (format === 'slip' || format === 'bench') {
    html = buildBenchSlipHtml(ticket as any, shop);
  } else {
    html = buildLetterInvoiceHtml(ticket as any, shop);
  }

  // Inject auto-print script that focuses and prints reliably
  const autoPrint = `
    <script>
      window.addEventListener('load', function() {
        setTimeout(function() {
          try {
            window.focus();
            window.print();
          } catch (e) {
            console.error(e);
          }
        }, 200);
      });
    </script>
  `;
  html = html.replace('</body>', `${autoPrint}</body>`);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}));

app.post('/api/tickets', requireAuth, wrap(async (req, res) => {
  const ticket = await createTicket(req.body);
  broadcastLiveEvent('ticket_created', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.put('/api/tickets/:id', requireAuth, wrap(async (req, res) => {
  const ticket = await updateTicket(getParam(req, 'id'), req.body);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id', requireAdmin, wrap(async (req, res) => {
  const actor = { id: req.user!.id, name: req.user!.name };
  const ticketId = getParam(req, 'id');
  const result = await deleteTicket(ticketId);

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'TICKET_DELETE',
    details: `Administrator deleted work order ${ticketId}`,
  });

  broadcastLiveEvent('ticket_deleted', { id: ticketId });
  res.json({ success: true, data: result });
}));

// Quick complete shortcut
app.post('/api/tickets/:id/quick-complete', requireAuth, wrap(async (req, res) => {
  const ticket = await updateTicket(getParam(req, 'id'), { status: 'COMPLETED' });
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, message: 'Work order marked completed', data: ticket });
}));

// Line items / parts attachment
app.post('/api/tickets/:id/items', requireAuth, wrap(async (req, res) => {
  const ticket = await addItem(getParam(req, 'id'), req.body);
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

// Backward-compatible route for parts attachment
app.post('/api/tickets/:id/parts', requireAuth, wrap(async (req, res) => {
  const { partId, customName, price, quantity } = req.body;
  const ticket = await addItem(getParam(req, 'id'), {
    partId: partId || undefined,
    description: customName || undefined,
    unitPriceCents: price !== undefined ? Math.round(Number(price) * 100) : undefined,
    quantity: quantity ? Number(quantity) : 1,
  });
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/items/:itemId', requireAuth, wrap(async (req, res) => {
  const ticket = await removeItem(getParam(req, 'id'), getParam(req, 'itemId'));
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

// Payments
app.post('/api/tickets/:id/payments', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const amountCents = body.amountCents ?? (body.amount !== undefined ? Math.round(Number(body.amount) * 100) : undefined);
  const ticket = await addPayment(getParam(req, 'id'), {
    amountCents,
    method: body.method || 'CASH',
    note: body.note,
  });
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/payments/:paymentId', requireAuth, wrap(async (req, res) => {
  const ticket = await voidPayment(getParam(req, 'id'), getParam(req, 'paymentId'));
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

// Notes & notifications
app.post('/api/tickets/:id/notes', requireAuth, wrap(async (req, res) => {
  const { note, message, type, kind } = req.body;
  const noteKind = kind || (type === 'CUSTOMER' ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE');
  const ticket = await addNote(getParam(req, 'id'), {
    kind: noteKind,
    message: message || note || '',
  });
  broadcastLiveEvent('ticket_updated', ticket);
  res.status(201).json({ success: true, data: ticket });
}));

app.post('/api/tickets/:id/notify', requireAuth, wrap(async (req, res) => {
  const { message, customerPhone } = req.body;
  const ticket = await addNote(getParam(req, 'id'), {
    kind: 'MESSAGE',
    message: `[SMS to ${customerPhone || 'Customer'}]: ${message}`,
  });
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, message: `Notification sent to ${customerPhone}`, data: ticket });
}));

app.put('/api/tickets/:id/notes/:noteId', requireAuth, wrap(async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Note message cannot be empty' });
  }
  const ticket = await updateNote(getParam(req, 'id'), getParam(req, 'noteId'), message);
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/notes/:noteId', requireAuth, wrap(async (req, res) => {
  const ticket = await deleteNote(getParam(req, 'id'), getParam(req, 'noteId'));
  broadcastLiveEvent('ticket_updated', ticket);
  res.json({ success: true, data: ticket });
}));

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

app.get('/api/customers', requireAuth, wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const customers = await listCustomers(search);
  res.json({ success: true, count: customers.length, data: customers });
}));

app.get('/api/customers/lookup', requireAuth, wrap(async (req, res) => {
  const phone = (req.query.phone as string) || '';
  const customer = await lookupCustomerByPhone(phone);
  res.json({ success: true, data: customer });
}));

app.get('/api/customers/:id', requireAuth, wrap(async (req, res) => {
  const customer = await getCustomer(getParam(req, 'id'));
  res.json({ success: true, data: customer });
}));

app.put('/api/customers/:id', requireAuth, wrap(async (req, res) => {
  const customer = await updateCustomer(getParam(req, 'id'), req.body);
  broadcastLiveEvent('customer_updated', customer);
  res.json({ success: true, data: customer });
}));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

app.get('/api/inventory', requireAuth, wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const parts = await listParts(search);
  res.json({ success: true, count: parts.length, data: parts });
}));

app.post('/api/inventory', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const costCents = body.costCents ?? (body.cost !== undefined ? Math.round(Number(body.cost) * 100) : 0);
  const priceCents = body.priceCents ?? (body.retail !== undefined ? Math.round(Number(body.retail) * 100) : (body.price !== undefined ? Math.round(Number(body.price) * 100) : 0));
  const stock = body.stock ?? (body.stockQuantity !== undefined ? Number(body.stockQuantity) : 0);
  const reorderPoint = body.reorderPoint !== undefined ? Number(body.reorderPoint) : 2;

  const part = await createPart({
    sku: body.sku,
    name: body.name,
    category: body.category || 'GENERAL',
    costCents,
    priceCents,
    stock,
    reorderPoint,
    supplier: body.supplier,
  });
  broadcastLiveEvent('inventory_updated', part);
  res.status(201).json({ success: true, data: part });
}));

app.put('/api/inventory/:id', requireAuth, wrap(async (req, res) => {
  const body = req.body || {};
  const updateData: any = { ...body };
  if (body.cost !== undefined && body.costCents === undefined) {
    updateData.costCents = Math.round(Number(body.cost) * 100);
    delete updateData.cost;
  }
  if (body.retail !== undefined && body.priceCents === undefined) {
    updateData.priceCents = Math.round(Number(body.retail) * 100);
    delete updateData.retail;
  }
  if (body.stockQuantity !== undefined && body.stock === undefined) {
    updateData.stock = Number(body.stockQuantity);
    delete updateData.stockQuantity;
  }
  const part = await updatePart(getParam(req, 'id'), updateData);
  broadcastLiveEvent('inventory_updated', part);
  res.json({ success: true, data: part });
}));

app.post('/api/inventory/:id/adjust', requireAuth, wrap(async (req, res) => {
  const delta = Number(req.body.delta);
  if (isNaN(delta) || delta === 0) {
    throw new HttpError(400, 'A non-zero numeric delta is required for stock adjustment');
  }
  const part = await adjustStock(getParam(req, 'id'), delta);
  broadcastLiveEvent('inventory_updated', part);
  res.json({ success: true, data: part });
}));

app.delete('/api/inventory/:id', requireAdmin, wrap(async (req, res) => {
  const result = await deletePart(getParam(req, 'id'));
  broadcastLiveEvent('inventory_updated', { id: getParam(req, 'id') });
  res.json({ success: true, data: result });
}));

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

app.get('/api/export/tickets', requireAuth, wrap(async (_req, res) => {
  const csv = await exportTicketsCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="FasoFix-WorkOrders.csv"');
  res.send(csv);
}));

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Database Backups (Admin only)
// ---------------------------------------------------------------------------

app.get('/api/admin/backups', requireAdmin, (_req, res) => {
  res.json({ success: true, data: listBackups() });
});

app.post('/api/admin/backups', requireAdmin, wrap(async (req, res) => {
  const info = await createBackup('manual');
  await recordAudit({ userId: req.user!.id, actorName: req.user!.name, action: 'BACKUP_CREATED', details: info.file });
  res.json({ success: true, data: info });
}));

app.get('/api/admin/backups/:file', requireAdmin, (req, res) => {
  const full = resolveBackup(getParam(req, 'file'));
  if (!full) return res.status(404).json({ success: false, error: 'Backup not found' });
  res.download(full);
});

// ---------------------------------------------------------------------------
// Employee Time Clock & Paystub Routes
// ---------------------------------------------------------------------------

app.get('/api/timeclock/status', requireAuth, wrap(async (req, res) => {
  const status = await payrollService.getTimeClockStatus(req.user!.id);
  res.json({ success: true, data: status });
}));

app.post('/api/timeclock/clock-in', requireAuth, wrap(async (req, res) => {
  const shift = await payrollService.clockIn(req.user!.id, req.body?.notes);
  res.json({ success: true, data: shift });
}));

app.post('/api/timeclock/clock-out', requireAuth, wrap(async (req, res) => {
  const shift = await payrollService.clockOut(req.user!.id, req.body?.notes, req.body?.shiftData);
  res.json({ success: true, data: shift });
}));

app.post('/api/sync/tickets', requireAuth, wrap(async (req, res) => {
  const { deletedIds } = req.body || {};
  if (Array.isArray(deletedIds) && deletedIds.length > 0) {
    await prisma.ticket.updateMany({
      where: { id: { in: deletedIds } },
      data: { deletedAt: new Date() },
    }).catch(() => {});
    await prisma.ticket.deleteMany({
      where: { id: { in: deletedIds } },
    }).catch(() => {});
  }

  res.json({ success: true, message: 'Sync complete' });
}));

app.post('/api/timeclock/break-start', requireAuth, wrap(async (req, res) => {
  const brk = await payrollService.startBreak(req.user!.id, req.body?.type);
  res.json({ success: true, data: brk });
}));

app.post('/api/timeclock/break-end', requireAuth, wrap(async (req, res) => {
  const brk = await payrollService.endBreak(req.user!.id);
  res.json({ success: true, data: brk });
}));

app.get('/api/timeclock/my-shifts', requireAuth, wrap(async (req, res) => {
  const shifts = await payrollService.getMyShifts(req.user!.id, {
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
    limit: req.query.limit ? Number(req.query.limit) : 50,
  });
  res.json({ success: true, data: shifts });
}));

app.get('/api/timeclock/my-paystubs', requireAuth, wrap(async (req, res) => {
  const paystubs = await payrollService.getMyPaystubs(req.user!.id);
  res.json({ success: true, data: paystubs });
}));

app.get('/api/timeclock/my-paystubs/:id', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const paystub = await payrollService.getMyPaystub(req.user!.id, getParam(req, 'id'), isAdmin);
  res.json({ success: true, data: paystub });
}));

app.get('/api/timeclock/my-paystubs/:id/html', requireAuth, wrap(async (req, res) => {
  const isAdmin = req.user!.role === 'ADMIN';
  const html = await payrollService.buildPaystubHtml(getParam(req, 'id'), isAdmin, req.user!.id);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}));

// ---------------------------------------------------------------------------
// Admin Time & Attendance Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/attendance/live', requireAdmin, wrap(async (_req, res) => {
  const roster = await payrollService.getLiveRoster();
  res.json({ success: true, data: roster });
}));

app.get('/api/admin/attendance', requireAdmin, wrap(async (req, res) => {
  const overview = await payrollService.getAttendanceOverview({
    userId: req.query.userId as string,
    status: req.query.status as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
  });
  res.json({ success: true, data: overview });
}));

app.post('/api/admin/attendance/shifts', requireAdmin, wrap(async (req, res) => {
  const shift = await payrollService.manualAddShift(
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: shift });
}));

app.put('/api/admin/attendance/shifts/:id', requireAdmin, wrap(async (req, res) => {
  const shift = await payrollService.manualEditShift(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: shift });
}));

app.delete('/api/admin/attendance/shifts/:id', requireAdmin, wrap(async (req, res) => {
  const result = await payrollService.deleteShift(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: result });
}));

app.get('/api/admin/attendance/export', requireAdmin, wrap(async (req, res) => {
  const csv = await payrollService.exportAttendanceCsv({
    userId: req.query.userId as string,
    startDate: req.query.startDate as string,
    endDate: req.query.endDate as string,
  });
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-export-${new Date().toISOString().slice(0, 10)}.csv"`);
  res.send(csv);
}));

// ---------------------------------------------------------------------------
// Admin Wage & Compensation Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/users/:id/wages', requireAdmin, wrap(async (req, res) => {
  const history = await payrollService.getUserWageHistory(getParam(req, 'id'));
  res.json({ success: true, data: history });
}));

app.post('/api/admin/users/:id/wages', requireAdmin, wrap(async (req, res) => {
  const updated = await payrollService.updateUserWage(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: updated });
}));

// ---------------------------------------------------------------------------
// Admin Payroll Management Routes
// ---------------------------------------------------------------------------

app.get('/api/admin/payroll/overview', requireAdmin, wrap(async (_req, res) => {
  const overview = await payrollService.getPayrollDashboardOverview();
  res.json({ success: true, data: overview });
}));

app.get('/api/admin/payroll/periods', requireAdmin, wrap(async (req, res) => {
  const limit = req.query.limit ? Number(req.query.limit) : 50;
  const periods = await payrollService.listPayrollPeriods(limit);
  res.json({ success: true, data: periods });
}));

app.post('/api/admin/payroll/periods/calculate', requireAdmin, wrap(async (req, res) => {
  const calc = await payrollService.calculatePeriodPayroll({
    startDate: req.body.startDate,
    endDate: req.body.endDate,
    payDate: req.body.payDate,
    periodType: req.body.periodType || 'BI_WEEKLY',
  });
  res.json({ success: true, data: calc });
}));

app.post('/api/admin/payroll/periods', requireAdmin, wrap(async (req, res) => {
  const period = await payrollService.createPayrollPeriod(
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: period });
}));

app.get('/api/admin/payroll/periods/:id', requireAdmin, wrap(async (req, res) => {
  const period = await payrollService.getPayrollPeriod(getParam(req, 'id'));
  res.json({ success: true, data: period });
}));

app.put('/api/admin/payroll/paystubs/:id', requireAdmin, wrap(async (req, res) => {
  const updated = await payrollService.updatePaystubDraft(
    getParam(req, 'id'),
    req.body,
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: updated });
}));

app.post('/api/admin/payroll/periods/:id/finalize', requireAdmin, wrap(async (req, res) => {
  const finalized = await payrollService.finalizePayrollPeriod(
    getParam(req, 'id'),
    { id: req.user!.id, name: req.user!.name }
  );
  res.json({ success: true, data: finalized });
}));

app.get('/api/admin/payroll/periods/:id/export', requireAdmin, wrap(async (req, res) => {
  const csv = await payrollService.exportPayrollCsv(getParam(req, 'id'));
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="payroll-period-${getParam(req, 'id')}.csv"`);
  res.send(csv);
}));

app.get('/api/admin/payroll/paystubs/:id/html', requireAdmin, wrap(async (req, res) => {
  const html = await payrollService.buildPaystubHtml(getParam(req, 'id'), true);
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
}));

// ---------------------------------------------------------------------------
// Central Error Handler
// ---------------------------------------------------------------------------

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({
      success: false,
      error: err.message,
      ...(err.activeShift ? { activeShift: err.activeShift } : {}),
      ...(err.details ? { details: err.details } : {}),
    });
  }
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors || [];
    const message = issues.map((e: any) => `${e.path.join('.') || 'input'}: ${e.message}`).join(', ');
    return res.status(400).json({ success: false, error: message || 'Invalid input', details: err.flatten() });
  }
  console.error('[API Error]', err);
  return res.status(500).json({
    success: false,
    error: err?.message || 'Internal server error',
    details: err?.stack || String(err),
  });
});

export { app };
export default app;

if (!process.env.VERCEL) {
  app.listen(PORT, async () => {
    console.log(`[Faso Fix API] Running on http://localhost:${PORT}`);
    try {
      await configureSqlite();
      await ensureDatabaseSchema();
      await ensureAdminProvisioning();
      await ensureInitialInventory();
      if (process.env.NODE_ENV !== 'test') startBackupSchedule();
    } catch (err) {
      console.error('[Startup Error]', err);
    }
  });
}
