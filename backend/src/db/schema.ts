// PFMS — Drizzle ORM schema (Postgres). Single source of truth for the data model.
// Mirrors the architecture doc's table design 1:1. See /docs/architecture.

import {
  pgTable,
  uuid,
  text,
  varchar,
  numeric,
  timestamp,
  boolean,
  integer,
  jsonb,
  pgEnum,
  uniqueIndex,
  index,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

// ── Enums ──────────────────────────────────────────────────────────────
export const categoryKindEnum = pgEnum('category_kind', ['INCOME', 'EXPENSE']);
export const transactionTypeEnum = pgEnum('transaction_type', [
  'INCOME',
  'EXPENSE',
  'TRANSFER',
]);
export const incomeStatusEnum = pgEnum('income_status', ['EXPECTED', 'RECEIVED']);
export const loanStatusEnum = pgEnum('loan_status', [
  'ACTIVE',
  'OVERDUE',
  'REPAID',
  'WRITTEN_OFF',
]);
export const configListTypeEnum = pgEnum('config_list_type', [
  'ACCOUNT_TYPE',
  'PAYMENT_METHOD',
  'INCOME_SOURCE',
  'INVESTMENT_TYPE',
  'DEBT_TYPE',
  'FREQUENCY',
  'GOAL_TYPE',
]);

// ── Users & system settings ───────────────────────────────────────────
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).unique(),
  passwordHash: text('password_hash').notNull(),
  fullName: varchar('full_name', { length: 255 }),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

/** Editable global config — including the loan interest rate default, so it
 *  can be changed at your discretion without a code deploy. */
export const systemSettings = pgTable('system_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(), // JSON-encoded
  description: text('description'),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

export const currencies = pgTable('currencies', {
  code: varchar('code', { length: 10 }).primaryKey(), // "USD", "ZIG"
  name: varchar('name', { length: 100 }).notNull(),
  symbol: varchar('symbol', { length: 10 }).notNull(),
  active: boolean('active').notNull().default(true),
});

export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: timestamp('date').notNull(),
    fromCurrency: varchar('from_currency', { length: 10 }).notNull(),
    toCurrency: varchar('to_currency', { length: 10 }).notNull(),
    rate: numeric('rate', { precision: 18, scale: 6 }).notNull(),
    source: varchar('source', { length: 255 }),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [index('exchange_rates_lookup_idx').on(t.fromCurrency, t.toCurrency, t.date)],
);

export const configOptions = pgTable(
  'config_options',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    listType: configListTypeEnum('list_type').notNull(),
    value: varchar('value', { length: 255 }).notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    active: boolean('active').notNull().default(true),
  },
  (t) => [uniqueIndex('config_options_list_value_idx').on(t.listType, t.value)],
);

// ── Categories & accounts ─────────────────────────────────────────────
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: categoryKindEnum('kind').notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => categories.id),
    isEssential: boolean('is_essential').notNull().default(false),
    active: boolean('active').notNull().default(true),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_kind_name_parent_idx').on(t.kind, t.name, t.parentId)],
);

