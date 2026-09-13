/**
 * Pulls one version's section out of CHANGELOG.md.
 *
 * The release pipeline uses this twice: once early, to refuse to build a
 * version nobody has written notes for, and once at the end, to fill in the
 * body of the draft release. Keeping the notes in the repository rather than
 * generating them from commit subjects matters here, because commit messages
 * are written for whoever maintains the code and a release page is read by
 * whoever is deciding whether to download an installer.
 *
 * Usage: node tools/release-notes.mjs <wersja> [plik-wyjsciowy]
 */

import { fileURLToPath } from 'node:url';
import { promises as fs } from 'node:fs';
import path from 'node:path';

/** Matches "## [1.2.0] - 2026-10-01", with or without the date. */
const HEADING = /^##\s+\[([^\]]+)\]/;

function lines(markdown) {
  return typeof markdown === 'string' ? markdown.split(/\r?\n/) : [];
}

/** Looks like a released version rather than an "Unreleased" placeholder. */
function isVersion(label) {
  return /^v?\d+\.\d+\.\d+/.test(label);
}

export function normalizeVersion(version) {
  return String(version ?? '').trim().replace(/^v/, '');
}

/**
 * The text under a version's heading, up to the next heading.
 * Returns null when that version is absent or its section is empty.
 */
export function extractNotes(markdown, version) {
  const wanted = normalizeVersion(version);
  if (!wanted || !isVersion(wanted)) return null;

  const rows = lines(markdown);
  const start = rows.findIndex((row) => {
    const match = HEADING.exec(row);
    return match && normalizeVersion(match[1]) === wanted;
  });
  if (start === -1) return null;

  const rest = rows.slice(start + 1);
  const nextHeading = rest.findIndex((row) => HEADING.test(row));
  const body = (nextHeading === -1 ? rest : rest.slice(0, nextHeading))
    .join('\n')
    .trim();

  return body || null;
}

/** Every released version in the file, in the order they appear. */
export function listVersions(markdown) {
  return lines(markdown)
    .map((row) => HEADING.exec(row))
    .filter(Boolean)
    .map((match) => match[1])
    .filter(isVersion)
    .map(normalizeVersion);
}

/* ------------------------------------------------------------------ CLI */

const invokedDirectly = process.argv[1]
  && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (invokedDirectly) {
  const [version, outFile] = process.argv.slice(2);

  if (!version) {
    console.error('Uzycie: node tools/release-notes.mjs <wersja> [plik-wyjsciowy]');
    process.exit(2);
  }

  const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const changelogPath = path.join(projectRoot, 'CHANGELOG.md');

  let changelog;
  try {
    changelog = await fs.readFile(changelogPath, 'utf8');
  } catch {
    console.error(`Nie znaleziono ${changelogPath}.`);
    process.exit(1);
  }

  const notes = extractNotes(changelog, version);

  if (!notes) {
    const known = listVersions(changelog);
    console.error(
      `Brak opisu zmian dla wersji ${normalizeVersion(version)} w CHANGELOG.md.`
      + (known.length ? ` Opisane wersje: ${known.join(', ')}.` : ''),
    );
    process.exit(1);
  }

  if (outFile) {
    await fs.writeFile(outFile, `${notes}\n`, 'utf8');
    console.error(`Zapisano opis zmian dla ${normalizeVersion(version)} do ${outFile}`);
  } else {
    process.stdout.write(`${notes}\n`);
  }
}
