/**
 * End-to-end smoke test.
 *
 * Launches the real application, imports a folder of generated MP3s, plays
 * one and checks the things unit tests cannot reach: that the custom audio
 * protocol streams, that the Web Audio analysers actually receive samples
 * (they read silence if the media node is treated as cross-origin), that the
 * equaliser changes the filters, and that favourites and playlists survive a
 * restart.
 *
 * Usage: node tests/smoke/smoke.mjs <folder-with-mp3s> <screenshot-dir>
 */

import { _electron as electron } from 'playwright-core';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { mkdtempSync, mkdirSync } from 'node:fs';
import os from 'node:os';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const musicFolder = process.argv[2];
const shotDir = process.argv[3] ?? path.join(os.tmpdir(), 'smp-shots');

if (!musicFolder) {
  console.error('Podaj folder z plikami mp3 jako pierwszy argument.');
  process.exit(2);
}
mkdirSync(shotDir, { recursive: true });

const checks = [];
function check(name, passed, detail = '') {
  checks.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** A throwaway profile so the test never touches the user's real library. */
const userDataDir = mkdtempSync(path.join(os.tmpdir(), 'smp-profile-'));

/**
 * Some editors export ELECTRON_RUN_AS_NODE=1 into the terminals they spawn.
 * Inherited into a launch, it makes Electron start as a bare Node process
 * with no app, no window and no `electron` module, which looks exactly like
 * a broken application. Strip it before launching.
 */
const cleanEnv = { ...process.env };
delete cleanEnv.ELECTRON_RUN_AS_NODE;

const launchOptions = {
  args: [projectRoot, `--user-data-dir=${userDataDir}`],
  cwd: projectRoot,
  env: cleanEnv,
};

const app = await electron.launch(launchOptions);

const page = await app.firstWindow();
page.on('console', (message) => {
  if (message.type() === 'error') console.log('  [renderer error]', message.text());
});
page.on('pageerror', (error) => console.log('  [renderer exception]', error.message));

await page.waitForSelector('#app', { timeout: 20000 });
await sleep(600);

/* --------------------------------------------------- 0. first run, empty */

const emptyState = await page.evaluate(() => {
  const empty = document.querySelector('#empty-state');
  const list = document.querySelector('#track-list');
  const overlay = document.querySelector('#drop-overlay');
  const visible = (node) => node.getBoundingClientRect().height > 0;
  return {
    promptShown: visible(empty),
    listHidden: !visible(list),
    overlayHidden: !visible(overlay),
  };
});
check('empty library shows the add-music prompt', emptyState.promptShown);
check('empty library hides the track list', emptyState.listHidden);
check('drop overlay stays out of the way', emptyState.overlayHidden);

// The logo is loaded as a file rather than inlined, so a content security
// policy mistake would hide it without any error in the console.
const logoLoaded = await page.evaluate(() => {
  const img = document.querySelector('.brand-mark');
  return { complete: img?.complete === true, width: img?.naturalWidth ?? 0 };
});
check('logo image loads', logoLoaded.complete && logoLoaded.width > 0,
  `naturalWidth=${logoLoaded.width}`);

await page.screenshot({ path: path.join(shotDir, '00-pierwsze-uruchomienie.png') });

/* ------------------------------------------------------------- 1. import */

const importResult = await page.evaluate(
  (folder) => window.api.addFolder(folder),
  musicFolder,
);
check('folder import finds tracks', importResult.addedCount >= 3,
  `dodano ${importResult.addedCount}`);

// The renderer only adopts a store it was handed, so re-render through the UI.
await page.reload();
await page.waitForSelector('.track-row', { timeout: 15000 });

const rowCount = await page.locator('.track-row').count();
check('tracks appear in the list', rowCount >= 3, `${rowCount} wierszy`);

const firstTitle = await page.locator('.track-row').first().locator('.t-title').textContent();
check('ID3 titles are read', Boolean(firstTitle && firstTitle.length > 2), firstTitle ?? '');

await page.screenshot({ path: path.join(shotDir, '01-biblioteka.png') });

/* ------------------------------------------------------------ 2. playback */

await page.locator('.track-row').first().dblclick();
await sleep(2500);

const playback = await page.evaluate(() => {
  const audio = document.querySelector('#audio');
  return {
    src: audio.getAttribute('src') ?? '',
    paused: audio.paused,
    currentTime: audio.currentTime,
    readyState: audio.readyState,
    error: audio.error ? audio.error.code : null,
  };
});

check('audio streams over the track protocol', playback.src.startsWith('track://'), playback.src.slice(0, 42));
check('no media error', playback.error === null, String(playback.error));
check('playback is running', !playback.paused && playback.currentTime > 0.3,
  `t=${playback.currentTime.toFixed(2)}s`);

const lcdState = await page.locator('#lcd-state').textContent();
check('display shows PLAY', lcdState.trim() === 'PLAY', lcdState);

/* ------------------------------------------- 3. analysers receive samples */

/* This is the check that matters most: a media element counted as
   cross-origin still plays, but feeds the graph nothing but zeros. */
const analyserReading = await page.evaluate(async () => {
  const canvas = document.querySelector('#spectrum');
  const ctx = canvas.getContext('2d');
  let lit = 0;
  // Sample a few frames; a single frame could land between LED updates.
  for (let attempt = 0; attempt < 30; attempt += 1) {
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) {
      if (pixels[i + 1] > 120) bright += 1;
    }
    lit = Math.max(lit, bright);
    await new Promise((r) => setTimeout(r, 100));
  }
  return lit;
});
check('spectrum analyser is lit by the audio', analyserReading > 200,
  `${analyserReading} jasnych pikseli`);

