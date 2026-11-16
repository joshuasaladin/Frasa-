import type { EstimateResults, Issue } from "./types";
import { formatAmount, formatMoney } from "./format";

/**
 * Read-only presentation of calculation results. Used for the live preview in
 * the editor and for saved versions (where it renders the stored results).
 */
export function IncompleteBadge({ complete }: { complete: boolean }) {
  return complete ? (
    <span className="badge badge-green">Complete</span>
  ) : (
    <span className="badge badge-red">INCOMPLETE</span>
  );
}

export function IssueList({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-900" role="alert">
      <p className="font-semibold">
        This estimate is INCOMPLETE. {issues.length} {issues.length === 1 ? "input needs" : "inputs need"} attention
        before the landed costs can be relied on.
      </p>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {issues.map((issue, i) => (
          <li key={i}>
            <span className="font-semibold">{issue.severity === "missing" ? "Missing: " : "Not valid: "}</span>
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="card p-4">
      <p className="eyebrow">{label}</p>
      <p className="mt-2 text-xl font-bold tabular-nums text-ink sm:text-2xl">{value}</p>
      {sub ? <p className="mt-1 text-xs text-muted">{sub}</p> : null}
    </div>
  );
}

export function ResultsView({ results }: { results: EstimateResults }) {
  const cur = results.reportingCurrency;
  const { totals } = results;
  const showOriginal = results.supplierCurrency !== results.reportingCurrency;

  return (
    <div className="space-y-4">
      <IssueList issues={results.issues} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile
          label="Shipment total"
          value={formatMoney(cur, totals.grandTotal)}
          sub={results.isComplete ? "Supplier value + all charges" : "Incomplete — not all inputs are known"}
        />
        <Tile label="Supplier value" value={formatMoney(cur, totals.supplierValue)} sub={`${formatAmount(totals.totalCases)} cases`} />
        <Tile
          label="Allocated charges"
          value={formatMoney(cur, totals.allocatedCharges)}
          sub={
            totals.unallocatedCharges > 0
              ? `${totals.unallocatedCharges} charge${totals.unallocatedCharges === 1 ? "" : "s"} NOT allocated`
              : `${results.charges.length} charge${results.charges.length === 1 ? "" : "s"}`
          }
        />
        <Tile
          label="Exchange rate"
          value={results.conversionNeeded ? (results.exchangeRate ?? "Missing") : "Not needed"}
          sub={results.conversionNeeded ? "AWG per 1 USD, as entered" : `Everything is in ${cur}`}
        />
      </div>

      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Landed cost by product</h2>
          <span className="text-xs text-muted">Amounts in {cur}</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table min-w-[760px]">
            <thead>
              <tr>
                <th>Product</th>
                <th className="num">Cases</th>
                <th className="num">Units</th>
                {showOriginal ? <th className="num">Value ({results.supplierCurrency})</th> : null}
                <th className="num">Supplier value</th>
                <th className="num">Charges</th>
                <th className="num">Landed total</th>
                <th className="num">Per case</th>
                <th className="num">Per unit</th>
              </tr>
            </thead>
            <tbody>
              {results.products.map((p) => (
                <tr key={p.productId}>
                  <td>
                    <span className="font-semibold">{p.name}</span>
                    {p.sku ? <span className="block text-xs text-muted">{p.sku}</span> : null}
                    {!p.complete ? <span className="badge badge-red mt-1">Incomplete</span> : null}
                  </td>
                  <td className="num">{formatAmount(p.cases)}</td>
                  <td className="num">{formatAmount(p.totalUnits)}</td>
                  {showOriginal ? <td className="num">{formatAmount(p.supplierValueOriginal)}</td> : null}
                  <td className="num">{formatAmount(p.supplierValue)}</td>
                  <td className="num">{formatAmount(p.allocatedCharges)}</td>
                  <td className="num font-semibold">{formatAmount(p.landedTotal)}</td>
                  <td className="num">{formatAmount(p.landedPerCase)}</td>
                  <td className="num">{formatAmount(p.landedPerUnit)}</td>
                </tr>
              ))}
              <tr className="bg-paper font-semibold">
                <td>Shipment total</td>
                <td className="num">{formatAmount(totals.totalCases)}</td>
                <td className="num">{formatAmount(totals.totalUnits)}</td>
                {showOriginal ? <td /> : null}
                <td className="num">{formatAmount(totals.supplierValue)}</td>
                <td className="num">{formatAmount(totals.allocatedCharges)}</td>
                <td className="num">{formatAmount(totals.grandTotal)}</td>
                <td />
                <td />
              </tr>
            </tbody>
          </table>
        </div>
        <p className="border-t border-line px-4 py-2 text-xs text-muted">
          Per-case and per-unit costs are the landed total divided by cases or units, rounded to 4 decimals for
          display. Totals are exact to the cent.
        </p>
      </section>

      {results.charges.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Charges by product</h2>
            <span className="text-xs text-muted">Amounts in {cur}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="table" style={{ minWidth: `${260 + results.charges.length * 130}px` }}>
              <thead>
                <tr>
                  <th>Product</th>
                  {results.charges.map((c) => (
                    <th key={c.chargeId} className="num">{c.name}</th>
                  ))}
                  <th className="num">Total</th>
                </tr>
              </thead>
              <tbody>
                {results.products.map((p) => (
                  <tr key={p.productId}>
                    <td className="font-semibold">{p.name}</td>
                    {results.charges.map((c) => (
                      <td key={c.chargeId} className="num">
                        {c.status === "allocated" ? formatAmount(p.chargeAllocations[c.chargeId] ?? "0.00") : "n/a"}
                      </td>
                    ))}
                    <td className="num font-semibold">{formatAmount(p.allocatedCharges)}</td>
                  </tr>
                ))}
                <tr className="bg-paper font-semibold">
                  <td>Charge total</td>
                  {results.charges.map((c) => (
                    <td key={c.chargeId} className="num">
                      {c.status === "allocated" ? formatAmount(c.allocatedTotal) : "not allocated"}
                    </td>
                  ))}
                  <td className="num">{formatAmount(totals.allocatedCharges)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {results.charges.length > 0 ? (
        <section className="card">
          <div className="card-header">
            <h2 className="card-title">Calculation breakdown</h2>
            <span className="text-xs text-muted">How each charge was allocated</span>
          </div>
          <div className="divide-y divide-line">
            {results.charges.map((c) => (
              <details key={c.chargeId} className="group" open={c.status !== "allocated"}>
                <summary className="flex min-h-12 cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2 text-sm hover:bg-paper">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted">{c.method}</span>
                  <span className="ml-auto tabular-nums font-semibold">
                    {c.status === "allocated" ? formatMoney(cur, c.amount) : ""}
                  </span>
                  {c.status === "allocated" ? (
                    c.reconciles ? (
                      <span className="badge badge-green">Reconciles</span>
                    ) : (
                      <span className="badge badge-red">Does not reconcile</span>
                    )
                  ) : (
                    <span className="badge badge-red">Not allocated</span>
                  )}
                </summary>
                <div className="px-4 pb-4">
                  {c.kind === "fixed" && c.originalAmount ? (
                    <p className="mb-2 text-xs text-muted">
                      Entered as {formatMoney(c.originalCurrency ?? "", c.originalAmount)}
                      {c.conversion ? ` · converted: ${c.conversion} → ${formatMoney(cur, c.amount)}` : ""}
                    </p>
                  ) : null}
                  {c.status !== "allocated" ? (
                    <p className="text-sm text-red-800">Not allocated: {c.reason}</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="table min-w-[620px]">
                        <thead>
                          <tr>
                            <th>Product</th>
                            <th className="num">Basis ({c.basisUnit})</th>
                            <th className="num">{c.kind === "percent" ? "Rate %" : "Share %"}</th>
                            <th className="num">Unrounded</th>
                            <th className="num">Allocated</th>
                            <th className="num">Rounding</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.rows.map((r) => (
                            <tr key={r.productId}>
                              <td>{r.name}</td>
                              <td className="num">{formatAmount(r.basisValue)}</td>
                              <td className="num">{r.sharePercent}</td>
                              <td className="num">{formatAmount(r.unrounded)}</td>
                              <td className="num font-semibold">{formatAmount(r.allocated)}</td>
                              <td className="num text-muted">{r.adjustment}</td>
                            </tr>
                          ))}
                          <tr className="bg-paper font-semibold">
                            <td>Total</td>
                            <td className="num">{formatAmount(c.totalBasis)}</td>
                            <td />
                            <td className="num">{formatAmount(c.amount)}</td>
                            <td className="num">{formatAmount(c.allocatedTotal)}</td>
                            <td className="num">{c.reconciles ? "= charge ✓" : "≠ charge"}</td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="card p-4">
        <h2 className="card-title">Reconciliation</h2>
        <dl className="mt-2 max-w-md space-y-1 text-sm">
          <div className="flex justify-between gap-4">
            <dt className="text-muted">Supplier value</dt>
            <dd className="tabular-nums">{formatMoney(cur, totals.supplierValue)}</dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt className="text-muted">+ Allocated charges</dt>
            <dd className="tabular-nums">{formatMoney(cur, totals.allocatedCharges)}</dd>
          </div>
          <div className="flex justify-between gap-4 border-t border-line pt-1 font-semibold">
            <dt>= Shipment total</dt>
            <dd className="tabular-nums">{formatMoney(cur, totals.grandTotal)}</dd>
          </div>
        </dl>
        <p className="mt-2 text-sm">
          {totals.reconciles ? (
            <span className="text-forest-600">
              ✓ Product landed totals add up to the shipment total, and every allocated charge adds up to the original
              charge.
            </span>
          ) : (
            <span className="text-red-800">
              The shipment cannot be reconciled until the missing inputs above are filled in.
            </span>
          )}
          {totals.unallocatedCharges > 0 ? (
            <span className="block text-red-800">
              {totals.unallocatedCharges} charge{totals.unallocatedCharges === 1 ? " is" : "s are"} not included in the
              totals.
            </span>
          ) : null}
        </p>
      </section>
    </div>
  );
}
