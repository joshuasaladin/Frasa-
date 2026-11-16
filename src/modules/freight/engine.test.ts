import { describe, expect, it } from "vitest";
import { ENGINE_VERSION, calculate, parseNumber } from "./engine";
import { buildEstimateCsv, csvCell } from "./csv";
import { parseInputs } from "./schema";
import type { AllocationMethod, ChargeInput, EstimateInputs, ProductInput } from "./types";

const cents = (s: string | null) => Math.round(Number(s) * 100);
const sumCents = (xs: (string | null)[]) => xs.reduce((a, x) => a + cents(x), 0);

function product(id: string, over: Partial<ProductInput> = {}): ProductInput {
  return {
    id, name: `Product ${id}`, sku: "", costPerCase: "10", cases: "1", unitsPerCase: "1",
    volumeMode: "dimensions", dimUnit: "in", length: "12", width: "12", height: "12",
    volumePerCase: "", volumeUnit: "cuft", weightPerCase: "10", weightUnit: "lb", pallets: "1",
    ...over,
  };
}
function fixed(id: string, amount: string, allocation: AllocationMethod, over: Partial<ChargeInput> = {}): ChargeInput {
  return {
    id, name: `Charge ${id}`, kind: "fixed", amount, currency: "USD", allocation, directProductId: "",
    manualSplit: {}, rate: "", basisChargeIds: [], appliesTo: "all", appliesToProductIds: [], ...over,
  };
}
function percent(id: string, rate: string, basisChargeIds: string[] = [], over: Partial<ChargeInput> = {}): ChargeInput {
  return { ...fixed(id, "", "value"), kind: "percent", rate, basisChargeIds, ...over };
}
function estimate(products: ProductInput[], charges: ChargeInput[], over: Partial<EstimateInputs> = {}): EstimateInputs {
  return {
    name: "Test", reference: "", origin: "Miami", destination: "Aruba", notes: "",
    supplierCurrency: "USD", reportingCurrency: "USD", exchangeRate: "", products, charges, ...over,
  };
}
const three = () => [product("a"), product("b"), product("c")];

describe("parseNumber", () => {
  it("keeps blank distinct from zero and rejects ambiguous text", () => {
    expect(parseNumber("").state).toBe("blank");
    expect(parseNumber("   ").state).toBe("blank");
    expect(parseNumber("0").state).toBe("ok");
    expect(parseNumber(".5").state).toBe("ok");
    expect(parseNumber("1,250.00").state).toBe("invalid");
    expect(parseNumber("-3").state).toBe("invalid");
    expect(parseNumber("12abc").state).toBe("invalid");
    expect(parseNumber("1e3").state).toBe("invalid");
  });
});

describe("largest-remainder allocation", () => {
  it("splits 100.00 three ways without losing a cent", () => {
    const r = calculate(estimate(three(), [fixed("f", "100", "cases")]));
    const rows = r.charges[0].rows.map((x) => x.allocated);
    expect(rows).toEqual(["33.34", "33.33", "33.33"]);
    expect(r.charges[0].allocatedTotal).toBe("100.00");
    expect(r.charges[0].reconciles).toBe(true);
  });

  it("splits 0.01 and 0.02 across three products", () => {
    for (const amount of ["0.01", "0.02", "0.05", "1000000.01"]) {
      const r = calculate(estimate(three(), [fixed("f", amount, "cases")]));
      expect(sumCents(r.charges[0].rows.map((x) => x.allocated))).toBe(cents(amount));
    }
  });

  it("is exact for many random-ish splits", () => {
    let seed = 7;
    const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
    for (let t = 0; t < 200; t += 1) {
      const n = 2 + Math.floor(rand() * 9);
      const total = (Math.floor(rand() * 5_000_000) / 100).toFixed(2);
      const prods = Array.from({ length: n }, (_, i) =>
        product(`p${i}`, { cases: String(1 + Math.floor(rand() * 500)), weightPerCase: (0.1 + rand() * 60).toFixed(3) }),
      );
      const r = calculate(estimate(prods, [fixed("f", total, "weight")]));
      expect(r.charges[0].status).toBe("allocated");
      expect(sumCents(r.charges[0].rows.map((x) => x.allocated))).toBe(cents(total));
      for (const row of r.charges[0].rows) expect(Math.abs(Number(row.adjustment))).toBeLessThan(0.01);
    }
  });

});

