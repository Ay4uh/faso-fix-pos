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
    "archivedAt" DATETIME,
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
    "isWarranty" BOOLEAN NOT NULL DEFAULT false,
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
    "receiptFooter" TEXT NOT NULL DEFAULT 'Thank you for your business!',
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
CREATE INDEX IF NOT EXISTS "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber");
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

CREATE TABLE IF NOT EXISTS "WageRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "overtimeRateCents" INTEGER NOT NULL,
    "effectiveDate" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WageRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clockIn" DATETIME NOT NULL,
    "clockOut" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "editedByAdminId" TEXT,
    "editedAt" DATETIME,
    "editReason" TEXT,
    "originalClockIn" DATETIME,
    "originalClockOut" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "ShiftBreak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "startTime" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" DATETIME,
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'UNPAID_MEAL',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftBreak_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE TABLE IF NOT EXISTS "PayrollPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodNumber" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'BI_WEEKLY',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "payDate" DATETIME NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGrossCents" INTEGER NOT NULL DEFAULT 0,
    "totalNetCents" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "finalizedAt" DATETIME,
    "finalizedById" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
CREATE TABLE IF NOT EXISTS "Paystub" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollPeriodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regularHours" REAL NOT NULL DEFAULT 0,
    "overtimeHours" REAL NOT NULL DEFAULT 0,
    "hourlyRateCents" INTEGER NOT NULL,
    "overtimeRateCents" INTEGER NOT NULL,
    "regularPayCents" INTEGER NOT NULL DEFAULT 0,
    "overtimePayCents" INTEGER NOT NULL DEFAULT 0,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "vacationPayCents" INTEGER NOT NULL DEFAULT 0,
    "grossPayCents" INTEGER NOT NULL DEFAULT 0,
    "cppCents" INTEGER NOT NULL DEFAULT 0,
    "eiCents" INTEGER NOT NULL DEFAULT 0,
    "incomeTaxCents" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "netPayCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paidAt" DATETIME,
    "paymentMethod" TEXT NOT NULL DEFAULT 'DIRECT_DEPOSIT',
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Paystub_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Paystub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "WageRate_userId_idx" ON "WageRate"("userId");
CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId");
CREATE INDEX IF NOT EXISTS "Shift_status_idx" ON "Shift"("status");
CREATE INDEX IF NOT EXISTS "Shift_clockIn_idx" ON "Shift"("clockIn");
CREATE INDEX IF NOT EXISTS "ShiftBreak_shiftId_idx" ON "ShiftBreak"("shiftId");
CREATE INDEX IF NOT EXISTS "PayrollPeriod_status_idx" ON "PayrollPeriod"("status");
CREATE INDEX IF NOT EXISTS "Paystub_payrollPeriodId_idx" ON "Paystub"("payrollPeriodId");
CREATE INDEX IF NOT EXISTS "Paystub_userId_idx" ON "Paystub"("userId");

CREATE TABLE IF NOT EXISTS "ScheduledShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "shiftDate" DATETIME NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startDateTime" DATETIME NOT NULL,
    "endDateTime" DATETIME NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 30,
    "breakType" TEXT NOT NULL DEFAULT 'UNPAID_MEAL',
    "scheduledHours" REAL NOT NULL DEFAULT 7.5,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "roleOrStation" TEXT,
    "branchLocation" TEXT DEFAULT 'Main Shop',
    "recurrenceRule" TEXT DEFAULT 'NONE',
    "isPublished" INTEGER NOT NULL DEFAULT 1,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "updatedById" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ScheduledShift_userId_idx" ON "ScheduledShift"("userId");
CREATE INDEX IF NOT EXISTS "ScheduledShift_shiftDate_idx" ON "ScheduledShift"("shiftDate");
CREATE INDEX IF NOT EXISTS "ScheduledShift_startDateTime_idx" ON "ScheduledShift"("startDateTime");
CREATE INDEX IF NOT EXISTS "ScheduledShift_status_idx" ON "ScheduledShift"("status");

CREATE TABLE IF NOT EXISTS "TimeOffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL DEFAULT 'VACATION',
    "startDate" DATETIME NOT NULL,
    "endDate" DATETIME NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "TimeOffRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TimeOffRequest_userId_idx" ON "TimeOffRequest"("userId");
