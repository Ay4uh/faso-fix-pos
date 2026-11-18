import express from "express";
import cors from "cors";
import crypto from "node:crypto";
import { ZodError, z } from "zod";
import { PrismaClient } from "@prisma/client";
import fs from "node:fs";
import path from "node:path";
// src/server/prisma.ts
if (process.env.VERCEL) {
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
var prisma = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL || "file:./dev.db" } } });
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
		taxCents,
		totalCents,
		paidCents,
		balanceCents,
		paymentStatus
	};
}
var digitsOnly = (s) => s.replace(/\D/g, "");
// src/server/schemas.ts
var STATUSES = [
	"CHECKED_IN",
	"DIAGNOSING",
	"WAITING_ON_APPROVAL",
	"WAITING_ON_PARTS",
	"READY_FOR_PICKUP",
	"COMPLETED",
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
	signature: optionalText,
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
	signature: optionalText,
	diagnostics: z.record(z.string(), z.enum(["PASS", "FAIL"])),
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
	note: optionalText
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
var loginSchema = z.object({
	usernameOrEmail: trimmed.min(1, "Username or email is required").max(120),
	password: z.string().min(1, "Password is required"),
	adminMode: z.boolean().optional().default(false)
});
var userCreateSchema = z.object({
	username: trimmed.min(3, "Username must be at least 3 characters").max(40).regex(/^[a-zA-Z0-9_.-]+$/, "Username can only contain letters, numbers, dots, hyphens, and underscores"),
	email: trimmed.email("Valid email is required"),
	name: trimmed.min(2, "Name must be at least 2 characters").max(100),
	password: z.string().min(8, "Password must be at least 8 characters"),
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
	newPassword: z.string().min(8, "New password must be at least 8 characters"),
	confirmPassword: z.string().min(8, "Confirm password must be at least 8 characters")
}).refine((data) => data.newPassword === data.confirmPassword, {
	message: "New passwords do not match",
	path: ["confirmPassword"]
});
var resetPasswordSchema = z.object({ newPassword: z.string().min(8, "New password must be at least 8 characters") });
// src/server/auth.ts
/**
* NIST SP 800-63B compliant password hashing using scrypt.
* Stores format: salt:hash
*/
function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString("hex");
	return `${salt}:${crypto.scryptSync(password, salt, 64).toString("hex")}`;
}
function verifyPassword(password, combined) {
	try {
		const parts = combined.split(":");
		if (parts.length !== 2) return false;
		const [salt, key] = parts;
		const keyBuffer = Buffer.from(key, "hex");
		const derivedKey = crypto.scryptSync(password, salt, 64);
		return crypto.timingSafeEqual(keyBuffer, derivedKey);
	} catch {
		return false;
	}
}
var SESSION_SIGNING_KEY = process.env.SESSION_SECRET || "fasofix-cloud-session-secret-key-2026";
function createSignedToken(userId, username, role, expiresAt) {
	const payload = Buffer.from(JSON.stringify({
		uid: userId,
		u: username,
		r: role,
		exp: expiresAt
	})).toString("base64url");
	return `s.${payload}.${crypto.createHmac("sha256", SESSION_SIGNING_KEY).update(payload).digest("base64url")}`;
}
function verifySignedToken(token) {
	try {
		if (!token.startsWith("s.")) return null;
		const parts = token.slice(2).split(".");
		if (parts.length !== 2) return null;
		const [payload, signature] = parts;
		const expected = crypto.createHmac("sha256", SESSION_SIGNING_KEY).update(payload).digest("base64url");
		if (signature.length !== expected.length) return null;
		if (!crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
		const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
		if (!data.exp || data.exp < Date.now()) return null;
		return data;
	} catch {
		return null;
	}
}
/**
* Create a persistent session for a user valid for 7 days.
*/
async function createSession(userId) {
	const user = await prisma.user.findUnique({ where: { id: userId } });
	const expiresAt = new Date(Date.now() + 6048e5);
	const token = createSignedToken(userId, user?.username || "", user?.role || "USER", expiresAt.getTime());
	await prisma.session.create({ data: {
		token,
		userId,
		expiresAt
	} }).catch(() => {});
	return token;
}
var revokedTokens = /* @__PURE__ */ new Set();
async function destroySession(token) {
	revokedTokens.add(token);
	await prisma.session.delete({ where: { token } }).catch(() => {});
}
/**
* Validate a session token and return the associated active user.
*/
async function authenticateSession(token) {
	if (!token || revokedTokens.has(token)) return null;
	const verified = verifySignedToken(token);
	if (verified) {
		let user = await prisma.user.findFirst({
			where: { OR: [{ id: verified.uid }, { username: verified.u }] },
			select: {
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
				lastLoginAt: true,
				createdAt: true
			}
		});
		if (!user) {
			await ensureAdminProvisioning();
			user = await prisma.user.findFirst({
				where: { OR: [{ id: verified.uid }, { username: verified.u }] },
				select: {
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
					lastLoginAt: true,
					createdAt: true
				}
			});
		}
		if (user && user.status === "ACTIVE") return user;
		return null;
	}
	const session = await prisma.session.findUnique({
		where: { token },
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
			lastLoginAt: true,
			createdAt: true
		} } }
	});
	if (!session) return null;
	if (session.expiresAt.getTime() < Date.now()) {
		await prisma.session.delete({ where: { token } }).catch(() => {});
		return null;
	}
	if (session.user.status !== "ACTIVE") return null;
	return session.user;
}
/**
* Record an immutable audit log entry.
*/
async function recordAudit(params) {
	try {
		return await prisma.auditLog.create({ data: {
			userId: params.userId || null,
			actorName: params.actorName,
			action: params.action,
			details: params.details,
			ipAddress: params.ipAddress || null
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
		console.log(`  Password: ${adminPass}`);
		console.log("  Please log in and update your password if desired.");
		console.log("------------------------------------------------------------");
	}
	if (await prisma.user.count({ where: { role: "USER" } }) === 0) await prisma.user.create({ data: {
		id: "00000000-0000-0000-0000-000000000002",
		username: "tech",
		email: "alex@fasofix.ca",
		name: "Alex Mercer",
		passwordHash: hashPassword("Tech@FasoFix2026!"),
		role: "USER",
		status: "ACTIVE",
		bench: "Bench #04 (Alex Mercer)",
		bio: "Hardware & soldering specialist. 8 years mobile and logic board diagnostics.",
		preferences: JSON.stringify({
			soundFX: true,
			compactView: false,
			autoPrint: false,
			emailAlerts: true,
			highPriorityAudio: true,
			lowStockAlerts: true
		})
	} }).catch(() => {});
}
// src/server/service.ts
/** Error with an HTTP status, surfaced to the client as JSON by the error handler. */
var HttpError = class extends Error {
	status;
	constructor(status, message) {
		super(message);
		this.status = status;
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
	COMPLETED: "Completed / Paid"
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
/** "YYYY-MM-DD" is stored at local noon so it never shifts a day across time zones. */
function parseDate(v) {
	return /^\d{4}-\d{2}-\d{2}$/.test(v) ? /* @__PURE__ */ new Date(`${v}T12:00:00`) : new Date(v);
}
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
		diagnostics,
		totals: computeTotals(t)
	};
}
async function getSettings(tx = prisma) {
	return tx.setting.upsert({
		where: { id: 1 },
		update: {},
		create: { id: 1 }
	});
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
	const t = await prisma.ticket.findFirst({
		where: {
			id,
			deletedAt: null
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
			NOT: { id }
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
async function listTickets(params) {
	const view = params.view || "OPEN";
	const where = { deletedAt: null };
	if (view === "OPEN") where.status = { in: OPEN_STATUSES };
	else if (view !== "ALL") where.status = view;
	if (params.bench && params.bench !== "ALL") where.bench = params.bench;
	const q = (params.search || "").trim();
	if (q) {
		const numeric = q.replace(/^(wo\s*)?#?/i, "");
		const digits = digitsOnly(q);
		const or = [
			{ customer: { fullName: { contains: q } } },
			{ device: { name: { contains: q } } },
			{ device: { serialNumber: { contains: q } } },
			{ faultDescription: { contains: q } }
		];
		if (/^\d+$/.test(numeric)) or.push({ ticketNumber: Number(numeric) });
		if (digits.length >= 3) or.push({ customer: { phoneDigits: { contains: digits } } });
		where.OR = or;
	}
	return (await prisma.ticket.findMany({
		where,
		include: ticketInclude,
		orderBy: view === "COMPLETED" ? { completedAt: "desc" } : [{ dueDate: "asc" }, { ticketNumber: "asc" }],
		take: 500
	})).map(withTotals);
}
var TX_OPTIONS = {
	maxWait: 15e3,
	timeout: 2e4
};
async function createTicket(input) {
	const data = createTicketSchema.parse(input);
	const phoneDigits = digitsOnly(data.customer.phone);
	return getTicket(await prisma.$transaction(async (tx) => {
		const settings = await getSettings(tx);
		const ticketNumber = (await tx.setting.update({
			where: { id: 1 },
			data: { nextTicketNumber: { increment: 1 } },
			select: { nextTicketNumber: true }
		})).nextTicketNumber - 1;
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
			dueDate: parseDate(data.dueDate)
		} });
		await logEvent(tx, ticket.id, "STATUS", `Work order #${ticketNumber} created for ${device.name}`, data.technician);
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
			await logEvent(tx, ticket.id, "PAYMENT", `Deposit of ${money(data.depositCents)} received (${data.depositMethod || "CASH"})`);
		}
		return ticket.id;
	}, TX_OPTIONS));
}
async function updateTicket(id, input) {
	const data = updateTicketSchema.parse(input);
	await prisma.$transaction(async (tx) => {
		const t = await loadTicket(tx, id);
		const update = {};
		const changes = [];
		if (data.status && data.status !== t.status) {
			update.status = data.status;
			update.completedAt = data.status === "COMPLETED" ? /* @__PURE__ */ new Date() : null;
			await logEvent(tx, id, "STATUS", `Status changed: ${STATUS_LABEL[t.status]} → ${STATUS_LABEL[data.status]}`);
		}
		if (data.priority && data.priority !== t.priority) {
			update.priority = data.priority;
			changes.push(`priority → ${data.priority.toLowerCase()}`);
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
		if (data.diagnostics) update.diagnostics = JSON.stringify(data.diagnostics);
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
		if (changes.length) await logEvent(tx, id, "SYSTEM", `Updated: ${changes.join(", ")}`);
	});
	return getTicket(id);
}
async function deleteTicket(id) {
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
		await logEvent(tx, id, "SYSTEM", "Work order deleted by administrator");
	});
	return { ok: true };
}
async function addItem(ticketId, input) {
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
		await logEvent(tx, ticketId, "ITEM", `Added ${data.quantity} × ${description} @ ${money(unitPriceCents)}`);
	});
	return getTicket(ticketId);
}
async function removeItem(ticketId, itemId) {
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
		await logEvent(tx, ticketId, "ITEM", `Removed ${item.quantity} × ${item.description}${item.partId ? " (returned to stock)" : ""}`);
	});
	return getTicket(ticketId);
}
async function addPayment(ticketId, input) {
	const data = paymentSchema.parse(input);
	await prisma.$transaction(async (tx) => {
		const { balanceCents } = computeTotals(await loadTicket(tx, ticketId));
		const isDeposit = data.note && /deposit/i.test(data.note);
		if (!isDeposit) {
			if (balanceCents <= 0) throw new HttpError(409, "Nothing is owing on this work order");
			if (data.amountCents > balanceCents) throw new HttpError(400, `Payment (${money(data.amountCents)}) is more than the balance owing (${money(balanceCents)})`);
		}
		await tx.payment.create({ data: {
			ticketId,
			amountCents: data.amountCents,
			method: data.method,
			note: emptyToNull(data.note) ?? null
		} });
		const remaining = Math.max(0, balanceCents - data.amountCents);
		await logEvent(tx, ticketId, "PAYMENT", `${isDeposit ? "Deposit" : "Payment"} of ${money(data.amountCents)} received (${data.method.replace("_", "-")})${remaining === 0 ? " — paid in full" : `, ${money(remaining)} still owing`}`);
	});
	return getTicket(ticketId);
}
async function voidPayment(ticketId, paymentId) {
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		const p = await tx.payment.findFirst({ where: {
			id: paymentId,
			ticketId
		} });
		if (!p) throw new HttpError(404, "Payment not found");
		await tx.payment.delete({ where: { id: paymentId } });
		await logEvent(tx, ticketId, "PAYMENT", `Voided payment of ${money(p.amountCents)} (${p.method})`);
	});
	return getTicket(ticketId);
}
async function addNote(ticketId, input) {
	const data = noteSchema.parse(input);
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		await logEvent(tx, ticketId, data.kind, data.message);
	});
	return getTicket(ticketId);
}
async function updateNote(ticketId, noteId, message) {
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		if (!await tx.ticketEvent.findFirst({ where: {
			id: noteId,
			ticketId
		} })) throw new HttpError(404, "Note not found");
		await tx.ticketEvent.update({
			where: { id: noteId },
			data: { message: message.trim() }
		});
	});
	return getTicket(ticketId);
}
async function deleteNote(ticketId, noteId) {
	await prisma.$transaction(async (tx) => {
		await loadTicket(tx, ticketId);
		if (!await tx.ticketEvent.findFirst({ where: {
			id: noteId,
			ticketId
		} })) throw new HttpError(404, "Note not found");
		await tx.ticketEvent.delete({ where: { id: noteId } });
	});
	return getTicket(ticketId);
}
async function listCustomers(search) {
	const q = (search || "").trim();
	const digits = digitsOnly(q);
	const where = q ? { OR: [
		{ fullName: { contains: q } },
		{ email: { contains: q } },
		...digits.length >= 3 ? [{ phoneDigits: { contains: digits } }] : []
	] } : {};
	return (await prisma.customer.findMany({
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
		take: 500
	})).map(({ tickets, ...c }) => ({
		...c,
		ticketCount: tickets.length,
		openTickets: tickets.filter((t) => OPEN_STATUSES.includes(t.status)).length,
		totalPaidCents: tickets.reduce((s, t) => s + t.payments.reduce((a, p) => a + p.amountCents, 0), 0),
		lastVisit: tickets.reduce((d, t) => !d || t.createdAt > d ? t.createdAt : d, null)
	}));
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
async function updateCustomer(id, input) {
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
	return getCustomer(id);
}
function listParts(search) {
	const q = (search || "").trim();
	return prisma.inventoryPart.findMany({
		where: q ? { OR: [
			{ name: { contains: q } },
			{ sku: { contains: q } },
			{ supplier: { contains: q } }
		] } : {},
		orderBy: [{ name: "asc" }]
	});
}
async function assertSkuFree(sku, exceptId) {
	const clash = await prisma.inventoryPart.findUnique({ where: { sku } });
	if (clash && clash.id !== exceptId) throw new HttpError(409, `SKU "${sku}" is already used by ${clash.name}`);
}
async function createPart(input) {
	const data = partSchema.parse(input);
	data.sku = data.sku.toUpperCase();
	await assertSkuFree(data.sku);
	return prisma.inventoryPart.create({ data: {
		...data,
		supplier: emptyToNull(data.supplier) ?? null
	} });
}
async function updatePart(id, input) {
	const data = partSchema.partial().parse(input);
	if (!await prisma.inventoryPart.findUnique({ where: { id } })) throw new HttpError(404, "Part not found");
	if (data.sku) {
		data.sku = data.sku.toUpperCase();
		await assertSkuFree(data.sku, id);
	}
	return prisma.inventoryPart.update({
		where: { id },
		data: {
			...data,
			supplier: data.supplier === void 0 ? void 0 : emptyToNull(data.supplier) ?? null
		}
	});
}
async function adjustStock(id, delta) {
	const part = await prisma.inventoryPart.findUnique({ where: { id } });
	if (!part) throw new HttpError(404, "Part not found");
	if (part.stock + delta < 0) throw new HttpError(409, `Stock cannot go below zero (currently ${part.stock})`);
	return prisma.inventoryPart.update({
		where: { id },
		data: { stock: { increment: delta } }
	});
}
async function deletePart(id) {
	if (!await prisma.inventoryPart.findUnique({ where: { id } })) throw new HttpError(404, "Part not found");
	await prisma.inventoryPart.delete({ where: { id } });
	return { ok: true };
}
function startOfDay(d = /* @__PURE__ */ new Date()) {
	const s = new Date(d);
	s.setHours(0, 0, 0, 0);
	return s;
}
async function getDashboard() {
	const today = startOfDay();
	const tomorrow = new Date(today.getTime() + 864e5);
	const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
	const tickets = await prisma.ticket.findMany({
		where: { deletedAt: null },
		select: {
			status: true,
			dueDate: true,
			laborCents: true,
			discountCents: true,
			taxRateBps: true,
			items: { select: {
				quantity: true,
				unitPriceCents: true
			} },
			payments: { select: { amountCents: true } }
		}
	});
	const payments = await prisma.payment.findMany({
		where: {
			createdAt: { gte: monthStart },
			ticket: { deletedAt: null }
		},
		select: {
			amountCents: true,
			createdAt: true
		}
	});
	const lowStock = await prisma.inventoryPart.count({ where: { stock: { lte: prisma.inventoryPart.fields.reorderPoint } } });
	const open = tickets.filter((t) => OPEN_STATUSES.includes(t.status));
	const count = (s) => tickets.filter((t) => t.status === s).length;
	const readyUnpaid = tickets.filter((t) => t.status === "COMPLETED" && computeTotals(t).balanceCents > 0);
	return {
		open: open.length,
		pending: count("PENDING") + count("CHECKED_IN"),
		inProgress: count("IN_PROGRESS") + count("DIAGNOSING"),
		waitingOnParts: count("WAITING_ON_PARTS"),
		completed: count("COMPLETED"),
		overdue: open.filter((t) => t.dueDate < today).length,
		dueToday: open.filter((t) => t.dueDate >= today && t.dueDate < tomorrow).length,
		openValueCents: Math.max(0, open.reduce((s, t) => s + Math.max(0, computeTotals(t).totalCents), 0)),
		awaitingPickupCount: count("READY_FOR_PICKUP") + readyUnpaid.length,
		awaitingPickupCents: readyUnpaid.reduce((s, t) => s + Math.max(0, computeTotals(t).balanceCents), 0),
		collectedTodayCents: payments.filter((p) => p.createdAt >= today).reduce((s, p) => s + p.amountCents, 0),
		collectedMonthCents: payments.reduce((s, p) => s + p.amountCents, 0),
		customerCount: await prisma.customer.count(),
		lowStock
	};
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
				createdAt: true
			}
		}),
		prisma.ticket.findMany({
			where: {
				createdAt: { gte: since },
				deletedAt: null
			},
			select: {
				createdAt: true,
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
		topDevices: [...deviceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({
			name,
			count
		})),
		daily
	};
}
async function exportTicketsCsv() {
	const tickets = await prisma.ticket.findMany({
		where: { deletedAt: null },
		include: ticketInclude,
		orderBy: { ticketNumber: "asc" }
	});
	const esc = (v) => `"${String(v ?? "").replace(/"/g, "\"\"")}"`;
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
	return rows.map((r) => r.map(esc).join(",")).join("\n") + "\n";
}
async function loginUser(input, ipAddress) {
	const { usernameOrEmail, password, adminMode } = loginSchema.parse(input);
	const user = await prisma.user.findFirst({ where: { OR: [{ username: usernameOrEmail.toLowerCase() }, { email: usernameOrEmail.toLowerCase() }] } });
	if (!user) throw new HttpError(401, "Invalid username/email or password");
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
	await prisma.user.update({
		where: { id: user.id },
		data: { lastLoginAt: /* @__PURE__ */ new Date() }
	});
	const token = await createSession(user.id);
	await recordAudit({
		userId: user.id,
		actorName: user.name,
		action: adminMode ? "ADMIN_LOGIN" : "LOGIN",
		details: `${adminMode ? "Administrator" : "User"} signed in from ${ipAddress || "local"}`,
		ipAddress
	});
	const { passwordHash: _, ...safeUser } = user;
	return {
		token,
		user: safeUser,
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
async function listUsers(params) {
	const where = {};
	if (params.role && params.role !== "ALL") where.role = params.role;
	if (params.status && params.status !== "ALL") where.status = params.status;
	if (params.search?.trim()) {
		const q = params.search.trim().toLowerCase();
		where.OR = [
			{ name: { contains: q } },
			{ username: { contains: q } },
			{ email: { contains: q } }
		];
	}
	return await prisma.user.findMany({
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
			preferences: true,
			updatedAt: true
		}
	});
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
async function changeUserPassword(userId, input, actorName) {
	const { currentPassword, newPassword } = changePasswordSchema.parse(input);
	const user = await prisma.user.findUnique({ where: { id: userId } });
	if (!user) throw new HttpError(404, "User account not found");
	if (!verifyPassword(currentPassword, user.passwordHash)) throw new HttpError(400, "Current password is incorrect");
	const passwordHash = hashPassword(newPassword);
	await prisma.user.update({
		where: { id: userId },
		data: { passwordHash }
	});
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
async function listAuditLogs(params) {
	const limit = Math.min(params.limit || 100, 500);
	const where = {};
	if (params.action && params.action !== "ALL") where.action = params.action;
	if (params.search?.trim()) {
		const q = params.search.trim().toLowerCase();
		where.OR = [
			{ actorName: { contains: q } },
			{ details: { contains: q } },
			{ action: { contains: q } }
		];
	}
	return await prisma.auditLog.findMany({
		where,
		orderBy: { createdAt: "desc" },
		take: limit
	});
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
			database: "ACID Relational SQLite",
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
var BACKUP_DIR = path.resolve(process.env.BACKUP_DIR || "backups");
var KEEP = Number(process.env.BACKUP_KEEP || 30);
var INTERVAL_HOURS = Number(process.env.BACKUP_INTERVAL_HOURS || 6);
/** Enable SQLite crash-safety & concurrency settings. */
async function configureSqlite() {
	await prisma.$queryRawUnsafe("PRAGMA journal_mode = WAL;");
	await prisma.$queryRawUnsafe("PRAGMA busy_timeout = 5000;");
	await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON;");
}
/** Consistent online snapshot using SQLite VACUUM INTO (safe while app is running). */
async function createBackup(reason = "manual") {
	fs.mkdirSync(BACKUP_DIR, { recursive: true });
	const file = `apexfix-${(/* @__PURE__ */ new Date()).toISOString().replace(/[:.]/g, "-")}-${reason.replace(/[^a-z0-9]/gi, "")}.db`;
	const full = path.join(BACKUP_DIR, file);
	await prisma.$executeRawUnsafe(`VACUUM INTO '${full.replace(/'/g, "''")}'`);
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
// src/server/index.ts
var app = express();
var PORT = process.env.PORT || 4e3;
app.use(cors());
app.use(express.json());
app.use(async (req, _res, next) => {
	try {
		const authHeader = req.headers.authorization;
		const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : req.headers["x-session-token"];
		if (token) {
			req.token = token;
			const user = await authenticateSession(token);
			if (user) req.user = user;
		}
	} catch (err) {
		console.error("[Auth Middleware Error]", err);
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
		error: "Authentication required. Please log in."
	});
	next();
};
var requireAdmin = (req, res, next) => {
	if (!req.user) return res.status(401).json({
		success: false,
		error: "Authentication required. Please log in."
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
app.get("/api/live/stream", (req, res) => {
	res.writeHead(200, {
		"Content-Type": "text/event-stream",
		"Cache-Control": "no-cache",
		"Connection": "keep-alive"
	});
	res.write(`event: connected\ndata: ${JSON.stringify({
		status: "connected",
		time: Date.now()
	})}\n\n`);
	const clientId = crypto.randomUUID();
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
		const forwarded = req.headers["x-forwarded-for"];
		if (typeof forwarded === "string") return forwarded.split(",")[0].trim();
		if (Array.isArray(forwarded) && forwarded.length > 0) return forwarded[0].trim();
		const realIp = req.headers["x-real-ip"];
		if (typeof realIp === "string") return realIp.trim();
		if (req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
		return req.ip || "127.0.0.1";
	} catch {
		return "127.0.0.1";
	}
}
var LOGIN_WINDOW_MS = 9e5;
var LOGIN_MAX_FAILS = 5;
var loginFails = /* @__PURE__ */ new Map();
app.post("/api/auth/login", wrap(async (req, res) => {
	const ip = getClientIp(req);
	const key = `${ip}|${String(req.body?.usernameOrEmail || "").trim().toLowerCase()}`;
	const now = Date.now();
	const rec = loginFails.get(key);
	if (rec && now - rec.first > LOGIN_WINDOW_MS) loginFails.delete(key);
	const cur = loginFails.get(key);
	if (cur && cur.count >= LOGIN_MAX_FAILS) {
		const mins = Math.ceil((LOGIN_WINDOW_MS - (now - cur.first)) / 6e4);
		return res.status(429).json({
			success: false,
			error: `Too many failed attempts. Try again in ${mins} minute(s).`
		});
	}
	try {
		const result = await loginUser(req.body, ip);
		loginFails.delete(key);
		res.json({
			success: true,
			...result
		});
	} catch (err) {
		if (err instanceof HttpError && err.status === 401) {
			const r = loginFails.get(key) || {
				count: 0,
				first: now
			};
			r.count += 1;
			loginFails.set(key, r);
		}
		throw err;
	}
}));
app.post("/api/auth/logout", wrap(async (req, res) => {
	const token = req.token;
	if (token) await logoutUser(token, req.user?.name);
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
	const updated = await updateUser(req.user.id, req.body, actor);
	res.json({
		success: true,
		user: updated
	});
}));
app.put("/api/auth/password", requireAuth, wrap(async (req, res) => {
	const result = await changeUserPassword(req.user.id, req.body, req.user.name);
	res.json(result);
}));
app.put("/api/auth/preferences", requireAuth, wrap(async (req, res) => {
	const updated = await updateUserPreferences(req.user.id, req.body.preferences || req.body);
	res.json({
		success: true,
		preferences: updated.preferences
	});
}));
app.get("/api/admin/overview", requireAdmin, wrap(async (_req, res) => {
	const overview = await getAdminOverview();
	res.json({
		success: true,
		data: overview
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
	});
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
	const limit = req.query.limit ? parseInt(req.query.limit, 10) : 100;
	const action = req.query.action;
	const search = req.query.search;
	const logs = await listAuditLogs({
		limit,
		action,
		search
	});
	res.json({
		success: true,
		count: logs.length,
		data: logs
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
	const tickets = await listTickets({
		view,
		search,
		bench
	});
	res.json({
		success: true,
		count: tickets.length,
		data: tickets
	});
}));
app.get("/api/tickets/:id", requireAuth, wrap(async (req, res) => {
	const ticket = await getTicket(getParam(req, "id"));
	res.json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets", requireAuth, wrap(async (req, res) => {
	const ticket = await createTicket(req.body);
	broadcastLiveEvent("ticket_created", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.put("/api/tickets/:id", requireAuth, wrap(async (req, res) => {
	const ticket = await updateTicket(getParam(req, "id"), req.body);
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
	const result = await deleteTicket(ticketId);
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
	const ticket = await updateTicket(getParam(req, "id"), { status: "COMPLETED" });
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		message: "Work order marked completed",
		data: ticket
	});
}));
app.post("/api/tickets/:id/items", requireAuth, wrap(async (req, res) => {
	const ticket = await addItem(getParam(req, "id"), req.body);
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
	});
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.delete("/api/tickets/:id/items/:itemId", requireAuth, wrap(async (req, res) => {
	const ticket = await removeItem(getParam(req, "id"), getParam(req, "itemId"));
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
		success: true,
		data: ticket
	});
}));
app.post("/api/tickets/:id/payments", requireAuth, wrap(async (req, res) => {
	const body = req.body || {};
	const amountCents = body.amountCents ?? (body.amount !== void 0 ? Math.round(Number(body.amount) * 100) : void 0);
	const ticket = await addPayment(getParam(req, "id"), {
		amountCents,
		method: body.method || "CASH",
		note: body.note
	});
	broadcastLiveEvent("ticket_updated", ticket);
	res.status(201).json({
		success: true,
		data: ticket
	});
}));
app.delete("/api/tickets/:id/payments/:paymentId", requireAuth, wrap(async (req, res) => {
	const ticket = await voidPayment(getParam(req, "id"), getParam(req, "paymentId"));
	broadcastLiveEvent("ticket_updated", ticket);
	res.json({
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
	});
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
	});
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
	const customers = await listCustomers(search);
	res.json({
		success: true,
		count: customers.length,
		data: customers
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
	const customer = await updateCustomer(getParam(req, "id"), req.body);
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
	const part = await createPart({
		sku: body.sku,
		name: body.name,
		category: body.category || "GENERAL",
		costCents,
		priceCents,
		stock,
		reorderPoint,
		supplier: body.supplier
	});
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
	const part = await updatePart(getParam(req, "id"), updateData);
	broadcastLiveEvent("inventory_updated", part);
	res.json({
		success: true,
		data: part
	});
}));
app.post("/api/inventory/:id/adjust", requireAuth, wrap(async (req, res) => {
	const delta = Number(req.body.delta);
	if (isNaN(delta) || delta === 0) throw new HttpError(400, "A non-zero numeric delta is required for stock adjustment");
	const part = await adjustStock(getParam(req, "id"), delta);
	broadcastLiveEvent("inventory_updated", part);
	res.json({
		success: true,
		data: part
	});
}));
app.delete("/api/inventory/:id", requireAdmin, wrap(async (req, res) => {
	const result = await deletePart(getParam(req, "id"));
	broadcastLiveEvent("inventory_updated", { id: getParam(req, "id") });
	res.json({
		success: true,
		data: result
	});
}));
app.get("/api/export/tickets", requireAuth, wrap(async (_req, res) => {
	const csv = await exportTicketsCsv();
	res.setHeader("Content-Type", "text/csv");
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
	res.download(full);
});
app.use((err, _req, res, _next) => {
	if (err instanceof HttpError) return res.status(err.status).json({
		success: false,
		error: err.message
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
	return res.status(500).json({
		success: false,
		error: "Internal server error"
	});
});
if (!process.env.VERCEL) app.listen(PORT, async () => {
	console.log(`[Faso Fix API] Running on http://localhost:${PORT}`);
	try {
		await configureSqlite();
		await ensureAdminProvisioning();
		if (process.env.NODE_ENV !== "test") startBackupSchedule();
	} catch (err) {
		console.error("[Startup Error]", err);
	}
});
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
async function ensureDatabaseSchema() {
	const statements = SCHEMA_SQL.split(";").map((s) => s.trim()).filter((s) => s.length > 0);
	for (const sql of statements) try {
		await prisma.$executeRawUnsafe(sql);
	} catch {}
}
// src/server/serverless.ts
var initialized = false;
async function initServerless() {
	if (initialized) return;
	try {
		await configureSqlite();
		await ensureDatabaseSchema();
		await ensureAdminProvisioning();
		initialized = true;
	} catch (err) {
		console.error("[Serverless Init Error]", err);
	}
}
async function handler(req, res) {
	await initServerless();
	const originalPath = req.headers["x-forwarded-uri"] || req.headers["x-matched-path"] || (typeof req.headers["x-now-route-matches"] === "string" && req.headers["x-now-route-matches"].includes("1=") ? "/api/" + req.headers["x-now-route-matches"].split("1=")[1].split("&")[0] : null);
	if (originalPath && typeof originalPath === "string") req.url = originalPath;
	else if (req.url && !req.url.startsWith("/api")) req.url = "/api" + (req.url.startsWith("/") ? req.url : "/" + req.url);
	return app(req, res);
}
export { handler as default };
