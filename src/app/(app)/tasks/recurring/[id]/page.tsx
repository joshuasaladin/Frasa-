import { notFound } from "next/navigation";
import { Card, Empty, Notice, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { arubaToday, formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { setSeriesActive, updateSeries } from "@/modules/tasks/actions";
import { describeRecurrence } from "@/modules/tasks/labels";
import { canEditTask, getTaskFormOptions, sortTasks, type TaskListRow } from "@/modules/tasks/queries";
import { TaskForm } from "@/modules/tasks/task-form";
import { TaskList } from "@/modules/tasks/task-list";

export const metadata = { title: "Recurring task" };

export default async function SeriesPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const { data: series } = await supabase.from("task_series").select("*, department:departments(id, name)").eq("id", id).maybeSingle();
  if (!series) notFound();

  const { data: occurrences } = await supabase
    .from("tasks")
    .select("id, title, kind, owner_id, department_id, due_date, priority, status, series_id, scheduled_for, escalate_overdue, is_demo, owner:profiles!tasks_owner_id_fkey(id, full_name, email), department:departments(id, name)")
    .eq("series_id", id)
    .order("occurrence_no", { ascending: false })
    .limit(60);
  const rows = (occurrences ?? []) as unknown as TaskListRow[];

  const canManage =
    series.kind === "personal"
      ? series.owner_id === viewer.id
      : viewer.isAdmin || (!!series.department_id && viewer.ledDepartmentIds.includes(series.department_id));
  const options = canManage ? await getTaskFormOptions(viewer) : null;
  if (options && series.kind === "shared" && series.department && !options.departments.some((d) => d.id === series.department_id)) {
    options.departments.push(series.department);
  }

  return (
    <>
      <PageHeader
        back={{ href: "/tasks/recurring", label: "Recurring tasks" }}
        title={series.title}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className={`badge ${series.is_active ? "badge-green" : "badge-gray"}`}>{series.is_active ? "Active" : "Paused"}</span>
            <span className="badge badge-gray">{series.kind === "personal" ? "Personal" : `Shared · ${series.department?.name}`}</span>
            {series.is_demo ? <span className="badge badge-amber">Demo data</span> : null}
          </span>
        }
        actions={
          canManage ? (
            <form action={setSeriesActive}>
              <input type="hidden" name="id" value={series.id} />
              <input type="hidden" name="active" value={(!series.is_active).toString()} />
              <button className="btn" type="submit">{series.is_active ? "Pause" : "Resume"}</button>
            </form>
          ) : null
        }
      />
      <div className="mb-5"><Notice tone="blue">{describeRecurrence(series)}</Notice></div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Occurrences" padded={false}>
          {rows.length ? (
            <TaskList tasks={sortTasks(rows).reverse()} today={arubaToday()} viewerId={viewer.id} back={`/tasks/recurring/${series.id}`} canComplete={(t) => canEditTask(viewer, t)} />
          ) : (
            <Empty>
              No occurrences yet. The first one is created shortly before {formatDate(series.start_date)}.
            </Empty>
          )}
          <p className="border-t border-line px-4 py-2 text-xs text-muted">
            Each occurrence keeps its own status, comments and history. Rescheduling one occurrence does not change the series.
          </p>
        </Card>

        {canManage && options ? (
          <Card title="Series settings">
            <TaskForm
              mode="series-edit"
              action={updateSeries}
              options={options}
              viewerId={viewer.id}
              canCreateSharedSeries
              values={{
                id: series.id,
                kind: series.kind,
                title: series.title,
                description: series.description,
                department_id: series.department_id ?? "",
                owner_id: series.owner_id,
                due_date: "",
                priority: series.priority,
                sop_id: series.sop_id ?? "",
                freight_estimate_id: "",
                external_link_label: "",
                external_link_url: "",
                remind_days_before: series.remind_days_before?.toString() ?? "",
                escalate_overdue: series.escalate_overdue,
                checklist: ((series.checklist_template as string[]) ?? []).join("\n"),
                frequency: series.frequency,
                interval_count: series.interval_count.toString(),
                schedule_mode: series.schedule_mode,
                start_date: series.start_date,
                end_date: series.end_date ?? "",
                weekdays: series.weekdays ?? [],
              }}
            />
          </Card>
        ) : null}
      </div>
    </>
  );
}
