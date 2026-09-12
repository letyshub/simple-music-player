/**
 * Checks a built application, not the source tree.
 *
 * Packaging is where an app breaks quietly: a file left out of the bundle, a
 * dependency that only existed in node_modules, a path that worked outside an
 * asar archive. This launches the produced executable and confirms it can
 * still import a folder and play a track.
 *
 * Usage: node tests/smoke/packaged.mjs <path-to-exe> <music-folder> [screenshot]
 */

import { _electron as electron } from 'playwright-core';
import { mkdtempSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const [exePath, musicFolder, screenshot] = process.argv.slice(2);

if (!exePath || !musicFolder) {
  console.error('Użycie: node tests/smoke/packaged.mjs <exe> <folder-z-muzyka> [zrzut.png]');
  process.exit(2);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const app = await electron.launch({
  executablePath: exePath,
  args: [`--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'smp-pkg-'))}`],
  env,
});

const page = await app.firstWindow();
page.on('pageerror', (error) => console.log('[wyjątek w oknie]', error.message));
page.on('console', (message) => {
  if (message.type() === 'error') console.log('[błąd w oknie]', message.text());
});

await page.waitForSelector('#app', { timeout: 25000 });

const imported = await page.evaluate((folder) => window.api.addFolder(folder), musicFolder);
console.log('zaimportowane utwory:', imported.addedCount);

await page.reload();
await page.waitForSelector('.track-row', { timeout: 20000 });
await page.locator('.track-row').first().dblclick();
await new Promise((resolve) => setTimeout(resolve, 3000));

const playback = await page.evaluate(() => {
  const audio = document.querySelector('#audio');
  return { paused: audio.paused, time: audio.currentTime, error: audio.error?.code ?? null };
});
console.log('odtwarzanie:', JSON.stringify(playback));

if (screenshot) await page.screenshot({ path: screenshot });
await app.close();

const ok = imported.addedCount >= 3
  && !playback.paused
  && playback.time > 0.3
  && playback.error === null;

console.log(ok ? 'SPAKOWANA APLIKACJA DZIAŁA' : 'SPAKOWANA APLIKACJA NIE DZIAŁA');
process.exit(ok ? 0 : 1);
