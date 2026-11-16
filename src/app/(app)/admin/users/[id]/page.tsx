import { notFound } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, PageHeader } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { sendPasswordLink, updateUser } from "@/modules/admin/actions";
import { UserFields } from "@/modules/admin/user-fields";
import { describeAudit } from "@/modules/admin/audit";

export const metadata = { title: "User" };

export default async function UserPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireAdmin();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const supabase = await createClient();
  const [{ data: user }, { data: departments }, { data: memberships }, { data: audit }, { data: people }] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", id).maybeSingle(),
    supabase.from("departments").select("id, name").eq("is_active", true).order("name"),
    supabase.from("department_members").select("department_id, is_lead").eq("user_id", id),
    supabase.from("audit_log").select("*").eq("entity_type", "profile").eq("entity_id", id).order("created_at", { ascending: false }).limit(30),
    supabase.from("profiles").select("id, full_name, email"),
  ]);
  if (!user) notFound();
  const nameOf = (uid: string | null) => {
    const p = people?.find((x) => x.id === uid);
    return p ? p.full_name || p.email : "System";
  };

  return (
    <>
      <PageHeader title={user.full_name || user.email} subtitle={user.email} back={{ href: "/admin/users", label: "Users" }} />
      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Access">
          <ActionForm action={updateUser} className="space-y-4">
            <input type="hidden" name="id" value={user.id} />
            <UserFields
              departments={departments ?? []}
              values={{ full_name: user.full_name, role: user.role, freight_access: user.freight_access, memberships: memberships ?? [] }}
            />
            <label className="flex min-h-10 items-start gap-2 text-sm">
              <input type="checkbox" name="is_active" defaultChecked={user.is_active} className="mt-1" disabled={user.id === viewer.id} />
              {user.id === viewer.id ? <input type="hidden" name="is_active" value="on" /> : null}
              <span>
                <span className="font-semibold">Active</span>
                <span className="block text-xs text-muted">Untick to deactivate: the person can no longer sign in or read any data. Their tasks and history are kept.</span>
              </span>
            </label>
            <SubmitButton>Save</SubmitButton>
          </ActionForm>
        </Card>
        <div className="space-y-5">
          <Card title="Password">
            <ActionForm action={sendPasswordLink}>
              <input type="hidden" name="id" value={user.id} />
              <p className="mb-3 text-sm text-muted">Sends an email with a link to choose a new password. Use it if an invitation expired or a password was forgotten.</p>
              <SubmitButton className="btn">Send password link</SubmitButton>
            </ActionForm>
          </Card>
          <Card title="Access history" padded={false}>
            <ul className="divide-y divide-line">
              {(audit ?? []).map((a) => (
                <li key={a.id} className="px-4 py-2 text-[13px]">
                  <span><span className="font-semibold">{nameOf(a.actor_id)}</span> · {describeAudit(a.action, a.detail)}</span>
                  <span className="block text-[11px] text-muted">{formatDateTime(a.created_at)}</span>
                </li>
              ))}
              {!audit?.length ? <li className="px-4 py-4 text-sm text-muted">No changes recorded.</li> : null}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
