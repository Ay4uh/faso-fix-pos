import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma, isPostgres } from './prisma';
import { computeTotals, digitsOnly } from './money';
import { csvCell } from './csvSafe';
import {
  addItemSchema,
  createTicketSchema,
  customerUpdateSchema,
  noteSchema,
  partSchema,
  partUpdateSchema,
  paymentSchema,
  refundSchema,
  photoUploadSchema,
  settingsSchema,
  updateTicketSchema,
  loginSchema,
  userCreateSchema,
  userUpdateSchema,
  changePasswordSchema,
  resetPasswordSchema,
} from './schemas';
import {
  hashPassword,
  verifyPassword,
  verifyDummyPassword,
  hashSessionToken,
  generateToken,
  createSession,
  destroySession,
  recordAudit,
} from './auth';

type Tx = Prisma.TransactionClient;

/** Error with an HTTP status, surfaced to the client as JSON by the error handler. */
export class HttpError extends Error {
  public details?: any;
  public activeShift?: any;
  constructor(public status: number, message: string, extra?: { details?: any; activeShift?: any }) {
    super(message);
    if (extra?.details) this.details = extra.details;
    if (extra?.activeShift) this.activeShift = extra.activeShift;
  }
}

const STATUS_LABEL: Record<string, string> = {
  CHECKED_IN: 'Checked In',
  PENDING: 'Checked In',
  DIAGNOSING: 'Diagnosing',
  IN_PROGRESS: 'Diagnosing',
  WAITING_ON_APPROVAL: 'Waiting on Approval',
  WAITING_ON_PARTS: 'Waiting on Part',
  READY_FOR_PICKUP: 'Ready for Pickup',
  COMPLETED: 'Completed / Paid',
  DECLINED: 'Declined',
  CANCELLED: 'Cancelled',
};
const OPEN_STATUSES = [
  'CHECKED_IN',
  'PENDING',
  'DIAGNOSING',
  'IN_PROGRESS',
  'WAITING_ON_APPROVAL',
  'WAITING_ON_PARTS',
  'READY_FOR_PICKUP',
];

const money = (c: number) => `$${(c / 100).toFixed(2)}`;
const emptyToNull = (v: string | null | undefined) => (v === undefined ? undefined : v?.trim() ? v.trim() : null);
const ciContains = (q: string) => (isPostgres ? { contains: q, mode: 'insensitive' as const } : { contains: q });

/** "YYYY-MM-DD" is stored at local noon so it never shifts a day across time zones. */
function parseDate(v: string): Date {
  return /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00`) : new Date(v);
}

const ticketListSelect = {
  id: true,
  ticketNumber: true,
  customerId: true,
  deviceId: true,
  status: true,
  priority: true,
  faultDescription: true,
  laborCents: true,
  discountCents: true,
  taxRateBps: true,
  technician: true,
  bench: true,
  storageBin: true,
  diagnostics: true,
  dueDate: true,
  completedAt: true,
  deletedAt: true,
  isWarranty: true,
  createdAt: true,
  updatedAt: true,
  customer: true,
  device: true,
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TicketSelect;

const ticketInclude = {
  customer: true,
  device: true,
  items: { orderBy: { createdAt: 'asc' } },
  payments: { orderBy: { createdAt: 'asc' } },
} satisfies Prisma.TicketInclude;

type TicketWithRelations = Prisma.TicketGetPayload<{ include: typeof ticketInclude }>;

function withTotals<T extends Omit<TicketWithRelations, 'signature'> & { signature?: string | null }>(t: T) {
  let diagnostics: Record<string, 'PASS' | 'FAIL'> = {};
  try {
    diagnostics = JSON.parse(t.diagnostics || '{}');
  } catch {
    diagnostics = {};
  }
  return { ...t, signature: t.signature ?? null, diagnostics, totals: computeTotals(t) };
}

// ---------------------------------------------------------------------------
// Settings (read-only lookup + single-flight coalescing under concurrency)
// ---------------------------------------------------------------------------

let settingsInFlight: Promise<Awaited<ReturnType<typeof prisma.setting.upsert>>> | null = null;

export async function getSettings(tx: Tx | typeof prisma = prisma) {
  if (tx !== prisma) {
    const existing = await tx.setting.findUnique({ where: { id: 1 } });
    if (existing) return existing;
    return tx.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
  }
  if (settingsInFlight) return settingsInFlight;
  settingsInFlight = (async () => {
    try {
      const existing = await prisma.setting.findUnique({ where: { id: 1 } });
      if (existing) return existing;
      return await prisma.setting.upsert({ where: { id: 1 }, update: {}, create: { id: 1 } });
    } finally {
      settingsInFlight = null;
    }
  })();
  return settingsInFlight;
}

export async function updateSettings(input: unknown, actor?: { id?: string; name?: string }) {
  const data = settingsSchema.parse(input);
  await getSettings();
  const updated = await prisma.setting.update({ where: { id: 1 }, data });

  if (actor?.name) {
    const changedKeys = Object.keys(data).join(', ');
    await recordAudit({
      userId: actor.id,
      actorName: actor.name,
      action: 'SETTINGS_UPDATE',
      details: `Updated shop settings (${changedKeys || 'no fields changed'})`,
    });
  }

  return updated;
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
  const cleanId = (id || '').trim();
  const numericMatch = cleanId.replace(/^(wo[\s\-_]*)?#?/i, '');
  const isNumeric = /^\d+$/.test(numericMatch);

  const t = await prisma.ticket.findFirst({
    where: {
      deletedAt: null,
      OR: [
        { id: cleanId },
        ...(isNumeric ? [{ ticketNumber: Number(numericMatch) }] : []),
      ],
    },
    include: { ...ticketInclude, events: { orderBy: { createdAt: 'desc' } } },
  });
  if (!t) throw new HttpError(404, 'Work order not found');
  const otherTickets = await prisma.ticket.findMany({
    where: { customerId: t.customerId, deletedAt: null, NOT: { id: t.id } },
    select: { id: true, ticketNumber: true, status: true, createdAt: true, device: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return { ...withTotals(t), otherTickets };
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  hasMore: boolean;
}

export async function listTicketsPaginated(params: {
  view?: string;
  search?: string;
  bench?: string;
  sort?: string;
  warranty?: boolean | string;
  page?: number;
  pageSize?: number;
}) {
  const view = params.view || 'OPEN';
  const where: Prisma.TicketWhereInput = {
    deletedAt: null,
  };

  if (view === 'OPEN') where.status = { in: OPEN_STATUSES };
  else if (view === 'CHECKED_IN' || view === 'PENDING') where.status = { in: ['CHECKED_IN', 'PENDING'] };
  else if (view === 'DIAGNOSING' || view === 'IN_PROGRESS') where.status = { in: ['DIAGNOSING', 'IN_PROGRESS'] };
  else if (view === 'WARRANTY') where.isWarranty = true;
  else if (view !== 'ALL') where.status = view;

  if (params.warranty === true || params.warranty === 'true') {
    where.isWarranty = true;
  } else if (params.warranty === false || params.warranty === 'false') {
    where.isWarranty = false;
  }

  if (params.bench && params.bench !== 'ALL') {
    where.bench = params.bench;
  }

  const q = (params.search || '').trim();
  if (q) {
    const numeric = q.replace(/^(wo[\s\-_]*)?#?/i, '');
    const digits = digitsOnly(q);
    const or: Prisma.TicketWhereInput[] = [
      { customer: { fullName: ciContains(q) } },
      { device: { name: ciContains(q) } },
      { device: { serialNumber: ciContains(q) } },
      { faultDescription: ciContains(q) },
    ];
    if (/^\d+$/.test(numeric)) or.push({ ticketNumber: Number(numeric) });
    if (digits.length >= 3) or.push({ customer: { phoneDigits: { contains: digits } } });
    where.OR = or;
  }

  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || 25)), 500);
  const skip = (page - 1) * pageSize;

  const orderBy: Prisma.TicketOrderByWithRelationInput[] =
    params.sort === 'dueDate'
      ? [{ dueDate: 'asc' }, { ticketNumber: 'desc' }]
      : view === 'COMPLETED'
      ? [{ completedAt: 'desc' }, { ticketNumber: 'desc' }]
      : [{ ticketNumber: 'desc' }];

  const [total, tickets] = await Promise.all([
    prisma.ticket.count({ where }),
    prisma.ticket.findMany({
      where,
      select: ticketListSelect,
      orderBy,
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: tickets.map(withTotals),
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
  };
}

export async function listTickets(params: { view?: string; search?: string; bench?: string; sort?: string; warranty?: boolean | string }) {
  const res = await listTicketsPaginated({ ...params, page: 1, pageSize: 500 });
  return res.items;
}

const TX_OPTIONS = { maxWait: 15000, timeout: 20000 };

export async function createTicket(input: unknown, actor?: { id?: string; name?: string }) {
  const data = createTicketSchema.parse(input);
  const phoneDigits = digitsOnly(data.customer.phone);

  let createdNumber = 0;
  let customerName = data.customer.fullName;
  let deviceName = data.device.name;

  const id = await prisma.$transaction(async (tx) => {
    const settings = await getSettings(tx);

    // Atomic row-locked counter increment prevents duplicate ticketNumbers under concurrency
    const bumped = await tx.setting.update({
      where: { id: 1 },
      data: { nextTicketNumber: { increment: 1 } },
    });
    const maxTicket = await tx.ticket.findFirst({
      orderBy: { ticketNumber: 'desc' },
      select: { ticketNumber: true },
    });
    let ticketNumber = bumped.nextTicketNumber - 1;
    const nextFromMax = (maxTicket?.ticketNumber ?? 0) + 1;
    if (nextFromMax > ticketNumber) {
      ticketNumber = nextFromMax;
      await tx.setting.update({
        where: { id: 1 },
        data: { nextTicketNumber: ticketNumber + 1 },
      });
    }

    // Customer: matched on phone digits so "(555) 123-4567" and "5551234567" are the same person.
    let customer = await tx.customer.findUnique({ where: { phoneDigits } });
    if (!customer) {
      customer = await tx.customer.create({
        data: {
          fullName: data.customer.fullName,
          phone: data.customer.phone,
          phoneDigits,
          altPhone: emptyToNull(data.customer.altPhone) ?? null,
          email: emptyToNull(data.customer.email) ?? null,
          address: emptyToNull(data.customer.address) ?? null,
        },
      });
    } else {
      // Returning customer: fill in contact details we didn't have before, never overwrite.
      const fill: Prisma.CustomerUpdateInput = {};
      if (!customer.altPhone && data.customer.altPhone) fill.altPhone = data.customer.altPhone;
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
        discountCents: data.discountCents || 0,
        taxRateBps: settings.taxRateBps,
        priority: data.priority,
        technician: emptyToNull(data.technician) ?? null,
        bench: emptyToNull(data.bench) ?? null,
        storageBin: emptyToNull(data.storageBin) ?? null,
        signature: emptyToNull(data.signature) ?? null,
        isWarranty: Boolean(data.isWarranty),
        dueDate: parseDate(data.dueDate),
      },
    });
    createdNumber = ticketNumber;
    customerName = customer.fullName;
    deviceName = device.name;
    await logEvent(
      tx,
      ticket.id,
      'STATUS',
      `Work order #${ticketNumber}${data.isWarranty ? ' (WARRANTY)' : ''} created for ${device.name}`,
      actor?.name || data.technician
    );

    if (data.depositCents && data.depositCents > 0) {
      const totals = computeTotals({ ...ticket, items: [], payments: [] });
      if (data.depositCents > totals.totalCents) {
        throw new HttpError(400, `Deposit (${money(data.depositCents)}) cannot exceed the quoted total (${money(totals.totalCents)})`);
      }
      await tx.payment.create({
        data: { ticketId: ticket.id, amountCents: data.depositCents, method: data.depositMethod || 'CASH', note: 'Deposit at intake' },
      });
      await logEvent(tx, ticket.id, 'PAYMENT', `Deposit of ${money(data.depositCents)} received (${data.depositMethod || 'CASH'})`, actor?.name);
    }
    return ticket.id;
  }, TX_OPTIONS);

  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'POS User',
    action: 'TICKET_CREATE',
    details: `Created work order #${createdNumber} for ${customerName} (${deviceName})${data.isWarranty ? ' [Warranty]' : ''}`,
  });

  return getTicket(id);
}

