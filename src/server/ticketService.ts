import { prisma } from './prisma';

export interface CreateTicketDTO {
  customer: {
    fullName: string;
    phoneNumber: string;
    email?: string;
    address?: string;
  };
  device: {
    type?: string;
    make: string;
    model: string;
    serialNumber?: string;
    passcode?: string;
    color?: string;
    condition?: string;
  };
  faultDescription: string;
  price: number; // in dollars (will convert to cents)
  technicianNote?: string;
  dueDate: string | Date;
  status?: string;
  priority?: string;
  benchNumber?: string;
}

export class TicketService {
  async getTickets(params: { status?: string; search?: string; benchNumber?: string }) {
    const { status, search, benchNumber } = params;
    const where: any = {
      deletedAt: null, // Soft delete filter
    };

    if (status && status !== 'ALL') {
      where.status = status;
    }

    if (benchNumber && benchNumber !== 'ALL') {
      where.benchNumber = benchNumber;
    }

    if (search && search.trim() !== '') {
      const q = search.trim().replace(/^#|^WO\s*#?/i, '');
      where.OR = [
        { ticketNumber: { equals: q } },
        { ticketNumber: { contains: q } },
        { faultDescription: { contains: q } },
        { customer: { fullName: { contains: q } } },
        { customer: { phoneNumber: { contains: q } } },
        { device: { make: { contains: q } } },
        { device: { model: { contains: q } } },
        { device: { serialNumber: { contains: q } } },
      ];
    }

    const tickets = await prisma.ticket.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        customer: true,
        device: true,
        invoice: {
          include: {
            payments: true,
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
          take: 5,
        },
        partsUsed: {
          include: {
            part: true,
          },
        },
      },
    });