describe("allocation methods reconcile to the cent", () => {
  const prods = () => [
    product("a", { costPerCase: "18.75", cases: "7", unitsPerCase: "12", length: "13", width: "11", height: "7", weightPerCase: "9.3", pallets: "0.5" }),
    product("b", { costPerCase: "42.10", cases: "13", unitsPerCase: "6", length: "20", width: "16", height: "9.5", weightPerCase: "31", pallets: "1.5" }),
    product("c", { costPerCase: "3.333", cases: "101", unitsPerCase: "100", volumeMode: "direct", volumePerCase: "0.031", volumeUnit: "cbm", weightPerCase: "2.2", weightUnit: "kg", pallets: "3" }),
  ];
  const methods: AllocationMethod[] = ["volume", "weight", "value", "cases", "pallets"];
  for (const method of methods) {
    it(method, () => {
      const r = calculate(estimate(prods(), [fixed("f", "1000.01", method)]));
      expect(r.issues).toEqual([]);
      expect(r.isComplete).toBe(true);
      const ch = r.charges[0];
      expect(ch.status).toBe("allocated");
      expect(sumCents(ch.rows.map((x) => x.allocated))).toBe(100001);
      expect(ch.reconciles).toBe(true);
      const shares = ch.rows.reduce((a, x) => a + Number(x.sharePercent), 0);
      expect(shares).toBeCloseTo(100, 2);
      expect(r.totals.reconciles).toBe(true);
    });
  }

  it("converts inches and pounds correctly", () => {
    const r = calculate(estimate([product("a", { cases: "2" })], [fixed("v", "10", "volume"), fixed("w", "10", "weight")]));
    // 12in cube = 1 cuft = 0.028316846592 m3, two cases
    expect(r.products[0].totalVolumeCbm).toBe("0.0566");
    expect(r.charges[0].rows[0].basisValue).toBe("0.0566");
    // 10 lb x 2 = 9.0718474 kg
    expect(r.products[0].totalWeightKg).toBe("9.0718");
  });

  it("direct assignment puts the whole charge on one product", () => {
    const r = calculate(estimate(three(), [fixed("f", "55.55", "direct", { directProductId: "b" })]));
    expect(r.products.map((p) => p.allocatedCharges)).toEqual(["0.00", "55.55", "0.00"]);
    expect(r.isComplete).toBe(true);
  });

  it("direct assignment without a product is an issue", () => {
    const r = calculate(estimate(three(), [fixed("f", "55.55", "direct", { directProductId: "gone" })]));
    expect(r.isComplete).toBe(false);
    expect(r.charges[0].status).toBe("unallocated");
    expect(r.totals.unallocatedCharges).toBe(1);
  });

  it("zero total basis cannot be allocated", () => {
    const prods = three().map((p) => ({ ...p, pallets: "0" }));
    const r = calculate(estimate(prods, [fixed("f", "10", "pallets")]));
    expect(r.charges[0].status).toBe("unallocated");
    expect(r.issues.some((i) => i.severity === "invalid" && /zero/.test(i.message))).toBe(true);
  });
});

