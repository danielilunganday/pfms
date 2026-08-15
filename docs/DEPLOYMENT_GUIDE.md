# PFMS Deployment Guide

This covers everything needed to run PFMS as your permanent, always-on system — not just inside a temporary development session. It assumes no prior server-hosting experience and explains each step.

## What you're deploying

- **backend/** — a NestJS API + PostgreSQL database. This is where all your data lives and all the calculations (interest, budgets, net worth) happen.
- **frontend/** — a React Progressive Web App (PWA). Once deployed, you can "install" it to your phone's home screen and your computer's desktop like a real app — no App Store needed.

## Step 1 — Local setup (to try it on your own machine first)

Requirements: Node.js 20+, PostgreSQL 16+ (or a free hosted Postgres — see Step 3).

```bash
cd backend
npm install
cp .env.example .env      # fill in DATABASE_URL and a real JWT_SECRET
npm run db:generate       # generate migration SQL from the schema (only needed after schema changes)
npm run db:migrate        # create the tables
npm run seed               # load default categories, currencies, and settings
npm run build
npm run start:prod         # runs on http://localhost:3001/api
```

```bash
cd frontend
npm install
# create a .env with VITE_API_URL pointing at your backend
npm run build
npm run preview            # or deploy the dist/ folder as a static site
```

## Step 2 — Generate a real JWT_SECRET and PII_ENCRYPTION_KEY

The `.env.example` has placeholders for both. Before running for real:

- Replace `JWT_SECRET` with a long random string — run `openssl rand -hex 32` and paste the result in. This secures login sessions; never share it or commit it to a public repository.
- Set `PII_ENCRYPTION_KEY` the same way (`openssl rand -hex 32`) — this encrypts borrower national ID, address, and phone number at rest. **The app refuses to start with `NODE_ENV=production` set and no key**, specifically so you can't accidentally deploy with real borrower data unprotected. Back this key up somewhere separate from your database backup: if you lose it, existing encrypted borrower data becomes permanently unreadable (new data would need to be re-entered).
- If you're upgrading an existing installation that already has borrower records, run `npm run encrypt-existing-pii` once after setting the key, to encrypt any rows that were saved before this feature existed. It's safe to run more than once.

## Step 3 — Hosting (so it runs permanently, not just on your computer)

You (the account owner) need to create these accounts — nobody else can do this for you, since they require your own billing/identity:

**Database + backend hosting — pick one:**
- **Railway** (railway.app) — simplest. Create a project, add a PostgreSQL plugin, deploy the `backend/` folder, set the environment variables from `.env.example` (Railway gives you the `DATABASE_URL` automatically from the Postgres plugin).
- **Render** (render.com) — similar: a "Web Service" for the backend, a "PostgreSQL" instance for the database, connected via environment variables.
- **Supabase** (supabase.com) — if you'd rather have the database hosted separately and free-tier, use Supabase for Postgres and Railway/Render just for the backend process.

Whichever you choose, make sure the backend runs as a **persistent, always-on process** (not a "serverless function that only runs when called") — the reminder engine needs to run in the background every day even when nobody's using the app.

**Frontend hosting — pick one:**
- Same platform as the backend (Railway/Render both support static sites), or
- **Vercel** or **Netlify** — drag-and-drop `frontend/dist` after running `npm run build`, or connect your Git repository for automatic deploys. Set `VITE_API_URL` to your deployed backend's URL before building.

## Step 4 — SMS provider (for real reminders to borrowers)

Right now, SMS reminders are sent through a "console" stub that just logs what would be sent — safe to test with, sends nothing real, costs nothing. Which provider is active is controlled entirely by one environment variable, `SMS_PROVIDER` — no code changes needed to switch:

| `SMS_PROVIDER` value | What it does |
|---|---|
| `CONSOLE` (default) | Logs the message, sends nothing. Safe for testing. |
| `AFRICAS_TALKING` | Sends real SMS via Africa's Talking — good Zimbabwe coverage/pricing. |
| `TWILIO` | Sends real SMS via Twilio — an alternative with broader global coverage. |

To switch to a real provider:

1. Create an account with **Africa's Talking** (africastalking.com) or **Twilio** (twilio.com) — pick whichever has better coverage/pricing for your borrowers.
2. Fund the account (most providers require a small prepaid balance).
3. Get your credentials from their dashboard.
4. Add to the backend's `.env`:
   ```
   # Africa's Talking:
   SMS_PROVIDER=AFRICAS_TALKING
   AT_API_KEY=your-key-here
   AT_USERNAME=your-username-here

   # — or — Twilio:
   SMS_PROVIDER=TWILIO
   TWILIO_ACCOUNT_SID=your-sid-here
   TWILIO_AUTH_TOKEN=your-token-here
   TWILIO_FROM_NUMBER=+1234567890
   ```
5. Redeploy (restart the backend so it picks up the new environment variable). Test by creating a loan with a due date in the past and calling `POST /api/reminders/run-daily-job` — check your phone.

Budget for this: SMS costs a small fee per message (check current provider pricing), and each loan sends roughly 2 reminders while current, plus one every N days while overdue (configurable in Settings).

## Step 5 — Install the PWA on your phone and desktop

Once the frontend is deployed to a real URL (not localhost):

**Phone (Android, Chrome):** open the site, tap the menu (⋮), tap "Add to Home screen." It now behaves like an installed app, with an icon and its own window.

**Phone (iPhone, Safari):** open the site, tap the Share icon, tap "Add to Home Screen."

**Desktop (Chrome or Edge):** open the site, click the install icon in the address bar (or menu → "Install PFMS…"). It opens in its own app window from then on, separate from your browser tabs.

## Step 6 — Keep the daily job running

The interest-accrual and reminder-dispatch job is scheduled inside the backend process itself (it runs at 08:00 server time every day, via `@nestjs/schedule`). This means: as long as your backend is deployed as an always-on service (Step 3), it happens automatically — there's nothing extra to configure. If you ever move to a serverless/cold-start hosting model, you'd need to trigger `POST /api/reminders/run-daily-job` from an external scheduler (e.g. a cron-job.org ping) instead.

## Step 7 — Backups

Set up automatic daily backups of the Postgres database — Railway, Render, and Supabase all offer this as a setting in their dashboard (usually just a checkbox plus a retention period). Also periodically export your own copy: most of these platforms let you download a `.sql` dump on demand — do this every few months and store it somewhere separate (e.g. your own cloud storage) as a second line of defense.

## Security notes on borrower data

Borrower records include national ID and address — real personal data belonging to other people, not just you. National ID, address, and phone number are encrypted at rest (see Step 2) — even a raw database dump doesn't expose them without `PII_ENCRYPTION_KEY`. Beyond that: treat the database credentials, JWT secret, and PII encryption key as seriously as a bank password. Don't commit `.env` files to a public Git repository, don't share the database connection string, and if you ever suspect a leak, rotate `JWT_SECRET` and your database password immediately (this logs everyone out and requires a fresh login, which is the safe outcome). The API also rate-limits login attempts (5 per minute per IP) to slow down password-guessing, and sends standard security headers (via Helmet) on every response.

## CSV import and receipt uploads

Two more upgrades worth knowing about when planning storage/hosting:

- **CSV import** (`POST /api/import/transactions/preview` and `/commit`) lets you bring in historical transactions in bulk from the Import page — no extra setup needed, it uses the same database.
- **Receipt/photo attachments** are saved to disk under `backend/uploads/receipts/` and served back at `/uploads/receipts/...`. If you deploy to a platform with an ephemeral filesystem (files disappear on redeploy — common on some serverless/container platforms), either mount a persistent volume at `backend/uploads`, or plan to move this to object storage (e.g. S3) later — check your hosting provider's docs for "persistent disk" or "volume" support before relying on this in production.

## Updating the system later

The Prisma-style migration workflow is: change `backend/src/db/schema.ts`, run `npm run db:generate` to create a new migration file, review it, then `npm run db:migrate` to apply it. Never hand-edit the database schema directly — always go through a migration so the history stays in `backend/drizzle/` and can be replayed on a fresh database if needed.
