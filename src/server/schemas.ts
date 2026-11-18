import { z } from 'zod';

export const STATUSES = [
  'CHECKED_IN',
  'DIAGNOSING',
  'WAITING_ON_APPROVAL',
  'WAITING_ON_PARTS',
  'READY_FOR_PICKUP',
  'COMPLETED',
  'PENDING',
  'IN_PROGRESS',
] as const;
export const PRIORITIES = ['LOW', 'STANDARD', 'URGENT'] as const;
export const PAYMENT_METHODS = ['CASH', 'CARD', 'DEBIT', 'E_TRANSFER', 'OTHER'] as const;
export const NOTE_KINDS = ['CUSTOMER_NOTE', 'INTERNAL_NOTE', 'MESSAGE'] as const;

const trimmed = z.string().trim();
const optionalText = trimmed.max(2000).optional().nullable();
const cents = z.number().int().min(0).max(100_000_000);
// Dates arrive as "YYYY-MM-DD" from <input type="date"> or as full ISO strings.
const dateString = trimmed.refine((v) => !Number.isNaN(Date.parse(v)), 'Must be a valid date');

export const createTicketSchema = z.object({
  customer: z.object({
    fullName: trimmed.min(1, 'Customer name is required').max(120),
    phone: trimmed
      .min(1, 'Phone number is required')
      .refine((v) => v.replace(/\D/g, '').length >= 7, 'Phone number needs at least 7 digits'),
    email: z.union([z.literal(''), trimmed.email('Invalid email address')]).optional().nullable(),
    address: optionalText,
  }),
  device: z.object({
    name: trimmed.min(1, 'Device make/model is required').max(120),
    serialNumber: optionalText,
    passcode: optionalText,
    pattern: optionalText,
    condition: optionalText,
  }),
  faultDescription: trimmed.max(2000).optional().default('Device Diagnostic & Repair'),
  laborCents: cents.default(0),
  dueDate: z.string().optional().default(() => {
    const d = new Date();
    d.setDate(d.getDate() + 2);
    return d.toISOString().split('T')[0];
  }),
  priority: z.enum(PRIORITIES).default('STANDARD'),
  technician: optionalText,
  bench: optionalText,
  storageBin: optionalText,
  signature: optionalText,
  depositCents: cents.optional(),
  depositMethod: z.enum(PAYMENT_METHODS).optional(),
});

export const updateTicketSchema = z
  .object({
    status: z.enum(STATUSES),
    priority: z.enum(PRIORITIES),
    faultDescription: trimmed.min(1).max(2000),
    laborCents: cents,
    discountCents: cents,
    dueDate: dateString,
    technician: optionalText,
    bench: optionalText,
    storageBin: optionalText,
    signature: optionalText,
    diagnostics: z.record(z.string(), z.enum(['PASS', 'FAIL'])),
    device: z
      .object({
        name: trimmed.min(1).max(120),
        serialNumber: optionalText,
        passcode: optionalText,
        pattern: optionalText,
        condition: optionalText,
      })
      .partial(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, 'Provide at least one field to update');

export const addItemSchema = z
  .object({
    partId: trimmed.optional(),
    description: trimmed.max(200).optional(),
    quantity: z.number().int().min(1).max(999).default(1),
    unitPriceCents: cents.optional(),
  })
  .refine((d) => d.partId || (d.description && d.unitPriceCents !== undefined), {
    message: 'Choose an inventory part, or enter a description and price',
  });

export const paymentSchema = z.object({
  amountCents: z.number().int().min(1, 'Amount must be greater than zero').max(100_000_000),
  method: z.enum(PAYMENT_METHODS),
  note: optionalText,
});

export const noteSchema = z.object({
  kind: z.enum(NOTE_KINDS),
  message: trimmed.min(1, 'Note cannot be empty').max(2000),
});

export const customerUpdateSchema = z
  .object({
    fullName: trimmed.min(1).max(120),
    phone: trimmed.refine((v) => v.replace(/\D/g, '').length >= 7, 'Phone number needs at least 7 digits'),
    email: z.union([z.literal(''), trimmed.email('Invalid email address')]).nullable(),
    address: optionalText,
    notes: optionalText,
  })
  .partial();

export const partSchema = z.object({
  sku: trimmed.min(1, 'SKU is required').max(60),
  name: trimmed.min(1, 'Part name is required').max(200),
  category: trimmed.max(60).default('GENERAL'),
  costCents: cents.default(0),
  priceCents: cents.default(0),
  stock: z.number().int().min(0).max(1_000_000).default(0),
  reorderPoint: z.number().int().min(0).max(1_000_000).default(2),
  supplier: optionalText,
});

export const stockAdjustSchema = z.object({
  delta: z.number().int().min(-1_000_000).max(1_000_000).refine((v) => v !== 0, 'Adjustment cannot be zero'),
});

export const settingsSchema = z
  .object({
    shopName: trimmed.min(1).max(120),
    address: trimmed.max(300),
    phone: trimmed.max(60),
    email: trimmed.max(120),
    taxLabel: trimmed.min(1).max(30),
    taxRateBps: z.number().int().min(0).max(5000),
    warrantyDays: z.number().int().min(0).max(3650),
    technicians: trimmed.max(2000),
    benches: trimmed.max(2000),
    receiptFooter: trimmed.max(1000),
    defaultLaborRateCents: z.number().int().min(0).max(1000000),
    enableSoundBeeps: z.boolean(),
    requireIntakeSignature: z.boolean(),
    currencySymbol: trimmed.min(1).max(10),
    dateFormat: trimmed.min(4).max(20),
  })
  .partial();

export const loginSchema = z.object({
  usernameOrEmail: trimmed.min(1, 'Username or email is required').max(120),
  password: z.string().min(1, 'Password is required'),
});

export const userCreateSchema = z.object({
  username: trimmed.min(3, 'Username must be at least 3 characters').max(40).regex(/^[a-zA-Z0-9_.-]+$/, 'Username can only contain letters, numbers, dots, hyphens, and underscores'),
  email: trimmed.email('Valid email is required'),
  name: trimmed.min(2, 'Name must be at least 2 characters').max(100),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'USER']).default('USER'),
  phone: optionalText,
  bench: optionalText,
  bio: optionalText,
});

export const userUpdateSchema = z.object({
  name: trimmed.min(2).max(100).optional(),
  email: trimmed.email().optional(),
  phone: optionalText,
  bench: optionalText,
  bio: optionalText,
  role: z.enum(['ADMIN', 'USER']).optional(),
  status: z.enum(['ACTIVE', 'DISABLED']).optional(),
  preferences: z.string().optional(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
  confirmPassword: z.string().min(8, 'Confirm password must be at least 8 characters'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'New passwords do not match',
  path: ['confirmPassword'],
});

export const resetPasswordSchema = z.object({
  newPassword: z.string().min(8, 'New password must be at least 8 characters'),
});

