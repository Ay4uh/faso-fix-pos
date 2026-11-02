import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from './prisma';
import { computeTotals, digitsOnly } from './money';
import {
  addItemSchema,
  createTicketSchema,
  customerUpdateSchema,
  noteSchema,
  partSchema,
  paymentSchema,
  settingsSchema,
  updateTicketSchema,
} from './schemas';

type Tx = Prisma.TransactionClient;

/** Error with an HTTP status, surfaced to the client as JSON by the error handler. */
export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

const STATUS_LABEL: Record<string, string> = {
  PENDING: 'Pending',
  IN_PROGRESS: 'In Progress',
  WAITING_ON_PARTS: 'Waiting on Parts',
  COMPLETED: 'Completed',
};
const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'WAITING_ON_PARTS'];

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);

/** "YYYY-MM-DD" is stored at local noon so it never shifts a day across time zones. */
function parseDate(v: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
}

const ticketInclude = {
  customer: true,
  device: true,
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TicketInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function withTotals<T extends TicketWithRelations>(t: T) {
  let diagnostics: Record<string, 'PASS' | 'FAIL'> = {};
  try {
    diagnostics = JSON.parse(t.diagnostics || '{}');
  } catch {
    diagnostics = {};
  }
  return { ...t, diagnostics, totals: computeTotals(t) };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getSettings(tx: Tx | typeof prisma = prisma) {
  return tx.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
}

export async function updateSettings(input: unknown) {
  const data = settingsSchema.parse(input);
  await getSettings();
  return prisma.setting.update({ where: { id: 1 }, data });
}

// ---------------------------------------------------------------------------
// Tickets
// ---------------------------------------------------------------------------

async function logEvent(tx: Tx, ticketId: string, kind: string, message: string, author?: string | null) {
  await tx.ticketEvent.create({ data: { ticketId, kind, message, author: author ?? null } });
}

async function loadTicket(tx: Tx | typeof prisma, id: string) {
  const t = await tx.ticket.findFirst({ where: { id, deletedAt: null }, include: ticketInclude });
  if (!t) throw new HttpError(404, 'Work order not found');
  return t;
}

export async function getTicket(id: string) {
  const t = await prisma.ticket.findFirst({
    where: { id, deletedAt: null },
    include: { ...ticketInclude, events: { orderBy: { createdAt: 'desc' } } },
  });
  if (!t) throw new HttpError(404, 'Work order not found');
  const otherTickets = await prisma.ticket.findMany({
    where: { customerId: t.customerId, deletedAt: null, NOT: { id } },
    select: { id: true, ticketNumber: true, status: true, createdAt: true, device: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return { ...withTotals(t), otherTickets };
}

export async function listTickets(params: { view?: string; search?: string }) {
  const view = params.view || 'OPEN';
  const where: Prisma.TicketWhereInput = { deletedAt: null };

  if (view === 'OPEN') where.status = { in: OPEN_STATUSES };
  else if (view !== 'ALL') where.status = view;

  const q = (params.search || '').trim();
  if (q) {
    const numeric = q.replace(/^(wo\s*)?#?/i, '');
    const digits = digitsOnly(q);
    const or: Prisma.TicketWhereInput[] = [
      { customer: { fullName: { contains: q } } },
      { device: { name: { contains: q } } },
      { device: { serialNumber: { contains: q } } },
      { faultDescription: { contains: q } },
    ];
    if (/^\d+$/.test(numeric)) or.push({ ticketNumber: Number(numeric) });
    if (digits.length >= 3) or.push({ customer: { phoneDigits: { contains: digits } } });
    where.OR = or;
  }

  const tickets = await prisma.ticket.findMany({
    where,
    include: ticketInclude,
    orderBy: view === 'COMPLETED' ? { completedAt: 'desc' } : [{ dueDate: 'asc' }, { ticketNumber: 'asc' }],
    take: 500,
  });
  return tickets.map(withTotals);
}

export async function createTicket(input: unknown) {
  const data = createTicketSchema.parse(input);
  const phoneDigits = digitsOnly(data.customer.phone);

  const id = await prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);

    // Atomically claim the next sequential work order number (1, 2, 3, ...).
    const counter = await tx.setting.update({
      where: { id: 1 },
      data: { nextTicketNumber: { increment: 1 } },
      select: { nextTicketNumber: true },
    });
    const ticketNumber = counter.nextTicketNumber - 1;

    // Customer: matched on phone digits so "(555) 123-4567" and "5551234567" are the same person.
    let customer = await tx.customer.findUnique({ where: { phoneDigits } });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          fullName: data.customer.fullName,
          phone: data.customer.phone,
          phoneDigits,
          email: emptyToNull(data.customer.email) ?? null,
          address: emptyToNull(data.customer.address) ?? null,
        },
      });
    } else {
      // Returning customer: fill in contact details we didn't have before, never overwrite.
      const fill: Prisma.CustomerUpdateInput = {};
      if (!customer.email && data.customer.email) fill.email = data.customer.email;
      if (!customer.address && data.customer.address) fill.address = data.customer.address;
      if (Object.keys(fill).length) customer = await tx.customer.update({ where: { id: customer.id }, data: fill });
    }

    // Device: reuse the customer's existing device when the serial/IMEI matches.
    const serial = emptyToNull(data.device.serialNumber) ?? null;
    let device = serial
      ? await tx.device.findFirst({ where: { customerId: customer.id, serialNumber: serial } })
      : null;
    const deviceData = {
      name: data.device.name,
      passcode: emptyToNull(data.device.passcode) ?? null,
      pattern: emptyToNull(data.device.pattern) ?? null,
      condition: emptyToNull(data.device.condition) ?? null,
    };
    device = device
      ? await tx.device.update({ where: { id: device.id }, data: deviceData })
      : await tx.device.create({ data: { ...deviceData, customerId: customer.id, serialNumber: serial } });

    const ticket = await tx.ticket.create({
      data: {
        ticketNumber,
        customerId: customer.id,
        deviceId: device.id,
        faultDescription: data.faultDescription,
        laborCents: data.laborCents,
        taxRateBps: settings.taxRateBps,
        priority: data.priority,
        technician: emptyToNull(data.technician) ?? null,
        bench: emptyToNull(data.bench) ?? null,
        storageBin: emptyToNull(data.storageBin) ?? null,
        dueDate: parseDate(data.dueDate),
      },
    });
    await logEvent(tx, ticket.id, 'STATUS', `Work order #${ticketNumber} created for ${device.name}`, data.technician);

    if (data.depositCents && data.depositCents > 0) {
      const totals = computeTotals({ ...ticket, items: [], payments: [] });
      if (data.depositCents > totals.totalCents) {
        throw new HttpError(400, `Deposit (${money(data.depositCents)}) cannot exceed the quoted total (${money(totals.totalCents)})`);
      }
      await tx.payment.create({
        data: { ticketId: ticket.id, amountCents: data.depositCents, method: data.depositMethod || 'CASH', note: 'Deposit at intake' },
      });
      await logEvent(tx, ticket.id, 'PAYMENT', `Deposit of ${money(data.depositCents)} received (${data.depositMethod || 'CASH'})`);
    }
    return ticket.id;
  });

  return getTicket(id);
}

