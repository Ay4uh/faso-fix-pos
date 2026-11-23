import { prisma } from '../src/server/prisma';

// Realistic seed data sets
const FIRST_NAMES = [
  'Liam', 'Olivia', 'Noah', 'Emma', 'Oliver', 'Charlotte', 'James', 'Amelia',
  'Sophia', 'Lucas', 'Mia', 'Benjamin', 'Evelyn', 'Henry', 'Harper', 'Alexander',
  'Camila', 'William', 'Gianna', 'Michael', 'Abigail', 'Ethan', 'Ella', 'Daniel',
  'Emily', 'Matthew', 'Avery', 'Aiden', 'Sofia', 'Jackson', 'Chloe', 'David',
  'Ella', 'Sebastian', 'Scarlett', 'Joseph', 'Victoria', 'Samuel', 'Aria', 'Carter',
  'Grace', 'Owen', 'Chloe', 'Wyatt', 'Penelope', 'John', 'Riley', 'Jack', 'Zoey',
  'Luke', 'Nora', 'Jayden', 'Lily', 'Dylan', 'Eleanor', 'Grayson', 'Hannah', 'Levi',
  'Lillian', 'Isaac', 'Addison', 'Gabriel', 'Aubrey', 'Julian', 'Ellie', 'Mateo',
  'Stella', 'Anthony', 'Natalie', 'Jaxon', 'Zoe', 'Lincoln', 'Leah', 'Joshua',
  'Hazel', 'Christopher', 'Violet', 'Andrew', 'Aurora', 'Theodore', 'Savannah', 'Caleb',
  'Audrey', 'Ryan', 'Brooklyn', 'Asher', 'Bella', 'Nathan', 'Claire', 'Thomas', 'Skylar'
];

const LAST_NAMES = [
  'Smith', 'Johnson', 'Williams', 'Brown', 'Jones', 'Garcia', 'Miller', 'Davis',
  'Rodriguez', 'Martinez', 'Hernandez', 'Lopez', 'Gonzalez', 'Wilson', 'Anderson',
  'Thomas', 'Taylor', 'Moore', 'Jackson', 'Martin', 'Lee', 'Perez', 'Thompson',
  'White', 'Harris', 'Sanchez', 'Clark', 'Ramirez', 'Lewis', 'Robinson', 'Walker',
  'Young', 'Allen', 'King', 'Wright', 'Scott', 'Torres', 'Nguyen', 'Hill', 'Flores',
  'Green', 'Adams', 'Nelson', 'Baker', 'Hall', 'Rivera', 'Campbell', 'Mitchell',
  'Carter', 'Roberts', 'Gomez', 'Phillips', 'Evans', 'Turner', 'Diaz', 'Parker',
  'Cruz', 'Edwards', 'Collins', 'Reyes', 'Stewart', 'Morris', 'Morales', 'Murphy',
  'Cook', 'Rogers', 'Gutierrez', 'Ortiz', 'Morgan', 'Cooper', 'Peterson', 'Bailey'
];

const CITIES = [
  'Toronto, ON', 'Mississauga, ON', 'Brampton, ON', 'Markham, ON', 'Vaughan, ON',
  'Richmond Hill, ON', 'Oakville, ON', 'Burlington, ON', 'Hamilton, ON', 'Ottawa, ON'
];

