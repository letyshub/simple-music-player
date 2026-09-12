/**
 * Which files count as music, and in what order they should appear.
 * Pure string work, shared by the folder scanner and the library view.
 */

export const AUDIO_EXTENSIONS = [
  '.mp3', '.m4a', '.aac', '.flac', '.ogg', '.opus', '.wav', '.wma',
];

const EXTENSION_SET = new Set(AUDIO_EXTENSIONS);

/** True when the name ends in an extension we can decode. */
export function isAudioFile(name) {
  if (typeof name !== 'string') return false;
  const dot = name.lastIndexOf('.');
  // No dot, or a leading dot with nothing before it, means no usable extension.
  if (dot <= 0) return false;
  return EXTENSION_SET.has(name.slice(dot).toLowerCase());
}

const collator = new Intl.Collator('pl', { numeric: true, sensitivity: 'base' });

/** Sort comparator that puts "2 - x" before "10 - x" the way a human expects. */
export function compareByPath(a, b) {
  return collator.compare(String(a), String(b));
}
