/**
 * Freight estimate data shapes. Everything a user types is kept as a string so a
 * blank stays blank: the engine never turns a missing input into zero.
 */
export type Currency = "USD" | "AWG";
export const CURRENCIES: Currency[] = ["USD", "AWG"];

export type AllocationMethod =
  | "volume"
  | "weight"
  | "value"
  | "cases"
  | "pallets"
  | "manual_amount"
  | "manual_percent"
  | "direct";

export const ALLOCATION_LABELS: Record<AllocationMethod, string> = {
  volume: "By volume",
  weight: "By weight",
  value: "By product value",
  cases: "By case count",
  pallets: "By pallet count",
  manual_amount: "Manual split (amounts)",
  manual_percent: "Manual split (percent)",
  direct: "Directly to one product",
};
export const ALLOCATION_METHODS = Object.keys(ALLOCATION_LABELS) as AllocationMethod[];

export type ProductInput = {
  id: string;
  name: string;
  sku: string;
  /** Supplier cost per case, in the shipment's supplier currency. */
  costPerCase: string;
  cases: string;
  unitsPerCase: string;
  /** How the case volume is given. */
  volumeMode: "dimensions" | "direct";
  dimUnit: "in" | "cm";
  length: string;
  width: string;
  height: string;
  volumePerCase: string;
  volumeUnit: "cuft" | "cbm";
  weightPerCase: string;
  weightUnit: "lb" | "kg";
  pallets: string;
};

export type ChargeInput = {
  id: string;
  name: string;
  /** fixed = an amount of money; percent = a rate applied to a stated basis. */
  kind: "fixed" | "percent";
  // fixed
  amount: string;
  currency: Currency;
  allocation: AllocationMethod;
  directProductId: string;
  /** productId -> amount (in the charge currency) or percent, depending on allocation. */
  manualSplit: Record<string, string>;
  // percent
  rate: string;
  /** Charges added to the product value to form the basis (e.g. freight + insurance). */
  basisChargeIds: string[];
  appliesTo: "all" | "selected";
  appliesToProductIds: string[];
};

export type EstimateInputs = {
  name: string;
  reference: string;
  origin: string;
  destination: string;
  notes: string;
  supplierCurrency: Currency;
  reportingCurrency: Currency;
  /** AWG per 1 USD. Required only when a conversion is needed. */
  exchangeRate: string;
  products: ProductInput[];
  charges: ChargeInput[];
};

export type Issue = {
  severity: "missing" | "invalid";
  scope: "shipment" | "product" | "charge";
  refId: string | null;
  field: string | null;
  message: string;
};

export type ProductResult = {
  productId: string;
  name: string;
  sku: string;
  cases: string | null;
  unitsPerCase: string | null;
  totalUnits: string | null;
  /** cost per case x cases, in the supplier currency. */
  supplierValueOriginal: string | null;
  /** The same value in the reporting currency. */
  supplierValue: string | null;
  totalVolumeCbm: string | null;
  totalWeightKg: string | null;
  pallets: string | null;
  /** chargeId -> amount allocated to this product (reporting currency). */
  chargeAllocations: Record<string, string>;
  allocatedCharges: string;
  landedTotal: string | null;
  /** Rounded for display to 4 decimals; totals are exact to the cent. */
  landedPerCase: string | null;
  landedPerUnit: string | null;
  /** False when an input is missing or a charge could not be allocated. */
  complete: boolean;
};

export type AllocationRow = {
  productId: string;
  name: string;
  basisValue: string;
  sharePercent: string;
  unrounded: string;
  allocated: string;
  /** allocated - unrounded */
  adjustment: string;
};

export type ChargeResult = {
  chargeId: string;
  name: string;
  kind: "fixed" | "percent";
  status: "allocated" | "unallocated";
  /** Why the charge could not be allocated. */
  reason: string | null;
  /** Human-readable method, e.g. "By volume" or "7% of product value + Ocean freight". */
  method: string;
  basisUnit: string;
  originalAmount: string | null;
  originalCurrency: Currency | null;
  /** Charge total in the reporting currency. */
  amount: string | null;
  conversion: string | null;
  rate: string | null;
  totalBasis: string | null;
  rows: AllocationRow[];
  allocatedTotal: string | null;
  /** allocatedTotal === amount */
  reconciles: boolean;
};

export type EstimateResults = {
  engineVersion: string;
  isComplete: boolean;
  issues: Issue[];
  supplierCurrency: Currency;
  reportingCurrency: Currency;
  /** The rate actually used (AWG per 1 USD), or null when no conversion was needed. */
  exchangeRate: string | null;
  conversionNeeded: boolean;
  products: ProductResult[];
  charges: ChargeResult[];
  totals: {
    totalCases: string | null;
    totalUnits: string | null;
    supplierValue: string | null;
    allocatedCharges: string;
    unallocatedCharges: number;
    grandTotal: string | null;
    /** supplier value + allocated charges === sum of product landed totals */
    reconciles: boolean;
  };
};

let counter = 0;
export function newId(prefix: string): string {
  counter += 1;
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}${counter.toString(36)}`;
}

export function blankProduct(): ProductInput {
  return {
    id: newId("p"),
    name: "",
    sku: "",
    costPerCase: "",
    cases: "",
    unitsPerCase: "",
    volumeMode: "dimensions",
    dimUnit: "in",
    length: "",
    width: "",
    height: "",
    volumePerCase: "",
    volumeUnit: "cuft",
    weightPerCase: "",
    weightUnit: "lb",
    pallets: "",
  };
}

export function blankCharge(currency: Currency = "USD"): ChargeInput {
  return {
    id: newId("c"),
    name: "",
    kind: "fixed",
    amount: "",
    currency,
    allocation: "volume",
    directProductId: "",
    manualSplit: {},
    rate: "",
    basisChargeIds: [],
    appliesTo: "all",
    appliesToProductIds: [],
  };
}

export function blankInputs(): EstimateInputs {
  return {
    name: "",
    reference: "",
    origin: "Miami, FL",
    destination: "Oranjestad, Aruba",
    notes: "",
    supplierCurrency: "USD",
    reportingCurrency: "AWG",
    exchangeRate: "",
    products: [blankProduct()],
    charges: [],
  };
}
