import express from "express";
import cors from "cors";
import crypto$1 from "node:crypto";
import path from "node:path";
import fs from "node:fs";
import { ZodError, z } from "zod";
import { PrismaClient } from "@prisma/client";
import QRCode from "qrcode";
var explicitUrl = process.env.DATABASE_URL;
var isExplicitSqlite = !!(explicitUrl && explicitUrl.startsWith("file:"));
var activeDbUrl = isExplicitSqlite ? explicitUrl : explicitUrl || "postgresql://postgres.wlfrpafmlgadpupvublx:Fasofix%402026@aws-0-us-east-2.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true";
var isPostgres = !isExplicitSqlite;
if (isPostgres && !activeDbUrl.includes("connection_limit=")) {
	const sep = activeDbUrl.includes("?") ? "&" : "?";
	activeDbUrl = `${activeDbUrl}${sep}connection_limit=5&pool_timeout=15`;
}
process.env.DATABASE_URL = activeDbUrl;
if (process.env.VERCEL && isExplicitSqlite) {
	const tmpDb = "/tmp/dev.db";
	if (!fs.existsSync(tmpDb)) {
		const candidates = [
			path.resolve(process.cwd(), "prisma/seed.db"),
			path.resolve(process.cwd(), "seed.db"),
			path.join(process.cwd(), "prisma/dev.db")
		];
		for (const cand of candidates) if (fs.existsSync(cand)) try {
			fs.copyFileSync(cand, tmpDb);
			break;
		} catch (err) {
			console.error("[Prisma] Error copying seed DB to /tmp:", err);
		}
	}
	process.env.DATABASE_URL = `file:${tmpDb}`;
}
var prisma = new PrismaClient({
	datasources: { db: { url: process.env.DATABASE_URL } },
	transactionOptions: {
		maxWait: 15e3,
		timeout: 2e4
	}
});
// src/server/money.ts
function computeTotals(t) {
	const itemsCents = t.items.reduce((sum, i) => sum + i.quantity * i.unitPriceCents, 0);
	const subtotalCents = t.laborCents + itemsCents;
	const discountCents = Math.min(Math.max(t.discountCents, 0), subtotalCents);
	const taxableCents = subtotalCents - discountCents;
	const taxCents = Math.round(taxableCents * t.taxRateBps / 1e4);
	const totalCents = taxableCents + taxCents;
	const paidCents = t.payments.reduce((sum, p) => sum + p.amountCents, 0);
	const balanceCents = totalCents - paidCents;
	let paymentStatus = "UNPAID";
	if (paidCents > 0) paymentStatus = balanceCents <= 0 ? "PAID" : "PARTIAL";
	else paymentStatus = "UNPAID";
	return {
		laborCents: t.laborCents,
		itemsCents,
		subtotalCents,
		discountCents,
		taxableCents,
		taxRateBps: t.taxRateBps,
		taxCents,
		totalCents,
		paidCents,
		balanceCents,
		paymentStatus
	};
}
var digitsOnly = (s) => s.replace(/\D/g, "");
// src/server/csvSafe.ts
/**
* Escape a CSV field value safely and neutralize Excel/Google Sheets/LibreOffice formula injection (CWE-1236).
* Legitimate numeric strings (including negative decimals like "-12.50") are preserved untouched.
*/
function csvCell(value) {
	const s = String(value ?? "").replace(/\0/g, "");
	const strippedLeft = s.replace(/^ +/, "");
	const isStrictNumber = /^[+-]?\d+(\.\d+)?$/.test(s.trim());
	return `"${((/^[=+\-@\t\r]/.test(strippedLeft) || /^[=+\-@]/.test(s.trimStart())) && !isStrictNumber ? `'${s}` : s).replace(/"/g, "\"\"")}"`;
}
// src/server/schemas.ts
var STATUSES = [
	"CHECKED_IN",
	"DIAGNOSING",
	"WAITING_ON_APPROVAL",
	"WAITING_ON_PARTS",
	"READY_FOR_PICKUP",
	"COMPLETED",
	"DECLINED",
	"CANCELLED",
	"PENDING",
	"IN_PROGRESS"
];
var PRIORITIES = [
	"LOW",
	"STANDARD",
	"URGENT"
];
var PAYMENT_METHODS = [
	"CASH",
	"CARD",
	"CREDIT",
	"DEBIT",
	"E_TRANSFER",
	"OTHER"
];
var NOTE_KINDS = [
	"CUSTOMER_NOTE",
	"INTERNAL_NOTE",
	"MESSAGE"
];
var trimmed = z.string().trim();
var optionalText = trimmed.max(2e3).optional().nullable();
var signatureText = trimmed.max(5e5).optional().nullable();
var cents = z.number().int().min(0).max(1e8);
var dateString = trimmed.refine((v) => !Number.isNaN(Date.parse(v)), "Must be a valid date");
var createTicketSchema = z.object({
	customer: z.object({
		fullName: trimmed.min(1, "Customer name is required").max(120),
		phone: trimmed.min(1, "Phone number is required").refine((v) => v.replace(/\D/g, "").length >= 7, "Phone number needs at least 7 digits"),
		altPhone: optionalText,
		email: z.union([z.literal(""), trimmed.email("Invalid email address")]).optional().nullable(),
		address: optionalText
	}),
	device: z.object({
		name: trimmed.min(1, "Device make/model is required").max(120),
		serialNumber: optionalText,
		passcode: optionalText,
		pattern: optionalText,
		condition: optionalText
	}),
	faultDescription: trimmed.max(2e3).optional().default("Device Diagnostic & Repair"),
	laborCents: cents.default(0),
	discountCents: cents.default(0),
	dueDate: z.string().optional().default(() => {
		const d = /* @__PURE__ */ new Date();
		d.setDate(d.getDate() + 2);
		return d.toISOString().split("T")[0];
	}),
	priority: z.enum(PRIORITIES).default("STANDARD"),
	technician: optionalText,
	bench: optionalText,
	storageBin: optionalText,
	signature: signatureText,
	isWarranty: z.boolean().optional().default(false),
	depositCents: cents.optional(),
	depositMethod: z.enum(PAYMENT_METHODS).optional()
});
var updateTicketSchema = z.object({
	status: z.enum(STATUSES),
	priority: z.enum(PRIORITIES),
	faultDescription: trimmed.min(1).max(2e3),
	laborCents: cents,
	discountCents: cents,
	dueDate: dateString,
	technician: optionalText,
	bench: optionalText,
	storageBin: optionalText,
	signature: signatureText,
	isWarranty: z.boolean(),
	expectedUpdatedAt: trimmed.optional(),
	diagnostics: z.record(z.string(), z.enum([
		"PASS",
		"FAIL",
		"PENDING"
	])),
	device: z.object({
		name: trimmed.min(1).max(120),
		serialNumber: optionalText,
		passcode: optionalText,
		pattern: optionalText,
		condition: optionalText
	}).partial()
}).partial().refine((d) => Object.keys(d).length > 0, "Provide at least one field to update");
var addItemSchema = z.object({
	partId: trimmed.optional(),
	description: trimmed.max(200).optional(),
	quantity: z.number().int().min(1).max(999).default(1),
	unitPriceCents: cents.optional()
}).refine((d) => d.partId || d.description && d.unitPriceCents !== void 0, { message: "Choose an inventory part, or enter a description and price" });
var paymentSchema = z.object({
	amountCents: z.number().int().min(1, "Amount must be greater than zero").max(1e8),
	method: z.enum(PAYMENT_METHODS),
	note: optionalText,
	idempotencyKey: trimmed.max(120).optional()
});
var refundSchema = z.object({
	amountCents: z.number().int().min(1, "Refund amount must be greater than zero").max(1e8),
	method: z.enum(PAYMENT_METHODS).default("CARD"),
	reason: trimmed.min(1, "Refund reason is required").max(500),
	idempotencyKey: trimmed.max(120).optional()
});
var photoUploadSchema = z.object({
	filename: trimmed.min(1, "Filename is required").max(120),
	dataUrl: z.string().min(20, "Image payload is required").max(5e6, "Image exceeds 5MB limit"),
	caption: optionalText
});
var noteSchema = z.object({
	kind: z.enum(NOTE_KINDS),
	message: trimmed.min(1, "Note cannot be empty").max(2e3)
});
var customerUpdateSchema = z.object({
	fullName: trimmed.min(1).max(120),
	phone: trimmed.refine((v) => v.replace(/\D/g, "").length >= 7, "Phone number needs at least 7 digits"),
	altPhone: optionalText,
	email: z.union([z.literal(""), trimmed.email("Invalid email address")]).nullable(),
	address: optionalText,
	notes: optionalText
}).partial();
var partSchema = z.object({
	sku: trimmed.min(1, "SKU is required").max(60),
	name: trimmed.min(1, "Part name is required").max(200),
	category: trimmed.max(60).default("GENERAL"),
	costCents: cents.default(0),
	priceCents: cents.default(0),
	stock: z.number().int().min(0).max(1e6).default(0),
	reorderPoint: z.number().int().min(0).max(1e6).default(2),
	supplier: optionalText
});
var partUpdateSchema = z.object({
	sku: trimmed.min(1, "SKU is required").max(60),
	name: trimmed.min(1, "Part name is required").max(200),
	category: trimmed.max(60),
	costCents: cents,
	priceCents: cents,
	stock: z.number().int().min(0).max(1e6),
	reorderPoint: z.number().int().min(0).max(1e6),
	supplier: optionalText
}).partial().refine((d) => Object.keys(d).length > 0, "Provide at least one field to update");
z.object({ delta: z.number().int().min(-1e6).max(1e6).refine((v) => v !== 0, "Adjustment cannot be zero") });
var settingsSchema = z.object({
	shopName: trimmed.min(1).max(120),
	address: trimmed.max(300),
	phone: trimmed.max(60),
	email: trimmed.max(120),
	taxLabel: trimmed.min(1).max(30),
	taxRateBps: z.number().int().min(0).max(5e3),
	warrantyDays: z.number().int().min(0).max(3650),
	technicians: trimmed.max(2e3),
	benches: trimmed.max(2e3),
	receiptFooter: trimmed.max(1e3),
	defaultLaborRateCents: z.number().int().min(0).max(1e6),
	enableSoundBeeps: z.boolean(),
	requireIntakeSignature: z.boolean(),
	currencySymbol: trimmed.min(1).max(10),
	dateFormat: trimmed.min(4).max(20)
}).partial();
var strongPassword = z.string().min(8, "Password must be at least 8 characters").max(128, "Password cannot exceed 128 characters").refine((p) => /[A-Z]/.test(p) && /[a-z]/.test(p) && /\d/.test(p), "Password must include uppercase, lowercase, and a number");
var loginSchema = z.object({
	usernameOrEmail: trimmed.min(1, "Username or email is required").max(120),
	password: z.string().min(1, "Password is required"),
	adminMode: z.boolean().optional().default(false)
});
var userCreateSchema = z.object({
	username: trimmed.min(3, "Username must be at least 3 characters").max(40).regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, hyphens, and underscores"),
	email: trimmed.email("Valid email is required"),
	name: trimmed.min(2, "Name must be at least 2 characters").max(100),
	password: strongPassword,
	role: z.enum(["ADMIN", "USER"]).default("USER"),
	phone: optionalText,
	bench: optionalText,
	bio: optionalText
});
var userUpdateSchema = z.object({
	name: trimmed.min(2).max(100).optional(),
	email: trimmed.email().optional(),
	phone: optionalText,
	bench: optionalText,
	bio: optionalText,
	role: z.enum(["ADMIN", "USER"]).optional(),
	status: z.enum(["ACTIVE", "DISABLED"]).optional(),
	preferences: z.string().optional()
});
var changePasswordSchema = z.object({
	currentPassword: z.string().min(1, "Current password is required"),
	newPassword: strongPassword,
	confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters")
}).refine((data) => data.newPassword === data.confirmPassword, {
	message: "New passwords do not match",
	path: ["confirmPassword"]
});
var resetPasswordSchema = z.object({ newPassword: strongPassword });
// src/server/auth.ts
/**
* NIST SP 800-63B compliant password hashing using scrypt.
* Stores format: salt:hash
*/
function hashPassword(password) {
	const salt = crypto$1.randomBytes(16).toString("hex");
	return `${salt}:${crypto$1.scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, combined) {
	try {
		const parts = combined.split(":");
		if (parts.length !== 2) return false;
		const [salt, key] = parts;
		const keyBuffer = Buffer.from(key, "hex");
		const derivedKey = crypto$1.scryptSync(password, salt, 64);
		return crypto$1.timingSafeEqual(keyBuffer, derivedKey);
	} catch {
		return false;
	}
}
var DUMMY_PASSWORD_HASH = hashPassword(crypto$1.randomBytes(24).toString("hex"));
/** Run constant-shape scrypt verification when an account does not exist to prevent timing enumeration. */
function verifyDummyPassword(password) {
	verifyPassword(password, DUMMY_PASSWORD_HASH);
}
/** Hash bearer/cookie session tokens with SHA-256 before database persistence and revocation lookup. */
function hashSessionToken(rawToken) {
	return crypto$1.createHash("sha256").update(rawToken).digest("hex");
}
/**
* Generate a cryptographically secure 256-bit random session token.
*/
function generateToken() {
	return crypto$1.randomBytes(32).toString("hex");
}
/**
* Strict 24-hour maximum session lifetime enforced across ALL user roles
* (Administrator, Manager, Technician, Regular Employee).
* Refreshes or reopening the browser never bypass or extend this 24-hour window.
*/
var SESSION_MAX_AGE_MS = 864e5;
/** Derive a concise human-readable device/browser summary from a User-Agent header. */
function parseUserAgent(ua) {
	const s = (ua || "").trim();
	if (!s) return "Unknown Client";
	let browser = "Browser";
	if (/Edg\//i.test(s)) browser = "Edge";
	else if (/Chrome\//i.test(s) && !/Chromium/i.test(s)) browser = "Chrome";
	else if (/Firefox\//i.test(s)) browser = "Firefox";
	else if (/Safari\//i.test(s) && !/Chrome\//i.test(s)) browser = "Safari";
	else if (/node|undici|curl|Postman/i.test(s)) browser = "API Client";
	let os = "";
	if (/iPhone|iPad/i.test(s)) os = "iOS";
	else if (/Android/i.test(s)) os = "Android";
	else if (/Mac OS X|Macintosh/i.test(s)) os = "macOS";
	else if (/Windows/i.test(s)) os = "Windows";
	else if (/Linux/i.test(s)) os = "Linux";
	return os ? `${browser} on ${os}` : browser;
}
/**
* Create a persistent session for a user valid for a strict maximum of 24 hours.
* Returns the raw bearer/cookie token while storing only its SHA-256 hash in the database.
*/
async function createSession(userId, meta) {
	const expiresAt = new Date(Date.now() + SESSION_MAX_AGE_MS);
	const rawToken = generateToken();
	const tokenHash = hashSessionToken(rawToken);
	const now = /* @__PURE__ */ new Date();
	let persisted = false;
	let lastErr = null;
	for (let attempt = 0; attempt < 2; attempt++) try {
		await prisma.session.create({ data: {
			token: tokenHash,
			userId,
			ipAddress: meta?.ipAddress ? String(meta.ipAddress).slice(0, 100) : null,
			userAgent: meta?.userAgent ? String(meta.userAgent).slice(0, 200) : null,
			lastActiveAt: now,
			expiresAt
		} });
		persisted = true;
		break;
	} catch (err) {
		lastErr = err;
		if (attempt === 0) await new Promise((r) => setTimeout(r, 250));
	}
	if (!persisted) {
		console.error("[Create Session Error]", lastErr);
		throw new Error("Failed to persist session — please try signing in again.");
	}
	return rawToken;
}
var MAX_REVOKED_CACHE = 2e3;
var revokedTokens = /* @__PURE__ */ new Set();
function cacheRevokedHash(tokenHash) {
	revokedTokens.add(tokenHash);
	if (revokedTokens.size > MAX_REVOKED_CACHE) {
		const oldest = revokedTokens.values().next().value;
		if (oldest) revokedTokens.delete(oldest);
	}
}
async function destroySession(token) {
	const tokenHash = hashSessionToken(token);
	cacheRevokedHash(tokenHash);
	await prisma.session.deleteMany({ where: { token: { in: [tokenHash, token] } } }).catch(() => {});
}
/**
* Validate a session token and return the associated active user.
*/
async function authenticateSession(token, _clientHeaders) {
	if (!token) return null;
	const tokenHash = hashSessionToken(token);
	if (revokedTokens.has(tokenHash) || revokedTokens.has(token)) return null;
	const session = await prisma.session.findFirst({
		where: { token: { in: [tokenHash, token] } },
		include: { user: { select: {
			id: true,
			username: true,
			email: true,
			name: true,
			role: true,
			status: true,
			phone: true,
			bio: true,
			bench: true,
			preferences: true,
			twoFactorEnabled: true,
			lastLoginAt: true,
			createdAt: true
		} } }
	});
	if (session) {
		if (session.expiresAt.getTime() < Date.now()) {
			await prisma.session.deleteMany({ where: { id: session.id } }).catch(() => {});
			return null;
		}
		if (session.user.status !== "ACTIVE") return null;
		if (Date.now() - session.lastActiveAt.getTime() > 3e5) prisma.session.update({
			where: { id: session.id },
			data: { lastActiveAt: /* @__PURE__ */ new Date() }
		}).catch(() => {});
		return session.user;
	}
	return null;
}
function computeAuditHash(fields) {
	const payload = [
		fields.prevHash,
		fields.userId || "",
		fields.actorName,
		fields.action,
		fields.details,
		fields.ipAddress || "",
		fields.createdAt.toISOString()
	].join("|");
	return crypto$1.createHash("sha256").update(payload, "utf8").digest("hex");
}
/**
* Verify cryptographic integrity of hash-chained AuditLog entries.
*/
async function verifyAuditLogChain(limit = 200) {
	const rows = await prisma.auditLog.findMany({
		where: { entryHash: { not: null } },
		orderBy: [{ createdAt: "desc" }, { id: "desc" }],
		take: limit
	});
	const tamperedIds = [];
	for (const row of rows) if (computeAuditHash({
		prevHash: row.prevHash || "GENESIS",
		userId: row.userId,
		actorName: row.actorName,
		action: row.action,
		details: row.details,
		ipAddress: row.ipAddress,
		createdAt: row.createdAt
	}) !== row.entryHash) tamperedIds.push(row.id);
	return {
		checked: rows.length,
		intact: tamperedIds.length === 0,
		tamperedCount: tamperedIds.length,
		tamperedIds
	};
}
/**
* Record an immutable hash-chained audit log entry.
*/
async function recordAudit(params) {
	try {
		const prevHash = (await prisma.auditLog.findFirst({
			where: { entryHash: { not: null } },
			orderBy: [{ createdAt: "desc" }, { id: "desc" }],
			select: { entryHash: true }
		}))?.entryHash || "GENESIS";
		const createdAt = /* @__PURE__ */ new Date();
		const entryHash = computeAuditHash({
			prevHash,
			userId: params.userId || null,
			actorName: params.actorName,
			action: params.action,
			details: params.details,
			ipAddress: params.ipAddress || null,
			createdAt
		});
		return await prisma.auditLog.create({ data: {
			userId: params.userId || null,
			actorName: params.actorName,
			action: params.action,
			details: params.details,
			ipAddress: params.ipAddress || null,
			prevHash,
			entryHash,
			createdAt
		} });
	} catch (err) {
		console.error("[AuditLog Error]", err);
	}
}
/**
* Ensure an initial administrator account exists in the database.
*/
async function ensureAdminProvisioning() {
	if (await prisma.user.count({ where: { role: "ADMIN" } }) === 0) {
		const adminUser = process.env.ADMIN_USERNAME || "admin";
		const adminEmail = process.env.ADMIN_EMAIL || "admin@fasofix.ca";
		const adminPass = process.env.ADMIN_PASSWORD || "Admin@FasoFix2026!";
		const adminName = "Lead Shop Administrator";
		const hashedPassword = hashPassword(adminPass);
		await recordAudit({
			userId: (await prisma.user.create({ data: {
				id: "00000000-0000-0000-0000-000000000001",
				username: adminUser,
				email: adminEmail,
				name: adminName,
				passwordHash: hashedPassword,
				role: "ADMIN",
				status: "ACTIVE",
				bench: "Bench #01",
				bio: "Primary store administrator and certified lead master technician.",
				preferences: JSON.stringify({
					soundFX: true,
					compactView: false,
					autoPrint: false,
					emailAlerts: true,
					highPriorityAudio: true,
					lowStockAlerts: true
				})
			} })).id,
			actorName: "SYSTEM_BOOT",
			action: "ADMIN_PROVISIONED",
			details: `Initial administrator provisioned with username: ${adminUser} and email: ${adminEmail}`
		});
		console.log("------------------------------------------------------------");
		console.log("[Faso Fix Security] Initial Administrator Account Provisioned:");
		console.log(`  Username: ${adminUser}`);
		console.log(`  Email:    ${adminEmail}`);
		console.log("  Please log in and rotate the initial password immediately.");
		console.log("------------------------------------------------------------");
	}
}
// src/server/service.ts
/** Error with an HTTP status, surfaced to the client as JSON by the error handler. */
var HttpError = class extends Error {
	status;
	details;
	activeShift;
	constructor(status, message, extra) {
		super(message);
		this.status = status;
		if (extra?.details) this.details = extra.details;
		if (extra?.activeShift) this.activeShift = extra.activeShift;
	}
};
var STATUS_LABEL = {
	CHECKED_IN: "Checked In",
	PENDING: "Checked In",
	DIAGNOSING: "Diagnosing",
	IN_PROGRESS: "Diagnosing",
	WAITING_ON_APPROVAL: "Waiting on Approval",
	WAITING_ON_PARTS: "Waiting on Part",
	READY_FOR_PICKUP: "Ready for Pickup",
	COMPLETED: "Completed / Paid",
	DECLINED: "Declined",
	CANCELLED: "Cancelled"
};
var OPEN_STATUSES = [
	"CHECKED_IN",
	"PENDING",
	"DIAGNOSING",
	"IN_PROGRESS",
	"WAITING_ON_APPROVAL",
	"WAITING_ON_PARTS",
	"READY_FOR_PICKUP"
];
var money = (c) => `$${(c / 100).toFixed(2)}`;
var emptyToNull = (v) => v === void 0 ? void 0 : v?.trim() ? v.trim() : null;
var ciContains = (q) => isPostgres ? {
	contains: q,
	mode: "insensitive"
} : { contains: q };
/** "YYYY-MM-DD" is stored at local noon so it never shifts a day across time zones. */
function parseDate(v) {
	return /^\d{4}-\d{2}-\d{2}$/.test(v) ? /* @__PURE__ */ new Date(`${v}T12:00:00`) : new Date(v);
}
var ticketListSelect = {
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
	items: { orderBy: { createdAt: "asc" } },
	payments: { orderBy: { createdAt: "asc" } }
};
var ticketInclude = {
	customer: true,
	device: true,
	items: { orderBy: { createdAt: "asc" } },
	payments: { orderBy: { createdAt: "asc" } }
};
function withTotals(t) {
	let diagnostics = {};
	try {
		diagnostics = JSON.parse(t.diagnostics || "{}");
	} catch {
		diagnostics = {};
	}
	return {
		...t,
		signature: t.signature ?? null,
		diagnostics,
		totals: computeTotals(t)
	};
}
var settingsInFlight = null;
async function getSettings(tx = prisma) {
	if (tx !== prisma) {
		const existing = await tx.setting.findUnique({ where: { id: 1 } });
		if (existing) return existing;
		return tx.setting.upsert({
			where: { id: 1 },
			update: {},
			create: { id: 1 }
		});
	}
	if (settingsInFlight) return settingsInFlight;
	settingsInFlight = (async () => {
		try {
			const existing = await prisma.setting.findUnique({ where: { id: 1 } });
			if (existing) return existing;
			return await prisma.setting.upsert({
				where: { id: 1 },
				update: {},
				create: { id: 1 }
			});
		} finally {
			settingsInFlight = null;
		}
	})();
	return settingsInFlight;
}
async function updateSettings(input, actor) {
	const data = settingsSchema.parse(input);
	await getSettings();
	const updated = await prisma.setting.update({
		where: { id: 1 },
		data
	});
	if (actor?.name) {
		const changedKeys = Object.keys(data).join(", ");
		await recordAudit({
			userId: actor.id,
			actorName: actor.name,
			action: "SETTINGS_UPDATE",
			details: `Updated shop settings (${changedKeys || "no fields changed"})`
		});
	}
	return updated;
}
async function logEvent(tx, ticketId, kind, message, author) {
	await tx.ticketEvent.create({ data: {
		ticketId,
		kind,
		message,
		author: author ?? null
	} });
}
async function loadTicket(tx, id) {
	const t = await tx.ticket.findFirst({
		where: {
			id,
			deletedAt: null
		},
		include: ticketInclude
	});
	if (!t) throw new HttpError(404, "Work order not found");
	return t;
}
async function getTicket(id) {
	const cleanId = (id || "").trim();
	const numericMatch = cleanId.replace(/^(wo[\s\-_]*)?#?/i, "");
	const isNumeric = /^\d+$/.test(numericMatch);
	const t = await prisma.ticket.findFirst({
		where: {
			deletedAt: null,
			OR: [{ id: cleanId }, ...isNumeric ? [{ ticketNumber: Number(numericMatch) }] : []]
		},
		include: {
			...ticketInclude,
			events: { orderBy: { createdAt: "desc" } }
		}
	});
	if (!t) throw new HttpError(404, "Work order not found");
	const otherTickets = await prisma.ticket.findMany({
		where: {
			customerId: t.customerId,
			deletedAt: null,
			NOT: { id: t.id }
		},
		select: {
			id: true,
			ticketNumber: true,
			status: true,
			createdAt: true,
			device: { select: { name: true } }
		},
		orderBy: { createdAt: "desc" },
		take: 10
	});
	return {
		...withTotals(t),
		otherTickets
	};
}
async function listTicketsPaginated(params) {
	const view = params.view || "OPEN";
	const where = { deletedAt: null };
	if (view === "OPEN") where.status = { in: OPEN_STATUSES };
	else if (view === "CHECKED_IN" || view === "PENDING") where.status = { in: ["CHECKED_IN", "PENDING"] };
	else if (view === "DIAGNOSING" || view === "IN_PROGRESS") where.status = { in: ["DIAGNOSING", "IN_PROGRESS"] };
	else if (view === "WARRANTY") where.isWarranty = true;
	else if (view !== "ALL") where.status = view;
	if (params.warranty === true || params.warranty === "true") where.isWarranty = true;
	else if (params.warranty === false || params.warranty === "false") where.isWarranty = false;
	if (params.bench && params.bench !== "ALL") where.bench = params.bench;
	const q = (params.search || "").trim();
	if (q) {
		const numeric = q.replace(/^(wo[\s\-_]*)?#?/i, "");
		const digits = digitsOnly(q);
		const or = [
			{ customer: { fullName: ciContains(q) } },
			{ device: { name: ciContains(q) } },
			{ device: { serialNumber: ciContains(q) } },
			{ faultDescription: ciContains(q) }
		];
		if (/^\d+$/.test(numeric)) or.push({ ticketNumber: Number(numeric) });
		if (digits.length >= 3) or.push({ customer: { phoneDigits: { contains: digits } } });
		where.OR = or;
	}
	const page = Math.max(1, Math.floor(params.page || 1));
	const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || 25)), 500);
	const skip = (page - 1) * pageSize;
	const orderBy = params.sort === "dueDate" ? [{ dueDate: "asc" }, { ticketNumber: "desc" }] : view === "COMPLETED" ? [{ completedAt: "desc" }, { ticketNumber: "desc" }] : [{ ticketNumber: "desc" }];
	const [total, tickets] = await Promise.all([prisma.ticket.count({ where }), prisma.ticket.findMany({
		where,
		select: ticketListSelect,
		orderBy,
		skip,
		take: pageSize
	})]);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	return {
		items: tickets.map(withTotals),
		total,
		page,
		pageSize,
		totalPages,
		hasMore: page < totalPages
	};
}
var TX_OPTIONS = {
	maxWait: 15e3,
	timeout: 2e4
};
async function createTicket(input, actor) {
	const data = createTicketSchema.parse(input);
	const phoneDigits = digitsOnly(data.customer.phone);
	let createdNumber = 0;
	let customerName = data.customer.fullName;
	let deviceName = data.device.name;
	const id = await prisma.$transaction(async (tx) => {
		const settings = await getSettings(tx);
		const bumped = await tx.setting.update({
			where: { id: 1 },
			data: { nextTicketNumber: { increment: 1 } }
		});
		const maxTicket = await tx.ticket.findFirst({
			orderBy: { ticketNumber: "desc" },
			select: { ticketNumber: true }
		});
		let ticketNumber = bumped.nextTicketNumber - 1;
		const nextFromMax = (maxTicket?.ticketNumber ?? 0) + 1;
		if (nextFromMax > ticketNumber) {
			ticketNumber = nextFromMax;
			await tx.setting.update({
				where: { id: 1 },
				data: { nextTicketNumber: ticketNumber + 1 }
			});
		}
		let customer = await tx.customer.findUnique({ where: { phoneDigits } });
		if (!customer) customer = await tx.customer.create({ data: {
			fullName: data.customer.fullName,
			phone: data.customer.phone,
			phoneDigits,
			altPhone: emptyToNull(data.customer.altPhone) ?? null,
			email: emptyToNull(data.customer.email) ?? null,
			address: emptyToNull(data.customer.address) ?? null
		} });
		else {
			const fill = {};
			if (!customer.altPhone && data.customer.altPhone) fill.altPhone = data.customer.altPhone;
			if (!customer.email && data.customer.email) fill.email = data.customer.email;
			if (!customer.address && data.customer.address) fill.address = data.customer.address;
			if (Object.keys(fill).length) customer = await tx.customer.update({
				where: { id: customer.id },
				data: fill
			});
		}
		const serial = emptyToNull(data.device.serialNumber) ?? null;
		let device = serial ? await tx.device.findFirst({ where: {
			customerId: customer.id,
			serialNumber: serial
		} }) : null;
		const deviceData = {
			name: data.device.name,
			passcode: emptyToNull(data.device.passcode) ?? null,
			pattern: emptyToNull(data.device.pattern) ?? null,
			condition: emptyToNull(data.device.condition) ?? null
		};
		device = device ? await tx.device.update({
			where: { id: device.id },
			data: deviceData
		}) : await tx.device.create({ data: {
			...deviceData,
			customerId: customer.id,
			serialNumber: serial
		} });
		const ticket = await tx.ticket.create({ data: {
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
			dueDate: parseDate(data.dueDate)
		} });
		createdNumber = ticketNumber;
		customerName = customer.fullName;
		deviceName = device.name;
		await logEvent(tx, ticket.id, "STATUS", `Work order #${ticketNumber}${data.isWarranty ? " (WARRANTY)" : ""} created for ${device.name}`, actor?.name || data.technician);
		if (data.depositCents && data.depositCents > 0) {
			const totals = computeTotals({
				...ticket,
				items: [],
				payments: []
			});
			if (data.depositCents > totals.totalCents) throw new HttpError(400, `Deposit (${money(data.depositCents)}) cannot exceed the quoted total (${money(totals.totalCents)})`);
			await tx.payment.create({ data: {
				ticketId: ticket.id,
				amountCents: data.depositCents,
				method: data.depositMethod || "CASH",
				note: "Deposit at intake"
			} });
			await logEvent(tx, ticket.id, "PAYMENT", `Deposit of ${money(data.depositCents)} received (${data.depositMethod || "CASH"})`, actor?.name);
		}
		return ticket.id;
	}, TX_OPTIONS);
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "POS User",
		action: "TICKET_CREATE",
		details: `Created work order #${createdNumber} for ${customerName} (${deviceName})${data.isWarranty ? " [Warranty]" : ""}`
	});
	return getTicket(id);
}
async function updateTicket(id, input, author, actorId) {
	const data = updateTicketSchema.parse(input);
	let auditSummary = "";
	let auditTicketNum = 0;
	await prisma.$transaction(async (tx) => {
		const t = await loadTicket(tx, id);
		auditTicketNum = t.ticketNumber;
		if (data.expectedUpdatedAt) {
			const expectedMs = Date.parse(data.expectedUpdatedAt);
			if (!Number.isNaN(expectedMs) && t.updatedAt.getTime() !== expectedMs) throw new HttpError(409, "Conflict: This work order was modified by another employee. Refresh before saving to avoid overwriting their changes.");
		}
		const update = {};
		const changes = [];
		if (data.status && data.status !== t.status) {
			const wasClosedOut = t.status === "CANCELLED" || t.status === "DECLINED";
			const willCloseOut = data.status === "CANCELLED" || data.status === "DECLINED";
			if (!wasClosedOut && willCloseOut) {
				let returnedCount = 0;
				for (const item of t.items) if (item.partId) {
					await tx.inventoryPart.update({
						where: { id: item.partId },
						data: { stock: { increment: item.quantity } }
					});
					returnedCount += item.quantity;
				}
				if (returnedCount > 0) changes.push(`returned ${returnedCount} part(s) to stock`);
			} else if (wasClosedOut && !willCloseOut) {
				for (const item of t.items) if (item.partId) {
					const part = await tx.inventoryPart.findUnique({ where: { id: item.partId } });
					if (part) {
						if (part.stock < item.quantity) throw new HttpError(409, `Cannot reopen work order: insufficient stock for ${part.name} (${part.stock} available, ${item.quantity} needed)`);
						await tx.inventoryPart.update({
							where: { id: item.partId },
							data: { stock: { decrement: item.quantity } }
						});
					}
				}
			}
			update.status = data.status;
			update.completedAt = data.status === "COMPLETED" ? /* @__PURE__ */ new Date() : null;
			await logEvent(tx, id, "STATUS", `Status changed: ${STATUS_LABEL[t.status] || t.status} → ${STATUS_LABEL[data.status] || data.status}`, author);
			changes.push(`status ${t.status} → ${data.status}`);
		}
		if (data.priority && data.priority !== t.priority) {
			update.priority = data.priority;
			changes.push(`priority → ${data.priority.toLowerCase()}`);
		}
		if (data.isWarranty !== void 0 && data.isWarranty !== t.isWarranty) {
			update.isWarranty = data.isWarranty;
			changes.push(data.isWarranty ? "marked warranty repair" : "cleared warranty repair");
		}
		if (data.faultDescription !== void 0 && data.faultDescription !== t.faultDescription) {
			update.faultDescription = data.faultDescription;
			changes.push("fault description updated");
		}
		if (data.laborCents !== void 0 && data.laborCents !== t.laborCents) {
			update.laborCents = data.laborCents;
			changes.push(`labor ${money(t.laborCents)} → ${money(data.laborCents)}`);
		}
		if (data.discountCents !== void 0 && data.discountCents !== t.discountCents) {
			update.discountCents = data.discountCents;
			changes.push(`discount ${money(t.discountCents)} → ${money(data.discountCents)}`);
		}
		if (data.dueDate !== void 0) {
			const due = parseDate(data.dueDate);
			if (due.getTime() !== t.dueDate.getTime()) {
				update.dueDate = due;
				changes.push(`due date → ${due.toLocaleDateString()}`);
			}
		}
		for (const key of [
			"technician",
			"bench",
			"storageBin",
			"signature"
		]) if (data[key] !== void 0) {
			const v = emptyToNull(data[key]) ?? null;
			if (v !== t[key]) {
				update[key] = v;
				if (key === "signature") changes.push("customer signature captured");
				else changes.push(`${key === "storageBin" ? "storage bin" : key} → ${v ?? "none"}`);
			}
		}
		if (data.diagnostics) {
			const cleanDiag = {};
			for (const [k, v] of Object.entries(data.diagnostics)) if (v === "PASS" || v === "FAIL") cleanDiag[k] = v;
			update.diagnostics = JSON.stringify(cleanDiag);
		}
		if (data.device) {
			const d = data.device;
			const deviceUpdate = {};
			if (d.name !== void 0) deviceUpdate.name = d.name;
			for (const key of [
				"serialNumber",
				"passcode",
				"pattern",
				"condition"
			]) if (d[key] !== void 0) deviceUpdate[key] = emptyToNull(d[key]) ?? null;
			if (Object.keys(deviceUpdate).length) {
				await tx.device.update({
					where: { id: t.deviceId },
					data: deviceUpdate
				});
				changes.push("device details updated");
			}
		}
		if (Object.keys(update).length) await tx.ticket.update({
			where: { id },
			data: update
		});
		if (changes.length) {
			auditSummary = changes.join(", ");
			await logEvent(tx, id, "SYSTEM", `Updated: ${auditSummary}`, author);
		}
	}, TX_OPTIONS);
	if (auditSummary) await recordAudit({
		userId: actorId ?? void 0,
		actorName: author || "POS User",
		action: "TICKET_UPDATE",
		details: `WO #${auditTicketNum}: ${auditSummary}`
	});
	return getTicket(id);
}
async function deleteTicket(id, author) {
	await prisma.$transaction(async (tx) => {
		const t = await loadTicket(tx, id);
		for (const item of t.items) if (item.partId) await tx.inventoryPart.update({
			where: { id: item.partId },
			data: { stock: { increment: item.quantity } }
		});
		await tx.ticket.update({
			where: { id },
			data: { deletedAt: /* @__PURE__ */ new Date() }
		});
		await logEvent(tx, id, "SYSTEM", "Work order deleted by administrator", author);
	}, TX_OPTIONS);
	return { ok: true };
}
async function addItem(ticketId, input, author) {
	const data = addItemSchema.parse(input);
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		let description = data.description || "";
		let unitPriceCents = data.unitPriceCents ?? 0;
		let unitCostCents = 0;
		if (data.partId) {
			const part = await tx.inventoryPart.findUnique({ where: { id: data.partId } });
			if (!part) throw new HttpError(404, "Inventory part not found");
			if (part.stock < data.quantity) throw new HttpError(409, `Not enough stock for ${part.name}: ${part.stock} available, ${data.quantity} requested`);
			await tx.inventoryPart.update({
				where: { id: part.id },
				data: { stock: { decrement: data.quantity } }
			});
			description = description || part.name;
			unitPriceCents = data.unitPriceCents ?? part.priceCents;
			unitCostCents = part.costCents;
		}
		await tx.ticketItem.create({ data: {
			ticketId,
			partId: data.partId ?? null,
			description,
			quantity: data.quantity,
			unitPriceCents,
			unitCostCents
		} });
		await logEvent(tx, ticketId, "ITEM", `Added ${data.quantity} × ${description} @ ${money(unitPriceCents)}`, author);
	}, TX_OPTIONS);
	return getTicket(ticketId);
}
async function removeItem(ticketId, itemId, author) {
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		const item = await tx.ticketItem.findFirst({ where: {
			id: itemId,
			ticketId
		} });
		if (!item) throw new HttpError(404, "Line item not found");
		if (item.partId) await tx.inventoryPart.update({
			where: { id: item.partId },
			data: { stock: { increment: item.quantity } }
		});
		await tx.ticketItem.delete({ where: { id: itemId } });
		await logEvent(tx, ticketId, "ITEM", `Removed ${item.quantity} × ${item.description}${item.partId ? " (returned to stock)" : ""}`, author);
	}, TX_OPTIONS);
	return getTicket(ticketId);
}
async function addPayment(ticketId, input, author, actorId) {
	const data = paymentSchema.parse(input);
	const cleanKey = data.idempotencyKey?.replace(/[\[\]]/g, "").trim();
	const idempMarker = cleanKey ? `[ref:${cleanKey}]` : "";
	let wasDuplicate = false;
	let ticketNum = 0;
	await prisma.$transaction(async (tx) => {
		const t = await loadTicket(tx, ticketId);
		ticketNum = t.ticketNumber;
		if (idempMarker && t.payments.some((p) => p.note?.includes(idempMarker))) {
			wasDuplicate = true;
			return;
		}
		if (t.status === "CANCELLED" || t.status === "DECLINED") throw new HttpError(409, "Cannot process payment on a cancelled or declined work order");
		const { balanceCents } = computeTotals(t);
		if (t.status === "COMPLETED" && balanceCents <= 0) throw new HttpError(409, "This completed work order is already settled and cannot be charged twice");
		const isDeposit = data.note && /deposit/i.test(data.note);
		if (!isDeposit) {
			if (balanceCents <= 0) throw new HttpError(409, "Nothing is owing on this work order");
			if (data.amountCents > balanceCents) throw new HttpError(400, `Payment (${money(data.amountCents)}) is more than the balance owing (${money(balanceCents)})`);
		}
		const baseNote = emptyToNull(data.note) ?? null;
		const storedNote = idempMarker ? baseNote ? `${baseNote} ${idempMarker}` : idempMarker : baseNote;
		await tx.payment.create({ data: {
			ticketId,
			amountCents: data.amountCents,
			method: data.method,
			note: storedNote
		} });
		const remaining = Math.max(0, balanceCents - data.amountCents);
		await logEvent(tx, ticketId, "PAYMENT", `${isDeposit ? "Deposit" : "Payment"} of ${money(data.amountCents)} received (${data.method.replace("_", "-")})${remaining === 0 ? " — paid in full" : `, ${money(remaining)} still owing`}`, author);
	}, TX_OPTIONS);
	if (!wasDuplicate) await recordAudit({
		userId: actorId ?? void 0,
		actorName: author || "POS User",
		action: "PAYMENT_RECORDED",
		details: `WO #${ticketNum}: Payment of ${money(data.amountCents)} (${data.method})`
	});
	return getTicket(ticketId);
}
async function refundPayment(ticketId, input, author, actorId) {
	const data = refundSchema.parse(input);
	const cleanKey = data.idempotencyKey?.replace(/[\[\]]/g, "").trim();
	const idempMarker = cleanKey ? `[ref:${cleanKey}]` : "";
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
		if (totals.paidCents <= 0) throw new HttpError(409, "No paid balance exists to refund on this work order");
		if (data.amountCents > totals.paidCents) throw new HttpError(400, `Refund (${money(data.amountCents)}) exceeds net collected amount (${money(totals.paidCents)})`);
		const storedNote = idempMarker ? `Refund: ${data.reason} ${idempMarker}` : `Refund: ${data.reason}`;
		await tx.payment.create({ data: {
			ticketId,
			amountCents: -data.amountCents,
			method: data.method,
			note: storedNote
		} });
		await logEvent(tx, ticketId, "PAYMENT", `Refund of ${money(data.amountCents)} issued (${data.method.replace("_", "-")}) — Reason: ${data.reason}`, author);
	}, TX_OPTIONS);
	if (!wasDuplicate) await recordAudit({
		userId: actorId ?? void 0,
		actorName: author || "POS User",
		action: "PAYMENT_REFUND",
		details: `WO #${ticketNum}: Refunded ${money(data.amountCents)} (${data.method}) - ${data.reason}`
	});
	return getTicket(ticketId);
}
async function voidPayment(ticketId, paymentId, author, actorId) {
	let ticketNum = 0;
	let voidedAmount = 0;
	let voidedMethod = "";
	await prisma.$transaction(async (tx) => {
		ticketNum = (await loadTicket(tx, ticketId)).ticketNumber;
		const p = await tx.payment.findFirst({ where: {
			id: paymentId,
			ticketId
		} });
		if (!p) throw new HttpError(404, "Payment not found");
		voidedAmount = p.amountCents;
		voidedMethod = p.method;
		await tx.payment.delete({ where: { id: paymentId } });
		await logEvent(tx, ticketId, "PAYMENT", `Voided payment of ${money(p.amountCents)} (${p.method})`, author);
	}, TX_OPTIONS);
	await recordAudit({
		userId: actorId ?? void 0,
		actorName: author || "POS User",
		action: "PAYMENT_VOID",
		details: `WO #${ticketNum}: Voided payment of ${money(voidedAmount)} (${voidedMethod})`
	});
	return getTicket(ticketId);
}
async function addPhoto(ticketId, input, author, actorId) {
	const data = photoUploadSchema.parse(input);
	const match = data.dataUrl.match(/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/);
	if (!match) throw new HttpError(400, "Unsupported file format. Only valid JPEG, PNG, and WebP images are accepted.");
	const [, mime, b64] = match;
	const header = Buffer.from(b64.slice(0, 32), "base64");
	const isPng = mime === "image/png" && header.length >= 8 && header[0] === 137 && header[1] === 80 && header[2] === 78 && header[3] === 71;
	const isJpeg = mime === "image/jpeg" && header.length >= 3 && header[0] === 255 && header[1] === 216 && header[2] === 255;
	const isWebp = mime === "image/webp" && header.length >= 12 && header.subarray(0, 4).toString("ascii") === "RIFF" && header.subarray(8, 12).toString("ascii") === "WEBP";
	if (!isPng && !isJpeg && !isWebp) throw new HttpError(400, "Unsupported or corrupted image signature. File magic bytes do not match JPEG, PNG, or WebP.");
	const safeFilename = data.filename.replace(/[^\w.\- ()]/g, "_").slice(0, 120) || "device-photo.jpg";
	let ticketNum = 0;
	await prisma.$transaction(async (tx) => {
		ticketNum = (await loadTicket(tx, ticketId)).ticketNumber;
		await logEvent(tx, ticketId, "PHOTO", JSON.stringify({
			filename: safeFilename,
			caption: emptyToNull(data.caption) ?? null,
			dataUrl: data.dataUrl
		}), author);
	}, TX_OPTIONS);
	await recordAudit({
		userId: actorId ?? void 0,
		actorName: author || "POS User",
		action: "TICKET_PHOTO_UPLOAD",
		details: `WO #${ticketNum}: Attached device photo "${safeFilename}"`
	});
	return getTicket(ticketId);
}
async function addNote(ticketId, input, author) {
	const data = noteSchema.parse(input);
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		await logEvent(tx, ticketId, data.kind, data.message, author);
	}, TX_OPTIONS);
	return getTicket(ticketId);
}
async function updateNote(ticketId, noteId, message) {
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		const existing = await tx.ticketEvent.findFirst({ where: {
			id: noteId,
			ticketId
		} });
		if (!existing) throw new HttpError(404, "Note not found");
		if (existing.kind !== "CUSTOMER_NOTE" && existing.kind !== "INTERNAL_NOTE") throw new HttpError(403, "System, status, item, and payment timeline events are immutable and cannot be altered.");
		await tx.ticketEvent.update({
			where: { id: noteId },
			data: { message: message.trim() }
		});
	}, TX_OPTIONS);
	return getTicket(ticketId);
}
async function deleteNote(ticketId, noteId) {
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		const existing = await tx.ticketEvent.findFirst({ where: {
			id: noteId,
			ticketId
		} });
		if (!existing) throw new HttpError(404, "Note not found");
		if (existing.kind !== "CUSTOMER_NOTE" && existing.kind !== "INTERNAL_NOTE") throw new HttpError(403, "System, status, item, and payment timeline events are immutable and cannot be deleted.");
		await tx.ticketEvent.delete({ where: { id: noteId } });
	}, TX_OPTIONS);
	return getTicket(ticketId);
}
async function listCustomersPaginated(params) {
	const q = (params.search || "").trim();
	const digits = digitsOnly(q);
	const where = {
		...params.includeArchived ? {} : { archivedAt: null },
		...q ? { OR: [
			{ fullName: ciContains(q) },
			{ email: ciContains(q) },
			...digits.length >= 3 ? [{ phoneDigits: { contains: digits } }] : []
		] } : {}
	};
	const page = Math.max(1, Math.floor(params.page || 1));
	const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || 25)), 500);
	const skip = (page - 1) * pageSize;
	const [total, customers] = await Promise.all([prisma.customer.count({ where }), prisma.customer.findMany({
		where,
		orderBy: { updatedAt: "desc" },
		include: { tickets: {
			where: { deletedAt: null },
			select: {
				id: true,
				status: true,
				createdAt: true,
				payments: { select: { amountCents: true } }
			}
		} },
		skip,
		take: pageSize
	})]);
	const items = customers.map(({ tickets, ...c }) => ({
		...c,
		ticketCount: tickets.length,
		openTickets: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
		totalPaidCents: tickets.reduce((s, t) => s + t.payments.reduce((a, p) => a + p.amountCents, 0), 0),
		lastVisit: tickets.reduce((d, t) => !d || t.createdAt > d ? t.createdAt : d, null)
	}));
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	return {
		items,
		total,
		page,
		pageSize,
		totalPages,
		hasMore: page < totalPages
	};
}
async function lookupCustomerByPhone(phone) {
	const phoneDigits = digitsOnly(phone);
	if (phoneDigits.length < 7) return null;
	return prisma.customer.findUnique({
		where: { phoneDigits },
		include: { devices: { orderBy: { updatedAt: "desc" } } }
	});
}
async function getCustomer(id) {
	const c = await prisma.customer.findUnique({
		where: { id },
		include: {
			devices: { orderBy: { updatedAt: "desc" } },
			tickets: {
				where: { deletedAt: null },
				include: ticketInclude,
				orderBy: { createdAt: "desc" }
			}
		}
	});
	if (!c) throw new HttpError(404, "Customer not found");
	return {
		...c,
		tickets: c.tickets.map(withTotals)
	};
}
async function updateCustomer(id, input, actor) {
	const data = customerUpdateSchema.parse(input);
	const existing = await prisma.customer.findUnique({ where: { id } });
	if (!existing) throw new HttpError(404, "Customer not found");
	const update = {};
	if (data.fullName !== void 0) update.fullName = data.fullName;
	if (data.altPhone !== void 0) update.altPhone = emptyToNull(data.altPhone) ?? null;
	if (data.email !== void 0) update.email = emptyToNull(data.email) ?? null;
	if (data.address !== void 0) update.address = emptyToNull(data.address) ?? null;
	if (data.notes !== void 0) update.notes = emptyToNull(data.notes) ?? null;
	if (data.phone !== void 0) {
		const phoneDigits = digitsOnly(data.phone);
		if (phoneDigits !== existing.phoneDigits) {
			const clash = await prisma.customer.findUnique({ where: { phoneDigits } });
			if (clash) throw new HttpError(409, `That phone number already belongs to ${clash.fullName}`);
		}
		update.phone = data.phone;
		update.phoneDigits = phoneDigits;
	}
	await prisma.customer.update({
		where: { id },
		data: update
	});
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "POS User",
		action: "CUSTOMER_UPDATE",
		details: `Updated customer profile for ${data.fullName || existing.fullName} (${id})`
	});
	return getCustomer(id);
}
async function archiveCustomer(id, archived = true, actor) {
	const existing = await prisma.customer.findUnique({ where: { id } });
	if (!existing) throw new HttpError(404, "Customer not found");
	await prisma.customer.update({
		where: { id },
		data: { archivedAt: archived ? /* @__PURE__ */ new Date() : null }
	});
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "POS User",
		action: archived ? "CUSTOMER_ARCHIVE" : "CUSTOMER_UNARCHIVE",
		details: `${archived ? "Archived" : "Restored"} customer ${existing.fullName} (${id}); invoices and repair history preserved`
	});
	return getCustomer(id);
}
function listParts(search) {
	const q = (search || "").trim();
	return prisma.inventoryPart.findMany({
		where: q ? { OR: [
			{ name: ciContains(q) },
			{ sku: ciContains(q) },
			{ supplier: ciContains(q) }
		] } : {},
		orderBy: [{ name: "asc" }]
	});
}
async function assertSkuFree(sku, exceptId) {
	const clash = await prisma.inventoryPart.findUnique({ where: { sku } });
	if (clash && clash.id !== exceptId) throw new HttpError(409, `SKU "${sku}" is already used by ${clash.name}`);
}
async function createPart(input, actor) {
	const data = partSchema.parse(input);
	data.sku = data.sku.toUpperCase();
	await assertSkuFree(data.sku);
	const created = await prisma.inventoryPart.create({ data: {
		...data,
		supplier: emptyToNull(data.supplier) ?? null
	} });
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "POS User",
		action: "INVENTORY_CREATE",
		details: `Added inventory item ${created.sku} (${created.name}), stock=${created.stock}`
	});
	return created;
}
async function updatePart(id, input, actor) {
	const data = partUpdateSchema.parse(input);
	if (!await prisma.inventoryPart.findUnique({ where: { id } })) throw new HttpError(404, "Part not found");
	if (data.sku) {
		data.sku = data.sku.toUpperCase();
		await assertSkuFree(data.sku, id);
	}
	const updated = await prisma.inventoryPart.update({
		where: { id },
		data: {
			...data,
			supplier: data.supplier === void 0 ? void 0 : emptyToNull(data.supplier) ?? null
		}
	});
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "POS User",
		action: "INVENTORY_UPDATE",
		details: `Updated inventory item ${updated.sku} (${updated.name})`
	});
	return updated;
}
async function adjustStock(id, delta, actor) {
	const part = await prisma.inventoryPart.findUnique({ where: { id } });
	if (!part) throw new HttpError(404, "Part not found");
	if (part.stock + delta < 0) throw new HttpError(409, `Stock cannot go below zero (currently ${part.stock})`);
	const updated = await prisma.inventoryPart.update({
		where: { id },
		data: { stock: { increment: delta } }
	});
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "POS User",
		action: "INVENTORY_ADJUST",
		details: `Adjusted ${updated.sku} stock by ${delta > 0 ? `+${delta}` : delta} → ${updated.stock}`
	});
	return updated;
}
async function deletePart(id, actor) {
	const existing = await prisma.inventoryPart.findUnique({ where: { id } });
	if (!existing) throw new HttpError(404, "Part not found");
	await prisma.inventoryPart.delete({ where: { id } });
	await recordAudit({
		userId: actor?.id,
		actorName: actor?.name || "Admin",
		action: "INVENTORY_DELETE",
		details: `Deleted inventory part ${existing.sku} (${existing.name})`
	});
	return { ok: true };
}
function startOfDay(d = /* @__PURE__ */ new Date()) {
	const s = new Date(d);
	s.setHours(0, 0, 0, 0);
	return s;
}
var dashboardInFlight = null;
async function getDashboard() {
	if (dashboardInFlight) return dashboardInFlight;
	dashboardInFlight = (async () => {
		try {
			const today = startOfDay();
			const tomorrow = new Date(today.getTime() + 864e5);
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
						items: { select: {
							quantity: true,
							unitPriceCents: true
						} },
						payments: { select: { amountCents: true } }
					}
				}),
				prisma.payment.findMany({
					where: {
						createdAt: { gte: monthStart },
						ticket: { deletedAt: null }
					},
					select: {
						amountCents: true,
						createdAt: true
					}
				}),
				prisma.inventoryPart.count({ where: { stock: { lte: prisma.inventoryPart.fields.reorderPoint } } }),
				prisma.customer.count({ where: { archivedAt: null } })
			]);
			const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
			const count = (s) => tickets.filter((t) => t.status === s).length;
			const awaitingPickupTickets = tickets.filter((t) => t.status === "READY_FOR_PICKUP" || t.status === "COMPLETED" && computeTotals(t).balanceCents > 0);
			const checkedIn = count("PENDING") + count("CHECKED_IN");
			const diagnosing = count("IN_PROGRESS") + count("DIAGNOSING");
			const waitingOnApproval = count("WAITING_ON_APPROVAL");
			const readyForPickup = count("READY_FOR_PICKUP");
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
				waitingOnParts: count("WAITING_ON_PARTS"),
				readyForPickup,
				completed: count("COMPLETED"),
				declined: count("DECLINED"),
				cancelled: count("CANCELLED"),
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
				lowStock
			};
		} finally {
			dashboardInFlight = null;
		}
	})();
	return dashboardInFlight;
}
async function getReport(days) {
	const span = Math.min(Math.max(Math.floor(days) || 30, 1), 365);
	const since = startOfDay(/* @__PURE__ */ new Date(Date.now() - (span - 1) * 864e5));
	const [payments, created, completed, items] = await Promise.all([
		prisma.payment.findMany({
			where: {
				createdAt: { gte: since },
				ticket: { deletedAt: null }
			},
			select: {
				amountCents: true,
				method: true,
				createdAt: true,
				ticket: { select: {
					laborCents: true,
					discountCents: true,
					taxRateBps: true,
					items: { select: {
						quantity: true,
						unitPriceCents: true
					} },
					payments: { select: { amountCents: true } }
				} }
			}
		}),
		prisma.ticket.findMany({
			where: {
				createdAt: { gte: since },
				deletedAt: null
			},
			select: {
				createdAt: true,
				isWarranty: true,
				device: { select: { name: true } }
			}
		}),
		prisma.ticket.findMany({
			where: {
				completedAt: { gte: since },
				deletedAt: null
			},
			select: {
				createdAt: true,
				completedAt: true,
				dueDate: true
			}
		}),
		prisma.ticketItem.findMany({
			where: {
				createdAt: { gte: since },
				ticket: { deletedAt: null }
			},
			select: {
				quantity: true,
				unitPriceCents: true,
				unitCostCents: true,
				partId: true
			}
		})
	]);
	const dayKey = (d) => {
		const s = startOfDay(d);
		return `${s.getFullYear()}-${String(s.getMonth() + 1).padStart(2, "0")}-${String(s.getDate()).padStart(2, "0")}`;
	};
	const daily = [];
	const index = /* @__PURE__ */ new Map();
	for (let i = 0; i < span; i++) {
		const key = dayKey(new Date(since.getTime() + i * 864e5 + 432e5));
		index.set(key, daily.length);
		daily.push({
			date: key,
			revenueCents: 0,
			ticketsCreated: 0
		});
	}
	for (const p of payments) {
		const i = index.get(dayKey(p.createdAt));
		if (i !== void 0) daily[i].revenueCents += p.amountCents;
	}
	for (const t of created) {
		const i = index.get(dayKey(t.createdAt));
		if (i !== void 0) daily[i].ticketsCreated += 1;
	}
	const byMethod = {};
	for (const p of payments) byMethod[p.method] = (byMethod[p.method] || 0) + p.amountCents;
	const deviceCounts = /* @__PURE__ */ new Map();
	for (const t of created) deviceCounts.set(t.device.name, (deviceCounts.get(t.device.name) || 0) + 1);
	const turnaroundHours = completed.filter((t) => t.completedAt).map((t) => (t.completedAt.getTime() - t.createdAt.getTime()) / 36e5);
	const onTime = completed.filter((t) => t.completedAt && t.completedAt.getTime() <= t.dueDate.getTime() + 432e5).length;
	const partsRevenueCents = items.reduce((s, i) => s + i.quantity * i.unitPriceCents, 0);
	const partsCostCents = items.reduce((s, i) => s + i.quantity * i.unitCostCents, 0);
	const refundsCents = payments.filter((p) => p.amountCents < 0).reduce((s, p) => s + Math.abs(p.amountCents), 0);
	let netTaxCollectedCents = 0;
	for (const p of payments) if (p.ticket) {
		const totals = computeTotals(p.ticket);
		if (totals.totalCents > 0 && totals.taxCents > 0) {
			const share = Math.max(-1, Math.min(1, p.amountCents / totals.totalCents));
			netTaxCollectedCents += Math.round(totals.taxCents * share);
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
		topDevices: [...deviceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({
			name,
			count
		})),
		daily
	};
}
/**
* Integrated POS Sales Attribution & Employee Labor Productivity Analytics
*/
async function getSalesLaborAnalytics(startDateStr, endDateStr) {
	const now = /* @__PURE__ */ new Date();
	const start = startDateStr ? new Date(startDateStr) : /* @__PURE__ */ new Date(now.getTime() - 2592e6);
	const end = endDateStr ? new Date(endDateStr) : now;
	const [tickets, payments, shifts, users] = await Promise.all([
		prisma.ticket.findMany({
			where: {
				createdAt: {
					gte: start,
					lte: end
				},
				deletedAt: null
			},
			include: ticketInclude
		}),
		prisma.payment.findMany({
			where: {
				createdAt: {
					gte: start,
					lte: end
				},
				ticket: { deletedAt: null }
			},
			include: { ticket: { select: {
				id: true,
				ticketNumber: true,
				technician: true,
				laborCents: true,
				discountCents: true,
				taxRateBps: true,
				items: { select: {
					quantity: true,
					unitPriceCents: true
				} },
				payments: { select: { amountCents: true } }
			} } }
		}),
		prisma.shift.findMany({
			where: {
				clockIn: {
					gte: start,
					lte: end
				},
				status: "COMPLETED"
			},
			include: { user: { select: {
				id: true,
				name: true,
				username: true,
				role: true,
				hourlyRateCents: true,
				overtimeRateCents: true
			} } }
		}),
		prisma.user.findMany({ select: {
			id: true,
			name: true,
			username: true,
			role: true,
			hourlyRateCents: true,
			bench: true
		} })
	]);
	const byMethod = {
		CASH: {
			count: 0,
			totalCents: 0
		},
		CARD: {
			count: 0,
			totalCents: 0
		},
		DEBIT: {
			count: 0,
			totalCents: 0
		},
		E_TRANSFER: {
			count: 0,
			totalCents: 0
		},
		OTHER: {
			count: 0,
			totalCents: 0
		}
	};
	let totalRevenueCents = 0;
	let totalDiscountsCents = 0;
	let totalRefundsCents = 0;
	let totalVoidedTransactions = 0;
	let taxCollectedCents = 0;
	for (const p of payments) {
		const m = (p.method || "OTHER").toUpperCase();
		if (!byMethod[m]) byMethod[m] = {
			count: 0,
			totalCents: 0
		};
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
	for (const t of tickets) if (t.discountCents > 0) totalDiscountsCents += t.discountCents;
	const transactionCount = payments.filter((p) => p.amountCents > 0).length;
	const avgTransactionCents = transactionCount > 0 ? Math.round(totalRevenueCents / transactionCount) : 0;
	const employeeMap = /* @__PURE__ */ new Map();
	for (const u of users) employeeMap.set(u.name.toLowerCase(), {
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
		laborCostCents: 0
	});
	const ensureEmployeeStat = (displayName, fallbackUser) => {
		const key = displayName.toLowerCase();
		if (!employeeMap.has(key)) employeeMap.set(key, {
			userId: fallbackUser?.id || `staff-${key.replace(/[^a-z0-9]+/g, "-")}`,
			name: displayName,
			username: fallbackUser?.username || key,
			role: fallbackUser?.role || "STAFF",
			hourlyWageCents: fallbackUser?.hourlyRateCents || 0,
			ticketsCreated: 0,
			ticketsCompleted: 0,
			laborBilledCents: 0,
			partsBilledCents: 0,
			totalRevenueCents: 0,
			actualHoursWorked: 0,
			laborCostCents: 0
		});
		return employeeMap.get(key);
	};
	for (const t of tickets) {
		const stat = ensureEmployeeStat(t.technician || "Unassigned");
		stat.ticketsCreated++;
		if (t.status === "COMPLETED") stat.ticketsCompleted++;
		stat.laborBilledCents += t.laborCents;
		const partsTotal = t.items.reduce((sum, item) => sum + item.quantity * item.unitPriceCents, 0);
		stat.partsBilledCents += partsTotal;
	}
	for (const p of payments) {
		const stat = ensureEmployeeStat(p.ticket?.technician || "Unassigned");
		stat.totalRevenueCents += p.amountCents;
	}
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
	const salesByEmployee = Array.from(employeeMap.values()).filter((e) => e.ticketsCreated > 0 || e.actualHoursWorked > 0 || e.totalRevenueCents > 0).map((e) => {
		const revenuePerHour = e.actualHoursWorked > 0 ? Math.round(e.totalRevenueCents / e.actualHoursWorked) : 0;
		const laborRatioPct = e.totalRevenueCents > 0 ? Number((e.laborCostCents / e.totalRevenueCents * 100).toFixed(1)) : 0;
		return {
			...e,
			actualHoursWorked: Number(e.actualHoursWorked.toFixed(2)),
			revenuePerHourCents: revenuePerHour,
			laborRatioPct
		};
	}).sort((a, b) => b.totalRevenueCents - a.totalRevenueCents);
	const salesByShift = shifts.slice(0, 30).map((s) => {
		const shiftStart = s.clockIn;
		const shiftEnd = s.clockOut || new Date(s.clockIn.getTime() + s.totalMinutes * 6e4);
		const shiftPayments = payments.filter((p) => p.createdAt >= shiftStart && p.createdAt <= shiftEnd);
		const shiftRevenueCents = shiftPayments.reduce((sum, p) => sum + p.amountCents, 0);
		const positiveTxCount = shiftPayments.filter((p) => p.amountCents > 0).length;
		const regularHours = s.regularMinutes / 60;
		const overtimeHours = s.overtimeMinutes / 60;
		const otRate = s.user.overtimeRateCents || Math.round(s.user.hourlyRateCents * 1.5);
		const shiftLaborCostCents = Math.round(regularHours * s.user.hourlyRateCents + overtimeHours * otRate);
		const laborCostPct = shiftRevenueCents > 0 ? Number((shiftLaborCostCents / shiftRevenueCents * 100).toFixed(1)) : 0;
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
			shiftLaborCostPct: laborCostPct
		};
	});
	const overallLaborCostPct = totalRevenueCents > 0 ? Number((totalLaborCostCents / totalRevenueCents * 100).toFixed(1)) : 0;
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
		totalTicketsCompleted: tickets.filter((t) => t.status === "COMPLETED").length,
		avgTicketValueCents: avgTransactionCents
	};
	const salesBreakdown = {
		byPaymentMethod: {
			cashCents: byMethod.CASH?.totalCents || 0,
			cardCents: (byMethod.CARD?.totalCents || 0) + (byMethod.CREDIT?.totalCents || 0),
			debitCents: byMethod.DEBIT?.totalCents || 0,
			eTransferCents: byMethod.E_TRANSFER?.totalCents || 0,
			otherCents: byMethod.OTHER?.totalCents || 0
		},
		totalDiscountsCents,
		totalRefundsCents,
		totalVoidedTransactions
	};
	return {
		period: {
			startDate: start.toISOString(),
			endDate: end.toISOString()
		},
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
		byShift: salesByShift
	};
}
async function exportTicketsCsv() {
	const tickets = await prisma.ticket.findMany({
		where: { deletedAt: null },
		include: ticketInclude,
		orderBy: { ticketNumber: "asc" }
	});
	const rows = [[
		"WO #",
		"Created",
		"Status",
		"Customer",
		"Phone",
		"Email",
		"Device",
		"Serial/IMEI",
		"Fault",
		"Due",
		"Completed",
		"Total",
		"Paid",
		"Balance"
	]];
	for (const t of tickets) {
		const totals = computeTotals(t);
		rows.push([
			String(t.ticketNumber),
			t.createdAt.toISOString().slice(0, 10),
			STATUS_LABEL[t.status] || t.status,
			t.customer.fullName,
			t.customer.phone,
			t.customer.email || "",
			t.device.name,
			t.device.serialNumber || "",
			t.faultDescription,
			t.dueDate.toISOString().slice(0, 10),
			t.completedAt ? t.completedAt.toISOString().slice(0, 10) : "",
			(totals.totalCents / 100).toFixed(2),
			(totals.paidCents / 100).toFixed(2),
			(totals.balanceCents / 100).toFixed(2)
		]);
	}
	return rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n";
}
async function loginUser(input, ipAddress, userAgent) {
	const { usernameOrEmail, password, adminMode } = loginSchema.parse(input);
	const user = await prisma.user.findFirst({ where: { OR: [{ username: usernameOrEmail.toLowerCase() }, { email: usernameOrEmail.toLowerCase() }] } });
	if (!user) {
		verifyDummyPassword(password);
		throw new HttpError(401, "Invalid username/email or password");
	}
	if (user.status !== "ACTIVE") throw new HttpError(403, "This account has been deactivated. Contact an administrator.");
	if (!verifyPassword(password, user.passwordHash)) throw new HttpError(401, "Invalid username/email or password");
	if (adminMode && user.role !== "ADMIN") {
		await recordAudit({
			userId: user.id,
			actorName: user.name,
			action: "ADMIN_ACCESS_REJECTED",
			details: `User ${user.username} was denied access to Admin Mode (role: ${user.role})`,
			ipAddress
		});
		throw new HttpError(403, "Access Denied: Administrator role required. Standard technicians must use Technician Login.");
	}
	if (user.twoFactorEnabled && user.twoFactorSecret) {
		const challengeToken = generateToken();
		const challengeExpiresAt = new Date(Date.now() + 3e5);
		await prisma.twoFactorChallenge.create({ data: {
			tokenHash: hashSessionToken(challengeToken),
			userId: user.id,
			adminMode,
			ipAddress: ipAddress ? ipAddress.slice(0, 100) : null,
			userAgent: userAgent ? userAgent.slice(0, 200) : null,
			expiresAt: challengeExpiresAt
		} });
		await recordAudit({
			userId: user.id,
			actorName: user.name,
			action: "LOGIN_2FA_CHALLENGE",
			details: `Issued 2FA challenge for ${user.username}`,
			ipAddress
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
				twoFactorEnabled: true
			}
		};
	}
	await prisma.user.update({
		where: { id: user.id },
		data: { lastLoginAt: /* @__PURE__ */ new Date() }
	});
	const token = await createSession(user.id, {
		ipAddress,
		userAgent
	});
	await recordAudit({
		userId: user.id,
		actorName: user.name,
		action: adminMode ? "ADMIN_LOGIN" : "LOGIN",
		details: `${adminMode ? "Administrator" : "User"} signed in from ${ipAddress || "local"}`,
		ipAddress
	});
	const { passwordHash: _, sin: _sin, twoFactorSecret: _tfs, twoFactorRecoveryCodes: _tfr, twoFactorLastCounter: _tflc, ...safeUser } = user;
	const expiresAtMs = Date.now() + 864e5;
	return {
		requiresTwoFactor: false,
		token,
		user: safeUser,
		expiresAt: new Date(expiresAtMs).toISOString(),
		expiresAtMs,
		redirectTo: user.role === "ADMIN" && adminMode ? "admin" : "repairs"
	};
}
async function logoutUser(token, actorName) {
	await destroySession(token);
	if (actorName) await recordAudit({
		actorName,
		action: "LOGOUT",
		details: "User logged out"
	});
	return { success: true };
}
async function listUsers(params, _includeSyncPayload = false) {
	const where = {};
	if (params.role && params.role !== "ALL") where.role = params.role;
	if (params.status && params.status !== "ALL") where.status = params.status;
	if (params.search?.trim()) {
		const q = params.search.trim();
		where.OR = [
			{ name: ciContains(q) },
			{ username: ciContains(q) },
			{ email: ciContains(q) }
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
			updatedAt: true
		},
		orderBy: { createdAt: "desc" }
	});
}
async function getUser(id) {
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
			updatedAt: true
		}
	});
	if (!user) throw new HttpError(404, "User account not found");
	return user;
}
async function createUser(input, actor) {
	const data = userCreateSchema.parse(input);
	if (await prisma.user.findUnique({ where: { username: data.username.toLowerCase() } })) throw new HttpError(409, "Username is already taken");
	if (await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })) throw new HttpError(409, "Email address is already registered");
	const passwordHash = hashPassword(data.password);
	const user = await prisma.user.create({
		data: {
			username: data.username.toLowerCase(),
			email: data.email.toLowerCase(),
			name: data.name,
			passwordHash,
			role: data.role,
			status: "ACTIVE",
			phone: data.phone ?? null,
			bench: data.bench ?? "Bench #01",
			bio: data.bio ?? "",
			preferences: JSON.stringify({
				soundFX: true,
				compactView: false,
				autoPrint: false,
				emailAlerts: true
			})
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
			createdAt: true
		}
	});
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "USER_CREATE",
		details: `Created new ${user.role} user: ${user.username} (${user.name})`
	});
	return user;
}
async function updateUser(id, input, actor) {
	const existing = await prisma.user.findUnique({ where: { id } });
	if (!existing) throw new HttpError(404, "User account not found");
	const data = userUpdateSchema.parse(input);
	if (data.role && data.role !== "ADMIN" && existing.role === "ADMIN" || data.status && data.status === "DISABLED" && existing.status === "ACTIVE" && existing.role === "ADMIN") {
		if (await prisma.user.count({ where: {
			role: "ADMIN",
			status: "ACTIVE",
			NOT: { id }
		} }) === 0) throw new HttpError(400, "Cannot demote or deactivate the last remaining active administrator");
	}
	if (data.email && data.email.toLowerCase() !== existing.email) {
		if (await prisma.user.findUnique({ where: { email: data.email.toLowerCase() } })) throw new HttpError(409, "Email address is already in use by another user");
	}
	const updateData = {};
	if (data.name !== void 0) updateData.name = data.name;
	if (data.email !== void 0) updateData.email = data.email.toLowerCase();
	if (data.phone !== void 0) updateData.phone = data.phone;
	if (data.bench !== void 0) updateData.bench = data.bench;
	if (data.bio !== void 0) updateData.bio = data.bio;
	if (data.role !== void 0) updateData.role = data.role;
	if (data.status !== void 0) updateData.status = data.status;
	if (data.preferences !== void 0) updateData.preferences = data.preferences;
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
			updatedAt: true
		}
	});
	if (data.status === "DISABLED" || data.role && data.role !== existing.role) await Promise.all([prisma.session.deleteMany({ where: { userId: id } }), prisma.twoFactorChallenge.deleteMany({ where: { userId: id } })]).catch(() => {});
	const actions = [];
	if (data.role && data.role !== existing.role) actions.push(`role changed to ${data.role}`);
	if (data.status && data.status !== existing.status) actions.push(`status changed to ${data.status}`);
	if (actions.length === 0) actions.push("profile information updated");
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: data.role !== existing.role ? "ROLE_CHANGE" : data.status !== existing.status ? "STATUS_CHANGE" : "USER_UPDATE",
		details: `Updated user ${existing.username}: ${actions.join(", ")}`
	});
	return updated;
}
async function deleteUser(id, actor) {
	if (id === actor.id) throw new HttpError(400, "Security Violation: You cannot delete your own logged-in administrator account");
	const user = await prisma.user.findUnique({ where: { id } });
	if (!user) throw new HttpError(404, "User account not found");
	if (user.role === "ADMIN") {
		if (await prisma.user.count({ where: {
			role: "ADMIN",
			status: "ACTIVE",
			NOT: { id }
		} }) === 0) throw new HttpError(400, "Security Violation: Cannot delete the last remaining administrator account");
	}
	await prisma.session.deleteMany({ where: { userId: id } });
	await prisma.user.delete({ where: { id } });
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "USER_DELETE",
		details: `Deleted user account: ${user.username} (${user.name}, role: ${user.role})`
	});
	return {
		success: true,
		message: `User ${user.username} successfully deleted`
	};
}
async function changeUserPassword(userId, input, actorName, currentToken) {
	const { currentPassword, newPassword } = changePasswordSchema.parse(input);
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new HttpError(404, "User account not found");
	if (!verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(400, "Current password is incorrect");
	const passwordHash = hashPassword(newPassword);
	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash }
	});
	await prisma.session.deleteMany({ where: {
		userId,
		...currentToken ? { token: { notIn: [hashSessionToken(currentToken), currentToken] } } : {}
	} });
	await recordAudit({
		userId,
		actorName,
		action: "PASSWORD_RESET",
		details: `User ${user.username} changed their account password`
	});
	return {
		success: true,
		message: "Password successfully updated"
	};
}
async function adminResetUserPassword(userId, input, actor) {
	const { newPassword } = resetPasswordSchema.parse(input);
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new HttpError(404, "User account not found");
	const passwordHash = hashPassword(newPassword);
	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash }
	});
	await prisma.session.deleteMany({ where: { userId } });
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "PASSWORD_RESET",
		details: `Administrator ${actor.name} securely reset password for user ${user.username}`
	});
	return {
		success: true,
		message: `Password for ${user.username} has been reset`
	};
}
async function updateUserPreferences(userId, preferences) {
	if (!await prisma.user.findUnique({ where: { id: userId } })) throw new HttpError(404, "User not found");
	const prefString = typeof preferences === "string" ? preferences : JSON.stringify(preferences);
	return await prisma.user.update({
		where: { id: userId },
		data: { preferences: prefString },
		select: {
			id: true,
			preferences: true
		}
	});
}
async function listAuditLogsPaginated(params) {
	const page = Math.max(1, Math.floor(params.page || 1));
	const pageSize = Math.min(Math.max(1, Math.floor(params.pageSize || params.limit || 25)), 500);
	const skip = (page - 1) * pageSize;
	const where = {};
	if (params.action && params.action !== "ALL") where.action = params.action;
	if (params.search?.trim()) {
		const q = params.search.trim();
		where.OR = [
			{ actorName: ciContains(q) },
			{ details: ciContains(q) },
			{ action: ciContains(q) }
		];
	}
	const [total, logs] = await Promise.all([prisma.auditLog.count({ where }), prisma.auditLog.findMany({
		where,
		orderBy: { createdAt: "desc" },
		skip,
		take: pageSize
	})]);
	const totalPages = Math.max(1, Math.ceil(total / pageSize));
	return {
		items: logs,
		total,
		page,
		pageSize,
		totalPages,
		hasMore: page < totalPages
	};
}
async function getAdminOverview() {
	const [totalUsers, activeUsers, disabledUsers, adminUsers, standardUsers, recentUsers, recentAudits, ticketsCount, activeTicketsCount, completedTicketsCount, customersCount, inventoryCount, lowStockParts, revenueAgg] = await Promise.all([
		prisma.user.count(),
		prisma.user.count({ where: { status: "ACTIVE" } }),
		prisma.user.count({ where: { status: "DISABLED" } }),
		prisma.user.count({ where: { role: "ADMIN" } }),
		prisma.user.count({ where: { role: "USER" } }),
		prisma.user.findMany({
			orderBy: { createdAt: "desc" },
			take: 5,
			select: {
				id: true,
				username: true,
				name: true,
				email: true,
				role: true,
				status: true,
				createdAt: true,
				lastLoginAt: true
			}
		}),
		prisma.auditLog.findMany({
			orderBy: { createdAt: "desc" },
			take: 8
		}),
		prisma.ticket.count({ where: { deletedAt: null } }),
		prisma.ticket.count({ where: {
			deletedAt: null,
			status: { in: OPEN_STATUSES }
		} }),
		prisma.ticket.count({ where: {
			deletedAt: null,
			status: "COMPLETED"
		} }),
		prisma.customer.count(),
		prisma.inventoryPart.count(),
		prisma.inventoryPart.count({ where: { stock: { lte: 2 } } }),
		prisma.payment.aggregate({ _sum: { amountCents: true } })
	]);
	return {
		users: {
			total: totalUsers,
			active: activeUsers,
			disabled: disabledUsers,
			admins: adminUsers,
			technicians: standardUsers,
			recent: recentUsers
		},
		system: {
			status: "OPERATIONAL",
			database: process.env.DATABASE_URL?.startsWith("postgres://") || process.env.DATABASE_URL?.startsWith("postgresql://") ? "PostgreSQL (Supabase ACID)" : "ACID Relational SQLite",
			serverTime: (/* @__PURE__ */ new Date()).toISOString(),
			activeWorkstations: 4
		},
		shop: {
			totalTickets: ticketsCount,
			activeTickets: activeTicketsCount,
			completedTickets: completedTicketsCount,
			totalCustomers: customersCount,
			totalInventoryItems: inventoryCount,
			lowStockAlerts: lowStockParts,
			lifetimeRevenueCents: revenueAgg._sum.amountCents || 0
		},
		recentAudits
	};
}
// src/server/backup.ts
var BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || (process.env.VERCEL ? "/tmp/backups" : "backups"));
var KEEP = Number(process.env.BACKUP_KEEP || 30);
var INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 6);
/** Enable SQLite crash-safety & concurrency settings. */
async function configureSqlite() {
	if (!!(process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith("postgres://") || process.env.DATABASE_URL.startsWith("postgresql://")))) return;
	await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
	await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
	await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
}
/** Consistent online snapshot (safe while app is running). */
async function createBackup(reason = "manual") {
	const isPostgres = !!(process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith("postgres://") || process.env.DATABASE_URL.startsWith("postgresql://")));
	fs.mkdirSync(BACKUP_DIR, { recursive: true });
	const file = `apexfix-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${reason.replace(/[^a-z0-9]/gi, "")}.db`;
	const full = path.join(BACKUP_DIR, file);
	if (isPostgres) {
		const [users, settings, tickets, customers, devices, shifts, audits, inventoryParts, wageRates, scheduledShifts, payrollPeriods, paystubs] = await Promise.all([
			prisma.user.findMany(),
			prisma.setting.findMany(),
			prisma.ticket.findMany({ include: {
				items: true,
				payments: true,
				events: true
			} }),
			prisma.customer.findMany(),
			prisma.device.findMany(),
			prisma.shift.findMany(),
			prisma.auditLog.findMany({ take: 500 }),
			prisma.inventoryPart.findMany(),
			prisma.wageRate.findMany(),
			prisma.scheduledShift.findMany(),
			prisma.payrollPeriod.findMany(),
			prisma.paystub.findMany()
		]);
		const safeUsers = users.map(({ passwordHash: _ph, sin, twoFactorSecret: _tfs, twoFactorRecoveryCodes: _tfr, twoFactorLastCounter: _tflc, ...u }) => {
			const digits = sin ? sin.replace(/\D/g, "") : "";
			return {
				...u,
				sin: digits.length >= 3 ? `***-***-${digits.slice(-3)}` : null
			};
		});
		const snapshot = {
			timestamp: (/* @__PURE__ */ new Date()).toISOString(),
			reason,
			provider: "postgresql",
			data: {
				users: safeUsers,
				settings,
				tickets,
				customers,
				devices,
				shifts,
				audits,
				inventoryParts,
				wageRates,
				scheduledShifts,
				payrollPeriods,
				paystubs
			}
		};
		fs.writeFileSync(full, JSON.stringify(snapshot, null, 2), "utf-8");
	} else await prisma.$executeRawUnsafe(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
	pruneBackups();
	const st = fs.statSync(full);
	return {
		file,
		sizeBytes: st.size,
		createdAt: st.mtime.toISOString()
	};
}
function listBackups() {
	if (!fs.existsSync(BACKUP_DIR)) return [];
	return fs.readdirSync(BACKUP_DIR).filter((f) => /^apexfix-.*\.db$/.test(f)).map((f) => {
		const st = fs.statSync(path.join(BACKUP_DIR, f));
		return {
			file: f,
			sizeBytes: st.size,
			createdAt: st.mtime.toISOString()
		};
	}).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}