export async function updateTicket(id: string, input: unknown, author?: string | null, actorId?: string | null) {
  const data = updateTicketSchema.parse(input);
  let auditSummary = '';
  let auditTicketNum = 0;

  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, id);
    auditTicketNum = t.ticketNumber;

    // Optimistic concurrency guard: reject stale writes if another staff member saved newer edits
    if (data.expectedUpdatedAt) {
      const expectedMs = Date.parse(data.expectedUpdatedAt);
      if (!Number.isNaN(expectedMs) && t.updatedAt.getTime() !== expectedMs) {
        throw new HttpError(
          409,
          'Conflict: This work order was modified by another employee. Refresh before saving to avoid overwriting their changes.'
        );
      }
    }

    const update: Prisma.TicketUpdateInput = {};
    const changes: string[] = [];

    if (data.status && data.status !== t.status) {
      const wasClosedOut = t.status === 'CANCELLED' || t.status === 'DECLINED';
      const willCloseOut = data.status === 'CANCELLED' || data.status === 'DECLINED';

      if (!wasClosedOut && willCloseOut) {
        // Restore attached inventory parts back to stock on cancel/decline while preserving ticket line history
        let returnedCount = 0;
        for (const item of t.items) {
          if (item.partId) {
            await tx.inventoryPart.update({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } });
            returnedCount += item.quantity;
          }
        }
        if (returnedCount > 0) {
          changes.push(`returned ${returnedCount} part(s) to stock`);
        }
      } else if (wasClosedOut && !willCloseOut) {
        // Re-deduct attached inventory parts if reopened
        for (const item of t.items) {
          if (item.partId) {
            const part = await tx.inventoryPart.findUnique({ where: { id: item.partId } });
            if (part) {
              if (part.stock < item.quantity) {
                throw new HttpError(409, `Cannot reopen work order: insufficient stock for ${part.name} (${part.stock} available, ${item.quantity} needed)`);
              }
              await tx.inventoryPart.update({ where: { id: item.partId }, data: { stock: { decrement: item.quantity } } });
            }
          }
        }
      }

      update.status = data.status;
      update.completedAt = data.status === 'COMPLETED' ? new Date() : null;
      await logEvent(tx, id, 'STATUS', `Status changed: ${STATUS_LABEL[t.status] || t.status} → ${STATUS_LABEL[data.status] || data.status}`, author);
      changes.push(`status ${t.status} → ${data.status}`);
    }
    if (data.priority && data.priority !== t.priority) {
      update.priority = data.priority;
      changes.push(`priority → ${data.priority.toLowerCase()}`);
    }
    if (data.isWarranty !== undefined && data.isWarranty !== t.isWarranty) {
      update.isWarranty = data.isWarranty;
      changes.push(data.isWarranty ? 'marked warranty repair' : 'cleared warranty repair');
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
    for (const key of ['technician', 'bench', 'storageBin', 'signature'] as const) {
      if (data[key] !== undefined) {
        const v = emptyToNull(data[key]) ?? null;
        if (v !== t[key]) {
          update[key] = v;
          if (key === 'signature') {
            changes.push('customer signature captured');
          } else {
            changes.push(`${key === 'storageBin' ? 'storage bin' : key} → ${v ?? 'none'}`);
          }
        }
      }
    }
    if (data.diagnostics) {
      const cleanDiag: Record<string, 'PASS' | 'FAIL'> = {};
      for (const [k, v] of Object.entries(data.diagnostics)) {
        if (v === 'PASS' || v === 'FAIL') cleanDiag[k] = v;
      }
      update.diagnostics = JSON.stringify(cleanDiag);
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
    if (changes.length) {
      auditSummary = changes.join(', ');
      await logEvent(tx, id, 'SYSTEM', `Updated: ${auditSummary}`, author);
    }
  }, TX_OPTIONS);

  if (auditSummary) {
    await recordAudit({
      userId: actorId ?? undefined,
      actorName: author || 'POS User',
      action: 'TICKET_UPDATE',
      details: `WO #${auditTicketNum}: ${auditSummary}`,
    });
  }

  return getTicket(id);
}

