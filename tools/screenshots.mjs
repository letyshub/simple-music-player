/**
 * Regenerates the screenshots used in the README.
 *
 * Runs the real application against a folder of music, puts it into a few
 * representative states and photographs each one. Kept in the repository so
 * the pictures can be refreshed after a visual change instead of being
 * captured by hand and slowly going stale.
 *
 * Usage: node tools/screenshots.mjs <folder-with-music> [output-dir]
 */

import { _electron as electron } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const musicFolder = process.argv[2];
const outDir = process.argv[3] ?? path.join(projectRoot, 'docs', 'screenshots');

if (!musicFolder) {
  console.error('Użycie: node tools/screenshots.mjs <folder-z-muzyka> [katalog-wyjsciowy]');
  process.exit(2);
}
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const env = { ...process.env };
// Some editors export this into their terminals; inherited, it starts
// Electron as a bare Node process with no window at all.
delete env.ELECTRON_RUN_AS_NODE;

const launchOptions = {
  args: [projectRoot, `--user-data-dir=${mkdtempSync(path.join(os.tmpdir(), 'smp-shots-'))}`],
  cwd: projectRoot,
  env,
};

let app = await electron.launch(launchOptions);
let page = await app.firstWindow();
page.on('pageerror', (error) => console.log('[wyjątek]', error.message));

async function shot(name) {
  // Clicking a row can leave the list scrolled a few pixels; start every
  // picture from the top so the first track is never half cut off.
  await page.evaluate(() => {
    const list = document.querySelector('#track-list');
    if (list) list.scrollTop = 0;
  });
  await sleep(120);
  await page.screenshot({ path: path.join(outDir, `${name}.png`) });
  console.log('zapisano', `${name}.png`);
}

await page.waitForSelector('#app', { timeout: 25000 });
await sleep(700);

/* 1. First run, before any music has been added. */
await shot('01-pierwsze-uruchomienie');

/* 2. Import, then set up favourites and a playlist through the same channels
      the interface uses, so the states are real rather than mocked. */
await page.evaluate((folder) => window.api.addFolder(folder), musicFolder);
await page.reload();
await page.waitForSelector('.track-row', { timeout: 25000 });
await sleep(600);

await page.evaluate(async () => {
  const store = await window.api.loadStore();
  const tracks = Object.values(store.tracks)
    .sort((a, b) => a.path.localeCompare(b.path, 'pl', { numeric: true }));

  const favourites = [tracks[1], tracks[4], tracks[6], tracks[11]].filter(Boolean).map((t) => t.id);
  await window.api.saveFavorites(favourites);

  await window.api.savePlaylists([
    {
      id: 'pl_demo_wieczor',
      name: 'Wieczorne granie',
      trackIds: tracks.slice(0, 7).map((t) => t.id),
      createdAt: Date.now(),
    },
    {
      id: 'pl_demo_praca',
      name: 'Do pracy',
      trackIds: tracks.slice(5, 11).map((t) => t.id),
      createdAt: Date.now(),
    },
  ]);
});

await page.reload();
await page.waitForSelector('.track-row', { timeout: 25000 });
await sleep(700);

/* 3. The library at rest. */
await shot('02-biblioteka');

/* 4. Playing, so the display and the meters have something to show. */
await page.locator('.track-row').nth(2).dblclick();
await sleep(4000);
await shot('03-odtwarzanie');

/* 5. The equaliser drawer, on a preset. */
await page.locator('#btn-eq-toggle').click();
await page.waitForSelector('#eq-panel:not([hidden])');
await page.selectOption('#eq-preset', 'rock');
await sleep(2500);
await shot('04-korektor');

/* 6. A playlist. */
await page.locator('#playlist-list li').first().click();
await sleep(1200);
await shot('05-playlista');

/* 7. Favourites. */
await page.locator('.nav-item[data-view="favorites"]').click();
await sleep(1200);
await shot('06-ulubione');

await app.close();
console.log(`\nGotowe. Zrzuty w ${outDir}`);