const DEVICES_AND_FAULTS = [
  {
    name: 'Apple iPhone 15 Pro Max',
    fault: 'Cracked front OLED screen after drop. Touch digitizer unresponsive on lower third.',
    part: 'OEM Soft OLED Screen Assembly (iPhone 15 Pro Max)',
    partCost: 16500,
    partPrice: 28900,
    labor: 8500,
    priority: 'URGENT',
  },
  {
    name: 'Samsung Galaxy S24 Ultra',
    fault: 'Rear camera glass shattered. 5x telephoto lens blurry and producing lens flare.',
    part: 'Rear Triple Camera Lens Module + Bezel (S24 Ultra)',
    partCost: 4500,
    partPrice: 9500,
    labor: 7500,
    priority: 'STANDARD',
  },
  {
    name: 'Apple iPhone 14',
    fault: 'Battery health showing 74%. Device shutting down unexpectedly at 30% battery.',
    part: 'High-Capacity Replacement Battery (iPhone 14)',
    partCost: 2800,
    partPrice: 7900,
    labor: 6500,
    priority: 'STANDARD',
  },
  {
    name: 'Google Pixel 8 Pro',
    fault: 'USB-C charging port loose. Device only charges when cable is bent upwards.',
    part: 'Sub-Board USB-C Flex Cable (Pixel 8 Pro)',
    partCost: 2200,
    partPrice: 6500,
    labor: 8500,
    priority: 'STANDARD',
  },
  {
    name: 'Apple iPad Pro 12.9" (6th Gen)',
    fault: 'Bent aluminum chassis and broken front glass after being stepped on in backpack.',
    part: 'Liquid Retina XDR Display Assembly (iPad Pro 12.9)',
    partCost: 24000,
    partPrice: 38500,
    labor: 11000,
    priority: 'STANDARD',
  },
  {
    name: 'Samsung Galaxy Z Flip 5',
    fault: 'Crease on inner folding display has dead black pixel bleeding line along the hinge.',
    part: 'Inner Foldable AMOLED Display + Hinge Subframe (Z Flip 5)',
    partCost: 21000,
    partPrice: 34900,
    labor: 12000,
    priority: 'URGENT',
  },
  {
    name: 'Apple MacBook Pro 14" (M2 Pro)',
    fault: 'Spilled coffee over keyboard. Several keys sticky, trackpad click intermittently failing.',
    part: 'Full Top Case Assembly with Backlit Keyboard & Trackpad',
    partCost: 19500,
    partPrice: 32000,
    labor: 12500,
    priority: 'STANDARD',
  },
  {
    name: 'Sony PlayStation 5',
    fault: 'HDMI port pins bent and broken inside socket. No video output to TV, white light pulses.',
    part: 'Reinforced 4K HDMI 2.1 Female Socket Connector',
    partCost: 800,
    partPrice: 3500,
    labor: 9500,
    priority: 'STANDARD',
  },
  {
    name: 'Nintendo Switch OLED',
    fault: 'Left Joy-Con rail not detecting controller. Right analog stick experiencing heavy drift.',
    part: 'Left Rail Flex Ribbon + Hall Effect Anti-Drift Joystick',
    partCost: 1600,
    partPrice: 4800,
    labor: 6000,
    priority: 'LOW',
  },
  {
    name: 'Apple iPhone 13 Pro',
    fault: 'Back glass cracked in spiderweb pattern. Wireless charging and MagSafe still functional.',
    part: 'Rear Back Glass Panel (Sierra Blue)',
    partCost: 2400,
    partPrice: 8500,
    labor: 7500,
    priority: 'STANDARD',
  },
  {
    name: 'Dell XPS 15 9520',
    fault: 'Fans running at maximum speed continuously. Thermal throttling and overheating under load.',
    part: 'Thermal Grizzly Kryonaut Thermal Paste & Copper Heatsink Service',
    partCost: 1200,
    partPrice: 3500,
    labor: 8500,
    priority: 'LOW',
  },
  {
    name: 'Lenovo ThinkPad X1 Carbon',
    fault: 'Power button LED blinks 3 times then turns off. No boot or charging indication.',
    part: 'Power Delivery Controller IC Replacement / Micro-soldering',
    partCost: 3500,
    partPrice: 9000,
    labor: 14000,
    priority: 'URGENT',
  },
  {
    name: 'Apple iPhone 12 Mini',
    fault: 'Earpiece speaker extremely quiet during phone calls. Full volume barely audible.',
    part: 'Upper Ear Speaker & Sensor Flex Assembly',
    partCost: 1800,
    partPrice: 5500,
    labor: 6500,
    priority: 'STANDARD',
  },
  {
    name: 'Samsung Galaxy A54 5G',
    fault: 'Water immersion at the beach. Device does not turn on and gets warm when plugged in.',
    part: 'Ultrasonic Motherboard Decontamination & Corrosion Cleaning',
    partCost: 900,
    partPrice: 3000,
    labor: 8500,
    priority: 'STANDARD',
  },
  {
    name: 'Apple Watch Series 8 45mm',
    fault: 'OLED screen popped off enclosure after battery expanded (swollen battery pill).',
    part: 'OEM Battery + Waterproof Rework Gasket Seal Kit',
    partCost: 3200,
    partPrice: 8900,
    labor: 7000,
    priority: 'STANDARD',
  }
];

