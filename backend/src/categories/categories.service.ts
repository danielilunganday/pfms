import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DB } from '../db/db.module';
import type { Database } from '../db/db.module';
import { categories } from '../db/schema';

@Injectable()
export class CategoriesService {
  constructor(@Inject(DB) private readonly db: Database) {}

  async create(input: {
    kind: 'INCOME' | 'EXPENSE';
    name: string;
    parentId?: string;
    isEssential?: boolean;
  }) {
    const [row] = await this.db.insert(categories).values(input).returning();
    return row;
  }

  list(kind?: 'INCOME' | 'EXPENSE') {
    if (kind) return this.db.select().from(categories).where(eq(categories.kind, kind));
    return this.db.select().from(categories);
  }

  async deactivate(id: string) {
    const [row] = await this.db
      .update(categories)
      .set({ active: false })
      .where(eq(categories.id, id))
      .returning();
    return row;
  }

  async rename(id: string, name: string) {
    const [row] = await this.db.update(categories).set({ name }).where(eq(categories.id, id)).returning();
    return row;
  }
}