    return tickets.map((t) => ({
      ...t,
      price: t.priceInCents / 100,
      discount: t.discountInCents / 100,
      deviceMakeModel: `${t.device.make} ${t.device.model}`,
      serialNumber: t.device.serialNumber,
    }));
  }

  async getTicketById(id: string) {
    const ticket = await prisma.ticket.findUnique({
      where: { id },
      include: {
        customer: {
          include: {
            devices: true,
            tickets: {
              where: { NOT: { id }, deletedAt: null },
              take: 5,
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        device: true,
        invoice: {
          include: {
            payments: {
              orderBy: { createdAt: 'desc' },
            },
          },
        },
        history: {
          orderBy: { createdAt: 'desc' },
        },
        partsUsed: {
          include: {
            part: true,
          },
        },
      },
    });

    if (!ticket) return null;

    return {
      ...ticket,
      price: ticket.priceInCents / 100,
      discount: ticket.discountInCents / 100,
      deviceMakeModel: `${ticket.device.make} ${ticket.device.model}`,
      serialNumber: ticket.device.serialNumber,
    };
  }

  async createTicket(data: CreateTicketDTO) {
    const priceInCents = Math.round((data.price || 0) * 100);

    return await prisma.$transaction(async (tx) => {
      // 1. Customer: find or create by unique phone
      let customer = await tx.customer.findUnique({
        where: { phoneNumber: data.customer.phoneNumber },
      });

      if (!customer) {
        customer = await tx.customer.create({
          data: {
            fullName: data.customer.fullName,
            phoneNumber: data.customer.phoneNumber,
            email: data.customer.email || null,
            address: data.customer.address || null,
          },
        });
      }

      // 2. Device: find or create for customer
      let device = null;
      if (data.device.serialNumber && data.device.serialNumber.trim() !== '') {
        device = await tx.device.findFirst({
          where: {
            customerId: customer.id,
            serialNumber: data.device.serialNumber.trim(),
          },
        });
      }

      if (!device) {
        device = await tx.device.create({
          data: {
            customerId: customer.id,
            type: data.device.type || 'SMARTPHONE',
            make: data.device.make,
            model: data.device.model,
            serialNumber: data.device.serialNumber || null,
            passcode: data.device.passcode || null,
            color: data.device.color || null,
            condition: data.device.condition || null,
          },
        });
      }

      // 3. Sequential Ticket Count: strictly 1, 2, 3...
      const lastTicket = await tx.ticket.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { ticketNumber: true },
      });

      let nextNum = 1;
      if (lastTicket && !isNaN(parseInt(lastTicket.ticketNumber))) {
        nextNum = parseInt(lastTicket.ticketNumber) + 1;
      } else {
        const count = await tx.ticket.count();
        nextNum = count + 1;
      }
      const ticketNumber = nextNum.toString();

      // 4. Create Ticket
      const ticket = await tx.ticket.create({
        data: {
          ticketNumber,
          customerId: customer.id,
          deviceId: device.id,
          faultDescription: data.faultDescription,
          priceInCents,
          technicianNote: data.technicianNote || null,
          dueDate: new Date(data.dueDate),
          status: data.status || 'PENDING',
          priority: data.priority || 'STANDARD',
          benchNumber: data.benchNumber || 'Bench #04',
        },
      });

      // 5. Initial Audit Record
      await tx.ticketStatusHistory.create({
        data: {
          ticketId: ticket.id,
          fromStatus: 'INTAKE',
          toStatus: ticket.status,
          changedBy: 'Alex Mercer',
          note: `Work order #${ticketNumber} generated at ${ticket.benchNumber} for ${device.make} ${device.model}`,
        },
      });

      // 6. Draft Invoice
      const taxInCents = Math.round(priceInCents * 0.0825);
      const invoiceNumber = `INV-${ticketNumber.padStart(4, '0')}`;
      await tx.invoice.create({
        data: {
          invoiceNumber,
          ticketId: ticket.id,
          customerId: customer.id,
          subtotalInCents: priceInCents,
          taxInCents,
          totalInCents: priceInCents + taxInCents,
          amountPaidInCents: 0,
          status: 'UNPAID',
        },
      });

      return {
        ...ticket,
        price: ticket.priceInCents / 100,
        customer,
        device,
      };
    });
  }

  async updateTicket(id: string, updates: any) {
    const existing = await prisma.ticket.findUnique({
      where: { id },
      include: { invoice: true, device: true },
    });

    if (!existing) throw new Error('Ticket not found');

    return await prisma.$transaction(async (tx) => {
      const dataToUpdate: any = {
        version: { increment: 1 },
      };

      if (updates.status && updates.status !== existing.status) {
        dataToUpdate.status = updates.status;
        if (updates.status === 'COMPLETED') {
          dataToUpdate.completedAt = new Date();
          // 90-day parts & labor warranty
          dataToUpdate.warrantyExpiresAt = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        }

        await tx.ticketStatusHistory.create({
          data: {
            ticketId: id,
            fromStatus: existing.status,
            toStatus: updates.status,
            changedBy: 'Alex Mercer',
            note: updates.technicianNote || `Status changed from ${existing.status} to ${updates.status}`,
          },
        });
      }

      if (updates.technicianNote !== undefined) dataToUpdate.technicianNote = updates.technicianNote;
      if (updates.faultDescription !== undefined) dataToUpdate.faultDescription = updates.faultDescription;
      if (updates.dueDate !== undefined) dataToUpdate.dueDate = new Date(updates.dueDate);
      if (updates.benchNumber !== undefined) dataToUpdate.benchNumber = updates.benchNumber;

      if (updates.price !== undefined) {
        const newPriceInCents = Math.round(updates.price * 100);
        dataToUpdate.priceInCents = newPriceInCents;

        if (existing.invoice) {
          const taxInCents = Math.round(newPriceInCents * 0.0825);
          await tx.invoice.update({
            where: { id: existing.invoice.id },
            data: {
              subtotalInCents: newPriceInCents,
              taxInCents,
              totalInCents: newPriceInCents + taxInCents,
            },
          });
        }
      }

      if (updates.passcode !== undefined || updates.serialNumber !== undefined || updates.condition !== undefined) {
        await tx.device.update({
          where: { id: existing.deviceId },
          data: {
            ...(updates.passcode !== undefined && { passcode: updates.passcode }),
            ...(updates.serialNumber !== undefined && { serialNumber: updates.serialNumber }),
            ...(updates.condition !== undefined && { condition: updates.condition }),
          },
        });
      }

      const updated = await tx.ticket.update({
        where: { id },
        data: dataToUpdate,
        include: {
          customer: true,
          device: true,
          invoice: { include: { payments: true } },
          history: { orderBy: { createdAt: 'desc' } },
          partsUsed: { include: { part: true } },
        },
      });

      return {
        ...updated,
        price: updated.priceInCents / 100,
        deviceMakeModel: `${updated.device.make} ${updated.device.model}`,
        serialNumber: updated.device.serialNumber,
      };
    });
  }

  async attachPart(ticketId: string, partData: { partId?: string; customName?: string; price: number; quantity?: number }) {
    return await prisma.$transaction(async (tx) => {
      const ticket = await tx.ticket.findUnique({
        where: { id: ticketId },
        include: { invoice: true, partsUsed: true },
      });
      if (!ticket) throw new Error('Ticket not found');

      const qty = partData.quantity || 1;
      const unitSellInCents = Math.round(partData.price * 100);
      let unitCostInCents = 0;

      // Deduct stock if real part selected
      if (partData.partId) {
        const invPart = await tx.inventoryPart.findUnique({ where: { id: partData.partId } });
        if (invPart) {
          unitCostInCents = invPart.costInCents;
          await tx.inventoryPart.update({
            where: { id: invPart.id },
            data: { stockQuantity: { decrement: qty } },
          });
        }
      }

      // Add TicketPart
      const ticketPart = await tx.ticketPart.create({
        data: {
          ticketId,
          partId: partData.partId || null,
          customName: partData.customName || null,
          quantity: qty,
          unitCostInCents,
          unitSellInCents,
        },
        include: { part: true },
      });

      // Recalculate ticket price and invoice
      const newPriceInCents = ticket.priceInCents + (unitSellInCents * qty);
      const taxInCents = Math.round(newPriceInCents * 0.0825);

      await tx.ticket.update({
        where: { id: ticketId },
        data: { priceInCents: newPriceInCents },
      });

      if (ticket.invoice) {
        await tx.invoice.update({
          where: { id: ticket.invoice.id },
          data: {
            subtotalInCents: newPriceInCents,
            taxInCents,
            totalInCents: newPriceInCents + taxInCents,
          },
        });
      }

      await tx.ticketStatusHistory.create({
        data: {
          ticketId,
          fromStatus: 'PARTS',
          toStatus: 'ATTACHED',
          changedBy: 'Alex Mercer',
          note: `Added line item: ${partData.customName || ticketPart.part?.name || 'Part'} ($${partData.price.toFixed(2)})`,
        },
      });

      return ticketPart;
    });
  }

  async addNote(id: string, noteText: string, noteType: 'CUSTOMER' | 'INTERNAL' = 'INTERNAL') {
    return await prisma.ticketStatusHistory.create({
      data: {
        ticketId: id,
        fromStatus: 'NOTE',
        toStatus: noteType,
        changedBy: 'Alex Mercer',
        note: noteText,
      },
    });
  }

  async recordPayment(ticketId: string, amount: number, method: string = 'CREDIT_CARD') {
    const ticket = await prisma.ticket.findUnique({
      where: { id: ticketId },
      include: { invoice: true },
    });

    if (!ticket || !ticket.invoice) throw new Error('Invoice not found');

    const paymentInCents = Math.round(amount * 100);

    return await prisma.$transaction(async (tx) => {
      const payment = await tx.payment.create({
        data: {
          invoiceId: ticket.invoice!.id,
          amountInCents: paymentInCents,
          method,
          transactionRef: `PAY-${Date.now().toString().slice(-6)}`,
          notes: `Payment received via ${method}`,
        },
      });

      const newAmountPaid = ticket.invoice!.amountPaidInCents + paymentInCents;
      const newStatus =
        newAmountPaid >= ticket.invoice!.totalInCents ? 'PAID' : 'PARTIALLY_PAID';

      await tx.invoice.update({
        where: { id: ticket.invoice!.id },
        data: {
          amountPaidInCents: newAmountPaid,
          status: newStatus,
        },
      });

      if (newStatus === 'PAID') {
        await tx.ticketStatusHistory.create({
          data: {
            ticketId,
            fromStatus: ticket.status,
            toStatus: 'PAID_IN_FULL',
            changedBy: 'Alex Mercer',
            note: `Payment of $${amount.toFixed(2)} received. Work order balance cleared.`,
          },
        });
      }

      return payment;
    });
  }

  async quickComplete(id: string) {
    return this.updateTicket(id, {
      status: 'COMPLETED',
      technicianNote: 'Quick-completed by bench technician. QA diagnostic passed.',
    });
  }

  async deleteTicket(id: string) {
    return await prisma.ticket.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async getStats(benchNumber?: string) {
    const activeWhere: any = {
      deletedAt: null,
      status: { in: ['PENDING', 'IN_PROGRESS', 'WAITING_ON_PARTS'] },
    };
    if (benchNumber && benchNumber !== 'ALL') {
      activeWhere.benchNumber = benchNumber;
    }

    const totalActive = await prisma.ticket.count({ where: activeWhere });
    const inProgress = await prisma.ticket.count({
      where: { ...activeWhere, status: 'IN_PROGRESS' },
    });
    const waitingOnParts = await prisma.ticket.count({
      where: { ...activeWhere, status: 'WAITING_ON_PARTS' },
    });
    const completed = await prisma.ticket.count({
      where: { deletedAt: null, status: 'COMPLETED', ...(benchNumber && benchNumber !== 'ALL' ? { benchNumber } : {}) },
    });
    const pending = await prisma.ticket.count({
      where: { ...activeWhere, status: 'PENDING' },
    });

    // Financial calculations
    const activeTickets = await prisma.ticket.findMany({
      where: activeWhere,
      select: { priceInCents: true },
    });
    const projectedPipeline =
      activeTickets.reduce((sum, t) => sum + t.priceInCents, 0) / 100;

    const completedTickets = await prisma.ticket.findMany({
      where: { deletedAt: null, status: 'COMPLETED', ...(benchNumber && benchNumber !== 'ALL' ? { benchNumber } : {}) },
      select: { priceInCents: true },
    });
    const securedInvoiced =
      completedTickets.reduce((sum, t) => sum + t.priceInCents, 0) / 100;

    const totalPipeline = projectedPipeline + securedInvoiced;
    const customerCount = await prisma.customer.count();

    return {
      totalActive,
      inProgress,
      waitingOnParts,
      completed,
      pending,
      projectedPipeline,
      securedInvoiced,
      totalPipeline,
      customerCount,
    };
  }

  async getCustomers() {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        devices: true,
        tickets: {
          where: { deletedAt: null },
          select: {
            id: true,
            ticketNumber: true,
            status: true,
            priceInCents: true,
            createdAt: true,
          },
        },
      },
    });

    return customers.map((c) => ({
      ...c,
      totalSpend:
        c.tickets.reduce((acc, t) => acc + t.priceInCents, 0) / 100,
    }));
  }

  async getInventory() {
    return await prisma.inventoryPart.findMany({
      orderBy: { stockQuantity: 'asc' },
    });
  }

  async exportTicketsCsv() {
    const tickets = await prisma.ticket.findMany({
      where: { deletedAt: null },
      include: { customer: true, device: true, invoice: true },
      orderBy: { createdAt: 'desc' },
    });

    let csv = 'Ticket #,Customer Name,Phone,Device,Serial/IMEI,Status,Price ($),Due Date,Created At\n';
    for (const t of tickets) {
      csv += `"${t.ticketNumber}","${t.customer.fullName}","${t.customer.phoneNumber}","${t.device.make} ${t.device.model}","${t.device.serialNumber || ''}","${t.status}","${(t.priceInCents / 100).toFixed(2)}","${new Date(t.dueDate).toISOString().slice(0, 10)}","${new Date(t.createdAt).toISOString()}"\n`;
    }
    return csv;
  }
}

export const ticketService = new TicketService();
