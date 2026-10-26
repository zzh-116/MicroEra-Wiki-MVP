import { chromium } from 'playwright';
import os from 'node:os';
import path from 'node:path';

const adminPassword = process.env.ADMIN_PASSWORD;
if (!adminPassword) throw new Error('ADMIN_PASSWORD env var is required');

const browser = await chromium.launch({ channel: 'msedge', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });

await page.goto('http://localhost:3000/login', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.fill('#login-username-input', 'admin');
await page.fill('#login-password-input', adminPassword);
await page.click('#login-submit-btn');
await page.waitForTimeout(2000);

await page.goto('http://localhost:3000/graph', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(os.tmpdir(), 'kgraph-oldurl.png'), fullPage: true });

await page.goto('http://localhost:3000/knowledge-graph', { waitUntil: 'domcontentloaded', timeout: 60000 });
await page.waitForTimeout(6000);
await page.screenshot({ path: path.join(os.tmpdir(), 'kgraph-newurl.png'), fullPage: true });

const bodyText = (await page.locator('body').innerText()).slice(0, 200);
const canvasCount = await page.locator('canvas').count();
console.log(JSON.stringify({ bodyText, canvasCount, errors }, null, 2));
await browser.close();
