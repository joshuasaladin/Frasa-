/**
 * Freight landed-cost engine. Pure: no I/O, no clock, no defaults for rates.
 *
 * Rules that matter to anyone checking a result:
 *  - Money is rounded to cents (half up) once, when a line value or a charge is
 *    converted to the reporting currency.
 *  - A shared charge is split with the largest-remainder method, so the cents
 *    allocated to products always add up to the charge exactly.
 *  - A blank input is never treated as zero. Anything that cannot be computed is
 *    reported as an issue, and the estimate is marked incomplete.
 */
import Decimal from "decimal.js";
import {
  ALLOCATION_LABELS,
  type AllocationRow,
  type ChargeInput,
  type ChargeResult,
  type Currency,
  type EstimateInputs,
  type EstimateResults,
  type Issue,
  type ProductInput,
  type ProductResult,
} from "./types";

export const ENGINE_VERSION = "1.0.0";

const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
type Dec = InstanceType<typeof D>;

const ZERO = new D(0);
const CUFT_PER_CUIN = new D(1).div(1728);
const CBM_PER_CUFT = new D("0.028316846592");
const KG_PER_LB = new D("0.45359237");

const money = (d: Dec) => d.toFixed(2);
const toCents = (d: Dec) => d.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);

type Parsed = { state: "blank" } | { state: "invalid"; why: string } | { state: "ok"; value: Dec };

/** Accepts plain decimals only ("1250", "12.5", ".5"). Commas are rejected as ambiguous. */
export function parseNumber(raw: string | null | undefined): Parsed {
  const s = (raw ?? "").trim();
  if (s === "") return { state: "blank" };
  if (/^-/.test(s)) return { state: "invalid", why: "cannot be negative" };
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) {
    return { state: "invalid", why: "must be a number using digits and a decimal point (no commas or symbols)" };
  }
  return { state: "ok", value: new D(s) };
}

class Collector {
  issues: Issue[] = [];
  add(severity: Issue["severity"], scope: Issue["scope"], refId: string | null, field: string | null, message: string) {
    this.issues.push({ severity, scope, refId, field, message });
  }
  /** Reads a required number; records an issue and returns null when blank or invalid. */
  num(
    raw: string,
    scope: Issue["scope"],
    refId: string | null,
    field: string,
    label: string,
    opts: { integer?: boolean; positive?: boolean } = {},
  ): Dec | null {
    const p = parseNumber(raw);
    if (p.state === "blank") {
      this.add("missing", scope, refId, field, `${label} is missing.`);
      return null;
    }
    if (p.state === "invalid") {
      this.add("invalid", scope, refId, field, `${label} ${p.why}.`);
      return null;
    }
    if (opts.integer && !p.value.isInteger()) {
      this.add("invalid", scope, refId, field, `${label} must be a whole number.`);
      return null;
    }
    if (opts.positive && p.value.lte(0)) {
      this.add("invalid", scope, refId, field, `${label} must be greater than zero.`);
      return null;
    }
    return p.value;
  }
}

/**
 * Splits `total` (already in cents precision) across `bases` in proportion,
 * giving leftover cents to the largest remainders (ties: earlier line first).
 */
export function allocateLargestRemainder(total: Dec, bases: Dec[]): { unrounded: Dec[]; allocated: Dec[] } {
  const sum = bases.reduce((a, b) => a.plus(b), ZERO);
  const unrounded = bases.map((b) => total.times(b).div(sum));
  const floors = unrounded.map((u) => u.toDecimalPlaces(2, Decimal.ROUND_FLOOR));
  let leftover = total
    .minus(floors.reduce((a, b) => a.plus(b), ZERO))
    .times(100)
    .toDecimalPlaces(0, Decimal.ROUND_HALF_UP)
    .toNumber();
  const order = unrounded
    .map((u, i) => ({ i, rem: u.minus(floors[i]) }))
    .sort((a, b) => b.rem.comparedTo(a.rem) || a.i - b.i);
  const allocated = [...floors];
  for (let k = 0; leftover > 0 && k < order.length; k += 1, leftover -= 1) {
    allocated[order[k].i] = allocated[order[k].i].plus("0.01");
  }
  return { unrounded, allocated };
}

