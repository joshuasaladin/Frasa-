import { Card, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { createTask } from "@/modules/tasks/actions";
import { getTaskFormOptions } from "@/modules/tasks/queries";
import { TaskForm } from "@/modules/tasks/task-form";
import { isUuid } from "@/lib/action";

export const metadata = { title: "New task" };

export default async function NewTaskPage({ searchParams }: { searchParams: Promise<{ sop?: string; freight?: string }> }) {
  const viewer = await requireViewer();
  const params = await searchParams;
  const options = await getTaskFormOptions(viewer);
  return (
    <>
      <PageHeader title="New task" back={{ href: "/tasks", label: "Tasks" }} />
      <Card className="max-w-3xl">
        <TaskForm
          mode="task-new"
          action={createTask}
          options={options}
          viewerId={viewer.id}
          values={{
            kind: "personal",
            title: "",
            description: "",
            department_id: viewer.departments.length === 1 ? viewer.departments[0].id : "",
            owner_id: viewer.id,
            due_date: "",
            priority: "normal",
            sop_id: isUuid(params.sop) ? params.sop : "",
            freight_estimate_id: isUuid(params.freight) ? params.freight : "",
            external_link_label: "",
            external_link_url: "",
            remind_days_before: "",
            escalate_overdue: options.defaultEscalate,
            checklist: "",
          }}
        />
      </Card>
    </>
  );
}
