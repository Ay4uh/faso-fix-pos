import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
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
import { authenticateSession, ensureAdminProvisioning, recordAudit } from './auth';

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

// Session resolution middleware
app.use(async (req: Request, _res: Response, next: NextFunction) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : (req.headers['x-session-token'] as string | undefined);

    if (token) {
      req.token = token;
      const user = await authenticateSession(token);
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
// Authentication & Current User Profile Routes
// ---------------------------------------------------------------------------

app.post('/api/auth/login', wrap(async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  const result = await loginUser(req.body, ip);
  res.json({ success: true, ...result });
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

app.get('/api/dashboard', wrap(async (_req, res) => {
  const data = await getDashboard();
  res.json({ success: true, data });
}));

// Backwards compatibility endpoint for any dashboard KPI widgets
app.get('/api/stats', wrap(async (_req, res) => {
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

app.get('/api/reports', wrap(async (req, res) => {
  const days = req.query.days ? parseInt(req.query.days as string, 10) : 30;
  const data = await getReport(days);
  res.json({ success: true, data });
}));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

app.get('/api/settings', wrap(async (_req, res) => {
  const settings = await getSettings();
  res.json({ success: true, data: settings });
}));

app.put('/api/settings', wrap(async (req, res) => {
  const actor = req.user ? { id: req.user.id, name: req.user.name } : undefined;
  const settings = await updateSettings(req.body, actor);
  res.json({ success: true, data: settings });
}));

// ---------------------------------------------------------------------------
// Tickets (Work Orders)
// ---------------------------------------------------------------------------

app.get('/api/tickets', wrap(async (req, res) => {
  const view = (req.query.view || req.query.status || 'OPEN') as string;
  const search = req.query.search as string | undefined;
  const bench = req.query.bench as string | undefined;
  const tickets = await listTickets({ view, search, bench });
  res.json({ success: true, count: tickets.length, data: tickets });
}));

app.get('/api/tickets/:id', wrap(async (req, res) => {
  const ticket = await getTicket(getParam(req, 'id'));
  res.json({ success: true, data: ticket });
}));

app.post('/api/tickets', wrap(async (req, res) => {
  const ticket = await createTicket(req.body);
  res.status(201).json({ success: true, data: ticket });
}));

app.put('/api/tickets/:id', wrap(async (req, res) => {
  const ticket = await updateTicket(getParam(req, 'id'), req.body);
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

  res.json({ success: true, data: result });
}));

// Quick complete shortcut
app.post('/api/tickets/:id/quick-complete', wrap(async (req, res) => {
  const ticket = await updateTicket(getParam(req, 'id'), { status: 'COMPLETED' });
  res.json({ success: true, message: 'Work order marked completed', data: ticket });
}));

// Line items / parts attachment
app.post('/api/tickets/:id/items', wrap(async (req, res) => {
  const ticket = await addItem(getParam(req, 'id'), req.body);
  res.status(201).json({ success: true, data: ticket });
}));

// Backward-compatible route for parts attachment
app.post('/api/tickets/:id/parts', wrap(async (req, res) => {
  const { partId, customName, price, quantity } = req.body;
  const ticket = await addItem(getParam(req, 'id'), {
    partId: partId || undefined,
    description: customName || undefined,
    unitPriceCents: price !== undefined ? Math.round(Number(price) * 100) : undefined,
    quantity: quantity ? Number(quantity) : 1,
  });
  res.status(201).json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/items/:itemId', wrap(async (req, res) => {
  const ticket = await removeItem(getParam(req, 'id'), getParam(req, 'itemId'));
  res.json({ success: true, data: ticket });
}));

// Payments
app.post('/api/tickets/:id/payments', wrap(async (req, res) => {
  const body = req.body || {};
  const amountCents = body.amountCents ?? (body.amount !== undefined ? Math.round(Number(body.amount) * 100) : undefined);
  const ticket = await addPayment(getParam(req, 'id'), {
    amountCents,
    method: body.method || 'CASH',
    note: body.note,
  });
  res.status(201).json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/payments/:paymentId', wrap(async (req, res) => {
  const ticket = await voidPayment(getParam(req, 'id'), getParam(req, 'paymentId'));
  res.json({ success: true, data: ticket });
}));

// Notes & notifications
app.post('/api/tickets/:id/notes', wrap(async (req, res) => {
  const { note, message, type, kind } = req.body;
  const noteKind = kind || (type === 'CUSTOMER' ? 'CUSTOMER_NOTE' : 'INTERNAL_NOTE');
  const ticket = await addNote(getParam(req, 'id'), {
    kind: noteKind,
    message: message || note || '',
  });
  res.status(201).json({ success: true, data: ticket });
}));

app.post('/api/tickets/:id/notify', wrap(async (req, res) => {
  const { message, customerPhone } = req.body;
  const ticket = await addNote(getParam(req, 'id'), {
    kind: 'MESSAGE',
    message: `[SMS to ${customerPhone || 'Customer'}]: ${message}`,
  });
  res.json({ success: true, message: `Notification sent to ${customerPhone}`, data: ticket });
}));

app.put('/api/tickets/:id/notes/:noteId', wrap(async (req, res) => {
  const { message } = req.body;
  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: 'Note message cannot be empty' });
  }
  const ticket = await updateNote(getParam(req, 'id'), getParam(req, 'noteId'), message);
  res.json({ success: true, data: ticket });
}));

app.delete('/api/tickets/:id/notes/:noteId', wrap(async (req, res) => {
  const ticket = await deleteNote(getParam(req, 'id'), getParam(req, 'noteId'));
  res.json({ success: true, data: ticket });
}));

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

app.get('/api/customers', wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const customers = await listCustomers(search);
  res.json({ success: true, count: customers.length, data: customers });
}));

app.get('/api/customers/lookup', wrap(async (req, res) => {
  const phone = (req.query.phone as string) || '';
  const customer = await lookupCustomerByPhone(phone);
  res.json({ success: true, data: customer });
}));

app.get('/api/customers/:id', wrap(async (req, res) => {
  const customer = await getCustomer(getParam(req, 'id'));
  res.json({ success: true, data: customer });
}));

app.put('/api/customers/:id', wrap(async (req, res) => {
  const customer = await updateCustomer(getParam(req, 'id'), req.body);
  res.json({ success: true, data: customer });
}));

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

app.get('/api/inventory', wrap(async (req, res) => {
  const search = req.query.search as string | undefined;
  const parts = await listParts(search);
  res.json({ success: true, count: parts.length, data: parts });
}));

app.post('/api/inventory', wrap(async (req, res) => {
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
  res.status(201).json({ success: true, data: part });
}));

app.put('/api/inventory/:id', wrap(async (req, res) => {
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
  res.json({ success: true, data: part });
}));

app.post('/api/inventory/:id/adjust', wrap(async (req, res) => {
  const delta = Number(req.body.delta);
  if (isNaN(delta) || delta === 0) {
    throw new HttpError(400, 'A non-zero numeric delta is required for stock adjustment');
  }
  const part = await adjustStock(getParam(req, 'id'), delta);
  res.json({ success: true, data: part });
}));

app.delete('/api/inventory/:id', wrap(async (req, res) => {
  const result = await deletePart(getParam(req, 'id'));
  res.json({ success: true, data: result });
}));

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------

app.get('/api/export/tickets', wrap(async (_req, res) => {
  const csv = await exportTicketsCsv();
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ApexFix-WorkOrders.csv"');
  res.send(csv);
}));

// ---------------------------------------------------------------------------
// Central Error Handler
// ---------------------------------------------------------------------------

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ success: false, error: err.message });
  }
  if (err instanceof ZodError) {
    const issues = err.issues || (err as any).errors || [];
    const message = issues.map((e: any) => `${e.path.join('.') || 'input'}: ${e.message}`).join(', ');
    return res.status(400).json({ success: false, error: message || 'Invalid input', details: err.flatten() });
  }
  console.error('[API Error]', err);
  return res.status(500).json({ success: false, error: err.message || 'Internal server error' });
});

app.listen(PORT, async () => {
  console.log(`[ApexFix API] Running on http://localhost:${PORT}`);
  try {
    await ensureAdminProvisioning();
  } catch (err) {
    console.error('[Admin Provisioning Error]', err);
  }
});
