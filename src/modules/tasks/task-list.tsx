import Link from "next/link";
import { dueLabel, formatDate } from "@/lib/dates";
import { Icon } from "@/components/icons";
import { setTaskStatus } from "./actions";
import { OPEN_STATUSES, PRIORITY_BADGE, PRIORITY_LABELS, STATUS_BADGE, STATUS_LABELS } from "./labels";
import type { TaskListRow } from "./queries";

/**
 * Task rows that work as a table on desktop and as tappable cards on phones.
 * `canComplete` decides who gets the one-tap "Done" button.
 */
export function TaskList({
  tasks,
  today,
  viewerId,
  showOwner = true,
  back = "/",
  canComplete,
}: {
  tasks: TaskListRow[];
  today: string;
  viewerId: string;
  showOwner?: boolean;
  back?: string;
  canComplete: (t: TaskListRow) => boolean;
}) {
  return (
    <ul className="divide-y divide-line">
      {tasks.map((t) => {
        const open = OPEN_STATUSES.includes(t.status);
        const overdue = open && !!t.due_date && t.due_date < today;
        return (
          <li key={t.id} className="flex items-center gap-3 px-3 py-2.5 sm:px-4">
            {open && canComplete(t) ? (
              <form action={setTaskStatus}>
                <input type="hidden" name="id" value={t.id} />
                <input type="hidden" name="status" value="done" />
                <input type="hidden" name="back" value={back} />
                <button
                  type="submit"
                  title="Mark as done"
                  aria-label={`Mark "${t.title}" as done`}
                  className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-line bg-white text-transparent hover:border-forest-600 hover:text-forest-600 sm:h-9 sm:w-9"
                >
                  <Icon name="check" className="h-5 w-5" />
                </button>
              </form>
            ) : (
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full sm:h-9 sm:w-9 ${
                  t.status === "done" ? "bg-forest-100 text-forest-600" : "bg-paper text-muted"
                }`}
              >
                {t.status === "done" ? <Icon name="check" className="h-5 w-5" /> : null}
              </span>
            )}
            <Link href={`/tasks/${t.id}`} className="min-w-0 flex-1 py-1">
              <span className={`block truncate text-[15px] font-semibold ${t.status === "done" || t.status === "cancelled" ? "text-muted line-through" : "text-ink"}`}>
                {t.title}
              </span>
              <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
                <span className={overdue ? "font-semibold text-red-700" : ""}>
                  {open ? dueLabel(t.due_date, today) : formatDate(t.due_date)}
                  {open && t.due_date ? ` · ${formatDate(t.due_date)}` : ""}
                </span>
                {t.kind === "personal" ? <span>Personal</span> : <span>{t.department?.name}</span>}
                {showOwner && t.kind === "shared" ? (
                  <span>{t.owner_id === viewerId ? "Me" : t.owner?.full_name || t.owner?.email}</span>
                ) : null}
                {t.series_id ? (
                  <span className="inline-flex items-center gap-1"><Icon name="repeat" className="h-3 w-3" /> Recurring</span>
                ) : null}
              </span>
            </Link>
            <span className="flex shrink-0 flex-col items-end gap-1 sm:flex-row sm:items-center">
              {t.is_demo ? <span className="badge badge-amber">Demo</span> : null}
              {t.priority !== "normal" ? <span className={`badge ${PRIORITY_BADGE[t.priority]}`}>{PRIORITY_LABELS[t.priority]}</span> : null}
              {t.status !== "open" ? <span className={`badge ${STATUS_BADGE[t.status]}`}>{STATUS_LABELS[t.status]}</span> : null}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