export async function deleteTicket(id: string, author?: string | null) {
  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, id);
    // Return any inventory parts to stock.
    for (const item of t.items) {
      if (item.partId) await tx.inventoryPart.update({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } });
    }
    await tx.ticket.update({ where: { id }, data: { deletedAt: new Date() } });
    await logEvent(tx, id, 'SYSTEM', 'Work order deleted by administrator', author);
  }, TX_OPTIONS);
  return { ok: true };
}

export async function addItem(ticketId: string, input: unknown, author?: string | null) {
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
    await logEvent(tx, ticketId, 'ITEM', `Added ${data.quantity} × ${description} @ ${money(unitPriceCents)}`, author);
  }, TX_OPTIONS);

  return getTicket(ticketId);
}

export async function removeItem(ticketId: string, itemId: string, author?: string | null) {
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    const item = await tx.ticketItem.findFirst({ where: { id: itemId, ticketId } });
    if (!item) throw new HttpError(404, 'Line item not found');
    if (item.partId) {
      await tx.inventoryPart.update({ where: { id: item.partId }, data: { stock: { increment: item.quantity } } });
    }
    await tx.ticketItem.delete({ where: { id: itemId } });
    await logEvent(tx, ticketId, 'ITEM', `Removed ${item.quantity} × ${item.description}${item.partId ? ' (returned to stock)' : ''}`, author);
  }, TX_OPTIONS);
  return getTicket(ticketId);
}

export async function addPayment(ticketId: string, input: unknown, author?: string | null, actorId?: string | null) {
  const data = paymentSchema.parse(input);
  const cleanKey = data.idempotencyKey?.replace(/[\[\]]/g, '').trim();
  const idempMarker = cleanKey ? `[ref:${cleanKey}]` : '';
  let wasDuplicate = false;
  let ticketNum = 0;

  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    ticketNum = t.ticketNumber;

    if (idempMarker && t.payments.some((p) => p.note?.includes(idempMarker))) {
      wasDuplicate = true;
      return;
    }

    if (t.status === 'CANCELLED' || t.status === 'DECLINED') {
      throw new HttpError(409, 'Cannot process payment on a cancelled or declined work order');
    }

    const { balanceCents } = computeTotals(t);
    if (t.status === 'COMPLETED' && balanceCents <= 0) {
      throw new HttpError(409, 'This completed work order is already settled and cannot be charged twice');
    }

    const isDeposit = data.note && /deposit/i.test(data.note);
    if (!isDeposit) {
      if (balanceCents <= 0) throw new HttpError(409, 'Nothing is owing on this work order');
      if (data.amountCents > balanceCents) {
        throw new HttpError(400, `Payment (${money(data.amountCents)}) is more than the balance owing (${money(balanceCents)})`);
      }
    }
    const baseNote = emptyToNull(data.note) ?? null;
    const storedNote = idempMarker ? (baseNote ? `${baseNote} ${idempMarker}` : idempMarker) : baseNote;
    await tx.payment.create({ data: { ticketId, amountCents: data.amountCents, method: data.method, note: storedNote } });
    const remaining = Math.max(0, balanceCents - data.amountCents);
    await logEvent(
      tx,
      ticketId,
      'PAYMENT',
      `${isDeposit ? 'Deposit' : 'Payment'} of ${money(data.amountCents)} received (${data.method.replace('_', '-')})${remaining === 0 ? ' — paid in full' : `, ${money(remaining)} still owing`}`,
      author,
    );
  }, TX_OPTIONS);

  if (!wasDuplicate) {
    await recordAudit({
      userId: actorId ?? undefined,
      actorName: author || 'POS User',
      action: 'PAYMENT_RECORDED',
      details: `WO #${ticketNum}: Payment of ${money(data.amountCents)} (${data.method})`,
    });
  }
  return getTicket(ticketId);
}

export async function refundPayment(ticketId: string, input: unknown, author?: string | null, actorId?: string | null) {
  const data = refundSchema.parse(input);
  const cleanKey = data.idempotencyKey?.replace(/[\[\]]/g, '').trim();
  const idempMarker = cleanKey ? `[ref:${cleanKey}]` : '';
  let wasDuplicate = false;
  let ticketNum = 0;

  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    ticketNum = t.ticketNumber;

    if (idempMarker && t.payments.some((p) => p.note?.includes(idempMarker))) {
      wasDuplicate = true;
      return;
    }

    const totals = computeTotals(t);
    if (totals.paidCents <= 0) {
      throw new HttpError(409, 'No paid balance exists to refund on this work order');
    }
    if (data.amountCents > totals.paidCents) {
      throw new HttpError(400, `Refund (${money(data.amountCents)}) exceeds net collected amount (${money(totals.paidCents)})`);
    }

    const storedNote = idempMarker ? `Refund: ${data.reason} ${idempMarker}` : `Refund: ${data.reason}`;
    await tx.payment.create({
      data: {
        ticketId,
        amountCents: -data.amountCents,
        method: data.method,
        note: storedNote,
      },
    });
    await logEvent(
      tx,
      ticketId,
      'PAYMENT',
      `Refund of ${money(data.amountCents)} issued (${data.method.replace('_', '-')}) — Reason: ${data.reason}`,
      author,
    );
  }, TX_OPTIONS);

  if (!wasDuplicate) {
    await recordAudit({
      userId: actorId ?? undefined,
      actorName: author || 'POS User',
      action: 'PAYMENT_REFUND',
      details: `WO #${ticketNum}: Refunded ${money(data.amountCents)} (${data.method}) - ${data.reason}`,
    });
  }
  return getTicket(ticketId);
}

export async function voidPayment(ticketId: string, paymentId: string, author?: string | null, actorId?: string | null) {
  let ticketNum = 0;
  let voidedAmount = 0;
  let voidedMethod = '';
  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    ticketNum = t.ticketNumber;
    const p = await tx.payment.findFirst({ where: { id: paymentId, ticketId } });
    if (!p) throw new HttpError(404, 'Payment not found');
    voidedAmount = p.amountCents;
    voidedMethod = p.method;
    await tx.payment.delete({ where: { id: paymentId } });
    await logEvent(tx, ticketId, 'PAYMENT', `Voided payment of ${money(p.amountCents)} (${p.method})`, author);
  }, TX_OPTIONS);

  await recordAudit({
    userId: actorId ?? undefined,
    actorName: author || 'POS User',
    action: 'PAYMENT_VOID',
    details: `WO #${ticketNum}: Voided payment of ${money(voidedAmount)} (${voidedMethod})`,
  });
  return getTicket(ticketId);
}

