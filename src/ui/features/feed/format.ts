// Small formatting helpers for the feed. Plain functions so they are easy to test.

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/** "just now", "5 m", "3 h", "2 d", then a date ("7 Nov"). */
export function relativeTime(iso: string, now: Date = new Date()): string {
  const then = new Date(iso);
  const diff = Math.max(0, now.getTime() - then.getTime());
  if (diff < MINUTE) return 'just now';
  if (diff < HOUR) return `${Math.floor(diff / MINUTE)} m`;
  if (diff < DAY) return `${Math.floor(diff / HOUR)} h`;
  if (diff < 7 * DAY) return `${Math.floor(diff / DAY)} d`;
  return shortDate(iso);
}

/** "21 Nov" (03 sec. 6.3), in the viewer's time zone. */
export function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
}

/** "2,140", for character counts in messages. */
export function thousands(n: number): string {
  return n.toLocaleString('en-US');
}
