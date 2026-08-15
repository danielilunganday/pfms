# PFMS System Guide — for you, the user

This is your day-to-day guide to the Personal Financial Management & Wealth Control System. It's written for using the app, not for programming it — see `DEPLOYMENT_GUIDE.md` for the technical setup.

## What this system does

It's your financial control center: record income and expenses in seconds, watch your budget in real time, track savings goals and investments, manage money you've lent out (with automatic compounding interest and SMS reminders), track money you owe others, and see your net worth change over time — all in one place, in both USD and ZIG.

## Getting around

The left-hand menu is always there: Dashboard, Accounts, Transactions, Import, Budget, Recurring, Savings Goals, Investments, Lending, Debts, Net Worth, Reports, Annual Review, System Check, Settings. The Dashboard is home — open the app and it's the first thing you see. There's a dark mode toggle (the ☾/☀ icon at the top of the sidebar) if you'd rather use the app at night.

## Recording money coming in or going out

Go to **Transactions**. There are three tabs: Income, Expense, Transfer.

For income, pick the account it landed in, a category (optional), the amount, the date, and whether it's already **Received** or still **Expected** (use Expected for money you know is coming but hasn't arrived yet — it won't count as available cash until you mark it received).

For an expense, pick the account it came out of, a category, the amount and date, and tick "Essential" if it's a need rather than a want — this feeds your emergency fund and essential-vs-discretionary numbers. **Every expense counts toward your overall monthly budget** (see Budgets below) regardless of category — buy a suit, new clothes, anything — it's tracked the moment you record it.

For a transfer, pick the "from" and "to" accounts. Transfers between your own accounts are never counted as income or expense — that distinction is built into the system.

A refund is just recorded as income in the same category as the original expense, with a description like "Refund: …" — that's the standard way to handle it here.

**Attaching a receipt or photo:** every transaction row has an "Attach" link — upload a photo of the receipt or a screenshot of the payment confirmation, and it's stored alongside that transaction. Click "View" any time to open it again. Useful for anything you might need to double-check later (a big purchase, a shared expense, a tax-relevant receipt).

## Bringing in historical transactions (CSV import)

