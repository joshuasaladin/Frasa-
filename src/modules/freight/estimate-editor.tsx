"use client";

import { useMemo, useState, useTransition, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { saveEstimate } from "./actions";
import { calculate } from "./engine";
import { IncompleteBadge, ResultsView } from "./results-view";
import {
  ALLOCATION_LABELS,
  ALLOCATION_METHODS,
  CURRENCIES,
  blankCharge,
  blankProduct,
  type ChargeInput,
  type Currency,
  type EstimateInputs,
  type Issue,
  type ProductInput,
} from "./types";

function F({ label, hint, children, className = "" }: { label: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <label className={`block ${className}`}>
      <span className="label">{label}</span>
      {children}
      {hint ? <span className="hint block">{hint}</span> : null}
    </label>
  );
}

function Num({ value, onChange, placeholder, bad }: { value: string; onChange: (v: string) => void; placeholder?: string; bad?: boolean }) {
  return (
    <input
      className={`input tabular-nums ${bad ? "border-red-400" : ""}`}
      inputMode="decimal"
      autoComplete="off"
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
    />
  );
}

function Select<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[] }) {
  return (
    <select className="input" value={value} onChange={(e) => onChange(e.target.value as T)}>
      {options.map((o) => (
        <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function ItemIssues({ issues }: { issues: Issue[] }) {
  if (issues.length === 0) return null;
  return (
    <ul className="mt-3 space-y-0.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-800">
      {issues.map((i, k) => (
        <li key={k}>{i.message}</li>
      ))}
    </ul>
  );
}

export function EstimateEditor({
  initial,
  estimateId,
  duplicatedFrom,
  currentVersionNo,
}: {
  initial: EstimateInputs;
  estimateId?: string;
  duplicatedFrom?: string;
  currentVersionNo?: number;
}) {
  const router = useRouter();
  const [inputs, setInputs] = useState<EstimateInputs>(initial);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Same engine as the server uses when saving.
  const results = useMemo(() => calculate(inputs), [inputs]);
  const issuesFor = (id: string) => results.issues.filter((i) => i.refId === id);
  const badField = (id: string | null, field: string) => results.issues.some((i) => i.refId === id && i.field === field);

  const set = <K extends keyof EstimateInputs>(key: K, value: EstimateInputs[K]) =>
    setInputs((prev) => ({ ...prev, [key]: value }));
  const setProduct = (id: string, patch: Partial<ProductInput>) =>
    setInputs((prev) => ({ ...prev, products: prev.products.map((p) => (p.id === id ? { ...p, ...patch } : p)) }));
  const setCharge = (id: string, patch: Partial<ChargeInput>) =>
    setInputs((prev) => ({ ...prev, charges: prev.charges.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));

  const removeProduct = (id: string) =>
    setInputs((prev) => ({
      ...prev,
      products: prev.products.filter((p) => p.id !== id),
      charges: prev.charges.map((c) => {
        const manualSplit = { ...c.manualSplit };
        delete manualSplit[id];
        return {
          ...c,
          manualSplit,
          directProductId: c.directProductId === id ? "" : c.directProductId,
          appliesToProductIds: c.appliesToProductIds.filter((x) => x !== id),
        };
      }),
    }));
  const removeCharge = (id: string) =>
    setInputs((prev) => ({
      ...prev,
      charges: prev.charges
        .filter((c) => c.id !== id)
        .map((c) => ({ ...c, basisChargeIds: c.basisChargeIds.filter((x) => x !== id) })),
    }));
  const toggle = (list: string[], id: string) => (list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);

  const productLabel = (p: ProductInput, i: number) => p.name.trim() || `Product ${i + 1}`;
  const chargeLabel = (c: ChargeInput, i: number) => c.name.trim() || `Charge ${i + 1}`;

  const save = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await saveEstimate({ estimateId: estimateId ?? null, inputs, note, duplicatedFrom: duplicatedFrom ?? null });
      if (!res.ok) {
        setMessage(res.message);
        return;
      }
      router.push(`/freight/${res.estimateId}?v=${res.versionNo}`);
      router.refresh();
    });
  };

  const currencyOptions = CURRENCIES.map((c) => ({ value: c, label: c }));

  return (
    <div className="space-y-5">
      {/* Shipment ------------------------------------------------------------ */}
      <section className="card">
        <div className="card-header"><h2 className="card-title">Shipment</h2></div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <F label="Estimate name" className="sm:col-span-2">
            <input className="input" value={inputs.name} maxLength={200} onChange={(e) => set("name", e.target.value)} placeholder="e.g. 40ft container, week 48" />
          </F>
          <F label="Reference" hint="Optional: PO, booking or NECS reference." className="sm:col-span-2">
            <input className="input" value={inputs.reference} maxLength={200} onChange={(e) => set("reference", e.target.value)} />
          </F>
          <F label="Origin" className="sm:col-span-2">
            <input className="input" value={inputs.origin} maxLength={200} onChange={(e) => set("origin", e.target.value)} />
          </F>
          <F label="Destination" className="sm:col-span-2">
            <input className="input" value={inputs.destination} maxLength={200} onChange={(e) => set("destination", e.target.value)} />
          </F>
          <F label="Supplier costs are in">
            <Select<Currency> value={inputs.supplierCurrency} onChange={(v) => set("supplierCurrency", v)} options={currencyOptions} />
          </F>
          <F label="Show results in">
            <Select<Currency> value={inputs.reportingCurrency} onChange={(v) => set("reportingCurrency", v)} options={currencyOptions} />
          </F>
          <F
            label={`Exchange rate (AWG per 1 USD)${results.conversionNeeded ? " — required" : ""}`}
            className="sm:col-span-2"
            hint={
              results.conversionNeeded
                ? "Enter the rate Frasa uses for this shipment. It is saved with the estimate; no rate is assumed."
                : "Not needed: all amounts are already in the reporting currency."
            }
          >
            <Num value={inputs.exchangeRate} onChange={(v) => set("exchangeRate", v)} bad={badField(null, "exchangeRate")} />
          </F>
          <F label="Notes" className="sm:col-span-2 lg:col-span-4">
            <textarea className="input" rows={2} value={inputs.notes} maxLength={4000} onChange={(e) => set("notes", e.target.value)} />
          </F>
        </div>
      </section>

      {/* Products ------------------------------------------------------------ */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Products</h2>
          <span className="text-xs text-muted">Costs in {inputs.supplierCurrency}</span>
        </div>
        <div className="space-y-3 p-3 sm:p-4">
          {inputs.products.map((p, i) => (
            <div key={p.id} className="rounded-lg border border-line p-3">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                <F label={`Product ${i + 1}`} className="col-span-2">
                  <input className={`input ${badField(p.id, "name") ? "border-red-400" : ""}`} value={p.name} maxLength={200} onChange={(e) => setProduct(p.id, { name: e.target.value })} placeholder="Product name" />
                </F>
                <F label="SKU (optional)">
                  <input className="input" value={p.sku} maxLength={80} onChange={(e) => setProduct(p.id, { sku: e.target.value })} />
                </F>
                <F label={`Cost per case (${inputs.supplierCurrency})`}>
                  <Num value={p.costPerCase} onChange={(v) => setProduct(p.id, { costPerCase: v })} bad={badField(p.id, "costPerCase")} />
                </F>
                <F label="Cases">
                  <Num value={p.cases} onChange={(v) => setProduct(p.id, { cases: v })} bad={badField(p.id, "cases")} />
                </F>
                <F label="Units per case">
                  <Num value={p.unitsPerCase} onChange={(v) => setProduct(p.id, { unitsPerCase: v })} bad={badField(p.id, "unitsPerCase")} />
                </F>
              </div>
              <details className="mt-3" open={issuesFor(p.id).some((x) => /dimension|length|width|height|volume|weight|pallet/i.test(x.field ?? ""))}>
                <summary className="flex min-h-10 cursor-pointer items-center text-[13px] font-semibold text-forest-600">
                  Dimensions, weight and pallets
                  <span className="ml-2 font-normal text-muted">— only needed for charges allocated by volume, weight or pallets</span>
                </summary>
                <div className="mt-2 grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <F label="Case volume from">
                    <Select value={p.volumeMode} onChange={(v) => setProduct(p.id, { volumeMode: v })} options={[{ value: "dimensions", label: "Dimensions" }, { value: "direct", label: "Volume per case" }]} />
                  </F>
                  {p.volumeMode === "dimensions" ? (
                    <>
                      <F label="Length"><Num value={p.length} onChange={(v) => setProduct(p.id, { length: v })} bad={badField(p.id, "dimensions") || badField(p.id, "length")} /></F>
                      <F label="Width"><Num value={p.width} onChange={(v) => setProduct(p.id, { width: v })} bad={badField(p.id, "dimensions") || badField(p.id, "width")} /></F>
                      <F label="Height"><Num value={p.height} onChange={(v) => setProduct(p.id, { height: v })} bad={badField(p.id, "dimensions") || badField(p.id, "height")} /></F>
                      <F label="Dimension unit">
                        <Select value={p.dimUnit} onChange={(v) => setProduct(p.id, { dimUnit: v })} options={[{ value: "in", label: "inches" }, { value: "cm", label: "centimetres" }]} />
                      </F>
                    </>
                  ) : (
                    <>
                      <F label="Volume per case"><Num value={p.volumePerCase} onChange={(v) => setProduct(p.id, { volumePerCase: v })} bad={badField(p.id, "volumePerCase")} /></F>
                      <F label="Volume unit">
                        <Select value={p.volumeUnit} onChange={(v) => setProduct(p.id, { volumeUnit: v })} options={[{ value: "cuft", label: "cubic feet" }, { value: "cbm", label: "cubic metres" }]} />
                      </F>
                    </>
                  )}
                  <F label="Weight per case"><Num value={p.weightPerCase} onChange={(v) => setProduct(p.id, { weightPerCase: v })} bad={badField(p.id, "weightPerCase")} /></F>
                  <F label="Weight unit">
                    <Select value={p.weightUnit} onChange={(v) => setProduct(p.id, { weightUnit: v })} options={[{ value: "lb", label: "pounds" }, { value: "kg", label: "kilograms" }]} />
                  </F>
                  <F label="Pallets"><Num value={p.pallets} onChange={(v) => setProduct(p.id, { pallets: v })} bad={badField(p.id, "pallets")} /></F>
                </div>
              </details>
              <ItemIssues issues={issuesFor(p.id)} />
              <div className="mt-3 flex justify-end">
                <button type="button" className="btn btn-sm btn-danger" onClick={() => removeProduct(p.id)}>Remove product</button>
              </div>
            </div>
          ))}
          <button type="button" className="btn w-full sm:w-auto" onClick={() => set("products", [...inputs.products, blankProduct()])}>
            + Add product
          </button>
        </div>
      </section>

      {/* Charges ------------------------------------------------------------- */}
      <section className="card">
        <div className="card-header">
          <h2 className="card-title">Shipment charges</h2>
          <span className="text-xs text-muted">Freight, insurance, handling, duties, taxes…</span>
        </div>
        <div className="space-y-3 p-3 sm:p-4">
          {inputs.charges.length === 0 ? (
            <p className="text-sm text-muted">No charges yet. Add each charge from the forwarder&apos;s quote or invoice, and any duties or taxes that apply.</p>
          ) : null}
          {inputs.charges.map((ch, i) => {
            const others = inputs.charges.filter((o) => o.id !== ch.id);
            const manual = ch.allocation === "manual_amount" || ch.allocation === "manual_percent";
            const splitTotal = inputs.products.reduce((a, p) => a + (Number(ch.manualSplit[p.id]) || 0), 0);
            return (
              <div key={ch.id} className="rounded-lg border border-line p-3">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-6">
                  <F label={`Charge ${i + 1}`} className="col-span-2">
                    <input className={`input ${badField(ch.id, "name") ? "border-red-400" : ""}`} value={ch.name} maxLength={200} onChange={(e) => setCharge(ch.id, { name: e.target.value })} placeholder="e.g. Ocean freight" />
                  </F>
                  <F label="Type">
                    <Select value={ch.kind} onChange={(v) => setCharge(ch.id, { kind: v })} options={[{ value: "fixed", label: "Fixed amount" }, { value: "percent", label: "Percentage" }]} />
                  </F>
                  {ch.kind === "fixed" ? (
                    <>
                      <F label="Amount"><Num value={ch.amount} onChange={(v) => setCharge(ch.id, { amount: v })} bad={badField(ch.id, "amount")} /></F>
                      <F label="Currency"><Select<Currency> value={ch.currency} onChange={(v) => setCharge(ch.id, { currency: v })} options={currencyOptions} /></F>
                      <F label="Allocate">
                        <Select value={ch.allocation} onChange={(v) => setCharge(ch.id, { allocation: v })} options={ALLOCATION_METHODS.map((m) => ({ value: m, label: ALLOCATION_LABELS[m] }))} />
                      </F>
                    </>
                  ) : (
                    <F label="Rate %" hint="Enter Frasa's rate; none is assumed.">
                      <Num value={ch.rate} onChange={(v) => setCharge(ch.id, { rate: v })} bad={badField(ch.id, "rate")} />
                    </F>
                  )}
                </div>

                {ch.kind === "fixed" && ch.allocation === "direct" ? (
                  <F label="Assign the whole charge to" className="mt-3 max-w-sm">
                    <select className={`input ${badField(ch.id, "directProductId") ? "border-red-400" : ""}`} value={ch.directProductId} onChange={(e) => setCharge(ch.id, { directProductId: e.target.value })}>
                      <option value="">Choose a product…</option>
                      {inputs.products.map((p, k) => (
                        <option key={p.id} value={p.id}>{productLabel(p, k)}</option>
                      ))}
                    </select>
                  </F>
                ) : null}

                {ch.kind === "fixed" && manual ? (
                  <div className="mt-3 rounded-lg bg-paper p-3">
                    <p className="label">
                      Manual split — {ch.allocation === "manual_amount" ? `amount per product in ${ch.currency}` : "percent per product"}
                    </p>
                    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                      {inputs.products.map((p, k) => (
                        <label key={p.id} className="flex items-center gap-2 text-sm">
                          <span className="min-w-0 flex-1 truncate">{productLabel(p, k)}</span>
                          <span className="w-28">
                            <Num
                              value={ch.manualSplit[p.id] ?? ""}
                              onChange={(v) => setCharge(ch.id, { manualSplit: { ...ch.manualSplit, [p.id]: v } })}
                              bad={badField(ch.id, `manualSplit.${p.id}`)}
                            />
                          </span>
                        </label>
                      ))}
                    </div>
                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-[13px]">
                      <span className={badField(ch.id, "manualSplit") ? "font-semibold text-red-700" : "text-muted"}>
                        Entered so far: {splitTotal.toFixed(ch.allocation === "manual_amount" ? 2 : 4)}
                        {ch.allocation === "manual_amount" ? ` of ${ch.amount || "?"} ${ch.currency}` : " of 100%"}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() =>
                          setCharge(ch.id, {
                            manualSplit: Object.fromEntries(inputs.products.map((p) => [p.id, (ch.manualSplit[p.id] ?? "").trim() === "" ? "0" : ch.manualSplit[p.id]])),
                          })
                        }
                      >
                        Set blanks to 0
                      </button>
                    </div>
                  </div>
                ) : null}

                {ch.kind === "percent" ? (
                  <div className="mt-3 grid gap-3 rounded-lg bg-paper p-3 lg:grid-cols-2">
                    <div>
                      <p className="label">Calculated on (basis)</p>
                      <label className="flex min-h-9 items-center gap-2 text-sm text-muted">
                        <input type="checkbox" checked disabled className="h-4 w-4" /> Product value (always included)
                      </label>
                      {others.map((o) => (
                        <label key={o.id} className="flex min-h-9 items-center gap-2 text-sm">
                          <input type="checkbox" className="h-4 w-4" checked={ch.basisChargeIds.includes(o.id)} onChange={() => setCharge(ch.id, { basisChargeIds: toggle(ch.basisChargeIds, o.id) })} />
                          + {chargeLabel(o, inputs.charges.indexOf(o))}
                        </label>
                      ))}
                      <p className="hint">Tick the charges that are part of the value this percentage is charged on (for example freight and insurance for a CIF basis).</p>
                    </div>
                    <div>
                      <p className="label">Applies to</p>
                      <Select value={ch.appliesTo} onChange={(v) => setCharge(ch.id, { appliesTo: v })} options={[{ value: "all", label: "All products" }, { value: "selected", label: "Selected products only" }]} />
                      {ch.appliesTo === "selected"
                        ? inputs.products.map((p, k) => (
                            <label key={p.id} className="flex min-h-9 items-center gap-2 text-sm">
                              <input type="checkbox" className="h-4 w-4" checked={ch.appliesToProductIds.includes(p.id)} onChange={() => setCharge(ch.id, { appliesToProductIds: toggle(ch.appliesToProductIds, p.id) })} />
                              {productLabel(p, k)}
                            </label>
                          ))
                        : null}
                      <p className="hint">Use separate percentage charges when products carry different rates.</p>
                    </div>
                  </div>
                ) : null}

                <ItemIssues issues={issuesFor(ch.id)} />
                <div className="mt-3 flex justify-end">
                  <button type="button" className="btn btn-sm btn-danger" onClick={() => removeCharge(ch.id)}>Remove charge</button>
                </div>
              </div>
            );
          })}
          <button type="button" className="btn w-full sm:w-auto" onClick={() => set("charges", [...inputs.charges, blankCharge(inputs.supplierCurrency)])}>
            + Add charge
          </button>
        </div>
      </section>

      {/* Live result --------------------------------------------------------- */}
      <div className="flex items-center gap-3">
        <h2 className="text-lg font-bold">Estimate preview</h2>
        <IncompleteBadge complete={results.isComplete} />
      </div>
      <ResultsView results={results} />

      {/* Save ---------------------------------------------------------------- */}
      <section className="card p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <F label="Version note (optional)" hint={estimateId ? `Saving creates version ${(currentVersionNo ?? 0) + 1}. Earlier versions are kept unchanged.` : "What this estimate is for, or what changed."}>
            <input className="input" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </F>
          <div className="flex gap-2">
            <Link href={estimateId ? `/freight/${estimateId}` : "/freight"} className="btn flex-1 sm:flex-none">Cancel</Link>
            <button type="button" className="btn btn-primary flex-1 sm:flex-none" disabled={pending} onClick={save}>
              {pending ? "Saving…" : results.isComplete ? "Save estimate" : "Save as incomplete"}
            </button>
          </div>
        </div>
        {!results.isComplete ? (
          <p className="mt-2 text-[13px] text-red-800">This estimate will be saved and labelled INCOMPLETE until the missing inputs are filled in.</p>
        ) : null}
        {message ? <p role="alert" className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p> : null}
      </section>
    </div>
  );
}
