// One-off maintenance script: re-encrypts any borrower rows still holding
// plaintext nationalId/address/phoneNumber (i.e. rows written before PII
// encryption was introduced). Safe to run any number of times — rows already
// encrypted (prefixed "v1:") are left untouched. New/edited borrowers are
// encrypted automatically by LendingService, so this only matters for data
// that existed before the upgrade.
//
// Run with: npm run encrypt-existing-pii  (see package.json)
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { eq } from 'drizzle-orm';
import * as schema from '../db/schema';
import { encryptPII, isEncrypted } from '../common/pii-crypto';

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });

  const rows = await db.select().from(schema.borrowers);
  let updated = 0;
  for (const row of rows) {
    const needsWork =
      (row.nationalId && !isEncrypted(row.nationalId)) ||
      (row.address && !isEncrypted(row.address)) ||
      (row.phoneNumber && !isEncrypted(row.phoneNumber));
    if (!needsWork) continue;

    await db
      .update(schema.borrowers)
      .set({
        nationalId: row.nationalId && !isEncrypted(row.nationalId) ? encryptPII(row.nationalId) : row.nationalId,
        address: row.address && !isEncrypted(row.address) ? encryptPII(row.address) : row.address,
        phoneNumber:
          row.phoneNumber && !isEncrypted(row.phoneNumber) ? (encryptPII(row.phoneNumber) as string) : row.phoneNumber,
      })
      .where(eq(schema.borrowers.id, row.id));
    updated++;
  }

  console.log(`Encrypted PII for ${updated} of ${rows.length} borrower row(s). Already-encrypted rows were left as-is.`);
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
