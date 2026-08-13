import { chromium } from 'playwright';
import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const videoDir = path.join(root, 'capture');
await rm(videoDir, { recursive: true, force: true });
await mkdir(videoDir, { recursive: true });

const account = await fetch('http://127.0.0.1:5180/api/dev/random-user', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: '{}',
}).then(async (response) => {
  if (!response.ok) throw new Error(await response.text());
  return response.json();
});

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  recordVideo: { dir: videoDir, size: { width: 390, height: 844 } },
  locale: 'fr-FR',
  colorScheme: 'light',
});
await context.addInitScript((token) => localStorage.setItem('wigolink_token', token), account.token);
const page = await context.newPage();

await page.goto('http://127.0.0.1:5180/fr/trajets/nouveau');
await page.waitForLoadState('networkidle');
await installCursor(page);
await pause(900);

await pointAndClick(page, page.getByRole('button', { name: /Avion Trajet/ }), 420);
await pointAndClick(page, page.getByRole('button', { name: 'Continuer' }), 650);

await pointAndType(page, page.getByRole('combobox', { name: 'Départ' }), 'Bruxelles');
await pause(80);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await pause(400);
await pointAndType(page, page.getByRole('combobox', { name: 'Arrivée' }), 'Paris');
await pause(80);
await page.keyboard.press('ArrowDown');
await page.keyboard.press('Enter');
await pointAndClick(page, page.getByRole('button', { name: 'Continuer' }), 650);

await pointAndClick(page, page.getByRole('button', { name: 'Dans 7 jours' }), 500);
await pointAndClick(page, page.getByRole('button', { name: 'Continuer' }), 650);

await pointAndClick(page, page.getByRole('button', { name: '10 kg' }), 550);
await pointAndClick(page, page.getByRole('button', { name: 'Continuer' }), 650);

const price = page.getByRole('spinbutton', { name: 'Prix proposé' });
await moveTo(page, price);
await price.click();
await page.keyboard.press('Control+A');
await page.keyboard.type('30', { delay: 160 });
await pause(450);
await pointAndClick(page, page.getByRole('button', { name: 'Continuer' }), 750);

await pause(1100);
await pointAndClick(page, page.getByRole('button', { name: 'Publier le trajet' }), 1200);
await pause(1000);

await page.close();
await context.close();
await browser.close();

const [recorded] = (await readdir(videoDir)).filter((name) => name.endsWith('.webm'));
if (!recorded) throw new Error('Aucune capture vidéo produite.');
await copyFile(path.join(videoDir, recorded), path.join(root, 'public', 'raw-real-demo.webm'));
await rm(videoDir, { recursive: true, force: true });

async function installCursor(target) {
  await target.evaluate(() => {
    const cursor = document.createElement('div');
    cursor.id = 'wigolink-demo-cursor';
    cursor.innerHTML = '<svg viewBox="0 0 28 36" width="30" height="39"><path d="M2 2 L2 29 L9 22 L14 34 L20 31 L15 20 L25 20 Z" fill="white" stroke="#111827" stroke-width="2.2" stroke-linejoin="round"/></svg>';
    Object.assign(cursor.style, {
      position: 'fixed', left: '24px', top: '120px', width: '30px', height: '39px',
      zIndex: '2147483647', pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.45))',
    });
    document.documentElement.appendChild(cursor);
    window.addEventListener('mousemove', (event) => {
      cursor.style.left = `${event.clientX}px`;
      cursor.style.top = `${event.clientY}px`;
    }, { passive: true });
    window.addEventListener('mousedown', () => {
      cursor.style.filter = 'drop-shadow(0 0 0 #0878ff) drop-shadow(0 2px 3px rgba(0,0,0,.45))';
      cursor.style.scale = '.86';
    });
    window.addEventListener('mouseup', () => {
      cursor.style.filter = 'drop-shadow(0 2px 3px rgba(0,0,0,.45))';
      cursor.style.scale = '1';
    });
  });
}

async function moveTo(target, locator) {
  const box = await locator.boundingBox();
  if (!box) throw new Error('Contrôle invisible pendant la capture.');
  const x = box.x + box.width * 0.53;
  const y = box.y + box.height * 0.52;
  await target.mouse.move(x - 26, y - 12, { steps: 5 });
  await target.mouse.move(x, y, { steps: 9 });
  await pause(140);
}

async function pointAndClick(target, locator, after = 350) {
  await moveTo(target, locator);
  await locator.click({ position: { x: Math.max(8, (await locator.boundingBox()).width * .53), y: Math.max(8, (await locator.boundingBox()).height * .52) } });
  await pause(after);
}

async function pointAndType(target, locator, value) {
  await moveTo(target, locator);
  await locator.click();
  await target.keyboard.type(value, { delay: 105 });
}

function pause(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