describe("manual splits", () => {
  it("accepts amounts that add up", () => {
    const r = calculate(estimate(three(), [fixed("f", "100", "manual_amount", { manualSplit: { a: "50", b: "30.5", c: "19.5" } })]));
    expect(r.isComplete).toBe(true);
    expect(r.charges[0].rows.map((x) => x.allocated)).toEqual(["50.00", "30.50", "19.50"]);
  });

  it("rejects amounts that do not reconcile", () => {
    const r = calculate(estimate(three(), [fixed("f", "100", "manual_amount", { manualSplit: { a: "50", b: "30", c: "19.99" } })]));
    expect(r.isComplete).toBe(false);
    expect(r.charges[0].status).toBe("unallocated");
    expect(r.issues[0].message).toMatch(/does not reconcile/);
    expect(r.issues[0].message).toMatch(/99\.99/);
  });

  it("rejects percentages that do not total 100", () => {
    const r = calculate(estimate(three(), [fixed("f", "100", "manual_percent", { manualSplit: { a: "50", b: "30", c: "19" } })]));
    expect(r.isComplete).toBe(false);
    expect(r.issues[0].message).toMatch(/99%/);
  });

  it("allocates percent splits exactly", () => {
    const r = calculate(estimate(three(), [fixed("f", "0.10", "manual_percent", { manualSplit: { a: "33.3333", b: "33.3333", c: "33.3334" } })]));
    expect(r.isComplete).toBe(true);
    expect(sumCents(r.charges[0].rows.map((x) => x.allocated))).toBe(10);
  });

  it("does not treat a blank split entry as zero", () => {
    const r = calculate(estimate(three(), [fixed("f", "100", "manual_amount", { manualSplit: { a: "60", b: "40" } })]));
    expect(r.isComplete).toBe(false);
    expect(r.charges[0].status).toBe("unallocated");
    expect(r.issues.some((i) => i.severity === "missing" && /Product c/.test(i.message))).toBe(true);
  });

  it("manual amounts in another currency still sum to the converted charge", () => {
    const r = calculate(
      estimate(three(), [fixed("f", "100", "manual_amount", { currency: "AWG", manualSplit: { a: "33.33", b: "33.33", c: "33.34" } })], {
        exchangeRate: "1.79",
      }),
    );
    expect(r.charges[0].amount).toBe("55.87"); // 100 / 1.79 = 55.8659...
    expect(sumCents(r.charges[0].rows.map((x) => x.allocated))).toBe(5587);
  });
});

describe("currency", () => {
  it("needs no rate when everything is in the reporting currency", () => {
    const r = calculate(estimate(three(), [fixed("f", "10", "cases")]));
    expect(r.conversionNeeded).toBe(false);
    expect(r.exchangeRate).toBeNull();
    expect(r.isComplete).toBe(true);
  });

  it("never assumes a rate: a needed but blank rate makes the estimate incomplete", () => {
    const r = calculate(estimate(three(), [fixed("f", "10", "cases")], { reportingCurrency: "AWG" }));
    expect(r.conversionNeeded).toBe(true);
    expect(r.isComplete).toBe(false);
    expect(r.issues.some((i) => i.field === "exchangeRate" && i.severity === "missing")).toBe(true);
    expect(r.totals.grandTotal).toBeNull();
    expect(r.products[0].landedTotal).toBeNull();
    expect(r.charges[0].status).toBe("unallocated");
  });

  it("rejects a zero rate", () => {
    const r = calculate(estimate(three(), [], { reportingCurrency: "AWG", exchangeRate: "0" }));
    expect(r.issues.some((i) => i.field === "exchangeRate" && i.severity === "invalid")).toBe(true);
  });

  it("converts USD to AWG", () => {
    const r = calculate(
      estimate([product("a", { costPerCase: "10", cases: "3" })], [fixed("f", "100", "cases")], {
        reportingCurrency: "AWG", exchangeRate: "1.80",
      }),
    );
    expect(r.products[0].supplierValueOriginal).toBe("30.00");
    expect(r.products[0].supplierValue).toBe("54.00");
    expect(r.charges[0].amount).toBe("180.00");
    expect(r.totals.grandTotal).toBe("234.00");
    expect(r.exchangeRate).toBe("1.8");
  });

  it("converts AWG to USD and allocates the converted amount exactly", () => {
    const r = calculate(
      estimate(three(), [fixed("f", "100", "cases", { currency: "AWG" })], { exchangeRate: "1.79" }),
    );
    expect(r.charges[0].originalAmount).toBe("100.00");
    expect(r.charges[0].amount).toBe("55.87");
    expect(sumCents(r.charges[0].rows.map((x) => x.allocated))).toBe(5587);
    expect(r.charges[0].conversion).toMatch(/÷ 1\.79/);
  });
});

