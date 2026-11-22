import fs from 'node:fs';
import { prisma } from '../src/server/prisma';

if (fs.existsSync('.env')) {
  try {
    (process as any).loadEnvFile?.('.env');
  } catch {}
}

const LEGACY_DEMO_TICKET_IDS = [
  'tkt-test-sync-1',
  '58e737c6-f590-4e65-8e28-3541f5e277e7',
  'cd2f4c06-4d00-4364-958d-fd7bc86e35a2',
  '7070afde-bbb6-421a-af5a-7aa0639fa31d',
  '751fa998-ba4c-4104-a0a9-68718e906d5d',
];

const LEGACY_DEMO_CUSTOMER_NAMES = ['Sarah Connor', 'John Wick', 'arteen', 'Marcus Vance'];

async function main() {
  console.log('[Faso Fix POS] Running standalone legacy demo data purge...');

  const ticketWhere = {
    OR: [
      { id: { in: LEGACY_DEMO_TICKET_IDS } },
      { customer: { fullName: { in: LEGACY_DEMO_CUSTOMER_NAMES } } },
    ],
  };

  const eventRes = await prisma.ticketEvent.deleteMany({
    where: {
      OR: [
        { ticketId: { in: LEGACY_DEMO_TICKET_IDS } },
        { ticket: { customer: { fullName: { in: LEGACY_DEMO_CUSTOMER_NAMES } } } },
      ],
    },
  });

  const itemRes = await prisma.ticketItem.deleteMany({
    where: {
      OR: [
        { ticketId: { in: LEGACY_DEMO_TICKET_IDS } },
        { ticket: { customer: { fullName: { in: LEGACY_DEMO_CUSTOMER_NAMES } } } },
      ],
    },
  });

  const payRes = await prisma.payment.deleteMany({
    where: {
      OR: [
        { ticketId: { in: LEGACY_DEMO_TICKET_IDS } },
        { ticket: { customer: { fullName: { in: LEGACY_DEMO_CUSTOMER_NAMES } } } },
      ],
    },
  });

  const ticketRes = await prisma.ticket.deleteMany({ where: ticketWhere });

  const deviceRes = await prisma.device.deleteMany({
    where: { customer: { fullName: { in: LEGACY_DEMO_CUSTOMER_NAMES } } },
  });

  const customerRes = await prisma.customer.deleteMany({
    where: { fullName: { in: LEGACY_DEMO_CUSTOMER_NAMES } },
  });

  console.log(
    `[Faso Fix POS] Purge complete: ${ticketRes.count} tickets, ${customerRes.count} customers, ${deviceRes.count} devices, ${itemRes.count} items, ${payRes.count} payments, ${eventRes.count} events removed.`
  );
}

main()
  .catch((err) => {
    console.error('[Purge Error]', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
