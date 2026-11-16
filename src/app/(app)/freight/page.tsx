import Link from "next/link";
import { requireFreightAccess } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { Empty, PageHeader, TableWrap } from "@/components/ui";
import { listEstimates } from "@/modules/freight/queries";
import { formatMoney } from "@/modules/freight/format";
import { IncompleteBadge } from "@/modules/freight/results-view";

export const metadata = { title: "Freight calculator" };

export default async function FreightListPage({
  searchParams,
}: {
  searchParams: Promise<{ archived?: string; q?: string }>;
}) {
  const viewer = await requireFreightAccess("view");
  const sp = await searchParams;
  const archived = sp.archived === "1";
  const q = typeof sp.q === "string" ? sp.q.slice(0, 100) : "";
  const estimates = await listEstimates({ archived, q });

  return (
    <>
      <PageHeader
        eyebrow="Costing"
        title="Freight calculator"
        subtitle="Estimate how freight and related charges affect landed cost. Saved estimates contain supplier costs and are visible only to people with freight access."
        actions={
          viewer.canEditFreight ? (
            <Link href="/freight/new" className="btn btn-primary">+ New estimate</Link>
          ) : null
        }
      />

      <form className="mb-4 flex flex-wrap items-center gap-2" action="/freight">
        <input type="search" name="q" defaultValue={q} placeholder="Search by name or reference" className="input max-w-sm flex-1" />
        {archived ? <input type="hidden" name="archived" value="1" /> : null}
        <button className="btn" type="submit">Search</button>
        <Link href={archived ? "/freight" : "/freight?archived=1"} className="btn">
          {archived ? "Show active" : "Show archived"}
        </Link>
      </form>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">{archived ? "Archived estimates" : "Saved estimates"}</h2>
          <span className="text-xs text-muted">{estimates.length} shown</span>
        </div>
        {estimates.length === 0 ? (
          <Empty>
            {q ? "No estimates match your search." : archived ? "No archived estimates." : "No estimates saved yet."}
          </Empty>
        ) : (
          <TableWrap>
            <table className="table min-w-[640px]">
              <thead>
                <tr>
                  <th>Estimate</th>
                  <th>Status</th>
                  <th className="num">Shipment total</th>
                  <th className="num">Version</th>
                  <th>Last saved</th>
                </tr>
              </thead>
              <tbody>
                {estimates.map((e) => (
                  <tr key={e.id}>
                    <td>
                      <Link href={`/freight/${e.id}`} className="link font-semibold">{e.name}</Link>
                      {e.reference ? <span className="block text-xs text-muted">{e.reference}</span> : null}
                      {e.is_demo ? <span className="badge badge-amber mt-1">Demo data</span> : null}
                    </td>
                    <td><IncompleteBadge complete={e.is_complete} /></td>
                    <td className="num">
                      {e.grand_total === null ? "—" : formatMoney(e.reporting_currency ?? "", Number(e.grand_total).toFixed(2))}
                    </td>
                    <td className="num">v{e.current_version_no}</td>
                    <td className="whitespace-nowrap">{formatDateTime(e.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        )}
      </section>
    </>
  );
}