export async function updateTicket(id: string, input: unknown) {
  const data = updateTicketSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, id);
    const update: Prisma.TicketUpdateInput = {};
    const changes: string[] = [];

    if (data.status && data.status !== t.status) {
      update.status = data.status;
      update.completedAt = data.status === 'COMPLETED' ? new Date() : null;
      await logEvent(tx, id, 'STATUS', `Status changed: ${STATUS_LABEL[t.status]} → ${STATUS_LABEL[data.status]}`);
    }
    if (data.priority && data.priority !== t.priority) {
      update.priority = data.priority;
      changes.push(`priority → ${data.priority.toLowerCase()}`);
    }
    if (data.faultDescription !== undefined && data.faultDescription !== t.faultDescription) {
      update.faultDescription = data.faultDescription;
      changes.push('fault description updated');
    }
    if (data.laborCents !== undefined && data.laborCents !== t.laborCents) {
      update.laborCents = data.laborCents;
      changes.push(`labor ${money(t.laborCents)} → ${money(data.laborCents)}`);
    }
    if (data.discountCents !== undefined && data.discountCents !== t.discountCents) {
      update.discountCents = data.discountCents;
      changes.push(`discount ${money(t.discountCents)} → ${money(data.discountCents)}`);
    }
    if (data.dueDate !== undefined) {
      const due = parseDate(data.dueDate);
      if (due.getTime() !== t.dueDate.getTime()) {
        update.dueDate = due;
        changes.push(`due date → ${due.toLocaleDateString()}`);
      }
    }
    for (const key of ['technician', 'bench', 'storageBin'] as const) {
      if (data[key] !== undefined) {
        const v = emptyToNull(data[key]) ?? null;
        if (v !== t[key]) {
          update[key] = v;
          changes.push(`${key === 'storageBin' ? 'storage bin' : key} → ${v ?? 'none'}`);
        }
      }
    }
    if (data.diagnostics) {
      update.diagnostics = JSON.stringify(data.diagnostics);
    }
    if (data.device) {
      const d = data.device;
      const deviceUpdate: Prisma.DeviceUpdateInput = {};
      if (d.name !== undefined) deviceUpdate.name = d.name;
      for (const key of ['serialNumber', 'passcode', 'pattern', 'condition'] as const) {
        if (d[key] !== undefined) deviceUpdate[key] = emptyToNull(d[key]) ?? null;
      }
      if (Object.keys(deviceUpdate).length) {
        await tx.device.update({ where: { id: t.deviceId }, data: deviceUpdate });
        changes.push('device details updated');
      }
    }

    // Money changes must never push the total below what has already been paid
    // without the user seeing it: we allow it, but the balance shows as a refund due.
    if (Object.keys(update).length) await tx.ticket.update({ where: { id }, data: update });
    if (changes.length) await logEvent(tx, id, 'SYSTEM', `Updated: ${changes.join(', ')}`);
  });

  return getTicket(id);
}

