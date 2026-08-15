# Personal Financial Management & Wealth Control System (PFMS)
## Stage 0 — Architecture & Design Document — v0.1

Prepared for: Daniel Ilunga
Status: **Draft for approval** — no build work has started beyond this document. Per your decisions, this supersedes the original "Excel first" framing in the master spec: we are building the full-stack app directly.

---

## 0. Decisions already locked in (from your answers)

| Decision | Choice |
|---|---|
| Loan interest accrual | **Compounding on total owed.** $100 → $120 at month 1. If still unpaid, month 2 charges 20% of the $120 owed → $144. Month 3 → $172.80. Interest compounds on the full outstanding balance each unpaid period, not just the original principal. |
| SMS reminders | **Sent to the borrower**, staged: a few days before due date, on the due date, then repeating while overdue. You can tune the exact cadence. |
| App delivery | **Installable web app (PWA)** — one responsive codebase, installs to phone home screen and desktop like a native app, no App Store/Play Store review needed. Native app-store wrapping is a possible Phase 2, not part of v1. |
| Hosting & SMS provider | **You provision the accounts.** I build the full codebase and a step-by-step setup guide; you create the hosting and SMS accounts (this sandbox is temporary and cannot run your live production system after the session ends). |

---

## A. Recommended Final Architecture

**Pattern:** A single backend API (the source of truth) + one responsive frontend codebase that runs as an installable Progressive Web App on both desktop and mobile. This directly satisfies "full stack, mobile app and desktop" without needing separate iOS/Android/Windows codebases or app-store accounts.

| Layer | Choice | Why |
|---|---|---|
| Backend | Node.js + TypeScript, **NestJS** | Structured, testable, scales from solo project to something bigger later; shares types with frontend. |
| Database | **PostgreSQL** | ACID transactions matter for money; `numeric` type avoids floating-point rounding errors; strong support for historical/time-series queries (net worth over years). |
| ORM | **Prisma** | Schema-as-code, type-safe queries, built-in migration history — keeps schema changes auditable over a 5–10 year lifespan. |
| Frontend | **React + TypeScript + Vite**, PWA plugin | Installable, offline-capable shell, one codebase for desktop browser and phone. |
| Styling | Tailwind, a calm/neutral design system | Matches spec §36 — "serious personal financial dashboard," not a colorful budgeting template. |
| Data fetching | TanStack Query | Caching, background refresh, works well offline-first. |
| Auth | Single-user session/JWT + PIN or password | This is a personal system, not multi-tenant — kept deliberately simple. |
| Scheduler | Cron job inside the backend (node-cron) or hosted scheduled job | Runs daily: checks loan due dates, recurring transactions, generates reminders. |
| SMS | Pluggable `SmsProvider` interface, default implementation **Africa's Talking** (strong Zimbabwe coverage/pricing); Twilio as an alternative | You supply the API key; the interface means swapping providers later doesn't touch business logic. |
| Money storage | Postgres `numeric(18,2)` per currency, never floats | Prevents cent-level drift over years of transactions. |
| Currency handling | Every transaction keeps its original currency + amount; conversion only happens at query time via a configurable `exchange_rates` table | Matches spec §3 exactly — never overwrites history. |
| Hosting (you provision) | Render or Railway (backend + Postgres, ~$0–20/mo), same platform or Vercel/Netlify for the frontend PWA | Affordable, minimal ops for a solo personal system. |

**Why not Excel v1 → app v2 as originally scoped:** you explicitly asked for the full-stack app now, including borrower SMS automation that Excel structurally cannot do (no server, no persistent background jobs, no telephony). Skipping straight to the app is the right call given that requirement — Excel could not deliver the lending/reminder module at all.

**What this sandbox can and can't do:** I can write, test, and hand you the entire codebase, database schema, and migrations here. I cannot host a permanent live server, keep a database running after this session ends, or send real SMS — those require your own funded accounts. Stage 10 will include the exact setup steps.

---

## B. Application Module Structure (replaces "sheet list")

1. **Dashboard** — home screen, current position at a glance
2. **Setup & Configuration** — categories, accounts, currencies, payment methods, thresholds
3. **Accounts** — cash/bank/mobile money/savings/investment accounts
4. **Income**
5. **Expenses**
6. **Transfers**
7. **Budget Planner** (budget vs actual, variance, allocation)
8. **Recurring Transactions**
9. **Savings Goals** (incl. Emergency Fund)
10. **Investments**
11. **Lending & Debts** — two views on one module:
    - *Loans I've Given* — borrower KYC, 20% compounding interest engine, repayment tracking, SMS reminders
    - *Money I Owe* — payables to others
12. **Net Worth**
13. **Currency Overview** — a USD/ZIG/Combined toggle applied across the app rather than separate sheets
14. **Monthly Review**
15. **Annual Review**
16. **Analytics & Forecasting**
17. **Reminders & Notifications log** — every SMS/alert sent, for transparency
18. **System Guide / Help**
19. **Settings & Data** — backup/export, data-quality checks, security