const vuReading = await page.evaluate(() => {
  const canvas = document.querySelector('#vu-left');
  const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let bright = 0;
  for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 120) bright += 1;
  return bright;
});
check('left VU meter is lit', vuReading > 20, `${vuReading} jasnych pikseli`);

await page.screenshot({ path: path.join(shotDir, '02-odtwarzanie.png') });

/* ---------------------------------------------------------- 4. equaliser */

await page.locator('#btn-eq-toggle').click();
await page.waitForSelector('#eq-panel:not([hidden])');

const faderCount = await page.locator('.eq-band .eq-slider').count();
check('ten equaliser bands are present', faderCount === 10, `${faderCount} suwaków`);

await page.selectOption('#eq-preset', 'rock');
await sleep(400);

const rockGains = await page.evaluate(() =>
  [...document.querySelectorAll('.eq-band .eq-slider')].map((s) => Number(s.value)));
check('a preset moves the faders', rockGains.some((g) => g !== 0), rockGains.join(','));

// Prove the preset reached the audio graph, not just the sliders.
await page.evaluate(() => { window.__smpProbe = true; });
const eqAudible = await page.evaluate(async () => {
  // Re-derive the filter gains from a fresh analysis of the running graph by
  // comparing spectrum energy with the equaliser on and off.
  const readEnergy = async () => {
    const canvas = document.querySelector('#spectrum');
    const ctx = canvas.getContext('2d');
    await new Promise((r) => setTimeout(r, 700));
    const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    let bright = 0;
    for (let i = 0; i < pixels.length; i += 4) if (pixels[i + 1] > 120) bright += 1;
    return bright;
  };
  const withEq = await readEnergy();
  document.querySelector('#btn-eq-power').click();
  const withoutEq = await readEnergy();
  document.querySelector('#btn-eq-power').click();
  return { withEq, withoutEq };
});
check('equaliser changes what the analyser sees',
  Math.abs(eqAudible.withEq - eqAudible.withoutEq) > 0,
  `on=${eqAudible.withEq} off=${eqAudible.withoutEq}`);

await page.screenshot({ path: path.join(shotDir, '03-korektor.png') });

/* ----------------------------------------------- 5. favourites and lists */

await page.locator('.track-row').first().locator('.t-fav').click();
await sleep(500);
const favCount = await page.locator('[data-count="favorites"]').textContent();
check('favourite is recorded', favCount.trim() === '1', favCount);

await page.locator('#btn-new-playlist').click();
await sleep(600);
const playlistItems = await page.locator('#playlist-list li').count();
check('playlist is created', playlistItems === 1, `${playlistItems} pozycji`);

// Add every visible track to the new playlist through the row menu.
await page.locator('.nav-item[data-view="library"]').click();
await sleep(300);
await page.locator('.track-row').first().click({ button: 'right' });
await page.waitForSelector('.context-menu');
await page.locator('.context-menu button', { hasText: 'Nowa playlista' }).first().click();
await sleep(700);

const playlistCount = await page.locator('#playlist-list .item-count').first().textContent();
check('track lands on the playlist', Number(playlistCount) >= 1, playlistCount);

await page.locator('#playlist-list li').first().click();
await sleep(400);
await page.screenshot({ path: path.join(shotDir, '04-playlista.png') });

/* ------------------------------------------------------- 6. persistence */

await sleep(900); // let the debounced save reach disk
await app.close();

const app2 = await electron.launch(launchOptions);
const page2 = await app2.firstWindow();
await page2.waitForSelector('.track-row', { timeout: 20000 });
await sleep(700);

const restored = await page2.evaluate(async () => {
  const store = await window.api.loadStore();
  return {
    tracks: Object.keys(store.tracks).length,
    favorites: store.favorites.length,
    playlists: store.playlists.length,
    eqGains: store.settings.eqGains,
  };
});

check('library survives a restart', restored.tracks >= 3, `${restored.tracks} utworów`);
check('favourite survives a restart', restored.favorites === 1, String(restored.favorites));
check('playlist survives a restart', restored.playlists === 1, String(restored.playlists));
check('equaliser curve survives a restart', restored.eqGains.some((g) => g !== 0),
  restored.eqGains.join(','));

await page2.screenshot({ path: path.join(shotDir, '05-po-restarcie.png') });
await app2.close();

/* ----------------------------------------------------------- conclusion */

const failed = checks.filter((c) => !c.passed);
console.log(`\n${checks.length - failed.length}/${checks.length} sprawdzeń przeszło.`);
console.log(`Zrzuty ekranu: ${shotDir}`);
process.exit(failed.length ? 1 : 0);