export async function deleteTicket(id: string) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, id);
    if (t.payments.length) {
      throw new HttpError(409, 'This work order has payments recorded. Void the payments before deleting it.');
    }
    // Return any inventory parts to stock.
    for (const item of t.items) {
      if (item.partId) await tx.inventoryPart.update({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } });
    }
    await tx.ticket.update({ where: { id }, data: { deletedAt: new Date() } });
    await logEvent(tx, id, 'SYSTEM', 'Work order deleted');
  });
  return { ok: true };
}

export async function addItem(ticketId: string, input: unknown) {
  const data = addItemSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    let description = data.description || '';
    let unitPriceCents = data.unitPriceCents ?? 0;
    let unitCostCents = 0;

    if (data.partId) {
      const part = await tx.inventoryPart.findUnique({ where: { id: data.partId } });
      if (!part) throw new HttpError(404, 'Inventory part not found');
      if (part.stock < data.quantity) {
        throw new HttpError(409, `Not enough stock for ${part.name}: ${part.stock} available, ${data.quantity} requested`);
      }
      await tx.inventoryPart.update({ where: { id: part.id }, data: { stock: { decrement: data.quantity } } });
      description = description || part.name;
      unitPriceCents = data.unitPriceCents ?? part.priceCents;
      unitCostCents = part.costCents;
    }

    await tx.ticketItem.create({
      data: { ticketId, partId: data.partId ?? null, description, quantity: data.quantity, unitPriceCents, unitCostCents },
    });
    await logEvent(tx, ticketId, 'ITEM', `Added ${data.quantity} × ${description} @ ${money(unitPriceCents)}`);
  });

  return getTicket(ticketId);
}

export async function removeItem(ticketId: string, itemId: string) {
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    const item = await tx.ticketItem.findFirst({ where: { id: itemId, ticketId } });
    if (!item) throw new HttpError(404, 'Line item not found');
    if (item.partId) {
      await tx.inventoryPart.update({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } });
    }
    await tx.ticketItem.delete({ where: { id: itemId } });
    await logEvent(tx, ticketId, 'ITEM', `Removed ${item.quantity} × ${item.description}${item.partId ? ' (returned to stock)' : ''}`);
  });
  return getTicket(ticketId);
}