CREATE INDEX IF NOT EXISTS "TimeOffRequest_status_idx" ON "TimeOffRequest"("status");
CREATE INDEX IF NOT EXISTS "TimeOffRequest_startDate_idx" ON "TimeOffRequest"("startDate");

CREATE TABLE IF NOT EXISTS "ShiftSwapRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "requesterShiftId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetShiftId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ShiftSwapRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwapRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "ShiftSwapRequest_requesterId_idx" ON "ShiftSwapRequest"("requesterId");
CREATE INDEX IF NOT EXISTS "ShiftSwapRequest_targetUserId_idx" ON "ShiftSwapRequest"("targetUserId");
CREATE INDEX IF NOT EXISTS "ShiftSwapRequest_status_idx" ON "ShiftSwapRequest"("status");

CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkTab" TEXT,
    "isRead" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead");
CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt");
`;

const POSTGRES_SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS "WageRate" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "hourlyRateCents" INTEGER NOT NULL,
    "overtimeRateCents" INTEGER NOT NULL,
    "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WageRate_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "Shift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "clockIn" TIMESTAMP(3) NOT NULL,
    "clockOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "totalMinutes" INTEGER NOT NULL DEFAULT 0,
    "regularMinutes" INTEGER NOT NULL DEFAULT 0,
    "overtimeMinutes" INTEGER NOT NULL DEFAULT 0,
    "breakMinutes" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "editedByAdminId" TEXT,
    "editedAt" TIMESTAMP(3),
    "editReason" TEXT,
    "originalClockIn" TIMESTAMP(3),
    "originalClockOut" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Shift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ShiftBreak" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shiftId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endTime" TIMESTAMP(3),
    "durationMinutes" INTEGER NOT NULL DEFAULT 0,
    "type" TEXT NOT NULL DEFAULT 'UNPAID_MEAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftBreak_shiftId_fkey" FOREIGN KEY ("shiftId") REFERENCES "Shift" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "PayrollPeriod" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "periodNumber" INTEGER NOT NULL,
    "periodType" TEXT NOT NULL DEFAULT 'BI_WEEKLY',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "payDate" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "totalGrossCents" INTEGER NOT NULL DEFAULT 0,
    "totalNetCents" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "finalizedAt" TIMESTAMP(3),
    "finalizedById" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS "Paystub" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "payrollPeriodId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "regularHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overtimeHours" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hourlyRateCents" INTEGER NOT NULL,
    "overtimeRateCents" INTEGER NOT NULL,
    "regularPayCents" INTEGER NOT NULL DEFAULT 0,
    "overtimePayCents" INTEGER NOT NULL DEFAULT 0,
    "bonusCents" INTEGER NOT NULL DEFAULT 0,
    "vacationPayCents" INTEGER NOT NULL DEFAULT 0,
    "grossPayCents" INTEGER NOT NULL DEFAULT 0,
    "cppCents" INTEGER NOT NULL DEFAULT 0,
    "eiCents" INTEGER NOT NULL DEFAULT 0,
    "incomeTaxCents" INTEGER NOT NULL DEFAULT 0,
    "otherDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "totalDeductionsCents" INTEGER NOT NULL DEFAULT 0,
    "netPayCents" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "paidAt" TIMESTAMP(3),
    "paymentMethod" TEXT NOT NULL DEFAULT 'DIRECT_DEPOSIT',
    "paymentReference" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Paystub_payrollPeriodId_fkey" FOREIGN KEY ("payrollPeriodId") REFERENCES "PayrollPeriod" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Paystub_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ScheduledShift" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "shiftDate" TIMESTAMP(3) NOT NULL,
    "startTime" TEXT NOT NULL,
    "endTime" TEXT NOT NULL,
    "startDateTime" TIMESTAMP(3) NOT NULL,
    "endDateTime" TIMESTAMP(3) NOT NULL,
    "breakMinutes" INTEGER NOT NULL DEFAULT 30,
    "breakType" TEXT NOT NULL DEFAULT 'UNPAID_MEAL',
    "scheduledHours" DOUBLE PRECISION NOT NULL DEFAULT 7.5,
    "status" TEXT NOT NULL DEFAULT 'SCHEDULED',
    "roleOrStation" TEXT,
    "branchLocation" TEXT DEFAULT 'Main Shop',
    "recurrenceRule" TEXT DEFAULT 'NONE',
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ScheduledShift_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "TimeOffRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "requestType" TEXT NOT NULL DEFAULT 'VACATION',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TimeOffRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS "ShiftSwapRequest" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "requesterShiftId" TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetShiftId" TEXT,
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedById" TEXT,
    "reviewedByName" TEXT,
    "reviewNotes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ShiftSwapRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ShiftSwapRequest_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "WageRate_userId_idx" ON "WageRate"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Shift_userId_idx" ON "Shift"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Shift_status_idx" ON "Shift"("status")`,
  `CREATE INDEX IF NOT EXISTS "Shift_clockIn_idx" ON "Shift"("clockIn")`,
  `CREATE INDEX IF NOT EXISTS "ShiftBreak_shiftId_idx" ON "ShiftBreak"("shiftId")`,
  `CREATE INDEX IF NOT EXISTS "PayrollPeriod_status_idx" ON "PayrollPeriod"("status")`,
  `CREATE INDEX IF NOT EXISTS "PayrollPeriod_startDate_idx" ON "PayrollPeriod"("startDate")`,
  `CREATE INDEX IF NOT EXISTS "Paystub_payrollPeriodId_idx" ON "Paystub"("payrollPeriodId")`,
  `CREATE INDEX IF NOT EXISTS "Paystub_userId_idx" ON "Paystub"("userId")`,
  `CREATE INDEX IF NOT EXISTS "Paystub_status_idx" ON "Paystub"("status")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledShift_userId_idx" ON "ScheduledShift"("userId")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledShift_shiftDate_idx" ON "ScheduledShift"("shiftDate")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledShift_startDateTime_idx" ON "ScheduledShift"("startDateTime")`,
  `CREATE INDEX IF NOT EXISTS "ScheduledShift_status_idx" ON "ScheduledShift"("status")`,
  `CREATE INDEX IF NOT EXISTS "TimeOffRequest_userId_idx" ON "TimeOffRequest"("userId")`,
  `CREATE INDEX IF NOT EXISTS "TimeOffRequest_status_idx" ON "TimeOffRequest"("status")`,
  `CREATE INDEX IF NOT EXISTS "TimeOffRequest_startDate_idx" ON "TimeOffRequest"("startDate")`,
  `CREATE INDEX IF NOT EXISTS "ShiftSwapRequest_requesterId_idx" ON "ShiftSwapRequest"("requesterId")`,
  `CREATE INDEX IF NOT EXISTS "ShiftSwapRequest_targetUserId_idx" ON "ShiftSwapRequest"("targetUserId")`,
  `CREATE INDEX IF NOT EXISTS "ShiftSwapRequest_status_idx" ON "ShiftSwapRequest"("status")`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "employeeNumber" TEXT`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "hourlyRateCents" INTEGER NOT NULL DEFAULT 2200`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "overtimeRateCents" INTEGER`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "vacationPayPct" INTEGER NOT NULL DEFAULT 400`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "td1FederalClaimCents" INTEGER NOT NULL DEFAULT 1612900`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "td1OntarioClaimCents" INTEGER NOT NULL DEFAULT 1274600`,
  `ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "sin" TEXT`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "ontarioMinWageCents" INTEGER NOT NULL DEFAULT 1720`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "overtimeThresholdWeeklyHours" DOUBLE PRECISION NOT NULL DEFAULT 44.0`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "overtimeMultiplierPct" INTEGER NOT NULL DEFAULT 150`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "minRestBetweenShiftsHours" DOUBLE PRECISION NOT NULL DEFAULT 11.0`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "maxWeeklyHoursBeforePermit" DOUBLE PRECISION NOT NULL DEFAULT 48.0`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "mandatoryMealBreakMinutes" INTEGER NOT NULL DEFAULT 30`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "vacationPayPctUnder5Years" INTEGER NOT NULL DEFAULT 400`,
  `ALTER TABLE "Setting" ADD COLUMN IF NOT EXISTS "vacationPayPctOver5Years" INTEGER NOT NULL DEFAULT 600`,
  `ALTER TABLE "ScheduledShift" ADD COLUMN IF NOT EXISTS "branchLocation" TEXT DEFAULT 'Main Shop'`,
  `ALTER TABLE "ScheduledShift" ADD COLUMN IF NOT EXISTS "recurrenceRule" TEXT DEFAULT 'NONE'`,
  `ALTER TABLE "ScheduledShift" ADD COLUMN IF NOT EXISTS "isPublished" BOOLEAN NOT NULL DEFAULT true`,
  `ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3)`,
  `ALTER TABLE "Ticket" ADD COLUMN IF NOT EXISTS "isWarranty" BOOLEAN NOT NULL DEFAULT false`,
  `CREATE INDEX IF NOT EXISTS "Ticket_isWarranty_idx" ON "Ticket"("isWarranty")`,
  `CREATE TABLE IF NOT EXISTS "Notification" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "linkTab" TEXT,
    "isRead" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Notification_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS "Notification_userId_isRead_idx" ON "Notification"("userId", "isRead")`,
  `CREATE INDEX IF NOT EXISTS "Notification_createdAt_idx" ON "Notification"("createdAt")`,
  `CREATE INDEX IF NOT EXISTS "Ticket_deletedAt_ticketNumber_idx" ON "Ticket"("deletedAt", "ticketNumber" DESC)`,
  `CREATE INDEX IF NOT EXISTS "Ticket_deletedAt_status_idx" ON "Ticket"("deletedAt", "status")`,
  `CREATE INDEX IF NOT EXISTS "Customer_archivedAt_updatedAt_idx" ON "Customer"("archivedAt", "updatedAt" DESC)`,
  `CREATE INDEX IF NOT EXISTS "Payment_ticketId_createdAt_idx" ON "Payment"("ticketId", "createdAt")`,
];

async function ensurePostgresSchema() {
  for (const sql of POSTGRES_SCHEMA_STATEMENTS) {
    try {
      await prisma.$executeRawUnsafe(sql);
    } catch {
      // Ignore already-existing tables/columns/constraints
    }
  }
}

export async function ensureDatabaseSchema() {
  const isPostgres = !!(
    process.env.DATABASE_URL &&
    (process.env.DATABASE_URL.startsWith('postgres://') || process.env.DATABASE_URL.startsWith('postgresql://'))
  );
  if (isPostgres) {
    await ensurePostgresSchema();
    return;
  }

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

  // Safe migrations for User, Setting, and ScheduledShift columns on existing SQLite DBs
  const sqliteMigrations = [
    'ALTER TABLE "User" ADD COLUMN "employeeNumber" TEXT;',
    'ALTER TABLE "User" ADD COLUMN "hourlyRateCents" INTEGER NOT NULL DEFAULT 2200;',
    'ALTER TABLE "User" ADD COLUMN "overtimeRateCents" INTEGER;',
    'ALTER TABLE "User" ADD COLUMN "vacationPayPct" INTEGER NOT NULL DEFAULT 400;',
    'ALTER TABLE "User" ADD COLUMN "td1FederalClaimCents" INTEGER NOT NULL DEFAULT 1612900;',
    'ALTER TABLE "User" ADD COLUMN "td1OntarioClaimCents" INTEGER NOT NULL DEFAULT 1274600;',
    'ALTER TABLE "User" ADD COLUMN "sin" TEXT;',
    'ALTER TABLE "Setting" ADD COLUMN "ontarioMinWageCents" INTEGER NOT NULL DEFAULT 1720;',
    'ALTER TABLE "Setting" ADD COLUMN "overtimeThresholdWeeklyHours" REAL NOT NULL DEFAULT 44.0;',
    'ALTER TABLE "Setting" ADD COLUMN "overtimeMultiplierPct" INTEGER NOT NULL DEFAULT 150;',
    'ALTER TABLE "Setting" ADD COLUMN "minRestBetweenShiftsHours" REAL NOT NULL DEFAULT 11.0;',
    'ALTER TABLE "Setting" ADD COLUMN "maxWeeklyHoursBeforePermit" REAL NOT NULL DEFAULT 48.0;',
    'ALTER TABLE "Setting" ADD COLUMN "mandatoryMealBreakMinutes" INTEGER NOT NULL DEFAULT 30;',
    'ALTER TABLE "Setting" ADD COLUMN "vacationPayPctUnder5Years" INTEGER NOT NULL DEFAULT 400;',
    'ALTER TABLE "Setting" ADD COLUMN "vacationPayPctOver5Years" INTEGER NOT NULL DEFAULT 600;',
    'ALTER TABLE "ScheduledShift" ADD COLUMN "branchLocation" TEXT DEFAULT \'Main Shop\';',
    'ALTER TABLE "ScheduledShift" ADD COLUMN "recurrenceRule" TEXT DEFAULT \'NONE\';',
    'ALTER TABLE "ScheduledShift" ADD COLUMN "isPublished" INTEGER NOT NULL DEFAULT 1;',
    'ALTER TABLE "Customer" ADD COLUMN "archivedAt" DATETIME;',
    'ALTER TABLE "Ticket" ADD COLUMN "isWarranty" INTEGER NOT NULL DEFAULT 0;',
  ];
  for (const alter of sqliteMigrations) {
    try {
      await prisma.$executeRawUnsafe(alter);
    } catch {}
  }

  // Ensure default receipt footer doesn't contain unwanted disclaimers
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE "Setting" SET "receiptFooter" = 'Thank you for your business!' WHERE "receiptFooter" LIKE '%storage%' OR "receiptFooter" LIKE '%90-day%'`
    );
  } catch {}

  // Drop unique constraint on ticketNumber to prevent fatal crashes during multi-container/offline sync
  try {
    await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Ticket_ticketNumber_key"`);
    await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber")`);
  } catch {}
}