export async function addPhoto(ticketId: string, input: unknown, author?: string | null, actorId?: string | null) {
  const data = photoUploadSchema.parse(input);
  const match = data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new HttpError(400, 'Unsupported file format. Only valid JPEG, PNG, and WebP images are accepted.');
  }

  const [, mime, b64] = match;
  const header = Buffer.from(b64.slice(0, 32), 'base64');
  const isPng = mime === 'image/png' && header.length >= 8 && header[0] === 0x89 && header[1] === 0x50 && header[2] === 0x4e && header[3] === 0x47;
  const isJpeg = mime === 'image/jpeg' && header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff;
  const isWebp =
    mime === 'image/webp' &&
    header.length >= 12 &&
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP';

  if (!isPng && !isJpeg && !isWebp) {
    throw new HttpError(400, 'Unsupported or corrupted image signature. File magic bytes do not match JPEG, PNG, or WebP.');
  }

  const safeFilename = data.filename.replace(/[^\w.\- ()]/g, '_').slice(0, 120) || 'device-photo.jpg';
  let ticketNum = 0;

  await prisma.$transaction(async (tx) => {
    const t = await loadTicket(tx, ticketId);
    ticketNum = t.ticketNumber;
    const payload = JSON.stringify({
      filename: safeFilename,
      caption: emptyToNull(data.caption) ?? null,
      dataUrl: data.dataUrl,
    });
    await logEvent(tx, ticketId, 'PHOTO', payload, author);
  }, TX_OPTIONS);

  await recordAudit({
    userId: actorId ?? undefined,
    actorName: author || 'POS User',
    action: 'TICKET_PHOTO_UPLOAD',
    details: `WO #${ticketNum}: Attached device photo "${safeFilename}"`,
  });

  return getTicket(ticketId);
}

export async function addNote(ticketId: string, input: unknown, author?: string | null) {
  const data = noteSchema.parse(input);
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    await logEvent(tx, ticketId, data.kind, data.message, author);
  }, TX_OPTIONS);
  return getTicket(ticketId);
}

export async function updateNote(ticketId: string, noteId: string, message: string) {
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    const existing = await tx.ticketEvent.findFirst({
      where: { id: noteId, ticketId },
    });
    if (!existing) throw new HttpError(404, 'Note not found');
    if (existing.kind !== 'CUSTOMER_NOTE' && existing.kind !== 'INTERNAL_NOTE') {
      throw new HttpError(403, 'System, status, item, and payment timeline events are immutable and cannot be altered.');
    }
    await tx.ticketEvent.update({
      where: { id: noteId },
      data: { message: message.trim() },
    });
  }, TX_OPTIONS);
  return getTicket(ticketId);
}

export async function deleteNote(ticketId: string, noteId: string) {
  await prisma.$transaction(async (tx) => {
    await loadTicket(tx, ticketId);
    const existing = await tx.ticketEvent.findFirst({
      where: { id: noteId, ticketId },
    });
    if (!existing) throw new HttpError(404, 'Note not found');
    if (existing.kind !== 'CUSTOMER_NOTE' && existing.kind !== 'INTERNAL_NOTE') {
      throw new HttpError(403, 'System, status, item, and payment timeline events are immutable and cannot be deleted.');
    }
    await tx.ticketEvent.delete({
      where: { id: noteId },
    });
  }, TX_OPTIONS);
  return getTicket(ticketId);
}

// ---------------------------------------------------------------------------
// Customers
// ---------------------------------------------------------------------------

export async function listCustomers(search?: string) {
  const res = await listCustomersPaginated({ search, page: 1, pageSize: 500 });
  return res.items;
}

export async function listCustomersPaginated(params: {
  search?: string;
  includeArchived?: boolean;
  page?: number;
  pageSize?: number;
}) {
  const q = (params.search || '').trim();
  const digits = digitsOnly(q);
  const where: Prisma.CustomerWhereInput = {
    ...(params.includeArchived ? {} : { archivedAt: null }),
    ...(q
      ? {
          OR: [
            { fullName: ciContains(q) },
            { email: ciContains(q) },
            ...(digits.length >= 3 ? [{ phoneDigits: { contains: digits } }] : []),
          ],
        }
      : {}),
  };

  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || 25)), 500);
  const skip = (page - 1) * pageSize;

  const [total, customers] = await Promise.all([
    prisma.customer.count({ where }),
    prisma.customer.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        tickets: {
          where: { deletedAt: null },
          select: { id: true, status: true, createdAt: true, payments: { select: { amountCents: true } } },
        },
      },
      skip,
      take: pageSize,
    }),
  ]);

  const items = customers.map(({ tickets, ...c }) => ({
    ...c,
    ticketCount: tickets.length,
    openTickets: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
    totalPaidCents: tickets.reduce((s, t) => s + t.payments.reduce((a, p) => a + p.amountCents, 0), 0),
    lastVisit: tickets.reduce<Date | null>((d, t) => (!d || t.createdAt > d ? t.createdAt : d), null),
  }));

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
  };
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

export async function updateCustomer(id: string, input: unknown, actor?: { id?: string; name?: string }) {
  const data = customerUpdateSchema.parse(input);
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Customer not found');

  const update: Prisma.CustomerUpdateInput = {};
  if (data.fullName !== undefined) update.fullName = data.fullName;
  if (data.altPhone !== undefined) update.altPhone = emptyToNull(data.altPhone) ?? null;
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
  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'POS User',
    action: 'CUSTOMER_UPDATE',
    details: `Updated customer profile for ${data.fullName || existing.fullName} (${id})`,
  });
  return getCustomer(id);
}

export async function archiveCustomer(id: string, archived = true, actor?: { id?: string; name?: string }) {
  const existing = await prisma.customer.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Customer not found');
  await prisma.customer.update({
    where: { id },
    data: { archivedAt: archived ? new Date() : null },
  });
  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'POS User',
    action: archived ? 'CUSTOMER_ARCHIVE' : 'CUSTOMER_UNARCHIVE',
    details: `${archived ? 'Archived' : 'Restored'} customer ${existing.fullName} (${id}); invoices and repair history preserved`,
  });
  return getCustomer(id);
}

// ---------------------------------------------------------------------------
// Inventory
// ---------------------------------------------------------------------------

export function listParts(search?: string) {
  const q = (search || '').trim();
  return prisma.inventoryPart.findMany({
    where: q ? { OR: [{ name: ciContains(q) }, { sku: ciContains(q) }, { supplier: ciContains(q) }] } : {},
    orderBy: [{ name: 'asc' }],
  });
}

async function assertSkuFree(sku: string, exceptId?: string) {
  const clash = await prisma.inventoryPart.findUnique({ where: { sku } });
  if (clash && clash.id !== exceptId) throw new HttpError(409, `SKU "${sku}" is already used by ${clash.name}`);
}

export async function createPart(input: unknown, actor?: { id?: string; name?: string }) {
  const data = partSchema.parse(input);
  data.sku = data.sku.toUpperCase();
  await assertSkuFree(data.sku);
  const created = await prisma.inventoryPart.create({ data: { ...data, supplier: emptyToNull(data.supplier) ?? null } });
  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'POS User',
    action: 'INVENTORY_CREATE',
    details: `Added inventory item ${created.sku} (${created.name}), stock=${created.stock}`,
  });
  return created;
}

export async function updatePart(id: string, input: unknown, actor?: { id?: string; name?: string }) {
  const data = partUpdateSchema.parse(input);
  if (!(await prisma.inventoryPart.findUnique({ where: { id } }))) throw new HttpError(404, 'Part not found');
  if (data.sku) {
    data.sku = data.sku.toUpperCase();
    await assertSkuFree(data.sku, id);
  }
  const updated = await prisma.inventoryPart.update({
    where: { id },
    data: { ...data, supplier: data.supplier === undefined ? undefined : emptyToNull(data.supplier) ?? null },
  });
  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'POS User',
    action: 'INVENTORY_UPDATE',
    details: `Updated inventory item ${updated.sku} (${updated.name})`,
  });
  return updated;
}

export async function adjustStock(id: string, delta: number, actor?: { id?: string; name?: string }) {
  const part = await prisma.inventoryPart.findUnique({ where: { id } });
  if (!part) throw new HttpError(404, 'Part not found');
  if (part.stock + delta < 0) throw new HttpError(409, `Stock cannot go below zero (currently ${part.stock})`);
  const updated = await prisma.inventoryPart.update({ where: { id }, data: { stock: { increment: delta } } });
  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'POS User',
    action: 'INVENTORY_ADJUST',
    details: `Adjusted ${updated.sku} stock by ${delta > 0 ? `+${delta}` : delta} → ${updated.stock}`,
  });
  return updated;
}