export async function addPayment(ticketId: string, input: unknown) {
  const data = paymentSchema.parse(input);

  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    const { balanceCents } = computeTotals(t);
    if (balanceCents <= 0) throw new HttpError(409, 'Nothing is owing on this work order');
    if (data.amountCents > balanceCents) {
      throw new HttpError(400, `Payment (${money(data.amountCents)}) is more than the balance owing (${money(balanceCents)})`);
    }
    await tx.payment.create({ data: { ticketId, amountCents: data.amountCents, method: data.method, note: emptyToNull(data.note) ?? null } });
    const remaining = balanceCents - data.amountCents;
    await logEvent(
      tx,
      ticketId,
      'PAYMENT',
      `Payment of ${money(data.amountCents)} received (${data.method.replace('_', '-')})${remaining === 0 ? ' — paid in full' : `, ${money(remaining)} still owing`}`,
    );
  });
  return getTicket(ticketId);
}

export async function voidPayment(ticketId: string, paymentId: string) {
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    const p = await tx.payment.findFirst({ where: { id: paymentId, ticketId } });
    if (!p) throw new HttpError(404, 'Payment not found');
    await tx.payment.delete({ where: { id: paymentId } });
    await logEvent(tx, ticketId, 'PAYMENT', `Voided payment of ${money(p.amountCents)} (${p.method})`);
  });
  return getTicket(ticketId);
}

export async function addNote(ticketId: string, input: unknown) {
  const data = noteSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    await logEvent(tx, ticketId, data.kind, data.message);
  });
  return getTicket(ticketId);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(search?: string) {
  const q = (search || '').trim();
  const digits = digitsOnly(q);
  const where: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { fullName: { contains: q } },
          { email: { contains: q } },
          ...(digits.length >= 3 ? [{ phoneDigits: { contains: digits } }] : []),
        ],
      }
    : {};
  const customers = await prisma.customer.findMany({
    where,
    orderBy: { updatedAt: 'desc' },
    include: {
      tickets: {
        where: { deletedAt: null },
        select: { id: true, status: true, createdAt: true, payments: { select: { amountCents: true } } },
      },
    },
    take: 500,
  });
  return customers.map(({ tickets, ...c }) => ({
    ...c,
    ticketCount: tickets.length,
    openTickets: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    totalPaidCents: tickets.reduce((s, t) => s + t.payments.reduce((a, p) => a + p.amountCents, 0), 0),
    lastVisit: tickets.reduce<Date | null>((d, t) => (!d || t.createdAt > d ? t.createdAt : d), null),
  }));
}

export async function lookupCustomerByPhone(phone: string) {
  const phoneDigits = digitsOnly(phone);
  if (phoneDigits.length < 7) return null;
  return prisma.customer.findUnique({ where: { phoneDigits }, include: { devices: { orderBy: { updatedAt: 'desc' } } } });
}

export async function getCustomer(id: string) {
  const c = await prisma.customer.findUnique({
    where: { id },
    include: {
      devices: { orderBy: { updatedAt: 'desc' } },
      tickets: { where: { deletedAt: null }, include: ticketInclude, orderBy: { createdAt: 'desc' } },
    },
  });
  if (!c) throw new HttpError(404, 'Customer not found');
  return { ...c, tickets: c.tickets.map(withTotals) };
}