describe("percentage charges", () => {
  it("applies the rate to product value only", () => {
    const r = calculate(estimate([product("a", { costPerCase: "100", cases: "2" }), product("b", { costPerCase: "33.33", cases: "1" })], [percent("d", "12")]));
    expect(r.charges[0].rows.map((x) => x.allocated)).toEqual(["24.00", "4.00"]);
    expect(r.charges[0].amount).toBe("28.00");
    expect(r.charges[0].method).toBe("12% of product value");
    expect(r.isComplete).toBe(true);
  });

  it("includes selected charges in the basis and chains in dependency order", () => {
    const prods = [product("a", { costPerCase: "100", cases: "1" }), product("b", { costPerCase: "300", cases: "1" })];
    // Listed out of order on purpose: tax depends on duty, duty depends on freight.
    const r = calculate(
      estimate(prods, [
        percent("tax", "6", ["freight", "duty"]),
        percent("duty", "10", ["freight"]),
        fixed("freight", "40", "value"),
      ]),
    );
    const [tax, duty, freight] = r.charges;
    expect(freight.rows.map((x) => x.allocated)).toEqual(["10.00", "30.00"]);
    expect(duty.rows.map((x) => x.basisValue)).toEqual(["110.00", "330.00"]);
    expect(duty.rows.map((x) => x.allocated)).toEqual(["11.00", "33.00"]);
    expect(tax.rows.map((x) => x.basisValue)).toEqual(["121.00", "363.00"]);
    expect(tax.rows.map((x) => x.allocated)).toEqual(["7.26", "21.78"]);
    expect(r.totals.grandTotal).toBe((400 + 40 + 44 + 29.04).toFixed(2));
    expect(r.totals.reconciles).toBe(true);
    expect(r.isComplete).toBe(true);
  });

  it("can be limited to selected products", () => {
    const r = calculate(estimate(three(), [percent("d", "50", [], { appliesTo: "selected", appliesToProductIds: ["b"] })]));
    expect(r.products.map((p) => p.allocatedCharges)).toEqual(["0.00", "5.00", "0.00"]);
  });

  it("detects circular bases", () => {
    const r = calculate(estimate(three(), [percent("x", "5", ["y"]), percent("y", "5", ["x"]), percent("z", "5", ["z"])]));
    expect(r.isComplete).toBe(false);
    expect(r.charges.every((c) => c.status === "unallocated")).toBe(true);
    expect(r.issues.filter((i) => /circular/.test(i.message))).toHaveLength(3);
  });

  it("a blank rate is missing, an explicit 0% is valid", () => {
    const blank = calculate(estimate(three(), [percent("d", "")]));
    expect(blank.isComplete).toBe(false);
    expect(blank.charges[0].status).toBe("unallocated");
    const zero = calculate(estimate(three(), [percent("d", "0")]));
    expect(zero.isComplete).toBe(true);
    expect(zero.charges[0].amount).toBe("0.00");
  });

  it("is blocked when a charge in its basis cannot be allocated", () => {
    const r = calculate(estimate(three(), [fixed("f", "", "cases"), percent("d", "10", ["f"])]));
    expect(r.charges[1].status).toBe("unallocated");
    expect(r.charges[1].reason).toMatch(/Charge f/);
  });
});

