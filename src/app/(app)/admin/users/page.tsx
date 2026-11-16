import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader, TableWrap } from "@/components/ui";
import { FREIGHT_ACCESS_LABELS, requireAdmin, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inviteUser } from "@/modules/admin/actions";
import { UserFields } from "@/modules/admin/user-fields";

export const metadata = { title: "Users" };

export default async function UsersPage() {
  await requireAdmin();
  const supabase = await createClient();
  const [{ data: users }, { data: departments }, { data: members }] = await Promise.all([
    supabase.from("profiles").select("*").order("is_active", { ascending: false }).order("full_name"),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("department_members").select("user_id, is_lead, departments(name)"),
  ]);

  return (
    <>
      <PageHeader title="Users" subtitle="Accounts are invite-only. Role decides what someone can manage; freight access is granted separately." />
      <div className="grid gap-5 lg:grid-cols-3">
        <Card title={`Employees · ${users?.length ?? 0}`} padded={false} className="lg:col-span-2">
          <TableWrap>
            <table className="table">
              <thead>
                <tr><th>Name</th><th>Role</th><th>Departments</th><th>Freight</th><th>Status</th></tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => (
                  <tr key={u.id}>
                    <td>
                      <Link className="link font-semibold" href={`/admin/users/${u.id}`}>{u.full_name || u.email}</Link>
                      <span className="block text-xs text-muted">{u.email}</span>
                    </td>
                    <td>{ROLE_LABELS[u.role]}</td>
                    <td className="text-[13px]">
                      {(members ?? []).filter((m) => m.user_id === u.id).map((m) => `${m.departments?.name}${m.is_lead && u.role === "department_lead" ? " (lead)" : ""}`).join(", ") || <span className="text-muted">None</span>}
                    </td>
                    <td>{FREIGHT_ACCESS_LABELS[u.freight_access]}</td>
                    <td>
                      <span className={`badge ${u.is_active ? "badge-green" : "badge-gray"}`}>{u.is_active ? "Active" : "Deactivated"}</span>
                      {u.is_demo ? <span className="badge badge-amber ml-1">Demo</span> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>

        <Card title="Invite an employee">
          <ActionForm action={inviteUser} resetOnSuccess className="space-y-4">
            <label className="block">
              <span className="label">Work email</span>
              <input className="input" type="email" name="email" required />
            </label>
            <UserFields departments={departments ?? []} values={{ full_name: "", role: "employee", freight_access: "none", memberships: [] }} />
            <SubmitButton>Send invitation</SubmitButton>
          </ActionForm>
        </Card>
      </div>

      <Card title="What each role can do" className="mt-5" padded={false}>
        <TableWrap>
          <table className="table">
            <thead><tr><th>Area</th><th>Employee</th><th>Department lead (in departments they lead)</th><th>Admin</th></tr></thead>
            <tbody>
              <tr><td className="font-semibold">Personal to-dos</td><td colSpan={3}>Private to their owner. Nobody else, including admins, sees them in Frasa HQ.</td></tr>
              <tr><td className="font-semibold">Shared tasks</td><td>See their departments’ tasks; create tasks they own; update tasks they own; comment and attach files.</td><td>Also assign and reassign within the department, edit or delete any of its tasks, set up recurring tasks, hand a task to another department’s lead, and receive overdue escalations.</td><td>Everything, in every department.</td></tr>
              <tr><td className="font-semibold">SOP library</td><td>Read published SOPs and acknowledge them. Draft revisions of SOPs they are the named owner of.</td><td>Create, draft, publish and archive the department’s SOPs; see who has acknowledged.</td><td>Everything, including company-wide SOPs.</td></tr>
              <tr><td className="font-semibold">Freight estimates</td><td colSpan={3}>Not tied to role. “View” can open and export; “edit” can also save, duplicate and archive. Without access, estimates cannot be opened by link or through the API.</td></tr>
              <tr><td className="font-semibold">Administration</td><td>—</td><td>—</td><td>Users, departments, settings, background jobs, audit log.</td></tr>
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