---

## C. Core Data Model (tables)

```
users                 — single user profile, PIN/password hash, security settings

accounts               — id, name, type (cash/bank/mobile money/savings/investment/other),
                          currency, opening_balance, opening_date, active, notes

categories              — id, kind (income/expense), parent_id (for subcategories),
                          name, active, is_essential (bool, for essential vs discretionary)

exchange_rates          — id, date, from_currency, to_currency, rate, source/notes

transactions (ledger)   — id, type (income/expense/transfer), date, account_id,
                          category_id, currency, amount, description,
                          payment_method, is_essential, is_recurring,
                          recurring_id (nullable), status (expected/received for income),
                          linked_transfer_id (pairs the two legs of a transfer),
                          created_at, updated_at

  → Single unified ledger table, not separate Income/Expense/Transfer sheets.
    "type" plus a few type-specific nullable fields keep it one source of truth,
    per spec §B (Single Source of Truth) and §C (Transaction-Based Architecture).
    The UI still presents distinct Income/Expense/Transfer entry screens for
    simplicity — they all write to this one table.

budgets                 — id, category_id, period (month), amount, currency,
                          warning_threshold_pct, critical_threshold_pct

recurring_transactions  — id, description, type, category_id, amount, currency,
                          account_id, frequency, start_date, end_date, next_due_date, active

savings_goals           — id, name, target_amount, currency, target_date,
                          monthly_target, status
goal_contributions      — id, goal_id, transaction_id, amount, date

investments              — id, name, type, date_invested, initial_capital, currency,
                          expected_return, expected_return_date, current_value,
                          status, risk_level, notes
investment_transactions  — id, investment_id, type (contribution/return/withdrawal),
                          amount, currency, date

borrowers                — id, full_name, national_id, address, phone_number,
                            email (optional), notes, created_at
                            [PII — see security note in section F]

loans                    — id, borrower_id, principal, currency, date_given,
                            interest_rate (default 20%), compounding_period (monthly),
                            first_due_date, status (active/repaid/overdue/written_off),
                            notes
loan_interest_accruals   — id, loan_id, period_start, period_end,
                            opening_balance, interest_charged, closing_balance
                            [system-generated, one row per compounding period — this is
                            what makes the compounding calculation auditable/transparent]
loan_repayments           — id, loan_id, date, amount, currency,
                            applied_to_interest, applied_to_principal
loan_reminders             — id, loan_id, channel (sms), recipient_phone,
                            trigger_type (pre-due/due/overdue), scheduled_for,
                            sent_at, status, message_text

debts_payable            — id, creditor_name, date, original_amount, currency,
                            purpose, due_date, amount_paid, status

net_worth_snapshots      — id, date, total_assets, total_liabilities, net_worth,
                            liquid_assets, investments_value, receivables_value,
                            (auto-generated monthly + on demand)

audit_log                — id, table_name, record_id, action, old_value, new_value,
                            changed_at  (protects historical integrity, spec §26)
```

---

## D. Key Relationships

- `accounts (1) → (many) transactions` — every transaction touches one account (transfers touch two, linked via `linked_transfer_id`).
- `categories (1) → (many) transactions` and `(1) → (many) budgets`.
- `borrowers (1) → (many) loans` — one person can have multiple loans over time.
- `loans (1) → (many) loan_interest_accruals` — one row generated automatically per period the loan remains unpaid; this is the audit trail behind every compounding interest number (transparency requirement, spec §G).
- `loans (1) → (many) loan_repayments` — partial repayments are applied **interest-first, then principal** (industry-standard convention; flagged as an assumption below for you to confirm or override).
- `loans (1) → (many) loan_reminders` — every SMS sent or scheduled is logged, so you can see reminder history per borrower.
- `savings_goals (1) → (many) goal_contributions`, each linked back to the `transactions` row that funded it.
- `investments (1) → (many) investment_transactions`.
- `net_worth_snapshots` are derived/computed, not manually entered — computed from live balances of accounts + investments + outstanding loans (asset) minus debts_payable (liability).

---

## E. Key Formulas

**Loan interest (compounding, per your decision):**
```
closing_balance(period_n) = opening_balance(period_n) × (1 + 0.20)   [if unpaid at period end]
```
Example: $100 principal, 20% monthly, unpaid 3 months straight:
Month 1 close: $120.00 → Month 2 close: $144.00 → Month 3 close: $172.80