const TECHNICIANS = ['Alex Mercer', 'Alice Senior Tech', 'Bob Technician'];
const BENCHES = ['Bench 1', 'Bench 2', 'Bench 3', 'Micro-Soldering Station', 'Intake Rack'];
const STATUSES = ['PENDING', 'IN_PROGRESS', 'WAITING_ON_PARTS', 'COMPLETED'];

async function generateWorkOrders() {
  console.log('🚀 Starting generation of 110 realistic repair work orders...');

  const setting = await prisma.setting.findFirst();
  let currentNext = setting?.nextTicketNumber || 21;
  const maxTicket = await prisma.ticket.aggregate({ _max: { ticketNumber: true } });
  if (maxTicket._max.ticketNumber && maxTicket._max.ticketNumber >= currentNext) {
    currentNext = maxTicket._max.ticketNumber + 1;
  }

  console.log(`Starting from Ticket Number: #${currentNext}`);

  const batchSize = 10;
  const totalToCreate = 110;
  let createdCount = 0;

  for (let batch = 0; batch < totalToCreate; batch += batchSize) {
    const currentBatchCount = Math.min(batchSize, totalToCreate - batch);

    for (let i = 0; i < currentBatchCount; i++) {
      const ticketNum = currentNext++;
      const firstName = FIRST_NAMES[(ticketNum * 7 + i) % FIRST_NAMES.length];
      const lastName = LAST_NAMES[(ticketNum * 13 + i) % LAST_NAMES.length];
      const fullName = `${firstName} ${lastName}`;
      
      // Distinct 10-digit Canadian phone numbers
      const areaCode = [416, 647, 905, 289, 519, 613][ticketNum % 6];
      const mid = 200 + ((ticketNum * 17) % 700);
      const end = 1000 + ((ticketNum * 31) % 8999);
      const phoneDigits = `${areaCode}${mid}${end}`;
      const phoneDisplay = `(${areaCode}) ${mid}-${end}`;
      const email = `${firstName.toLowerCase()}.${lastName.toLowerCase()}${ticketNum}@gmail.com`;
      const city = CITIES[ticketNum % CITIES.length];

      // Customer upsert
      const customer = await prisma.customer.upsert({
        where: { phoneDigits },
        update: {},
        create: {
          fullName,
          phone: phoneDisplay,
          phoneDigits,
          email,
          address: `${100 + (ticketNum * 12) % 800} Main St, ${city}`,
          notes: 'Customer prefers SMS updates.',
        },
      });

      // Device
      const modelTemplate = DEVICES_AND_FAULTS[ticketNum % DEVICES_AND_FAULTS.length];
      const serialNumber = `SN-${ticketNum}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
      const device = await prisma.device.create({
        data: {
          customerId: customer.id,
          name: modelTemplate.name,
          serialNumber,
          passcode: (ticketNum % 4 === 0) ? `${1000 + (ticketNum % 9000)}` : 'None provided',
          condition: (ticketNum % 3 === 0) ? 'Scratched screen, minor bezel dents' : 'Normal wear, minor scratches',
        },
      });

      // Status distribution: ~35% COMPLETED, ~35% IN_PROGRESS, ~15% PENDING, ~15% WAITING_ON_PARTS
      const statusIdx = ticketNum % 10;
      let status = 'COMPLETED';
      if (statusIdx < 2) status = 'PENDING';
      else if (statusIdx < 5) status = 'IN_PROGRESS';
      else if (statusIdx < 7) status = 'WAITING_ON_PARTS';
      else status = 'COMPLETED';

      // Timestamps spread across past 21 days
      const daysAgo = (totalToCreate - (ticketNum % totalToCreate)) % 21;
      const createdAt = new Date(Date.now() - daysAgo * 86400000 - ((ticketNum % 24) * 3600000));
      const dueDate = new Date(createdAt.getTime() + 48 * 3600000); // 2 days turnaround
      const completedAt = status === 'COMPLETED' ? new Date(Math.min(Date.now(), createdAt.getTime() + 26 * 3600000)) : null;

      const tech = TECHNICIANS[ticketNum % TECHNICIANS.length];
      const bench = BENCHES[ticketNum % BENCHES.length];
      const storageBin = `BIN-${String.fromCharCode(65 + (ticketNum % 6))}-${(ticketNum % 20) + 1}`;

      const laborCents = modelTemplate.labor;
      const taxRateBps = 1300; // 13% Ontario HST

      const ticket = await prisma.ticket.create({
        data: {
          ticketNumber: ticketNum,
          customerId: customer.id,
          deviceId: device.id,
          status,
          priority: modelTemplate.priority,
          faultDescription: modelTemplate.fault,
          laborCents,
          discountCents: (ticketNum % 7 === 0) ? 1000 : 0, // occasional $10 promo discount
          taxRateBps,
          technician: tech,
          bench: status === 'PENDING' ? null : bench,
          storageBin,
          diagnostics: JSON.stringify({
            ...(status !== 'PENDING' ? { screen: 'PASS', touch: 'PASS' } : {}),
            battery: 'PASS',
            cameras: 'PASS',
            charging: 'PASS',
            audio: 'PASS',
            wifi: 'PASS',
          }),
          dueDate,
          completedAt,
          createdAt,
          updatedAt: completedAt || createdAt,
        },
      });

      // Ticket Item (the part)
      const partSubtotal = modelTemplate.partPrice;
      await prisma.ticketItem.create({
        data: {
          ticketId: ticket.id,
          description: modelTemplate.part,
          quantity: 1,
          unitPriceCents: modelTemplate.partPrice,
          unitCostCents: modelTemplate.partCost,
          createdAt,
        },
      });

      // Initial Events
      await prisma.ticketEvent.createMany({
        data: [
          {
            ticketId: ticket.id,
            kind: 'STATUS',
            message: `Work Order #${ticketNum} created with priority ${modelTemplate.priority}.`,
            author: 'System',
            createdAt,
          },
          {
            ticketId: ticket.id,
            kind: 'INTERNAL_NOTE',
            message: `Initial bench inspection assigned to ${tech}. Storage location: ${storageBin}.`,
            author: tech,
            createdAt: new Date(createdAt.getTime() + 15 * 60000),
          },
        ],
      });

      // Calculate total with HST
      const netSubtotal = laborCents + partSubtotal - ticket.discountCents;
      const taxCents = Math.round((netSubtotal * taxRateBps) / 10000);
      const grandTotalCents = netSubtotal + taxCents;

      // Payments
      if (status === 'COMPLETED') {
        const payMethod = ['CARD', 'DEBIT', 'CASH', 'E_TRANSFER'][ticketNum % 4];
        await prisma.payment.create({
          data: {
            ticketId: ticket.id,
            amountCents: grandTotalCents,
            method: payMethod,
            note: 'Paid in full on customer pickup',
            createdAt: completedAt!,
          },
        });
        await prisma.ticketEvent.create({
          data: {
            ticketId: ticket.id,
            kind: 'PAYMENT',
            message: `Payment received: $${(grandTotalCents / 100).toFixed(2)} via ${payMethod}. Device tested and handed over to customer.`,
            author: tech,
            createdAt: completedAt!,
          },
        });
      } else if (status === 'IN_PROGRESS' || status === 'WAITING_ON_PARTS') {
        if (ticketNum % 2 === 0) {
          // 50% deposit paid
          const depositCents = Math.round(grandTotalCents / 2);
          await prisma.payment.create({
            data: {
              ticketId: ticket.id,
              amountCents: depositCents,
              method: 'CARD',
              note: 'Parts pre-order deposit (50%)',
              createdAt: new Date(createdAt.getTime() + 30 * 60000),
            },
          });
          await prisma.ticketEvent.create({
            data: {
              ticketId: ticket.id,
              kind: 'PAYMENT',
              message: `Deposit received: $${(depositCents / 100).toFixed(2)} via CARD.`,
              author: tech,
              createdAt: new Date(createdAt.getTime() + 30 * 60000),
            },
          });
        }
      }

      createdCount++;
    }
    console.log(`✓ Inserted batch: ${createdCount}/${totalToCreate} work orders`);
  }

  // Update setting.nextTicketNumber to sequentially follow the last created ticket
  await prisma.setting.update({
    where: { id: setting?.id || 1 },
    data: { nextTicketNumber: currentNext },
  });

  const finalCount = await prisma.ticket.count();
  console.log(`\n🎉 Successfully completed!`);
  console.log(`Total Tickets in Database: ${finalCount}`);
  console.log(`Next Work Order Number set to: #${currentNext}`);
}

generateWorkOrders()
  .catch((err) => {
    console.error('Failed to generate work orders:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
