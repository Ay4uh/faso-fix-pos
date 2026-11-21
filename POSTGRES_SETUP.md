# Faso Fix POS - Cloud PostgreSQL Setup Guide (Supabase / Neon / Vercel Postgres)

Faso Fix POS is designed with hybrid database support:
- **Local Development:** Instant zero-config SQLite (`prisma/dev.db`).
- **Production Cloud:** 100% durable hosted PostgreSQL (Supabase, Neon, AWS RDS, Vercel Postgres).

---

### Option A: Supabase (Recommended - Free Tier Available)
1. Go to [supabase.com](https://supabase.com) and create a project (e.g. `faso-fix-pos`).
2. Go to **Project Settings** -> **Database** -> **Connection string** (URI).
3. Copy the URI (ensure password is inserted, mode is Session or Transaction):
   ```bash
   postgresql://postgres.[ref]:[password]@aws-0-us-east-1.pooler.supabase.com:6543/postgres
   ```
4. In your **Vercel Dashboard** -> **Project Settings** -> **Environment Variables**:
   - Add `DATABASE_URL` with your Supabase connection string.
5. In your local terminal, push the schema:
   ```bash
   DATABASE_URL="your-supabase-url" npx prisma db push
   ```
6. (Optional) Migrate any existing local SQLite records:
   ```bash
   DATABASE_URL="your-supabase-url" npm run db:migrate-pg
   ```

---

### Option B: Neon (Serverless Postgres)
1. Go to [neon.tech](https://neon.tech) and create a database.
2. Copy the connection string.
3. Set `DATABASE_URL` in Vercel.
4. Run `npx prisma db push`.
