import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { arubaToday } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { canEditTask, sortTasks, type TaskListRow } from "@/modules/tasks/queries";
import { TaskList } from "@/modules/tasks/task-list";

export const metadata = { title: "Search" };

const like = (term: string) => `%${term.replace(/[%_\\]/g, "\\$&")}%`;

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const viewer = await requireViewer();
  const q = ((await searchParams).q ?? "").trim().slice(0, 100);
  const terms = q.toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  const supabase = await createClient();

  let tasks: TaskListRow[] = [];
  let sops: { id: string; title: string; department: { name: string } | null }[] = [];
  let estimates: { id: string; name: string; reference: string }[] = [];
  if (terms.length) {
    let taskQuery = supabase
      .from("tasks")
      .select("id, title, kind, owner_id, department_id, due_date, priority, status, series_id, scheduled_for, escalate_overdue, is_demo, owner:profiles!tasks_owner_id_fkey(id, full_name, email), department:departments(id, name)")
      .limit(30);
    let sopQuery = supabase.from("sops").select("id, title, department:departments(name)").eq("status", "published").limit(30);
    for (const t of terms) {
      taskQuery = taskQuery.ilike("title", like(t));
      sopQuery = sopQuery.ilike("search_text", like(t));
    }
    const [taskResult, sopResult] = await Promise.all([taskQuery, sopQuery]);
    tasks = sortTasks((taskResult.data ?? []) as unknown as TaskListRow[]);
    sops = sopResult.data ?? [];
    if (viewer.canViewFreight) {
      let freightQuery = supabase.from("freight_estimates").select("id, name, reference").limit(20);
      for (const t of terms) freightQuery = freightQuery.ilike("name", like(t));
      estimates = (await freightQuery).data ?? [];
    }
  }

  return (
    <>
      <PageHeader title="Search" subtitle={q ? `Results for “${q}”` : "Type in the search box above to find tasks and SOPs."} />
      {terms.length ? (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title={`Tasks · ${tasks.length}`} padded={false}>
            {tasks.length ? <TaskList tasks={tasks} today={arubaToday()} viewerId={viewer.id} back={`/search?q=${encodeURIComponent(q)}`} canComplete={(t) => canEditTask(viewer, t)} /> : <Empty>No matching tasks.</Empty>}
          </Card>
          <div className="space-y-5">
            <Card title={`SOPs · ${sops.length}`} padded={false}>
              {sops.length ? (
                <ul className="divide-y divide-line">
                  {sops.map((s) => (
                    <li key={s.id}>
                      <Link href={`/sops/${s.id}`} className="block px-4 py-3 hover:bg-paper">
                        <span className="block text-[15px] font-semibold">{s.title}</span>
                        <span className="text-xs text-muted">{s.department?.name ?? "Company-wide"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <Empty>No matching SOPs.</Empty>
              )}
            </Card>
            {viewer.canViewFreight ? (
              <Card title={`Freight estimates · ${estimates.length}`} padded={false}>
                {estimates.length ? (
                  <ul className="divide-y divide-line">
                    {estimates.map((e) => (
                      <li key={e.id}>
                        <Link href={`/freight/${e.id}`} className="block px-4 py-3 hover:bg-paper">
                          <span className="block text-[15px] font-semibold">{e.name}</span>
                          {e.reference ? <span className="text-xs text-muted">{e.reference}</span> : null}
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <Empty>No matching estimates.</Empty>
                )}
              </Card>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
