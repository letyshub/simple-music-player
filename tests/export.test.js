import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { planExport, runExport } from '../src/main/export.js';

/** Real files in a real temporary folder: copying is the whole point here,
 *  and a mocked file system would prove nothing about it. */

let root;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), 'smp-export-'));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

const sourceDir = () => path.join(root, 'biblioteka');
const targetRoot = () => path.join(root, 'pendrive');

/** A track record backed by an actual file. */
async function makeTrack(fileName, content, over = {}) {
  const filePath = path.join(sourceDir(), fileName);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, content);
  return {
    path: filePath,
    title: over.title ?? fileName.replace(/\.[^.]+$/, ''),
    artist: over.artist ?? 'Wykonawca',
  };
}

const plan = (tracks, folder = 'Na rower') => planExport({
  tracks,
  targetRoot: targetRoot(),
  folderName: folder,
});

describe('planExport', () => {
  it('measures every track and sums the total', async () => {
    const tracks = [
      await makeTrack('a.mp3', 'x'.repeat(100)),
      await makeTrack('b.mp3', 'y'.repeat(50)),
    ];

    const result = await plan(tracks);

    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({ name: '01 - Wykonawca - a.mp3', size: 100 });
    expect(result.totalBytes).toBe(150);
    expect(result.missing).toBe(0);
  });

  it('counts tracks whose file has disappeared, without dropping them', async () => {
    const tracks = [
      await makeTrack('a.mp3', 'x'.repeat(10)),
      { path: path.join(sourceDir(), 'nie-ma.mp3'), title: 'Znikniety', artist: 'Wykonawca' },
    ];

    const result = await plan(tracks);

    expect(result.missing).toBe(1);
    expect(result.totalBytes).toBe(10);
    expect(result.items).toHaveLength(2);
  });

  it('puts the files in a subfolder named after the playlist', async () => {
    const result = await plan([await makeTrack('a.mp3', 'x')], 'Rock/Metal');
    expect(result.targetDir).toBe(path.join(targetRoot(), 'Rock-Metal'));
  });

  it('reports the free space on the target, so the caller can refuse to start', async () => {
    const result = await plan([await makeTrack('a.mp3', 'x')]);
    expect(result.freeBytes).toBeGreaterThan(0);
  });
});

describe('runExport', () => {
  it('copies the files under their export names', async () => {
    const tracks = [
      await makeTrack('a.mp3', 'pierwszy'),
      await makeTrack('b.mp3', 'drugi'),
    ];
    const prepared = await plan(tracks);

    const result = await runExport(prepared);

    expect(result).toMatchObject({ copied: 2, skipped: 0, canceled: false });
    expect(result.errors).toEqual([]);
    expect(await readdir(prepared.targetDir)).toEqual([
      '01 - Wykonawca - a.mp3',
      '02 - Wykonawca - b.mp3',
    ]);
    const copied = await readFile(path.join(prepared.targetDir, '01 - Wykonawca - a.mp3'), 'utf8');
    expect(copied).toBe('pierwszy');
  });

  it('creates the target folder when it is not there yet', async () => {
    const prepared = await plan([await makeTrack('a.mp3', 'x')]);
    await runExport(prepared);
    expect(await readdir(prepared.targetDir)).toHaveLength(1);
  });

  it('skips a file that is already on the device with the same size', async () => {
    const tracks = [await makeTrack('a.mp3', 'x'.repeat(20))];
    await runExport(await plan(tracks));

    const second = await runExport(await plan(tracks));

    expect(second).toMatchObject({ copied: 0, skipped: 1 });
    expect(second.copiedBytes).toBe(0);
  });

  it('replaces a file of the same name but a different size', async () => {
    const tracks = [await makeTrack('a.mp3', 'pelna wersja')];
    const prepared = await plan(tracks);
    await mkdir(prepared.targetDir, { recursive: true });
    const target = path.join(prepared.targetDir, '01 - Wykonawca - a.mp3');
    await writeFile(target, 'obcieta');

    const result = await runExport(prepared);

    expect(result).toMatchObject({ copied: 1, skipped: 0 });
    expect(await readFile(target, 'utf8')).toBe('pelna wersja');
  });

  it('leaves files that are not part of the export alone', async () => {
    const prepared = await plan([await makeTrack('a.mp3', 'x')]);
    await mkdir(prepared.targetDir, { recursive: true });
    await writeFile(path.join(prepared.targetDir, 'cudzy-plik.mp3'), 'nie ruszaj');

    await runExport(prepared);

    const left = await readFile(path.join(prepared.targetDir, 'cudzy-plik.mp3'), 'utf8');
    expect(left).toBe('nie ruszaj');
  });

  it('reports progress as each file lands', async () => {
    const tracks = [
      await makeTrack('a.mp3', 'x'.repeat(10)),
      await makeTrack('b.mp3', 'y'.repeat(10)),
    ];
    const seen = [];

    await runExport(await plan(tracks), { onProgress: (p) => seen.push({ ...p }) });

    expect(seen).toHaveLength(2);
    expect(seen[0]).toMatchObject({ done: 1, total: 2, name: '01 - Wykonawca - a.mp3', bytes: 10 });
    expect(seen[1]).toMatchObject({ done: 2, total: 2, bytes: 20 });
  });

  it('stops when the caller aborts and reports what it managed to copy', async () => {
    const tracks = [
      await makeTrack('a.mp3', 'x'),
      await makeTrack('b.mp3', 'y'),
      await makeTrack('c.mp3', 'z'),
    ];
    const prepared = await plan(tracks);
    const controller = new AbortController();

    const result = await runExport(prepared, {
      signal: controller.signal,
      onProgress: () => controller.abort(),
    });

    expect(result.canceled).toBe(true);
    expect(result.copied).toBe(1);
    expect(await readdir(prepared.targetDir)).toEqual(['01 - Wykonawca - a.mp3']);
  });

  it('gives up once the device is gone instead of failing on every file left', async () => {
    const tracks = [
      await makeTrack('a.mp3', 'x'),
      await makeTrack('b.mp3', 'y'),
      await makeTrack('c.mp3', 'z'),
    ];
    const prepared = await plan(tracks);
    let first = true;

    const result = await runExport(prepared, {
      onProgress: async () => {
        if (!first) return;
        first = false;
        await rm(prepared.targetDir, { recursive: true, force: true });
      },
    });

    expect(result.copied).toBe(1);
    expect(result.errors).toEqual([
      { name: '02 - Wykonawca - b.mp3', reason: 'Urządzenie przestało odpowiadać' },
    ]);
  });

  it('records a vanished source, keeps going, and leaves no half-written file', async () => {
    const tracks = [
      { path: path.join(sourceDir(), 'nie-ma.mp3'), title: 'Znikniety', artist: 'Wykonawca' },
      await makeTrack('b.mp3', 'drugi'),
    ];
    const prepared = await plan(tracks);

    const result = await runExport(prepared);

    expect(result.copied).toBe(1);
    expect(result.errors).toEqual([
      { name: '01 - Wykonawca - Znikniety.mp3', reason: 'Plik źródłowy nie istnieje' },
    ]);
    expect(await readdir(prepared.targetDir)).toEqual(['02 - Wykonawca - b.mp3']);
  });
});