export async function deletePart(id: string, actor?: { id?: string; name?: string }) {
  const existing = await prisma.inventoryPart.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'Part not found');
  // Past work orders keep their own snapshot of the description and price.
  await prisma.inventoryPart.delete({ where: { id } });
  await recordAudit({
    userId: actor?.id,
    actorName: actor?.name || 'Admin',
    action: 'INVENTORY_DELETE',
    details: `Deleted inventory part ${existing.sku} (${existing.name})`,
  });
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

let dashboardInFlight: Promise<any> | null = null;

export async function getDashboard() {
  if (dashboardInFlight) return dashboardInFlight;

  dashboardInFlight = (async () => {
    try {
      const today = startOfDay();
      const tomorrow = new Date(today.getTime() + 86_400_000);
      const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

      const [tickets, payments, lowStock, customerCount] = await Promise.all([
        prisma.ticket.findMany({
          where: { deletedAt: null },
          select: {
            status: true,
            dueDate: true,
            laborCents: true,
            discountCents: true,
            taxRateBps: true,
            isWarranty: true,
            items: { select: { quantity: true, unitPriceCents: true } },
            payments: { select: { amountCents: true } },
          },
        }),
        prisma.payment.findMany({
          where: { createdAt: { gte: monthStart }, ticket: { deletedAt: null } },
          select: { amountCents: true, createdAt: true },
        }),
        prisma.inventoryPart.count({ where: { stock: { lte: prisma.inventoryPart.fields.reorderPoint } } }),
        prisma.customer.count({ where: { archivedAt: null } }),
      ]);

      const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
      const count = (s: string) => tickets.filter((t) => t.status === s).length;
      const awaitingPickupTickets = tickets.filter(
        (t) =>
          t.status === 'READY_FOR_PICKUP' ||
          (t.status === 'COMPLETED' && computeTotals(t).balanceCents > 0)
      );

      const checkedIn = count('PENDING') + count('CHECKED_IN');
      const diagnosing = count('IN_PROGRESS') + count('DIAGNOSING');
      const waitingOnApproval = count('WAITING_ON_APPROVAL');
      const readyForPickup = count('READY_FOR_PICKUP');
      const totalValueCents = Math.max(0, tickets.reduce((s, t) => s + Math.max(0, computeTotals(t).totalCents), 0));
      const avgTicketValueCents = tickets.length > 0 ? Math.round(totalValueCents / tickets.length) : 0;

      return {
        totalTickets: tickets.length,
        open: open.length,
        checkedIn,
        pending: checkedIn,
        diagnosing,
        inProgress: diagnosing,
        waitingOnApproval,
        waitingOnParts: count('WAITING_ON_PARTS'),
        readyForPickup,
        completed: count('COMPLETED'),
        declined: count('DECLINED'),
        cancelled: count('CANCELLED'),
        warrantyTickets: tickets.filter((t) => t.isWarranty).length,
        paidTickets: tickets.filter((t) => !t.isWarranty).length,
        overdue: open.filter((t) => t.dueDate < today).length,
        dueToday: open.filter((t) => t.dueDate >= today && t.dueDate < tomorrow).length,
        openValueCents: Math.max(0, open.reduce((s, t) => s + Math.max(0, computeTotals(t).totalCents), 0)),
        totalValueCents,
        avgTicketValueCents,
        awaitingPickupCount: awaitingPickupTickets.length,
        awaitingPickupCents: awaitingPickupTickets.reduce((s, t) => s + Math.max(0, computeTotals(t).balanceCents), 0),
        collectedTodayCents: payments.filter((p) => p.createdAt >= today).reduce((s, p) => s + p.amountCents, 0),
        collectedMonthCents: payments.reduce((s, p) => s + p.amountCents, 0),
        customerCount,
        lowStock,
      };
    } finally {
      dashboardInFlight = null;
    }
  })();

  return dashboardInFlight;
}

