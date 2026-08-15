import { chromium } from 'playwright';

const EXEC_PATH = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const errors = [];

async function main() {
  const browser = await chromium.launch({ executablePath: EXEC_PATH, headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text());
  });
  page.on('pageerror', (err) => errors.push('pageerror: ' + err.message));

  console.log('→ Loading login page...');
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle' });
  await page.screenshot({ path: '/tmp/screenshots/01-login.png' });

  console.log('→ Logging in...');
  await page.fill('input[type="email"]', 'daniel@example.com');
  await page.fill('input[type="password"]', 'testpassword123');
  await page.click('button[type="submit"]');
  await page.waitForURL('http://localhost:5173/', { timeout: 10000 });
  await page.waitForTimeout(1500); // let dashboard queries resolve
  await page.screenshot({ path: '/tmp/screenshots/02-dashboard.png', fullPage: true });
  console.log('→ Dashboard loaded.');

  console.log('→ Visiting Lending page...');
  await page.click('text=Lending');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/03-lending.png', fullPage: true });

  console.log('→ Clicking "View →" on the loan to see detail...');
  await page.click('text=View →');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/04-loan-detail.png', fullPage: true });

  console.log('→ Visiting Net Worth page...');
  await page.click('text=Net Worth');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/05-networth.png', fullPage: true });

  console.log('→ Visiting Settings page (interest rate control)...');
  await page.click('text=Settings');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/06-settings.png', fullPage: true });

  console.log('→ Visiting Budget page...');
  await page.click('text=Budget');
  await page.waitForTimeout(1000);
  await page.screenshot({ path: '/tmp/screenshots/07-budget.png', fullPage: true });

  await browser.close();

  console.log('\n=== Console/page errors captured ===');
  if (errors.length === 0) {
    console.log('None. Clean run.');
  } else {
    errors.forEach((e) => console.log('ERROR:', e));
  }
}

main().catch((err) => {
  console.error('E2E test failed:', err);
  process.exit(1);
});
