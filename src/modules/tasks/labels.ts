import type { Database } from "@/lib/supabase/database.types";

export type TaskStatus = Database["public"]["Enums"]["task_status"];
export type TaskPriority = Database["public"]["Enums"]["task_priority"];
export type TaskKind = Database["public"]["Enums"]["task_kind"];
export type Frequency = Database["public"]["Enums"]["recurrence_frequency"];
export type RecurrenceMode = Database["public"]["Enums"]["recurrence_mode"];

export const STATUSES: TaskStatus[] = ["open", "in_progress", "blocked", "done", "cancelled"];
export const PRIORITIES: TaskPriority[] = ["urgent", "high", "normal", "low"];
export const FREQUENCIES: Frequency[] = ["daily", "weekly", "monthly"];
export const OPEN_STATUSES: TaskStatus[] = ["open", "in_progress", "blocked"];

export const STATUS_LABELS: Record<TaskStatus, string> = {
  open: "To do",
  in_progress: "In progress",
  blocked: "Blocked",
  done: "Done",
  cancelled: "Cancelled",
};
export const STATUS_BADGE: Record<TaskStatus, string> = {
  open: "badge-gray",
  in_progress: "badge-blue",
  blocked: "badge-amber",
  done: "badge-green",
  cancelled: "badge-gray",
};
export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  urgent: "Urgent",
  high: "High",
  normal: "Normal",
  low: "Low",
};
export const PRIORITY_BADGE: Record<TaskPriority, string> = {
  urgent: "badge-red",
  high: "badge-orange",
  normal: "badge-gray",
  low: "badge-gray",
};
export const PRIORITY_RANK: Record<TaskPriority, number> = { urgent: 0, high: 1, normal: 2, low: 3 };

export const WEEKDAYS = [
  { n: 1, short: "Mon" },
  { n: 2, short: "Tue" },
  { n: 3, short: "Wed" },
  { n: 4, short: "Thu" },
  { n: 5, short: "Fri" },
  { n: 6, short: "Sat" },
  { n: 7, short: "Sun" },
];

const UNIT: Record<Frequency, [string, string]> = {
  daily: ["day", "days"],
  weekly: ["week", "weeks"],
  monthly: ["month", "months"],
};

/** Plain-language description of a recurrence rule, used wherever a series is shown. */
export function describeRecurrence(s: {
  frequency: Frequency;
  interval_count: number;
  schedule_mode: RecurrenceMode;
  weekdays: number[] | null;
}): string {
  const [one, many] = UNIT[s.frequency];
  const every = s.interval_count === 1 ? `every ${one}` : `every ${s.interval_count} ${many}`;
  const days =
    s.frequency === "daily" && s.weekdays?.length
      ? ` (${WEEKDAYS.filter((d) => s.weekdays!.includes(d.n)).map((d) => d.short).join(", ")} only)`
      : "";
  return s.schedule_mode === "fixed_schedule"
    ? `Fixed schedule: ${every}${days}, counted from the start date. The next task appears on schedule even if the previous one is still open.`
    : `After completion: the next task is due ${s.interval_count === 1 ? `one ${one}` : `${s.interval_count} ${many}`} after the previous one is completed${days}. Nothing new appears while one is still open.`;
}

export function shortRecurrence(s: { frequency: Frequency; interval_count: number; schedule_mode: RecurrenceMode }): string {
  const [one, many] = UNIT[s.frequency];
  const every = s.interval_count === 1 ? `Every ${one}` : `Every ${s.interval_count} ${many}`;
  return `${every} · ${s.schedule_mode === "fixed_schedule" ? "fixed schedule" : "after completion"}`;
}

export const EVENT_LABELS: Record<string, string> = {
  created: "created the task",
  created_from_series: "Created automatically from the recurring series",
  status_changed: "changed the status",
  reassigned: "reassigned the task",
  rescheduled: "changed the due date",
  department_changed: "moved the task to another department",
  commented: "commented",
};