export async function getReport(days: number) {
  const span = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
  const since = startOfDay(new Date(Date.now() - (span - 1) * 86_400_000));

  const [payments, created, completed, items] = await Promise.all([
    prisma.payment.findMany({
      where: { createdAt: { gte: since }, ticket: { deletedAt: null } },
      select: {
        amountCents: true,
        method: true,
        createdAt: true,
        ticket: {
          select: {
            laborCents: true,
            discountCents: true,
            taxRateBps: true,
            items: { select: { quantity: true, unitPriceCents: true } },
            payments: { select: { amountCents: true } },
          },
        },
      },
    }),
    prisma.ticket.findMany({
      where: { createdAt: { gte: since }, deletedAt: null },
      select: { createdAt: true, isWarranty: true, device: { select: { name: true } } },
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

  const partsRevenueCents = items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
  const partsCostCents = items.reduce((s, i) => s + i.quantity * i.unitCostCents, 0);
  const refundsCents = payments.filter((p) => p.amountCents < 0).reduce((s, p) => s + Math.abs(p.amountCents), 0);
  let netTaxCollectedCents = 0;
  for (const p of payments) {
    if (p.ticket) {
      const totals = computeTotals(p.ticket);
      if (totals.totalCents > 0 && totals.taxCents > 0) {
        const share = Math.max(-1, Math.min(1, p.amountCents / totals.totalCents));
        netTaxCollectedCents += Math.round(totals.taxCents * share);
      }
    }
  }

  return {
    days: span,
    since,
    revenueCents: payments.reduce((s, p) => s + p.amountCents, 0),
    refundsCents,
    netTaxCollectedCents,
    ticketsCreated: created.length,
    warrantyTicketsCount: created.filter((t) => t.isWarranty).length,
    paidTicketsCount: created.filter((t) => !t.isWarranty).length,
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

/**
 * Integrated POS Sales Attribution & Employee Labor Productivity Analytics
 */
export async function getSalesLaborAnalytics(startDateStr?: string, endDateStr?: string) {
  const now = new Date();
  const start = startDateStr ? new Date(startDateStr) : new Date(now.getTime() - 30 * 86_400_000);
  const end = endDateStr ? new Date(endDateStr) : now;

  const [tickets, payments, shifts, users] = await Promise.all([
    prisma.ticket.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        deletedAt: null,
      },
      include: ticketInclude,
    }),
    prisma.payment.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        ticket: { deletedAt: null },
      },
      include: {
        ticket: {
          select: {
            id: true,
            ticketNumber: true,
            technician: true,
            laborCents: true,
            discountCents: true,
            taxRateBps: true,
            items: { select: { quantity: true, unitPriceCents: true } },
            payments: { select: { amountCents: true } },
          },
        },
      },
    }),
    prisma.shift.findMany({
      where: {
        clockIn: { gte: start, lte: end },
        status: 'COMPLETED',
      },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            username: true,
            role: true,
            hourlyRateCents: true,
            overtimeRateCents: true,
          },
        },
      },
    }),
    prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        role: true,
        hourlyRateCents: true,
        bench: true,
      },
    }),
  ]);

  // 1. Payment Breakdown by Method
  const byMethod: Record<string, { count: number; totalCents: number }> = {
    CASH: { count: 0, totalCents: 0 },
    CARD: { count: 0, totalCents: 0 },
    DEBIT: { count: 0, totalCents: 0 },
    E_TRANSFER: { count: 0, totalCents: 0 },
    OTHER: { count: 0, totalCents: 0 },
  };

  let totalRevenueCents = 0;
  let totalDiscountsCents = 0;
  let totalRefundsCents = 0;
  let totalVoidedTransactions = 0;
  let taxCollectedCents = 0;

  for (const p of payments) {
    const m = (p.method || 'OTHER').toUpperCase();
    if (!byMethod[m]) byMethod[m] = { count: 0, totalCents: 0 };
    if (p.amountCents >= 0) {
      byMethod[m].count++;
      byMethod[m].totalCents += p.amountCents;
      totalRevenueCents += p.amountCents;
    } else {
      byMethod[m].totalCents += p.amountCents;
      totalRevenueCents += p.amountCents;
      totalRefundsCents += Math.abs(p.amountCents);
      totalVoidedTransactions++;
    }
    if (p.ticket) {
      const totals = computeTotals(p.ticket);
      if (totals.totalCents > 0 && totals.taxCents > 0) {
        const share = Math.max(-1, Math.min(1, p.amountCents / totals.totalCents));
        taxCollectedCents += Math.round(totals.taxCents * share);
      }
    }
  }

  for (const t of tickets) {
    if (t.discountCents > 0) totalDiscountsCents += t.discountCents;
  }

  const transactionCount = payments.filter((p) => p.amountCents > 0).length;
  const avgTransactionCents = transactionCount > 0 ? Math.round(totalRevenueCents / transactionCount) : 0;

  // 2. Sales Attribution by Employee
  const employeeMap = new Map<string, {
    userId: string;
    name: string;
    username: string;
    role: string;
    hourlyWageCents: number;
    ticketsCreated: number;
    ticketsCompleted: number;
    laborBilledCents: number;
    partsBilledCents: number;
    totalRevenueCents: number;
    actualHoursWorked: number;
    laborCostCents: number;
  }>();

  for (const u of users) {
    employeeMap.set(u.name.toLowerCase(), {
      userId: u.id,
      name: u.name,
      username: u.username,
      role: u.role,
      hourlyWageCents: u.hourlyRateCents || 2200,
      ticketsCreated: 0,
      ticketsCompleted: 0,
      laborBilledCents: 0,
      partsBilledCents: 0,
      totalRevenueCents: 0,
      actualHoursWorked: 0,
      laborCostCents: 0,
    });
  }

  const ensureEmployeeStat = (displayName: string, fallbackUser?: { id: string; username: string; role: string; hourlyRateCents: number }) => {
    const key = displayName.toLowerCase();
    if (!employeeMap.has(key)) {
      employeeMap.set(key, {
        userId: fallbackUser?.id || `staff-${key.replace(/[^a-z0-9]+/g, '-')}`,
        name: displayName,
        username: fallbackUser?.username || key,
        role: fallbackUser?.role || 'STAFF',
        hourlyWageCents: fallbackUser?.hourlyRateCents || 0,
        ticketsCreated: 0,
        ticketsCompleted: 0,
        laborBilledCents: 0,
        partsBilledCents: 0,
        totalRevenueCents: 0,
        actualHoursWorked: 0,
        laborCostCents: 0,
      });
    }
    return employeeMap.get(key)!;
  };

  for (const t of tickets) {
    const stat = ensureEmployeeStat(t.technician || 'Unassigned');
    stat.ticketsCreated++;
    if (t.status === 'COMPLETED') stat.ticketsCompleted++;
    stat.laborBilledCents += t.laborCents;

    const partsTotal = t.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
    stat.partsBilledCents += partsTotal;
  }

  for (const p of payments) {
    const stat = ensureEmployeeStat(p.ticket?.technician || 'Unassigned');
    stat.totalRevenueCents += p.amountCents;
  }

  // Factor in actual hours worked and labor cost
  let totalLaborCostCents = 0;
  let totalWorkedHours = 0;

  for (const s of shifts) {
    const stat = ensureEmployeeStat(s.user.name, s.user);
    const regularHours = s.regularMinutes / 60;
    const overtimeHours = s.overtimeMinutes / 60;
    const shiftHours = s.totalMinutes / 60;
    const otRate = s.user.overtimeRateCents || Math.round(s.user.hourlyRateCents * 1.5);
    const shiftWageCents = Math.round(regularHours * s.user.hourlyRateCents + overtimeHours * otRate);

    totalLaborCostCents += shiftWageCents;
    totalWorkedHours += shiftHours;

    stat.actualHoursWorked += shiftHours;
    stat.laborCostCents += shiftWageCents;
  }

  const salesByEmployee = Array.from(employeeMap.values())
    .filter((e) => e.ticketsCreated > 0 || e.actualHoursWorked > 0 || e.totalRevenueCents > 0)
    .map((e) => {
      const revenuePerHour = e.actualHoursWorked > 0 ? Math.round(e.totalRevenueCents / e.actualHoursWorked) : 0;
      const laborRatioPct = e.totalRevenueCents > 0 ? Number(((e.laborCostCents / e.totalRevenueCents) * 100).toFixed(1)) : 0;
      return {
        ...e,
        actualHoursWorked: Number(e.actualHoursWorked.toFixed(2)),
        revenuePerHourCents: revenuePerHour,
        laborRatioPct,
      };
    })
    .sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);

  // 3. Sales By Shift (Correlating exact clock-in window with POS payments)
  const salesByShift = shifts.slice(0, 30).map((s) => {
    const shiftStart = s.clockIn;
    const shiftEnd = s.clockOut || new Date(s.clockIn.getTime() + s.totalMinutes * 60000);

    const shiftPayments = payments.filter(
      (p) => p.createdAt >= shiftStart && p.createdAt <= shiftEnd
    );
    const shiftRevenueCents = shiftPayments.reduce((sum, p) => sum + p.amountCents, 0);
    const positiveTxCount = shiftPayments.filter((p) => p.amountCents > 0).length;

    const regularHours = s.regularMinutes / 60;
    const overtimeHours = s.overtimeMinutes / 60;
    const otRate = s.user.overtimeRateCents || Math.round(s.user.hourlyRateCents * 1.5);
    const shiftLaborCostCents = Math.round(regularHours * s.user.hourlyRateCents + overtimeHours * otRate);

    const laborCostPct = shiftRevenueCents > 0 ? Number(((shiftLaborCostCents / shiftRevenueCents) * 100).toFixed(1)) : 0;
    const workedHours = Number((s.totalMinutes / 60).toFixed(2));

    return {
      shiftId: s.id,
      userId: s.user.id,
      employeeName: s.user.name,
      clockIn: s.clockIn,
      clockOut: s.clockOut,
      workedHours,
      durationHours: workedHours,
      laborCostCents: shiftLaborCostCents,
      shiftLaborCostCents,
      revenueGeneratedCents: shiftRevenueCents,
      shiftRevenueCents,
      transactionsCount: positiveTxCount,
      ticketsCount: positiveTxCount,
      laborCostPct,
      shiftLaborCostPct: laborCostPct,
    };
  });

  const overallLaborCostPct = totalRevenueCents > 0 ? Number(((totalLaborCostCents / totalRevenueCents) * 100).toFixed(1)) : 0;
  const overallRevenuePerHourCents = totalWorkedHours > 0 ? Math.round(totalRevenueCents / totalWorkedHours) : 0;

  const summary = {
    totalRevenueCents,
    laborBilledCents: salesByEmployee.reduce((acc, e) => acc + (e.laborBilledCents || 0), 0),
    partsBilledCents: salesByEmployee.reduce((acc, e) => acc + (e.partsBilledCents || 0), 0),
    taxCollectedCents,
    totalLaborCostCents,
    laborCostPct: overallLaborCostPct,
    totalHoursWorked: Number(totalWorkedHours.toFixed(2)),
    revenuePerHourCents: overallRevenuePerHourCents,
    totalTicketsCreated: tickets.length,
    totalTicketsCompleted: tickets.filter((t) => t.status === 'COMPLETED').length,
    avgTicketValueCents: avgTransactionCents,
  };

  const salesBreakdown = {
    byPaymentMethod: {
      cashCents: byMethod.CASH?.totalCents || 0,
      cardCents: (byMethod.CARD?.totalCents || 0) + (byMethod.CREDIT?.totalCents || 0),
      debitCents: byMethod.DEBIT?.totalCents || 0,
      eTransferCents: byMethod.E_TRANSFER?.totalCents || 0,
      otherCents: byMethod.OTHER?.totalCents || 0,
    },
    totalDiscountsCents,
    totalRefundsCents,
    totalVoidedTransactions,
  };

  return {
    period: { startDate: start.toISOString(), endDate: end.toISOString() },
    startDate: start,
    endDate: end,
    summary,
    totalRevenueCents,
    totalDiscountsCents,
    totalRefundsCents,
    totalTransactions: transactionCount,
    avgTransactionCents,
    totalLaborCostCents,
    totalWorkedHours: Number(totalWorkedHours.toFixed(2)),
    overallLaborCostPct,
    overallRevenuePerHourCents,
    byMethod,
    salesBreakdown,
    salesByEmployee,
    byEmployee: salesByEmployee,
    salesByShift,
    byShift: salesByShift,
  };
}

