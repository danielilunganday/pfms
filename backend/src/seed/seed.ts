// Seeds the controlled configuration lists (spec §5) and system defaults —
// safe to re-run, uses upsert/onConflict semantics throughout.
// Run with: npm run seed
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from '../db/schema';
import { sql } from 'drizzle-orm';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  console.log('Seeding currencies...');
  await db
    .insert(schema.currencies)
    .values([
      { code: 'USD', name: 'US Dollar', symbol: '$' },
      { code: 'ZIG', name: 'Zimbabwe Gold', symbol: 'ZiG' },
    ])
    .onConflictDoNothing();

  console.log('Seeding system settings (interest rate default = 20%, changeable any time)...');
  const settings: Array<[string, string, string]> = [
    ['default_loan_interest_rate_percent', '20', 'Default interest rate % pre-filled on new loans. Change any time — existing loans keep whatever rate they were created/updated with.'],
    ['loan_compounding_period', 'MONTHLY', 'How often unpaid loan balances compound.'],
    ['budget_warning_threshold_pct', '80', '% of budget used that triggers an AMBER warning.'],
    ['budget_critical_threshold_pct', '100', '% of budget used that triggers a RED / OVER status.'],
    ['emergency_fund_target_months', '3', 'Target months of essential expenses to hold in the emergency fund.'],
    ['sms_reminder_days_before_due', '3', 'Days before a loan due date to send the first SMS reminder.'],
    ['sms_reminder_overdue_repeat_days', '7', 'How often to re-send an SMS while a loan stays overdue.'],
    ['primary_currency', 'USD', 'Primary currency used to consolidate Net Worth and cross-currency analytics.'],
  ];
  for (const [key, value, description] of settings) {
    await db
      .insert(schema.systemSettings)
      .values({ key, value, description })
      .onConflictDoNothing();
  }

  console.log('Seeding controlled lists (config options)...');
  const lists: Array<[string, string[]]> = [
    ['ACCOUNT_TYPE', ['Cash', 'Bank Account', 'Mobile Money', 'Savings Account', 'Investment Account', 'Other']],
    ['PAYMENT_METHOD', ['Cash', 'Bank Transfer', 'Mobile Money', 'Card', 'Other']],
    ['INCOME_SOURCE', ['Salary', 'Lecturing', 'Tutoring', 'Consulting', 'Research', 'Business', 'Interest', 'Investment Returns', 'Other']],
    ['INVESTMENT_TYPE', ['Lending', 'Rotating Savings Group', 'Business', 'Livestock', 'Clothing Business', 'Stocks', 'Other']],
    ['DEBT_TYPE', ['Personal Loan', 'Family Support', 'Purchase on Credit', 'Other']],
    ['FREQUENCY', ['WEEKLY', 'FORTNIGHTLY', 'MONTHLY', 'QUARTERLY', 'ANNUALLY']],
    ['GOAL_TYPE', ['EMERGENCY_FUND', 'WEDDING', 'LAND', 'HOUSE', 'EDUCATION', 'TRAVEL', 'GENERAL', 'OTHER']],
  ];
  for (const [listType, values] of lists) {
    for (let i = 0; i < values.length; i++) {
      await db
        .insert(schema.configOptions)
        .values({ listType: listType as any, value: values[i], sortOrder: i })
        .onConflictDoNothing();
    }
  }

  console.log('Seeding default expense categories...');
  const expenseCategories = [
    'Housing', 'Groceries', 'Utilities', 'Transport', 'Fuel', 'Communication', 'Internet',
    'Healthcare', 'Clothing', 'Personal Care', 'Education', 'Entertainment', 'Eating Out',
    'Tithe', 'Giving', 'Church/Charity', 'Household', 'Subscriptions', 'Travel', 'Family Support',
    'Professional Expenses', 'Other',
  ];
  const essentialByDefault = new Set(['Housing', 'Groceries', 'Utilities', 'Transport', 'Fuel', 'Healthcare', 'Internet', 'Communication']);
  for (const name of expenseCategories) {
    await db
      .insert(schema.categories)
      .values({ kind: 'EXPENSE', name, isEssential: essentialByDefault.has(name) })
      .onConflictDoNothing();
  }

  console.log('Seeding default income categories...');
  const incomeCategories = ['Salary', 'Lecturing', 'Tutoring', 'Consulting', 'Research', 'Business', 'Interest', 'Investment Returns', 'Other'];
  for (const name of incomeCategories) {
    await db.insert(schema.categories).values({ kind: 'INCOME', name }).onConflictDoNothing();
  }

  console.log('Seed complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