describe("missing and invalid inputs", () => {
  it("a blank amount is not zero", () => {
    const r = calculate(estimate(three(), [fixed("f", "", "cases")]));
    expect(r.isComplete).toBe(false);
    expect(r.charges[0].status).toBe("unallocated");
    expect(r.charges[0].amount).toBeNull();
    expect(r.totals.allocatedCharges).toBe("0.00");
    expect(r.totals.unallocatedCharges).toBe(1);
    expect(r.products.every((p) => !p.complete)).toBe(true);
  });

  it("an explicit zero amount is valid", () => {
    const r = calculate(estimate(three(), [fixed("f", "0", "cases")]));
    expect(r.isComplete).toBe(true);
    expect(r.charges[0].allocatedTotal).toBe("0.00");
  });

  it("blank supplier cost leaves the product and totals unknown", () => {
    const r = calculate(estimate([product("a", { costPerCase: "" }), product("b")], []));
    expect(r.isComplete).toBe(false);
    expect(r.products[0].supplierValue).toBeNull();
    expect(r.products[0].landedTotal).toBeNull();
    expect(r.products[1].landedTotal).toBe("10.00");
    expect(r.totals.grandTotal).toBeNull();
  });

  it("flags partial dimensions as an invalid conversion, only when volume is used", () => {
    const prods = [product("a", { height: "" }), product("b")];
    expect(calculate(estimate(prods, [fixed("f", "10", "cases")])).isComplete).toBe(true);
    const r = calculate(estimate(prods, [fixed("f", "10", "volume")]));
    expect(r.isComplete).toBe(false);
    expect(r.issues[0]).toMatchObject({ severity: "invalid", field: "dimensions" });
    expect(r.charges[0].status).toBe("unallocated");
  });

  it("reports each missing measure once even when several charges use it", () => {
    const prods = [product("a", { weightPerCase: "" }), product("b")];
    const r = calculate(estimate(prods, [fixed("f", "10", "weight"), fixed("g", "20", "weight")]));
    expect(r.issues.filter((i) => i.field === "weightPerCase")).toHaveLength(1);
    expect(r.totals.unallocatedCharges).toBe(2);
  });

  it("rejects fractional or zero cases and units, and non-numeric text", () => {
    const r = calculate(
      estimate([product("a", { cases: "2.5" }), product("b", { unitsPerCase: "0" }), product("c", { costPerCase: "12,50" })], []),
    );
    expect(r.issues.map((i) => i.field)).toEqual(["cases", "unitsPerCase", "costPerCase"]);
    expect(r.issues.every((i) => i.severity === "invalid")).toBe(true);
  });

  it("requires at least one product", () => {
    const r = calculate(estimate([], [fixed("f", "10", "cases")]));
    expect(r.isComplete).toBe(false);
    expect(r.totals.grandTotal).toBeNull();
  });

  it("rejects amounts with more than two decimals", () => {
    const r = calculate(estimate(three(), [fixed("f", "10.005", "cases")]));
    expect(r.charges[0].status).toBe("unallocated");
  });
});

