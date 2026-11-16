import { z } from "zod";
import { ALLOCATION_METHODS, type AllocationMethod, type EstimateInputs } from "./types";

/**
 * Normalises untrusted input (a form post, a stored version, admin defaults)
 * into EstimateInputs. It only checks shape and size; the engine validates the
 * numbers and reports what is missing.
 */
const text = (max: number) =>
  z
    .union([z.string(), z.number()])
    .transform((v) => String(v).slice(0, max))
    .catch("");
const id = z.string().min(1).max(64);
const currency = z.enum(["USD", "AWG"]);

const product = z.object({
  id,
  name: text(200),
  sku: text(80),
  costPerCase: text(30),
  cases: text(30),
  unitsPerCase: text(30),
  volumeMode: z.enum(["dimensions", "direct"]).catch("dimensions"),
  dimUnit: z.enum(["in", "cm"]).catch("in"),
  length: text(30),
  width: text(30),
  height: text(30),
  volumePerCase: text(30),
  volumeUnit: z.enum(["cuft", "cbm"]).catch("cuft"),
  weightPerCase: text(30),
  weightUnit: z.enum(["lb", "kg"]).catch("lb"),
  pallets: text(30),
});

const charge = z.object({
  id,
  name: text(200),
  kind: z.enum(["fixed", "percent"]).catch("fixed"),
  amount: text(30),
  currency: currency.catch("USD"),
  allocation: z.enum(ALLOCATION_METHODS as [AllocationMethod, ...AllocationMethod[]]).catch("volume"),
  directProductId: text(64),
  manualSplit: z.record(z.string().max(64), text(30)).catch({}),
  rate: text(30),
  basisChargeIds: z.array(id).max(50).catch([]),
  appliesTo: z.enum(["all", "selected"]).catch("all"),
  appliesToProductIds: z.array(id).max(200).catch([]),
});

const inputsSchema = z.object({
  name: text(200),
  reference: text(200),
  origin: text(200),
  destination: text(200),
  notes: text(4000),
  supplierCurrency: currency.catch("USD"),
  reportingCurrency: currency.catch("AWG"),
  exchangeRate: text(30),
  products: z.array(product).max(200),
  charges: z.array(charge).max(50),
});

export function parseInputs(raw: unknown): EstimateInputs | null {
  const parsed = inputsSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  const ids = [...data.products.map((p) => p.id), ...data.charges.map((c) => c.id)];
  if (new Set(ids).size !== ids.length) return null; // ids must be unique
  return {
    ...data,
    name: data.name.trim(),
    reference: data.reference.trim(),
  };
}