If a partial payment is made mid-period, interest for that period is calculated on the balance still outstanding at the compounding date (the loan's monthly anniversary from `date_given`), not prorated daily — this keeps the rule exactly matching your description ("after one month or from the day they borrowed").

**Account balance:**
```
balance = opening_balance + Σ(income to this account) − Σ(expenses from this account)
          + Σ(transfers in) − Σ(transfers out)
```

**Net worth:**
```
net_worth = (cash + bank + savings + investments_current_value + outstanding_loan_balances)
          − (debts_payable_outstanding)
```

**Savings rate / Expense ratio / Investment rate:**
```
savings_rate    = total_savings_contributions / total_income
expense_ratio   = total_expenses / total_income
investment_rate = total_investment_contributions / total_income
```

**Budget variance:**
```
variance   = budget_amount − actual_amount
pct_used   = actual_amount / budget_amount
status     = OK (< warning_threshold) | WARNING (≥ warning, < critical) | OVER (≥ critical or actual > budget)
```

**Emergency fund coverage:**
```
avg_essential_monthly_expense = average(monthly essential-only expenses, trailing N months)
coverage_months = emergency_fund_balance / avg_essential_monthly_expense
```

---

## F. Missing Features / Things I'd Add

- **Loan default / write-off status** — a formal state for "I've decided this won't be repaid," so it stops compounding indefinitely and instead gets treated as a realized loss for net worth purposes, rather than showing an ever-growing phantom asset.
- **Communication log per borrower** — every reminder sent, plus space for you to log manual follow-ups (calls, in-person conversations).
- **Data privacy for borrower PII** — national ID, address, and phone number are sensitive personal data belonging to *other people*, not just you. I'd recommend: encrypting `national_id` and `address` at rest, restricting export of raw borrower PII, and never including full ID numbers in SMS message bodies. This is a security recommendation, not optional polish.
- **Legal/regulatory note** — Zimbabwe (and most jurisdictions) may regulate interest rates on personal lending depending on scale and whether it's occasional vs. a lending business. I'm not a lawyer and this isn't legal advice, but flagging once so you can confirm this stays within applicable rules — I won't block building the tracking system either way, since recording your own agreed terms is not itself illegal.
- **Backup/export** — scheduled database export (CSV/JSON dump) you can download, independent of the hosting provider, per spec §28.
- **Audit log** — already in the schema above; every edit/delete to a transaction, loan, or repayment is recorded so history can't silently change.
- **Idempotent SMS sending** — guard against double-charging your SMS account or double-texting a borrower if a scheduled job runs twice.

---

## G. Remaining Ambiguities / Assumptions (please confirm or correct)

1. **Loan currency** — assuming loans can be issued in either USD or ZIG, with the same 20% monthly compounding rule applied within that loan's own currency (no cross-currency conversion of the loan itself). Confirm this matches your practice.
2. **Payment allocation order** — assuming partial repayments apply to accrued interest first, then principal. Tell me if you do it differently (e.g., principal first).
3. **Compounding anchor date** — assuming the monthly compounding date is the loan's own anniversary (borrowed on the 5th → compounds on the 5th of each following month), not the calendar month-end. Confirm.
4. **SMS cadence specifics** — "a few days before due date, on due date, then repeating while overdue" — I'll default to 3 days before, on the due date, then every 7 days while overdue, all configurable in Setup. Adjust if you want different intervals.
5. **What stops reminders** — assuming reminders stop automatically once a loan is marked fully repaid or written off.

None of these block starting Stage 1 — they mainly affect the lending module (Stage 4) and reminder engine (Stage 8), so there's time to confirm as we get there.

---

## H. Staged Development Plan

| Stage | Scope |
|---|---|
| 1 | Repo scaffold, auth, Accounts / Income / Expenses / Transfers, Setup & Configuration |
| 2 | Budget engine (budget vs actual, variance, warnings) |
| 3 | Savings Goals + Emergency Fund |
| 4 | Investments, Debts Payable, **Lending module** (borrower KYC + compounding interest engine) |
| 5 | Net Worth engine + historical snapshots |
| 6 | Dashboard (installable PWA home screen) |
| 7 | Monthly/Annual Review + Analytics + Forecasting |
| 8 | SMS reminder engine (requires your provider account credentials) |
| 9 | Testing with realistic scenarios (per spec §34 test standard) |
| 10 | System Guide + deployment/hosting setup guide |

Each stage is built, tested with sample data, and shown to you before moving to the next — same discipline the original spec asked for, just mapped onto app development instead of spreadsheet construction.

---

## I. Recommendation

Build the full-stack PWA now, as you've directed — Excel could not support borrower SMS automation or a persistent lending ledger with scheduled interest accrual, so the "Excel v1, app later" path in the original spec doesn't fit this requirement. Start with the web/PWA delivery (installs on both your phone and PC today, no store review), and treat native App Store/Play Store apps as an optional later phase once the core system is proven and you're ready to create those developer accounts.

---

### Next step

If this architecture looks right, confirm and I'll start **Stage 1**: scaffolding the repository and building Accounts / Income / Expenses / Transfers with real sample data to prove the ledger works before anything else is layered on top. If anything above needs to change — schema, stack choice, or any of the assumptions in section G — tell me and I'll revise this document first.
