# Faso Fix POS & CRM

A modern, high-density Point-of-Sale and Repair CRM web application built for electronics and device repair shops.

## Features
- **Ticket Lifecycle**: High-density work order data grid with status pipeline (Checked In, Diagnosing, Waiting Approval, Waiting on Parts, Ready for Pickup, Completed).
- **Billing & Deposits**: Pre-tax calculations, HST/tax handling, deposit credit tracking, and invoice management.
- **Admin & Tech Access Control**: Scrypt-based password hashing, brute-force protection lockout, role-based endpoint gating, audit logging, and live SQLite database backups.
- **Receipt Printing & SMS Integration**: Thermal receipt builder with public customer notes and private bench notes separation.
- **Light & Responsive Design**: Accessible mobile, tablet, and desktop views with responsive drawer and quick-action toolbars.

## Tech Stack
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS v4, Lucide Icons
- **Backend**: Node.js, Express, Prisma ORM, SQLite
- **Deployment**: Configured for Vercel Serverless & Static SPA hosting

## Local Development
```bash
# Install dependencies
npm install

# Start development servers (frontend on port 3000, backend on port 4000)
npm run dev

# Run test suite
npm test

# Build production bundle
npm run build
```
