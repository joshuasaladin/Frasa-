import { Card, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { arubaToday } from "@/lib/dates";
import { createSeries } from "@/modules/tasks/actions";
import { getTaskFormOptions } from "@/modules/tasks/queries";
import { TaskForm } from "@/modules/tasks/task-form";

export const metadata = { title: "New recurring task" };

export default async function NewSeriesPage() {
  const viewer = await requireViewer();
  const options = await getTaskFormOptions(viewer);
  const canShare = viewer.isAdmin || viewer.ledDepartmentIds.length > 0;
  // Shared series can only be created where the viewer is admin or lead.
  if (!viewer.isAdmin) {
    options.departments = options.departments.filter((d) => viewer.ledDepartmentIds.includes(d.id));
  }
  return (
    <>
      <PageHeader title="New recurring task" back={{ href: "/tasks/recurring", label: "Recurring tasks" }} />
      <Card className="max-w-3xl">
        <TaskForm
          mode="series-new"
          action={createSeries}
          options={options}
          viewerId={viewer.id}
          canCreateSharedSeries={canShare}
          values={{
            kind: "personal",
            title: "",
            description: "",
            department_id: "",
            owner_id: viewer.id,
            due_date: "",
            priority: "normal",
            sop_id: "",
            freight_estimate_id: "",
            external_link_label: "",
            external_link_url: "",
            remind_days_before: "",
            escalate_overdue: options.defaultEscalate,
            checklist: "",
            frequency: "weekly",
            interval_count: "1",
            schedule_mode: "",
            start_date: arubaToday(),
            end_date: "",
            weekdays: [],
          }}
        />
      </Card>
    </>
  );
}
