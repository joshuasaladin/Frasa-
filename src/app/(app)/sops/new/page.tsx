import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Field, PageHeader } from "@/components/ui";
import { createSopAction } from "@/modules/sops/actions";
import { canCreateSops, getSopReferenceData } from "@/modules/sops/queries";

export const metadata = { title: "New SOP · Frasa HQ" };

export default async function NewSopPage() {
  const viewer = await requireViewer();
  if (!canCreateSops(viewer)) notFound();
  const { departments, categories, people } = await getSopReferenceData(await createClient());
  const allowedDepartments = viewer.isAdmin
    ? departments
    : departments.filter((d) => viewer.ledDepartmentIds.includes(d.id));

  return (
    <>
      <PageHeader
        title="New SOP"
        subtitle="Creates a draft. Employees see nothing until you publish it."
        back={{ href: "/sops", label: "SOP library" }}
      />
      <Card className="max-w-2xl">
        <ActionForm action={createSopAction} className="space-y-4">
          <Field label="Title">
            <input name="title" className="input" required minLength={3} maxLength={200} autoFocus />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Department"
              hint={
                viewer.isAdmin
                  ? "A company-wide SOP applies to every employee."
                  : "You can create SOPs for the departments you lead."
              }
            >
              <select
                name="department_id"
                className="input"
                defaultValue={viewer.isAdmin ? "" : (allowedDepartments[0]?.id ?? "")}
              >
                {viewer.isAdmin ? <option value="">Company-wide</option> : null}
                {allowedDepartments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select name="category_id" className="input" defaultValue="">
                <option value="">Uncategorised</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
          </div>
          <Field label="Owner" hint="The person responsible for keeping this procedure correct.">
            <select name="owner_id" className="input" defaultValue={viewer.id}>
              {people.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </Field>
          <SubmitButton>Create draft</SubmitButton>
        </ActionForm>
      </Card>
    </>
  );
}
