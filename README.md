# PFMS — Personal Financial Management & Wealth Control System

Your personal financial control center: accounts, income, expenses, transfers, budgets (per-category and an overall monthly cap), recurring bills, savings goals, investments, a lending module (with configurable compounding interest, encrypted borrower PII, and SMS reminders via Africa's Talking or Twilio), debts, consolidated net worth across USD and ZIG, CSV import for historical transactions, receipt/photo attachments, month-over-month spending insights, an annual review, and a system health/data-quality check — all one app, one login.

## Structure

- `backend/` — NestJS + PostgreSQL API. All business logic and calculations live here (see `docs/` for the schema rationale).
- `frontend/` — React + Vite Progressive Web App. Installs on phone and desktop like a native app; talks to the backend over HTTP.
- `docs/` — `SYSTEM_GUIDE.md` (how to use the app day to day) and `DEPLOYMENT_GUIDE.md` (how to host it permanently, connect a real SMS provider, and install the PWA).
- `PFMS_Architecture_Stage0_v0.1.md` — the original architecture document this system was built from.

## Quick start (local)

```bash
# 1. Postgres running locally, then:
cd backend
npm install
cp .env.example .env   # edit DATABASE_URL / JWT_SECRET
npm run db:generate && npm run db:migrate && npm run seed
npm run start:dev       # http://localhost:3001/api

# 2. in a second terminal:
cd frontend
npm install
npm run dev              # http://localhost:5173
```

Register your owner account from the login screen the first time you open the app (only one owner account is allowed).

## Read next

Start with `docs/SYSTEM_GUIDE.md` if you just want to use the app. Read `docs/DEPLOYMENT_GUIDE.md` when you're ready to put it online permanently, with a real SMS provider for borrower reminders.