export async function exportTicketsCsv() {
  const tickets = await prisma.ticket.findMany({ where: { deletedAt: null }, include: ticketInclude, orderBy: { ticketNumber: 'asc' } });
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
  return rows.map((r) => r.map(csvCell).join(',')).join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Authentication & User Management
// ---------------------------------------------------------------------------

export async function loginUser(input: unknown, ipAddress?: string, userAgent?: string) {
  const { usernameOrEmail, password, adminMode } = loginSchema.parse(input);

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { username: usernameOrEmail.toLowerCase() },
        { email: usernameOrEmail.toLowerCase() },
      ],
    },
  });

  if (!user) {
    verifyDummyPassword(password);
    throw new HttpError(401, 'Invalid username/email or password');
  }

  if (user.status !== 'ACTIVE') {
    throw new HttpError(403, 'This account has been deactivated. Contact an administrator.');
  }

  const isValid = verifyPassword(password, user.passwordHash);

  if (!isValid) {
    throw new HttpError(401, 'Invalid username/email or password');
  }

  // Reject standard accounts trying to access Admin Mode
  if (adminMode && user.role !== 'ADMIN') {
    await recordAudit({
      userId: user.id,
      actorName: user.name,
      action: 'ADMIN_ACCESS_REJECTED',
      details: `User ${user.username} was denied access to Admin Mode (role: ${user.role})`,
      ipAddress,
    });
    throw new HttpError(403, 'Access Denied: Administrator role required. Standard technicians must use Technician Login.');
  }

  // Require second-factor TOTP verification before minting any session when 2FA is enabled
  if (user.twoFactorEnabled && user.twoFactorSecret) {
    const challengeToken = generateToken();
    const challengeExpiresAt = new Date(Date.now() + 5 * 60_000);
    await prisma.twoFactorChallenge.create({
      data: {
        tokenHash: hashSessionToken(challengeToken),
        userId: user.id,
        adminMode,
        ipAddress: ipAddress ? ipAddress.slice(0, 100) : null,
        userAgent: userAgent ? userAgent.slice(0, 200) : null,
        expiresAt: challengeExpiresAt,
      },
    });
    await recordAudit({
      userId: user.id,
      actorName: user.name,
      action: 'LOGIN_2FA_CHALLENGE',
      details: `Issued 2FA challenge for ${user.username}`,
      ipAddress,
    });
    return {
      requiresTwoFactor: true,
      challengeToken,
      expiresAtMs: challengeExpiresAt.getTime(),
      user: {
        id: user.id,
        username: user.username,
        name: user.name,
        role: user.role,
        twoFactorEnabled: true,
      },
    };
  }

  // Update last login
  await prisma.user.update({
    where: { id: user.id },
    data: { lastLoginAt: new Date() },
  });

  const token = await createSession(user.id, { ipAddress, userAgent });

  await recordAudit({
    userId: user.id,
    actorName: user.name,
    action: adminMode ? 'ADMIN_LOGIN' : 'LOGIN',
    details: `${adminMode ? 'Administrator' : 'User'} signed in from ${ipAddress || 'local'}`,
    ipAddress,
  });

  const {
    passwordHash: _,
    sin: _sin,
    twoFactorSecret: _tfs,
    twoFactorRecoveryCodes: _tfr,
    twoFactorLastCounter: _tflc,
    ...safeUser
  } = user;
  const expiresAtMs = Date.now() + 24 * 60 * 60 * 1000;
  return {
    requiresTwoFactor: false,
    token,
    user: safeUser,
    expiresAt: new Date(expiresAtMs).toISOString(),
    expiresAtMs,
    redirectTo: user.role === 'ADMIN' && adminMode ? 'admin' : 'repairs',
  };
}

export async function logoutUser(token: string, actorName?: string) {
  await destroySession(token);
  if (actorName) {
    await recordAudit({
      actorName,
      action: 'LOGOUT',
      details: 'User logged out',
    });
  }
  return { success: true };
}

export async function listUsers(
  params: { search?: string; role?: string; status?: string },
  _includeSyncPayload = false
) {
  const where: Prisma.UserWhereInput = {};

  if (params.role && params.role !== 'ALL') {
    where.role = params.role;
  }

  if (params.status && params.status !== 'ALL') {
    where.status = params.status;
  }

  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { name: ciContains(q) },
      { username: ciContains(q) },
      { email: ciContains(q) },
    ];
  }

  return prisma.user.findMany({
    where,
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      status: true,
      phone: true,
      bench: true,
      bio: true,
      employeeNumber: true,
      hourlyRateCents: true,
      vacationPayPct: true,
      twoFactorEnabled: true,
      preferences: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function getUser(id: string) {
  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      status: true,
      phone: true,
      bench: true,
      bio: true,
      twoFactorEnabled: true,
      preferences: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) throw new HttpError(404, 'User account not found');
  return user;
}

export async function createUser(input: unknown, actor: { id: string; name: string }) {
  const data = userCreateSchema.parse(input);

  const existingUsername = await prisma.user.findUnique({
    where: { username: data.username.toLowerCase() },
  });
  if (existingUsername) {
    throw new HttpError(409, 'Username is already taken');
  }

  const existingEmail = await prisma.user.findUnique({
    where: { email: data.email.toLowerCase() },
  });
  if (existingEmail) {
    throw new HttpError(409, 'Email address is already registered');
  }

  const passwordHash = hashPassword(data.password);

  const user = await prisma.user.create({
    data: {
      username: data.username.toLowerCase(),
      email: data.email.toLowerCase(),
      name: data.name,
      passwordHash,
      role: data.role,
      status: 'ACTIVE',
      phone: data.phone ?? null,
      bench: data.bench ?? 'Bench #01',
      bio: data.bio ?? '',
      preferences: JSON.stringify({
        soundFX: true,
        compactView: false,
        autoPrint: false,
        emailAlerts: true,
      }),
    },
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      status: true,
      phone: true,
      bench: true,
      bio: true,
      createdAt: true,
    },
  });

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'USER_CREATE',
    details: `Created new ${user.role} user: ${user.username} (${user.name})`,
  });

  return user;
}

