import { Inject, Injectable } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { systemSettings, configOptions, currencies } from '../db/schema';

/** Default values used only the very first time the system boots with no
 *  settings row yet — after that, the DB row is the single source of truth
 *  and can be changed by you at any time (e.g. the loan interest rate). */
const FACTORY_DEFAULTS: Record<string, string> = {
  default_loan_interest_rate_percent: '20',
  loan_compounding_period: 'MONTHLY',
  budget_warning_threshold_pct: '80',
  budget_critical_threshold_pct: '100',
  emergency_fund_target_months: '3',
  sms_reminder_days_before_due: '3',
  sms_reminder_overdue_repeat_days: '7',
  primary_currency: 'USD',
};

@Injectable()
export class SettingsService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async get(key: string): Promise<string> {
    const [row] = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (row) return row.value;
    if (key in FACTORY_DEFAULTS) return FACTORY_DEFAULTS[key];
    throw new Error(`Unknown system setting: ${key}`);
  }

  async getNumber(key: string): Promise<number> {
    return parseFloat(await this.get(key));
  }

  async set(key: string, value: string, description?: string) {
    const existing = await this.db
      .select()
      .from(systemSettings)
      .where(eq(systemSettings.key, key))
      .limit(1);
    if (existing.length > 0) {
      const [row] = await this.db
        .update(systemSettings)
        .set({ value, updatedAt: new Date(), ...(description ? { description } : {}) })
        .where(eq(systemSettings.key, key))
        .returning();
      return row;
    }
    const [row] = await this.db
      .insert(systemSettings)
      .values({ key, value, description })
      .returning();
    return row;
  }

  async getAll() {
    const rows = await this.db.select().from(systemSettings);
    const present = new Set(rows.map((r) => r.key));
    const merged = [...rows];
    for (const [key, value] of Object.entries(FACTORY_DEFAULTS)) {
      if (!present.has(key)) merged.push({ key, value, description: null, updatedAt: new Date() } as any);
    }
    return merged;
  }

  /** The interest rate to pre-fill a new loan with — your current default (20%),
   *  changeable any time via PUT /api/settings/default_loan_interest_rate_percent. */
  async getDefaultLoanInterestRate(): Promise<number> {
    return this.getNumber('default_loan_interest_rate_percent');
  }

  // ── Controlled lists (spec §5 Setup & Configuration) ──────────────
  async listConfigOptions(listType: string) {
    return this.db
      .select()
      .from(configOptions)
      .where(eq(configOptions.listType, listType as any))
      .orderBy(configOptions.sortOrder);
  }

  async addConfigOption(listType: string, value: string, sortOrder = 0) {
    const [row] = await this.db
      .insert(configOptions)
      .values({ listType: listType as any, value, sortOrder })
      .returning();
    return row;
  }

  async deactivateConfigOption(id: string) {
    const [row] = await this.db
      .update(configOptions)
      .set({ active: false })
      .where(eq(configOptions.id, id))
      .returning();
    return row;
  }

  // ── Currencies ─────────────────────────────────────────────────────
  async listCurrencies() {
    return this.db.select().from(currencies);
  }

  async upsertCurrency(code: string, name: string, symbol: string) {
    const existing = await this.db
      .select()
      .from(currencies)
      .where(eq(currencies.code, code))
      .limit(1);
    if (existing.length > 0) {
      const [row] = await this.db
        .update(currencies)
        .set({ name, symbol })
        .where(eq(currencies.code, code))
        .returning();
      return row;
    }
    const [row] = await this.db.insert(currencies).values({ code, name, symbol }).returning();
    return row;
  }
}
