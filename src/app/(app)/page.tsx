import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { addDays, arubaToday, formatDate, formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { OPEN_STATUSES } from "@/modules/tasks/labels";
import { canEditTask, sortTasks, type TaskListRow } from "@/modules/tasks/queries";
import { TaskList } from "@/modules/tasks/task-list";

export const metadata = { title: "My Work" };

const TASK_COLUMNS =
  "id, title, kind, owner_id, department_id, due_date, priority, status, series_id, scheduled_for, escalate_overdue, is_demo, " +
  "owner:profiles!tasks_owner_id_fkey(id, full_name, email), department:departments(id, name)";

export default async function MyWorkPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const today = arubaToday();
  const deptIds = viewer.departments.map((d) => d.id);

  const [mine, notifications, sopUpdates, acks, teamOverdue] = await Promise.all([
    supabase.from("tasks").select(TASK_COLUMNS).eq("owner_id", viewer.id).in("status", OPEN_STATUSES).limit(300),
    supabase.from("notifications").select("id, kind, title, body, link, created_at").is("read_at", null).order("created_at", { ascending: false }).limit(8),
    // SOP updates relevant to the viewer's team: their departments plus company-wide SOPs.
    supabase
      .from("sops")
      .select("id, title, department_id, published_at, current_version_id, department:departments(name), current:sop_versions!sops_current_version_fk(id, version_no, requires_ack, change_summary)")
      .eq("status", "published")
      .gte("published_at", new Date(Date.now() - 30 * 86_400_000).toISOString())
      .order("published_at", { ascending: false })
      .limit(50),
    supabase.from("sop_acknowledgments").select("sop_version_id").eq("user_id", viewer.id),
    viewer.isAdmin
      ? supabase.from("tasks").select(TASK_COLUMNS).eq("kind", "shared").in("status", OPEN_STATUSES).lt("due_date", today).neq("owner_id", viewer.id).limit(50)
      : viewer.ledDepartmentIds.length
      ? supabase.from("tasks").select(TASK_COLUMNS).in("department_id", viewer.ledDepartmentIds).in("status", OPEN_STATUSES).lt("due_date", today).neq("owner_id", viewer.id).limit(50)
      : Promise.resolve({ data: [] }),
  ]);

  const tasks = sortTasks((mine.data ?? []) as unknown as TaskListRow[]);
  const overdue = tasks.filter((t) => t.due_date && t.due_date < today);
  const dueToday = tasks.filter((t) => t.due_date === today);
  const upcomingEnd = addDays(today, 14);
  const upcoming = tasks.filter((t) => t.due_date && t.due_date > today && t.due_date <= upcomingEnd);
  const later = tasks.filter((t) => !t.due_date || t.due_date > upcomingEnd);

  const acked = new Set((acks.data ?? []).map((a) => a.sop_version_id));
  const relevantSops = (sopUpdates.data ?? []).filter((s) => !s.department_id || deptIds.includes(s.department_id)).slice(0, 6);
  const team = sortTasks((teamOverdue.data ?? []) as unknown as TaskListRow[]);
  const canComplete = (t: TaskListRow) => canEditTask(viewer, t);

  const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "America/Aruba", hour: "numeric", hour12: false }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const summary = [
    overdue.length ? `${overdue.length} overdue` : null,
    `${dueToday.length} due today`,
    `${upcoming.length} coming up`,
  ].filter(Boolean).join(" · ");

  const sections: [string, TaskListRow[], string, string?][] = [
    ["Overdue", overdue, "Nothing overdue.", "text-red-700"],
    ["Due today", dueToday, "Nothing due today."],
    ["Upcoming (next 14 days)", upcoming, "Nothing in the next two weeks."],
  ];

  return (
    <>
      <PageHeader
        eyebrow={`${formatDate(today, { weekday: true })} · Aruba time`}
        title={`${greeting}, ${viewer.fullName.split(" ")[0]}`}
        subtitle={summary}
      />
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {sections.map(([title, rows, empty, tone]) =>
            title === "Overdue" && rows.length === 0 ? null : (
              <Card
                key={title}
                padded={false}
                title={<span className={tone}>{title} <span className="font-normal text-muted">· {rows.length}</span></span>}
              >
                {rows.length ? <TaskList tasks={rows} today={today} viewerId={viewer.id} showOwner={false} canComplete={canComplete} /> : <Empty>{empty}</Empty>}
              </Card>
            ),
          )}
          {later.length ? (
            <Card padded={false} title={<>Later or no due date <span className="font-normal text-muted">· {later.length}</span></>}>
              <TaskList tasks={later.slice(0, 10)} today={today} viewerId={viewer.id} showOwner={false} canComplete={canComplete} />
              {later.length > 10 ? <p className="border-t border-line px-4 py-2 text-sm"><Link className="link" href="/tasks">See all my tasks</Link></p> : null}
            </Card>
          ) : null}
          {team.length ? (
            <Card
              padded={false}
              title={<>{viewer.isAdmin ? "Overdue across the company" : "Overdue in my team"} <span className="font-normal text-muted">· {team.length}</span></>}
              action={<Link className="link text-sm" href="/tasks?scope=all&due=overdue">View all</Link>}
            >
              <TaskList tasks={team.slice(0, 8)} today={today} viewerId={viewer.id} canComplete={canComplete} />
            </Card>
          ) : null}
        </div>

        <div className="space-y-5">
          <Card
            padded={false}
            title={<>Unread reminders <span className="font-normal text-muted">· {notifications.data?.length ?? 0}</span></>}
            action={<Link className="link text-sm" href="/notifications">All</Link>}
          >
            {notifications.data?.length ? (
              <ul className="divide-y divide-line">
                {notifications.data.map((n) => (
                  <li key={n.id}>
                    <Link href={`/notifications/open/${n.id}`} prefetch={false} className="block px-4 py-2.5 hover:bg-paper">
                      <span className="block text-sm font-semibold">{n.title}</span>
                      {n.body ? <span className="block truncate text-xs text-muted">{n.body}</span> : null}
                      <span className="block text-[11px] text-muted">{formatDateTime(n.created_at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            ) : (
              <Empty>You are up to date.</Empty>
            )}
          </Card>

          <Card padded={false} title="SOP updates for my team" action={<Link className="link text-sm" href="/sops">Library</Link>}>
            {relevantSops.length ? (
              <ul className="divide-y divide-line">
                {relevantSops.map((s) => {
                  const needsAck = !!s.current?.requires_ack && !acked.has(s.current.id);
                  return (
                    <li key={s.id}>
                      <Link href={`/sops/${s.id}`} className="block px-4 py-2.5 hover:bg-paper">
                        <span className="block text-sm font-semibold">{s.title}</span>
                        <span className="flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>{s.department?.name ?? "Company-wide"} · v{s.current?.version_no} · {formatDate(s.published_at?.slice(0, 10))}</span>
                          {needsAck ? <span className="badge badge-orange">Acknowledgment needed</span> : null}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty>No SOP changes in the last 30 days.</Empty>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
