import Link from "next/link";
import { Card, Empty, PageHeader, TableWrap } from "@/components/ui";
import { requireAdmin } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { AUDIT_GROUPS, describeAudit } from "@/modules/admin/audit";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ group?: string }> }) {
  await requireAdmin();
  const { group } = await searchParams;
  const supabase = await createClient();
  let query = supabase.from("audit_log").select("*").order("id", { ascending: false }).limit(200);
  if (group && AUDIT_GROUPS[group]) query = query.like("action", `${group}.%`);
  const [{ data: rows }, { data: people }] = await Promise.all([query, supabase.from("profiles").select("id, full_name, email")]);
  const nameOf = (uid: string | null) => {
    const p = people?.find((x) => x.id === uid);
    return p ? p.full_name || p.email : "System";
  };
  const linkFor = (type: string, id: string | null) =>
    !id ? null : type === "profile" ? `/admin/users/${id}` : type === "sop" ? `/sops/${id}` : type === "freight_estimate" ? `/freight/${id}` : null;

  return (
    <>
      <PageHeader title="Audit log" subtitle="Role and access changes, SOP publication, and edits to saved freight estimates. Entries cannot be edited or deleted from the app." />
      <div className="mb-4 flex flex-wrap gap-2">
        <Link href="/admin/audit" className={`btn btn-sm ${!group ? "btn-primary" : ""}`}>All</Link>
        {Object.entries(AUDIT_GROUPS).map(([key, label]) => (
          <Link key={key} href={`/admin/audit?group=${key}`} className={`btn btn-sm ${group === key ? "btn-primary" : ""}`}>{label}</Link>
        ))}
      </div>
      <Card padded={false}>
        {rows?.length ? (
          <TableWrap>
            <table className="table">
              <thead><tr><th>When (Aruba)</th><th>Who</th><th>What</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const href = linkFor(r.entity_type, r.entity_id);
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap">{formatDateTime(r.created_at)}</td>
                      <td className="whitespace-nowrap">{nameOf(r.actor_id)}</td>
                      <td>
                        {describeAudit(r.action, r.detail)}
                        {href ? <> · <Link className="link" href={href}>open</Link></> : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TableWrap>
        ) : (
          <Empty>Nothing recorded yet.</Empty>
        )}
      </Card>
    </>
  );
}
