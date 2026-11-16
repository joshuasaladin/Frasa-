import { ALLOCATION_LABELS, type EstimateInputs, type EstimateResults } from "./types";

type Cell = string | number | null | undefined;

/**
 * Spreadsheet programs run cells that start with = + - @ as formulas. Text cells
 * that start that way are prefixed with an apostrophe; plain numbers are left alone.
 */
export function csvCell(value: Cell): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export type CsvMeta = {
  estimateName: string;
  reference: string;
  versionNo: number;
  savedAt: string;
  savedBy: string;
  note: string;
};

export function buildEstimateCsv(meta: CsvMeta, inputs: EstimateInputs, results: EstimateResults): string {
  const rows: Cell[][] = [];
  const cur = results.reportingCurrency;
  const section = (title: string) => rows.push([], [title]);

  rows.push(["Frasa HQ freight estimate"]);
  rows.push(["Status", results.isComplete ? "Complete" : "INCOMPLETE - do not use for pricing"]);
  rows.push(["Estimate", meta.estimateName]);
  rows.push(["Reference", meta.reference]);
  rows.push(["Version", meta.versionNo]);
  rows.push(["Saved at (Aruba time)", meta.savedAt]);
  rows.push(["Saved by", meta.savedBy]);
  rows.push(["Version note", meta.note]);
  rows.push(["Calculation engine", results.engineVersion]);
  rows.push(["Origin", inputs.origin]);
  rows.push(["Destination", inputs.destination]);
  rows.push(["Supplier cost currency", inputs.supplierCurrency]);
  rows.push(["Reporting currency", inputs.reportingCurrency]);
  rows.push([
    "Exchange rate (AWG per 1 USD)",
    results.conversionNeeded ? (results.exchangeRate ?? "MISSING") : "not needed",
    results.conversionNeeded ? "" : inputs.exchangeRate ? `entered: ${inputs.exchangeRate}` : "",
  ]);
  rows.push(["Notes", inputs.notes]);

  if (results.issues.length > 0) {
    section("ISSUES");
    rows.push(["Type", "Message"]);
    for (const issue of results.issues) rows.push([issue.severity, issue.message]);
  }

  section("PRODUCT INPUTS");
  rows.push([
    "Product", "SKU", `Supplier cost per case (${inputs.supplierCurrency})`, "Cases", "Units per case",
    "Volume entered as", "Length", "Width", "Height", "Dimension unit", "Volume per case", "Volume unit",
    "Weight per case", "Weight unit", "Pallets",
  ]);
  for (const p of inputs.products) {
    rows.push([
      p.name, p.sku, p.costPerCase, p.cases, p.unitsPerCase, p.volumeMode,
      p.length, p.width, p.height, p.dimUnit, p.volumePerCase, p.volumeUnit,
      p.weightPerCase, p.weightUnit, p.pallets,
    ]);
  }

  section("CHARGE INPUTS");
  rows.push(["Charge", "Type", "Amount", "Currency", "Rate %", "Allocation / basis", `Amount in ${cur}`, "Conversion", "Status"]);
  inputs.charges.forEach((ch, i) => {
    const r = results.charges[i];
    rows.push([
      r?.name ?? ch.name,
      ch.kind === "fixed" ? "Fixed amount" : "Percentage",
      ch.kind === "fixed" ? ch.amount : "",
      ch.kind === "fixed" ? ch.currency : "",
      ch.kind === "percent" ? ch.rate : "",
      r?.method ?? ALLOCATION_LABELS[ch.allocation],
      r?.amount ?? "",
      r?.conversion ?? "",
      r?.status === "allocated" ? "Allocated" : `NOT ALLOCATED: ${r?.reason ?? ""}`,
    ]);
  });

  section(`RESULTS BY PRODUCT (${cur})`);
  rows.push([
    "Product", "SKU", "Cases", "Units", `Supplier value (${inputs.supplierCurrency})`, `Supplier value (${cur})`,
    ...results.charges.map((c) => c.name),
    "Allocated charges", "Landed total", "Landed cost per case (4 dp)", "Landed cost per unit (4 dp)",
  ]);
  for (const p of results.products) {
    rows.push([
      p.name, p.sku, p.cases, p.totalUnits, p.supplierValueOriginal, p.supplierValue,
      ...results.charges.map((c) => (c.status === "allocated" ? (p.chargeAllocations[c.chargeId] ?? "0.00") : "n/a")),
      p.allocatedCharges, p.landedTotal, p.landedPerCase, p.landedPerUnit,
    ]);
  }
  rows.push([
    "SHIPMENT TOTAL", "", results.totals.totalCases, results.totals.totalUnits, "", results.totals.supplierValue,
    ...results.charges.map((c) => (c.status === "allocated" ? c.allocatedTotal : "n/a")),
    results.totals.allocatedCharges, results.totals.grandTotal, "", "",
  ]);

  section("ALLOCATION BREAKDOWN");
  rows.push([
    "Charge", "Method", "Product", "Basis value", "Basis unit", "Share / rate %",
    `Unrounded (${cur})`, `Allocated (${cur})`, "Rounding adjustment",
  ]);
  for (const c of results.charges) {
    if (c.status !== "allocated") {
      rows.push([c.name, c.method, "NOT ALLOCATED", c.reason]);
      continue;
    }
    for (const r of c.rows) {
      rows.push([c.name, c.method, r.name, r.basisValue, c.basisUnit, r.sharePercent, r.unrounded, r.allocated, r.adjustment]);
    }
    rows.push([
      c.name, "Check", "Total", c.totalBasis, c.basisUnit, "", c.amount, c.allocatedTotal,
      c.reconciles ? "reconciles to charge" : "DOES NOT RECONCILE",
    ]);
  }

  section("RECONCILIATION");
  rows.push([`Supplier value (${cur})`, results.totals.supplierValue]);
  rows.push([`Allocated charges (${cur})`, results.totals.allocatedCharges]);
  rows.push(["Charges not allocated", results.totals.unallocatedCharges]);
  rows.push([`Shipment total (${cur})`, results.totals.grandTotal]);
  rows.push(["Sum of product landed totals equals shipment total", results.totals.reconciles ? "yes" : "NO"]);

  // BOM so Excel reads UTF-8; CRLF line endings per RFC 4180.
  return "﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
