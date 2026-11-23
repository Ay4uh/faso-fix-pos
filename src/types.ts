export type TicketStatus =
  | 'CHECKED_IN'
  | 'DIAGNOSING'
  | 'WAITING_ON_APPROVAL'
  | 'WAITING_ON_PARTS'
  | 'READY_FOR_PICKUP'
  | 'COMPLETED'
  | 'DECLINED'
  | 'CANCELLED'
  | 'PENDING'
  | 'IN_PROGRESS';
export type TicketPriority = 'LOW' | 'STANDARD' | 'URGENT';
export type PaymentMethod = 'CASH' | 'CARD' | 'CREDIT' | 'DEBIT' | 'E_TRANSFER' | 'OTHER';
export type EventKind = 'STATUS' | 'CUSTOMER_NOTE' | 'INTERNAL_NOTE' | 'PAYMENT' | 'ITEM' | 'MESSAGE' | 'SYSTEM' | 'PHOTO';
export type PaymentStatus = 'UNPAID' | 'PARTIAL' | 'PARTIALLY_PAID' | 'PAID' | 'OVERPAID';

export interface Totals {
  subtotalCents: number;
  laborCents: number;
  itemsCents: number;
  discountCents: number;
  taxableCents?: number;
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
  altPhone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  archivedAt?: string | null;
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
  isWarranty?: boolean;
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
  defaultLaborRateCents: number;
  enableSoundBeeps: boolean;
  requireIntakeSignature: boolean;
  currencySymbol: string;
  dateFormat: string;
  updatedAt?: string;
}

export type UserRole = 'ADMIN' | 'USER';
export type UserStatus = 'ACTIVE' | 'DISABLED';

export interface UserPreferences {
  soundFX: boolean;
  compactView: boolean;
  autoPrint: boolean;
  emailAlerts: boolean;
  highPriorityAudio: boolean;
  lowStockAlerts: boolean;
}

export interface User {
  id: string;
  username: string;
  email: string;
  name: string;
  role: UserRole;
  status: UserStatus;
  phone?: string | null;
  bio?: string | null;
  bench?: string | null;
  preferences: string; // JSON string
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt?: string;
}

export interface AuditLog {
  id: string;
  userId?: string | null;
  actorName: string;
  action: string;
  details: string;
  ipAddress?: string | null;
  createdAt: string;
}

export interface AdminOverview {
  users: {
    total: number;
    active: number;
    disabled: number;
    admins: number;
    technicians: number;
    recent: {
      id: string;
      username: string;
      name: string;
      email: string;
      role: UserRole;
      status: UserStatus;
      createdAt: string;
      lastLoginAt: string | null;
    }[];
  };
  system: {
    status: string;
    database: string;
    serverTime: string;
    activeWorkstations: number;
  };
  shop: {
    totalTickets: number;
    activeTickets: number;
    completedTickets: number;
    totalCustomers: number;
    totalInventoryItems: number;
    lowStockAlerts: number;
    lifetimeRevenueCents: number;
  };
  recentAudits: AuditLog[];
}

export interface DashboardData {
  totalTickets?: number;
  open: number;
  checkedIn?: number;
  pending: number;
  diagnosing?: number;
  inProgress: number;
  waitingOnApproval?: number;
  waitingOnParts: number;
  readyForPickup?: number;
  completed: number;
  declined?: number;
  cancelled?: number;
  warrantyTickets?: number;
  paidTickets?: number;
  overdue: number;
  dueToday: number;
  openValueCents: number;
  totalValueCents?: number;
  avgTicketValueCents?: number;
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
  refundsCents?: number;
  netTaxCollectedCents?: number;
  ticketsCreated: number;
  warrantyTicketsCount?: number;
  paidTicketsCount?: number;
  ticketsCompleted: number;
  avgTurnaroundHours: number | null;
  onTimeRate: number | null;
  partsRevenueCents: number;
  partsCostCents: number;
  byMethod: Record<string, number>;
  topDevices: TopDevice[];
  daily: DailyReport[];
}