export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  accountType: varchar('account_type', { length: 100 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  openingBalance: numeric('opening_balance', { precision: 18, scale: 2 })
    .notNull()
    .default('0'),
  openingDate: timestamp('opening_date').notNull(),
  active: boolean('active').notNull().default(true),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Recurring transactions (declared before transactions: FK target) ──
export const recurringTransactions = pgTable('recurring_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  description: varchar('description', { length: 255 }).notNull(),
  type: transactionTypeEnum('type').notNull(),
  categoryId: uuid('category_id').references(() => categories.id),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  accountId: uuid('account_id')
    .notNull()
    .references(() => accounts.id),
  frequency: varchar('frequency', { length: 50 }).notNull(),
  startDate: timestamp('start_date').notNull(),
  endDate: timestamp('end_date'),
  nextDueDate: timestamp('next_due_date').notNull(),
  active: boolean('active').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Transaction ledger — single source of truth ────────────────────────
export const transactions = pgTable(
  'transactions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    type: transactionTypeEnum('type').notNull(),
    date: timestamp('date').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id),
    categoryId: uuid('category_id').references(() => categories.id),
    currency: varchar('currency', { length: 10 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(), // always positive
    description: text('description'),
    paymentMethod: varchar('payment_method', { length: 100 }),
    isEssential: boolean('is_essential').notNull().default(false),
    isRecurring: boolean('is_recurring').notNull().default(false),
    recurringId: uuid('recurring_id').references(() => recurringTransactions.id),
    receiptUrl: text('receipt_url'), // optional attached receipt/photo, served from /uploads

    // INCOME-only
    incomeStatus: incomeStatusEnum('income_status'),
    incomeSource: varchar('income_source', { length: 100 }),

    // TRANSFER-only (app-enforced pairing, not a DB self-FK)
    linkedTransferId: uuid('linked_transfer_id'),
    transferDirection: varchar('transfer_direction', { length: 10 }), // "OUT" | "IN"

    createdAt: timestamp('created_at').notNull().defaultNow(),
    updatedAt: timestamp('updated_at').notNull().defaultNow(),
  },
  (t) => [
    index('transactions_date_idx').on(t.date),
    index('transactions_type_idx').on(t.type),
    index('transactions_account_idx').on(t.accountId),
    index('transactions_category_idx').on(t.categoryId),
  ],
);

// ── Budgets ──────────────────────────────────────────────────────────
export const budgets = pgTable(
  'budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    categoryId: uuid('category_id')
      .notNull()
      .references(() => categories.id),
    period: varchar('period', { length: 7 }).notNull(), // "YYYY-MM"
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull(),
    warningThresholdPct: numeric('warning_threshold_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('80'),
    criticalThresholdPct: numeric('critical_threshold_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('100'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('budgets_category_period_currency_idx').on(t.categoryId, t.period, t.currency)],
);

/** A single "all spending, regardless of category" cap per month + currency —
 *  so a one-off purchase (a suit, new clothes, anything) always counts
 *  against your overall monthly budget even if you never set a per-category
 *  budget line for it. Category budgets (above) are optional and additive;
 *  this is the safety net that catches everything. */
export const overallBudgets = pgTable(
  'overall_budgets',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    period: varchar('period', { length: 7 }).notNull(), // "YYYY-MM"
    currency: varchar('currency', { length: 10 }).notNull(),
    amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
    warningThresholdPct: numeric('warning_threshold_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('80'),
    criticalThresholdPct: numeric('critical_threshold_pct', { precision: 5, scale: 2 })
      .notNull()
      .default('100'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('overall_budgets_period_currency_idx').on(t.period, t.currency)],
);

// ── Savings goals ───────────────────────────────────────────────────
export const savingsGoals = pgTable('savings_goals', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  goalType: varchar('goal_type', { length: 100 }),
  targetAmount: numeric('target_amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  targetDate: timestamp('target_date'),
  monthlyTarget: numeric('monthly_target', { precision: 18, scale: 2 }),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const goalContributions = pgTable('goal_contributions', {
  id: uuid('id').primaryKey().defaultRandom(),
  goalId: uuid('goal_id')
    .notNull()
    .references(() => savingsGoals.id),
  transactionId: uuid('transaction_id').references(() => transactions.id),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  date: timestamp('date').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Investments ─────────────────────────────────────────────────────
export const investments = pgTable('investments', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: varchar('name', { length: 255 }).notNull(),
  investmentType: varchar('investment_type', { length: 100 }).notNull(),
  dateInvested: timestamp('date_invested').notNull(),
  initialCapital: numeric('initial_capital', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  expectedReturn: numeric('expected_return', { precision: 18, scale: 2 }),
  expectedReturnDate: timestamp('expected_return_date'),
  currentValue: numeric('current_value', { precision: 18, scale: 2 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('ACTIVE'),
  riskLevel: varchar('risk_level', { length: 50 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const investmentTransactions = pgTable('investment_transactions', {
  id: uuid('id').primaryKey().defaultRandom(),
  investmentId: uuid('investment_id')
    .notNull()
    .references(() => investments.id),
  type: varchar('type', { length: 20 }).notNull(), // CONTRIBUTION, RETURN, WITHDRAWAL
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  date: timestamp('date').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Lending module — borrower KYC + configurable compounding interest ──
// nationalId/address/phoneNumber are stored ENCRYPTED at rest (AES-256-GCM,
// see common/pii-crypto.ts) — the app-layer encrypt/decrypt happens in
// LendingService, transparently to everything else. Columns are `text`
// (not varchar) because ciphertext is longer than the original value.
export const borrowers = pgTable('borrowers', {
  id: uuid('id').primaryKey().defaultRandom(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  nationalId: text('national_id'), // sensitive PII — encrypted at rest
  address: text('address'), // sensitive PII — encrypted at rest
  phoneNumber: text('phone_number').notNull(), // sensitive PII — encrypted at rest
  email: varchar('email', { length: 255 }),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const loans = pgTable('loans', {
  id: uuid('id').primaryKey().defaultRandom(),
  borrowerId: uuid('borrower_id')
    .notNull()
    .references(() => borrowers.id),
  principal: numeric('principal', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  dateGiven: timestamp('date_given').notNull(),
  // Configurable per loan — defaults to systemSettings.default_loan_interest_rate_percent
  // (currently 20) but can be changed per loan at your discretion.
  interestRatePercent: numeric('interest_rate_percent', { precision: 5, scale: 2 })
    .notNull()
    .default('20'),
  compoundingPeriod: varchar('compounding_period', { length: 20 }).notNull().default('MONTHLY'),
  firstDueDate: timestamp('first_due_date').notNull(),
  status: loanStatusEnum('status').notNull().default('ACTIVE'),
  notes: text('notes'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
  updatedAt: timestamp('updated_at').notNull().defaultNow(),
});

/** One row per compounding period — the audit trail behind every interest
 *  figure, so the compounding math is always inspectable. */
export const loanInterestAccruals = pgTable(
  'loan_interest_accruals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    loanId: uuid('loan_id')
      .notNull()
      .references(() => loans.id),
    periodStart: timestamp('period_start').notNull(),
    periodEnd: timestamp('period_end').notNull(),
    openingBalance: numeric('opening_balance', { precision: 18, scale: 2 }).notNull(),
    interestRatePercentApplied: numeric('interest_rate_percent_applied', {
      precision: 5,
      scale: 2,
    }).notNull(),
    interestCharged: numeric('interest_charged', { precision: 18, scale: 2 }).notNull(),
    closingBalance: numeric('closing_balance', { precision: 18, scale: 2 }).notNull(),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('loan_accruals_loan_period_idx').on(t.loanId, t.periodEnd)],
);

export const loanRepayments = pgTable('loan_repayments', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanId: uuid('loan_id')
    .notNull()
    .references(() => loans.id),
  date: timestamp('date').notNull(),
  amount: numeric('amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  appliedToInterest: numeric('applied_to_interest', { precision: 18, scale: 2 }).notNull(),
  appliedToPrincipal: numeric('applied_to_principal', { precision: 18, scale: 2 }).notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const loanReminders = pgTable('loan_reminders', {
  id: uuid('id').primaryKey().defaultRandom(),
  loanId: uuid('loan_id')
    .notNull()
    .references(() => loans.id),
  channel: varchar('channel', { length: 20 }).notNull().default('SMS'),
  recipientPhone: varchar('recipient_phone', { length: 30 }).notNull(),
  triggerType: varchar('trigger_type', { length: 20 }).notNull(), // PRE_DUE, DUE, OVERDUE
  scheduledFor: timestamp('scheduled_for').notNull(),
  sentAt: timestamp('sent_at'),
  status: varchar('status', { length: 20 }).notNull().default('PENDING'),
  messageText: text('message_text'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Debts payable (money the user owes others) ────────────────────────
export const debtsPayable = pgTable('debts_payable', {
  id: uuid('id').primaryKey().defaultRandom(),
  creditorName: varchar('creditor_name', { length: 255 }).notNull(),
  date: timestamp('date').notNull(),
  originalAmount: numeric('original_amount', { precision: 18, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 10 }).notNull(),
  purpose: text('purpose'),
  dueDate: timestamp('due_date'),
  amountPaid: numeric('amount_paid', { precision: 18, scale: 2 }).notNull().default('0'),
  status: varchar('status', { length: 20 }).notNull().default('OUTSTANDING'),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

// ── Net worth ───────────────────────────────────────────────────────
export const netWorthSnapshots = pgTable(
  'net_worth_snapshots',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    date: timestamp('date').notNull(),
    totalAssets: numeric('total_assets', { precision: 18, scale: 2 }).notNull(),
    totalLiabilities: numeric('total_liabilities', { precision: 18, scale: 2 }).notNull(),
    netWorth: numeric('net_worth', { precision: 18, scale: 2 }).notNull(),
    liquidAssets: numeric('liquid_assets', { precision: 18, scale: 2 }).notNull(),
    investmentsValue: numeric('investments_value', { precision: 18, scale: 2 }).notNull(),
    receivablesValue: numeric('receivables_value', { precision: 18, scale: 2 }).notNull(),
    currency: varchar('currency', { length: 10 }).notNull().default('USD'),
    createdAt: timestamp('created_at').notNull().defaultNow(),
  },
  (t) => [uniqueIndex('net_worth_date_currency_idx').on(t.date, t.currency)],
);

// ── Audit log ───────────────────────────────────────────────────────
export const auditLog = pgTable(
  'audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    tableName: varchar('table_name', { length: 100 }).notNull(),
    recordId: uuid('record_id').notNull(),
    action: varchar('action', { length: 20 }).notNull(), // CREATE, UPDATE, DELETE
    oldValue: jsonb('old_value'),
    newValue: jsonb('new_value'),
    changedAt: timestamp('changed_at').notNull().defaultNow(),
  },
  (t) => [index('audit_log_table_record_idx').on(t.tableName, t.recordId)],
);

export const schema = {
  users,
  systemSettings,
  currencies,
  exchangeRates,
  configOptions,
  categories,
  accounts,
  recurringTransactions,
  transactions,
  budgets,
  overallBudgets,
  savingsGoals,
  goalContributions,
  investments,
  investmentTransactions,
  borrowers,
  loans,
  loanInterestAccruals,
  loanRepayments,
  loanReminders,
  debtsPayable,
  netWorthSnapshots,
  auditLog,
};
