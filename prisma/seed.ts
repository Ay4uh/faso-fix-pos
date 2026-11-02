import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding ApexFix POS/CRM v2 with relational database logic...');

  // Clean
  await prisma.payment.deleteMany({});
  await prisma.invoice.deleteMany({});
  await prisma.ticketPart.deleteMany({});
  await prisma.inventoryPart.deleteMany({});
  await prisma.ticketStatusHistory.deleteMany({});
  await prisma.ticket.deleteMany({});
  await prisma.device.deleteMany({});
  await prisma.customer.deleteMany({});

  // 1. Seed Inventory Parts
  const parts = await Promise.all([
    prisma.inventoryPart.create({
      data: {
        sku: 'PRT-IP15P-OLED',
        name: 'iPhone 15 Pro OLED Display Assembly OEM',
        category: 'SCREEN',
        costInCents: 9500, // $95.00
        retailInCents: 19500, // $195.00
        stockQuantity: 4,
        reorderPoint: 2,
        supplier: 'MobileSentrix US',
      },
    }),
    prisma.inventoryPart.create({
      data: {
        sku: 'PRT-XPS15-FAN',
        name: 'Dell XPS 15 9520 Dual Vapor-Chamber Fan Assembly',
        category: 'FAN',
        costInCents: 3800,
        retailInCents: 7500,
        stockQuantity: 0, // Waiting on parts!
        reorderPoint: 2,
        supplier: 'Dell Parts Hub',
      },
    }),
    prisma.inventoryPart.create({
      data: {
        sku: 'PRT-S23U-USBC',
        name: 'Galaxy S23 Ultra Daughterboard USB-C Sub-Assembly',
        category: 'CHARGING_PORT',
        costInCents: 2200,
        retailInCents: 5500,
        stockQuantity: 5,
        reorderPoint: 2,
        supplier: 'InjuredGadgets',
      },
    }),
    prisma.inventoryPart.create({
      data: {
        sku: 'PRT-PS5-THERM',
        name: 'PlayStation 5 APU Thermal Liquid Metal & Barrier Seal',
        category: 'LOGIC_BOARD',
        costInCents: 1800,
        retailInCents: 4500,
        stockQuantity: 8,
        reorderPoint: 3,
        supplier: 'ConsoleLab Parts',
      },
    }),
    prisma.inventoryPart.create({
      data: {
        sku: 'PRT-MBP16-KBD',
        name: 'MacBook Pro 16 Top-Case & Backlit Keyboard Assembly',
        category: 'LOGIC_BOARD',
        costInCents: 18500,
        retailInCents: 29000,
        stockQuantity: 0, // Waiting on parts!
        reorderPoint: 1,
        supplier: 'iFixit Pro',
      },
    }),
    prisma.inventoryPart.create({
      data: {
        sku: 'PRT-NSW-RAIL',
        name: 'Nintendo Switch OLED Left Joy-Con Slider Rail',
        category: 'OTHER',
        costInCents: 1200,
        retailInCents: 3500,
        stockQuantity: 6,
        reorderPoint: 2,
        supplier: 'ConsoleLab Parts',
      },
    }),
  ]);

  const partMap = new Map(parts.map((p) => [p.sku, p]));

  // 2. Seed Customer -> Device -> Ticket -> Status History -> Invoice
  const ticketSeeds = [
    {
      customer: {
        fullName: 'Eleanor Vance',
        phoneNumber: '+1 (555) 234-8901',
        email: 'eleanor.vance@example.com',
        address: '742 Evergreen Terrace, Springfield',
      },
      device: {
        type: 'SMARTPHONE',
        make: 'Apple',
        model: 'iPhone 15 Pro',
        serialNumber: 'SN: 721298KL0116',
        passcode: '2580',
        color: 'Natural Titanium',
      },
      ticket: {
        ticketNumber: 'TK-0019',
        faultDescription: 'OLED cracked after drop. Touch digitizer unresponsive in top right corner.',
        priceInCents: 28900, // $289.00
        technicianNote: 'OEM replacement display on test bench. Adhesive cure in progress.',
        dueDate: new Date('2026-10-31T17:00:00Z'), // in 2 days
        status: 'IN_PROGRESS',
        priority: 'STANDARD',
      },
      partSku: 'PRT-IP15P-OLED',
      depositInCents: 5000,
    },
    {
      customer: {
        fullName: 'Marcus Thorne',
        phoneNumber: '+1 (555) 418-5290',
        email: 'm.thorne@techcorp.io',
        address: '1088 Industrial Pkwy, Suite 4',
      },
      device: {
        type: 'LAPTOP',
        make: 'Dell',
        model: 'XPS 15 9520',
        serialNumber: 'SN: 188123-XPS',
        passcode: 'BIOS: none',
        color: 'Platinum Silver',
      },
      ticket: {
        ticketNumber: 'TK-0020',
        faultDescription: 'Thermal throttling under light load. CPU fans making grinding noise.',
        priceInCents: 13550, // $135.50
        technicianNote: 'Awaiting dual vapor-chamber fan assembly from distributor. ETA tomorrow morning.',
        dueDate: new Date('2026-10-30T14:00:00Z'), // tomorrow!
        status: 'WAITING_ON_PARTS',
        priority: 'STANDARD',
      },
      partSku: 'PRT-XPS15-FAN',
      depositInCents: 0,
    },
    {
      customer: {
        fullName: 'Sophia Rodriguez',
        phoneNumber: '+1 (555) 781-3005',
        email: 'sophia.rodriguez@gmail.com',
        address: '324 Pine St, Apt 2B',
      },
      device: {
        type: 'SMARTPHONE',
        make: 'Samsung',
        model: 'Galaxy S23 Ultra',
        serialNumber: 'SN: R5CW200QNLV',
        passcode: '1984',
        color: 'Phantom Black',
      },
      ticket: {
        ticketNumber: 'TK-0021',
        faultDescription: 'USB-C charge port loose, device only charges when cable angled up.',
        priceInCents: 11000, // $110.00
        technicianNote: 'Daughterboard sub-assembly replaced. Tested 45W Super Fast Charging successfully.',
        dueDate: new Date('2026-10-29T18:00:00Z'), // today
        status: 'COMPLETED',
        priority: 'LOW',
        completedAt: new Date(),
      },
      partSku: 'PRT-S23U-USBC',
      depositInCents: 11000, // Paid in full
    },
    {
      customer: {
        fullName: "Liam O'Connor",
        phoneNumber: '+1 (555) 890-3412',
        email: 'liam.oc@outlook.com',
        address: '58 Orchard Blvd',
      },
      device: {
        type: 'CONSOLE',
        make: 'Sony',
        model: 'PlayStation 5 Disc Edition',
        serialNumber: 'SN: 172-12534-89221',
        passcode: 'N/A',
        color: 'White',
      },
      ticket: {
        ticketNumber: 'TK-0022',
        faultDescription: 'Blue Light of Death (BLOD) and unexpected shutdown during game boot.',
        priceInCents: 15500, // $155.00
        technicianNote: 'Liquid metal repasted on APU. Cleaning power supply heatsink fins.',
        dueDate: new Date('2026-11-02T16:30:00Z'),
        status: 'IN_PROGRESS',
        priority: 'URGENT',
      },
      partSku: 'PRT-PS5-THERM',
      depositInCents: 5000,
    },
    {
      customer: {
        fullName: 'Chloe Chen',
        phoneNumber: '+1 (555) 312-7000',
        email: 'chloechen.art@icloud.com',
        address: '902 Broadway Ave',
      },
      device: {
        type: 'LAPTOP',
        make: 'Apple',
        model: 'MacBook Pro 16" M3 Max',
        serialNumber: 'SN: 18000528561',
        passcode: 'AppleID signed out',
        color: 'Space Black',
      },
      ticket: {
        ticketNumber: 'TK-0023',
        faultDescription: 'Coffee liquid ingress across keyboard & trackpad. Power rail diagnostic.',
        priceInCents: 43000, // $430.00
        technicianNote: 'Ultrasonic board clean completed. Awaiting replacement top-case keyboard assembly.',
        dueDate: new Date('2026-10-28T20:00:00Z'), // OVERDUE by 1 day!
        status: 'WAITING_ON_PARTS',
        priority: 'URGENT',
      },
      partSku: 'PRT-MBP16-KBD',
      depositInCents: 10000,
    },
    {
      customer: {
        fullName: 'David Miller',
        phoneNumber: '+1 (555) 904-1122',
        email: 'dmiller@pacificnet.org',
        address: '14 Elm Creek Way',
      },
      device: {
        type: 'CONSOLE',
        make: 'Nintendo',
        model: 'Switch OLED',
        serialNumber: 'SN: XKW1008291',
        passcode: 'None',
        color: 'Neon Red/Blue',
      },
      ticket: {
        ticketNumber: 'TK-0024',
        faultDescription: 'Left Joy-Con rail connection intermittent. Needs rail assembly.',
        priceInCents: 8000, // $80.00
        technicianNote: 'Checked pins on motherboard connector. Safe to replace rail.',
        dueDate: new Date('2026-10-29T16:00:00Z'), // DUE TODAY
        status: 'PENDING',
        priority: 'STANDARD',
      },
      partSku: 'PRT-NSW-RAIL',
      depositInCents: 0,
    },
  ];

  let invoiceCounter = 1001;

  for (const item of ticketSeeds) {
    // Create Customer
    const cust = await prisma.customer.create({
      data: item.customer,
    });

    // Create Device
    const dev = await prisma.device.create({
      data: {
        ...item.device,
        customerId: cust.id,
      },
    });

    // Create Ticket
    const ticket = await prisma.ticket.create({
      data: {
        ...item.ticket,
        customerId: cust.id,
        deviceId: dev.id,
      },
    });

    // Create Initial Audit History
    await prisma.ticketStatusHistory.create({
      data: {
        ticketId: ticket.id,
        fromStatus: 'CREATED',
        toStatus: ticket.status,
        changedBy: 'Alex Mercer',
        note: `Ticket created for ${item.device.make} ${item.device.model} at Bench #04`,
      },
    });

    // Attach Part Used if available
    const part = partMap.get(item.partSku);
    if (part) {
      await prisma.ticketPart.create({
        data: {
          ticketId: ticket.id,
          partId: part.id,
          quantity: 1,
          unitCostInCents: part.costInCents,
          unitSellInCents: part.retailInCents,
        },
      });
    }

    // Create Invoice
    const taxInCents = Math.round(ticket.priceInCents * 0.0825); // 8.25% sales tax
    const totalInCents = ticket.priceInCents + taxInCents;
    const invStatus =
      item.depositInCents >= totalInCents
        ? 'PAID'
        : item.depositInCents > 0
        ? 'PARTIALLY_PAID'
        : 'UNPAID';

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber: `INV-${invoiceCounter++}`,
        ticketId: ticket.id,
        customerId: cust.id,
        subtotalInCents: ticket.priceInCents,
        taxInCents,
        totalInCents,
        amountPaidInCents: item.depositInCents,
        status: invStatus,
      },
    });

    // If paid/deposit, record Payment ledger transaction
    if (item.depositInCents > 0) {
      await prisma.payment.create({
        data: {
          invoiceId: invoice.id,
          amountInCents: item.depositInCents,
          method: item.depositInCents >= totalInCents ? 'CREDIT_CARD' : 'CASH',
          transactionRef: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
          notes: item.depositInCents >= totalInCents ? 'Paid in full on pickup' : 'Intake bench deposit',
        },
      });
    }
  }

  console.log('Seeding completed successfully!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
