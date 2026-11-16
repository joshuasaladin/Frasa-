import Link from "next/link";
import { notFound } from "next/navigation";
import { requireFreightAccess } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Notice, PageHeader } from "@/components/ui";
import { setArchivedAction } from "@/modules/freight/actions";
import { getEstimate, getVersion, listVersions } from "@/modules/freight/queries";
import { IncompleteBadge, ResultsView } from "@/modules/freight/results-view";
import { ALLOCATION_LABELS } from "@/modules/freight/types";

export const metadata = { title: "Freight estimate" };

export default async function EstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  const viewer = await requireFreightAccess("view");
  const { id } = await params;
  const sp = await searchParams;

  // RLS hides estimates from anyone without access, so "no row" is "not found".
  const estimate = await getEstimate(id);
  if (!estimate) notFound();
  const versions = await listVersions(estimate.id);
  const requested = Number(sp.v);
  const versionNo = Number.isInteger(requested) && requested > 0 ? requested : estimate.current_version_no;
  const version = await getVersion(estimate.id, versionNo);
  if (!version) notFound();
  const summary = versions.find((v) => v.versionNo === versionNo);
  const isLatest = versionNo === estimate.current_version_no;
  const { inputs, results } = version;

  return (
    <>
      <PageHeader
        eyebrow="Freight estimate"
        title={
          <span className="flex flex-wrap items-center gap-3">
            {inputs.name || estimate.name}
            <IncompleteBadge complete={version.isComplete} />
            {estimate.is_demo ? <span className="badge badge-amber">Demo data</span> : null}
            {estimate.archived_at ? <span className="badge badge-gray">Archived</span> : null}
          </span>
        }
        subtitle={
          <>
            Version {versionNo} of {estimate.current_version_no} · saved {formatDateTime(version.createdAt)} by{" "}
            {summary?.createdByName ?? "Unknown"} · engine {version.engineVersion}
            {inputs.reference ? ` · ref ${inputs.reference}` : ""}
          </>
        }
        back={{ href: "/freight", label: "All estimates" }}
        actions={
          <>
            <a href={`/freight/${estimate.id}/export?v=${versionNo}`} className="btn">Export CSV</a>
            {viewer.canEditFreight ? (
              <>
                <Link href={`/freight/new?from=${estimate.id}&v=${versionNo}`} className="btn">Duplicate</Link>
                <Link href={`/freight/${estimate.id}/edit${isLatest ? "" : `?v=${versionNo}`}`} className="btn btn-primary">
                  {isLatest ? "Edit (new version)" : `Edit from v${versionNo}`}
                </Link>
              </>
            ) : null}
          </>
        }
      />

      <div className="space-y-4">
        {!isLatest ? (
          <Notice>
            You are viewing an earlier version.{" "}
            <Link href={`/freight/${estimate.id}`} className="link">Go to the latest (v{estimate.current_version_no})</Link>
          </Notice>
        ) : null}
        {version.note ? <Notice tone="blue">Version note: {version.note}</Notice> : null}

        <ResultsView results={results} />

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Inputs saved with this version</h2>
            <span className="text-xs text-muted">Shown exactly as entered</span>
          </div>
          <dl className="grid gap-x-6 gap-y-2 p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <div><dt className="eyebrow">Origin</dt><dd>{inputs.origin || "—"}</dd></div>
            <div><dt className="eyebrow">Destination</dt><dd>{inputs.destination || "—"}</dd></div>
            <div><dt className="eyebrow">Supplier cost currency</dt><dd>{inputs.supplierCurrency}</dd></div>
            <div><dt className="eyebrow">Reporting currency</dt><dd>{inputs.reportingCurrency}</dd></div>
            <div>
              <dt className="eyebrow">Exchange rate (AWG per 1 USD)</dt>
              <dd>{results.conversionNeeded ? (inputs.exchangeRate || "MISSING") : "Not needed"}</dd>
            </div>
            {inputs.notes ? (
              <div className="sm:col-span-2 lg:col-span-3"><dt className="eyebrow">Notes</dt><dd className="whitespace-pre-wrap">{inputs.notes}</dd></div>
            ) : null}
          </dl>
          <div className="overflow-x-auto border-t border-line">
            <table className="table min-w-[820px]">
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Cost / case ({inputs.supplierCurrency})</th>
                  <th className="num">Cases</th>
                  <th className="num">Units / case</th>
                  <th>Case volume</th>
                  <th>Case weight</th>
                  <th className="num">Pallets</th>
                </tr>
              </thead>
              <tbody>
                {inputs.products.map((p, i) => (
                  <tr key={p.id}>
                    <td>
                      <span className="font-semibold">{p.name || `Product ${i + 1}`}</span>
                      {p.sku ? <span className="block text-xs text-muted">{p.sku}</span> : null}
                    </td>
                    <td className="num">{p.costPerCase || "—"}</td>
                    <td className="num">{p.cases || "—"}</td>
                    <td className="num">{p.unitsPerCase || "—"}</td>
                    <td>
                      {p.volumeMode === "direct"
                        ? p.volumePerCase ? `${p.volumePerCase} ${p.volumeUnit === "cuft" ? "cu ft" : "m³"}` : "—"
                        : p.length || p.width || p.height
                          ? `${p.length || "?"} × ${p.width || "?"} × ${p.height || "?"} ${p.dimUnit}`
                          : "—"}
                    </td>
                    <td>{p.weightPerCase ? `${p.weightPerCase} ${p.weightUnit}` : "—"}</td>
                    <td className="num">{p.pallets || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inputs.charges.length > 0 ? (
            <div className="overflow-x-auto border-t border-line">
              <table className="table min-w-[560px]">
                <thead>
                  <tr>
                    <th>Charge</th>
                    <th className="num">Entered</th>
                    <th>Allocation method / basis</th>
                  </tr>
                </thead>
                <tbody>
                  {inputs.charges.map((c, i) => (
                    <tr key={c.id}>
                      <td className="font-semibold">{c.name || `Charge ${i + 1}`}</td>
                      <td className="num">
                        {c.kind === "fixed" ? (c.amount ? `${c.currency} ${c.amount}` : "MISSING") : c.rate ? `${c.rate}%` : "MISSING"}
                      </td>
                      <td>{results.charges[i]?.method || ALLOCATION_LABELS[c.allocation]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
        </section>

        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Version history</h2>
            <span className="text-xs text-muted">Saved versions are never changed</span>
          </div>
          <ul className="divide-y divide-line">
            {versions.map((v) => (
              <li key={v.versionNo}>
                <Link
                  href={`/freight/${estimate.id}?v=${v.versionNo}`}
                  className={`flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm hover:bg-paper ${v.versionNo === versionNo ? "bg-paper" : ""}`}
                >
                  <span className="font-semibold">v{v.versionNo}</span>
                  <IncompleteBadge complete={v.isComplete} />
                  <span className="text-muted">{formatDateTime(v.createdAt)} · {v.createdByName}</span>
                  {v.note ? <span className="w-full text-muted sm:w-auto">“{v.note}”</span> : null}
                  {v.versionNo === versionNo ? <span className="ml-auto text-xs font-semibold text-forest-600">Viewing</span> : null}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {viewer.canEditFreight ? (
          <ActionForm action={setArchivedAction} className="flex flex-col items-start">
            <input type="hidden" name="estimateId" value={estimate.id} />
            <input type="hidden" name="archive" value={estimate.archived_at ? "0" : "1"} />
            <SubmitButton className={estimate.archived_at ? "btn" : "btn btn-danger"}>
              {estimate.archived_at ? "Restore estimate" : "Archive estimate"}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    </>
  );
}