export async function updateUser(id: string, input: unknown, actor: { id: string; name: string }) {
  const existing = await prisma.user.findUnique({ where: { id } });
  if (!existing) throw new HttpError(404, 'User account not found');

  const data = userUpdateSchema.parse(input);

  // If changing role away from ADMIN or deactivating, ensure we don't deactivate or demote last admin
  if (
    (data.role && data.role !== 'ADMIN' && existing.role === 'ADMIN') ||
    (data.status && data.status === 'DISABLED' && existing.status === 'ACTIVE' && existing.role === 'ADMIN')
  ) {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE', NOT: { id } },
    });
    if (adminCount === 0) {
      throw new HttpError(400, 'Cannot demote or deactivate the last remaining active administrator');
    }
  }

  // If changing email, check uniqueness
  if (data.email && data.email.toLowerCase() !== existing.email) {
    const duplicate = await prisma.user.findUnique({
      where: { email: data.email.toLowerCase() },
    });
    if (duplicate) throw new HttpError(409, 'Email address is already in use by another user');
  }

  const updateData: Prisma.UserUpdateInput = {};
  if (data.name !== undefined) updateData.name = data.name;
  if (data.email !== undefined) updateData.email = data.email.toLowerCase();
  if (data.phone !== undefined) updateData.phone = data.phone;
  if (data.bench !== undefined) updateData.bench = data.bench;
  if (data.bio !== undefined) updateData.bio = data.bio;
  if (data.role !== undefined) updateData.role = data.role;
  if (data.status !== undefined) updateData.status = data.status;
  if (data.preferences !== undefined) updateData.preferences = data.preferences;

  const updated = await prisma.user.update({
    where: { id },
    data: updateData,
    select: {
      id: true,
      username: true,
      email: true,
      name: true,
      role: true,
      status: true,
      phone: true,
      bench: true,
      bio: true,
      twoFactorEnabled: true,
      preferences: true,
      updatedAt: true,
    },
  });

  // Immediately terminate active sessions & pending 2FA challenges upon account disable or role change
  if (data.status === 'DISABLED' || (data.role && data.role !== existing.role)) {
    await Promise.all([
      prisma.session.deleteMany({ where: { userId: id } }),
      prisma.twoFactorChallenge.deleteMany({ where: { userId: id } }),
    ]).catch(() => {});
  }

  const actions: string[] = [];
  if (data.role && data.role !== existing.role) actions.push(`role changed to ${data.role}`);
  if (data.status && data.status !== existing.status) actions.push(`status changed to ${data.status}`);
  if (actions.length === 0) actions.push('profile information updated');

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: data.role !== existing.role ? 'ROLE_CHANGE' : (data.status !== existing.status ? 'STATUS_CHANGE' : 'USER_UPDATE'),
    details: `Updated user ${existing.username}: ${actions.join(', ')}`,
  });

  return updated;
}

export async function deleteUser(id: string, actor: { id: string; name: string }) {
  if (id === actor.id) {
    throw new HttpError(400, 'Security Violation: You cannot delete your own logged-in administrator account');
  }

  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw new HttpError(404, 'User account not found');

  if (user.role === 'ADMIN') {
    const adminCount = await prisma.user.count({
      where: { role: 'ADMIN', status: 'ACTIVE', NOT: { id } },
    });
    if (adminCount === 0) {
      throw new HttpError(400, 'Security Violation: Cannot delete the last remaining administrator account');
    }
  }

  // Delete sessions first then delete user
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'USER_DELETE',
    details: `Deleted user account: ${user.username} (${user.name}, role: ${user.role})`,
  });

  return { success: true, message: `User ${user.username} successfully deleted` };
}

export async function changeUserPassword(
  userId: string,
  input: unknown,
  actorName: string,
  currentToken?: string
) {
  const { currentPassword, newPassword } = changePasswordSchema.parse(input);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User account not found');

  const isValid = verifyPassword(currentPassword, user.passwordHash);
  if (!isValid) {
    throw new HttpError(400, 'Current password is incorrect');
  }

  const passwordHash = hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Revoke all other active sessions so stale tokens on other devices cannot remain logged in
  await prisma.session.deleteMany({
    where: {
      userId,
      ...(currentToken ? { token: { notIn: [hashSessionToken(currentToken), currentToken] } } : {}),
    },
  });

  await recordAudit({
    userId,
    actorName,
    action: 'PASSWORD_RESET',
    details: `User ${user.username} changed their account password`,
  });

  return { success: true, message: 'Password successfully updated' };
}

export async function adminResetUserPassword(userId: string, input: unknown, actor: { id: string; name: string }) {
  const { newPassword } = resetPasswordSchema.parse(input);

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User account not found');

  const passwordHash = hashPassword(newPassword);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  // Invalidate any existing sessions for this user so they must log in with new password
  await prisma.session.deleteMany({ where: { userId } });

  await recordAudit({
    userId: actor.id,
    actorName: actor.name,
    action: 'PASSWORD_RESET',
    details: `Administrator ${actor.name} securely reset password for user ${user.username}`,
  });

  return { success: true, message: `Password for ${user.username} has been reset` };
}

export async function updateUserPreferences(userId: string, preferences: unknown) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new HttpError(404, 'User not found');

  const prefString = typeof preferences === 'string' ? preferences : JSON.stringify(preferences);

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { preferences: prefString },
    select: { id: true, preferences: true },
  });

  return updated;
}

// ---------------------------------------------------------------------------
// Audit & Activity Logs
// ---------------------------------------------------------------------------

export async function listAuditLogsPaginated(params: {
  page?: number;
  pageSize?: number;
  limit?: number;
  action?: string;
  search?: string;
}) {
  const page = Math.max(1, Math.floor(params.page || 1));
  const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || params.limit || 25)), 500);
  const skip = (page - 1) * pageSize;
  const where: Prisma.AuditLogWhereInput = {};

  if (params.action && params.action !== 'ALL') {
    where.action = params.action;
  }

  if (params.search?.trim()) {
    const q = params.search.trim();
    where.OR = [
      { actorName: ciContains(q) },
      { details: ciContains(q) },
      { action: ciContains(q) },
    ];
  }

  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take: pageSize,
    }),
  ]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return {
    items: logs,
    total,
    page,
    pageSize,
    totalPages,
    hasMore: page < totalPages,
  };
}

export async function listAuditLogs(params: { limit?: number; action?: string; search?: string }) {
  const res = await listAuditLogsPaginated({ ...params, page: 1, pageSize: params.limit || 100 });
  return res.items;
}

// ---------------------------------------------------------------------------
// Admin Dashboard Overview Statistics
// ---------------------------------------------------------------------------

export async function getAdminOverview() {
  const [
    totalUsers,
    activeUsers,
    disabledUsers,
    adminUsers,
    standardUsers,
    recentUsers,
    recentAudits,
    ticketsCount,
    activeTicketsCount,
    completedTicketsCount,
    customersCount,
    inventoryCount,
    lowStockParts,
    revenueAgg,
  ] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { status: 'ACTIVE' } }),
    prisma.user.count({ where: { status: 'DISABLED' } }),
    prisma.user.count({ where: { role: 'ADMIN' } }),
    prisma.user.count({ where: { role: 'USER' } }),
    prisma.user.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { id: true, username: true, name: true, email: true, role: true, status: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
    }),
    prisma.ticket.count({ where: { deletedAt: null } }),
    prisma.ticket.count({ where: { deletedAt: null, status: { in: OPEN_STATUSES } } }),
    prisma.ticket.count({ where: { deletedAt: null, status: 'COMPLETED' } }),
    prisma.customer.count(),
    prisma.inventoryPart.count(),
    prisma.inventoryPart.count({ where: { stock: { lte: 2 } } }),
    prisma.payment.aggregate({ _sum: { amountCents: true } }),
  ]);

  return {
    users: {
      total: totalUsers,
      active: activeUsers,
      disabled: disabledUsers,
      admins: adminUsers,
      technicians: standardUsers,
      recent: recentUsers,
    },
    system: {
      status: 'OPERATIONAL',
      database:
        process.env.DATABASE_URL?.startsWith('postgres://') ||
        process.env.DATABASE_URL?.startsWith('postgresql://')
          ? 'PostgreSQL (Supabase ACID)'
          : 'ACID Relational SQLite',
      serverTime: new Date().toISOString(),
      activeWorkstations: 4,
    },
    shop: {
      totalTickets: ticketsCount,
      activeTickets: activeTicketsCount,
      completedTickets: completedTicketsCount,
      totalCustomers: customersCount,
      totalInventoryItems: inventoryCount,
      lowStockAlerts: lowStockParts,
      lifetimeRevenueCents: revenueAgg._sum.amountCents || 0,
    },
    recentAudits,
  };
}

export { z };