If you've been tracking your finances elsewhere — a spreadsheet, a bank export — go to **Import** instead of entering years of history by hand. Upload a CSV with columns `date, type, account, category, amount, currency, description, paymentMethod, essential` (any order; category and a few others are optional). The page shows you a preview of every row, flags anything it couldn't match (a typo'd account or category name) before anything is saved, and only imports the rows you confirm. Only income and expenses are supported this way — record transfers manually, since they need both legs matched up correctly.

## Accounts

**Accounts** is where you set up each place your money lives: cash, a bank account, mobile money, a savings account, an investment account. Give it an opening balance and date when you first create it — from then on, its balance is calculated automatically from every transaction, never entered by hand.

## Budgets

**Budget** works two ways together, and this is the answer to "can I use this for everyday budgeting — groceries, utilities — and the lending business at the same time?" Yes: they're the same app, same login, same Dashboard. Budgeting and Lending are just two of the modules inside it, sharing the same transaction ledger.

At the top is your **overall monthly budget** — one number, e.g. "$1,500 this month" — and it counts *every* expense you record, in any category, whether or not you bothered to set a budget line for that specific category. Buy a suit, buy new clothes, anything: it counts against this cap the moment you log it. This is your real ceiling for the month, the thing that catches spending you didn't plan a specific budget line for.

Below that are optional **per-category budgets** — set a limit for Groceries, Utilities, Tithe, whatever categories matter to you — and the page shows budget vs. actual, what's remaining, and a status: green/OK, amber/WARNING (default 80% used), or red/OVER (100%+). Categories are tagged "discretionary" unless marked essential (Housing, Groceries, Utilities, Transport, Fuel, Healthcare, Internet, Communication are essential by default — change this per category, or mark any transaction "Essential"/not when you record it). Change the warning/over thresholds in Settings.

## Recurring transactions

**Recurring** is for things that repeat — rent, subscriptions, a loan repayment you're making. Set it up once with a frequency and start date. It won't record itself automatically as "done" — you (or the scheduled daily job) generate the actual transaction when it's genuinely due, so expected and actual stay separate. The "Generate due transactions now" button catches up anything that's become due, including a backlog if you set a start date in the past.

## Savings goals

**Savings Goals** — create a goal (Emergency Fund, Wedding, Land, House, whatever you're saving for), give it a target amount and, if you like, a target date and monthly target. Log contributions as you make them; the system tells you your progress percentage and, based on your actual contribution pace, whether you're on track to hit your target date.

## Investments

**Investments** tracks capital you've put to work — a rotating savings group, a business, stocks, livestock, whatever you define. Record the initial capital, then log contributions, returns, or withdrawals as they happen, and update "current value" whenever you have a fresh valuation (mark-to-market). The system calculates ROI and unrealized gain for you.

## Lending — money you lend to other people

This is the module built specifically for your lending business — living in the very same app as your everyday budgeting, not a separate one. Two steps:

1. **Add a borrower** — name, national ID, address, phone number (required — it's where SMS reminders go), email if you have it. National ID, address, and phone number are encrypted before they're ever written to the database (see "Protecting borrower data" below) — nobody who gets access to the raw database can read them without your encryption key.
2. **Give a loan** — pick the borrower, the amount, the date, and the interest rate (pre-filled with your current default, 20%, but you can type any rate for this specific loan).

The system automatically calculates a first due date one month out, and schedules two SMS reminders (a few days before, and on the due date) — see the Reminders section below for how sending actually works.

**How the interest works, exactly as you described it:** if a loan isn't paid off by its due date, the system adds interest on top of the *full amount currently owed*, not just the original amount — so $100 becomes $120 after one month unpaid, and if it's still unpaid the next month it becomes $144 (20% of $120), then $172.80, and so on. Click "Accrue interest to today" on a loan's detail page to bring it up to date at any time — it also happens automatically once a day.

Every interest charge is recorded as its own line in an audit trail you can see on the loan's detail page — you can always see exactly how a number was produced, never a black-box total.

**Changing the rate:** open a loan and use "Change rate" — this only affects periods going forward. Whatever was already charged stays as it was charged; the system never rewrites history. You can also change the *default* rate for all new loans in **Settings**.

**Recording a repayment:** enter the amount and date on the loan detail page. Repayments are applied to outstanding interest first, then principal — standard practice, and documented so you can see the split on every repayment. Once the balance hits zero the loan is automatically marked Repaid.

**If someone won't pay:** use "Write off" on the loan detail page. It stops the interest from accruing further and marks the loan as a loss rather than letting the number climb forever.

## Reminders (SMS)

The Lending page shows every reminder scheduled for a loan and whether it's been sent. Right now, sending is done through a "console" stub — it logs exactly what would be texted, so you can see and test the whole flow before spending money on real SMS. To make it send actual text messages to borrowers, you need to set up a real SMS provider account (Africa's Talking or Twilio, your choice) — see `DEPLOYMENT_GUIDE.md`.

## Protecting borrower data

Borrower national ID, address, and phone number are encrypted before they're stored — if someone got hold of a raw database backup, those three fields would be unreadable gibberish without your `PII_ENCRYPTION_KEY`. Every screen in the app still shows them normally to you, since decryption happens automatically when the app reads them. This key lives only in your backend's `.env` file — back it up somewhere separate from your database backup (losing the key makes existing encrypted data permanently unreadable). See `DEPLOYMENT_GUIDE.md` for how it's set up.

## Debts — money you owe

**Debts** is the mirror image of Lending: money you owe someone else. Add the creditor, the amount, and log payments as you make them.

## Net worth

**Net Worth** shows assets minus liabilities, consolidated into your primary currency (USD by default). It separates liquid cash, savings, investments, and loans receivable from what you owe. Click "Save snapshot" periodically (monthly is a good habit) to build a trend line over time. If you hold money in a currency without a configured exchange rate, it's listed separately under "not included" rather than silently guessed at — set the rate on this page.

## Reports

**Reports** gives you the monthly review: income, expenses, savings rate, your largest spending categories, and a forecast for the year ahead — always labeled a projection, never a promise. It also now shows a **"What's changed"** panel — plain-language, fully-derived observations like which month you spent the most or least, whether this month is trending up or down versus last month, and which categories have crept up compared to your recent average (a good place to look for "things I might not need"). Below that is a 12-month income-vs-expenses trend line, so you can see the shape of your spending over time, not just one month at a time.

## Annual Review

**Annual Review** is the year-end version of Reports: pick a year and see total income, expenses, savings, and savings rate for that year, plus a month-by-month bar chart and table so you can see exactly which months were heavier or lighter and why.

## System Check

**System Check** is a transparency report on the system itself, not your finances — it looks for real problems: a transfer that's missing its matching leg, a loan that hasn't had interest accrued in a while, a recurring bill that's overdue for generation, a budget pointing at a category you deactivated, or a currency with no exchange rate configured. Each item is OK, Warning, or Error, with a plain explanation and what to do about it. Worth checking occasionally, especially after a long gap away from the app.

## Settings — including the interest rate

**Settings** is where you control the system's behavior: the default loan interest rate (currently 20%, change it any time — it only affects new loans; existing loans keep whatever rate they were given at), budget warning thresholds, emergency fund target, SMS reminder timing, and your primary currency for Net Worth.

## A few important distinctions the system protects

Income is never the same as a transfer between your own accounts. An expense is never the same as an investment. Savings are never counted as an expense. What you expect to receive is kept separate from what you've actually received. Every transaction keeps its original currency and amount — nothing is silently converted and overwritten.

## Backing up your data

Your data lives in a PostgreSQL database (see the deployment guide for where). Ask whoever manages your hosting to schedule regular automated backups — most hosting providers (Render, Railway, Supabase) offer this as a checkbox setting. Keep at least one recent backup copy somewhere separate from the live database.
