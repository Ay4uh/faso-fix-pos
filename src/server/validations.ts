import { z } from 'zod';

export const ticketStatusSchema = z.enum([
  'PENDING',
  'IN_PROGRESS',
  'WAITING_ON_PARTS',
  'COMPLETED',
]);

export const createTicketSchema = z.object({
  customer: z.object({
    fullName: z.string().trim().min(2, 'Customer name is required'),
    phoneNumber: z.string().trim().min(7, 'Valid phone number is required'),
    email: z.string().email().optional().or(z.literal('')),
    address: z.string().trim().optional().or(z.literal('')),
  }),
  deviceMakeModel: z.string().trim().min(2, 'Device make/model is required'),
  serialNumber: z.string().trim().optional().or(z.literal('')),
  faultDescription: z.string().trim().min(3, 'Fault description is required'),
  price: z.number().nonnegative('Price must be greater than or equal to 0'),
  technicianNote: z.string().trim().optional(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)),
  status: ticketStatusSchema.default('PENDING').optional(),
  priority: z.enum(['LOW', 'STANDARD', 'URGENT']).default('STANDARD').optional(),
});

export const updateTicketSchema = z.object({
  status: ticketStatusSchema.optional(),
  price: z.number().nonnegative().optional(),
  technicianNote: z.string().trim().optional(),
  faultDescription: z.string().trim().optional(),
  deviceMakeModel: z.string().trim().optional(),
  serialNumber: z.string().trim().optional(),
  dueDate: z.string().datetime().or(z.string().regex(/^\d{4}-\d{2}-\d{2}/)).optional(),
  priority: z.enum(['LOW', 'STANDARD', 'URGENT']).optional(),
});