export async function updateCustomer(id: string, input: unknown) {
  const data = customerUpdateSchema.parse(input);
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Customer not found');

  const update: Prisma.CustomerUpdateInput = {};
  if (data.fullName !== undefined) update.fullName = data.fullName;
  if (data.email !== undefined) update.email = emptyToNull(data.email) ?? null;
  if (data.address !== undefined) update.address = emptyToNull(data.address) ?? null;
  if (data.notes !== undefined) update.notes = emptyToNull(data.notes) ?? null;
  if (data.phone !== undefined) {
    const phoneDigits = digitsOnly(data.phone);
    if (phoneDigits !== existing.phoneDigits) {
      const clash = await prisma.customer.findUnique({ where: { phoneDigits } });
      if (clash) throw new HttpError(409, `That phone number already belongs to ${clash.fullName}`);
    }
    update.phone = data.phone;
    update.phoneDigits = phoneDigits;
  }
  await prisma.customer.update({ where: { id }, data: update });
  return getCustomer(id);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function listParts(search?: string) {
  const q = (search || '').trim();
  return prisma.inventoryPart.findMany({
    where: q ? { OR: [{ name: { contains: q } }, { sku: { contains: q } }, { supplier: { contains: q } }] } : {},
    orderBy: [{ name: 'asc' }],
  });
}

async function assertSkuFree(sku: string, exceptId?: string) {
  const clash = await prisma.inventoryPart.findUnique({ where: { sku } });
  if (clash && clash.id !== exceptId) throw new HttpError(409, `SKU "${sku}" is already used by ${clash.name}`);
}

export async function createPart(input: unknown) {
  const data = partSchema.parse(input);
  data.sku = data.sku.toUpperCase();
  await assertSkuFree(data.sku);
  return prisma.inventoryPart.create({ data: { ...data, supplier: emptyToNull(data.supplier) ?? null } });
}

export async function updatePart(id: string, input: unknown) {
  const data = partSchema.partial().parse(input);
  if (!(await prisma.inventoryPart.findUnique({ where: { id } }))) throw new HttpError(404, 'Part not found');
  if (data.sku) {
    data.sku = data.sku.toUpperCase();
    await assertSkuFree(data.sku, id);
  }
  return prisma.inventoryPart.update({
    where: { id },
    data: { ...data, supplier: data.supplier === undefined ? undefined : emptyToNull(data.supplier) ?? null },
  });
}

export async function adjustStock(id: string, delta: number) {
  const part = await prisma.inventoryPart.findUnique({ where: { id } });
  if (!part) throw new HttpError(404, 'Part not found');
  if (part.stock + delta < 0) throw new HttpError(409, `Stock cannot go below zero (currently ${part.stock})`);
  return prisma.inventoryPart.update({ where: { id }, data: { stock: { increment: delta } } });
}

export async function deletePart(id: string) {
  if (!(await prisma.inventoryPart.findUnique({ where: { id } }))) throw new HttpError(404, 'Part not found');
  // Past work orders keep their own snapshot of the description and price.
  await prisma.inventoryPart.delete({ where: { id } });
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Dashboard & reports (computed from real records only)
// ---------------------------------------------------------------------------

function startOfDay(d = new Date()) {
  const s = new Date(d);
  s.setHours(0, 0, 0, 0);
  return s;
}

export async function getDashboard() {
  const today = startOfDay();
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const tickets = await prisma.ticket.findMany({
    where: { deletedAt: null },
    select: {
      status: true,
      dueDate: true,
      laborCents: true,
      discountCents: true,
      taxRateBps: true,
      items: { select: { quantity: true, unitPriceCents: true } },
      payments: { select: { amountCents: true } },
    },
  });
  const payments = await prisma.payment.findMany({
    where: { createdAt: { gte: monthStart }, ticket: { deletedAt: null } },
    select: { amountCents: true, createdAt: true },
  });
  const lowStock = await prisma.inventoryPart.count({ where: { stock: { lte: prisma.inventoryPart.fields.reorderPoint } } });

  const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
  const count = (s: string) => tickets.filter((t) => t.status === s).length;
  const readyUnpaid = tickets.filter((t) => t.status === 'COMPLETED' && computeTotals(t).balanceCents > 0);

  return {
    open: open.length,
    pending: count('PENDING'),
    inProgress: count('IN_PROGRESS'),
    waitingOnParts: count('WAITING_ON_PARTS'),
    completed: count('COMPLETED'),
    overdue: open.filter((t) => t.dueDate < today).length,
    dueToday: open.filter((t) => t.dueDate >= today && t.dueDate < tomorrow).length,
    openValueCents: open.reduce((s, t) => s + computeTotals(t).balanceCents, 0),
    awaitingPickupCount: readyUnpaid.length,
    awaitingPickupCents: readyUnpaid.reduce((s, t) => s + computeTotals(t).balanceCents, 0),
    collectedTodayCents: payments.filter((p) => p.createdAt >= today).reduce((s, p) => s + p.amountCents, 0),
    collectedMonthCents: payments.reduce((s, p) => s + p.amountCents, 0),
    customerCount: await prisma.customer.count(),
    lowStock,
  };
}

export async function getReport(days: number) {
  const span = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
  const since = startOfDay(new Date(Date.now() - (span - 1) * 86_400_000));

  const [payments, created, completed, items] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: since }, ticket: { deletedAt: null } },
      select: { amountCents: true, method: true, createdAt: true },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: { createdAt: true, device: { select: { name: true } } },
    }),
    prisma.ticket.findMany({
      where: { completedAt: { gte: since }, deletedAt: null },
      select: { createdAt: true, completedAt: true, dueDate: true },
    }),
    prisma.ticketItem.findMany({
      where: { createdAt: { gte: since }, ticket: { deletedAt: null } },
      select: { quantity: true, unitPriceCents: true, unitCostCents: true, partId: true },
    }),
  ]);

  const dayKey = (d: Date) => {
    const s = startOfDay(d);
    return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, '0')}-${String(s.getDate()).padStart(2, '0')}`;
  };
  const daily: { date: string; revenueCents: number; ticketsCreated: number }[] = [];
  const index = new Map<string, number>();
  for (let i = 0; i < span; i++) {
    const key = dayKey(new Date(since.getTime() + i * 86_400_000 + 3_600_000 * 12));
    index.set(key, daily.length);
    daily.push({ date: key, revenueCents: 0, ticketsCreated: 0 });
  }
  for (const p of payments) {
    const i = index.get(dayKey(p.createdAt));
    if (i !== undefined) daily[i].revenueCents += p.amountCents;
  }
  for (const t of created) {
    const i = index.get(dayKey(t.createdAt));
    if (i !== undefined) daily[i].ticketsCreated += 1;
  }

  const byMethod: Record<string, number> = {};
  for (const p of payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amountCents;

  const deviceCounts = new Map<string, number>();
  for (const t of created) deviceCounts.set(t.device.name, (deviceCounts.get(t.device.name) || 0) + 1);

  const turnaroundHours = completed
    .filter((t) => t.completedAt)
    .map((t) => (t.completedAt!.getTime() - t.createdAt.getTime()) / 3_600_000);
  const onTime = completed.filter((t) => t.completedAt && t.completedAt.getTime() <= t.dueDate.getTime() + 86_400_000 / 2).length;

  const partItems = items.filter((i) => i.partId);
  const partsRevenueCents = partItems.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  const partsCostCents = partItems.reduce((s, i) => s + i.quantity * i.unitCostCents, 0);

  return {
    days: span,
    since,
    revenueCents: payments.reduce((s, p) => s + p.amountCents, 0),
    ticketsCreated: created.length,
    ticketsCompleted: completed.length,
    avgTurnaroundHours: turnaroundHours.length ? turnaroundHours.reduce((a, b) => a + b, 0) / turnaroundHours.length : null,
    onTimeRate: completed.length ? onTime / completed.length : null,
    partsRevenueCents,
    partsCostCents,
    byMethod,
    topDevices: [...deviceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
    daily,
  };
}

export async function exportTicketsCsv() {
  const tickets = await prisma.ticket.findMany({ where: { deletedAt: null }, include: ticketInclude, orderBy: { ticketNumber: 'asc' } });
  const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const rows = [
    ['WO #', 'Created', 'Status', 'Customer', 'Phone', 'Email', 'Device', 'Serial/IMEI', 'Fault', 'Due', 'Completed', 'Total', 'Paid', 'Balance'],
  ];
  for (const t of tickets) {
    const totals = computeTotals(t);
    rows.push([
      String(t.ticketNumber),
      t.createdAt.toISOString().slice(0, 10),
      STATUS_LABEL[t.status] || t.status,
      t.customer.fullName,
      t.customer.phone,
      t.customer.email || '',
      t.device.name,
      t.device.serialNumber || '',
      t.faultDescription,
      t.dueDate.toISOString().slice(0, 10),
      t.completedAt ? t.completedAt.toISOString().slice(0, 10) : '',
      (totals.totalCents / 100).toFixed(2),
      (totals.paidCents / 100).toFixed(2),
      (totals.balanceCents / 100).toFixed(2),
    ]);
  }
  return rows.map((r) => r.map(esc).join(',')).join('\n') + '\n';
}

export { z };
