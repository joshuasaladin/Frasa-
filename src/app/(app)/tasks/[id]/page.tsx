import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { Card, Empty, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { arubaToday, dueLabel, formatDate, formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import {
  addChecklistItem,
  addComment,
  deleteTask,
  removeChecklistItem,
  removeTaskAttachment,
  rescheduleTask,
  setTaskStatus,
  toggleChecklistItem,
  uploadTaskAttachment,
} from "@/modules/tasks/actions";
import {
  describeRecurrence,
  EVENT_LABELS,
  OPEN_STATUSES,
  PRIORITY_BADGE,
  PRIORITY_LABELS,
  STATUS_BADGE,
  STATUS_LABELS,
  type TaskStatus,
} from "@/modules/tasks/labels";
import { canEditTask, canManageTask, getTask } from "@/modules/tasks/queries";

export const metadata = { title: "Task" };

const WARNINGS: Record<string, string> = {
  status: "The status could not be changed. You may not have permission.",
  delete: "The task could not be deleted. You may not have permission.",
  checklist: "The task was created, but the checklist could not be saved.",
};

function StatusButton({ id, status, label, className = "btn" }: { id: string; status: TaskStatus; label: string; className?: string }) {
  return (
    <form action={setTaskStatus}>
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="status" value={status} />
      <button type="submit" className={className}>{label}</button>
    </form>
  );
}

export default async function TaskPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ warn?: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const { warn } = await searchParams;
  const task = await getTask(id);
  if (!task) notFound();

  const supabase = await createClient();
  const [checklist, comments, attachments, events, people, estimate, defaults] = await Promise.all([
    supabase.from("task_checklist_items").select("id, label, is_done, position").eq("task_id", task.id).order("position"),
    supabase.from("task_comments").select("id, body, created_at, author_id").eq("task_id", task.id).order("created_at"),
    supabase.from("task_attachments").select("id, file_name, size_bytes, uploaded_by, created_at").eq("task_id", task.id).order("created_at"),
    supabase.from("task_events").select("id, event, detail, actor_id, created_at").eq("task_id", task.id).order("created_at", { ascending: false }).limit(100),
    supabase.from("profiles").select("id, full_name, email"),
    task.freight_estimate_id && viewer.canViewFreight
      ? supabase.from("freight_estimates").select("id, name, reference").eq("id", task.freight_estimate_id).maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from("app_settings").select("value").eq("key", "notification_defaults").maybeSingle(),
  ]);
  const nameOf = (uid: string | null) => {
    if (!uid) return "Frasa HQ";
    const p = people.data?.find((x) => x.id === uid);
    return p ? p.full_name || p.email : "Former user";
  };

  const today = arubaToday();
  const open = OPEN_STATUSES.includes(task.status);
  const canEdit = canEditTask(viewer, task);
  const canManage = canManageTask(viewer, task);
  const overdue = open && !!task.due_date && task.due_date < today;
  const items = checklist.data ?? [];
  const doneCount = items.filter((i) => i.is_done).length;
  const rescheduled = !!task.series_id && !!task.scheduled_for && task.due_date !== task.scheduled_for;
  const remindDays = task.remind_days_before ?? (defaults.data?.value as { remind_days_before?: number } | null)?.remind_days_before ?? 1;

  const describeEvent = (e: { event: string; detail: unknown }) => {
    const d = (e.detail ?? {}) as Record<string, string>;
    if (e.event === "status_changed") return `changed the status from ${STATUS_LABELS[d.from as TaskStatus] ?? d.from} to ${STATUS_LABELS[d.to as TaskStatus] ?? d.to}`;
    if (e.event === "reassigned") return `reassigned the task from ${nameOf(d.from)} to ${nameOf(d.to)}`;
    if (e.event === "rescheduled") return `changed the due date from ${formatDate(d.from)} to ${formatDate(d.to)}`;
    return EVENT_LABELS[e.event] ?? e.event;
  };

  return (
    <>
      <PageHeader
        back={{ href: "/tasks", label: "Tasks" }}
        title={task.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className={`badge ${STATUS_BADGE[task.status]}`}>{STATUS_LABELS[task.status]}</span>
            <span className={`badge ${PRIORITY_BADGE[task.priority]}`}>{PRIORITY_LABELS[task.priority]} priority</span>
            <span className="badge badge-gray">{task.kind === "personal" ? "Personal to-do" : `Shared · ${task.department?.name}`}</span>
            {task.is_demo ? <span className="badge badge-amber">Demo data</span> : null}
            <span className={overdue ? "font-semibold text-red-700" : ""}>
              {open ? dueLabel(task.due_date, today) : null}
            </span>
          </span>
        }
        actions={canEdit ? <Link href={`/tasks/${task.id}/edit`} className="btn">Edit</Link> : null}
      />

      {warn && WARNINGS[warn] ? <div className="mb-4"><Notice tone="red">{WARNINGS[warn]}</Notice></div> : null}

      {canEdit ? (
        <div className="mb-5 flex flex-wrap gap-2">
          {open ? <StatusButton id={task.id} status="done" label="Mark as done" className="btn btn-primary" /> : null}
          {task.status === "open" || task.status === "blocked" ? <StatusButton id={task.id} status="in_progress" label="Start" /> : null}
          {task.status === "in_progress" ? <StatusButton id={task.id} status="open" label="Back to to-do" /> : null}
          {task.status === "open" || task.status === "in_progress" ? <StatusButton id={task.id} status="blocked" label="Blocked" /> : null}
          {open ? <StatusButton id={task.id} status="cancelled" label="Cancel task" /> : <StatusButton id={task.id} status="open" label="Reopen" />}
        </div>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {task.description ? (
            <Card title="Details"><p className="whitespace-pre-wrap text-[15px] leading-relaxed">{task.description}</p></Card>
          ) : null}

          <Card title={<>Checklist {items.length ? <span className="font-normal text-muted">· {doneCount} of {items.length} done</span> : null}</>} padded={false}>
            {items.length ? (
              <ul className="divide-y divide-line">
                {items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2 px-3 py-1.5">
                    <form action={toggleChecklistItem} className="flex min-w-0 flex-1">
                      <input type="hidden" name="id" value={item.id} />
                      <input type="hidden" name="task_id" value={task.id} />
                      <input type="hidden" name="is_done" value={(!item.is_done).toString()} />
                      <button type="submit" disabled={!canEdit} className="flex min-h-11 min-w-0 flex-1 items-center gap-3 text-left disabled:cursor-default">
                        <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md border-2 ${item.is_done ? "border-forest-600 bg-forest-600 text-white" : "border-line bg-white text-transparent"}`}>
                          <Icon name="check" className="h-4 w-4" />
                        </span>
                        <span className={`text-[15px] ${item.is_done ? "text-muted line-through" : ""}`}>{item.label}</span>
                      </button>
                    </form>
                    {canEdit ? (
                      <form action={removeChecklistItem}>
                        <input type="hidden" name="id" value={item.id} />
                        <input type="hidden" name="task_id" value={task.id} />
                        <button type="submit" className="rounded-lg px-2 py-2 text-xs text-muted hover:bg-paper hover:text-red-700" aria-label={`Remove "${item.label}"`}>Remove</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No checklist steps.</Empty>
            )}
            {canEdit ? (
              <div className="border-t border-line p-3">
                <ActionForm action={addChecklistItem} resetOnSuccess>
                  <input type="hidden" name="task_id" value={task.id} />
                  <div className="flex gap-2">
                    <input className="input" name="label" placeholder="Add a step" aria-label="New checklist step" maxLength={300} />
                    <SubmitButton className="btn shrink-0">Add</SubmitButton>
                  </div>
                </ActionForm>
              </div>
            ) : null}
          </Card>

          <Card title={<>Comments <span className="font-normal text-muted">· {comments.data?.length ?? 0}</span></>} padded={false}>
            {comments.data?.length ? (
              <ul className="divide-y divide-line">
                {comments.data.map((c) => (
                  <li key={c.id} className="px-4 py-3">
                    <p className="text-xs text-muted"><span className="font-semibold text-ink">{nameOf(c.author_id)}</span> · {formatDateTime(c.created_at)}</p>
                    <p className="mt-1 whitespace-pre-wrap text-[15px]">{c.body}</p>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No comments yet.</Empty>
            )}
            <div className="border-t border-line p-3">
              <ActionForm action={addComment} resetOnSuccess>
                <input type="hidden" name="task_id" value={task.id} />
                <textarea className="input" name="body" rows={2} placeholder="Write a comment…" aria-label="Comment" />
                <div className="mt-2"><SubmitButton className="btn">Add comment</SubmitButton></div>
              </ActionForm>
            </div>
          </Card>

          <Card title={<>Attachments <span className="font-normal text-muted">· {attachments.data?.length ?? 0}</span></>} padded={false}>
            {attachments.data?.length ? (
              <ul className="divide-y divide-line">
                {attachments.data.map((a) => (
                  <li key={a.id} className="flex items-center gap-3 px-4 py-2">
                    <Icon name="clip" className="h-4 w-4 text-muted" />
                    <a className="link min-w-0 flex-1 truncate py-2 text-sm" href={`/tasks/${task.id}/attachments/${a.id}`}>{a.file_name}</a>
                    <span className="hidden text-xs text-muted sm:inline">{nameOf(a.uploaded_by)} · {formatDateTime(a.created_at)}</span>
                    {a.uploaded_by === viewer.id || canEdit ? (
                      <form action={removeTaskAttachment}>
                        <input type="hidden" name="id" value={a.id} />
                        <button type="submit" className="rounded-lg px-2 py-2 text-xs text-muted hover:bg-paper hover:text-red-700">Remove</button>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>No files attached.</Empty>
            )}
            <div className="border-t border-line p-3">
              <ActionForm action={uploadTaskAttachment} resetOnSuccess>
                <input type="hidden" name="task_id" value={task.id} />
                <div className="flex flex-wrap items-center gap-2">
                  <input type="file" name="file" aria-label="File to attach" className="min-w-0 flex-1 text-sm file:mr-3 file:min-h-10 file:rounded-lg file:border file:border-line file:bg-white file:px-3 file:text-sm file:font-semibold" />
                  <SubmitButton className="btn shrink-0">Attach</SubmitButton>
                </div>
                <p className="hint">Up to 25 MB. Files are private to people who can see this task.</p>
              </ActionForm>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card title="About this task">
            <dl className="space-y-3 text-sm">
              <div><dt className="eyebrow">Accountable owner</dt><dd className="font-semibold">{task.owner?.full_name || task.owner?.email}</dd></div>
              {task.kind === "shared" ? <div><dt className="eyebrow">Department</dt><dd>{task.department?.name}</dd></div> : null}
              <div>
                <dt className="eyebrow">Due</dt>
                <dd className={overdue ? "font-semibold text-red-700" : ""}>{task.due_date ? formatDate(task.due_date, { weekday: true }) : "No due date"}</dd>
              </div>
              {task.status === "done" ? (
                <div><dt className="eyebrow">Completed</dt><dd>{formatDateTime(task.completed_at)} by {task.completer?.full_name || task.completer?.email || "—"}</dd></div>
              ) : null}
              <div><dt className="eyebrow">Created</dt><dd>{formatDateTime(task.created_at)}{task.series_id ? " · automatically" : ` by ${task.creator?.full_name || task.creator?.email || "—"}`}</dd></div>
              <div>
                <dt className="eyebrow">Notifications</dt>
                <dd>
                  Owner reminded {remindDays === 0 ? "on the due date" : `${remindDays} day${remindDays === 1 ? "" : "s"} before`}.
                  {task.kind === "shared" ? (task.escalate_overdue ? " Department lead notified when overdue." : " No overdue escalation.") : ""}
                </dd>
              </div>
            </dl>
          </Card>

          {task.sop || task.freight_estimate_id || task.external_link_label || task.external_link_url ? (
            <Card title="Linked records">
              <ul className="space-y-3 text-sm">
                {task.sop ? (
                  <li><span className="eyebrow block">SOP</span><Link className="link" href={`/sops/${task.sop.id}`}>{task.sop.title}</Link></li>
                ) : null}
                {task.freight_estimate_id ? (
                  <li>
                    <span className="eyebrow block">Freight estimate</span>
                    {estimate.data ? (
                      <Link className="link" href={`/freight/${estimate.data.id}`}>{estimate.data.name}{estimate.data.reference ? ` (${estimate.data.reference})` : ""}</Link>
                    ) : (
                      <span className="text-muted">A freight estimate is linked. You need freight access to open it.</span>
                    )}
                  </li>
                ) : null}
                {task.external_link_label || task.external_link_url ? (
                  <li>
                    <span className="eyebrow block">NECS / QuickBooks record</span>
                    {task.external_link_url ? (
                      <a className="link" href={task.external_link_url} target="_blank" rel="noopener noreferrer">{task.external_link_label || task.external_link_url}</a>
                    ) : (
                      task.external_link_label
                    )}
                  </li>
                ) : null}
              </ul>
            </Card>
          ) : null}

          {task.series ? (
            <Card title="Recurring task">
              <p className="text-sm">{describeRecurrence(task.series)}</p>
              <p className="mt-2 text-sm text-muted">
                This occurrence was scheduled for <span className="font-semibold text-ink">{formatDate(task.scheduled_for)}</span>.
                {rescheduled ? <> It was rescheduled to <span className="font-semibold text-ink">{formatDate(task.due_date)}</span>; the series is unchanged.</> : null}
              </p>
              <p className="mt-2 text-sm"><Link className="link" href={`/tasks/recurring/${task.series.id}`}>View the series and its history</Link></p>
            </Card>
          ) : null}

          {canEdit && open ? (
            <Card title={task.series_id ? "Reschedule this occurrence" : "Reschedule"}>
              <ActionForm action={rescheduleTask}>
                <input type="hidden" name="id" value={task.id} />
                <div className="flex gap-2">
                  <input className="input" type="date" name="due_date" defaultValue={task.due_date ?? ""} aria-label="New due date" required />
                  <SubmitButton className="btn shrink-0">Move</SubmitButton>
                </div>
                {task.series_id ? <p className="hint">Only this occurrence moves. Later occurrences keep the series schedule.</p> : null}
              </ActionForm>
            </Card>
          ) : null}

          <Card title="History" padded={false}>
            <ul className="divide-y divide-line">
              {(events.data ?? []).map((e) => (
                <li key={e.id} className="px-4 py-2 text-[13px]">
                  <span className="text-ink">
                    {e.event === "created_from_series" ? EVENT_LABELS[e.event] : <><span className="font-semibold">{nameOf(e.actor_id)}</span> {describeEvent(e)}</>}
                  </span>
                  <span className="block text-[11px] text-muted">{formatDateTime(e.created_at)}</span>
                </li>
              ))}
            </ul>
          </Card>

          {canManage ? (
            <form action={deleteTask}>
              <input type="hidden" name="id" value={task.id} />
              <details>
                <summary className="cursor-pointer text-sm text-muted">Delete this task…</summary>
                <p className="my-2 text-xs text-muted">Deleting removes the task, its comments, files and history. Prefer “Cancel task” to keep a record.</p>
                <button type="submit" className="btn btn-danger btn-sm">Delete permanently</button>
              </details>
            </form>
          ) : null}
        </div>
      </div>
    </>
  );
}
