// Applies pending Drizzle migrations, with an explicit connection timeout and
// verbose error logging — used instead of the bare `drizzle-kit migrate` CLI
// in production, specifically so a network/credential problem prints a real,
// readable error in the hosting platform's logs instead of hanging silently
// until the platform kills the process.
// Run with: npm run migrate:deploy
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

async function main() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error('❌ DATABASE_URL is not set. Cannot run migrations.');
    process.exit(1);
  }

  console.log('→ Connecting to the database...');
  const pool = new Pool({
    connectionString: databaseUrl,
    // Fail fast and loud instead of hanging indefinitely — a hung connection
    // (e.g. a network/routing problem reaching the database) previously
    // looked identical to a silent crash in hosting logs.
    connectionTimeoutMillis: 20_000,
  });

  try {
    const db = drizzle(pool);
    console.log('→ Applying pending migrations...');
    await migrate(db, { migrationsFolder: './drizzle' });
    console.log('✅ Migrations applied successfully.');
    await pool.end();
    process.exit(0);
  } catch (err) {
    console.error('❌ Migration failed. Full error details below:');
    if (err instanceof Error) {
      console.error('  name:', err.name);
      console.error('  message:', err.message);
      // @ts-expect-error - node-postgres attaches a `code` field for many errors
      if (err.code) console.error('  code:', err.code);
      if (err.cause) console.error('  cause:', err.cause);
      console.error('  stack:', err.stack);
    } else {
      console.error(err);
    }
    await pool.end().catch(() => undefined);
    process.exit(1);
  }
}

main();
