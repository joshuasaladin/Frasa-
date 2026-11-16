import Link from "next/link";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { arubaToday } from "@/lib/dates";
import { STATUSES, STATUS_LABELS } from "@/modules/tasks/labels";
import { canEditTask, listDepartments, listPeople, listTasks, parseTaskFilters } from "@/modules/tasks/queries";
import { TaskList } from "@/modules/tasks/task-list";

export const metadata = { title: "Tasks" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const viewer = await requireViewer();
  const raw = await searchParams;
  const filters = parseTaskFilters(raw);
  const [tasks, people, departments] = await Promise.all([listTasks(viewer, filters), listPeople(), listDepartments()]);
  const today = arubaToday();
  const qs = new URLSearchParams(Object.entries(raw).filter((e): e is [string, string] => typeof e[1] === "string")).toString();
  const back = qs ? `/tasks?${qs}` : "/tasks";
  const seesTeam = viewer.isAdmin || viewer.departments.length > 0;

  return (
    <>
      <PageHeader
        title="Tasks"
        subtitle={filters.scope === "mine" && !filters.owner ? "Tasks you own." : "Tasks you are allowed to see: your own, your departments', and ones you created."}
        actions={
          <>
            <Link href="/tasks/recurring" className="btn">Recurring</Link>
            <Link href="/tasks/new" className="btn btn-primary">New task</Link>
          </>
        }
      />

      <div className="mb-4 inline-flex rounded-lg border border-line bg-white p-1 text-sm font-semibold">
        <Link href="/tasks" className={`rounded-md px-4 py-2 ${filters.scope === "mine" ? "bg-forest-900 text-white" : "text-muted"}`}>My tasks</Link>
        {seesTeam ? (
          <Link href="/tasks?scope=all" className={`rounded-md px-4 py-2 ${filters.scope === "all" ? "bg-forest-900 text-white" : "text-muted"}`}>Team tasks</Link>
        ) : null}
      </div>

      <form className="card mb-4 grid grid-cols-2 gap-3 p-3 sm:grid-cols-3 lg:grid-cols-6" action="/tasks">
        <input type="hidden" name="scope" value={filters.scope} />
        {filters.scope === "all" ? (
          <label className="block">
            <span className="label">Owner</span>
            <select className="input" name="owner" defaultValue={filters.owner}>
              <option value="">Anyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </label>
        ) : null}
        <label className="block">
          <span className="label">Department</span>
          <select className="input" name="department" defaultValue={filters.department}>
            <option value="">All</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Status</span>
          <select className="input" name="status" defaultValue={filters.status}>
            <option value="open">Not finished</option>
            <option value="any">Any status</option>
            {STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </label>
        <label className="block">
          <span className="label">Due</span>
          <select className="input" name="due" defaultValue={filters.due}>
            <option value="">Any time</option>
            <option value="overdue">Overdue</option>
            <option value="today">Today</option>
            <option value="week">Next 7 days</option>
            <option value="range">Between dates…</option>
          </select>
        </label>
        <label className="block">
          <span className="label">From</span>
          <input className="input" type="date" name="from" defaultValue={filters.from} />
        </label>
        <label className="block">
          <span className="label">To</span>
          <input className="input" type="date" name="to" defaultValue={filters.to} />
        </label>
        <div className="col-span-2 flex items-end gap-2 sm:col-span-3 lg:col-span-6">
          <button className="btn btn-primary btn-sm" type="submit">Apply filters</button>
          <Link className="btn btn-sm" href={filters.scope === "all" ? "/tasks?scope=all" : "/tasks"}>Clear</Link>
          <span className="ml-auto text-sm text-muted">{tasks.length} task{tasks.length === 1 ? "" : "s"}</span>
        </div>
        <p className="col-span-2 text-xs text-muted sm:col-span-3 lg:col-span-6">From / To apply when Due is set to “Between dates”.</p>
      </form>

      <Card padded={false}>
        {tasks.length ? (
          <TaskList tasks={tasks} today={today} viewerId={viewer.id} back={back} canComplete={(t) => canEditTask(viewer, t)} />
        ) : (
          <Empty>No tasks match these filters.</Empty>
        )}
      </Card>
    </>
  );
}
