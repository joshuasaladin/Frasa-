import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { saveDepartment, saveSopCategory } from "@/modules/admin/actions";

export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: departments }, { data: members }, { data: categories }] = await Promise.all([
    supabase.from("departments").select("*").order("name"),
    supabase.from("department_members").select("department_id, is_lead, profiles(full_name, email, role, is_active)"),
    supabase.from("sop_categories").select("*").order("name"),
  ]);
  return (
    <>
      <PageHeader title="Departments" subtitle="Departments group shared tasks, SOPs and the people who can see them. Members and leads are set on each user." />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Departments" padded={false}>
          <ul className="divide-y divide-line">
            {(departments ?? []).map((d) => {
              const people = (members ?? []).filter((m) => m.department_id === d.id && m.profiles?.is_active);
              const leads = people.filter((m) => m.is_lead && m.profiles?.role === "department_lead");
              return (
                <li key={d.id} className="p-4">
                  <ActionForm action={saveDepartment}>
                    <input type="hidden" name="id" value={d.id} />
                    <div className="flex flex-wrap items-center gap-2">
                      <input className="input min-w-0 flex-1" name="name" defaultValue={d.name} aria-label="Department name" required />
                      <label className="flex min-h-10 items-center gap-1.5 text-sm">
                        <input type="checkbox" name="is_active" defaultChecked={d.is_active} /> Active
                      </label>
                      <SubmitButton className="btn btn-sm">Save</SubmitButton>
                    </div>
                  </ActionForm>
                  <p className="mt-2 text-xs text-muted">
                    {people.length} member{people.length === 1 ? "" : "s"} ·{" "}
                    {leads.length
                      ? `Lead: ${leads.map((l) => l.profiles?.full_name || l.profiles?.email).join(", ")}`
                      : "No lead — overdue escalations go to admins"}
                  </p>
                </li>
              );
            })}
          </ul>
          <div className="border-t border-line p-4">
            <ActionForm action={saveDepartment} resetOnSuccess>
              <div className="flex gap-2">
                <input className="input" name="name" placeholder="New department" aria-label="New department name" />
                <SubmitButton className="btn shrink-0">Add</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Card>

        <Card title="SOP categories" padded={false}>
          <ul className="divide-y divide-line">
            {(categories ?? []).map((c) => (
              <li key={c.id} className="p-4">
                <ActionForm action={saveSopCategory}>
                  <input type="hidden" name="id" value={c.id} />
                  <div className="flex gap-2">
                    <input className="input" name="name" defaultValue={c.name} aria-label="Category name" required />
                    <SubmitButton className="btn btn-sm shrink-0">Save</SubmitButton>
                  </div>
                </ActionForm>
              </li>
            ))}
          </ul>
          <div className="border-t border-line p-4">
            <ActionForm action={saveSopCategory} resetOnSuccess>
              <div className="flex gap-2">
                <input className="input" name="name" placeholder="New category" aria-label="New category name" />
                <SubmitButton className="btn shrink-0">Add</SubmitButton>
              </div>
            </ActionForm>
          </div>
        </Card>
      </div>
    </>
  );
}