describe("realistic Miami to Aruba container", () => {
  const inputs = estimate(
    [
      product("cups", { name: "12oz hot cups", sku: "CUP-12", costPerCase: "38.40", cases: "420", unitsPerCase: "1000", length: "22", width: "18", height: "20", weightPerCase: "21.5", pallets: "10.5" }),
      product("boxes", { name: "14in pizza boxes", sku: "PZB-14", costPerCase: "17.85", cases: "600", unitsPerCase: "50", length: "29", width: "15", height: "9", weightPerCase: "24", pallets: "12" }),
      product("napkins", { name: "Dinner napkins", sku: "NAP-D", costPerCase: "26.10", cases: "275", unitsPerCase: "3000", volumeMode: "direct", volumePerCase: "2.9", volumeUnit: "cuft", weightPerCase: "8.2", weightUnit: "kg", pallets: "5.5" }),
    ],
    [
      fixed("ocean", "4875.00", "volume", { name: "Ocean freight" }),
      fixed("inland", "650.00", "pallets", { name: "Miami inland / consolidation" }),
      fixed("insurance", "212.37", "value", { name: "Cargo insurance" }),
      fixed("handling", "1480.00", "weight", { name: "Aruba port handling", currency: "AWG" }),
      fixed("broker", "350.00", "cases", { name: "Customs broker", currency: "AWG" }),
      fixed("artwork", "125.00", "direct", { name: "Print plate fee", directProductId: "cups" }),
      percent("duty", "12", ["ocean", "insurance"], { name: "Import duty (example rate)" }),
      percent("levy", "1.5", ["ocean", "insurance", "duty"], { name: "Example levy", appliesTo: "selected", appliesToProductIds: ["cups", "boxes"] }),
    ],
    { name: "Container MIA-AUA example", reportingCurrency: "AWG", exchangeRate: "1.79" },
  );
  const r = calculate(inputs);

  it("is complete and every charge reconciles", () => {
    expect(r.issues).toEqual([]);
    expect(r.isComplete).toBe(true);
    for (const ch of r.charges) {
      expect(ch.status).toBe("allocated");
      expect(ch.reconciles).toBe(true);
      expect(sumCents(ch.rows.map((x) => x.allocated))).toBe(cents(ch.amount));
    }
  });

  it("fixed charges equal the original charges converted at the entered rate", () => {
    const byId = Object.fromEntries(r.charges.map((c) => [c.chargeId, c]));
    expect(byId.ocean.amount).toBe("8726.25");      // 4875.00 x 1.79
    expect(byId.inland.amount).toBe("1163.50");     // 650.00 x 1.79
    expect(byId.insurance.amount).toBe("380.14");   // 212.37 x 1.79 = 380.1423
    expect(byId.handling.amount).toBe("1480.00");   // already AWG
    expect(byId.broker.amount).toBe("350.00");
    expect(byId.artwork.amount).toBe("223.75");
    expect(byId.ocean.originalAmount).toBe("4875.00");
  });

  it("product totals add up to the shipment total", () => {
    const value = sumCents(r.products.map((p) => p.supplierValue));
    const charges = sumCents(r.charges.map((c) => c.amount));
    expect(cents(r.totals.supplierValue)).toBe(value);
    expect(cents(r.totals.allocatedCharges)).toBe(charges);
    expect(cents(r.totals.grandTotal)).toBe(value + charges);
    expect(sumCents(r.products.map((p) => p.landedTotal))).toBe(value + charges);
    expect(r.totals.reconciles).toBe(true);
    for (const p of r.products) {
      expect(cents(p.landedTotal)).toBe(cents(p.supplierValue) + sumCents(Object.values(p.chargeAllocations)));
      expect(Number(p.landedPerCase)).toBeCloseTo(Number(p.landedTotal) / Number(p.cases), 4);
      expect(Number(p.landedPerUnit)).toBeCloseTo(Number(p.landedTotal) / Number(p.totalUnits), 4);
    }
  });

  it("is deterministic and stamps the engine version", () => {
    expect(calculate(inputs)).toEqual(r);
    expect(r.engineVersion).toBe(ENGINE_VERSION);
  });

  it("exports a CSV with inputs, rate, methods, results and breakdown", () => {
    const csv = buildEstimateCsv(
      { estimateName: inputs.name, reference: "", versionNo: 2, savedAt: "16 Nov 2026, 10:00", savedBy: "Tester", note: "" },
      inputs,
      r,
    );
    expect(csv).toContain("Exchange rate (AWG per 1 USD),1.79");
    expect(csv).toContain("Ocean freight");
    expect(csv).toContain("By volume");
    expect(csv).toContain("ALLOCATION BREAKDOWN");
    expect(csv).toContain("reconciles to charge");
    expect(csv).toContain(`SHIPMENT TOTAL`);
    expect(csv).toContain(r.totals.grandTotal!);
  });
});

describe("CSV and input hygiene", () => {
  it("neutralises formula cells but leaves numbers alone", () => {
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1 cmd")).toBe("'+1 cmd");
    expect(csvCell("@x")).toBe("'@x");
    expect(csvCell("-0.004")).toBe("-0.004");
    expect(csvCell('a "quoted", cell')).toBe('"a ""quoted"", cell"');
    expect(csvCell(null)).toBe("");
  });

  it("parseInputs keeps blanks blank and rejects malformed payloads", () => {
    const ok = parseInputs(estimate(three(), [fixed("f", "", "cases")]));
    expect(ok?.charges[0].amount).toBe("");
    expect(parseInputs({ nope: true })).toBeNull();
    expect(parseInputs(estimate([product("a"), product("a")], []))).toBeNull();
  });
});
