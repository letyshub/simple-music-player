/** Text formatting helpers shared by the list, the sidebar and the display. */

/** Seconds to a clock reading: 205 -> "3:25", 3725 -> "1:02:05". */
export function formatTime(seconds) {
  const total = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Polish plurals, which need three forms rather than two:
 * 1 utwór, 2 utwory, 5 utworów.
 */
export function plural(n, one, few, many) {
  const abs = Math.abs(n);
  if (abs === 1) return one;
  const lastTwo = abs % 100;
  const last = abs % 10;
  if (last >= 2 && last <= 4 && !(lastTwo >= 12 && lastTwo <= 14)) return few;
  return many;
}

export function trackCount(n) {
  return `${n} ${plural(n, 'utwór', 'utwory', 'utworów')}`;
}

/** Total running time of a list, e.g. "1 godz. 12 min". */
export function formatTotalDuration(seconds) {
  const total = Math.round(seconds);
  if (total <= 0) return '';
  const h = Math.floor(total / 3600);
  const m = Math.round((total % 3600) / 60);
  if (h > 0) return `${h} godz. ${m} min`;
  if (m > 0) return `${m} min`;
  return `${total} s`;
}

/** Last path segment, used to label a folder in the sidebar. */
export function folderName(fullPath) {
  const parts = String(fullPath).split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] || fullPath;
}

/** Signed decibel reading for an equaliser slider: "+3", "0", "-4.5". */
export function formatDecibels(value) {
  const rounded = Math.round(value * 10) / 10;
  if (rounded === 0) return '0';
  const text = Number.isInteger(rounded) ? String(Math.abs(rounded)) : String(Math.abs(rounded));
  return rounded > 0 ? `+${text}` : `−${text}`;
}
