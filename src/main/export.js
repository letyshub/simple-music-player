import { promises as fs } from 'node:fs';
import path from 'node:path';
import { exportFileNames, exportFolderName } from '../shared/export-names.js';

/**
 * Copying a playlist onto a device.
 *
 * Two stages, so the window can show the damage before anything is written:
 * `planExport` only measures, `runExport` only copies. Neither knows about
 * Electron, which keeps both testable against a real folder.
 *
 * Nothing on the device is ever deleted. A file already there under the same
 * name and size is left alone; one of a different size is replaced, because
 * the library is the version that counts.
 */

async function statOrNull(target) {
  try {
    return await fs.stat(target);
  } catch {
    return null;
  }
}

/**
 * Free bytes on the volume holding `dir`. The folder itself usually does not
 * exist yet - the user just picked a drive - so this walks up to the nearest
 * ancestor that does.
 */
async function freeSpace(dir) {
  let current = path.resolve(dir);
  for (;;) {
    try {
      const info = await fs.statfs(current);
      return info.bsize * info.bavail;
    } catch {
      const parent = path.dirname(current);
      if (parent === current) return 0;
      current = parent;
    }
  }
}

/**
 * Work out what the export would write, without writing any of it.
 *
 * Tracks whose file has gone missing keep their place in the numbering, so a
 * gap on the device matches the gap in the library rather than silently
 * renumbering everything after it.
 */
export async function planExport({ tracks, targetRoot, folderName }) {
  const items = [];
  let totalBytes = 0;
  let missing = 0;

  for (const entry of exportFileNames(tracks)) {
    const info = await statOrNull(entry.path);
    if (info) totalBytes += info.size;
    else missing += 1;
    items.push({ path: entry.path, name: entry.name, size: info?.size ?? 0, exists: Boolean(info) });
  }

  return {
    targetDir: path.join(targetRoot, exportFolderName(folderName)),
    items,
    totalBytes,
    missing,
    freeBytes: await freeSpace(targetRoot),
  };
}

/** Turn a file system error into something worth showing the user. */
async function describeFailure(error, source) {
  if (error?.code === 'ENOENT') {
    // ENOENT is ambiguous: it is the source on a stale library, and the
    // destination once a stick has been pulled out mid-copy.
    return await statOrNull(source) ? 'Urządzenie przestało odpowiadać' : 'Plik źródłowy nie istnieje';
  }
  if (error?.code === 'ENOSPC') return 'Brak miejsca na urządzeniu';
  if (error?.code === 'EACCES' || error?.code === 'EPERM') return 'Brak uprawnień do zapisu';
  if (error?.code === 'EISDIR') return 'W miejscu docelowym jest folder o tej nazwie';
  return 'Nie udało się skopiować pliku';
}

/**
 * Copy via a temporary name, then move it into place.
 *
 * A copy that dies halfway - a full stick, a cable pulled - leaves a truncated
 * file that still looks playable. Renaming only after the copy finished means
 * the device never holds a half-written track, and a file already there is not
 * destroyed by a copy that was never going to finish.
 */
async function copyThroughTemp(source, target) {
  const temp = `${target}.part`;
  try {
    await fs.copyFile(source, temp);
    await fs.rename(temp, target);
  } catch (error) {
    await fs.rm(temp, { force: true });
    throw error;
  }
}

/**
 * Carry out a plan.
 *
 * @param {object} plan          from planExport
 * @param {object} [options]
 * @param {(progress: {done: number, total: number, name: string, bytes: number}) => void} [options.onProgress]
 * @param {AbortSignal} [options.signal]
 */
export async function runExport(plan, { onProgress, signal } = {}) {
  await fs.mkdir(plan.targetDir, { recursive: true });

  let copied = 0;
  let skipped = 0;
  let copiedBytes = 0;
  let canceled = false;
  const errors = [];

  for (const item of plan.items) {
    if (signal?.aborted) {
      canceled = true;
      break;
    }

    const target = path.join(plan.targetDir, item.name);
    try {
      const existing = item.size > 0 ? await statOrNull(target) : null;
      if (existing && existing.size === item.size) {
        skipped += 1;
      } else {
        await copyThroughTemp(item.path, target);
        copied += 1;
        copiedBytes += item.size;
      }
    } catch (error) {
      // A stick pulled out mid-copy fails differently depending on how far
      // Windows got with it - sometimes ENOENT, sometimes EPERM on a folder
      // still pending deletion - so the error code is not worth trusting.
      // Whether the target folder is still there is.
      if (!await statOrNull(plan.targetDir)) {
        errors.push({ name: item.name, reason: 'Urządzenie przestało odpowiadać' });
        break;
      }
      errors.push({ name: item.name, reason: await describeFailure(error, item.path) });
    }

    onProgress?.({
      done: copied + skipped + errors.length,
      total: plan.items.length,
      name: item.name,
      bytes: copiedBytes,
    });
  }

  return { copied, copiedBytes, skipped, errors, canceled };
}