/** Returns absolute path if the name is a valid backup file (prevents path traversal). */
function resolveBackup(name) {
	if (!/^apexfix-[\w-]+\.db$/.test(name)) return null;
	const full = path.join(BACKUP_DIR, name);
	return fs.existsSync(full) ? full : null;
}
function pruneBackups() {
	const all = listBackups();
	for (const b of all.slice(KEEP)) try {
		fs.unlinkSync(path.join(BACKUP_DIR, b.file));
	} catch {}
}
function startBackupSchedule() {
	createBackup("startup").catch((e) => console.error("[Backup] startup failed", e));
	setInterval(() => {
		createBackup("auto").catch((e) => console.error("[Backup] scheduled failed", e));
	}, INTERVAL_HOURS * 36e5).unref();
	console.log(`[Backup] Auto-backup every ${INTERVAL_HOURS}h → ${BACKUP_DIR} (keeping ${KEEP})`);
}
// src/server/initDb.ts
var SCHEMA_SQL = `
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
var POSTGRES_SCHEMA_STATEMENTS = [
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
	`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorEnabled" BOOLEAN NOT NULL DEFAULT false`,
	`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorSecret" TEXT`,
	`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorRecoveryCodes" TEXT`,
	`ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "twoFactorLastCounter" INTEGER`,
	`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "ipAddress" TEXT`,
	`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "userAgent" TEXT`,
	`ALTER TABLE "Session" ADD COLUMN IF NOT EXISTS "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP`,
	`ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "prevHash" TEXT`,
	`ALTER TABLE "AuditLog" ADD COLUMN IF NOT EXISTS "entryHash" TEXT`,
	`CREATE TABLE IF NOT EXISTS "TwoFactorChallenge" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "tokenHash" TEXT NOT NULL UNIQUE,
    "userId" TEXT NOT NULL,
    "adminMode" BOOLEAN NOT NULL DEFAULT false,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
  )`,
	`CREATE INDEX IF NOT EXISTS "TwoFactorChallenge_userId_idx" ON "TwoFactorChallenge"("userId")`,
	`CREATE INDEX IF NOT EXISTS "TwoFactorChallenge_expiresAt_idx" ON "TwoFactorChallenge"("expiresAt")`,
	`ALTER TABLE "public"."AuditLog" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Customer" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Device" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."InventoryPart" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Notification" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Payment" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."PayrollPeriod" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Paystub" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."ScheduledShift" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Session" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Setting" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Shift" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."ShiftBreak" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."ShiftSwapRequest" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."Ticket" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."TicketEvent" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."TicketItem" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."TimeOffRequest" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."TwoFactorChallenge" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."User" ENABLE ROW LEVEL SECURITY`,
	`ALTER TABLE "public"."WageRate" ENABLE ROW LEVEL SECURITY`,
	`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon, authenticated`,
	`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon, authenticated`
];
async function ensurePostgresSchema() {
	for (const sql of POSTGRES_SCHEMA_STATEMENTS) try {
		await prisma.$executeRawUnsafe(sql);
	} catch {}
}
async function ensureDatabaseSchema() {
	if (!!(process.env.DATABASE_URL && (process.env.DATABASE_URL.startsWith("postgres://") || process.env.DATABASE_URL.startsWith("postgresql://")))) {
		await ensurePostgresSchema();
		return;
	}
	const statements = SCHEMA_SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
	for (const sql of statements) try {
		await prisma.$executeRawUnsafe(sql);
	} catch {}
	for (const alter of [
		"ALTER TABLE \"User\" ADD COLUMN \"employeeNumber\" TEXT;",
		"ALTER TABLE \"User\" ADD COLUMN \"hourlyRateCents\" INTEGER NOT NULL DEFAULT 2200;",
		"ALTER TABLE \"User\" ADD COLUMN \"overtimeRateCents\" INTEGER;",
		"ALTER TABLE \"User\" ADD COLUMN \"vacationPayPct\" INTEGER NOT NULL DEFAULT 400;",
		"ALTER TABLE \"User\" ADD COLUMN \"td1FederalClaimCents\" INTEGER NOT NULL DEFAULT 1612900;",
		"ALTER TABLE \"User\" ADD COLUMN \"td1OntarioClaimCents\" INTEGER NOT NULL DEFAULT 1274600;",
		"ALTER TABLE \"User\" ADD COLUMN \"sin\" TEXT;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"ontarioMinWageCents\" INTEGER NOT NULL DEFAULT 1720;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"overtimeThresholdWeeklyHours\" REAL NOT NULL DEFAULT 44.0;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"overtimeMultiplierPct\" INTEGER NOT NULL DEFAULT 150;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"minRestBetweenShiftsHours\" REAL NOT NULL DEFAULT 11.0;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"maxWeeklyHoursBeforePermit\" REAL NOT NULL DEFAULT 48.0;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"mandatoryMealBreakMinutes\" INTEGER NOT NULL DEFAULT 30;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"vacationPayPctUnder5Years\" INTEGER NOT NULL DEFAULT 400;",
		"ALTER TABLE \"Setting\" ADD COLUMN \"vacationPayPctOver5Years\" INTEGER NOT NULL DEFAULT 600;",
		"ALTER TABLE \"ScheduledShift\" ADD COLUMN \"branchLocation\" TEXT DEFAULT 'Main Shop';",
		"ALTER TABLE \"ScheduledShift\" ADD COLUMN \"recurrenceRule\" TEXT DEFAULT 'NONE';",
		"ALTER TABLE \"ScheduledShift\" ADD COLUMN \"isPublished\" INTEGER NOT NULL DEFAULT 1;",
		"ALTER TABLE \"Customer\" ADD COLUMN \"archivedAt\" DATETIME;",
		"ALTER TABLE \"Ticket\" ADD COLUMN \"isWarranty\" INTEGER NOT NULL DEFAULT 0;",
		"ALTER TABLE \"User\" ADD COLUMN \"twoFactorEnabled\" INTEGER NOT NULL DEFAULT 0;",
		"ALTER TABLE \"User\" ADD COLUMN \"twoFactorSecret\" TEXT;",
		"ALTER TABLE \"User\" ADD COLUMN \"twoFactorRecoveryCodes\" TEXT;",
		"ALTER TABLE \"User\" ADD COLUMN \"twoFactorLastCounter\" INTEGER;",
		"ALTER TABLE \"Session\" ADD COLUMN \"ipAddress\" TEXT;",
		"ALTER TABLE \"Session\" ADD COLUMN \"userAgent\" TEXT;",
		"ALTER TABLE \"Session\" ADD COLUMN \"lastActiveAt\" DATETIME DEFAULT CURRENT_TIMESTAMP;",
		"ALTER TABLE \"AuditLog\" ADD COLUMN \"prevHash\" TEXT;",
		"ALTER TABLE \"AuditLog\" ADD COLUMN \"entryHash\" TEXT;",
		`CREATE TABLE IF NOT EXISTS "TwoFactorChallenge" ("id" TEXT NOT NULL PRIMARY KEY, "tokenHash" TEXT NOT NULL UNIQUE, "userId" TEXT NOT NULL, "adminMode" INTEGER NOT NULL DEFAULT 0, "ipAddress" TEXT, "userAgent" TEXT, "expiresAt" DATETIME NOT NULL, "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "TwoFactorChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE);`
	]) try {
		await prisma.$executeRawUnsafe(alter);
	} catch {}
	try {
		await prisma.$executeRawUnsafe(`UPDATE "Setting" SET "receiptFooter" = 'Thank you for your business!' WHERE "receiptFooter" LIKE '%storage%' OR "receiptFooter" LIKE '%90-day%'`);
	} catch {}
	try {
		await prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "Ticket_ticketNumber_key"`);
		await prisma.$executeRawUnsafe(`CREATE INDEX IF NOT EXISTS "Ticket_ticketNumber_idx" ON "Ticket"("ticketNumber")`);
	} catch {}
}
async function ensureInitialInventory() {
	try {
		if (await prisma.inventoryPart.count() === 0) for (const part of [
			{
				id: "part_ip15p_oled",
				sku: "SCR-IP15P-OEM",
				name: "iPhone 15 Pro OLED Display & Touch Digitizer",
				category: "SCREENS",
				costCents: 12e3,
				priceCents: 21900,
				stock: 8,
				reorderPoint: 2,
				supplier: "MobileSentrix Canada"
			},
			{
				id: "part_ip14_oled",
				sku: "SCR-IP14-OEM",
				name: "iPhone 14 OLED Screen Assembly",
				category: "SCREENS",
				costCents: 8500,
				priceCents: 15900,
				stock: 12,
				reorderPoint: 3,
				supplier: "MobileSentrix Canada"
			},
			{
				id: "part_s24u_amoled",
				sku: "SCR-S24U-DYNAMIC",
				name: "Samsung Galaxy S24 Ultra Dynamic AMOLED",
				category: "SCREENS",
				costCents: 17500,
				priceCents: 28900,
				stock: 5,
				reorderPoint: 2,
				supplier: "Injured Gadgets"
			},
			{
				id: "part_bat_ip15",
				sku: "BAT-IP15-TI",
				name: "iPhone 15 High-Capacity Zero-Cycle Battery",
				category: "BATTERIES",
				costCents: 2800,
				priceCents: 6900,
				stock: 15,
				reorderPoint: 4,
				supplier: "MobileSentrix Canada"
			},
			{
				id: "part_bat_s23",
				sku: "BAT-S23-OEM",
				name: "Samsung Galaxy S23 Series Battery Pack",
				category: "BATTERIES",
				costCents: 2400,
				priceCents: 6500,
				stock: 10,
				reorderPoint: 3,
				supplier: "Injured Gadgets"
			},
			{
				id: "part_port_usbc",
				sku: "PORT-USBC-UNIV",
				name: "Universal USB-C Port Daughterboard Sub-Assembly",
				category: "COMPONENTS",
				costCents: 1400,
				priceCents: 4500,
				stock: 20,
				reorderPoint: 5,
				supplier: "MobileSentrix Canada"
			},
			{
				id: "part_seal_thermal",
				sku: "MISC-THERMAL-KIT",
				name: "Thermal Dissipation Pad & IP68 Waterproof Gasket Kit",
				category: "GENERAL",
				costCents: 450,
				priceCents: 1900,
				stock: 35,
				reorderPoint: 10,
				supplier: "Faso Supply Co"
			}
		]) await prisma.inventoryPart.upsert({
			where: { sku: part.sku },
			update: {},
			create: part
		}).catch(() => {});
	} catch (err) {
		console.error("[Inventory Provisioning Error]", err);
	}
}
// src/server/payrollMath.ts
var CRA_2026 = {
	CPP: {
		RATE: .0595,
		BASIC_EXEMPTION_ANNUAL_CENTS: 35e4,
		YMPE_ANNUAL_CENTS: 713e4,
		MAX_ANNUAL_CONTRIBUTION_CENTS: 403410
	},
	EI: {
		RATE: .0163,
		MAX_INSURABLE_ANNUAL_CENTS: 657e4,
		MAX_ANNUAL_PREMIUM_CENTS: 107091
	},
	DEFAULT_TD1_FEDERAL_CENTS: 1612900,
	DEFAULT_TD1_ONTARIO_CENTS: 1274600,
	ONTARIO_VACATION_PAY_BPS: 400,
	ONTARIO_OVERTIME_WEEKLY_HOURS: 44
};
/**
* Determine periods per year based on pay frequency
*/
function getPeriodsPerYear(periodType, days = 14) {
	switch (periodType) {
		case "WEEKLY": return 52;
		case "BI_WEEKLY": return 26;
		case "SEMI_MONTHLY": return 24;
		case "MONTHLY": return 12;
		case "CUSTOM": return Math.max(1, Math.round(365 / Math.max(1, days)));
		default: return 26;
	}
}
function calculateShiftHours(shiftMinutes, priorWeeklyMinutes) {
	const otThresholdMinutes = CRA_2026.ONTARIO_OVERTIME_WEEKLY_HOURS * 60;
	if (priorWeeklyMinutes + shiftMinutes <= otThresholdMinutes) return {
		regularMinutes: shiftMinutes,
		overtimeMinutes: 0
	};
	else if (priorWeeklyMinutes >= otThresholdMinutes) return {
		regularMinutes: 0,
		overtimeMinutes: shiftMinutes
	};
	else {
		const regularMinutes = otThresholdMinutes - priorWeeklyMinutes;
		return {
			regularMinutes,
			overtimeMinutes: shiftMinutes - regularMinutes
		};
	}
}
/**
* Compute Canada Pension Plan (CPP) periodic contribution
*/
function calculateCPP(grossCents, periodsPerYear) {
	if (grossCents <= 0) return 0;
	const periodicExemption = Math.round(CRA_2026.CPP.BASIC_EXEMPTION_ANNUAL_CENTS / periodsPerYear);
	const contributoryGross = Math.max(0, grossCents - periodicExemption);
	if (contributoryGross <= 0) return 0;
	const rawCpp = Math.round(contributoryGross * CRA_2026.CPP.RATE);
	const periodicMax = Math.round(CRA_2026.CPP.MAX_ANNUAL_CONTRIBUTION_CENTS / periodsPerYear);
	return Math.min(rawCpp, periodicMax);
}
/**
* Compute Employment Insurance (EI) periodic premium
*/
function calculateEI(grossCents, periodsPerYear) {
	if (grossCents <= 0) return 0;
	const rawEi = Math.round(grossCents * CRA_2026.EI.RATE);
	const periodicMax = Math.round(CRA_2026.EI.MAX_ANNUAL_PREMIUM_CENTS / periodsPerYear);
	return Math.min(rawEi, periodicMax);
}
/**
* Calculate Canadian Federal Income Tax on Annualized Income (2026 brackets)
*/
function calculateAnnualFederalTax(annualIncomeCents, td1FedCents) {
	const inc = annualIncomeCents / 100;
	if (inc <= 0) return 0;
	let tax = 0;
	if (inc <= 55867) tax = inc * .15;
	else if (inc <= 111733) tax = 8380.05 + (inc - 55867) * .205;
	else if (inc <= 173205) tax = 19832.579999999998 + (inc - 111733) * .26;
	else if (inc <= 246752) tax = 35815.3 + (inc - 173205) * .29;
	else tax = 57143.93 + (inc - 246752) * .33;
	const credit = td1FedCents / 100 * .15;
	return Math.max(0, Math.round((tax - credit) * 100));
}
/**
* Calculate Ontario Provincial Income Tax on Annualized Income (2026 brackets + surtax + OHP)
*/
function calculateAnnualOntarioTax(annualIncomeCents, td1OnCents) {
	const inc = annualIncomeCents / 100;
	if (inc <= 0) return 0;
	let baseTax = 0;
	if (inc <= 51446) baseTax = inc * .0505;
	else if (inc <= 102894) baseTax = 2598.023 + (inc - 51446) * .0915;
	else if (inc <= 15e4) baseTax = 7305.515 + (inc - 102894) * .1116;
	else if (inc <= 22e4) baseTax = 12562.544600000001 + (inc - 15e4) * .1216;
	else baseTax = 21074.5446 + (inc - 22e4) * .1316;
	const credit = td1OnCents / 100 * .0505;
	let netBaseTax = Math.max(0, baseTax - credit);
	let surtax = 0;
	if (netBaseTax > 5315) surtax += (netBaseTax - 5315) * .2;
	if (netBaseTax > 6802) surtax += (netBaseTax - 6802) * .36;
	let ohp = 0;
	if (inc > 2e4 && inc <= 25e3) ohp = Math.min(300, (inc - 2e4) * .06);
	else if (inc > 25e3 && inc <= 36e3) ohp = 300;
	else if (inc > 36e3 && inc <= 38500) ohp = 300 + (inc - 36e3) * .06;
	else if (inc > 38500 && inc <= 48e3) ohp = 450;
	else if (inc > 48e3 && inc <= 48600) ohp = 450 + (inc - 48e3) * .25;
	else if (inc > 48600 && inc <= 72e3) ohp = 600;
	else if (inc > 72e3 && inc <= 72600) ohp = 600 + (inc - 72e3) * .25;
	else if (inc > 72600 && inc <= 2e5) ohp = 750;
	else if (inc > 2e5 && inc <= 200600) ohp = 750 + (inc - 2e5) * .25;
	else if (inc > 200600) ohp = 900;
	return Math.round((netBaseTax + surtax + ohp) * 100);
}
/**
* Compute combined Federal and Ontario periodic income tax
*/
function calculateIncomeTax(grossCents, periodsPerYear, td1FedCents = CRA_2026.DEFAULT_TD1_FEDERAL_CENTS, td1OnCents = CRA_2026.DEFAULT_TD1_ONTARIO_CENTS) {
	if (grossCents <= 0) return 0;
	const annualGross = grossCents * periodsPerYear;
	const annualFed = calculateAnnualFederalTax(annualGross, td1FedCents);
	const annualOn = calculateAnnualOntarioTax(annualGross, td1OnCents);
	return Math.max(0, Math.round((annualFed + annualOn) / periodsPerYear));
}
/**
* Main Payroll Calculation Function
*/
function calculatePayroll(input) {
	const periodsPerYear = getPeriodsPerYear(input.periodType, input.daysInPeriod);
	const hourlyRateCents = Math.max(0, input.employee.hourlyRateCents);
	const overtimeRateCents = input.employee.overtimeRateCents && input.employee.overtimeRateCents > 0 ? input.employee.overtimeRateCents : Math.round(hourlyRateCents * 1.5);
	const regularHours = Math.max(0, Number(input.regularHours.toFixed(2)));
	const overtimeHours = Math.max(0, Number(input.overtimeHours.toFixed(2)));
	const regularPayCents = Math.round(regularHours * hourlyRateCents);
	const overtimePayCents = Math.round(overtimeHours * overtimeRateCents);
	const bonusCents = Math.max(0, input.bonusCents || 0);
	const vacationPayPct = input.employee.vacationPayPct ?? CRA_2026.ONTARIO_VACATION_PAY_BPS;
	const baseEarningsCents = regularPayCents + overtimePayCents + bonusCents;
	const vacationPayCents = Math.round(baseEarningsCents * vacationPayPct / 1e4);
	const grossPayCents = baseEarningsCents + vacationPayCents;
	const cppCents = calculateCPP(grossPayCents, periodsPerYear);
	const eiCents = calculateEI(grossPayCents, periodsPerYear);
	const incomeTaxCents = calculateIncomeTax(grossPayCents, periodsPerYear, input.employee.td1FederalClaimCents || CRA_2026.DEFAULT_TD1_FEDERAL_CENTS, input.employee.td1OntarioClaimCents || CRA_2026.DEFAULT_TD1_ONTARIO_CENTS);
	const otherDeductionsCents = Math.max(0, input.otherDeductionsCents || 0);
	const totalDeductionsCents = cppCents + eiCents + incomeTaxCents + otherDeductionsCents;
	return {
		regularHours,
		overtimeHours,
		hourlyRateCents,
		overtimeRateCents,
		regularPayCents,
		overtimePayCents,
		bonusCents,
		vacationPayCents,
		grossPayCents,
		cppCents,
		eiCents,
		incomeTaxCents,
		otherDeductionsCents,
		totalDeductionsCents,
		netPayCents: Math.max(0, grossPayCents - totalDeductionsCents),
		payPeriodsPerYear: periodsPerYear,
		effectiveTaxRatePct: grossPayCents > 0 ? Number((totalDeductionsCents / grossPayCents * 100).toFixed(2)) : 0
	};
}
// src/server/notificationService.ts
/**
* Create a persistent in-app notification for a single user.
* Fails silently if the notification write fails so core POS transactions are never blocked.
*/
async function createNotification(input) {
	try {
		return await prisma.notification.create({ data: {
			userId: input.userId,
			type: input.type,
			title: input.title,
			message: input.message,
			linkTab: input.linkTab ?? null
		} });
	} catch (err) {
		console.error("[Notification Error]", err);
		return null;
	}
}
/**
* Send an in-app notification to all active administrators (optionally excluding the actor).
*/
async function notifyAdmins(params) {
	try {
		const admins = await prisma.user.findMany({
			where: {
				role: "ADMIN",
				status: "ACTIVE",
				...params.excludeUserId ? { id: { not: params.excludeUserId } } : {}
			},
			select: { id: true }
		});
		if (admins.length === 0) return;
		await prisma.notification.createMany({ data: admins.map((admin) => ({
			userId: admin.id,
			type: params.type,
			title: params.title,
			message: params.message,
			linkTab: params.linkTab ?? null
		})) });
	} catch (err) {
		console.error("[NotifyAdmins Error]", err);
	}
}
async function listUserNotifications(userId, params) {
	const limit = Math.min(Math.max(params?.limit ?? 30, 1), 100);
	const where = {
		userId,
		...params?.unreadOnly ? { isRead: false } : {}
	};
	const [notifications, unreadCount] = await Promise.all([prisma.notification.findMany({
		where,
		orderBy: { createdAt: "desc" },
		take: limit
	}), prisma.notification.count({ where: {
		userId,
		isRead: false
	} })]);
	return {
		notifications,
		unreadCount
	};
}
async function markNotificationRead(userId, notificationId) {
	const existing = await prisma.notification.findUnique({ where: { id: notificationId } });
	if (!existing || existing.userId !== userId) throw new HttpError(404, "Notification not found");
	return prisma.notification.update({
		where: { id: notificationId },
		data: { isRead: true }
	});
}
async function markAllNotificationsRead(userId) {
	return { markedCount: (await prisma.notification.updateMany({
		where: {
			userId,
			isRead: false
		},
		data: { isRead: true }
	})).count };
}
// src/server/payrollService.ts
function getOpenUnpaidBreakMinutes(breaks, now) {
	if (!breaks || breaks.length === 0) return 0;
	const openBreak = breaks.find((b) => b.endTime === null);
	if (!openBreak || openBreak.type === "PAID_REST") return 0;
	return Math.max(0, Math.round((now.getTime() - openBreak.startTime.getTime()) / 6e4));
}
async function getPriorWeeklyCompletedMinutes(userId, referenceClockIn, excludeShiftId) {
	const dayOfWeek = (referenceClockIn.getDay() + 6) % 7;
	const startOfDay = new Date(referenceClockIn.getFullYear(), referenceClockIn.getMonth(), referenceClockIn.getDate());
	const weekStart = /* @__PURE__ */ new Date(startOfDay.getTime() - dayOfWeek * 864e5);
	return (await prisma.shift.findMany({
		where: {
			userId,
			...excludeShiftId ? { id: { not: excludeShiftId } } : {},
			clockIn: {
				gte: weekStart,
				lt: referenceClockIn
			},
			status: "COMPLETED"
		},
		select: { totalMinutes: true }
	})).reduce((sum, p) => sum + p.totalMinutes, 0);
}
async function getTimeClockStatus(userId) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			role: true,
			employeeNumber: true,
			hourlyRateCents: true,
			overtimeRateCents: true,
			vacationPayPct: true,
			bench: true
		}
	});
	if (!user) throw new HttpError(404, "User not found");
	const activeShift = await prisma.shift.findFirst({
		where: {
			userId,
			status: { in: ["ACTIVE", "ON_BREAK"] }
		},
		include: { breaks: { orderBy: { startTime: "desc" } } },
		orderBy: { clockIn: "desc" }
	});
	const activeBreak = activeShift?.breaks.find((b) => b.endTime === null) || null;
	const now = /* @__PURE__ */ new Date();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const todayShifts = await prisma.shift.findMany({
		where: {
			userId,
			clockIn: { gte: todayStart }
		},
		include: { breaks: { where: { endTime: null } } }
	});
	let todayMinutes = 0;
	for (const s of todayShifts) if (s.status === "COMPLETED") todayMinutes += s.totalMinutes;
	else {
		const elapsed = Math.round((now.getTime() - s.clockIn.getTime()) / 6e4);
		const openUnpaid = getOpenUnpaidBreakMinutes(s.breaks, now);
		todayMinutes += Math.max(0, elapsed - s.breakMinutes - openUnpaid);
	}
	const dayOfWeek = (now.getDay() + 6) % 7;
	const weekStart = /* @__PURE__ */ new Date(todayStart.getTime() - dayOfWeek * 864e5);
	const weekShifts = await prisma.shift.findMany({
		where: {
			userId,
			clockIn: { gte: weekStart }
		},
		include: { breaks: { where: { endTime: null } } }
	});
	let weekMinutes = 0;
	for (const s of weekShifts) if (s.status === "COMPLETED") weekMinutes += s.totalMinutes;
	else {
		const elapsed = Math.round((now.getTime() - s.clockIn.getTime()) / 6e4);
		const openUnpaid = getOpenUnpaidBreakMinutes(s.breaks, now);
		weekMinutes += Math.max(0, elapsed - s.breakMinutes - openUnpaid);
	}
	const activeOpenUnpaid = activeShift ? getOpenUnpaidBreakMinutes(activeShift.breaks, now) : 0;
	const liveElapsedSeconds = activeShift ? Math.max(0, Math.floor((now.getTime() - activeShift.clockIn.getTime()) / 1e3) - (activeShift.breakMinutes + activeOpenUnpaid) * 60) : 0;
	return {
		user,
		isClockedIn: Boolean(activeShift),
		clockedIn: Boolean(activeShift),
		isOnBreak: activeShift?.status === "ON_BREAK",
		onBreak: activeShift?.status === "ON_BREAK",
		liveElapsedSeconds,
		activeShift: activeShift ? {
			id: activeShift.id,
			clockIn: activeShift.clockIn,
			status: activeShift.status,
			breakMinutes: activeShift.breakMinutes + activeOpenUnpaid,
			activeDurationSeconds: liveElapsedSeconds,
			activeDurationMinutes: Math.max(0, Math.round((now.getTime() - activeShift.clockIn.getTime()) / 6e4) - activeShift.breakMinutes - activeOpenUnpaid),
			activeBreak
		} : null,
		todayMinutes,
		todayHours: Number((todayMinutes / 60).toFixed(2)),
		weekMinutes,
		weekHours: Number((weekMinutes / 60).toFixed(2)),
		weeklyHours: Number((weekMinutes / 60).toFixed(2)),
		hourlyRateCents: user.hourlyRateCents,
		isApproachingOvertime: weekMinutes / 60 >= 40,
		isOvertime: weekMinutes / 60 > CRA_2026.ONTARIO_OVERTIME_WEEKLY_HOURS
	};
}
async function clockIn(userId, notes) {
	const existing = await prisma.shift.findFirst({ where: {
		userId,
		status: { in: ["ACTIVE", "ON_BREAK"] }
	} });
	if (existing) throw new HttpError(409, `You are already clocked in to a shift started at ${existing.clockIn.toLocaleTimeString()}`, { activeShift: existing });
	const shift = await prisma.shift.create({
		data: {
			userId,
			clockIn: /* @__PURE__ */ new Date(),
			status: "ACTIVE",
			notes: notes?.trim() || null
		},
		include: { user: { select: {
			name: true,
			employeeNumber: true
		} } }
	});
	await recordAudit({
		userId,
		actorName: shift.user.name,
		action: "CLOCK_IN",
		details: `Employee ${shift.user.name} clocked in at ${shift.clockIn.toISOString()}`
	});
	return shift;
}
async function clockOut(userId, notes, shiftData) {
	let shift = await prisma.shift.findFirst({
		where: {
			userId,
			status: { in: ["ACTIVE", "ON_BREAK"] }
		},
		include: {
			breaks: true,
			user: { select: { name: true } }
		}
	});
	if (!shift && shiftData?.id) {
		const existingById = await prisma.shift.findUnique({
			where: { id: shiftData.id },
			include: {
				breaks: true,
				user: { select: { name: true } }
			}
		});
		if (existingById) {
			if (existingById.status === "COMPLETED") return existingById;
			shift = existingById;
		}
	}
	if (!shift && shiftData?.clockIn) {
		if (await prisma.user.findUnique({
			where: { id: userId },
			select: { name: true }
		})) try {
			if (shiftData.id && !shiftData.id.startsWith("local-") && !shiftData.id.startsWith("shift_")) shift = await prisma.shift.upsert({
				where: { id: shiftData.id },
				update: {},
				create: {
					id: shiftData.id,
					userId,
					clockIn: new Date(shiftData.clockIn),
					status: "ACTIVE",
					breakMinutes: shiftData.breakMinutes || 0,
					notes: notes?.trim() || null
				},
				include: {
					breaks: true,
					user: { select: { name: true } }
				}
			});
			else shift = await prisma.shift.create({
				data: {
					userId,
					clockIn: new Date(shiftData.clockIn),
					status: "ACTIVE",
					breakMinutes: shiftData.breakMinutes || 0,
					notes: notes?.trim() || null
				},
				include: {
					breaks: true,
					user: { select: { name: true } }
				}
			});
		} catch {
			if (shiftData.id) shift = await prisma.shift.findUnique({
				where: { id: shiftData.id },
				include: {
					breaks: true,
					user: { select: { name: true } }
				}
			});
		}
	}
	if (!shift) throw new HttpError(400, "No active shift found. You must clock in before clocking out.");
	if (shift.status === "COMPLETED") return shift;
	const clockOutTime = /* @__PURE__ */ new Date();
	if (shift.status === "ON_BREAK") {
		const openBreak = shift.breaks.find((b) => b.endTime === null);
		if (openBreak) {
			const dur = Math.max(1, Math.round((clockOutTime.getTime() - openBreak.startTime.getTime()) / 6e4));
			await prisma.shiftBreak.update({
				where: { id: openBreak.id },
				data: {
					endTime: clockOutTime,
					durationMinutes: dur
				}
			});
			if (openBreak.type !== "PAID_REST") shift.breakMinutes += dur;
		}
	}
	const grossSeconds = Math.max(0, Math.floor((clockOutTime.getTime() - shift.clockIn.getTime()) / 1e3));
	const unpaidBreakSeconds = (shift.breakMinutes || 0) * 60;
	const netSeconds = Math.max(0, grossSeconds - unpaidBreakSeconds);
	const totalMinutes = netSeconds > 0 ? Math.max(1, Math.round(netSeconds / 60)) : 0;
	const { regularMinutes, overtimeMinutes } = calculateShiftHours(totalMinutes, await getPriorWeeklyCompletedMinutes(userId, shift.clockIn, shift.id));
	const updated = await prisma.shift.update({
		where: { id: shift.id },
		data: {
			clockOut: clockOutTime,
			status: "COMPLETED",
			breakMinutes: shift.breakMinutes,
			totalMinutes,
			regularMinutes,
			overtimeMinutes,
			notes: notes?.trim() || shift.notes
		}
	});
	const pad = (n) => String(n).padStart(2, "0");
	const exactDuration = `${pad(Math.floor(netSeconds / 3600))}:${pad(Math.floor(netSeconds % 3600 / 60))}:${pad(netSeconds % 60)}`;
	const hoursDecimal = (netSeconds / 3600).toFixed(2);
	await recordAudit({
		userId,
		actorName: shift.user.name,
		action: "CLOCK_OUT",
		details: `Employee ${shift.user.name} clocked out. Duration: ${exactDuration} (${hoursDecimal}h, Regular: ${(regularMinutes / 60).toFixed(2)}h, Overtime: ${(overtimeMinutes / 60).toFixed(2)}h)`
	});
	if (overtimeMinutes > 0) await notifyAdmins({
		type: "OVERTIME_ALERT",
		title: "Overtime Worked",
		message: `${shift.user.name} clocked out with ${(overtimeMinutes / 60).toFixed(2)}h overtime today.`,
		linkTab: "admin:attendance",
		excludeUserId: userId
	});
	return updated;
}
async function startBreak(userId, type = "UNPAID_MEAL") {
	const shift = await prisma.shift.findFirst({
		where: {
			userId,
			status: "ACTIVE"
		},
		include: { user: { select: { name: true } } }
	});
	if (!shift) throw new HttpError(400, "You must have an active shift to start a break.");
	const brk = await prisma.shiftBreak.create({ data: {
		shiftId: shift.id,
		startTime: /* @__PURE__ */ new Date(),
		type
	} });
	await prisma.shift.update({
		where: { id: shift.id },
		data: { status: "ON_BREAK" }
	});
	await recordAudit({
		userId,
		actorName: shift.user.name,
		action: "BREAK_START",
		details: `Employee ${shift.user.name} started ${type.toLowerCase().replace("_", " ")} break`
	});
	return brk;
}
async function endBreak(userId) {
	const shift = await prisma.shift.findFirst({
		where: {
			userId,
			status: "ON_BREAK"
		},
		include: {
			breaks: {
				where: { endTime: null },
				orderBy: { startTime: "desc" }
			},
			user: { select: { name: true } }
		}
	});
	if (!shift || !shift.breaks.length) throw new HttpError(400, "No active break found to end.");
	const now = /* @__PURE__ */ new Date();
	const openBreak = shift.breaks[0];
	const durationMinutes = Math.max(1, Math.round((now.getTime() - openBreak.startTime.getTime()) / 6e4));
	await prisma.shiftBreak.update({
		where: { id: openBreak.id },
		data: {
			endTime: now,
			durationMinutes
		}
	});
	const isPaidBreak = openBreak.type === "PAID_REST";
	const updatedShift = await prisma.shift.update({
		where: { id: shift.id },
		data: {
			status: "ACTIVE",
			...isPaidBreak ? {} : { breakMinutes: { increment: durationMinutes } }
		}
	});
	await recordAudit({
		userId,
		actorName: shift.user.name,
		action: "BREAK_END",
		details: `Employee ${shift.user.name} ended ${isPaidBreak ? "paid rest " : "unpaid meal "}break after ${durationMinutes} minutes`
	});
	return updatedShift;
}
async function getMyShifts(userId, options) {
	const where = { userId };
	if (options.startDate || options.endDate) {
		where.clockIn = {};
		if (options.startDate) where.clockIn.gte = new Date(options.startDate);
		if (options.endDate) where.clockIn.lte = new Date(options.endDate);
	}
	return (await prisma.shift.findMany({
		where,
		include: { breaks: { orderBy: { startTime: "asc" } } },
		orderBy: { clockIn: "desc" },
		take: options.limit || 50
	})).map((s) => {
		const startMs = new Date(s.clockIn).getTime();
		const endMs = s.clockOut ? new Date(s.clockOut).getTime() : Date.now();
		const unpaidSec = (s.breakMinutes || 0) * 60;
		const workedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1e3) - unpaidSec);
		const hrs = Math.floor(workedSeconds / 3600);
		const mins = Math.floor(workedSeconds % 3600 / 60);
		const secs = workedSeconds % 60;
		const pad = (n) => String(n).padStart(2, "0");
		return {
			...s,
			totalSeconds: workedSeconds,
			durationFormatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
			totalHours: Number((workedSeconds / 3600).toFixed(2)),
			regularHours: Number((s.regularMinutes / 60).toFixed(2)),
			overtimeHours: Number((s.overtimeMinutes / 60).toFixed(2)),
			breakHours: Number((s.breakMinutes / 60).toFixed(2))
		};
	});
}
async function getMyPaystubs(userId) {
	return await prisma.paystub.findMany({
		where: { userId },
		include: { payrollPeriod: true },
		orderBy: { createdAt: "desc" }
	});
}
async function getMyPaystub(userId, paystubId, isAdmin = false) {
	const paystub = await prisma.paystub.findUnique({
		where: { id: paystubId },
		include: {
			payrollPeriod: true,
			user: { select: {
				id: true,
				name: true,
				email: true,
				employeeNumber: true,
				hourlyRateCents: true,
				sin: true
			} }
		}
	});
	if (!paystub) throw new HttpError(404, "Paystub not found");
	if (!isAdmin && paystub.userId !== userId) throw new HttpError(403, "Unauthorized access to confidential paystub");
	const rawSin = paystub.user?.sin ? paystub.user.sin.replace(/\D/g, "") : "";
	const maskedSin = rawSin.length >= 3 ? `***-***-${rawSin.slice(-3)}` : null;
	return {
		...paystub,
		user: paystub.user ? {
			...paystub.user,
			sin: maskedSin
		} : paystub.user
	};
}
async function getAttendanceOverview(filters) {
	const where = {};
	if (filters.userId && filters.userId !== "ALL") where.userId = filters.userId;
	if (filters.status && filters.status !== "ALL") {
		if (filters.status === "MODIFIED") where.editedByAdminId = { not: null };
		else where.status = filters.status;
	}
	if (filters.startDate || filters.endDate) {
		where.clockIn = {};
		if (filters.startDate) where.clockIn.gte = new Date(filters.startDate);
		if (filters.endDate) where.clockIn.lte = new Date(filters.endDate);
	}
	const [shifts, users, currentlyClockedInCount] = await Promise.all([
		prisma.shift.findMany({
			where,
			include: {
				user: { select: {
					id: true,
					name: true,
					employeeNumber: true,
					role: true,
					bench: true
				} },
				breaks: { orderBy: { startTime: "asc" } }
			},
			orderBy: { clockIn: "desc" }
		}),
		prisma.user.findMany({
			where: { status: "ACTIVE" },
			select: {
				id: true,
				name: true,
				employeeNumber: true,
				role: true,
				hourlyRateCents: true
			},
			orderBy: { name: "asc" }
		}),
		prisma.shift.count({ where: { status: { in: ["ACTIVE", "ON_BREAK"] } } })
	]);
	const totalMinutes = shifts.reduce((acc, s) => acc + s.totalMinutes, 0);
	const regularMinutes = shifts.reduce((acc, s) => acc + s.regularMinutes, 0);
	const overtimeMinutes = shifts.reduce((acc, s) => acc + s.overtimeMinutes, 0);
	return {
		shifts: shifts.map((s) => {
			const startMs = new Date(s.clockIn).getTime();
			const endMs = s.clockOut ? new Date(s.clockOut).getTime() : Date.now();
			const unpaidSec = (s.breakMinutes || 0) * 60;
			const workedSeconds = Math.max(0, Math.floor((endMs - startMs) / 1e3) - unpaidSec);
			const hrs = Math.floor(workedSeconds / 3600);
			const mins = Math.floor(workedSeconds % 3600 / 60);
			const secs = workedSeconds % 60;
			const pad = (n) => String(n).padStart(2, "0");
			return {
				...s,
				totalSeconds: workedSeconds,
				durationFormatted: `${pad(hrs)}:${pad(mins)}:${pad(secs)}`,
				totalHours: Number((workedSeconds / 3600).toFixed(2)),
				regularHours: Number((s.regularMinutes / 60).toFixed(2)),
				overtimeHours: Number((s.overtimeMinutes / 60).toFixed(2)),
				breakHours: Number((s.breakMinutes / 60).toFixed(2))
			};
		}),
		users,
		metrics: {
			totalShifts: shifts.length,
			currentlyClockedIn: currentlyClockedInCount,
			totalHours: Number((totalMinutes / 60).toFixed(2)),
			regularHours: Number((regularMinutes / 60).toFixed(2)),
			overtimeHours: Number((overtimeMinutes / 60).toFixed(2))
		}
	};
}
async function getLiveRoster() {
	const now = /* @__PURE__ */ new Date();
	const [activeUsers, activeShifts] = await Promise.all([prisma.user.findMany({
		where: { status: "ACTIVE" },
		select: {
			id: true,
			name: true,
			employeeNumber: true,
			role: true,
			bench: true
		},
		orderBy: { name: "asc" }
	}), prisma.shift.findMany({
		where: { status: { in: ["ACTIVE", "ON_BREAK"] } },
		include: {
			user: { select: {
				id: true,
				name: true,
				employeeNumber: true,
				role: true,
				bench: true
			} },
			breaks: { where: { endTime: null } }
		},
		orderBy: { clockIn: "asc" }
	})]);
	const shiftByUserId = /* @__PURE__ */ new Map();
	for (const s of activeShifts) if (!shiftByUserId.has(s.userId)) shiftByUserId.set(s.userId, s);
	return activeUsers.map((u) => {
		const s = shiftByUserId.get(u.id);
		if (s) {
			const elapsedMinutes = Math.max(0, Math.round((now.getTime() - s.clockIn.getTime()) / 6e4));
			const openUnpaid = getOpenUnpaidBreakMinutes(s.breaks, now);
			const activeWorkedMinutes = Math.max(0, elapsedMinutes - s.breakMinutes - openUnpaid);
			return {
				id: u.id,
				name: u.name,
				employeeNumber: u.employeeNumber,
				role: u.role,
				bench: u.bench,
				isClockedIn: true,
				isOnBreak: s.status === "ON_BREAK",
				shiftId: s.id,
				user: s.user,
				clockIn: s.clockIn,
				status: s.status,
				activeBreak: s.breaks[0] || null,
				breakMinutes: s.breakMinutes + openUnpaid,
				activeWorkedMinutes,
				activeWorkedHours: Number((activeWorkedMinutes / 60).toFixed(2))
			};
		}
		return {
			id: u.id,
			name: u.name,
			employeeNumber: u.employeeNumber,
			role: u.role,
			bench: u.bench,
			isClockedIn: false,
			isOnBreak: false,
			shiftId: null,
			user: u,
			clockIn: null,
			status: "CLOCKED_OUT",
			activeBreak: null,
			breakMinutes: 0,
			activeWorkedMinutes: 0,
			activeWorkedHours: 0
		};
	}).sort((a, b) => Number(b.isClockedIn) - Number(a.isClockedIn));
}
async function manualAddShift(data, adminUser) {
	if (!data.reason?.trim()) throw new HttpError(400, "A modification reason is required for manual shift addition.");
	const start = new Date(data.clockIn);
	const end = new Date(data.clockOut);
	if (end <= start) throw new HttpError(400, "Clock out time must be later than clock in time.");
	const breakMins = Math.max(0, data.breakMinutes || 0);
	const grossMins = Math.round((end.getTime() - start.getTime()) / 6e4);
	const totalMinutes = Math.max(0, grossMins - breakMins);
	const { regularMinutes, overtimeMinutes } = calculateShiftHours(totalMinutes, await getPriorWeeklyCompletedMinutes(data.userId, start));
	const shift = await prisma.shift.create({
		data: {
			userId: data.userId,
			clockIn: start,
			clockOut: end,
			status: "COMPLETED",
			breakMinutes: breakMins,
			totalMinutes,
			regularMinutes,
			overtimeMinutes,
			notes: data.notes?.trim() || null,
			editedByAdminId: adminUser.id,
			editedAt: /* @__PURE__ */ new Date(),
			editReason: `Manual Shift Addition: ${data.reason.trim()}`,
			originalClockIn: start,
			originalClockOut: end
		},
		include: { user: { select: { name: true } } }
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_MANUAL_ADD",
		details: `Admin ${adminUser.name} manually added shift for ${shift.user.name} (${(totalMinutes / 60).toFixed(2)}h). Reason: ${data.reason.trim()}`
	});
	return shift;
}
async function manualEditShift(shiftId, data, adminUser) {
	if (!data.reason?.trim()) throw new HttpError(400, "A modification reason is required to edit attendance records.");
	const existing = await prisma.shift.findUnique({
		where: { id: shiftId },
		include: { user: { select: { name: true } } }
	});
	if (!existing) throw new HttpError(404, "Shift not found");
	const newClockIn = new Date(data.clockIn);
	const newClockOut = data.clockOut ? new Date(data.clockOut) : existing.clockOut;
	let totalMinutes = existing.totalMinutes;
	let regularMinutes = existing.regularMinutes;
	let overtimeMinutes = existing.overtimeMinutes;
	const breakMinutes = data.breakMinutes !== void 0 ? Math.max(0, data.breakMinutes) : existing.breakMinutes;
	if (newClockOut) {
		if (newClockOut <= newClockIn) throw new HttpError(400, "Clock out time must be later than clock in time.");
		const grossMins = Math.round((newClockOut.getTime() - newClockIn.getTime()) / 6e4);
		totalMinutes = Math.max(0, grossMins - breakMinutes);
		const priorWeekMinutes = await getPriorWeeklyCompletedMinutes(existing.userId, newClockIn, shiftId);
		const split = calculateShiftHours(totalMinutes, priorWeekMinutes);
		regularMinutes = split.regularMinutes;
		overtimeMinutes = split.overtimeMinutes;
	}
	const updated = await prisma.shift.update({
		where: { id: shiftId },
		data: {
			clockIn: newClockIn,
			clockOut: newClockOut,
			breakMinutes,
			totalMinutes,
			regularMinutes,
			overtimeMinutes,
			notes: data.notes !== void 0 ? data.notes : existing.notes,
			editedByAdminId: adminUser.id,
			editedAt: /* @__PURE__ */ new Date(),
			editReason: data.reason.trim(),
			originalClockIn: existing.originalClockIn || existing.clockIn,
			originalClockOut: existing.originalClockOut || existing.clockOut
		}
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_MODIFIED",
		details: `Admin ${adminUser.name} edited shift for ${existing.user.name}. Reason: ${data.reason.trim()}`
	});
	return updated;
}
async function deleteShift(shiftId, adminUser, reason) {
	const existing = await prisma.shift.findUnique({
		where: { id: shiftId },
		include: { user: { select: { name: true } } }
	});
	if (!existing) throw new HttpError(404, "Shift not found");
	await prisma.shift.delete({ where: { id: shiftId } });
	const reasonSuffix = reason?.trim() ? ` Reason: ${reason.trim()}` : "";
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_DELETED",
		details: `Admin ${adminUser.name} deleted shift #${shiftId} for ${existing.user.name}.${reasonSuffix}`
	});
	return { success: true };
}
async function exportAttendanceCsv(filters) {
	const where = {};
	if (filters.userId && filters.userId !== "ALL") where.userId = filters.userId;
	if (filters.startDate || filters.endDate) {
		where.clockIn = {};
		if (filters.startDate) where.clockIn.gte = new Date(filters.startDate);
		if (filters.endDate) where.clockIn.lte = new Date(filters.endDate);
	}
	const shifts = await prisma.shift.findMany({
		where,
		include: { user: true },
		orderBy: { clockIn: "desc" }
	});
	const rows = [[
		"Shift ID",
		"Employee Name",
		"Employee Number",
		"Clock In",
		"Clock Out",
		"Status",
		"Break (Minutes)",
		"Total Hours",
		"Regular Hours",
		"Overtime Hours",
		"Edited By Admin",
		"Edit Reason",
		"Original Clock In",
		"Original Clock Out"
	]];
	for (const s of shifts) rows.push([
		s.id,
		s.user.name,
		s.user.employeeNumber || "",
		s.clockIn.toISOString(),
		s.clockOut ? s.clockOut.toISOString() : "Active Shift",
		s.status,
		String(s.breakMinutes),
		(s.totalMinutes / 60).toFixed(2),
		(s.regularMinutes / 60).toFixed(2),
		(s.overtimeMinutes / 60).toFixed(2),
		s.editedByAdminId ? "Yes" : "No",
		s.editReason || "",
		s.originalClockIn ? s.originalClockIn.toISOString() : "",
		s.originalClockOut ? s.originalClockOut.toISOString() : ""
	]);
	return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
async function getUserWageHistory(userId) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			name: true,
			employeeNumber: true,
			hourlyRateCents: true,
			overtimeRateCents: true,
			vacationPayPct: true,
			td1FederalClaimCents: true,
			td1OntarioClaimCents: true
		}
	});
	if (!user) throw new HttpError(404, "User not found");
	return {
		user,
		history: await prisma.wageRate.findMany({
			where: { userId },
			orderBy: { effectiveDate: "desc" }
		})
	};
}
async function updateUserWage(userId, data, adminUser) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new HttpError(404, "User not found");
	const hourly = Math.max(0, data.hourlyRateCents);
	const overtime = data.overtimeRateCents && data.overtimeRateCents > 0 ? data.overtimeRateCents : Math.round(hourly * 1.5);
	const effective = data.effectiveDate ? new Date(data.effectiveDate) : /* @__PURE__ */ new Date();
	const wageRecord = await prisma.wageRate.create({ data: {
		userId,
		hourlyRateCents: hourly,
		overtimeRateCents: overtime,
		effectiveDate: effective,
		reason: data.reason?.trim() || "Wage update",
		createdById: adminUser.id
	} });
	const shouldActivateNow = effective.getTime() <= Date.now() + 6e4;
	const userUpdateData = {};
	if (shouldActivateNow) {
		userUpdateData.hourlyRateCents = hourly;
		userUpdateData.overtimeRateCents = overtime;
	}
	if (data.vacationPayPct !== void 0) userUpdateData.vacationPayPct = data.vacationPayPct;
	const updatedUser = Object.keys(userUpdateData).length ? await prisma.user.update({
		where: { id: userId },
		data: userUpdateData
	}) : user;
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "WAGE_UPDATE",
		details: `Admin ${adminUser.name} updated wage for ${user.name} to $${(hourly / 100).toFixed(2)}/hr (effective ${effective.toISOString().slice(0, 10)}). Reason: ${data.reason || "Not specified"}`
	});
	return {
		wageRecord,
		user: updatedUser
	};
}
async function getPayrollDashboardOverview() {
	const now = /* @__PURE__ */ new Date();
	const dayOfWeek = (now.getDay() + 6) % 7;
	const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const weekStart = /* @__PURE__ */ new Date(startOfDay.getTime() - dayOfWeek * 864e5);
	const [shiftsThisWeek, clockedInCount, periods, recentPaystubs, activeEmployees] = await Promise.all([
		prisma.shift.findMany({
			where: { clockIn: { gte: weekStart } },
			include: { user: true }
		}),
		prisma.shift.count({ where: { status: { in: ["ACTIVE", "ON_BREAK"] } } }),
		prisma.payrollPeriod.findMany({
			orderBy: { startDate: "desc" },
			take: 6
		}),
		prisma.paystub.findMany({
			include: {
				user: { select: {
					name: true,
					employeeNumber: true
				} },
				payrollPeriod: true
			},
			orderBy: { createdAt: "desc" },
			take: 8
		}),
		prisma.user.findMany({
			where: { status: "ACTIVE" },
			select: {
				id: true,
				name: true,
				hourlyRateCents: true,
				overtimeRateCents: true
			}
		})
	]);
	const totalMinutes = shiftsThisWeek.reduce((s, x) => s + x.totalMinutes, 0);
	const regularMinutes = shiftsThisWeek.reduce((s, x) => s + x.regularMinutes, 0);
	const overtimeMinutes = shiftsThisWeek.reduce((s, x) => s + x.overtimeMinutes, 0);
	let estimatedGrossCents = 0;
	for (const s of shiftsThisWeek) {
		const rate = s.user.hourlyRateCents || 2200;
		const otRate = s.user.overtimeRateCents || Math.round(rate * 1.5);
		const vacBps = s.user.vacationPayPct ?? 400;
		const base = Math.round(s.regularMinutes / 60 * rate) + Math.round(s.overtimeMinutes / 60 * otRate);
		const vac = Math.round(base * vacBps / 1e4);
		estimatedGrossCents += base + vac;
	}
	const estimatedDeductionsCents = Math.round(estimatedGrossCents * .2395);
	const estimatedNetCents = Math.max(0, estimatedGrossCents - estimatedDeductionsCents);
	const regularHoursThisWeek = Number((regularMinutes / 60).toFixed(2));
	const overtimeHoursThisWeek = Number((overtimeMinutes / 60).toFixed(2));
	const totalHoursThisWeek = Number((totalMinutes / 60).toFixed(2));
	return {
		metrics: {
			totalHoursThisWeek,
			regularHoursThisWeek,
			overtimeHoursThisWeek,
			estimatedGrossCents,
			estimatedDeductionsCents,
			estimatedNetCents,
			clockedInCount,
			activeEmployeeCount: activeEmployees.length
		},
		kpis: {
			totalHours: totalHoursThisWeek,
			totalRegularHours: regularHoursThisWeek,
			totalOvertimeHours: overtimeHoursThisWeek,
			estimatedGrossPayrollCents: estimatedGrossCents,
			estimatedDeductionsCents,
			estimatedNetPayrollCents: estimatedNetCents,
			clockedInCount,
			activeEmployeeCount: activeEmployees.length
		},
		recentPeriods: periods,
		recentPaystubs
	};
}
async function calculatePeriodPayroll(options) {
	const start = new Date(options.startDate);
	const end = new Date(options.endDate);
	start.setHours(0, 0, 0, 0);
	end.setHours(23, 59, 59, 999);
	const employees = await prisma.user.findMany({
		where: { status: "ACTIVE" },
		include: { wageRates: { orderBy: { effectiveDate: "desc" } } },
		orderBy: { name: "asc" }
	});
	const shifts = await prisma.shift.findMany({ where: {
		clockIn: {
			gte: start,
			lte: end
		},
		status: "COMPLETED"
	} });
	const daysInPeriod = Math.max(1, Math.round((end.getTime() - start.getTime()) / 864e5));
	const employeePaystubs = [];
	for (const emp of employees) {
		const empShifts = shifts.filter((s) => s.userId === emp.id);
		const regMinutes = empShifts.reduce((s, x) => s + x.regularMinutes, 0);
		const otMinutes = empShifts.reduce((s, x) => s + x.overtimeMinutes, 0);
		const regularHours = Number((regMinutes / 60).toFixed(2));
		const overtimeHours = Number((otMinutes / 60).toFixed(2));
		const effectiveWage = emp.wageRates.find((w) => w.effectiveDate <= end) || null;
		const hourlyRateCents = effectiveWage ? effectiveWage.hourlyRateCents : emp.hourlyRateCents;
		const overtimeRateCents = effectiveWage ? effectiveWage.overtimeRateCents : emp.overtimeRateCents || Math.round(hourlyRateCents * 1.5);
		const calc = calculatePayroll({
			regularHours,
			overtimeHours,
			periodType: options.periodType,
			daysInPeriod,
			employee: {
				hourlyRateCents,
				overtimeRateCents,
				vacationPayPct: emp.vacationPayPct,
				td1FederalClaimCents: emp.td1FederalClaimCents,
				td1OntarioClaimCents: emp.td1OntarioClaimCents
			}
		});
		const userInfo = {
			id: emp.id,
			name: emp.name,
			employeeNumber: emp.employeeNumber,
			email: emp.email,
			role: emp.role
		};
		employeePaystubs.push({
			userId: emp.id,
			user: userInfo,
			employee: userInfo,
			...calc
		});
	}
	const totalGrossCents = employeePaystubs.reduce((s, p) => s + p.grossPayCents, 0);
	const totalDeductionsCents = employeePaystubs.reduce((s, p) => s + p.totalDeductionsCents, 0);
	const totalNetCents = employeePaystubs.reduce((s, p) => s + p.netPayCents, 0);
	const totalHours = employeePaystubs.reduce((s, p) => s + p.regularHours + p.overtimeHours, 0);
	const periodPayDate = options.payDate || new Date(end.getTime() + 432e6).toISOString();
	return {
		periodType: options.periodType,
		startDate: start.toISOString(),
		endDate: end.toISOString(),
		payDate: periodPayDate,
		period: {
			startDate: start.toISOString(),
			endDate: end.toISOString(),
			payDate: periodPayDate,
			periodType: options.periodType
		},
		daysInPeriod,
		employeePaystubs,
		paystubs: employeePaystubs,
		summary: {
			totalEmployees: employeePaystubs.length,
			totalHours: Number(totalHours.toFixed(2)),
			totalGrossCents,
			totalDeductionsCents,
			totalNetCents
		}
	};
}
async function createPayrollPeriod(data, adminUser) {
	const start = new Date(data.startDate);
	const end = new Date(data.endDate);
	const pay = new Date(data.payDate);
	const periodNumber = ((await prisma.payrollPeriod.findFirst({
		orderBy: { periodNumber: "desc" },
		select: { periodNumber: true }
	}))?.periodNumber || 0) + 1;
	const seenUserIds = /* @__PURE__ */ new Set();
	const uniquePaystubs = [];
	for (const p of data.paystubs || []) if (p.userId && !seenUserIds.has(p.userId)) {
		seenUserIds.add(p.userId);
		uniquePaystubs.push(p);
	}
	const totalGrossCents = uniquePaystubs.reduce((s, p) => s + (p.grossPayCents || 0), 0);
	const totalDeductionsCents = uniquePaystubs.reduce((s, p) => s + (p.totalDeductionsCents || 0), 0);
	const totalNetCents = uniquePaystubs.reduce((s, p) => s + (p.netPayCents || 0), 0);
	const period = await prisma.$transaction(async (tx) => {
		const createdPeriod = await tx.payrollPeriod.create({ data: {
			periodNumber,
			periodType: data.periodType || "BI_WEEKLY",
			startDate: start,
			endDate: end,
			payDate: pay,
			status: "DRAFT",
			totalGrossCents,
			totalDeductionsCents,
			totalNetCents,
			notes: data.notes?.trim() || null
		} });
		for (const p of uniquePaystubs) await tx.paystub.create({ data: {
			payrollPeriodId: createdPeriod.id,
			userId: p.userId,
			regularHours: p.regularHours || 0,
			overtimeHours: p.overtimeHours || 0,
			hourlyRateCents: p.hourlyRateCents || 2200,
			overtimeRateCents: p.overtimeRateCents || Math.round((p.hourlyRateCents || 2200) * 1.5),
			regularPayCents: p.regularPayCents || 0,
			overtimePayCents: p.overtimePayCents || 0,
			bonusCents: p.bonusCents || 0,
			vacationPayCents: p.vacationPayCents || 0,
			grossPayCents: p.grossPayCents || 0,
			cppCents: p.cppCents || 0,
			eiCents: p.eiCents || 0,
			incomeTaxCents: p.incomeTaxCents || 0,
			otherDeductionsCents: p.otherDeductionsCents || 0,
			totalDeductionsCents: p.totalDeductionsCents || 0,
			netPayCents: p.netPayCents || 0,
			status: "DRAFT",
			notes: p.notes?.trim() || null
		} });
		return createdPeriod;
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "PAYROLL_PERIOD_CREATED",
		details: `Admin ${adminUser.name} created Payroll Period #${period.periodNumber} (${start.toISOString().slice(0, 10)} to ${end.toISOString().slice(0, 10)}) with ${data.paystubs.length} paystubs`
	});
	return getPayrollPeriod(period.id);
}
async function listPayrollPeriods(limit = 50) {
	return prisma.payrollPeriod.findMany({
		orderBy: { startDate: "desc" },
		take: limit,
		include: { _count: { select: { paystubs: true } } }
	});
}
async function getPayrollPeriod(periodId) {
	const period = await prisma.payrollPeriod.findUnique({
		where: { id: periodId },
		include: { paystubs: {
			include: { user: { select: {
				id: true,
				name: true,
				employeeNumber: true,
				email: true,
				role: true,
				bench: true
			} } },
			orderBy: { user: { name: "asc" } }
		} }
	});
	if (!period) throw new HttpError(404, "Payroll period not found");
	return period;
}
async function updatePaystubDraft(paystubId, data, adminUser) {
	const paystub = await prisma.paystub.findUnique({
		where: { id: paystubId },
		include: {
			payrollPeriod: true,
			user: true
		}
	});
	if (!paystub) throw new HttpError(404, "Paystub not found");
	if (paystub.payrollPeriod.status === "FINALIZED") throw new HttpError(403, "This payroll period has been FINALIZED and locked. Adjustments must be made via a supplementary adjustment.");
	const calc = calculatePayroll({
		regularHours: data.regularHours !== void 0 ? Math.max(0, data.regularHours) : paystub.regularHours,
		overtimeHours: data.overtimeHours !== void 0 ? Math.max(0, data.overtimeHours) : paystub.overtimeHours,
		bonusCents: data.bonusCents !== void 0 ? Math.max(0, data.bonusCents) : paystub.bonusCents,
		otherDeductionsCents: data.otherDeductionsCents !== void 0 ? Math.max(0, data.otherDeductionsCents) : paystub.otherDeductionsCents,
		periodType: paystub.payrollPeriod.periodType,
		employee: {
			hourlyRateCents: paystub.hourlyRateCents,
			overtimeRateCents: paystub.overtimeRateCents,
			vacationPayPct: paystub.user.vacationPayPct,
			td1FederalClaimCents: paystub.user.td1FederalClaimCents,
			td1OntarioClaimCents: paystub.user.td1OntarioClaimCents
		}
	});
	const updatedPaystub = await prisma.$transaction(async (tx) => {
		const updated = await tx.paystub.update({
			where: { id: paystubId },
			data: {
				regularHours: calc.regularHours,
				overtimeHours: calc.overtimeHours,
				regularPayCents: calc.regularPayCents,
				overtimePayCents: calc.overtimePayCents,
				bonusCents: calc.bonusCents,
				vacationPayCents: calc.vacationPayCents,
				grossPayCents: calc.grossPayCents,
				cppCents: calc.cppCents,
				eiCents: calc.eiCents,
				incomeTaxCents: calc.incomeTaxCents,
				otherDeductionsCents: calc.otherDeductionsCents,
				totalDeductionsCents: calc.totalDeductionsCents,
				netPayCents: calc.netPayCents,
				notes: data.notes !== void 0 ? data.notes : paystub.notes
			}
		});
		const allPaystubs = await tx.paystub.findMany({ where: { payrollPeriodId: paystub.payrollPeriodId } });
		const totalGrossCents = allPaystubs.reduce((s, p) => s + p.grossPayCents, 0);
		const totalDeductionsCents = allPaystubs.reduce((s, p) => s + p.totalDeductionsCents, 0);
		const totalNetCents = allPaystubs.reduce((s, p) => s + p.netPayCents, 0);
		await tx.payrollPeriod.update({
			where: { id: paystub.payrollPeriodId },
			data: {
				totalGrossCents,
				totalDeductionsCents,
				totalNetCents
			}
		});
		return updated;
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "PAYSTUB_MODIFIED",
		details: `Admin ${adminUser.name} updated paystub #${paystubId} for ${paystub.user.name} (Gross: $${(calc.grossPayCents / 100).toFixed(2)}, Net: $${(calc.netPayCents / 100).toFixed(2)})`
	});
	return updatedPaystub;
}
async function finalizePayrollPeriod(periodId, adminUser) {
	const period = await prisma.payrollPeriod.findUnique({
		where: { id: periodId },
		include: { paystubs: true }
	});
	if (!period) throw new HttpError(404, "Payroll period not found");
	if (period.status === "FINALIZED") throw new HttpError(400, "This payroll period is already finalized and locked.");
	const now = /* @__PURE__ */ new Date();
	await prisma.$transaction(async (tx) => {
		await tx.payrollPeriod.update({
			where: { id: periodId },
			data: {
				status: "FINALIZED",
				finalizedAt: now,
				finalizedById: adminUser.id
			}
		});
		await tx.paystub.updateMany({
			where: { payrollPeriodId: periodId },
			data: {
				status: "APPROVED",
				paidAt: period.payDate
			}
		});
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "PAYROLL_FINALIZED",
		details: `Admin ${adminUser.name} finalized & locked Payroll Period #${period.periodNumber}. Gross: $${(period.totalGrossCents / 100).toFixed(2)}, Net: $${(period.totalNetCents / 100).toFixed(2)}`
	});
	for (const stub of period.paystubs) await createNotification({
		userId: stub.userId,
		type: "PAYSTUB_READY",
		title: "New Paystub Available",
		message: `Pay Period #${period.periodNumber} is finalized. Net Pay: $${(stub.netPayCents / 100).toFixed(2)}.`,
		linkTab: "timeclock:paystubs"
	});
	return getPayrollPeriod(periodId);
}
async function exportPayrollCsv(periodId) {
	const period = await getPayrollPeriod(periodId);
	const rows = [[
		"Period #",
		"Period Start",
		"Period End",
		"Pay Date",
		"Employee Name",
		"Employee Number",
		"Hourly Rate ($)",
		"Regular Hours",
		"Overtime Hours",
		"Regular Pay ($)",
		"Overtime Pay ($)",
		"Bonus ($)",
		"Vacation Pay ($)",
		"Total Gross ($)",
		"CPP ($)",
		"EI ($)",
		"Income Tax ($)",
		"Other Deductions ($)",
		"Total Deductions ($)",
		"Net Pay ($)",
		"Status"
	]];
	for (const p of period.paystubs) rows.push([
		String(period.periodNumber),
		period.startDate.toISOString().slice(0, 10),
		period.endDate.toISOString().slice(0, 10),
		period.payDate.toISOString().slice(0, 10),
		p.user.name,
		p.user.employeeNumber || "",
		(p.hourlyRateCents / 100).toFixed(2),
		p.regularHours.toFixed(2),
		p.overtimeHours.toFixed(2),
		(p.regularPayCents / 100).toFixed(2),
		(p.overtimePayCents / 100).toFixed(2),
		(p.bonusCents / 100).toFixed(2),
		(p.vacationPayCents / 100).toFixed(2),
		(p.grossPayCents / 100).toFixed(2),
		(p.cppCents / 100).toFixed(2),
		(p.eiCents / 100).toFixed(2),
		(p.incomeTaxCents / 100).toFixed(2),
		(p.otherDeductionsCents / 100).toFixed(2),
		(p.totalDeductionsCents / 100).toFixed(2),
		(p.netPayCents / 100).toFixed(2),
		p.status
	]);
	return rows.map((r) => r.map(csvCell).join(",")).join("\n");
}
/**
* Generate standard CRA compliant Canadian Paystub HTML for printing & PDF export
*/
async function buildPaystubHtml(paystubId, isAdmin = false, currentUserId) {
	const escHtml = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
		"&": "&amp;",
		"<": "&lt;",
		">": "&gt;",
		"\"": "&quot;",
		"'": "&#39;"
	})[c]);
	const paystub = await prisma.paystub.findUnique({
		where: { id: paystubId },
		include: {
			payrollPeriod: true,
			user: true
		}
	});
	if (!paystub) throw new HttpError(404, "Paystub not found");
	if (!isAdmin && currentUserId && paystub.userId !== currentUserId) throw new HttpError(403, "Unauthorized access to paystub");
	const settings = await getSettings();
	const money = (cents) => `$${(cents / 100).toFixed(2)}`;
	return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>Paystub - ${escHtml(paystub.user.name)} - Period #${paystub.payrollPeriod.periodNumber}</title>
  <style>
    @page { size: letter; margin: 0.5in; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; line-height: 1.4; padding: 20px; font-size: 13px; max-width: 800px; margin: 0 auto; }
    .header { display: flex; justify-content: space-between; border-bottom: 2px solid #4f46e5; padding-bottom: 12px; margin-bottom: 16px; }
    .company h1 { margin: 0; font-size: 20px; font-weight: 800; color: #0f172a; }
    .company p { margin: 2px 0; font-size: 11px; color: #64748b; }
    .title { text-align: right; }
    .title h2 { margin: 0; font-size: 18px; font-weight: 700; color: #4f46e5; }
    .title p { margin: 2px 0; font-size: 11px; color: #64748b; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; }
    .meta-col p { margin: 4px 0; font-size: 12px; }
    .meta-col strong { color: #0f172a; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 12px; }
    th { background: #f1f5f9; padding: 8px 10px; text-align: left; font-weight: 700; color: #475569; border-bottom: 1px solid #cbd5e1; }
    td { padding: 8px 10px; border-bottom: 1px solid #f1f5f9; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 10px; }
    .total-box { background: #eef2ff; border: 1.5px solid #c7d2fe; border-radius: 8px; padding: 16px; text-align: center; margin-top: 20px; }
    .total-box h3 { margin: 0; font-size: 14px; color: #3730a3; text-transform: uppercase; letter-spacing: 0.5px; }
    .total-box .net-amount { font-size: 28px; font-weight: 800; color: #4338ca; margin: 4px 0; font-family: monospace; }
    .footer { margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 10px; color: #94a3b8; text-align: center; }
    @media print {
      body { padding: 0; }
      .no-print { display: none; }
    }
  </style>
</head>
<body>
  <div class="header">
    <div class="company">
      <h1>${escHtml(settings.shopName || "Faso Fix POS")}</h1>
      <p>${escHtml(settings.address || "Ontario, Canada")}</p>
      <p>Tel: ${escHtml(settings.phone || "647-740-0566")}${settings.email ? ` • Email: ${escHtml(settings.email)}` : ""}</p>
    </div>
    <div class="title">
      <h2>EMPLOYEE EARNINGS STATEMENT</h2>
      <p>Period #${paystub.payrollPeriod.periodNumber} • Status: ${escHtml(paystub.status)}</p>
      <p>Issued: ${paystub.payrollPeriod.payDate.toISOString().slice(0, 10)}</p>
    </div>
  </div>

  <div class="meta-grid">
    <div class="meta-col">
      <p><strong>Employee Name:</strong> ${escHtml(paystub.user.name)}</p>
      <p><strong>Employee ID:</strong> ${escHtml(paystub.user.employeeNumber || "EMP-" + paystub.user.id.slice(0, 6))}</p>
      <p><strong>Email:</strong> ${escHtml(paystub.user.email)}</p>
      <p><strong>Hourly Rate:</strong> ${money(paystub.hourlyRateCents)}/hr</p>
    </div>
    <div class="meta-col">
      <p><strong>Pay Period:</strong> ${paystub.payrollPeriod.startDate.toISOString().slice(0, 10)} to ${paystub.payrollPeriod.endDate.toISOString().slice(0, 10)}</p>
      <p><strong>Payment Date:</strong> ${paystub.payrollPeriod.payDate.toISOString().slice(0, 10)}</p>
      <p><strong>Payment Method:</strong> ${escHtml(paystub.paymentMethod.replace(/_/g, " "))}</p>
      <p><strong>Jurisdiction:</strong> Ontario (CRA T4127 Compliant)</p>
    </div>
  </div>

  <div class="summary-grid">
    <!-- Earnings Column -->
    <div>
      <h4 style="margin: 0 0 8px 0; color: #1e293b;">EARNINGS BREAKDOWN</h4>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Hours</th>
            <th class="text-right">Rate</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Regular Hours</td>
            <td class="text-right">${paystub.regularHours.toFixed(2)}</td>
            <td class="text-right">${money(paystub.hourlyRateCents)}</td>
            <td class="text-right">${money(paystub.regularPayCents)}</td>
          </tr>
          ${paystub.overtimeHours > 0 ? `
          <tr>
            <td>Overtime Hours (1.5x)</td>
            <td class="text-right">${paystub.overtimeHours.toFixed(2)}</td>
            <td class="text-right">${money(paystub.overtimeRateCents)}</td>
            <td class="text-right">${money(paystub.overtimePayCents)}</td>
          </tr>
          ` : ""}
          ${paystub.bonusCents > 0 ? `
          <tr>
            <td>Bonus / Commissions</td>
            <td class="text-right">—</td>
            <td class="text-right">—</td>
            <td class="text-right">${money(paystub.bonusCents)}</td>
          </tr>
          ` : ""}
          <tr>
            <td>Vacation Pay (4% ON Statutory)</td>
            <td class="text-right">—</td>
            <td class="text-right">4.0%</td>
            <td class="text-right">${money(paystub.vacationPayCents)}</td>
          </tr>
          <tr style="font-weight: 700; background: #f8fafc;">
            <td colspan="3">TOTAL GROSS PAY</td>
            <td class="text-right" style="color: #4f46e5;">${money(paystub.grossPayCents)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Deductions Column -->
    <div>
      <h4 style="margin: 0 0 8px 0; color: #1e293b;">STATUTORY DEDUCTIONS</h4>
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th class="text-right">Type</th>
            <th class="text-right">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Canada Pension Plan (CPP)</td>
            <td class="text-right">Statutory (5.95%)</td>
            <td class="text-right">${money(paystub.cppCents)}</td>
          </tr>
          <tr>
            <td>Employment Insurance (EI)</td>
            <td class="text-right">Statutory (1.63%)</td>
            <td class="text-right">${money(paystub.eiCents)}</td>
          </tr>
          <tr>
            <td>Federal & Ontario Income Tax</td>
            <td class="text-right">CRA TD1 Tiered</td>
            <td class="text-right">${money(paystub.incomeTaxCents)}</td>
          </tr>
          ${paystub.otherDeductionsCents > 0 ? `
          <tr>
            <td>Other Authorized Deductions</td>
            <td class="text-right">Company / Benefit</td>
            <td class="text-right">${money(paystub.otherDeductionsCents)}</td>
          </tr>
          ` : ""}
          <tr style="font-weight: 700; background: #f8fafc;">
            <td colspan="2">TOTAL DEDUCTIONS</td>
            <td class="text-right" style="color: #ef4444;">-${money(paystub.totalDeductionsCents)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div class="total-box">
    <h3>Net Pay Deposit</h3>
    <div class="net-amount">${money(paystub.netPayCents)}</div>
    <p style="margin: 0; font-size: 11px; color: #6366f1;">Total Gross Earnings: ${money(paystub.grossPayCents)} | Total Statutory Deductions: ${money(paystub.totalDeductionsCents)}</p>
  </div>

  <div class="footer">
    <p>This paystub was generated by Faso Fix POS Time & Payroll Management System. Compliant with Ontario Employment Standards Act (ESA) and Canada Revenue Agency (CRA) guidelines.</p>
    <p>Please retain this statement for income tax records.</p>
  </div>
</body>
</html>`;
}
// src/server/scheduleService.ts
var BUSINESS_TIMEZONE = "America/Toronto";
function getTimeZoneOffsetMs(utcDate, timeZone = BUSINESS_TIMEZONE) {
	const parts = new Intl.DateTimeFormat("en-US", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit",
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false
	}).formatToParts(utcDate);
	const map = {};
	for (const p of parts) if (p.type !== "literal") map[p.type] = parseInt(p.value, 10);
	const hour = map.hour === 24 ? 0 : map.hour;
	return Date.UTC(map.year, map.month - 1, map.day, hour, map.minute, map.second) - utcDate.getTime();
}
function zonedLocalToUtc(year, month0, day, hour, minute, timeZone = BUSINESS_TIMEZONE) {
	const approxUtc = new Date(Date.UTC(year, month0, day, hour, minute, 0));
	const offset1 = getTimeZoneOffsetMs(approxUtc, timeZone);
	const pass1 = new Date(approxUtc.getTime() - offset1);
	const offset2 = getTimeZoneOffsetMs(pass1, timeZone);
	if (offset2 !== offset1) return new Date(approxUtc.getTime() - offset2);
	return pass1;
}
function toBusinessDateStr(date, timeZone = BUSINESS_TIMEZONE) {
	const parts = new Intl.DateTimeFormat("en-CA", {
		timeZone,
		year: "numeric",
		month: "2-digit",
		day: "2-digit"
	}).formatToParts(date);
	const map = {};
	for (const p of parts) if (p.type !== "literal") map[p.type] = p.value;
	return `${map.year}-${map.month}-${map.day}`;
}
function parseShiftDates(shiftDateStr, startTime, endTime) {
	let year;
	let month;
	let day;
	const isoPrefix = shiftDateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
	if (isoPrefix) {
		year = parseInt(isoPrefix[1], 10);
		month = parseInt(isoPrefix[2], 10) - 1;
		day = parseInt(isoPrefix[3], 10);
	} else {
		const d = new Date(shiftDateStr);
		year = d.getUTCFullYear();
		month = d.getUTCMonth();
		day = d.getUTCDate();
	}
	const [startH, startM] = startTime.split(":").map((n) => parseInt(n, 10));
	const [endH, endM] = endTime.split(":").map((n) => parseInt(n, 10));
	const startDateTime = zonedLocalToUtc(year, month, day, startH || 0, startM || 0);
	let endDateTime = zonedLocalToUtc(year, month, day, endH || 0, endM || 0);
	if (endDateTime.getTime() <= startDateTime.getTime()) endDateTime = zonedLocalToUtc(year, month, day + 1, endH || 0, endM || 0);
	return {
		shiftDate: new Date(Date.UTC(year, month, day, 0, 0, 0)),
		startDateTime,
		endDateTime
	};
}
async function evaluateShiftComplianceWarnings(params) {
	const { userId, startDateTime, endDateTime, breakMinutes, workedMinutes, scheduledHours, excludeShiftId } = params;
	const warnings = [];
	const notSelf = excludeShiftId ? { id: { not: excludeShiftId } } : {};
	const overlapping = await prisma.scheduledShift.findFirst({ where: {
		userId,
		...notSelf,
		status: { not: "CANCELLED" },
		startDateTime: { lt: endDateTime },
		endDateTime: { gt: startDateTime }
	} });
	if (overlapping) warnings.push(`⚠️ Scheduling Conflict: Employee already has an overlapping shift scheduled from ${overlapping.startTime} to ${overlapping.endTime} on this date.`);
	const elevenHoursMs = 396e5;
	const prevShift = await prisma.scheduledShift.findFirst({
		where: {
			userId,
			...notSelf,
			status: { not: "CANCELLED" },
			endDateTime: { lte: startDateTime }
		},
		orderBy: { endDateTime: "desc" }
	});
	if (prevShift && startDateTime.getTime() - prevShift.endDateTime.getTime() < elevenHoursMs) {
		const restHours = ((startDateTime.getTime() - prevShift.endDateTime.getTime()) / 36e5).toFixed(1);
		warnings.push(`⚠️ Ontario ESA Rest Notice: Only ${restHours} hours rest between previous shift (${prevShift.endTime}) and this shift (ESA minimum is 11 consecutive hours).`);
	}
	const nextShift = await prisma.scheduledShift.findFirst({
		where: {
			userId,
			...notSelf,
			status: { not: "CANCELLED" },
			startDateTime: { gte: endDateTime }
		},
		orderBy: { startDateTime: "asc" }
	});
	if (nextShift && nextShift.startDateTime.getTime() - endDateTime.getTime() < elevenHoursMs) {
		const restHours = ((nextShift.startDateTime.getTime() - endDateTime.getTime()) / 36e5).toFixed(1);
		warnings.push(`⚠️ Ontario ESA Rest Notice: Only ${restHours} hours rest between this shift and next scheduled shift (${nextShift.startTime}) on ${nextShift.shiftDate.toISOString().slice(0, 10)}.`);
	}
	if (workedMinutes > 300 && breakMinutes < 30) warnings.push(`⚠️ Ontario ESA Meal Break Notice: Shifts exceeding 5 consecutive hours require at least a 30-minute eating period.`);
	const [y, m, d] = toBusinessDateStr(startDateTime).split("-").map((n) => parseInt(n, 10));
	const localRef = new Date(Date.UTC(y, m - 1, d));
	const dayOfWeek = (localRef.getUTCDay() + 6) % 7;
	const weekStart = /* @__PURE__ */ new Date(localRef.getTime() - dayOfWeek * 864e5);
	const weekEnd = new Date(weekStart.getTime() + 6048e5);
	const totalProjectedHours = (await prisma.scheduledShift.findMany({ where: {
		userId,
		...notSelf,
		status: { not: "CANCELLED" },
		shiftDate: {
			gte: weekStart,
			lt: weekEnd
		}
	} })).reduce((sum, s) => sum + s.scheduledHours, 0) + scheduledHours;
	if (totalProjectedHours > 44) warnings.push(`⚠️ Overtime Risk: Employee is scheduled for ${totalProjectedHours.toFixed(1)} hours this week (>44h threshold, Ontario 1.5x overtime rate applies).`);
	if (totalProjectedHours > 48) warnings.push(`⚠️ Ontario ESA Maximum Hours Alert: Weekly hours exceed 48 hours (requires employee written excess hours agreement).`);
	return warnings;
}
async function listScheduledShifts(filters) {
	const where = {};
	if (filters.userId && filters.userId !== "ALL") where.userId = filters.userId;
	if (filters.status && filters.status !== "ALL") where.status = filters.status;
	if (filters.publishedOnly) where.isPublished = true;
	else if (filters.isPublished !== void 0) where.isPublished = filters.isPublished;
	if (filters.startDate || filters.endDate) {
		where.shiftDate = {};
		if (filters.startDate) where.shiftDate.gte = new Date(filters.startDate);
		if (filters.endDate) where.shiftDate.lte = new Date(filters.endDate);
	}
	return await prisma.scheduledShift.findMany({
		where,
		include: { user: { select: {
			id: true,
			name: true,
			username: true,
			employeeNumber: true,
			role: true,
			bench: true,
			hourlyRateCents: true
		} } },
		orderBy: { startDateTime: "asc" }
	});
}
async function createScheduledShift(input, adminUser) {
	const user = await prisma.user.findUnique({ where: { id: input.userId } });
	if (!user) throw new HttpError(404, "Employee user not found");
	const { shiftDate, startDateTime, endDateTime } = parseShiftDates(input.shiftDate, input.startTime, input.endTime);
	const breakMinutes = Number.isInteger(input.breakMinutes) ? Math.max(0, input.breakMinutes) : 30;
	const breakType = input.breakType || "UNPAID_MEAL";
	const totalMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 6e4);
	const workedMinutes = breakType === "UNPAID_MEAL" ? Math.max(0, totalMinutes - breakMinutes) : totalMinutes;
	const scheduledHours = Number((workedMinutes / 60).toFixed(2));
	const warnings = await evaluateShiftComplianceWarnings({
		userId: input.userId,
		shiftDate,
		startDateTime,
		endDateTime,
		breakMinutes,
		workedMinutes,
		scheduledHours
	});
	const shift = await prisma.scheduledShift.create({
		data: {
			userId: input.userId,
			shiftDate,
			startTime: input.startTime,
			endTime: input.endTime,
			startDateTime,
			endDateTime,
			breakMinutes,
			breakType,
			scheduledHours,
			roleOrStation: input.roleOrStation || user.bench || "Technician",
			branchLocation: input.branchLocation || "Main Shop",
			recurrenceRule: input.recurrenceRule || "NONE",
			isPublished: input.isPublished !== false,
			notes: input.notes,
			createdById: adminUser.id,
			createdByName: adminUser.name,
			status: "SCHEDULED"
		},
		include: { user: { select: {
			id: true,
			name: true,
			username: true,
			employeeNumber: true,
			role: true,
			bench: true
		} } }
	});
	const recurrenceRule = input.recurrenceRule || "NONE";
	const recurrenceCount = Math.min(Math.max(1, input.recurrenceCount || 1), 12);
	const createdShifts = [shift];
	if (recurrenceRule !== "NONE" && recurrenceCount > 1) {
		const daysInterval = recurrenceRule === "DAILY" ? 1 : recurrenceRule === "WEEKLY" ? 7 : 14;
		for (let i = 1; i < recurrenceCount; i++) {
			const nextParsed = parseShiftDates(new Date(shiftDate.getTime() + i * daysInterval * 864e5).toISOString().slice(0, 10), input.startTime, input.endTime);
			try {
				const nextShift = await prisma.scheduledShift.create({ data: {
					userId: input.userId,
					shiftDate: nextParsed.shiftDate,
					startTime: input.startTime,
					endTime: input.endTime,
					startDateTime: nextParsed.startDateTime,
					endDateTime: nextParsed.endDateTime,
					breakMinutes,
					breakType,
					scheduledHours,
					roleOrStation: input.roleOrStation || user.bench || "Technician",
					branchLocation: input.branchLocation || "Main Shop",
					recurrenceRule,
					isPublished: input.isPublished !== false,
					notes: input.notes,
					createdById: adminUser.id,
					createdByName: adminUser.name,
					status: "SCHEDULED"
				} });
				createdShifts.push(nextShift);
			} catch {}
		}
	}
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_SCHEDULE_CREATE",
		details: `Created shift schedule for ${user.name} (${input.startTime} - ${input.endTime} on ${shiftDate.toISOString().slice(0, 10)})${recurrenceCount > 1 ? ` repeated ${recurrenceCount} times` : ""}`
	});
	if (shift.isPublished) {
		const dateLabel = shiftDate.toISOString().slice(0, 10);
		await createNotification({
			userId: input.userId,
			type: "SHIFT_ASSIGNED",
			title: "New Shift Assigned",
			message: `Scheduled on ${dateLabel} (${input.startTime} - ${input.endTime})${recurrenceCount > 1 ? ` + ${recurrenceCount - 1} recurring` : ""}.`,
			linkTab: "timeclock:schedule"
		});
	}
	return {
		shift,
		createdShifts,
		warnings
	};
}
async function updateScheduledShift(id, input, adminUser) {
	const existing = await prisma.scheduledShift.findUnique({
		where: { id },
		include: { user: true }
	});
	if (!existing) throw new HttpError(404, "Scheduled shift not found");
	const targetUserId = input.userId || existing.userId;
	if (input.userId && input.userId !== existing.userId) {
		if (!await prisma.user.findUnique({ where: { id: input.userId } })) throw new HttpError(404, "Assigned employee user not found");
	}
	const shiftDateStr = input.shiftDate || existing.shiftDate.toISOString();
	const startTime = input.startTime || existing.startTime;
	const endTime = input.endTime || existing.endTime;
	const { shiftDate, startDateTime, endDateTime } = parseShiftDates(shiftDateStr, startTime, endTime);
	const breakMinutes = input.breakMinutes !== void 0 ? Math.max(0, input.breakMinutes) : existing.breakMinutes;
	const breakType = input.breakType || existing.breakType;
	const totalMinutes = Math.round((endDateTime.getTime() - startDateTime.getTime()) / 6e4);
	const workedMinutes = breakType === "UNPAID_MEAL" ? Math.max(0, totalMinutes - breakMinutes) : totalMinutes;
	const scheduledHours = Number((workedMinutes / 60).toFixed(2));
	const warnings = await evaluateShiftComplianceWarnings({
		userId: targetUserId,
		shiftDate,
		startDateTime,
		endDateTime,
		breakMinutes,
		workedMinutes,
		scheduledHours,
		excludeShiftId: id
	});
	const updated = await prisma.scheduledShift.update({
		where: { id },
		data: {
			userId: targetUserId,
			shiftDate,
			startTime,
			endTime,
			startDateTime,
			endDateTime,
			breakMinutes,
			breakType,
			scheduledHours,
			roleOrStation: input.roleOrStation !== void 0 ? input.roleOrStation : existing.roleOrStation,
			branchLocation: input.branchLocation !== void 0 ? input.branchLocation : existing.branchLocation,
			isPublished: input.isPublished !== void 0 ? input.isPublished : existing.isPublished,
			notes: input.notes !== void 0 ? input.notes : existing.notes,
			status: input.status || existing.status,
			updatedById: adminUser.id
		},
		include: { user: { select: {
			id: true,
			name: true,
			username: true,
			employeeNumber: true,
			role: true,
			bench: true
		} } }
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_SCHEDULE_UPDATE",
		details: `Updated scheduled shift #${id} for ${updated.user.name}`
	});
	const dateLabel = updated.shiftDate.toISOString().slice(0, 10);
	if (!existing.isPublished && updated.isPublished) await createNotification({
		userId: updated.userId,
		type: "SHIFT_PUBLISHED",
		title: "Shift Published",
		message: `Your shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}) is now published.`,
		linkTab: "timeclock:schedule"
	});
	else if (updated.isPublished) {
		if (updated.status === "CANCELLED" && existing.status !== "CANCELLED") await createNotification({
			userId: updated.userId,
			type: "SHIFT_CANCELLED",
			title: "Shift Cancelled",
			message: `Your shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}) was cancelled.`,
			linkTab: "timeclock:schedule"
		});
		else if (updated.userId !== existing.userId) {
			await createNotification({
				userId: updated.userId,
				type: "SHIFT_ASSIGNED",
				title: "Shift Assigned to You",
				message: `You were assigned a shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}).`,
				linkTab: "timeclock:schedule"
			});
			await createNotification({
				userId: existing.userId,
				type: "SHIFT_UPDATED",
				title: "Shift Reassigned",
				message: `Your shift on ${existing.shiftDate.toISOString().slice(0, 10)} (${existing.startTime} - ${existing.endTime}) was reassigned.`,
				linkTab: "timeclock:schedule"
			});
		} else await createNotification({
			userId: updated.userId,
			type: "SHIFT_UPDATED",
			title: "Shift Updated",
			message: `Your shift on ${dateLabel} (${updated.startTime} - ${updated.endTime}) was updated.`,
			linkTab: "timeclock:schedule"
		});
	}
	return {
		...updated,
		shift: updated,
		warnings
	};
}
async function publishDraftShifts(filters, adminUser) {
	const where = {
		isPublished: false,
		status: { not: "CANCELLED" }
	};
	if (filters?.userId && filters.userId !== "ALL") where.userId = filters.userId;
	if (filters?.startDate || filters?.endDate) {
		where.shiftDate = {};
		if (filters.startDate) where.shiftDate.gte = new Date(filters.startDate);
		if (filters.endDate) where.shiftDate.lte = new Date(filters.endDate);
	}
	const drafts = await prisma.scheduledShift.findMany({
		where,
		include: { user: { select: {
			id: true,
			name: true
		} } }
	});
	if (drafts.length === 0) return {
		count: 0,
		publishedIds: []
	};
	const ids = drafts.map((d) => d.id);
	await prisma.scheduledShift.updateMany({
		where: { id: { in: ids } },
		data: {
			isPublished: true,
			updatedById: adminUser.id
		}
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_SCHEDULE_PUBLISH",
		details: `Published ${drafts.length} draft shift(s) to staff schedules`
	});
	const byUser = /* @__PURE__ */ new Map();
	for (const d of drafts) {
		const arr = byUser.get(d.userId) || [];
		arr.push(d);
		byUser.set(d.userId, arr);
	}
	for (const [userId, userDrafts] of byUser.entries()) {
		const first = userDrafts[0];
		const firstDate = first.shiftDate.toISOString().slice(0, 10);
		const msg = userDrafts.length === 1 ? `Shift on ${firstDate} (${first.startTime} - ${first.endTime}) is now published.` : `${userDrafts.length} upcoming shifts starting ${firstDate} are now published.`;
		await createNotification({
			userId,
			type: "SHIFT_PUBLISHED",
			title: userDrafts.length === 1 ? "Shift Published" : `${userDrafts.length} Shifts Published`,
			message: msg,
			linkTab: "timeclock:schedule"
		});
	}
	return {
		count: drafts.length,
		publishedIds: ids
	};
}
async function deleteScheduledShift(id, adminUser) {
	const existing = await prisma.scheduledShift.findUnique({
		where: { id },
		include: { user: true }
	});
	if (!existing) throw new HttpError(404, "Scheduled shift not found");
	await prisma.scheduledShift.delete({ where: { id } });
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_SCHEDULE_DELETE",
		details: `Deleted scheduled shift #${id} for ${existing.user.name}`
	});
	if (existing.isPublished) await createNotification({
		userId: existing.userId,
		type: "SHIFT_CANCELLED",
		title: "Shift Removed",
		message: `Your shift on ${existing.shiftDate.toISOString().slice(0, 10)} (${existing.startTime} - ${existing.endTime}) was removed from the schedule.`,
		linkTab: "timeclock:schedule"
	});
	return {
		success: true,
		id
	};
}
/**
* Compare Scheduled Hours vs Actual Clock-In Hours, Late Arrivals & Missed Shifts
*/
async function compareScheduleVsActual(startDateStr, endDateStr) {
	const start = new Date(startDateStr);
	const end = new Date(endDateStr);
	const scheduled = await prisma.scheduledShift.findMany({
		where: {
			shiftDate: {
				gte: start,
				lte: end
			},
			status: { not: "CANCELLED" }
		},
		include: { user: { select: {
			id: true,
			name: true,
			username: true,
			employeeNumber: true,
			role: true
		} } },
		orderBy: { startDateTime: "asc" }
	});
	const actualShifts = await prisma.shift.findMany({
		where: { clockIn: {
			gte: /* @__PURE__ */ new Date(start.getTime() - 216e5),
			lte: new Date(end.getTime() + 108e6)
		} },
		include: { user: { select: {
			id: true,
			name: true
		} } },
		orderBy: { clockIn: "asc" }
	});
	const now = /* @__PURE__ */ new Date();
	let totalScheduledHours = 0;
	let totalActualHours = 0;
	let lateCount = 0;
	let missedCount = 0;
	const comparison = scheduled.map((sc) => {
		totalScheduledHours += sc.scheduledHours;
		const scDateStr = sc.shiftDate.toISOString().slice(0, 10);
		const match = actualShifts.find((a) => a.userId === sc.userId && (toBusinessDateStr(a.clockIn) === scDateStr || Math.abs(a.clockIn.getTime() - sc.startDateTime.getTime()) <= 216e5));
		let actualHours = 0;
		let lateMinutes = 0;
		let attendanceStatus = "PENDING";
		if (match) {
			if (match.status === "COMPLETED") actualHours = Number((match.totalMinutes / 60).toFixed(2));
			else {
				const elapsedMins = Math.max(0, Math.round((now.getTime() - match.clockIn.getTime()) / 6e4));
				actualHours = Number((Math.max(0, elapsedMins - match.breakMinutes) / 60).toFixed(2));
			}
			totalActualHours += actualHours;
			const diffMs = match.clockIn.getTime() - sc.startDateTime.getTime();
			if (diffMs > 6e5) {
				lateMinutes = Math.round(diffMs / 6e4);
				attendanceStatus = "LATE";
				lateCount++;
			} else attendanceStatus = "ON_TIME";
		} else if (sc.endDateTime < now) {
			attendanceStatus = "MISSED";
			missedCount++;
		}
		const varianceHours = Number((actualHours - sc.scheduledHours).toFixed(2));
		return {
			scheduledShiftId: sc.id,
			employee: sc.user,
			shiftDate: sc.shiftDate,
			scheduledTime: `${sc.startTime} - ${sc.endTime}`,
			scheduledHours: sc.scheduledHours,
			actualShiftId: match ? match.id : null,
			actualClockIn: match ? match.clockIn : null,
			actualClockOut: match ? match.clockOut : null,
			actualHours,
			varianceHours,
			lateMinutes,
			attendanceStatus
		};
	});
	const onTimeCount = comparison.filter((c) => c.attendanceStatus === "ON_TIME").length;
	const completedOrPastCount = lateCount + missedCount + onTimeCount;
	const onTimeRatePct = completedOrPastCount > 0 ? Number((onTimeCount / completedOrPastCount * 100).toFixed(1)) : 100;
	return {
		summary: {
			totalScheduledShifts: scheduled.length,
			totalScheduledHours: Number(totalScheduledHours.toFixed(2)),
			totalActualHours: Number(totalActualHours.toFixed(2)),
			netVarianceHours: Number((totalActualHours - totalScheduledHours).toFixed(2)),
			totalLateArrivals: lateCount,
			totalMissedShifts: missedCount,
			onTimeRatePct
		},
		details: comparison.map((c) => ({
			shiftId: c.scheduledShiftId,
			userId: c.employee?.id || "",
			userName: c.employee?.name || "Staff",
			userRole: c.employee?.role || "TECHNICIAN",
			shiftDate: c.shiftDate.toISOString(),
			scheduledStart: c.scheduledTime.split(" - ")[0] || "",
			scheduledEnd: c.scheduledTime.split(" - ")[1] || "",
			scheduledHours: c.scheduledHours,
			actualClockIn: c.actualClockIn ? c.actualClockIn.toISOString() : null,
			actualClockOut: c.actualClockOut ? c.actualClockOut.toISOString() : null,
			actualHoursWorked: c.actualHours,
			varianceHours: c.varianceHours,
			isLate: c.attendanceStatus === "LATE",
			isMissed: c.attendanceStatus === "MISSED",
			status: c.attendanceStatus
		})),
		totalScheduledShifts: scheduled.length,
		totalScheduledHours: Number(totalScheduledHours.toFixed(2)),
		totalActualHours: Number(totalActualHours.toFixed(2)),
		onTimeRatePct,
		lateCount,
		missedCount,
		comparison
	};
}
async function duplicateScheduledShift(id, targetDate, targetUserId, adminUser) {
	const original = await prisma.scheduledShift.findUnique({ where: { id } });
	if (!original) throw new HttpError(404, "Shift not found");
	return await createScheduledShift({
		userId: targetUserId || original.userId,
		shiftDate: targetDate,
		startTime: original.startTime,
		endTime: original.endTime,
		breakMinutes: original.breakMinutes,
		breakType: original.breakType,
		roleOrStation: original.roleOrStation || void 0,
		branchLocation: original.branchLocation || void 0,
		notes: original.notes ? `Copy of shift: ${original.notes}` : void 0
	}, adminUser || {
		id: "system",
		name: "Administrator"
	});
}
async function createTimeOffRequest(input) {
	if (!await prisma.user.findUnique({ where: { id: input.userId } })) throw new HttpError(404, "User not found");
	const startDate = new Date(input.startDate);
	const endDate = new Date(input.endDate);
	if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) throw new HttpError(400, "Valid startDate and endDate are required.");
	if (endDate < startDate) throw new HttpError(400, "Time-off end date cannot be earlier than start date.");
	const created = await prisma.timeOffRequest.create({
		data: {
			userId: input.userId,
			requestType: input.requestType || "VACATION",
			startDate,
			endDate,
			reason: input.reason || null,
			status: "PENDING"
		},
		include: { user: { select: {
			id: true,
			name: true,
			username: true,
			role: true
		} } }
	});
	await notifyAdmins({
		type: "TIME_OFF_REQUEST",
		title: "New Time-Off Request",
		message: `${created.user.name} requested ${created.requestType} (${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)}).`,
		linkTab: "admin:schedule",
		excludeUserId: input.userId
	});
	return created;
}
async function listTimeOffRequests(filters) {
	const where = {};
	if (filters?.userId && filters.userId !== "ALL") where.userId = filters.userId;
	if (filters?.status && filters.status !== "ALL") where.status = filters.status;
	return await prisma.timeOffRequest.findMany({
		where,
		include: { user: { select: {
			id: true,
			name: true,
			username: true,
			role: true,
			employeeNumber: true
		} } },
		orderBy: { startDate: "desc" }
	});
}
async function reviewTimeOffRequest(id, review, adminUser) {
	if (!await prisma.timeOffRequest.findUnique({ where: { id } })) throw new HttpError(404, "Time-off request not found");
	const updated = await prisma.timeOffRequest.update({
		where: { id },
		data: {
			status: review.status,
			reviewedById: adminUser.id,
			reviewedByName: adminUser.name,
			reviewNotes: review.reviewNotes
		},
		include: { user: { select: {
			id: true,
			name: true,
			username: true
		} } }
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "TIME_OFF_REVIEW",
		details: `${review.status} time-off request for ${updated.user.name} (${updated.startDate.toISOString().slice(0, 10)} to ${updated.endDate.toISOString().slice(0, 10)})`
	});
	await createNotification({
		userId: updated.userId,
		type: "TIME_OFF_REVIEWED",
		title: `Time-Off ${review.status === "APPROVED" ? "Approved" : "Rejected"}`,
		message: `Your ${updated.requestType} request (${updated.startDate.toISOString().slice(0, 10)} to ${updated.endDate.toISOString().slice(0, 10)}) was ${review.status.toLowerCase()}.`,
		linkTab: "timeclock:schedule"
	});
	return updated;
}
async function createShiftSwapRequest(input) {
	if (input.targetUserId === input.requesterId) throw new HttpError(400, "Cannot request a shift swap with yourself.");
	const requesterShift = await prisma.scheduledShift.findUnique({ where: { id: input.requesterShiftId } });
	if (!requesterShift) throw new HttpError(404, "Selected shift was not found.");
	if (requesterShift.userId !== input.requesterId) throw new HttpError(403, "You can only request swaps for your own assigned shifts.");
	const created = await prisma.shiftSwapRequest.create({
		data: {
			requesterId: input.requesterId,
			requesterShiftId: input.requesterShiftId,
			targetUserId: input.targetUserId,
			targetShiftId: input.targetShiftId || null,
			reason: input.reason || null,
			status: "PENDING"
		},
		include: {
			requester: { select: {
				id: true,
				name: true,
				username: true
			} },
			targetUser: { select: {
				id: true,
				name: true,
				username: true
			} }
		}
	});
	await createNotification({
		userId: input.targetUserId,
		type: "SHIFT_SWAP_REQUEST",
		title: "Shift Swap Requested",
		message: `${created.requester.name} requested a shift swap with you (${requesterShift.shiftDate.toISOString().slice(0, 10)} ${requesterShift.startTime}-${requesterShift.endTime}).`,
		linkTab: "timeclock:schedule"
	});
	await notifyAdmins({
		type: "SHIFT_SWAP_REQUEST",
		title: "Shift Swap Pending Approval",
		message: `${created.requester.name} requested to swap a shift with ${created.targetUser.name}.`,
		linkTab: "admin:schedule",
		excludeUserId: input.requesterId
	});
	return created;
}
async function listShiftSwapRequests(filters) {
	const where = {};
	if (filters?.userId && filters.userId !== "ALL") where.OR = [{ requesterId: filters.userId }, { targetUserId: filters.userId }];
	if (filters?.status && filters.status !== "ALL") where.status = filters.status;
	return await prisma.shiftSwapRequest.findMany({
		where,
		include: {
			requester: { select: {
				id: true,
				name: true,
				username: true
			} },
			targetUser: { select: {
				id: true,
				name: true,
				username: true
			} }
		},
		orderBy: { createdAt: "desc" }
	});
}
async function reviewShiftSwapRequest(id, review, adminUser) {
	const swap = await prisma.shiftSwapRequest.findUnique({ where: { id } });
	if (!swap) throw new HttpError(404, "Shift swap request not found");
	if (swap.status !== "PENDING") throw new HttpError(409, `This shift swap request has already been ${swap.status.toLowerCase()}.`);
	const updated = await prisma.$transaction(async (tx) => {
		if (review.status === "APPROVED") {
			await tx.scheduledShift.update({
				where: { id: swap.requesterShiftId },
				data: { userId: swap.targetUserId }
			});
			if (swap.targetShiftId) await tx.scheduledShift.update({
				where: { id: swap.targetShiftId },
				data: { userId: swap.requesterId }
			});
		}
		return tx.shiftSwapRequest.update({
			where: { id },
			data: {
				status: review.status,
				reviewedById: adminUser.id,
				reviewedByName: adminUser.name,
				reviewNotes: review.reviewNotes
			},
			include: {
				requester: { select: {
					id: true,
					name: true
				} },
				targetUser: { select: {
					id: true,
					name: true
				} }
			}
		});
	});
	await recordAudit({
		userId: adminUser.id,
		actorName: adminUser.name,
		action: "SHIFT_SWAP_REVIEW",
		details: `${review.status} shift swap between ${updated.requester.name} and ${updated.targetUser.name}`
	});
	const decisionText = review.status === "APPROVED" ? "approved" : "rejected";
	await createNotification({
		userId: updated.requesterId,
		type: "SHIFT_SWAP_REVIEWED",
		title: `Shift Swap ${review.status === "APPROVED" ? "Approved" : "Rejected"}`,
		message: `Your shift swap request with ${updated.targetUser.name} was ${decisionText}.`,
		linkTab: "timeclock:schedule"
	});
	await createNotification({
		userId: updated.targetUserId,
		type: "SHIFT_SWAP_REVIEWED",
		title: `Shift Swap ${review.status === "APPROVED" ? "Approved" : "Rejected"}`,
		message: `The shift swap request from ${updated.requester.name} was ${decisionText}.`,
		linkTab: "timeclock:schedule"
	});
	return updated;
}
async function exportSchedulesCsv(filters) {
	const shifts = await listScheduledShifts(filters || {});
	const headers = [
		"Shift ID",
		"Employee Name",
		"Employee ID",
		"Role / Bench",
		"Branch",
		"Shift Date",
		"Start Time",
		"End Time",
		"Scheduled Hours",
		"Break Duration (min)",
		"Break Type",
		"Status",
		"Notes",
		"Created By"
	];
	const rows = shifts.map((s) => [
		s.id,
		s.user?.name || "",
		s.user?.employeeNumber || "",
		s.roleOrStation || s.user?.role || "",
		s.branchLocation || "Main Shop",
		s.shiftDate.toISOString().slice(0, 10),
		s.startTime,
		s.endTime,
		s.scheduledHours.toFixed(2),
		s.breakMinutes,
		s.breakType,
		s.status,
		s.notes || "",
		s.createdByName || ""
	]);
	return [headers.map(csvCell).join(","), ...rows.map((r) => r.map(csvCell).join(","))].join("\n");
}
// src/server/cryptoVault.ts
var derivedKeyCache = /* @__PURE__ */ new Map();
function getVaultKey(version) {
	if (version === "v2") {
		const raw = process.env.FIELD_ENCRYPTION_KEY?.trim();
		if (!raw) throw new Error("FIELD_ENCRYPTION_KEY is required to decrypt v2 encrypted secrets.");
		const cacheKey = `v2:${raw}`;
		let buf = derivedKeyCache.get(cacheKey);
		if (!buf) {
			buf = crypto$1.scryptSync(raw, "fasofix-vault-v2", 32);
			derivedKeyCache.set(cacheKey, buf);
		}
		return buf;
	}
	const raw = process.env.SESSION_SECRET?.trim() || "fasofix-pos-vault-v1-stable-key";
	const cacheKey = `v1:${raw}`;
	let buf = derivedKeyCache.get(cacheKey);
	if (!buf) {
		buf = crypto$1.scryptSync(raw, "fasofix-vault-v1", 32);
		derivedKeyCache.set(cacheKey, buf);
	}
	return buf;
}
/**
* Encrypt sensitive at-rest application secrets (e.g. TOTP shared keys) using AES-256-GCM.
*/
function encryptSecret(plaintext) {
	const version = Boolean(process.env.FIELD_ENCRYPTION_KEY?.trim()) ? "v2" : "v1";
	const key = getVaultKey(version);
	const iv = crypto$1.randomBytes(12);
	const cipher = crypto$1.createCipheriv("aes-256-gcm", key, iv);
	const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
	const tag = cipher.getAuthTag();
	return `enc:${version}:${iv.toString("base64")}:${tag.toString("base64")}:${ciphertext.toString("base64")}`;
}
/**
* Decrypt AES-256-GCM secrets produced by encryptSecret() (supports v1, v2, and legacy plaintext).
*/
function decryptSecret(stored) {
	if (!stored) return "";
	if (!stored.startsWith("enc:v1:") && !stored.startsWith("enc:v2:")) return stored;
	const parts = stored.split(":");
	if (parts.length !== 5) throw new Error("Malformed encrypted secret payload.");
	const version = parts[1];
	const iv = Buffer.from(parts[2], "base64");
	const tag = Buffer.from(parts[3], "base64");
	const ciphertext = Buffer.from(parts[4], "base64");
	const key = getVaultKey(version);
	const decipher = crypto$1.createDecipheriv("aes-256-gcm", key, iv);
	decipher.setAuthTag(tag);
	return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
// src/server/totp.ts
var BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
var RECOVERY_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
/** Encode bytes as unpadded uppercase RFC 4648 Base32. */
function base32Encode(buf) {
	let bits = 0;
	let value = 0;
	let output = "";
	for (const byte of buf) {
		value = value << 8 | byte;
		bits += 8;
		while (bits >= 5) {
			output += BASE32_ALPHABET[value >>> bits - 5 & 31];
			bits -= 5;
		}
	}
	if (bits > 0) output += BASE32_ALPHABET[value << 5 - bits & 31];
	return output;
}
/** Decode RFC 4648 Base32 string (tolerant of spaces, hyphens, and case). */
function base32Decode(str) {
	const clean = str.toUpperCase().replace(/[^A-Z2-7]/g, "");
	let bits = 0;
	let value = 0;
	const bytes = [];
	for (const ch of clean) {
		const idx = BASE32_ALPHABET.indexOf(ch);
		if (idx === -1) continue;
		value = value << 5 | idx;
		bits += 5;
		if (bits >= 8) {
			bytes.push(value >>> bits - 8 & 255);
			bits -= 8;
		}
	}
	return Buffer.from(bytes);
}
/** Generate a 160-bit cryptographically random Base32 TOTP secret. */
function generateTotpSecret() {
	return base32Encode(crypto$1.randomBytes(20));
}
/** Compute an RFC 6238 6-digit TOTP code for the given counter step. */
function generateTotpCode(secretBase32, counter) {
	const key = base32Decode(secretBase32);
	const msg = Buffer.alloc(8);
	msg.writeBigUInt64BE(BigInt(counter), 0);
	const hmac = crypto$1.createHmac("sha1", key).update(msg).digest();
	const offset = hmac[hmac.length - 1] & 15;
	const binCode = (hmac[offset] & 127) << 24 | (hmac[offset + 1] & 255) << 16 | (hmac[offset + 2] & 255) << 8 | hmac[offset + 3] & 255;
	return String(binCode % 1e6).padStart(6, "0");
}
/**
* Constant-time TOTP verification across +/- `window` 30-second steps.
* Returns the matched counter index so callers can enforce single-use replay protection.
*/
function verifyTotpCode(secretBase32, rawCode, window = 1, nowMs = Date.now()) {
	const normalized = String(rawCode || "").replace(/[\s-]/g, "");
	if (!/^\d{6}$/.test(normalized)) return {
		valid: false,
		counter: -1
	};
	const currentCounter = Math.floor(nowMs / 1e3 / 30);
	const inputBuf = Buffer.from(normalized, "utf8");
	for (let delta = -window; delta <= window; delta++) {
		const candidateCounter = currentCounter + delta;
		if (candidateCounter < 0) continue;
		const expectedBuf = Buffer.from(generateTotpCode(secretBase32, candidateCounter), "utf8");
		if (expectedBuf.length === inputBuf.length && crypto$1.timingSafeEqual(expectedBuf, inputBuf)) return {
			valid: true,
			counter: candidateCounter
		};
	}
	return {
		valid: false,
		counter: -1
	};
}
function buildOtpauthUri(secretBase32, accountName, issuer = "Faso Fix POS") {
	return `otpauth://totp/${`${encodeURIComponent(issuer)}:${encodeURIComponent(accountName)}`}?${new URLSearchParams({
		secret: secretBase32,
		issuer,
		algorithm: "SHA1",
		digits: "6",
		period: "30"
	}).toString()}`;
}
/** Render a local CSP-safe SVG data URL QR code (zero external network calls). */
async function renderQrSvgDataUrl(otpauthUri) {
	const svg = await QRCode.toString(otpauthUri, {
		type: "svg",
		width: 220,
		margin: 2,
		errorCorrectionLevel: "M"
	});
	return `data:image/svg+xml;base64,${Buffer.from(svg, "utf8").toString("base64")}`;
}
function normalizeRecoveryCode(raw) {
	return String(raw || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}
function hashRecoveryCode(normalized) {
	return crypto$1.createHash("sha256").update(normalized).digest("hex");
}
function generateRecoveryCodes(count = 8) {
	const plainCodes = [];
	const hashedCodes = [];
	for (let i = 0; i < count; i++) {
		const bytes = crypto$1.randomBytes(8);
		let raw = "";
		for (let j = 0; j < 8; j++) raw += RECOVERY_ALPHABET[bytes[j] % 32];
		plainCodes.push(`${raw.slice(0, 4)}-${raw.slice(4)}`);
		hashedCodes.push(hashRecoveryCode(raw));
	}
	return {
		plainCodes,
		hashedCodes
	};
}
function parseRecoveryHashes(hashedJson) {
	if (!hashedJson) return [];
	try {
		const parsed = JSON.parse(hashedJson);
		return Array.isArray(parsed) ? parsed.filter((x) => typeof x === "string") : [];
	} catch {
		return [];
	}
}
function consumeRecoveryCode(rawCode, hashedJson) {
	const hashes = parseRecoveryHashes(hashedJson);
	const normalized = normalizeRecoveryCode(rawCode);
	if (normalized.length < 8 || hashes.length === 0) return {
		valid: false,
		remainingJson: JSON.stringify(hashes),
		remainingCount: hashes.length
	};
	const candidateBuf = Buffer.from(hashRecoveryCode(normalized), "hex");
	let matchedIndex = -1;
	for (let i = 0; i < hashes.length; i++) try {
		const targetBuf = Buffer.from(hashes[i], "hex");
		if (targetBuf.length === candidateBuf.length && crypto$1.timingSafeEqual(targetBuf, candidateBuf)) matchedIndex = i;
	} catch {}
	if (matchedIndex === -1) return {
		valid: false,
		remainingJson: JSON.stringify(hashes),
		remainingCount: hashes.length
	};
	const next = hashes.filter((_, idx) => idx !== matchedIndex);
	return {
		valid: true,
		remainingJson: JSON.stringify(next),
		remainingCount: next.length
	};
}
// src/server/securityService.ts
function stripSensitiveUserFields(user) {
	const { passwordHash: _ph, sin: _sin, twoFactorSecret: _tfs, twoFactorRecoveryCodes: _tfr, twoFactorLastCounter: _tflc, ...safe } = user;
	return safe;
}
async function verifyTwoFactorLogin(challengeToken, code, ipAddress, userAgent) {
	if (!challengeToken?.trim() || !code?.trim()) throw new HttpError(400, "Verification challenge token and authenticator code are required.");
	const tokenHash = hashSessionToken(challengeToken.trim());
	const challenge = await prisma.twoFactorChallenge.findUnique({
		where: { tokenHash },
		include: { user: true }
	});
	if (!challenge) throw new HttpError(401, "Invalid or expired 2FA session. Please sign in again.");
	if (challenge.expiresAt.getTime() < Date.now()) {
		await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } }).catch(() => {});
		throw new HttpError(401, "2FA verification challenge expired. Please sign in again.");
	}
	const user = challenge.user;
	if (user.status !== "ACTIVE") throw new HttpError(403, "This account has been deactivated. Contact an administrator.");
	if (challenge.adminMode && user.role !== "ADMIN") throw new HttpError(403, "Access Denied: Administrator role required.");
	if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new HttpError(400, "Two-factor authentication is not enabled for this account.");
	const totpCheck = verifyTotpCode(decryptSecret(user.twoFactorSecret), code, 1);
	if (totpCheck.valid) {
		if (user.twoFactorLastCounter !== null && totpCheck.counter <= user.twoFactorLastCounter) {
			await recordAudit({
				userId: user.id,
				actorName: user.name,
				action: "LOGIN_2FA_REPLAY_BLOCKED",
				details: `Blocked replayed 2FA TOTP code for ${user.username}`,
				ipAddress
			});
			throw new HttpError(401, "This verification code has already been used. Wait for the next 30-second code.");
		}
		await prisma.user.update({
			where: { id: user.id },
			data: {
				twoFactorLastCounter: totpCheck.counter,
				lastLoginAt: /* @__PURE__ */ new Date()
			}
		});
	} else {
		const recovery = consumeRecoveryCode(code, user.twoFactorRecoveryCodes);
		if (!recovery.valid) {
			await recordAudit({
				userId: user.id,
				actorName: user.username,
				action: "LOGIN_2FA_FAILED",
				details: `Invalid 2FA code attempt for ${user.username}`,
				ipAddress
			});
			throw new HttpError(401, "Invalid authenticator or recovery code.");
		}
		await prisma.user.update({
			where: { id: user.id },
			data: {
				twoFactorRecoveryCodes: recovery.remainingJson,
				lastLoginAt: /* @__PURE__ */ new Date()
			}
		});
		await recordAudit({
			userId: user.id,
			actorName: user.name,
			action: "LOGIN_2FA_RECOVERY_USED",
			details: `Signed in using a one-time recovery code (${recovery.remainingCount} remaining)`,
			ipAddress
		});
	}
	await prisma.twoFactorChallenge.deleteMany({ where: { id: challenge.id } }).catch(() => {});
	const token = await createSession(user.id, {
		ipAddress,
		userAgent
	});
	await recordAudit({
		userId: user.id,
		actorName: user.name,
		action: "LOGIN_2FA_SUCCESS",
		details: `${challenge.adminMode ? "Administrator" : "User"} verified 2FA from ${parseUserAgent(userAgent)} (${ipAddress || "local"})`,
		ipAddress
	});
	const expiresAtMs = Date.now() + SESSION_MAX_AGE_MS;
	return {
		requiresTwoFactor: false,
		token,
		user: stripSensitiveUserFields(user),
		expiresAt: new Date(expiresAtMs).toISOString(),
		expiresAtMs,
		redirectTo: user.role === "ADMIN" && challenge.adminMode ? "admin" : "repairs"
	};
}
async function getTwoFactorStatus(userId) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			twoFactorEnabled: true,
			twoFactorSecret: true,
			twoFactorRecoveryCodes: true
		}
	});
	if (!user) throw new HttpError(404, "User not found");
	return {
		enabled: Boolean(user.twoFactorEnabled),
		hasPendingSetup: !user.twoFactorEnabled && Boolean(user.twoFactorSecret),
		recoveryCodesRemaining: parseRecoveryHashes(user.twoFactorRecoveryCodes).length
	};
}
async function beginTwoFactorSetup(userId) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			username: true,
			email: true,
			twoFactorEnabled: true
		}
	});
	if (!user) throw new HttpError(404, "User not found");
	const secret = generateTotpSecret();
	const encrypted = encryptSecret(secret);
	await prisma.user.update({
		where: { id: userId },
		data: {
			twoFactorSecret: encrypted,
			twoFactorLastCounter: null
		}
	});
	const otpauthUri = buildOtpauthUri(secret, user.email || user.username, "Faso Fix POS");
	return {
		qrDataUrl: await renderQrSvgDataUrl(otpauthUri),
		manualSecret: secret,
		otpauthUri
	};
}
async function confirmTwoFactorSetup(userId, code, actorName, ipAddress) {
	const user = await prisma.user.findUnique({
		where: { id: userId },
		select: {
			id: true,
			username: true,
			twoFactorSecret: true
		}
	});
	if (!user || !user.twoFactorSecret) throw new HttpError(400, "Please initiate authenticator setup first.");
	const check = verifyTotpCode(decryptSecret(user.twoFactorSecret), code, 1);
	if (!check.valid) {
		await recordAudit({
			userId,
			actorName,
			action: "TWO_FACTOR_FAILED",
			details: `Failed 2FA enrollment confirmation for ${user.username}`,
			ipAddress
		});
		throw new HttpError(400, "Invalid 6-digit code. Check your authenticator clock and try again.");
	}
	const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
	await prisma.user.update({
		where: { id: userId },
		data: {
			twoFactorEnabled: true,
			twoFactorLastCounter: check.counter,
			twoFactorRecoveryCodes: JSON.stringify(hashedCodes)
		}
	});
	await recordAudit({
		userId,
		actorName,
		action: "TWO_FACTOR_ENABLED",
		details: `Enabled TOTP two-factor authentication for ${user.username}`,
		ipAddress
	});
	return {
		enabled: true,
		recoveryCodes: plainCodes
	};
}
async function disableTwoFactor(userId, currentPassword, code, actorName, currentToken, ipAddress) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new HttpError(404, "User not found");
	if (!user.twoFactorEnabled || !user.twoFactorSecret) throw new HttpError(400, "Two-factor authentication is not enabled.");
	if (!verifyPassword(currentPassword || "", user.passwordHash)) throw new HttpError(400, "Current password is incorrect.");
	const totpCheck = verifyTotpCode(decryptSecret(user.twoFactorSecret), code, 1);
	let validSecondFactor = totpCheck.valid && (user.twoFactorLastCounter === null || totpCheck.counter > user.twoFactorLastCounter);
	if (!validSecondFactor) validSecondFactor = consumeRecoveryCode(code, user.twoFactorRecoveryCodes).valid;
	if (!validSecondFactor) {
		await recordAudit({
			userId,
			actorName,
			action: "TWO_FACTOR_FAILED",
			details: `Rejected attempt to disable 2FA for ${user.username}`,
			ipAddress
		});
		throw new HttpError(400, "Valid authenticator or recovery code is required to disable 2FA.");
	}
	await prisma.user.update({
		where: { id: userId },
		data: {
			twoFactorEnabled: false,
			twoFactorSecret: null,
			twoFactorRecoveryCodes: null,
			twoFactorLastCounter: null
		}
	});
	await Promise.all([prisma.session.deleteMany({ where: {
		userId,
		...currentToken ? { token: { notIn: [hashSessionToken(currentToken), currentToken] } } : {}
	} }), prisma.twoFactorChallenge.deleteMany({ where: { userId } })]).catch(() => {});
	await recordAudit({
		userId,
		actorName,
		action: "TWO_FACTOR_DISABLED",
		details: `Disabled 2FA for ${user.username} and signed out other devices`,
		ipAddress
	});
	return { enabled: false };
}
async function regenerateRecoveryCodes(userId, currentPassword, code, actorName, ipAddress) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) throw new HttpError(400, "Two-factor authentication is not enabled.");
	if (!verifyPassword(currentPassword || "", user.passwordHash)) throw new HttpError(400, "Current password is incorrect.");
	const check = verifyTotpCode(decryptSecret(user.twoFactorSecret), code, 1);
	if (!check.valid || user.twoFactorLastCounter !== null && check.counter <= user.twoFactorLastCounter) throw new HttpError(400, "Valid fresh 6-digit authenticator code is required.");
	const { plainCodes, hashedCodes } = generateRecoveryCodes(8);
	await prisma.user.update({
		where: { id: userId },
		data: {
			twoFactorLastCounter: check.counter,
			twoFactorRecoveryCodes: JSON.stringify(hashedCodes)
		}
	});
	await recordAudit({
		userId,
		actorName,
		action: "TWO_FACTOR_RECOVERY_ROTATED",
		details: `Regenerated 2FA recovery codes for ${user.username}`,
		ipAddress
	});
	return { recoveryCodes: plainCodes };
}
async function adminResetUserTwoFactor(targetUserId, actor, ipAddress) {
	const user = await prisma.user.findUnique({ where: { id: targetUserId } });
	if (!user) throw new HttpError(404, "User not found");
	await prisma.user.update({
		where: { id: targetUserId },
		data: {
			twoFactorEnabled: false,
			twoFactorSecret: null,
			twoFactorRecoveryCodes: null,
			twoFactorLastCounter: null
		}
	});
	await Promise.all([prisma.session.deleteMany({ where: { userId: targetUserId } }), prisma.twoFactorChallenge.deleteMany({ where: { userId: targetUserId } })]).catch(() => {});
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "TWO_FACTOR_ADMIN_RESET",
		details: `Administrator ${actor.name} reset 2FA & terminated sessions for ${user.username}`,
		ipAddress
	});
	return { ok: true };
}
async function listUserSessions(userId, currentToken) {
	const currentHash = currentToken ? hashSessionToken(currentToken) : null;
	return (await prisma.session.findMany({
		where: {
			userId,
			expiresAt: { gt: /* @__PURE__ */ new Date() }
		},
		orderBy: { lastActiveAt: "desc" },
		select: {
			id: true,
			token: true,
			ipAddress: true,
			userAgent: true,
			lastActiveAt: true,
			expiresAt: true,
			createdAt: true
		}
	})).map((s) => ({
		id: s.id,
		device: parseUserAgent(s.userAgent),
		ipAddress: s.ipAddress || "Local / Unknown",
		lastActiveAt: s.lastActiveAt,
		expiresAt: s.expiresAt,
		createdAt: s.createdAt,
		isCurrent: Boolean(currentHash && (s.token === currentHash || s.token === currentToken))
	}));
}
async function revokeUserSession(userId, sessionId, actorName, ipAddress) {
	const target = await prisma.session.findFirst({ where: {
		id: sessionId,
		userId
	} });
	if (!target) throw new HttpError(404, "Session not found");
	await prisma.session.delete({ where: { id: sessionId } });
	await recordAudit({
		userId,
		actorName,
		action: "SESSION_REVOKED",
		details: `User signed out remote session ${sessionId.slice(0, 8)} (${parseUserAgent(target.userAgent)})`,
		ipAddress
	});
	return { ok: true };
}
async function revokeOtherUserSessions(userId, currentToken, actorName, ipAddress) {
	const result = await prisma.session.deleteMany({ where: {
		userId,
		...currentToken ? { token: { notIn: [hashSessionToken(currentToken), currentToken] } } : {}
	} });
	await recordAudit({
		userId,
		actorName,
		action: "SESSIONS_REVOKED_OTHER",
		details: `Signed out ${result.count} other device session(s)`,
		ipAddress
	});
	return { revokedCount: result.count };
}
async function listAllActiveSessions(currentToken) {
	const currentHash = currentToken ? hashSessionToken(currentToken) : null;
	return (await prisma.session.findMany({
		where: { expiresAt: { gt: /* @__PURE__ */ new Date() } },
		orderBy: { lastActiveAt: "desc" },
		take: 100,
		include: { user: { select: {
			id: true,
			username: true,
			name: true,
			role: true,
			twoFactorEnabled: true
		} } }
	})).map((s) => ({
		id: s.id,
		user: s.user,
		device: parseUserAgent(s.userAgent),
		ipAddress: s.ipAddress || "Local / Unknown",
		lastActiveAt: s.lastActiveAt,
		expiresAt: s.expiresAt,
		createdAt: s.createdAt,
		isCurrent: Boolean(currentHash && (s.token === currentHash || s.token === currentToken))
	}));
}
async function adminRevokeSessionById(sessionId, actor, ipAddress) {
	const target = await prisma.session.findUnique({
		where: { id: sessionId },
		include: { user: { select: { username: true } } }
	});
	if (!target) throw new HttpError(404, "Session not found");
	await prisma.session.delete({ where: { id: sessionId } });
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "ADMIN_SESSION_REVOKED",
		details: `Admin revoked session ${sessionId.slice(0, 8)} for ${target.user.username}`,
		ipAddress
	});
	return { ok: true };
}
async function adminRevokeUserSessions(targetUserId, actor, ipAddress) {
	const target = await prisma.user.findUnique({
		where: { id: targetUserId },
		select: { username: true }
	});
	if (!target) throw new HttpError(404, "User not found");
	const res = await prisma.session.deleteMany({ where: { userId: targetUserId } });
	await prisma.twoFactorChallenge.deleteMany({ where: { userId: targetUserId } }).catch(() => {});
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "ADMIN_USER_FORCE_LOGOUT",
		details: `Admin terminated ${res.count} session(s) for ${target.username}`,
		ipAddress
	});
	return { revokedCount: res.count };
}
async function verifyTerminalUnlock(userId, password, code, ipAddress) {
	if (!password) throw new HttpError(400, "Password is required to unlock this terminal.");
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user || user.status !== "ACTIVE") throw new HttpError(401, "Session is no longer active.");
	if (!verifyPassword(password, user.passwordHash)) {
		await recordAudit({
			userId,
			actorName: user.username,
			action: "UNLOCK_FAILED",
			details: `Invalid password on locked terminal unlock attempt for ${user.username}`,
			ipAddress
		});
		throw new HttpError(401, "Incorrect password.");
	}
	if (user.twoFactorEnabled && user.twoFactorSecret) {
		const rawCode = (code || "").trim();
		if (!rawCode) throw new HttpError(401, "Authenticator or recovery code is required to unlock.");
		const totpCheck = verifyTotpCode(decryptSecret(user.twoFactorSecret), rawCode, 1);
		if (totpCheck.valid) {
			if (user.twoFactorLastCounter !== null && totpCheck.counter <= user.twoFactorLastCounter) throw new HttpError(401, "This verification code has already been used. Wait for the next code.");
			await prisma.user.update({
				where: { id: userId },
				data: { twoFactorLastCounter: totpCheck.counter }
			});
		} else {
			const recovery = consumeRecoveryCode(rawCode, user.twoFactorRecoveryCodes);
			if (!recovery.valid) {
				await recordAudit({
					userId,
					actorName: user.username,
					action: "UNLOCK_FAILED",
					details: `Invalid 2FA code on locked terminal unlock attempt for ${user.username}`,
					ipAddress
				});
				throw new HttpError(401, "Invalid authenticator or recovery code.");
			}
			await prisma.user.update({
				where: { id: userId },
				data: { twoFactorRecoveryCodes: recovery.remainingJson }
			});
		}
	}
	return { unlocked: true };
}
async function getAdminSecurityPosture() {
	const since24h = /* @__PURE__ */ new Date(Date.now() - 864e5);
	const [users, activeSessionsCount, auditChain, failedLogins24h, recentAlerts, rlsRows] = await Promise.all([
		prisma.user.findMany({
			where: { status: "ACTIVE" },
			select: {
				id: true,
				username: true,
				role: true,
				passwordHash: true,
				twoFactorEnabled: true
			}
		}),
		prisma.session.count({ where: { expiresAt: { gt: /* @__PURE__ */ new Date() } } }),
		verifyAuditLogChain(200),
		prisma.auditLog.count({ where: {
			action: { in: [
				"LOGIN_FAILED",
				"LOGIN_2FA_FAILED",
				"UNLOCK_FAILED"
			] },
			createdAt: { gte: since24h }
		} }),
		prisma.auditLog.findMany({
			where: { action: { in: [
				"LOGIN_FAILED",
				"LOGIN_2FA_FAILED",
				"LOGIN_2FA_REPLAY_BLOCKED",
				"ADMIN_ACCESS_REJECTED",
				"UNLOCK_FAILED",
				"TWO_FACTOR_FAILED",
				"ADMIN_USER_FORCE_LOGOUT"
			] } },
			orderBy: { createdAt: "desc" },
			take: 15,
			select: {
				id: true,
				actorName: true,
				action: true,
				details: true,
				ipAddress: true,
				createdAt: true
			}
		}),
		isPostgres ? prisma.$queryRawUnsafe(`SELECT tablename, rowsecurity FROM pg_tables WHERE schemaname = 'public' ORDER BY tablename`) : Promise.resolve([])
	]);
	const twoFactorEnabledCount = users.filter((u) => u.twoFactorEnabled).length;
	const adminUsers = users.filter((u) => u.role === "ADMIN");
	const adminTwoFactorCount = adminUsers.filter((u) => u.twoFactorEnabled).length;
	const knownDefaultPasswords = ["Admin@FasoFix2026!", "Tech@FasoFix2026!"];
	const defaultPasswordAccounts = users.filter((u) => knownDefaultPasswords.some((pw) => verifyPassword(pw, u.passwordHash))).map((u) => u.username);
	const rlsTotal = rlsRows.length;
	const rlsProtected = rlsRows.filter((r) => r.rowsecurity).length;
	const databaseUrlConfigured = Boolean(process.env.DATABASE_URL?.trim());
	const fieldEncryptionKeyConfigured = Boolean(process.env.FIELD_ENCRYPTION_KEY?.trim());
	const controls = [
		{
			id: "rls",
			label: "PostgreSQL Row-Level Security (All Tables)",
			ok: isPostgres ? rlsTotal > 0 && rlsProtected === rlsTotal : true,
			detail: isPostgres ? `${rlsProtected}/${rlsTotal} tables locked` : "SQLite local mode"
		},
		{
			id: "hashed-sessions",
			label: "SHA-256 Hashed HttpOnly SameSite=Strict Cookies",
			ok: true,
			detail: `${activeSessionsCount} active session(s)`
		},
		{
			id: "csrf",
			label: "Origin & Custom-Header CSRF Defense",
			ok: true,
			detail: "Enforced on cookie mutations"
		},
		{
			id: "csp",
			label: "Strict Zero-Inline-Script CSP + HSTS",
			ok: true,
			detail: "script-src 'self' + HSTS preload"
		},
		{
			id: "audit-chain",
			label: "Tamper-Evident Audit Log SHA-256 Chain",
			ok: auditChain.intact,
			detail: `${auditChain.checked} entries verified, ${auditChain.tamperedCount} tampered`
		},
		{
			id: "brute-force",
			label: "Persistent DB Brute-Force Lockout & Rate Limiting",
			ok: true,
			detail: `${failedLogins24h} blocked/failed event(s) in 24h`
		},
		{
			id: "csv-xss",
			label: "CSV Formula Injection & Stored HTML XSS Guards",
			ok: true,
			detail: "CWE-1236 & escaped HTML outputs"
		},
		{
			id: "totp-2fa",
			label: "TOTP Authenticator 2FA Enrollment",
			ok: adminTwoFactorCount > 0,
			detail: `${twoFactorEnabledCount}/${users.length} active staff enrolled`
		},
		{
			id: "default-passwords",
			label: "All Staff Rotated Off Bootstrap Passwords",
			ok: defaultPasswordAccounts.length === 0,
			detail: defaultPasswordAccounts.length === 0 ? "All unique credentials" : `Still using default password: ${defaultPasswordAccounts.join(", ")}`
		},
		{
			id: "env-db",
			label: "Dedicated Production DATABASE_URL Configured",
			ok: databaseUrlConfigured,
			detail: databaseUrlConfigured ? "Configured in env" : "Using fallback URL until rotated"
		},
		{
			id: "env-vault",
			label: "Dedicated FIELD_ENCRYPTION_KEY Configured",
			ok: fieldEncryptionKeyConfigured,
			detail: fieldEncryptionKeyConfigured ? "v2 vault key active" : "Using v1 app-scoped key"
		}
	];
	return {
		provider: isPostgres ? "postgresql" : "sqlite",
		rls: {
			total: rlsTotal,
			enabled: rlsProtected,
			allEnabled: rlsTotal > 0 && rlsProtected === rlsTotal
		},
		auditChain,
		users: {
			totalActive: users.length,
			twoFactorEnabled: twoFactorEnabledCount,
			adminTotal: adminUsers.length,
			adminTwoFactorEnabled: adminTwoFactorCount,
			defaultPasswordAccounts
		},
		activeSessionsCount,
		failedLogins24h,
		env: {
			databaseUrlConfigured,
			fieldEncryptionKeyConfigured
		},
		controls,
		recentAlerts
	};
}
// src/utils/auth.ts
try {
	localStorage.removeItem("apexfix_session_token");
	localStorage.removeItem("apexfix_registered_users");
	localStorage.removeItem("apexfix_deleted_user_ids");
} catch {}
// src/utils/receipt.ts
var esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({
	"&": "&amp;",
	"<": "&lt;",
	">": "&gt;",
	"\"": "&quot;",
	"'": "&#39;"
})[c]);
var METHOD_LABEL = {
	CASH: "Cash",
	CARD: "Credit Card",
	DEBIT: "Debit",
	E_TRANSFER: "E-Transfer",
	OTHER: "Other"
};
/** Deterministic barcode pattern generation matching Barcode.tsx */
function generateBarcodeSvg(value, width = 160, height = 36) {
	const hash = value.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
	let barsHtml = "";
	let curX = 10;
	const totalWidth = width - 20;
	let i = 0;
	while (curX < totalWidth) {
		const w = (hash + i * 7) % 3 + 1;
		barsHtml += `<rect x="${curX}" y="2" width="${w}" height="${height - 12}" fill="#000000" />`;
		curX += w + ((hash + i * 13) % 2 + 1);
		i++;
	}
	return `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" style="display:block;margin:0 auto;overflow:visible">${barsHtml}</svg>`;
}
/** Builds a self-contained thermal receipt HTML document (public info only — never private bench notes or passcodes). */
function buildReceiptHtml(ticket, shop, width = "80mm") {
	const cur = shop.currencySymbol || "$";
	const money = (c) => `${c < 0 ? "-" : ""}${cur}${(Math.abs(c) / 100).toFixed(2)}`;
	const t = ticket.totals;
	const taxPct = ((t?.taxRateBps ?? ticket.taxRateBps ?? 0) / 100).toFixed(2);
	const row = (l, r, bold = false) => `<div class="row${bold ? " b" : ""}"><span>${l}</span><span>${r}</span></div>`;
	const items = (ticket.items || []).map((i) => `<div class="item"><div>${esc(i.description)}</div>${row(`&nbsp;&nbsp;${i.quantity} × ${money(i.unitPriceCents)}`, money(i.quantity * i.unitPriceCents))}</div>`).join("");
	const payments = (ticket.payments || []).map((p) => row(`${esc(METHOD_LABEL[p.method] || p.method)} ${new Date(p.createdAt).toLocaleDateString()}`, money(p.amountCents))).join("");
	const publicNotes = (ticket.events || []).filter((e) => e.kind === "CUSTOMER_NOTE").map((e) => `<div class="note">• ${esc(e.message)}</div>`).join("");
	const paperPx = width === "58mm" ? "58mm" : "80mm";
	const status = ticket.status === "CANCELLED" ? "CANCELLED" : ticket.status === "DECLINED" ? "DECLINED" : t ? t.balanceCents <= 0 ? "PAID IN FULL" : t.paidCents > 0 ? "PARTIALLY PAID" : "BALANCE DUE" : "";
	return `<!doctype html><html><head><meta charset="utf-8"><title>Receipt WO #${ticket.ticketNumber}</title>
<style>
@page { size: ${paperPx} auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; width: ${paperPx}; padding: 3mm 3mm 6mm; font: 12px/1.35 'Courier New', ui-monospace, monospace; color: #000; background: #fff; }
.c { text-align: center; } .b { font-weight: bold; }
h1 { font-size: 16px; margin: 0 0 2px; text-align: center; }
hr { border: 0; border-top: 1px dashed #000; margin: 6px 0; }
.row { display: flex; justify-content: space-between; gap: 6px; }
.row span:last-child { white-space: nowrap; }
.big { font-size: 15px; }
.item { margin-bottom: 3px; } .note { margin: 2px 0; }
.small { font-size: 10px; }
</style></head><body>
<h1>${esc(shop.shopName || "Faso Fix Electronics")}</h1>
${shop.address ? `<div class="c small">${esc(shop.address)}</div>` : ""}
${shop.phone ? `<div class="c small">${esc(shop.phone)}</div>` : ""}
${shop.email ? `<div class="c small">${esc(shop.email)}</div>` : ""}
<hr>
${row("Work Order", `#${ticket.ticketNumber}`, true)}
${row("Date", (/* @__PURE__ */ new Date()).toLocaleString())}
${row("Customer", esc(ticket.customer?.fullName))}
${row("Phone", esc(ticket.customer?.phone))}
${row("Device", esc(ticket.device?.name))}
${ticket.device?.serialNumber ? row("Serial/IMEI", esc(ticket.device.serialNumber)) : ""}
${ticket.isWarranty ? row("Coverage", "WARRANTY REPAIR", true) : ""}
<hr>
<div class="b">Issue</div><div>${esc(ticket.faultDescription)}</div>
${publicNotes ? `<hr><div class="b">Work Performed</div>${publicNotes}` : ""}
<hr>
${ticket.laborCents ? row("Labour", money(ticket.laborCents)) : ""}
${items}
${t ? `<hr>
${row("Subtotal", money(t.subtotalCents))}
${t.discountCents ? row("Discount", money(-t.discountCents)) : ""}
${row(`${esc(shop.taxLabel || "Tax")} (${taxPct}%)`, money(t.taxCents))}
<div class="big">${row("TOTAL", money(t.totalCents), true)}</div>
${payments ? `<hr><div class="b">Payments</div>${payments}` : ""}
${row("Paid", money(t.paidCents))}
<div class="big">${row("BALANCE", money(Math.max(t.balanceCents, 0)), true)}</div>
<div class="c b" style="margin-top:4px">*** ${status} ***</div>` : ""}
<hr>
<div class="c small">Thank you for your business!</div>
</body></html>`;
}
/** Builds a self-contained thermal bench slip / device sticker HTML. */
function buildBenchSlipHtml(ticket, shop) {
	const woBarcode = `WO-${String(ticket.ticketNumber).padStart(4, "0")}`;
	const barcodeSvg = generateBarcodeSvg(woBarcode, 180, 36);
	return `<!doctype html><html><head><meta charset="utf-8"><title>Bench Slip #${ticket.ticketNumber}</title>
<style>
@page { size: 80mm auto; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; width: 80mm; padding: 4mm 4mm 8mm; font: 12px/1.35 'Arial', system-ui, -apple-system, sans-serif; color: #000; background: #fff; }
.b { font-weight: bold; }
.header { display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid #000; padding-bottom: 4px; margin-bottom: 6px; }
.wo { font-size: 16px; font-weight: 900; }
.box { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 6px; padding: 6px; margin: 6px 0; font-family: monospace; font-size: 11px; }
.desc { font-style: italic; font-size: 11px; margin: 6px 0; line-height: 1.3; }
.barcode-box { text-align: center; margin-top: 8px; border-top: 1px dashed #64748b; padding-top: 6px; }
.footer { font-size: 9px; color: #475569; margin-top: 4px; font-family: monospace; }
</style></head><body>
<div class="header">
  <span class="b" style="font-size:12px">${esc(shop.shopName || "FASO FIX POS")}</span>
  <span class="wo">WO #${ticket.ticketNumber}</span>
</div>
<div style="font-size:14px;font-weight:900;margin-bottom:2px">${esc(ticket.customer?.fullName)}</div>
<div style="font-size:11px;color:#334155;margin-bottom:4px">
  ${esc(ticket.customer?.phone)}${ticket.customer?.altPhone ? ` / ${esc(ticket.customer.altPhone)}` : ""}
</div>
<div class="box">
  <div style="font-weight:bold;font-size:12px;font-family:sans-serif;margin-bottom:2px">${esc(ticket.device?.name || "Device")}</div>
  ${ticket.device?.passcode ? `<div><strong>PIN/Passcode:</strong> ${esc(ticket.device.passcode)}</div>` : ""}
  ${ticket.device?.pattern ? `<div><strong>Pattern Lock:</strong> ${esc(ticket.device.pattern)}</div>` : ""}
  ${ticket.device?.serialNumber ? `<div style="font-size:10px;color:#64748b">S/N: ${esc(ticket.device.serialNumber)}</div>` : ""}
</div>
<div class="desc">&ldquo;${esc(ticket.faultDescription)}&rdquo;</div>
<div class="barcode-box">
  ${barcodeSvg}
  <div style="font-family:monospace;font-size:10px;font-weight:bold;margin-top:2px">*${woBarcode}*</div>
  <div class="footer">DUE: ${new Date(ticket.dueDate).toLocaleDateString()} • BENCH #${esc(ticket.bench || "01")}</div>
</div>
</body></html>`;
}
/** Builds a full Letter (8.5×11) Work Order & Invoice HTML. */
function buildLetterInvoiceHtml(ticket, shop) {
	const cur = shop.currencySymbol || "$";
	const money = (c) => `${c < 0 ? "-" : ""}${cur}${(Math.abs(c) / 100).toFixed(2)}`;
	const t = ticket.totals || {
		subtotalCents: ticket.laborCents,
		laborCents: ticket.laborCents,
		itemsCents: 0,
		discountCents: ticket.discountCents || 0,
		taxRateBps: ticket.taxRateBps || 1300,
		taxCents: Math.round(ticket.laborCents * (ticket.taxRateBps || 1300) / 1e4),
		totalCents: ticket.laborCents + Math.round(ticket.laborCents * (ticket.taxRateBps || 1300) / 1e4),
		paidCents: 0,
		balanceCents: ticket.laborCents + Math.round(ticket.laborCents * (ticket.taxRateBps || 1300) / 1e4),
		paymentStatus: "UNPAID"
	};
	const isPaid = t.balanceCents <= 0;
	const woBarcode = `WO-${String(ticket.ticketNumber).padStart(4, "0")}`;
	const barcodeSvg = generateBarcodeSvg(woBarcode, 160, 36);
	const itemsHtml = (ticket.items || []).map((i) => `
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">${esc(i.description)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center">${i.quantity}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${money(i.unitPriceCents)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${money(i.quantity * i.unitPriceCents)}</td>
    </tr>
  `).join("");
	const paymentsHtml = (ticket.payments || []).map((p) => `
    <div style="display:flex;justify-content:space-between;font-size:11px;color:#334155;padding:2px 0">
      <span>${esc(METHOD_LABEL[p.method] || p.method)} (${new Date(p.createdAt).toLocaleDateString()})</span>
      <span style="font-weight:bold">${money(p.amountCents)}</span>
    </div>
  `).join("");
	return `<!doctype html><html><head><meta charset="utf-8"><title>Work Order #${ticket.ticketNumber}</title>
<style>
@page { size: letter portrait; margin: 10mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; font-size: 11px; color: #1e293b; background: #fff; line-height: 1.4; }
.header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #e2e8f0; padding-bottom: 12px; margin-bottom: 12px; }
.shop-name { font-size: 20px; font-weight: 900; color: #0f172a; line-height: 1.1; }
.badge { display: inline-block; padding: 3px 8px; font-size: 10px; font-weight: bold; border-radius: 4px; text-transform: uppercase; }
.badge-paid { background: #ecfdf5; color: #047857; border: 1px solid #a7f3d0; }
.badge-due { background: #fffbeb; color: #b45309; border: 1px solid #fde68a; }
.grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 10px; }
.grid-4 { display: grid; grid-template-columns: 1fr 1fr 1fr 1fr; gap: 8px; margin-bottom: 10px; }
.card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
.card-label { font-size: 9px; font-weight: bold; text-transform: uppercase; color: #64748b; margin-bottom: 2px; }
.card-val { font-size: 12px; font-weight: bold; color: #0f172a; }
table { width: 100%; border-collapse: collapse; font-size: 11px; }
th { background: #f1f5f9; padding: 6px 8px; text-align: left; font-size: 10px; text-transform: uppercase; color: #475569; border-bottom: 1px solid #cbd5e1; }
.totals-row { display: flex; justify-content: space-between; padding: 2px 0; font-size: 11px; }
.total-highlight { border-top: 2px solid #0f172a; margin-top: 6px; padding-top: 6px; display: flex; justify-content: space-between; font-size: 14px; font-weight: 900; }
.terms { font-size: 9px; color: #64748b; line-height: 1.35; margin-top: 14px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
.sig-box { border: 1px solid #cbd5e1; border-radius: 6px; height: 42px; padding: 4px; display: flex; align-items: center; justify-content: space-between; background: #fff; margin-top: 2px; }
</style></head><body>

<div class="header">
  <div>
    <div class="shop-name">${esc(shop.shopName || "Faso Fix POS")}</div>
    <div style="font-size:11px;color:#64748b;margin-top:2px">Diagnostics • Board-Level Repair • Micro-Soldering Lab</div>
    <div style="font-size:10px;color:#64748b">${esc(shop.address || "Ontario, Canada")}</div>
    ${shop.phone || shop.email ? `<div style="font-size:10px;color:#4f46e5;font-weight:600">${[shop.phone ? `Tel: ${esc(shop.phone)}` : "", shop.email ? esc(shop.email) : ""].filter(Boolean).join(" • ")}</div>` : ""}
  </div>
  <div style="text-align:right">
    ${ticket.isWarranty ? `<div class="badge" style="background:#eff6ff;color:#1d4ed8;border:1px solid #bfdbfe;margin-right:4px">WARRANTY REPAIR</div>` : ""}
    <div class="badge ${ticket.status === "CANCELLED" || ticket.status === "DECLINED" ? "badge-due" : isPaid ? "badge-paid" : "badge-due"}">
      ${ticket.status === "CANCELLED" ? "CANCELLED" : ticket.status === "DECLINED" ? "DECLINED" : isPaid ? "PAID • READY FOR RELEASE" : "INSPECTION / BALANCE DUE"}
    </div>
    <div style="margin-top:6px">${barcodeSvg}</div>
    <div style="font-family:monospace;font-size:10px;color:#64748b;margin-top:2px">*${woBarcode}*</div>
  </div>
</div>

<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
  <div style="font-size:13px;font-weight:900;text-transform:uppercase;letter-spacing:0.5px">Official Work Order &amp; Repair Invoice</div>
  <div style="font-size:12px;font-weight:bold;color:#4f46e5">Work Order #${ticket.ticketNumber}</div>
</div>

<div class="grid-4">
  <div class="card">
    <div class="card-label">Date Received</div>
    <div class="card-val">${new Date(ticket.createdAt).toLocaleDateString()}</div>
    <div style="font-size:9px;color:#64748b">${new Date(ticket.createdAt).toLocaleTimeString([], {
		hour: "2-digit",
		minute: "2-digit"
	})}</div>
  </div>
  <div class="card">
    <div class="card-label">Promised Date</div>
    <div class="card-val">${new Date(ticket.dueDate).toLocaleDateString()}</div>
    <div style="font-size:9px;color:#059669;font-weight:600">Priority: ${ticket.priority}</div>
  </div>
  <div class="card">
    <div class="card-label">Lead Technician</div>
    <div class="card-val">${esc(ticket.technician || "Shop Technician")}</div>
    <div style="font-size:9px;color:#64748b">Station: ${esc(ticket.bench || "Bench #01")}</div>
  </div>
  <div class="card">
    <div class="card-label">Payment Status</div>
    <div class="card-val" style="color:${isPaid ? "#059669" : "#d97706"}">${isPaid ? "PAID IN FULL" : "BALANCE DUE"}</div>
    <div style="font-size:9px;color:#64748b">Ref: #TXN-${ticket.ticketNumber}89</div>
  </div>
</div>

<div class="grid-2">
  <div class="card">
    <div class="card-label">Client Identification</div>
    <div style="font-size:13px;font-weight:bold">${esc(ticket.customer?.fullName)}</div>
    <div style="font-size:11px;color:#334155;margin-top:2px">Phone: ${esc(ticket.customer?.phone)}${ticket.customer?.altPhone ? ` (Alt: ${esc(ticket.customer.altPhone)})` : ""}</div>
    ${ticket.customer?.email ? `<div style="font-size:10px;color:#64748b">Email: ${esc(ticket.customer.email)}</div>` : ""}
    ${ticket.customer?.address ? `<div style="font-size:10px;color:#64748b">Address: ${esc(ticket.customer.address)}</div>` : ""}
  </div>
  <div class="card">
    <div class="card-label">Device Hardware Profile</div>
    <div style="display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:13px;font-weight:bold">${esc(ticket.device?.name || "Device")}</span>
      <span style="font-size:9px;background:#e2e8f0;padding:2px 6px;border-radius:3px;font-weight:bold">Verified</span>
    </div>
    <div style="font-size:11px;color:#334155;margin-top:4px">
      S/N: ${esc(ticket.device?.serialNumber || "N/A")}
    </div>
    <div style="font-size:11px;color:#4f46e5;font-weight:bold">
      Access Credentials: ${ticket.device?.passcode || ticket.device?.pattern ? "Protected • Encrypted on File" : "None / Unlocked"}
    </div>
    <div style="font-size:10px;color:#64748b;margin-top:2px">Condition: ${esc(ticket.device?.condition || "Standard")}</div>
  </div>
</div>

<div class="card" style="margin-bottom:10px">
  <div class="card-label">Phase 1 • Initial Physical &amp; Digital Intake</div>
  <div style="font-size:11px;color:#1e293b;margin-top:2px"><strong>Reported Issue:</strong> ${esc(ticket.faultDescription)}</div>
</div>

<table style="margin-bottom:10px">
  <thead>
    <tr>
      <th>Component / Scope of Work</th>
      <th style="text-align:center;width:60px">Qty</th>
      <th style="text-align:right;width:90px">Unit Price</th>
      <th style="text-align:right;width:90px">Total</th>
    </tr>
  </thead>
  <tbody>
    <tr>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0">
        <strong>Bench Labor &amp; Diagnostic Calibration</strong>
        <div style="font-size:9px;color:#64748b">Disassembly, microscopic board inspection, testing &amp; quality assurance</div>
      </td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:center">1</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right">${money(t.laborCents)}</td>
      <td style="padding:6px 8px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:bold">${money(t.laborCents)}</td>
    </tr>
    ${itemsHtml}
  </tbody>
</table>

<div class="grid-2" style="margin-bottom:10px">
  <div class="card">
    <div class="card-label">Payment &amp; Transaction Ledger</div>
    ${paymentsHtml || "<div style=\"font-size:10px;color:#64748b;padding:4px 0\">No prior deposits recorded</div>"}
    <div style="margin-top:8px;padding-top:6px;border-top:1px dashed #cbd5e1;display:flex;justify-content:space-between;font-weight:bold;font-size:11px">
      <span>Total Paid to Date:</span>
      <span style="color:#059669">${money(t.paidCents)}</span>
    </div>
  </div>

  <div class="card">
    <div class="card-label">Invoice Calculation Summary</div>
    <div class="totals-row">
      <span>Parts Subtotal:</span>
      <span>${money(t.itemsCents)}</span>
    </div>
    <div class="totals-row">
      <span>Labor Subtotal:</span>
      <span>${money(t.laborCents)}</span>
    </div>
    ${t.discountCents > 0 ? `
    <div class="totals-row" style="color:#e11d48">
      <span>Discount:</span>
      <span>-${money(t.discountCents)}</span>
    </div>` : ""}
    <div class="totals-row" style="border-top:1px solid #e2e8f0;padding-top:4px;font-weight:bold">
      <span>Subtotal (Pre-Tax):</span>
      <span>${money(t.taxableCents ?? Math.max(0, t.subtotalCents - (t.discountCents || 0)))}</span>
    </div>
    <div class="totals-row" style="color:#64748b;font-size:10px">
      <span>${esc(shop.taxLabel || "Sales Tax")} (${((t.taxRateBps ?? ticket.taxRateBps ?? 1300) / 100).toFixed(1)}%):</span>
      <span>+${money(t.taxCents)}</span>
    </div>
    <div class="total-highlight">
      <span>TOTAL INVOICE:</span>
      <span>${money(t.totalCents)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:11px;font-weight:bold;margin-top:4px;color:${t.balanceCents > 0 ? "#d97706" : "#059669"}">
      <span>BALANCE DUE:</span>
      <span>${money(Math.max(t.balanceCents, 0))}</span>
    </div>
  </div>
</div>

<div class="grid-2">
  <div>
    <div class="card-label">Lead Technician Sign-off</div>
    <div class="sig-box">
      <div style="font-weight:bold;font-style:italic;color:#4338ca;font-size:12px">${esc(ticket.technician || "Shop Technician")}</div>
      <div style="font-size:9px;color:#64748b;font-family:monospace">DIGITALLY CERTIFIED • ${esc(ticket.bench || "Bench 01")}</div>
    </div>
  </div>
  <div>
    <div class="card-label">Customer Acceptance</div>
    <div class="sig-box">
      ${ticket.signature ? `<img src="${ticket.signature}" style="height:34px;object-fit:contain" alt="Signature" />` : "<div style=\"font-size:10px;color:#64748b;font-style:italic\">Signature on electronic intake acknowledgment</div>"}
      <div style="font-size:9px;color:#059669;font-weight:bold">VERIFIED</div>
    </div>
  </div>
</div>

</body></html>`;
}
// src/server/index.ts
var app = express();
app.disable("x-powered-by");
var PORT = process.env.PORT || 4e3;
var SESSION_COOKIE_NAME = "fasofix_session";
var CSRF_HEADER_NAME = "x-requested-with";
var CSRF_HEADER_VALUE = "FasoFixPOS";
var ZERO_SCRIPT_HTML_CSP = "default-src 'none'; style-src 'unsafe-inline'; img-src data:; frame-ancestors 'none'; base-uri 'none'; form-action 'none'";
var STATIC_ALLOWED_ORIGINS = /* @__PURE__ */ new Set([
	"https://fasodesk.repair",
	"https://www.fasodesk.repair",
	"https://faso-fix-pos.vercel.app",
	...(process.env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean)
]);
function isOriginAllowed(origin) {
	if (STATIC_ALLOWED_ORIGINS.has(origin)) return true;
	if (!process.env.VERCEL && /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
	return false;
}
function parseCookies(cookieHeader) {
	const out = {};
	if (!cookieHeader) return out;
	for (const part of cookieHeader.split(";")) {
		const idx = part.indexOf("=");
		if (idx <= 0) continue;
		const key = part.slice(0, idx).trim();
		const val = part.slice(idx + 1).trim();
		if (!key) continue;
		try {
			out[key] = decodeURIComponent(val);
		} catch {
			out[key] = val;
		}
	}
	return out;
}
function shouldUseSecureCookie(req) {
	if (process.env.VERCEL || req.secure) return true;
	const proto = req.headers["x-forwarded-proto"];
	if (typeof proto === "string" && proto.split(",")[0].trim().toLowerCase() === "https") return true;
	return false;
}
function setSessionCookie(req, res, token) {
	const parts = [
		`${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`,
		"HttpOnly",
		"SameSite=Strict",
		"Path=/",
		"Max-Age=86400"
	];
	if (shouldUseSecureCookie(req)) parts.push("Secure");
	res.setHeader("Set-Cookie", parts.join("; "));
}
function clearSessionCookie(req, res) {
	const parts = [
		`${SESSION_COOKIE_NAME}=`,
		"HttpOnly",
		"SameSite=Strict",
		"Path=/",
		"Max-Age=0"
	];
	if (shouldUseSecureCookie(req)) parts.push("Secure");
	res.setHeader("Set-Cookie", parts.join("; "));
}
app.use(cors({
	origin(origin, callback) {
		if (!origin) return callback(null, false);
		if (isOriginAllowed(origin)) return callback(null, origin);
		return callback(null, false);
	},
	credentials: true,
	methods: [
		"GET",
		"POST",
		"PUT",
		"PATCH",
		"DELETE",
		"OPTIONS"
	],
	allowedHeaders: [
		"Content-Type",
		"Authorization",
		"X-Requested-With",
		"X-Idempotency-Key"
	]
}));
var largeJsonParser = express.json({ limit: "5mb" });
var defaultJsonParser = express.json({ limit: "256kb" });
app.use((req, res, next) => {
	const pathStr = req.path || "";
	if (pathStr === "/api/tickets" || /^\/api\/tickets\/[^/]+$/.test(pathStr) || /^\/api\/tickets\/[^/]+\/photos$/.test(pathStr)) return largeJsonParser(req, res, next);
	return defaultJsonParser(req, res, next);
});
app.use((_req, res, next) => {
	res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
	res.setHeader("Pragma", "no-cache");
	res.setHeader("Expires", "0");
	res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
	res.setHeader("X-Content-Type-Options", "nosniff");
	res.setHeader("X-Frame-Options", "DENY");
	res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
	res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), interest-cohort=()");
	res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
	res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
	res.setHeader("X-Permitted-Cross-Domain-Policies", "none");
	res.setHeader("X-DNS-Prefetch-Control", "off");
	res.setHeader("Content-Security-Policy", "default-src 'none'; frame-ancestors 'none'");
	next();
});
var apiBurstBuckets = /* @__PURE__ */ new Map();
var API_BURST_WINDOW_MS = 6e4;
var API_BURST_MAX_REQ = 600;
app.use("/api", (req, res, next) => {
	const ip = getClientIp(req);
	if (process.env.NODE_ENV === "test" && (ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1")) return next();
	const now = Date.now();
	let bucket = apiBurstBuckets.get(ip);
	if (!bucket || bucket.resetAt <= now) {
		bucket = {
			count: 1,
			resetAt: now + API_BURST_WINDOW_MS
		};
		apiBurstBuckets.set(ip, bucket);
		if (apiBurstBuckets.size > 5e3) {
			const oldest = apiBurstBuckets.keys().next().value;
			if (oldest) apiBurstBuckets.delete(oldest);
		}
		return next();
	}
	bucket.count++;
	if (bucket.count > API_BURST_MAX_REQ) {
		const retryAfterSec = Math.max(1, Math.ceil((bucket.resetAt - now) / 1e3));
		res.setHeader("Retry-After", String(retryAfterSec));
		return res.status(429).json({
			success: false,
			error: "Too many requests. Please slow down."
		});
	}
	next();
});
app.use(async (req, _res, next) => {
	try {
		const authHeader = req.headers.authorization;
		let token;
		if (authHeader?.startsWith("Bearer ")) {
			token = authHeader.slice(7).trim();
			if (token) req.authMethod = "bearer";
		} else {
			const cookieToken = parseCookies(req.headers.cookie)[SESSION_COOKIE_NAME];
			if (cookieToken) {
				token = cookieToken;
				req.authMethod = "cookie";
			}
		}
		if (token) {
			req.token = token;
			const user = await authenticateSession(token);
			if (user) req.user = user;
			else req.sessionExpired = true;
		}
	} catch (err) {
		console.error("[Auth Middleware Error]", err);
	}
	next();
});
app.use("/api", (req, res, next) => {
	if (req.authMethod !== "cookie") return next();
	const method = req.method.toUpperCase();
	if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
	if (String(req.headers[CSRF_HEADER_NAME] || "") !== CSRF_HEADER_VALUE) return res.status(403).json({
		success: false,
		error: "CSRF validation failed: missing required request header."
	});
	const originHeader = req.headers.origin;
	const refererHeader = req.headers.referer;
	const sourceOrigin = typeof originHeader === "string" && originHeader ? originHeader : typeof refererHeader === "string" && refererHeader ? (() => {
		try {
			return new URL(refererHeader).origin;
		} catch {
			return "INVALID";
		}
	})() : null;
	if (sourceOrigin) {
		const requestHost = String(req.headers.host || "").toLowerCase();
		let matchesHost = false;
		try {
			matchesHost = new URL(sourceOrigin).host.toLowerCase() === requestHost;
		} catch {}
		if (!matchesHost && !isOriginAllowed(sourceOrigin)) return res.status(403).json({
			success: false,
			error: "CSRF validation failed: cross-origin request rejected."
		});
	}
	next();
});
var wrap = (fn) => {
	return (req, res, next) => {
		fn(req, res, next).catch(next);
	};
};
var requireAuth = (req, res, next) => {
	if (!req.user) return res.status(401).json({
		success: false,
		code: req.sessionExpired ? "SESSION_EXPIRED" : "AUTH_REQUIRED",
		error: req.sessionExpired ? "Your session has expired after 24 hours. Please log in again." : "Authentication required. Please log in."
	});
	next();
};
var requireAdmin = (req, res, next) => {
	if (!req.user) return res.status(401).json({
		success: false,
		code: req.sessionExpired ? "SESSION_EXPIRED" : "AUTH_REQUIRED",
		error: req.sessionExpired ? "Your session has expired after 24 hours. Please log in again." : "Authentication required. Please log in."
	});
	if (req.user.role !== "ADMIN") return res.status(403).json({
		success: false,
		error: "Access forbidden: Administrator privileges required."
	});
	next();
};
var getParam = (req, name) => {
	const val = req.params[name];
	return Array.isArray(val) ? val[0] : val || "";
};
var sseClients = [];
function broadcastLiveEvent(event, data = {}) {
	const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
	for (let i = sseClients.length - 1; i >= 0; i--) try {
		sseClients[i].res.write(payload);
	} catch {
		sseClients.splice(i, 1);
	}
}
app.get("/api/live/stream", requireAuth, (req, res) => {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		"Connection": "keep-alive"
	});
	res.write(`event: connected\ndata: ${JSON.stringify({
		status: "connected",
		time: Date.now()
	})}\n\n`);
	const clientId = crypto$1.randomUUID();
	const client = {
		id: clientId,
		res
	};
	sseClients.push(client);
	const heartbeat = setInterval(() => {
		try {
			res.write(": heartbeat\n\n");
		} catch {
			clearInterval(heartbeat);
		}
	}, 15e3);
	req.on("close", () => {
		clearInterval(heartbeat);
		const index = sseClients.findIndex((c) => c.id === clientId);
		if (index !== -1) sseClients.splice(index, 1);
	});
});
function getClientIp(req) {
	try {
		if (process.env.VERCEL) {
			const vercelIp = req.headers["x-vercel-forwarded-for"];
			if (typeof vercelIp === "string" && vercelIp.trim()) return vercelIp.split(",")[0].trim();
			const realIp = req.headers["x-real-ip"];
			if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
		} else {
			const realIp = req.headers["x-real-ip"];
			if (typeof realIp === "string" && realIp.trim()) return realIp.trim();
			if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
			const forwarded = req.headers["x-forwarded-for"];
			if (typeof forwarded === "string" && forwarded.trim()) return forwarded.split(",")[0].trim();
		}
		return req.socket?.remoteAddress || req.ip || "127.0.0.1";
	} catch {
		return "127.0.0.1";
	}
}
var LOGIN_WINDOW_MS = 9e5;
var LOGIN_MAX_FAILS = 5;
var LOGIN_IP_MAX_FAILS = 30;
async function checkDbAttemptLimit(ip, actor, action) {
	const cutoff = /* @__PURE__ */ new Date(Date.now() - LOGIN_WINDOW_MS);
	const [userFailCount, ipFailCount] = await Promise.all([prisma.auditLog.count({ where: {
		action,
		ipAddress: ip,
		actorName: actor,
		createdAt: { gte: cutoff }
	} }), prisma.auditLog.count({ where: {
		action,
		ipAddress: ip,
		createdAt: { gte: cutoff }
	} })]);
	if (userFailCount >= LOGIN_MAX_FAILS || ipFailCount >= LOGIN_IP_MAX_FAILS) throw new HttpError(429, "Too many failed attempts. Please wait 15 minutes and try again.");
}
app.post("/api/auth/login", wrap(async (req, res) => {
	const ip = getClientIp(req);
	const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : void 0;
	const who = String(req.body?.usernameOrEmail || "").trim().toLowerCase().slice(0, 80) || "unknown";
	await checkDbAttemptLimit(ip, who, "LOGIN_FAILED");
	try {
		const result = await loginUser(req.body, ip, ua);
		await prisma.auditLog.deleteMany({ where: {
			action: "LOGIN_FAILED",
			ipAddress: ip,
			actorName: who
		} }).catch(() => {});
		if (result.requiresTwoFactor) return res.json({
			success: true,
			...result
		});
		if (req.token && result.token && req.token !== result.token) await destroySession(req.token).catch(() => {});
		if (result.token) setSessionCookie(req, res, result.token);
		res.json({
			success: true,
			...result
		});
	} catch (err) {
		if (err instanceof HttpError && err.status === 401) await recordAudit({
			action: "LOGIN_FAILED",
			actorName: who,
			ipAddress: ip,
			details: `Failed login attempt for ${who}`
		});
		throw err;
	}
}));
app.post("/api/auth/login/verify-2fa", wrap(async (req, res) => {
	const ip = getClientIp(req);
	const ua = typeof req.headers["user-agent"] === "string" ? req.headers["user-agent"] : void 0;
	const challengeToken = String(req.body?.challengeToken || "");
	const code = String(req.body?.code || "");
	const actorKey = challengeToken ? hashSessionToken(challengeToken).slice(0, 16) : "2fa";
	await checkDbAttemptLimit(ip, actorKey, "LOGIN_2FA_CHALLENGE_FAIL");
	try {
		const result = await verifyTwoFactorLogin(challengeToken, code, ip, ua);
		await prisma.auditLog.deleteMany({ where: {
			action: "LOGIN_2FA_CHALLENGE_FAIL",
			ipAddress: ip
		} }).catch(() => {});
		if (req.token && result.token && req.token !== result.token) await destroySession(req.token).catch(() => {});
		setSessionCookie(req, res, result.token);
		res.json({
			success: true,
			...result
		});
	} catch (err) {
		if (err instanceof HttpError && err.status === 401) await recordAudit({
			action: "LOGIN_2FA_CHALLENGE_FAIL",
			actorName: actorKey,
			ipAddress: ip,
			details: "Failed 2FA verification challenge attempt"
		});
		throw err;
	}
}));
app.post("/api/auth/logout", wrap(async (req, res) => {
	const token = req.token;
	if (token) await logoutUser(token, req.user?.name);
	clearSessionCookie(req, res);
	res.json({
		success: true,
		message: "Logged out successfully"
	});
}));
app.get("/api/auth/me", wrap(async (req, res) => {
	if (!req.user) return res.json({
		success: true,
		authenticated: false,
		user: null
	});
	res.json({
		success: true,
		authenticated: true,
		user: req.user
	});
}));
app.put("/api/auth/profile", requireAuth, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const { name, email, phone, bench, bio, preferences } = req.body || {};
	const sanitizedProfile = {};
	if (name !== void 0) sanitizedProfile.name = name;
	if (email !== void 0) sanitizedProfile.email = email;
	if (phone !== void 0) sanitizedProfile.phone = phone;
	if (bench !== void 0) sanitizedProfile.bench = bench;
	if (bio !== void 0) sanitizedProfile.bio = bio;
	if (preferences !== void 0) sanitizedProfile.preferences = preferences;
	const updated = await updateUser(req.user.id, sanitizedProfile, actor);
	res.json({
		success: true,
		user: updated
	});
}));
app.put("/api/auth/password", requireAuth, wrap(async (req, res) => {
	const ip = getClientIp(req);
	await checkDbAttemptLimit(ip, req.user.username, "PASSWORD_FAILED");
	try {
		const result = await changeUserPassword(req.user.id, req.body, req.user.name, req.token);
		await prisma.auditLog.deleteMany({ where: {
			action: "PASSWORD_FAILED",
			ipAddress: ip,
			actorName: req.user.username
		} }).catch(() => {});
		res.json(result);
	} catch (err) {
		if (err instanceof HttpError && err.status === 400) await recordAudit({
			userId: req.user.id,
			actorName: req.user.username,
			action: "PASSWORD_FAILED",
			ipAddress: ip,
			details: `Failed password change attempt for ${req.user.username}`
		});
		throw err;
	}
}));
app.put("/api/auth/preferences", requireAuth, wrap(async (req, res) => {
	const updated = await updateUserPreferences(req.user.id, req.body.preferences || req.body);
	res.json({
		success: true,
		preferences: updated.preferences
	});
}));
app.get("/api/auth/2fa/status", requireAuth, wrap(async (req, res) => {
	const data = await getTwoFactorStatus(req.user.id);
	res.json({
		success: true,
		data
	});
}));
app.post("/api/auth/2fa/setup", requireAuth, wrap(async (req, res) => {
	const data = await beginTwoFactorSetup(req.user.id);
	res.json({
		success: true,
		data
	});
}));
app.post("/api/auth/2fa/confirm", requireAuth, wrap(async (req, res) => {
	const ip = getClientIp(req);
	await checkDbAttemptLimit(ip, req.user.name, "TWO_FACTOR_FAILED");
	const data = await confirmTwoFactorSetup(req.user.id, String(req.body?.code || ""), req.user.name, ip);
	await prisma.auditLog.deleteMany({ where: {
		action: "TWO_FACTOR_FAILED",
		ipAddress: ip,
		actorName: req.user.name
	} }).catch(() => {});
	res.json({
		success: true,
		data
	});
}));
app.post("/api/auth/2fa/disable", requireAuth, wrap(async (req, res) => {
	const ip = getClientIp(req);
	await checkDbAttemptLimit(ip, req.user.name, "TWO_FACTOR_FAILED");
	const data = await disableTwoFactor(req.user.id, String(req.body?.currentPassword || ""), String(req.body?.code || ""), req.user.name, req.token, ip);
	res.json({
		success: true,
		data
	});
}));
app.post("/api/auth/2fa/recovery", requireAuth, wrap(async (req, res) => {
	const ip = getClientIp(req);
	await checkDbAttemptLimit(ip, req.user.name, "TWO_FACTOR_FAILED");
	const data = await regenerateRecoveryCodes(req.user.id, String(req.body?.currentPassword || ""), String(req.body?.code || ""), req.user.name, ip);
	res.json({
		success: true,
		data
	});
}));
app.get("/api/auth/sessions", requireAuth, wrap(async (req, res) => {
	const sessions = await listUserSessions(req.user.id, req.token);
	res.json({
		success: true,
		data: sessions
	});
}));
app.delete("/api/auth/sessions/other", requireAuth, wrap(async (req, res) => {
	const result = await revokeOtherUserSessions(req.user.id, req.token, req.user.name, getClientIp(req));
	res.json({
		success: true,
		data: result
	});
}));
app.delete("/api/auth/sessions/:id", requireAuth, wrap(async (req, res) => {
	const result = await revokeUserSession(req.user.id, getParam(req, "id"), req.user.name, getClientIp(req));
	res.json({
		success: true,
		data: result
	});
}));
app.post("/api/auth/verify-unlock", requireAuth, wrap(async (req, res) => {
	const ip = getClientIp(req);
	await checkDbAttemptLimit(ip, req.user.username, "UNLOCK_FAILED");
	const result = await verifyTerminalUnlock(req.user.id, String(req.body?.password || ""), req.body?.code !== void 0 ? String(req.body.code) : void 0, ip);
	await prisma.auditLog.deleteMany({ where: {
		action: "UNLOCK_FAILED",
		ipAddress: ip,
		actorName: req.user.username
	} }).catch(() => {});
	res.json({
		success: true,
		...result
	});
}));
app.get("/api/admin/overview", requireAdmin, wrap(async (_req, res) => {
	const overview = await getAdminOverview();
	res.json({
		success: true,
		data: overview
	});
}));
app.get("/api/users", requireAuth, wrap(async (_req, res) => {
	const users = await listUsers({}, false);
	res.json({
		success: true,
		count: users.length,
		data: users,
		users
	});
}));
app.post("/api/sync/users", requireAdmin, wrap(async (req, res) => {
	const { deletedUserIds } = req.body || {};
	if (Array.isArray(deletedUserIds) && deletedUserIds.length > 0) {
		const safeDeletedIds = deletedUserIds.filter((id) => typeof id === "string" && id.length > 0 && id !== req.user.id);
		if (safeDeletedIds.length > 0) {
			await prisma.session.deleteMany({ where: { userId: { in: safeDeletedIds } } }).catch(() => {});
			await prisma.user.deleteMany({ where: { id: { in: safeDeletedIds } } }).catch(() => {});
		}
	}
	const allUsers = await listUsers({}, false);
	res.json({
		success: true,
		count: allUsers.length,
		data: allUsers
	});
}));
app.get("/api/admin/users", requireAdmin, wrap(async (req, res) => {
	const search = req.query.search;
	const role = req.query.role;
	const status = req.query.status;
	const users = await listUsers({
		search,
		role,
		status
	}, false);
	res.json({
		success: true,
		count: users.length,
		data: users
	});
}));
app.post("/api/admin/users", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const user = await createUser(req.body, actor);
	res.status(201).json({
		success: true,
		data: user
	});
}));
app.get("/api/admin/users/:id", requireAdmin, wrap(async (req, res) => {
	const user = await getUser(getParam(req, "id"));
	res.json({
		success: true,
		data: user
	});
}));
app.put("/api/admin/users/:id", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const user = await updateUser(getParam(req, "id"), req.body, actor);
	res.json({
		success: true,
		data: user
	});
}));
app.delete("/api/admin/users/:id", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const result = await deleteUser(getParam(req, "id"), actor);
	res.json(result);
}));
app.post("/api/admin/users/:id/reset-password", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const result = await adminResetUserPassword(getParam(req, "id"), req.body, actor);
	res.json(result);
}));
app.get("/api/admin/audit-logs", requireAdmin, wrap(async (req, res) => {
	const hasPage = req.query.page !== void 0;
	const page = hasPage ? parseInt(req.query.page, 10) || 1 : 1;
	const pageSize = req.query.pageSize ? parseInt(req.query.pageSize, 10) : req.query.limit ? parseInt(req.query.limit, 10) : hasPage ? 25 : 100;
	const action = req.query.action;
	const search = req.query.search;
	const result = await listAuditLogsPaginated({
		page,
		pageSize,
		action,
		search
	});
	res.json({
		success: true,
		count: result.items.length,
		total: result.total,
		page: result.page,
		pageSize: result.pageSize,
		totalPages: result.totalPages,
		hasMore: result.hasMore,
		data: result.items
	});
}));
app.get("/api/admin/security/posture", requireAdmin, wrap(async (_req, res) => {
	const posture = await getAdminSecurityPosture();
	res.json({
		success: true,
		data: posture
	});
}));
app.get("/api/admin/sessions", requireAdmin, wrap(async (req, res) => {
	const sessions = await listAllActiveSessions(req.token);
	res.json({
		success: true,
		data: sessions
	});
}));
app.delete("/api/admin/sessions/:id", requireAdmin, wrap(async (req, res) => {
	const result = await adminRevokeSessionById(getParam(req, "id"), {
		id: req.user.id,
		name: req.user.name
	}, getClientIp(req));
	res.json({
		success: true,
		data: result
	});
}));
app.post("/api/admin/users/:id/revoke-sessions", requireAdmin, wrap(async (req, res) => {
	const result = await adminRevokeUserSessions(getParam(req, "id"), {
		id: req.user.id,
		name: req.user.name
	}, getClientIp(req));
	res.json({
		success: true,
		data: result
	});
}));
app.post("/api/admin/users/:id/reset-2fa", requireAdmin, wrap(async (req, res) => {
	const result = await adminResetUserTwoFactor(getParam(req, "id"), {
		id: req.user.id,
		name: req.user.name
	}, getClientIp(req));
	res.json({
		success: true,
		data: result
	});
}));
app.get("/api/dashboard", requireAuth, wrap(async (_req, res) => {
	const data = await getDashboard();
	res.json({
		success: true,
		data
	});
}));
app.get("/api/stats", requireAuth, wrap(async (_req, res) => {
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
			customerCount: data.customerCount
		}
	});
}));
app.get("/api/reports", requireAuth, wrap(async (req, res) => {
	const data = await getReport(req.query.days ? parseInt(req.query.days, 10) : 30);
	res.json({
		success: true,
		data
	});
}));
app.get("/api/settings", requireAuth, wrap(async (_req, res) => {
	const settings = await getSettings();
	res.json({
		success: true,
		data: settings
	});
}));
app.put("/api/settings", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const settings = await updateSettings(req.body, actor);
	broadcastLiveEvent("settings_updated", settings);
	res.json({
		success: true,
		data: settings
	});
}));
app.get("/api/tickets", requireAuth, wrap(async (req, res) => {
	const view = req.query.view || req.query.status || "OPEN";
	const search = req.query.search;
	const bench = req.query.bench;
	const sort = req.query.sort;
	const warranty = req.query.warranty;
	const hasPage = req.query.page !== void 0;
	const result = await listTicketsPaginated({
		view,
		search,
		bench,
		sort,
		warranty,
		page: hasPage ? parseInt(req.query.page, 10) || 1 : 1,
		pageSize: req.query.pageSize ? parseInt(req.query.pageSize, 10) : req.query.limit ? parseInt(req.query.limit, 10) : hasPage ? 25 : 200
	});
	res.json({
		success: true,
		count: result.items.length,
		total: result.total,
		page: result.page,
		pageSize: result.pageSize,
		totalPages: result.totalPages,
		hasMore: result.hasMore,
		data: result.items
	});
}));
app.get("/api/tickets/:id", requireAuth, wrap(async (req, res) => {
	const ticket = await getTicket(getParam(req, "id"));
	res.json({
		success: true,
		data: ticket
	});
}));
app.get("/api/tickets/:id/print", requireAuth, wrap(async (req, res) => {
	let ticket = null;
	try {
		ticket = await getTicket(getParam(req, "id"));
	} catch {
		res.setHeader("Content-Type", "text/html; charset=utf-8");
		res.setHeader("Content-Security-Policy", ZERO_SCRIPT_HTML_CSP);
		return res.status(200).send(`
      <!doctype html><html><head><title>Print Preview</title></head>
      <body style="font-family:sans-serif;padding:40px;text-align:center;color:#334155">
        <h2 style="color:#0f172a">Faso Fix POS • Print Dispatch</h2>
        <p>Work order not found in active database records. Please close this tab and click Print from your open work order screen.</p>
      </body></html>
    `);
	}
	const shop = await getSettings();
	const format = req.query.format || "letter";
	let html = "";
	if (format === "80mm") html = buildReceiptHtml(ticket, shop, "80mm");
	else if (format === "58mm") html = buildReceiptHtml(ticket, shop, "58mm");
	else if (format === "slip" || format === "bench") html = buildBenchSlipHtml(ticket, shop);
	else html = buildLetterInvoiceHtml(ticket, shop);
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Content-Security-Policy", ZERO_SCRIPT_HTML_CSP);
	res.send(html);
}));
app.post("/api/tickets", requireAuth, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const ticket = await createTicket(req.body, actor);
	broadcastLiveEvent("ticket_created", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.put("/api/tickets/:id", requireAuth, wrap(async (req, res) => {
	const ticket = await updateTicket(getParam(req, "id"), req.body, req.user.name, req.user.id);
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		data: ticket
	});
}));
app.delete("/api/tickets/:id", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const ticketId = getParam(req, "id");
	const result = await deleteTicket(ticketId, actor.name);
	await recordAudit({
		userId: actor.id,
		actorName: actor.name,
		action: "TICKET_DELETE",
		details: `Administrator deleted work order ${ticketId}`
	});
	broadcastLiveEvent("ticket_deleted", { id: ticketId });
	res.json({
		success: true,
		data: result
	});
}));
app.post("/api/tickets/:id/quick-complete", requireAuth, wrap(async (req, res) => {
	const ticket = await updateTicket(getParam(req, "id"), { status: "COMPLETED" }, req.user.name, req.user.id);
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		message: "Work order marked completed",
		data: ticket
	});
}));
app.post("/api/tickets/:id/items", requireAuth, wrap(async (req, res) => {
	const ticket = await addItem(getParam(req, "id"), req.body, req.user.name);
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/parts", requireAuth, wrap(async (req, res) => {
	const { partId, customName, price, quantity } = req.body;
	const ticket = await addItem(getParam(req, "id"), {
		partId: partId || void 0,
		description: customName || void 0,
		unitPriceCents: price !== void 0 ? Math.round(Number(price) * 100) : void 0,
		quantity: quantity ? Number(quantity) : 1
	}, req.user.name);
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.delete("/api/tickets/:id/items/:itemId", requireAuth, wrap(async (req, res) => {
	const ticket = await removeItem(getParam(req, "id"), getParam(req, "itemId"), req.user.name);
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/payments", requireAuth, wrap(async (req, res) => {
	const body = req.body || {};
	const amountCents = body.amountCents ?? (body.amount !== void 0 ? Math.round(Number(body.amount) * 100) : void 0);
	const idempotencyKey = body.idempotencyKey || req.headers["x-idempotency-key"];
	const ticket = await addPayment(getParam(req, "id"), {
		amountCents,
		method: body.method || "CASH",
		note: body.note,
		idempotencyKey
	}, req.user.name, req.user.id);
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/refund", requireAdmin, wrap(async (req, res) => {
	const body = req.body || {};
	const amountCents = body.amountCents ?? (body.amount !== void 0 ? Math.round(Number(body.amount) * 100) : void 0);
	const idempotencyKey = body.idempotencyKey || req.headers["x-idempotency-key"];
	const ticket = await refundPayment(getParam(req, "id"), {
		amountCents,
		method: body.method || "CARD",
		reason: body.reason,
		idempotencyKey
	}, req.user.name, req.user.id);
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.delete("/api/tickets/:id/payments/:paymentId", requireAdmin, wrap(async (req, res) => {
	const ticket = await voidPayment(getParam(req, "id"), getParam(req, "paymentId"), req.user.name, req.user.id);
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/photos", requireAuth, wrap(async (req, res) => {
	const ticket = await addPhoto(getParam(req, "id"), req.body, req.user.name, req.user.id);
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/notes", requireAuth, wrap(async (req, res) => {
	const { note, message, type, kind } = req.body;
	const noteKind = kind || (type === "CUSTOMER" ? "CUSTOMER_NOTE" : "INTERNAL_NOTE");
	const ticket = await addNote(getParam(req, "id"), {
		kind: noteKind,
		message: message || note || ""
	}, req.user.name);
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/notify", requireAuth, wrap(async (req, res) => {
	const { message, customerPhone } = req.body;
	const ticket = await addNote(getParam(req, "id"), {
		kind: "MESSAGE",
		message: `[SMS to ${customerPhone || "Customer"}]: ${message}`
	}, req.user.name);
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		message: `Notification sent to ${customerPhone}`,
		data: ticket
	});
}));
app.put("/api/tickets/:id/notes/:noteId", requireAuth, wrap(async (req, res) => {
	const { message } = req.body;
	if (!message || !message.trim()) return res.status(400).json({
		success: false,
		error: "Note message cannot be empty"
	});
	const ticket = await updateNote(getParam(req, "id"), getParam(req, "noteId"), message);
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		data: ticket
	});
}));
app.delete("/api/tickets/:id/notes/:noteId", requireAuth, wrap(async (req, res) => {
	const ticket = await deleteNote(getParam(req, "id"), getParam(req, "noteId"));
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		data: ticket
	});
}));
app.get("/api/customers", requireAuth, wrap(async (req, res) => {
	const search = req.query.search;
	const includeArchived = req.query.includeArchived === "true";
	const hasPage = req.query.page !== void 0;
	const result = await listCustomersPaginated({
		search,
		includeArchived,
		page: hasPage ? parseInt(req.query.page, 10) || 1 : 1,
		pageSize: req.query.pageSize ? parseInt(req.query.pageSize, 10) : req.query.limit ? parseInt(req.query.limit, 10) : hasPage ? 25 : 200
	});
	res.json({
		success: true,
		count: result.items.length,
		total: result.total,
		page: result.page,
		pageSize: result.pageSize,
		totalPages: result.totalPages,
		hasMore: result.hasMore,
		data: result.items
	});
}));
app.get("/api/customers/lookup", requireAuth, wrap(async (req, res) => {
	const customer = await lookupCustomerByPhone(req.query.phone || "");
	res.json({
		success: true,
		data: customer
	});
}));
app.get("/api/customers/:id", requireAuth, wrap(async (req, res) => {
	const customer = await getCustomer(getParam(req, "id"));
	res.json({
		success: true,
		data: customer
	});
}));
app.put("/api/customers/:id", requireAuth, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const customer = await updateCustomer(getParam(req, "id"), req.body, actor);
	broadcastLiveEvent("customer_updated", customer);
	res.json({
		success: true,
		data: customer
	});
}));
app.post("/api/customers/:id/archive", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const customer = await archiveCustomer(getParam(req, "id"), true, actor);
	broadcastLiveEvent("customer_updated", customer);
	res.json({
		success: true,
		data: customer
	});
}));
app.post("/api/customers/:id/unarchive", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const customer = await archiveCustomer(getParam(req, "id"), false, actor);
	broadcastLiveEvent("customer_updated", customer);
	res.json({
		success: true,
		data: customer
	});
}));
app.get("/api/inventory", requireAuth, wrap(async (req, res) => {
	const search = req.query.search;
	const parts = await listParts(search);
	res.json({
		success: true,
		count: parts.length,
		data: parts
	});
}));
app.post("/api/inventory", requireAuth, wrap(async (req, res) => {
	const body = req.body || {};
	const costCents = body.costCents ?? (body.cost !== void 0 ? Math.round(Number(body.cost) * 100) : 0);
	const priceCents = body.priceCents ?? (body.retail !== void 0 ? Math.round(Number(body.retail) * 100) : body.price !== void 0 ? Math.round(Number(body.price) * 100) : 0);
	const stock = body.stock ?? (body.stockQuantity !== void 0 ? Number(body.stockQuantity) : 0);
	const reorderPoint = body.reorderPoint !== void 0 ? Number(body.reorderPoint) : 2;
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const part = await createPart({
		sku: body.sku,
		name: body.name,
		category: body.category || "GENERAL",
		costCents,
		priceCents,
		stock,
		reorderPoint,
		supplier: body.supplier
	}, actor);
	broadcastLiveEvent("inventory_updated", part);
	res.status(201).json({
		success: true,
		data: part
	});
}));
app.put("/api/inventory/:id", requireAuth, wrap(async (req, res) => {
	const body = req.body || {};
	const updateData = { ...body };
	if (body.cost !== void 0 && body.costCents === void 0) {
		updateData.costCents = Math.round(Number(body.cost) * 100);
		delete updateData.cost;
	}
	if (body.retail !== void 0 && body.priceCents === void 0) {
		updateData.priceCents = Math.round(Number(body.retail) * 100);
		delete updateData.retail;
	}
	if (body.stockQuantity !== void 0 && body.stock === void 0) {
		updateData.stock = Number(body.stockQuantity);
		delete updateData.stockQuantity;
	}
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const part = await updatePart(getParam(req, "id"), updateData, actor);
	broadcastLiveEvent("inventory_updated", part);
	res.json({
		success: true,
		data: part
	});
}));
app.post("/api/inventory/:id/adjust", requireAuth, wrap(async (req, res) => {
	const delta = Number(req.body.delta);
	if (isNaN(delta) || delta === 0) throw new HttpError(400, "A non-zero numeric delta is required for stock adjustment");
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const part = await adjustStock(getParam(req, "id"), delta, actor);
	broadcastLiveEvent("inventory_updated", part);
	res.json({
		success: true,
		data: part
	});
}));
app.delete("/api/inventory/:id", requireAdmin, wrap(async (req, res) => {
	const actor = {
		id: req.user.id,
		name: req.user.name
	};
	const result = await deletePart(getParam(req, "id"), actor);
	broadcastLiveEvent("inventory_updated", { id: getParam(req, "id") });
	res.json({
		success: true,
		data: result
	});
}));
app.get("/api/export/tickets", requireAuth, wrap(async (req, res) => {
	const csv = await exportTicketsCsv();
	await recordAudit({
		userId: req.user.id,
		actorName: req.user.name,
		action: "EXPORT_TICKETS_CSV",
		details: "Exported work orders CSV report",
		ipAddress: getClientIp(req)
	});
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader("Content-Disposition", "attachment; filename=\"FasoFix-WorkOrders.csv\"");
	res.send(csv);
}));
app.get("/api/admin/backups", requireAdmin, (_req, res) => {
	res.json({
		success: true,
		data: listBackups()
	});
});
app.post("/api/admin/backups", requireAdmin, wrap(async (req, res) => {
	const info = await createBackup("manual");
	await recordAudit({
		userId: req.user.id,
		actorName: req.user.name,
		action: "BACKUP_CREATED",
		details: info.file
	});
	res.json({
		success: true,
		data: info
	});
}));
app.get("/api/admin/backups/:file", requireAdmin, (req, res) => {
	const full = resolveBackup(getParam(req, "file"));
	if (!full) return res.status(404).json({
		success: false,
		error: "Backup not found"
	});
	res.setHeader("Content-Type", "application/octet-stream");
	res.setHeader("Content-Disposition", `attachment; filename="${path.basename(full)}"`);
	fs.createReadStream(full).pipe(res);
});
app.get("/api/timeclock/status", requireAuth, wrap(async (req, res) => {
	const status = await getTimeClockStatus(req.user.id);
	res.json({
		success: true,
		data: status
	});
}));
app.post("/api/timeclock/clock-in", requireAuth, wrap(async (req, res) => {
	const shift = await clockIn(req.user.id, req.body?.notes);
	res.json({
		success: true,
		data: shift
	});
}));
app.post("/api/timeclock/clock-out", requireAuth, wrap(async (req, res) => {
	const shift = await clockOut(req.user.id, req.body?.notes, req.body?.shiftData);
	res.json({
		success: true,
		data: shift
	});
}));
app.post("/api/sync/tickets", requireAdmin, wrap(async (req, res) => {
	const { deletedIds } = req.body || {};
	if (Array.isArray(deletedIds) && deletedIds.length > 0) {
		for (const id of deletedIds) if (typeof id === "string" && id.trim()) await deleteTicket(id).catch(() => {});
	}
	res.json({
		success: true,
		message: "Sync complete"
	});
}));
app.post("/api/timeclock/break-start", requireAuth, wrap(async (req, res) => {
	const brk = await startBreak(req.user.id, req.body?.type);
	res.json({
		success: true,
		data: brk
	});
}));
app.post("/api/timeclock/break-end", requireAuth, wrap(async (req, res) => {
	const brk = await endBreak(req.user.id);
	res.json({
		success: true,
		data: brk
	});
}));
app.get("/api/timeclock/my-shifts", requireAuth, wrap(async (req, res) => {
	const shifts = await getMyShifts(req.user.id, {
		startDate: req.query.startDate,
		endDate: req.query.endDate,
		limit: req.query.limit ? Number(req.query.limit) : 50
	});
	res.json({
		success: true,
		data: shifts
	});
}));
app.get("/api/timeclock/my-paystubs", requireAuth, wrap(async (req, res) => {
	const paystubs = await getMyPaystubs(req.user.id);
	res.json({
		success: true,
		data: paystubs
	});
}));
app.get("/api/timeclock/my-paystubs/:id", requireAuth, wrap(async (req, res) => {
	const isAdmin = req.user.role === "ADMIN";
	const paystub = await getMyPaystub(req.user.id, getParam(req, "id"), isAdmin);
	res.json({
		success: true,
		data: paystub
	});
}));
app.get("/api/timeclock/my-paystubs/:id/html", requireAuth, wrap(async (req, res) => {
	const isAdmin = req.user.role === "ADMIN";
	const html = await buildPaystubHtml(getParam(req, "id"), isAdmin, req.user.id);
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Content-Security-Policy", ZERO_SCRIPT_HTML_CSP);
	res.send(html);
}));
app.get("/api/admin/attendance/live", requireAdmin, wrap(async (_req, res) => {
	const roster = await getLiveRoster();
	res.json({
		success: true,
		data: roster
	});
}));
app.get("/api/admin/attendance", requireAdmin, wrap(async (req, res) => {
	const overview = await getAttendanceOverview({
		userId: req.query.userId,
		status: req.query.status,
		startDate: req.query.startDate,
		endDate: req.query.endDate
	});
	res.json({
		success: true,
		data: overview
	});
}));
app.post("/api/admin/attendance/shifts", requireAdmin, wrap(async (req, res) => {
	const shift = await manualAddShift(req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: shift
	});
}));
app.put("/api/admin/attendance/shifts/:id", requireAdmin, wrap(async (req, res) => {
	const shift = await manualEditShift(getParam(req, "id"), req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: shift
	});
}));
app.delete("/api/admin/attendance/shifts/:id", requireAdmin, wrap(async (req, res) => {
	const result = await deleteShift(getParam(req, "id"), {
		id: req.user.id,
		name: req.user.name
	}, req.body?.reason);
	res.json({
		success: true,
		data: result
	});
}));
app.get("/api/admin/attendance/export", requireAdmin, wrap(async (req, res) => {
	const csv = await exportAttendanceCsv({
		userId: req.query.userId,
		startDate: req.query.startDate,
		endDate: req.query.endDate
	});
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader("Content-Disposition", `attachment; filename="attendance-export-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
	res.send(csv);
}));
app.get("/api/admin/users/:id/wages", requireAdmin, wrap(async (req, res) => {
	const history = await getUserWageHistory(getParam(req, "id"));
	res.json({
		success: true,
		data: history
	});
}));
app.post("/api/admin/users/:id/wages", requireAdmin, wrap(async (req, res) => {
	const updated = await updateUserWage(getParam(req, "id"), req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: updated
	});
}));
app.get("/api/admin/payroll/overview", requireAdmin, wrap(async (_req, res) => {
	const overview = await getPayrollDashboardOverview();
	res.json({
		success: true,
		data: overview
	});
}));
app.get("/api/admin/payroll/periods", requireAdmin, wrap(async (req, res) => {
	const periods = await listPayrollPeriods(req.query.limit ? Number(req.query.limit) : 50);
	res.json({
		success: true,
		data: periods
	});
}));
app.post("/api/admin/payroll/periods/calculate", requireAdmin, wrap(async (req, res) => {
	const calc = await calculatePeriodPayroll({
		startDate: req.body.startDate,
		endDate: req.body.endDate,
		payDate: req.body.payDate,
		periodType: req.body.periodType || "BI_WEEKLY"
	});
	res.json({
		success: true,
		data: calc
	});
}));
app.post("/api/admin/payroll/periods", requireAdmin, wrap(async (req, res) => {
	if (!req.body?.allowDuplicate && req.body?.startDate && req.body?.endDate) {
		const existing = await prisma.payrollPeriod.findFirst({ where: {
			startDate: new Date(req.body.startDate),
			endDate: new Date(req.body.endDate),
			periodType: req.body.periodType || "BI_WEEKLY"
		} });
		if (existing) return res.status(409).json({
			success: false,
			error: `A payroll period (#${existing.periodNumber}) already exists for this exact date range and frequency.`
		});
	}
	const period = await createPayrollPeriod(req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: period
	});
}));
app.get("/api/admin/payroll/periods/:id", requireAdmin, wrap(async (req, res) => {
	const period = await getPayrollPeriod(getParam(req, "id"));
	res.json({
		success: true,
		data: period
	});
}));
app.put("/api/admin/payroll/paystubs/:id", requireAdmin, wrap(async (req, res) => {
	const updated = await updatePaystubDraft(getParam(req, "id"), req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: updated
	});
}));
app.post("/api/admin/payroll/periods/:id/finalize", requireAdmin, wrap(async (req, res) => {
	const finalized = await finalizePayrollPeriod(getParam(req, "id"), {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: finalized
	});
}));
app.get("/api/admin/payroll/periods/:id/export", requireAdmin, wrap(async (req, res) => {
	const csv = await exportPayrollCsv(getParam(req, "id"));
	res.setHeader("Content-Type", "text/csv; charset=utf-8");
	res.setHeader("Content-Disposition", `attachment; filename="payroll-period-${getParam(req, "id")}.csv"`);
	res.send(csv);
}));
app.get("/api/admin/payroll/paystubs/:id/html", requireAdmin, wrap(async (req, res) => {
	const html = await buildPaystubHtml(getParam(req, "id"), true);
	res.setHeader("Content-Type", "text/html; charset=utf-8");
	res.setHeader("Content-Security-Policy", ZERO_SCRIPT_HTML_CSP);
	res.send(html);
}));
app.get("/api/schedules/my-schedule", requireAuth, wrap(async (req, res) => {
	const shifts = await listScheduledShifts({
		userId: req.user.id,
		startDate: req.query.startDate,
		endDate: req.query.endDate,
		status: req.query.status,
		publishedOnly: true
	});
	res.json({
		success: true,
		count: shifts.length,
		data: shifts,
		schedules: shifts
	});
}));
app.get("/api/schedules", requireAuth, wrap(async (req, res) => {
	const isAdmin = req.user?.role === "ADMIN" || req.user?.role === "MANAGER";
	const userId = isAdmin ? req.query.userId : req.user.id;
	const isPublishedParam = req.query.isPublished;
	const isPublished = isPublishedParam === "true" ? true : isPublishedParam === "false" ? false : void 0;
	const shifts = await listScheduledShifts({
		userId,
		startDate: req.query.startDate,
		endDate: req.query.endDate,
		status: req.query.status,
		publishedOnly: !isAdmin,
		isPublished: isAdmin ? isPublished : void 0
	});
	res.json({
		success: true,
		count: shifts.length,
		data: shifts
	});
}));
app.post("/api/schedules", requireAdmin, wrap(async (req, res) => {
	const result = await createScheduledShift(req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.status(201).json({
		success: true,
		...result
	});
}));
app.post("/api/schedules/publish-all", requireAdmin, wrap(async (req, res) => {
	const result = await publishDraftShifts({
		startDate: req.body?.startDate,
		endDate: req.body?.endDate,
		userId: req.body?.userId
	}, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		...result
	});
}));
app.get("/api/schedules/compare", requireAdmin, wrap(async (req, res) => {
	const comparison = await compareScheduleVsActual(req.query.startDate || (/* @__PURE__ */ new Date(Date.now() - 6048e5)).toISOString(), req.query.endDate || (/* @__PURE__ */ new Date()).toISOString());
	res.json({
		success: true,
		data: comparison
	});
}));
app.put("/api/schedules/:id", requireAdmin, wrap(async (req, res) => {
	const result = await updateScheduledShift(getParam(req, "id"), req.body, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		...result
	});
}));
app.delete("/api/schedules/:id", requireAdmin, wrap(async (req, res) => {
	const result = await deleteScheduledShift(getParam(req, "id"), {
		id: req.user.id,
		name: req.user.name
	});
	res.json(result);
}));
app.post("/api/schedules/:id/duplicate", requireAdmin, wrap(async (req, res) => {
	const targetDate = req.body.targetDate || new Date(Date.now() + 864e5).toISOString().slice(0, 10);
	const targetUserId = req.body.targetUserId;
	const result = await duplicateScheduledShift(getParam(req, "id"), targetDate, targetUserId, {
		id: req.user.id,
		name: req.user.name
	});
	res.status(201).json({
		success: true,
		...result
	});
}));
app.get("/api/schedules/export-csv", requireAdmin, wrap(async (req, res) => {
	const csv = await exportSchedulesCsv({
		startDate: req.query.startDate,
		endDate: req.query.endDate,
		userId: req.query.userId
	});
	res.setHeader("Content-Type", "text/csv");
	res.setHeader("Content-Disposition", `attachment; filename="schedules-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv"`);
	res.send(csv);
}));
app.get("/api/time-off", requireAuth, wrap(async (req, res) => {
	const requests = await listTimeOffRequests({
		userId: req.user?.role === "ADMIN" || req.user?.role === "MANAGER" ? req.query.userId : req.user.id,
		status: req.query.status
	});
	res.json({
		success: true,
		data: requests
	});
}));
app.post("/api/time-off", requireAuth, wrap(async (req, res) => {
	const request = await createTimeOffRequest({
		userId: req.user.id,
		requestType: req.body.requestType,
		startDate: req.body.startDate,
		endDate: req.body.endDate,
		reason: req.body.reason
	});
	res.status(201).json({
		success: true,
		data: request
	});
}));
app.put("/api/time-off/:id", requireAdmin, wrap(async (req, res) => {
	const result = await reviewTimeOffRequest(getParam(req, "id"), {
		status: req.body.status,
		reviewNotes: req.body.reviewNotes
	}, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: result
	});
}));
app.get("/api/shift-swaps", requireAuth, wrap(async (req, res) => {
	const swaps = await listShiftSwapRequests({
		userId: req.user?.role === "ADMIN" || req.user?.role === "MANAGER" ? req.query.userId : req.user.id,
		status: req.query.status
	});
	res.json({
		success: true,
		data: swaps
	});
}));
app.post("/api/shift-swaps", requireAuth, wrap(async (req, res) => {
	const swap = await createShiftSwapRequest({
		requesterId: req.user.id,
		requesterShiftId: req.body.requesterShiftId,
		targetUserId: req.body.targetUserId,
		targetShiftId: req.body.targetShiftId,
		reason: req.body.reason
	});
	res.status(201).json({
		success: true,
		data: swap
	});
}));
app.put("/api/shift-swaps/:id", requireAdmin, wrap(async (req, res) => {
	const result = await reviewShiftSwapRequest(getParam(req, "id"), {
		status: req.body.status,
		reviewNotes: req.body.reviewNotes
	}, {
		id: req.user.id,
		name: req.user.name
	});
	res.json({
		success: true,
		data: result
	});
}));
app.get("/api/reports/sales-labor", requireAdmin, wrap(async (req, res) => {
	const analytics = await getSalesLaborAnalytics(req.query.startDate || (/* @__PURE__ */ new Date(Date.now() - 2592e6)).toISOString(), req.query.endDate || (/* @__PURE__ */ new Date()).toISOString());
	res.json({
		success: true,
		data: analytics
	});
}));
app.get("/api/notifications", requireAuth, wrap(async (req, res) => {
	const unreadOnly = req.query.unreadOnly === "true";
	const limit = req.query.limit ? parseInt(req.query.limit, 10) : 30;
	const result = await listUserNotifications(req.user.id, {
		unreadOnly,
		limit
	});
	res.json({
		success: true,
		...result,
		data: result.notifications
	});
}));
app.post("/api/notifications/read-all", requireAuth, wrap(async (req, res) => {
	const result = await markAllNotificationsRead(req.user.id);
	res.json({
		success: true,
		...result
	});
}));
app.post("/api/notifications/:id/read", requireAuth, wrap(async (req, res) => {
	const notification = await markNotificationRead(req.user.id, getParam(req, "id"));
	res.json({
		success: true,
		data: notification
	});
}));
var distPath = path.resolve(process.cwd(), "dist");
if (fs.existsSync(distPath)) {
	app.use(express.static(distPath));
	app.use((req, res, next) => {
		if (req.path.startsWith("/api/")) return next();
		if (req.method !== "GET") return next();
		if (req.path.startsWith("/assets/") && req.path.endsWith(".js")) {
			res.setHeader("Content-Type", "application/javascript; charset=utf-8");
			res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
			return res.send(`
        console.warn("[Faso Fix POS] Purging stale client cache...");
        if ('caches' in window) {
          caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k))));
        }
        if ('serviceWorker' in navigator) {
          navigator.serviceWorker.getRegistrations().then(regs => {
            regs.forEach(r => r.unregister());
          });
        }
        window.location.reload();
      `);
		}
		if (req.path.startsWith("/assets/") || req.path.includes(".")) return res.status(404).send("Not Found");
		res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
		res.sendFile(path.join(distPath, "index.html"));
	});
}
app.use((err, _req, res, _next) => {
	if (err?.type === "entity.too.large" || err?.status === 413) return res.status(413).json({
		success: false,
		error: "Request payload too large for this endpoint."
	});
	if (err instanceof HttpError) return res.status(err.status).json({
		success: false,
		error: err.message,
		...err.activeShift ? { activeShift: err.activeShift } : {},
		...err.details ? { details: err.details } : {}
	});
	if (err instanceof ZodError) {
		const message = (err.issues || err.errors || []).map((e) => `${e.path.join(".") || "input"}: ${e.message}`).join(", ");
		return res.status(400).json({
			success: false,
			error: message || "Invalid input",
			details: err.flatten()
		});
	}
	console.error("[API Error]", err);
	const isProd = process.env.NODE_ENV === "production" || Boolean(process.env.VERCEL);
	return res.status(500).json({
		success: false,
		error: isProd ? "Internal server error" : err?.message || "Internal server error",
		...isProd ? {} : { details: err?.stack || String(err) }
	});
});
if (!process.env.VERCEL && process.env.NODE_ENV !== "test") app.listen(Number(PORT), "0.0.0.0", async () => {
	console.log(`[Faso Fix API] Running on http://localhost:${PORT}`);
	try {
		await configureSqlite();
		await ensureDatabaseSchema();
		await ensureAdminProvisioning();
		await ensureInitialInventory();
		if (process.env.NODE_ENV !== "test") startBackupSchedule();
	} catch (err) {
		console.error("[Startup Error]", err);
	}
});
// src/server/serverless.ts
var initialized = false;
var initPromise = null;
async function initServerless() {
	if (initialized) return;
	if (process.env.VERCEL && isPostgres) {
		initialized = true;
		return;
	}
	if (!initPromise) initPromise = (async () => {
		try {
			await configureSqlite();
			await ensureDatabaseSchema();
			await ensureAdminProvisioning();
			await ensureInitialInventory();
			initialized = true;
		} catch (err) {
			console.error("[Serverless Init Error]", err);
		} finally {
			initPromise = null;
		}
	})();
	await initPromise;
}
async function handler(req, res) {
	try {
		await initServerless();
		const originalPath = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"] || (typeof req.headers["x-now-route-matches"] === "string" && req.headers["x-now-route-matches"].includes("1=") ? "/api/" + req.headers["x-now-route-matches"].split("1=")[1].split("&")[0] : null);
		if (originalPath && typeof originalPath === "string") req.url = originalPath;
		else if (req.url && !req.url.startsWith("/api")) req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
		return await new Promise((resolve, reject) => {
			res.on("finish", () => resolve());
			res.on("close", () => resolve());
			res.on("error", (err) => reject(err));
			app(req, res);
		});
	} catch (err) {
		console.error("[Serverless Handler Unhandled Exception]", err);
		if (!res.headersSent) res.status(500).json({
			success: false,
			error: "Internal server error occurred while processing request.",
			details: err?.message || String(err)
		});
	}
}
export { handler as default };
