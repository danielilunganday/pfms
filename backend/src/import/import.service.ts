import { Inject, Injectable } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { accounts, categories } from '../db/schema';
import { money } from '../common/money';
import { TransactionsService } from '../transactions/transactions.service';

export interface ImportRowResult {
  rowNumber: number;
  raw: Record<string, string>;
  parsed: {
    type?: 'INCOME' | 'EXPENSE';
    date?: string;
    accountId?: string;
    accountName?: string;
    categoryId?: string;
    categoryName?: string;
    currency?: string;
    amount?: string;
    description?: string;
    paymentMethod?: string;
    isEssential?: boolean;
  };
  errors: string[];
}

/**
 * Bulk CSV import for historical transactions (spec gap: there was previously
 * no way to bring in years of past data except one row at a time in the UI).
 * Two-step flow, mirrored by ImportController:
 *   1. preview() — parses + validates, never writes to the DB. The caller
 *      (frontend) shows the user every row, flags problems, and lets them
 *      fix values before anything is committed.
 *   2. commit() — takes the (possibly user-corrected) rows back and actually
 *      creates transactions, one by one, through the normal
 *      TransactionsService so every import gets the same validation, audit
 *      logging, and precise decimal handling as manual entry.
 * Only INCOME and EXPENSE rows are supported — transfers rarely appear in
 * exported bank/mobile-money statements and need both legs matched, which is
 * out of scope for a first pass.
 */
@Injectable()
export class ImportService {
  constructor(
    @Inject(DB) private readonly db: Database,
    private readonly txns: TransactionsService,
  ) {}

  private normalizeHeader(h: string): string {
    return h.trim().toLowerCase().replace(/[\s_-]+/g, '');
  }

  async preview(fileBuffer: Buffer): Promise<{ rows: ImportRowResult[]; summary: { total: number; valid: number; invalid: number } }> {
    let records: Record<string, string>[];
    try {
      records = parse(fileBuffer, { columns: (headers: string[]) => headers.map((h) => this.normalizeHeader(h)), skip_empty_lines: true, trim: true });
    } catch (err: any) {
      return { rows: [], summary: { total: 0, valid: 0, invalid: 0 } };
    }

    const allAccounts = await this.db.select().from(accounts);
    const allCategories = await this.db.select().from(categories);

    const findAccount = (name: string) => allAccounts.find((a) => a.name.toLowerCase() === name?.toLowerCase());
    const findCategory = (name: string, kind: 'INCOME' | 'EXPENSE') =>
      allCategories.find((c) => c.kind === kind && c.name.toLowerCase() === name?.toLowerCase());

    const rows: ImportRowResult[] = records.map((raw, idx) => {
      const errors: string[] = [];
      const typeRaw = (raw.type || raw.txntype || '').toUpperCase().trim();
      const type = typeRaw === 'INCOME' || typeRaw === 'EXPENSE' ? (typeRaw as 'INCOME' | 'EXPENSE') : undefined;
      if (!type) errors.push(`Unrecognized type "${raw.type ?? ''}" — must be INCOME or EXPENSE`);

      const dateRaw = raw.date || raw.txndate || '';
      const parsedDate = dateRaw ? new Date(dateRaw) : null;
      const date = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate.toISOString().slice(0, 10) : undefined;
      if (!date) errors.push(`Unreadable date "${dateRaw}" — use YYYY-MM-DD`);

      const accountName = raw.account || raw.accountname || '';
      const account = findAccount(accountName);
      if (!account) errors.push(`No account named "${accountName}" — check spelling or create it first`);

      const categoryName = raw.category || raw.categoryname || '';
      const category = type ? findCategory(categoryName, type) : undefined;
      // Category is optional — falls back to "Uncategorized" — so an
      // unmatched name is a note, not a hard error, unless one was given
      // and simply doesn't exist (likely a typo worth flagging).
      if (categoryName && !category) errors.push(`No ${type ?? ''} category named "${categoryName}" — will import as Uncategorized unless fixed`);

      const amountRaw = raw.amount || '';
      let amount: string | undefined;
      try {
        const m = money(amountRaw.replace(/,/g, ''));
        if (m.lte(0) || amountRaw === '') throw new Error('non-positive');
        amount = m.toFixed(2);
      } catch {
        errors.push(`Invalid amount "${amountRaw}" — must be a positive number`);
      }

      const currency = (raw.currency || account?.currency || '').toUpperCase() || undefined;
      if (!currency) errors.push('No currency given and account currency unknown');

      const isEssentialRaw = (raw.essential || raw.isessential || '').toLowerCase();
      const isEssential = ['true', '1', 'yes', 'y'].includes(isEssentialRaw);

      return {
        rowNumber: idx + 2, // +1 for 0-index, +1 for header row
        raw,
        parsed: {
          type,
          date,
          accountId: account?.id,
          accountName: account?.name ?? accountName,
          categoryId: category?.id,
          categoryName: category?.name ?? categoryName,
          currency,
          amount,
          description: raw.description || raw.memo || raw.notes || undefined,
          paymentMethod: raw.paymentmethod || raw.method || undefined,
          isEssential,
        },
        errors,
      };
    });

    const invalid = rows.filter((r) => r.errors.length > 0).length;
    return { rows, summary: { total: rows.length, valid: rows.length - invalid, invalid } };
  }

  /** Commits only the rows the caller marks as ready (normally: every row
   *  with zero validation errors, after any user corrections in the UI).
   *  Each row is created through TransactionsService, so it's audited and
   *  validated exactly like a manually-entered transaction. */
  async commit(rows: ImportRowResult['parsed'][]) {
    const created: any[] = [];
    const failed: { row: ImportRowResult['parsed']; error: string }[] = [];
    for (const row of rows) {
      try {
        if (!row.type || !row.date || !row.accountId || !row.amount || !row.currency) {
          throw new Error('Row is missing required fields (was it fixed since preview?)');
        }
        if (row.type === 'INCOME') {
          const txn = await this.txns.createIncome({
            accountId: row.accountId,
            categoryId: row.categoryId,
            currency: row.currency,
            amount: row.amount,
            date: row.date,
            description: row.description,
            incomeStatus: 'RECEIVED',
          });
          created.push(txn);
        } else {
          const txn = await this.txns.createExpense({
            accountId: row.accountId,
            categoryId: row.categoryId,
            currency: row.currency,
            amount: row.amount,
            date: row.date,
            description: row.description,
            paymentMethod: row.paymentMethod,
            isEssential: row.isEssential,
          });
          created.push(txn);
        }
      } catch (err: any) {
        failed.push({ row, error: err?.message ?? 'Unknown error' });
      }
    }
    return { createdCount: created.length, failedCount: failed.length, failed };
  }
}
