export interface Customer {
  id: string;
  fullName: string;
  phoneNumber: string;
  email?: string | null;
  address?: string | null;
  totalSpend?: number;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  customerId: string;
  type: string;
  make: string;
  model: string;
  serialNumber?: string | null;
  passcode?: string | null;
  color?: string | null;
}

export interface TicketStatusHistory {
  id: string;
  ticketId: string;
  fromStatus: string;
  toStatus: string;
  changedBy: string;
  note?: string | null;
  createdAt: string;
}

export interface Ticket {
  id: string;
  ticketNumber: string;
  customerId: string;
  deviceId: string;
  deviceMakeModel: string;
  serialNumber?: string | null;
  faultDescription: string;
  price: number; // in dollars
  priceInCents: number;
  technicianNote?: string | null;
  dueDate: string;
  status: 'PENDING' | 'IN_PROGRESS' | 'WAITING_ON_PARTS' | 'COMPLETED' | 'CANCELLED';
  priority: 'LOW' | 'STANDARD' | 'URGENT';
  customer: Customer;
  device?: Device;
  history?: TicketStatusHistory[];
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface DashboardStats {
  totalActive: number;
  inProgress: number;
  waitingOnParts: number;
  completed: number;
  pending: number;
  projectedPipeline: number;
  securedInvoiced: number;
  totalPipeline: number;
  customerCount: number;
}
