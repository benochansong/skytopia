import { spawn } from 'node:child_process';
import { chromium } from '@playwright/test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
const serverAvailable = await fetch('http://127.0.0.1:8787/health')
  .then(() => true)
  .catch(() => false);
assert.equal(
  serverAvailable,
  false,
  'Stop the SKY RIVALS server before this isolated offline check',
);
const dev = spawn(
  process.execPath,
  [
    'node_modules/vite/bin/vite.js',
    '--host',
    '127.0.0.1',
    '--port',
    '5190',
    '--strictPort',
    '--mode',
    'test',
  ],
  { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] },
);
dev.stdout!.on('data', () => {});
dev.stderr!.on('data', () => {});
const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--use-angle=swiftshader', '--enable-webgl', '--enable-unsafe-swiftshader'],
});
try {
  let ready = false;
  for (let i = 0; i < 50 && !ready; i++) {
    ready = await fetch('http://127.0.0.1:5190')
      .then((r) => r.ok)
      .catch(() => false);
    if (!ready) await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(ready, true);
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(20000);
  await page.goto('http://127.0.0.1:5190');
  await page.waitForFunction('Boolean(window.__SKYTOPIA_TEST__)');
  await page.evaluate(
    'window.__SKYTOPIA_TEST__.getState().configure({language:"en",shadows:false,reducedMotion:true,environment:false})',
  );
  await page.getByRole('button', { name: 'Online · SKY RIVALS 08', exact: true }).click();
  await page.getByLabel('Display name', { exact: true }).fill('Offline check');
  await page.getByRole('button', { name: 'Connect', exact: true }).click();
  await page.getByRole('alert').filter({ hasText: 'Cannot reach the server' }).waitFor();
  await page.getByRole('button', { name: 'Single player', exact: true }).click();
  await page.getByRole('button', { name: /Construction training/ }).click();
  await page.waitForFunction(
    'window.__SKYTOPIA_TEST__.getState().screen === "playing" && window.__SKYTOPIA_TEST__.getState().game.mode === "training"',
  );
  assert.equal(await page.locator('canvas').count(), 1);
  await page.screenshot({ path: 'docs/images/phase8-offline.png' });
  const result = {
    at: new Date().toISOString(),
    onlineServerAbsent: true,
    connectionErrorVisible: true,
    returnToSinglePlayer: true,
    trainingPlayable: true,
    canvas: true,
  };
  mkdirSync('docs/verification', { recursive: true });
  writeFileSync('docs/verification/phase8-offline.json', JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} finally {
  await browser.close();
  dev.kill('SIGKILL');
}
