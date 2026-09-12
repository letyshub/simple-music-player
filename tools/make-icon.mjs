/**
 * Builds the Windows application icon from the logo.
 *
 * There is one drawing, `src/renderer/assets/logo.svg`, used both in the
 * sidebar and here. Generating the .ico from it rather than keeping a second
 * hand-drawn copy means the window and the taskbar can never drift apart.
 *
 * A .ico holds several sizes; Windows picks whichever fits the place it is
 * drawing. Without the small ones it downscales 256px artwork itself and the
 * result looks muddy in the taskbar.
 *
 * Usage: node tools/make-icon.mjs
 */

import sharp from 'sharp';
import pngToIco from 'png-to-ico';
import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(projectRoot, 'src', 'renderer', 'assets', 'logo.svg');
const buildDir = path.join(projectRoot, 'build');

const SIZES = [16, 24, 32, 48, 64, 128, 256];

const svg = await fs.readFile(source);
await fs.mkdir(buildDir, { recursive: true });

const pngs = await Promise.all(
  SIZES.map((size) => sharp(svg, { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toBuffer()),
);

await fs.writeFile(path.join(buildDir, 'icon.ico'), await pngToIco(pngs));

// A 512px PNG as well: electron-builder wants one for non-Windows targets,
// and it is the handiest thing to point a README or a release page at.
await sharp(svg, { density: 768 }).resize(512, 512).png()
  .toFile(path.join(buildDir, 'icon.png'));

// The window sets its own icon so that `npm start` shows the real mark
// instead of the stock Electron one. It lives under src/ because that is
// what gets packaged into the app bundle; build/ is only used at build time.
await sharp(svg, { density: 512 }).resize(256, 256).png()
  .toFile(path.join(projectRoot, 'src', 'renderer', 'assets', 'icon-256.png'));

console.log(
  `Zapisano build/icon.ico (${SIZES.join(', ')} px), build/icon.png (512 px)`
  + ' oraz src/renderer/assets/icon-256.png',
);
