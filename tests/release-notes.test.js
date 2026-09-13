import { describe, it, expect } from 'vitest';
import { extractNotes, listVersions } from '../tools/release-notes.mjs';

const CHANGELOG = `# Dziennik zmian

Wszystkie istotne zmiany trafiają do tego pliku.

## [Nieopublikowane]

- coś, czego jeszcze nie wydano

## [1.2.0] - 2026-10-01

### Dodane

- eksport playlisty do pliku m3u

### Poprawione

- korektor nie gubił ustawień po restarcie

## [1.1.0] - 2026-09-20

- pierwsza poprawka

## [1.0.0] - 2026-09-13

Pierwsze wydanie.
`;

describe('extractNotes', () => {
  it('returns the body of the matching version', () => {
    const notes = extractNotes(CHANGELOG, '1.1.0');
    expect(notes).toBe('- pierwsza poprawka');
  });

  it('stops at the next version heading', () => {
    const notes = extractNotes(CHANGELOG, '1.2.0');
    expect(notes).toContain('eksport playlisty');
    expect(notes).toContain('Poprawione');
    expect(notes).not.toContain('pierwsza poprawka');
  });

  it('accepts a version with or without a leading v', () => {
    expect(extractNotes(CHANGELOG, 'v1.1.0')).toBe(extractNotes(CHANGELOG, '1.1.0'));
  });

  it('reads the last section, which has no heading after it', () => {
    expect(extractNotes(CHANGELOG, '1.0.0')).toBe('Pierwsze wydanie.');
  });

  it('never returns the unreleased section', () => {
    expect(extractNotes(CHANGELOG, 'Nieopublikowane')).toBeNull();
    expect(extractNotes(CHANGELOG, '1.0.0')).not.toContain('jeszcze nie wydano');
  });

  it('returns null for a version that is not there', () => {
    expect(extractNotes(CHANGELOG, '9.9.9')).toBeNull();
  });

  it('returns null for a heading that exists but has an empty body', () => {
    const empty = '## [2.0.0] - 2026-11-01\n\n## [1.0.0] - 2026-01-01\n\nCoś.\n';
    expect(extractNotes(empty, '2.0.0')).toBeNull();
  });

  it('survives a changelog that is missing or unreadable', () => {
    expect(extractNotes('', '1.0.0')).toBeNull();
    expect(extractNotes(null, '1.0.0')).toBeNull();
  });

  it('tolerates a heading without a date', () => {
    expect(extractNotes('## [3.0.0]\n\nBez daty.\n', '3.0.0')).toBe('Bez daty.');
  });
});

describe('listVersions', () => {
  it('lists released versions, newest first, skipping unreleased', () => {
    expect(listVersions(CHANGELOG)).toEqual(['1.2.0', '1.1.0', '1.0.0']);
  });

  it('returns an empty list for junk input', () => {
    expect(listVersions('')).toEqual([]);
    expect(listVersions(null)).toEqual([]);
  });
});