type ProductCalc = {
  input: ProductInput;
  label: string;
  cases: Dec | null;
  unitsPerCase: Dec | null;
  valueOriginal: Dec | null;
  value: Dec | null;
  allocations: Map<string, Dec>;
};

type ChargeCalc = {
  result: ChargeResult;
  /** productId -> allocated amount, present only when status is allocated. */
  byProduct: Map<string, Dec> | null;
};

export function calculate(inputs: EstimateInputs): EstimateResults {
  const c = new Collector();
  const supplierCurrency = inputs.supplierCurrency;
  const reportingCurrency = inputs.reportingCurrency;

  // ---- Exchange rate -------------------------------------------------------
  const fixedCharges = inputs.charges.filter((ch) => ch.kind === "fixed");
  const conversionNeeded =
    supplierCurrency !== reportingCurrency || fixedCharges.some((ch) => ch.currency !== reportingCurrency);
  let rate: Dec | null = null;
  if (conversionNeeded) {
    rate = c.num(inputs.exchangeRate, "shipment", null, "exchangeRate", "Exchange rate (AWG per 1 USD)", {
      positive: true,
    });
  }
  /** Converts to the reporting currency, rounded to cents. Null when the rate is unavailable. */
  const convert = (amount: Dec, from: Currency): Dec | null => {
    if (from === reportingCurrency) return toCents(amount);
    if (!rate) return null;
    return toCents(from === "USD" ? amount.times(rate) : amount.div(rate));
  };
  const conversionNote = (from: Currency): string | null => {
    if (from === reportingCurrency || !rate) return null;
    return from === "USD"
      ? `${from} × ${rate.toString()} = ${reportingCurrency}`
      : `${from} ÷ ${rate.toString()} = ${reportingCurrency}`;
  };

  // ---- Products ------------------------------------------------------------
  if (inputs.products.length === 0) {
    c.add("missing", "shipment", null, "products", "Add at least one product.");
  }
  const products: ProductCalc[] = inputs.products.map((p, index) => {
    const label = p.name.trim() || `Product ${index + 1}`;
    if (p.name.trim() === "") c.add("missing", "product", p.id, "name", `Product ${index + 1}: name is missing.`);
    const cost = c.num(p.costPerCase, "product", p.id, "costPerCase", `${label}: supplier cost per case`);
    const cases = c.num(p.cases, "product", p.id, "cases", `${label}: case quantity`, { integer: true, positive: true });
    const unitsPerCase = c.num(p.unitsPerCase, "product", p.id, "unitsPerCase", `${label}: units per case`, {
      integer: true,
      positive: true,
    });
    const valueOriginal = cost && cases ? toCents(cost.times(cases)) : null;
    const value = valueOriginal ? convert(valueOriginal, supplierCurrency) : null;
    return { input: p, label, cases, unitsPerCase, valueOriginal, value, allocations: new Map() };
  });
  const productById = new Map(products.map((p) => [p.input.id, p]));

  // ---- Physical measures (validated only when a charge uses them) ----------
  const measureCache = new Map<string, Dec | null>();
  const measure = (p: ProductCalc, kind: "volume" | "weight" | "pallets"): Dec | null => {
    const key = `${kind}:${p.input.id}`;
    if (measureCache.has(key)) return measureCache.get(key)!;
    const i = p.input;
    let out: Dec | null = null;
    if (kind === "volume") {
      let perCase: Dec | null = null;
      if (i.volumeMode === "direct") {
        const v = c.num(i.volumePerCase, "product", i.id, "volumePerCase", `${p.label}: volume per case`, { positive: true });
        perCase = v ? (i.volumeUnit === "cuft" ? v.times(CBM_PER_CUFT) : v) : null;
      } else {
        const dims = [i.length, i.width, i.height];
        const filled = dims.filter((d) => d.trim() !== "").length;
        if (filled === 0) {
          c.add("missing", "product", i.id, "dimensions", `${p.label}: case dimensions are missing (needed to allocate by volume).`);
        } else if (filled < 3) {
          c.add("invalid", "product", i.id, "dimensions", `${p.label}: enter all three case dimensions (length, width and height) to calculate volume.`);
        } else {
          const l = c.num(i.length, "product", i.id, "length", `${p.label}: case length`, { positive: true });
          const w = c.num(i.width, "product", i.id, "width", `${p.label}: case width`, { positive: true });
          const h = c.num(i.height, "product", i.id, "height", `${p.label}: case height`, { positive: true });
          if (l && w && h) {
            const cubic = l.times(w).times(h);
            perCase = i.dimUnit === "in" ? cubic.times(CUFT_PER_CUIN).times(CBM_PER_CUFT) : cubic.div(1_000_000);
          }
        }
      }
      out = perCase && p.cases ? perCase.times(p.cases) : null;
    } else if (kind === "weight") {
      const w = c.num(i.weightPerCase, "product", i.id, "weightPerCase", `${p.label}: weight per case`, { positive: true });
      const kg = w ? (i.weightUnit === "lb" ? w.times(KG_PER_LB) : w) : null;
      out = kg && p.cases ? kg.times(p.cases) : null;
    } else {
      out = c.num(i.pallets, "product", i.id, "pallets", `${p.label}: pallet count`);
    }
    measureCache.set(key, out);
    return out;
  };

  // ---- Charges -------------------------------------------------------------
  const chargeCalcs = new Map<string, ChargeCalc>();
  const chargeName = (ch: ChargeInput, index: number) => ch.name.trim() || `Charge ${index + 1}`;
  const indexOfCharge = new Map(inputs.charges.map((ch, i) => [ch.id, i]));

  const baseResult = (ch: ChargeInput, name: string): ChargeResult => ({
    chargeId: ch.id,
    name,
    kind: ch.kind,
    status: "unallocated",
    reason: null,
    method: "",
    basisUnit: "",
    originalAmount: null,
    originalCurrency: ch.kind === "fixed" ? ch.currency : null,
    amount: null,
    conversion: null,
    rate: null,
    totalBasis: null,
    rows: [],
    allocatedTotal: null,
    reconciles: false,
  });

  const finish = (
    result: ChargeResult,
    amount: Dec,
    lines: { p: ProductCalc; basis: Dec; share: Dec; unrounded: Dec; allocated: Dec }[],
    totalBasis: Dec | null,
    basisDp: number,
  ): ChargeCalc => {
    const byProduct = new Map<string, Dec>();
    const rows: AllocationRow[] = lines.map((l) => {
      byProduct.set(l.p.input.id, l.allocated);
      return {
        productId: l.p.input.id,
        name: l.p.label,
        basisValue: l.basis.toFixed(basisDp),
        sharePercent: l.share.toFixed(4),
        unrounded: l.unrounded.toFixed(6),
        allocated: money(l.allocated),
        adjustment: l.allocated.minus(l.unrounded).toFixed(6),
      };
    });
    const allocatedTotal = lines.reduce((a, l) => a.plus(l.allocated), ZERO);
    result.status = "allocated";
    result.amount = money(amount);
    result.totalBasis = totalBasis ? totalBasis.toFixed(basisDp) : null;
    result.rows = rows;
    result.allocatedTotal = money(allocatedTotal);
    result.reconciles = allocatedTotal.equals(amount);
    return { result, byProduct };
  };

  const unallocated = (result: ChargeResult, reason: string): ChargeCalc => {
    result.reason = reason;
    return { result, byProduct: null };
  };

  const computeFixed = (ch: ChargeInput, index: number): ChargeCalc => {
    const name = chargeName(ch, index);
    const result = baseResult(ch, name);
    result.method = ALLOCATION_LABELS[ch.allocation] ?? ch.allocation;
    if (ch.name.trim() === "") c.add("missing", "charge", ch.id, "name", `Charge ${index + 1}: name is missing.`);

    const original = c.num(ch.amount, "charge", ch.id, "amount", `${name}: amount`);
    if (original && original.decimalPlaces() > 2) {
      c.add("invalid", "charge", ch.id, "amount", `${name}: amount can have at most two decimals.`);
      return unallocated(result, "The amount is not valid.");
    }
    if (original) result.originalAmount = money(original);
    const amount = original ? convert(original, ch.currency) : null;
    result.conversion = conversionNote(ch.currency);
    if (amount) result.amount = money(amount);

    if (products.length === 0) return unallocated(result, "There are no products to allocate to.");

    // Work out the allocation basis even when the amount is missing, so every
    // missing input is reported in one pass.
    let lines: { p: ProductCalc; basis: Dec }[] | null = null;
    let basisDp = 4;
    let reason: string | null = null;

    switch (ch.allocation) {
      case "direct": {
        const target = productById.get(ch.directProductId);
        if (!target) {
          c.add("missing", "charge", ch.id, "directProductId", `${name}: choose the product this charge belongs to.`);
          reason = "No product selected.";
        } else {
          lines = [{ p: target, basis: new D(1) }];
          result.method = `Directly to ${target.label}`;
          result.basisUnit = "assigned";
          basisDp = 0;
        }
        break;
      }
      case "manual_amount":
      case "manual_percent": {
        const isAmount = ch.allocation === "manual_amount";
        result.basisUnit = isAmount ? ch.currency : "%";
        basisDp = isAmount ? 2 : 4;
        const parts = products.map((p) => ({
          p,
          basis: c.num(ch.manualSplit[p.input.id] ?? "", "charge", ch.id, `manualSplit.${p.input.id}`, `${name}: manual split for ${p.label}`),
        }));
        if (parts.some((x) => !x.basis)) {
          reason = "The manual split is missing a value for at least one product (enter 0 where a product takes none).";
          break;
        }
        const sum = parts.reduce((a, x) => a.plus(x.basis!), ZERO);
        if (isAmount) {
          if (original && !sum.equals(original)) {
            const msg = `${name}: manual split does not reconcile. The split totals ${ch.currency} ${money(sum)} but the charge is ${ch.currency} ${money(original)} (difference ${money(sum.minus(original))}).`;
            c.add("invalid", "charge", ch.id, "manualSplit", msg);
            reason = "The manual split does not add up to the charge.";
            break;
          }
        } else if (!sum.equals(100)) {
          c.add("invalid", "charge", ch.id, "manualSplit", `${name}: manual split does not reconcile. The percentages total ${sum.toString()}%, not 100%.`);
          reason = "The manual split does not total 100%.";
          break;
        }
        lines = parts.map((x) => ({ p: x.p, basis: x.basis! }));
        break;
      }
      case "volume":
      case "weight":
      case "pallets":
      case "cases":
      case "value": {
        const method = ch.allocation;
        const unit = { volume: "m³", weight: "kg", pallets: "pallets", cases: "cases", value: reportingCurrency }[method];
        result.basisUnit = unit;
        basisDp = method === "cases" ? 0 : method === "value" ? 2 : 4;
        const parts = products.map((p) => ({
          p,
          basis: method === "cases" ? p.cases : method === "value" ? p.value : measure(p, method),
        }));
        if (parts.some((x) => !x.basis)) {
          reason = `Cannot allocate ${result.method.toLowerCase()}: at least one product is missing the information needed.`;
          break;
        }
        lines = parts.map((x) => ({ p: x.p, basis: x.basis! }));
        break;
      }
      default:
        c.add("invalid", "charge", ch.id, "allocation", `${name}: choose an allocation method.`);
        reason = "No allocation method.";
    }

    if (!lines) return unallocated(result, reason ?? "Cannot be allocated.");
    const totalBasis = lines.reduce((a, l) => a.plus(l.basis), ZERO);
    if (totalBasis.lte(0)) {
      c.add("invalid", "charge", ch.id, "allocation", `${name}: the total ${result.basisUnit} across products is zero, so the charge cannot be allocated ${result.method.toLowerCase()}.`);
      return unallocated(result, "The total allocation basis is zero.");
    }
    if (!original) return unallocated(result, "The amount is missing or not valid.");
    if (!amount) return unallocated(result, "The exchange rate is needed to convert this charge.");

    const { unrounded, allocated } = allocateLargestRemainder(amount, lines.map((l) => l.basis));
    return finish(
      result,
      amount,
      lines.map((l, i) => ({
        ...l,
        share: l.basis.div(totalBasis).times(100),
        unrounded: unrounded[i],
        allocated: allocated[i],
      })),
      totalBasis,
      basisDp,
    );
  };

  const computePercent = (ch: ChargeInput, index: number): ChargeCalc => {
    const name = chargeName(ch, index);
    const result = baseResult(ch, name);
    result.basisUnit = reportingCurrency;
    if (ch.name.trim() === "") c.add("missing", "charge", ch.id, "name", `Charge ${index + 1}: name is missing.`);

    const included: ChargeInput[] = [];
    let badBasis = false;
    for (const id of ch.basisChargeIds) {
      const other = inputs.charges.find((x) => x.id === id);
      if (!other) {
        c.add("invalid", "charge", ch.id, "basisChargeIds", `${name}: the basis refers to a charge that no longer exists.`);
        badBasis = true;
      } else {
        included.push(other);
      }
    }
    const basisNames = ["product value", ...included.map((x) => chargeName(x, indexOfCharge.get(x.id)!))];
    const pct = c.num(ch.rate, "charge", ch.id, "rate", `${name}: percentage rate`);
    if (pct) result.rate = pct.toString();
    result.method = `${pct ? pct.toString() : "?"}% of ${basisNames.join(" + ")}`;

    let targets = products;
    if (ch.appliesTo === "selected") {
      targets = products.filter((p) => ch.appliesToProductIds.includes(p.input.id));
      result.method += ` (only ${targets.map((p) => p.label).join(", ") || "selected products"})`;
      if (targets.length === 0) {
        c.add("missing", "charge", ch.id, "appliesToProductIds", `${name}: choose at least one product this percentage applies to.`);
        return unallocated(result, "No products selected.");
      }
    }
    if (products.length === 0) return unallocated(result, "There are no products to apply this to.");
    if (badBasis) return unallocated(result, "The basis is not valid.");

    const blocked = included.find((x) => !chargeCalcs.get(x.id)?.byProduct);
    if (blocked) {
      return unallocated(result, `Its basis includes "${chargeName(blocked, indexOfCharge.get(blocked.id)!)}", which could not be allocated.`);
    }
    if (targets.some((p) => !p.value)) {
      return unallocated(result, "The product value is missing for at least one product it applies to.");
    }
    if (!pct) return unallocated(result, "The percentage rate is missing or not valid.");

    const lines = targets.map((p) => {
      const basis = included.reduce((a, x) => a.plus(chargeCalcs.get(x.id)!.byProduct!.get(p.input.id) ?? ZERO), p.value!);
      const unroundedAmount = basis.times(pct).div(100);
      return { p, basis, share: pct, unrounded: unroundedAmount, allocated: toCents(unroundedAmount) };
    });
    const amount = lines.reduce((a, l) => a.plus(l.allocated), ZERO);
    const totalBasis = lines.reduce((a, l) => a.plus(l.basis), ZERO);
    return finish(result, amount, lines, totalBasis, 2);
  };

  // Fixed charges first, then percentage charges in dependency order.
  inputs.charges.forEach((ch, i) => {
    if (ch.kind === "fixed") chargeCalcs.set(ch.id, computeFixed(ch, i));
  });
  const percentCharges = inputs.charges.filter((ch) => ch.kind === "percent");
  const pending = new Set(percentCharges.map((ch) => ch.id));
  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const ch of percentCharges) {
      if (!pending.has(ch.id)) continue;
      if (ch.basisChargeIds.some((id) => pending.has(id))) continue;
      chargeCalcs.set(ch.id, computePercent(ch, indexOfCharge.get(ch.id)!));
      pending.delete(ch.id);
      progressed = true;
    }
  }
  for (const id of pending) {
    // Whatever is left depends on itself, directly or through other charges.
    const ch = inputs.charges.find((x) => x.id === id)!;
    const name = chargeName(ch, indexOfCharge.get(id)!);
    const result = baseResult(ch, name);
    result.method = "Percentage (circular basis)";
    c.add("invalid", "charge", id, "basisChargeIds", `${name}: its basis is circular (it depends on a charge that depends on it). Remove one of the charges from the basis.`);
    chargeCalcs.set(id, unallocated(result, "Circular basis."));
  }

  // ---- Roll up ---------------------------------------------------------------
  const chargeResults = inputs.charges.map((ch) => chargeCalcs.get(ch.id)!);
  for (const calc of chargeResults) {
    if (!calc.byProduct) continue;
    for (const [pid, amount] of calc.byProduct) productById.get(pid)?.allocations.set(calc.result.chargeId, amount);
  }
  const unallocatedCount = chargeResults.filter((x) => !x.byProduct).length;

  const productResults: ProductResult[] = products.map((p) => {
    const allocatedCharges = [...p.allocations.values()].reduce((a, b) => a.plus(b), ZERO);
    const landed = p.value ? p.value.plus(allocatedCharges) : null;
    const totalUnits = p.cases && p.unitsPerCase ? p.cases.times(p.unitsPerCase) : null;
    const peek = (kind: "volume" | "weight" | "pallets") => measureCache.get(`${kind}:${p.input.id}`) ?? null;
    return {
      productId: p.input.id,
      name: p.label,
      sku: p.input.sku.trim(),
      cases: p.cases ? p.cases.toFixed(0) : null,
      unitsPerCase: p.unitsPerCase ? p.unitsPerCase.toFixed(0) : null,
      totalUnits: totalUnits ? totalUnits.toFixed(0) : null,
      supplierValueOriginal: p.valueOriginal ? money(p.valueOriginal) : null,
      supplierValue: p.value ? money(p.value) : null,
      totalVolumeCbm: peek("volume")?.toFixed(4) ?? null,
      totalWeightKg: peek("weight")?.toFixed(4) ?? null,
      pallets: peek("pallets")?.toString() ?? null,
      chargeAllocations: Object.fromEntries([...p.allocations].map(([id, v]) => [id, money(v)])),
      allocatedCharges: money(allocatedCharges),
      landedTotal: landed ? money(landed) : null,
      landedPerCase: landed && p.cases ? landed.div(p.cases).toFixed(4) : null,
      landedPerUnit: landed && totalUnits ? landed.div(totalUnits).toFixed(4) : null,
      complete: Boolean(landed && totalUnits) && unallocatedCount === 0,
    };
  });

  const allValues = products.every((p) => p.value) && products.length > 0;
  const supplierValue = allValues ? products.reduce((a, p) => a.plus(p.value!), ZERO) : null;
  const allocatedCharges = chargeResults.reduce(
    (a, x) => (x.byProduct ? a.plus(x.result.allocatedTotal!) : a),
    ZERO,
  );
  const grandTotal = supplierValue ? supplierValue.plus(allocatedCharges) : null;
  const landedSum = allValues
    ? productResults.reduce((a, p) => a.plus(p.landedTotal!), ZERO)
    : null;
  const allCases = products.every((p) => p.cases) && products.length > 0;
  const allUnits = productResults.every((p) => p.totalUnits) && products.length > 0;
  const chargesReconcile = chargeResults.every((x) => !x.byProduct || x.result.reconciles);

  return {
    engineVersion: ENGINE_VERSION,
    isComplete: c.issues.length === 0 && unallocatedCount === 0 && products.length > 0,
    issues: c.issues,
    supplierCurrency,
    reportingCurrency,
    exchangeRate: conversionNeeded && rate ? rate.toString() : null,
    conversionNeeded,
    products: productResults,
    charges: chargeResults.map((x) => x.result),
    totals: {
      totalCases: allCases ? products.reduce((a, p) => a.plus(p.cases!), ZERO).toFixed(0) : null,
      totalUnits: allUnits ? productResults.reduce((a, p) => a.plus(p.totalUnits!), ZERO).toFixed(0) : null,
      supplierValue: supplierValue ? money(supplierValue) : null,
      allocatedCharges: money(allocatedCharges),
      unallocatedCharges: unallocatedCount,
      grandTotal: grandTotal ? money(grandTotal) : null,
      reconciles: Boolean(grandTotal && landedSum && grandTotal.equals(landedSum)) && chargesReconcile,
    },
  };
}
