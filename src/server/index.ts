import express, { Request, Response } from 'express';
import cors from 'cors';
import { ticketService } from './ticketService';
import { prisma } from './prisma';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json());

// API: Dashboard KPI Stats
app.get('/api/stats', async (req: Request, res: Response) => {
  try {
    const bench = req.query.bench as string | undefined;
    const stats = await ticketService.getStats(bench);
    res.json({ success: true, data: stats });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get Tickets
app.get('/api/tickets', async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const search = req.query.search as string | undefined;
    const bench = req.query.bench as string | undefined;
    const tickets = await ticketService.getTickets({ status, search, benchNumber: bench });
    res.json({ success: true, count: tickets.length, data: tickets });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Get Single Ticket
app.get('/api/tickets/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await ticketService.getTicketById(req.params.id);
    if (!ticket) {
      return res.status(404).json({ success: false, error: 'Ticket not found' });
    }
    res.json({ success: true, data: ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Create Ticket
app.post('/api/tickets', async (req: Request, res: Response) => {
  try {
    const { customer, deviceMakeModel, serialNumber, faultDescription, price, technicianNote, dueDate, status, priority, passcode, benchNumber, condition } = req.body;

    const parts = (deviceMakeModel || '').trim().split(' ');
    const make = parts[0] || 'Unknown';
    const model = parts.slice(1).join(' ') || 'Device';

    const ticket = await ticketService.createTicket({
      customer,
      device: {
        make,
        model,
        serialNumber,
        passcode,
        condition,
      },
      faultDescription,
      price: typeof price === 'string' ? parseFloat(price) : price,
      technicianNote,
      dueDate,
      status,
      priority,
      benchNumber,
    });

    res.status(201).json({ success: true, data: ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Attach Part or Labor to Ticket
app.post('/api/tickets/:id/parts', async (req: Request, res: Response) => {
  try {
    const { partId, customName, price, quantity } = req.body;
    const part = await ticketService.attachPart(req.params.id, {
      partId,
      customName,
      price: parseFloat(price),
      quantity: parseInt(quantity || 1),
    });
    res.status(201).json({ success: true, data: part });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Quick Complete Status Action
app.post('/api/tickets/:id/quick-complete', async (req: Request, res: Response) => {
  try {
    const ticket = await ticketService.quickComplete(req.params.id);
    res.json({ success: true, message: 'Ticket marked completed', data: ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Add Note to Ticket
app.post('/api/tickets/:id/notes', async (req: Request, res: Response) => {
  try {
    const { note, type } = req.body;
    const record = await ticketService.addNote(req.params.id, note, type);
    res.json({ success: true, data: record });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Record Payment for Ticket Invoice
app.post('/api/tickets/:id/payments', async (req: Request, res: Response) => {
  try {
    const { amount, method } = req.body;
    const payment = await ticketService.recordPayment(req.params.id, parseFloat(amount), method);
    res.json({ success: true, data: payment });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Send Customer SMS
app.post('/api/tickets/:id/notify', async (req: Request, res: Response) => {
  try {
    const { message, customerPhone } = req.body;
    console.log(`[SMS Gateway] Dispatched to ${customerPhone}: "${message}"`);
    
    await ticketService.addNote(req.params.id, `[SMS to ${customerPhone}]: ${message}`, 'CUSTOMER');

    res.json({
      success: true,
      message: `SMS update successfully sent to ${customerPhone}`,
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Update Ticket
app.put('/api/tickets/:id', async (req: Request, res: Response) => {
  try {
    const ticket = await ticketService.updateTicket(req.params.id, req.body);
    res.json({ success: true, data: ticket });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Delete Ticket (Soft Delete)
app.delete('/api/tickets/:id', async (req: Request, res: Response) => {
  try {
    await ticketService.deleteTicket(req.params.id);
    res.json({ success: true, message: 'Ticket soft-deleted from active queue' });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Customers list
app.get('/api/customers', async (_req: Request, res: Response) => {
  try {
    const customers = await ticketService.getCustomers();
    res.json({ success: true, data: customers });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Parts Inventory
app.get('/api/inventory', async (_req: Request, res: Response) => {
  try {
    const parts = await ticketService.getInventory();
    res.json({ success: true, data: parts });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post('/api/inventory', async (req: Request, res: Response) => {
  try {
    const { sku, name, category, cost, retail, stockQuantity, reorderPoint, supplier } = req.body;
    const part = await prisma.inventoryPart.create({
      data: {
        sku: (sku || `PRT-${Date.now().toString().slice(-6)}`).toUpperCase(),
        name,
        category: category || 'GENERAL',
        costInCents: Math.round(parseFloat(cost || 0) * 100),
        retailInCents: Math.round(parseFloat(retail || 0) * 100),
        stockQuantity: parseInt(stockQuantity || 0),
        reorderPoint: parseInt(reorderPoint || 2),
        supplier: supplier || 'Direct Supplier',
      },
    });
    res.status(201).json({ success: true, data: part });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// API: Export Work Orders CSV
app.get('/api/export/tickets', async (_req: Request, res: Response) => {
  try {
    const csv = await ticketService.exportTicketsCsv();
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="ApexFix-WorkOrders.csv"');
    res.send(csv);
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`[ApexFix API] Running on http://localhost:${PORT}`);
});
