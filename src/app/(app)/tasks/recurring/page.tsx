import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { formatDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { shortRecurrence } from "@/modules/tasks/labels";

export const metadata = { title: "Recurring tasks" };

export default async function RecurringPage() {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("task_series")
    .select("id, title, kind, frequency, interval_count, schedule_mode, start_date, end_date, is_active, is_demo, owner_id, owner:profiles!task_series_owner_id_fkey(full_name, email), department:departments(name)")
    .order("is_active", { ascending: false })
    .order("title");
  return (
    <>
      <PageHeader
        title="Recurring tasks"
        back={{ href: "/tasks", label: "Tasks" }}
        subtitle="Each recurring task creates one task per period. Personal ones are yours; shared ones are set up by department leads and admins."
        actions={<Link href="/tasks/recurring/new" className="btn btn-primary">New recurring task</Link>}
      />
      <Card padded={false}>
        {data?.length ? (
          <ul className="divide-y divide-line">
            {data.map((s) => (
              <li key={s.id}>
                <Link href={`/tasks/recurring/${s.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-paper">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-semibold">{s.title}</span>
                    <span className="block text-xs text-muted">
                      {shortRecurrence(s)} · {s.kind === "personal" ? "Personal" : s.department?.name} ·{" "}
                      {s.owner_id === viewer.id ? "Me" : s.owner?.full_name || s.owner?.email} · from {formatDate(s.start_date)}
                      {s.end_date ? ` to ${formatDate(s.end_date)}` : ""}
                    </span>
                  </span>
                  {s.is_demo ? <span className="badge badge-amber">Demo</span> : null}
                  <span className={`badge ${s.is_active ? "badge-green" : "badge-gray"}`}>{s.is_active ? "Active" : "Paused"}</span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <Empty>No recurring tasks yet.</Empty>
        )}
      </Card>
    </>
  );
}
