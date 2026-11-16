import { notFound } from "next/navigation";
import { Card, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { updateTask } from "@/modules/tasks/actions";
import { canEditTask, canManageTask, getTask, getTaskFormOptions } from "@/modules/tasks/queries";
import { TaskForm } from "@/modules/tasks/task-form";

export const metadata = { title: "Edit task" };

export default async function EditTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  const task = await getTask(id);
  if (!task || !canEditTask(viewer, task)) notFound();
  const options = await getTaskFormOptions(viewer);
  // An owner who is not a lead can edit the task but not hand it to someone else.
  if (task.kind === "shared" && !canManageTask(viewer, task) && task.department_id) {
    options.departments = options.departments.filter((d) => d.id === task.department_id);
    options.assignable = { [task.department_id]: [task.owner_id] };
    if (!options.departments.length && task.department) options.departments = [task.department];
  }
  return (
    <>
      <PageHeader title="Edit task" back={{ href: `/tasks/${task.id}`, label: "Back to task" }} />
      <Card className="max-w-3xl">
        <TaskForm
          mode="task-edit"
          action={updateTask}
          options={options}
          viewerId={viewer.id}
          hiddenFreightLink={!!task.freight_estimate_id && !viewer.canViewFreight}
          values={{
            id: task.id,
            kind: task.kind,
            title: task.title,
            description: task.description,
            department_id: task.department_id ?? "",
            owner_id: task.owner_id,
            due_date: task.due_date ?? "",
            priority: task.priority,
            sop_id: task.sop_id ?? "",
            freight_estimate_id: task.freight_estimate_id ?? "",
            external_link_label: task.external_link_label,
            external_link_url: task.external_link_url,
            remind_days_before: task.remind_days_before?.toString() ?? "",
            escalate_overdue: task.escalate_overdue,
            checklist: "",
          }}
        />
      </Card>
    </>
  );
}