export async function ensureInitialInventory() {
  try {
    const count = await prisma.inventoryPart.count();
    if (count === 0) {
      const defaultParts = [
        {
          id: 'part_ip15p_oled',
          sku: 'SCR-IP15P-OEM',
          name: 'iPhone 15 Pro OLED Display & Touch Digitizer',
          category: 'SCREENS',
          costCents: 12000,
          priceCents: 21900,
          stock: 8,
          reorderPoint: 2,
          supplier: 'MobileSentrix Canada',
        },
        {
          id: 'part_ip14_oled',
          sku: 'SCR-IP14-OEM',
          name: 'iPhone 14 OLED Screen Assembly',
          category: 'SCREENS',
          costCents: 8500,
          priceCents: 15900,
          stock: 12,
          reorderPoint: 3,
          supplier: 'MobileSentrix Canada',
        },
        {
          id: 'part_s24u_amoled',
          sku: 'SCR-S24U-DYNAMIC',
          name: 'Samsung Galaxy S24 Ultra Dynamic AMOLED',
          category: 'SCREENS',
          costCents: 17500,
          priceCents: 28900,
          stock: 5,
          reorderPoint: 2,
          supplier: 'Injured Gadgets',
        },
        {
          id: 'part_bat_ip15',
          sku: 'BAT-IP15-TI',
          name: 'iPhone 15 High-Capacity Zero-Cycle Battery',
          category: 'BATTERIES',
          costCents: 2800,
          priceCents: 6900,
          stock: 15,
          reorderPoint: 4,
          supplier: 'MobileSentrix Canada',
        },
        {
          id: 'part_bat_s23',
          sku: 'BAT-S23-OEM',
          name: 'Samsung Galaxy S23 Series Battery Pack',
          category: 'BATTERIES',
          costCents: 2400,
          priceCents: 6500,
          stock: 10,
          reorderPoint: 3,
          supplier: 'Injured Gadgets',
        },
        {
          id: 'part_port_usbc',
          sku: 'PORT-USBC-UNIV',
          name: 'Universal USB-C Port Daughterboard Sub-Assembly',
          category: 'COMPONENTS',
          costCents: 1400,
          priceCents: 4500,
          stock: 20,
          reorderPoint: 5,
          supplier: 'MobileSentrix Canada',
        },
        {
          id: 'part_seal_thermal',
          sku: 'MISC-THERMAL-KIT',
          name: 'Thermal Dissipation Pad & IP68 Waterproof Gasket Kit',
          category: 'GENERAL',
          costCents: 450,
          priceCents: 1900,
          stock: 35,
          reorderPoint: 10,
          supplier: 'Faso Supply Co',
        },
      ];

      for (const part of defaultParts) {
        await prisma.inventoryPart.upsert({
          where: { sku: part.sku },
          update: {},
          create: part,
        }).catch(() => {});
      }
    }
  } catch (err) {
    console.error('[Inventory Provisioning Error]', err);
  }
}
