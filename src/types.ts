export type TicketStatus = 'PENDING' | 'IN_PROGRESS' | 'WAITING_ON_PARTS' | 'COMPLETED';
export type TicketPriority = 'LOW' | 'STANDARD' | 'URGENT';
export type PaymentMethod = 'CASH' | 'CARD' | 'DEBIT' | 'E_TRANSFER' | 'OTHER';
export type EventKind = 'STATUS' | 'CUSTOMER_NOTE' | 'INTERNAL_NOTE' | 'PAYMENT' | 'ITEM' | 'MESSAGE' | 'SYSTEM';
export type PaymentStatus = 'UNPAID' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID';

export interface Totals {
  subtotalCents: number;
  laborCents: number;
  itemsCents: number;
  discountCents: number;
  taxRateBps: number;
  taxCents: number;
  totalCents: number;
  paidCents: number;
  balanceCents: number;
  paymentStatus: PaymentStatus;
}

export interface Customer {
  id: string;
  fullName: string;
  phone: string;
  phoneDigits: string;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
  ticketCount?: number;
  openTickets?: number;
  totalPaidCents?: number;
  lastVisit?: string | null;
  devices?: Device[];
  tickets?: Ticket[];
}

export interface Device {
  id: string;
  customerId: string;
  name: string;
  serialNumber?: string | null;
  passcode?: string | null;
  pattern?: string | null;
  condition?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketItem {
  id: string;
  ticketId: string;
  partId?: string | null;
  description: string;
  quantity: number;
  unitPriceCents: number;
  unitCostCents: number;
  createdAt: string;
}

export interface Payment {
  id: string;
  ticketId: string;
  amountCents: number;
  method: PaymentMethod;
  note?: string | null;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  kind: EventKind;
  message: string;
  author?: string | null;
  createdAt: string;
}

export interface TicketSummary {
  id: string;
  ticketNumber: number;
  status: TicketStatus;
  createdAt: string;
  device: { name: string };
}

export interface Ticket {
  id: string;
  ticketNumber: number;
  customerId: string;
  deviceId: string;
  faultDescription: string;
  laborCents: number;
  discountCents: number;
  taxRateBps: number;
  status: TicketStatus;
  priority: TicketPriority;
  technician?: string | null;
  bench?: string | null;
  storageBin?: string | null;
  signature?: string | null;
  diagnostics?: Record<string, 'PASS' | 'FAIL'>;
  dueDate: string;
  completedAt?: string | null;
  deletedAt?: string | null;
  createdAt: string;
  updatedAt: string;

  customer: Customer;
  device: Device;
  items: TicketItem[];
  payments: Payment[];
  events?: TicketEvent[];
  totals: Totals;
  otherTickets?: TicketSummary[];
}

export interface InventoryPart {
  id: string;
  sku: string;
  name: string;
  category: string;
  costCents: number;
  priceCents: number;
  stock: number;
  reorderPoint: number;
  supplier?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ShopSettings {
  id: number;
  shopName: string;
  address: string;
  phone: string;
  email: string;
  taxLabel: string;
  taxRateBps: number;
  warrantyDays: number;
  nextTicketNumber: number;
  technicians: string;
  benches: string;
  receiptFooter: string;
}

export interface DashboardData {
  open: number;
  pending: number;
  inProgress: number;
  waitingOnParts: number;
  completed: number;
  overdue: number;
  dueToday: number;
  openValueCents: number;
  awaitingPickupCount: number;
  awaitingPickupCents: number;
  collectedTodayCents: number;
  collectedMonthCents: number;
  customerCount: number;
  lowStock: number;
}

export type DashboardStats = DashboardData & {
  totalActive: number;
  projectedPipeline: number;
  securedInvoiced: number;
  totalPipeline: number;
};

export interface DailyReport {
  date: string;
  revenueCents: number;
  ticketsCreated: number;
}

export interface TopDevice {
  name: string;
  count: number;
}

export interface ReportData {
  days: number;
  since: string;
  revenueCents: number;
  ticketsCreated: number;
  ticketsCompleted: number;
  avgTurnaroundHours: number | null;
  onTimeRate: number | null;
  partsRevenueCents: number;
  partsCostCents: number;
  byMethod: Record<string, number>;
  topDevices: TopDevice[];
  daily: DailyReport[];
}
