/** Deadlines and schedules use Aruba local time (UTC-4, no daylight saving). */
export const ARUBA_TZ = "America/Aruba";

/** Today's date in Aruba as YYYY-MM-DD. */
export function arubaToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: ARUBA_TZ }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

/** "Mon 16 Nov 2026" for a YYYY-MM-DD date (no time zone shift). */
export function formatDate(isoDate: string | null | undefined, opts: { weekday?: boolean } = {}): string {
  if (!isoDate) return "—";
  const d = new Date(`${isoDate.slice(0, 10)}T00:00:00Z`);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "UTC",
    weekday: opts.weekday ? "short" : undefined,
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

/** Timestamp shown in Aruba local time. */
export function formatDateTime(ts: string | null | undefined): string {
  if (!ts) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: ARUBA_TZ,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(ts));
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round(
    (new Date(`${toIso}T00:00:00Z`).getTime() - new Date(`${fromIso}T00:00:00Z`).getTime()) / 86_400_000,
  );
}

/** "Due today", "Overdue by 3 days", "Due in 2 days". */
export function dueLabel(dueDate: string | null, today: string): string {
  if (!dueDate) return "No due date";
  const diff = daysBetween(today, dueDate);
  if (diff === 0) return "Due today";
  if (diff === 1) return "Due tomorrow";
  if (diff === -1) return "Overdue by 1 day";
  if (diff < 0) return `Overdue by ${-diff} days`;
  return `Due in ${diff} days`;
}
