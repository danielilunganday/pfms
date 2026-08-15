import { chromium } from 'playwright';

const EXEC_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const errors = [];

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  console.log('→ Login...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', 'daniel@example.com');
  await page.fill('input[type="password"]', 'password123');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/up-01-dashboard.png', fullPage: true });

  console.log('→ Toggle dark mode...');
  await page.click('button[aria-label="Toggle dark mode"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: '/tmp/screenshots/up-02-dashboard-dark.png', fullPage: true });

  console.log('→ Budgets (overall cap)...');
  await page.click('text=Budget');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/screenshots/up-03-budgets.png', fullPage: true });

  console.log('→ Import page...');
  await page.click('text=Import');
  await page.waitForTimeout(600);
  await page.screenshot({ path: '/tmp/screenshots/up-04-import.png', fullPage: true });

  console.log('→ Reports (trend + insights)...');
  await page.click('text=Reports');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/up-05-reports.png', fullPage: true });

  console.log('→ Annual Review...');
  await page.click('text=Annual Review');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/up-06-annual-review.png', fullPage: true });

  console.log('→ System Check...');
  await page.click('text=System Check');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/up-07-system-check.png', fullPage: true });

  console.log('→ Transactions (receipt column)...');
  await page.click('text=Transactions');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/screenshots/up-08-transactions.png', fullPage: true });

  console.log('→ Lending (dark mode check)...');
  await page.click('text=Lending');
  await page.waitForTimeout(800);
  await page.screenshot({ path: '/tmp/screenshots/up-09-lending-dark.png', fullPage: true });

  console.log('→ Back to light mode...');
  await page.click('button[aria-label="Toggle dark mode"]');
  await page.waitForTimeout(400);

  await browser.close();

  if (errors.length > 0) {
    console.log('\n❌ Console/page errors detected:');
    for (const e of errors) console.log(' -', e);
    process.exitCode = 1;
  } else {
    console.log('\n✅ No console errors across all visited pages.');
  }
}

main().catch((err) => { console.error(err); process.exit(1); });
