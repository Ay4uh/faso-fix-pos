import { prisma } from './prisma';

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS "Customer" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "fullName" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "phoneDigits" TEXT NOT NULL,
    "email" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "altPhone" TEXT
);
CREATE TABLE IF NOT EXISTS "Device" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "customerId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "serialNumber" TEXT,
    "passcode" TEXT,
    "pattern" TEXT,
    "condition" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Device_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketNumber" INTEGER NOT NULL,
    "customerId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'STANDARD',
    "faultDescription" TEXT NOT NULL,
    "laborCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxRateBps" INTEGER NOT NULL,
    "technician" TEXT,
    "bench" TEXT,
    "storageBin" TEXT,
    "diagnostics" TEXT NOT NULL DEFAULT '{}',
    "dueDate" DATETIME NOT NULL,
    "completedAt" DATETIME,
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "signature" TEXT,
    CONSTRAINT "Ticket_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "Device" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TicketItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "partId" TEXT,
    "description" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "unitCostCents" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketItem_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "TicketItem_partId_fkey" FOREIGN KEY ("partId") REFERENCES "InventoryPart" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "method" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Payment_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "TicketEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ticketId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "author" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TicketEvent_ticketId_fkey" FOREIGN KEY ("ticketId") REFERENCES "Ticket" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "InventoryPart" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sku" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "costCents" INTEGER NOT NULL DEFAULT 0,
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "stock" INTEGER NOT NULL DEFAULT 0,
    "reorderPoint" INTEGER NOT NULL DEFAULT 2,
    "supplier" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "username" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'USER',
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "phone" TEXT,
    "bio" TEXT,
    "bench" TEXT DEFAULT 'Bench #01',
    "preferences" TEXT NOT NULL DEFAULT '{}',
    "lastLoginAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "Session" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "token" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expiresAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "AuditLog" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT,
    "actorName" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "ipAddress" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Setting" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT DEFAULT 1,
    "shopName" TEXT NOT NULL DEFAULT 'Faso Fix',
    "address" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "taxLabel" TEXT NOT NULL DEFAULT 'HST',
    "taxRateBps" INTEGER NOT NULL DEFAULT 1300,
    "warrantyDays" INTEGER NOT NULL DEFAULT 90,
    "technicians" TEXT NOT NULL DEFAULT '',
    "benches" TEXT NOT NULL DEFAULT '',
    "receiptFooter" TEXT NOT NULL DEFAULT 'Please back up your data. Devices left unclaimed for 30 days may incur storage fees.',
    "nextTicketNumber" INTEGER NOT NULL DEFAULT 1,
    "defaultLaborRateCents" INTEGER NOT NULL DEFAULT 8500,
    "enableSoundBeeps" BOOLEAN NOT NULL DEFAULT true,
    "requireIntakeSignature" BOOLEAN NOT NULL DEFAULT true,
    "currencySymbol" TEXT NOT NULL DEFAULT '$',
    "dateFormat" TEXT NOT NULL DEFAULT 'YYYY-MM-DD',
    "updatedAt" DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_phoneDigits_key" ON "Customer"("phoneDigits");
CREATE INDEX IF NOT EXISTS "Customer_fullName_idx" ON "Customer"("fullName");
CREATE INDEX IF NOT EXISTS "Device_customerId_idx" ON "Device"("customerId");
CREATE INDEX IF NOT EXISTS "Device_serialNumber_idx" ON "Device"("serialNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status");
CREATE INDEX IF NOT EXISTS "Ticket_dueDate_idx" ON "Ticket"("dueDate");
CREATE INDEX IF NOT EXISTS "Ticket_customerId_idx" ON "Ticket"("customerId");
CREATE INDEX IF NOT EXISTS "TicketItem_ticketId_idx" ON "TicketItem"("ticketId");
CREATE INDEX IF NOT EXISTS "Payment_ticketId_idx" ON "Payment"("ticketId");
CREATE INDEX IF NOT EXISTS "Payment_createdAt_idx" ON "Payment"("createdAt");
CREATE INDEX IF NOT EXISTS "TicketEvent_ticketId_idx" ON "TicketEvent"("ticketId");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryPart_sku_key" ON "InventoryPart"("sku");
CREATE UNIQUE INDEX IF NOT EXISTS "User_username_key" ON "User"("username");
CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");
CREATE INDEX IF NOT EXISTS "User_status_idx" ON "User"("status");
CREATE UNIQUE INDEX IF NOT EXISTS "Session_token_key" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "Session_userId_idx" ON "Session"("userId");
CREATE INDEX IF NOT EXISTS "Session_token_idx" ON "Session"("token");
CREATE INDEX IF NOT EXISTS "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");
`;

export async function ensureDatabaseSchema() {
  const statements = SCHEMA_SQL.split(';')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  for (const sql of statements) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Ignored if table or index already exists
    }
  }
}
