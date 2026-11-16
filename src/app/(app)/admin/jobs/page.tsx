import { Card, Empty, Notice, PageHeader, TableWrap } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDate, formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { runJobsNow } from "@/modules/admin/actions";

export const metadata = { title: "Background jobs" };

const JOBS: Record<string, [string, string]> = {
  recurring_tasks: ["Recurring tasks", "Creates the next occurrence of each active recurring task."],
  due_reminders: ["Due reminders", "Reminds owners before a task’s due date."],
  overdue_escalations: ["Overdue escalations", "Tells the department lead when a task with escalation enabled is overdue."],
};
const STATUS_BADGE: Record<string, string> = {
  success: "badge-green",
  partial: "badge-amber",
  failed: "badge-red",
  skipped: "badge-gray",
  running: "badge-blue",
};

export default async function JobsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const { data: runs } = await supabase.from("job_runs").select("*").order("id", { ascending: false }).limit(90);
  const problems = (runs ?? []).filter((r) => r.status === "failed" || r.status === "partial");
  const last = runs?.[0];
  const stale = !last || Date.now() - new Date(last.started_at).getTime() > 60 * 60 * 1000;

  return (
    <>
      <PageHeader
        title="Background jobs"
        subtitle="Run automatically every 15 minutes. Running them again is always safe: tasks and reminders are never created twice."
        actions={<form action={runJobsNow}><button className="btn btn-primary" type="submit">Run now</button></form>}
      />
      {stale ? (
        <div className="mb-4">
          <Notice tone="red">
            No job has run in the last hour{last ? ` (last run ${formatDateTime(last.started_at)})` : ""}. Check the schedule; see docs/OPERATIONS.md.
          </Notice>
        </div>
      ) : null}
      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {Object.entries(JOBS).map(([key, [title, text]]) => {
          const latest = (runs ?? []).find((r) => r.job_name === key);
          return (
            <div key={key} className="card p-4">
              <p className="eyebrow">{title}</p>
              <p className="mt-1 text-sm text-muted">{text}</p>
              <p className="mt-2 text-sm">
                {latest ? (
                  <>
                    <span className={`badge ${STATUS_BADGE[latest.status]}`}>{latest.status}</span>{" "}
                    <span className="text-muted">{formatDateTime(latest.started_at)}</span>
                  </>
                ) : (
                  <span className="text-muted">Has not run yet</span>
                )}
              </p>
            </div>
          );
        })}
      </div>

      {problems.length ? (
        <Card title="Failures in recent runs" className="mb-5" padded={false}>
          <ul className="divide-y divide-line">
            {problems.slice(0, 10).map((r) => (
              <li key={r.id} className="px-4 py-3 text-sm">
                <span className="font-semibold">{JOBS[r.job_name]?.[0] ?? r.job_name}</span> · {formatDateTime(r.started_at)}
                <pre className="mt-1 whitespace-pre-wrap break-words text-xs text-red-800">{r.error ?? JSON.stringify((r.detail as { failures?: unknown })?.failures, null, 1)}</pre>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      <Card title="Recent runs" padded={false}>
        {runs?.length ? (
          <TableWrap>
            <table className="table">
              <thead><tr><th>Started (Aruba)</th><th>Job</th><th>Trigger</th><th>For date</th><th>Status</th><th className="num">Created</th><th>Detail</th></tr></thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="whitespace-nowrap">{formatDateTime(r.started_at)}</td>
                    <td>{JOBS[r.job_name]?.[0] ?? r.job_name}</td>
                    <td>{r.triggered_by}</td>
                    <td className="whitespace-nowrap">{formatDate(r.run_date)}</td>
                    <td><span className={`badge ${STATUS_BADGE[r.status]}`}>{r.status}</span></td>
                    <td className="num">{r.created_count}</td>
                    <td className="max-w-xs break-words text-xs text-muted">{r.error ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <Empty>No runs recorded yet.</Empty>
        )}
      </Card>
    </>
  );
}
