/**
 * Loads clearly labelled DEMO data into a LOCAL Supabase for development.
 *
 *   npm run seed:demo
 *
 * It refuses to run against anything that is not 127.0.0.1 / localhost. Every
 * record it creates is flagged is_demo and named "DEMO ...". Demo users use the
 * reserved domain frasa-demo.test, which cannot receive email.
 * Running it again resets the demo users' passwords and adds nothing twice.
 */
import { randomBytes } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { calculate, ENGINE_VERSION } from "../src/modules/freight/engine.ts";
import type { EstimateInputs } from "../src/modules/freight/types.ts";
import { assertLocalSupabase, loadEnv } from "./lib/env.ts";
import { ensureUser, type SeedUser } from "./lib/users.ts";

loadEnv();
assertLocalSupabase();
const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const password = process.env.DEMO_PASSWORD ?? `Demo-${randomBytes(6).toString("hex")}`;

const USERS: SeedUser[] = [
  { email: "demo.admin@frasa-demo.test", name: "Demo Admin", role: "admin", freight: "edit", departments: { Administration: false } },
  { email: "demo.lead@frasa-demo.test", name: "Demo Purchasing Lead", role: "department_lead", freight: "edit", departments: { Purchasing: true, Logistics: true } },
  { email: "demo.buyer@frasa-demo.test", name: "Demo Buyer", role: "employee", freight: "view", departments: { Purchasing: false } },
  { email: "demo.warehouse@frasa-demo.test", name: "Demo Warehouse Employee", role: "employee", freight: "none", departments: { Warehouse: false, Logistics: false } },
];

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Aruba" }).format(new Date());
const day = (offset: number) => {
  const d = new Date(`${today}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
};
const must = <T,>(r: { data: T; error: { message: string } | null }): T => {
  if (r.error) throw new Error(r.error.message);
  return r.data;
};

const ids: Record<string, string> = {};
for (const u of USERS) ids[u.email] = await ensureUser(admin, u, password);
const [adminId, leadId, buyerId, warehouseId] = USERS.map((u) => ids[u.email]);
const departments = must(await admin.from("departments").select("id, name"));
const dept = (name: string) => departments!.find((d) => d.name === name)!.id as string;

const { count } = await admin.from("tasks").select("id", { count: "exact", head: true }).eq("is_demo", true);
if (count) {
  console.log("Demo records already exist; only the demo users were refreshed.");
} else {
  // --- Freight estimate with invented numbers ---------------------------------
  const inputs: EstimateInputs = {
    name: "DEMO - Miami to Aruba container (invented numbers)",
    reference: "DEMO-0001",
    origin: "Miami",
    destination: "Aruba",
    notes: "Demo data. Every cost, charge and rate here is invented.",
    supplierCurrency: "USD",
    reportingCurrency: "AWG",
    exchangeRate: "1.80",
    products: [
      { id: "p1", name: "DEMO Paper cups 12oz", sku: "DEMO-CUP12", costPerCase: "42.50", cases: "400", unitsPerCase: "1000", volumeMode: "dimensions", dimUnit: "in", length: "20", width: "16", height: "22", volumePerCase: "", volumeUnit: "cuft", weightPerCase: "18", weightUnit: "lb", pallets: "10" },
      { id: "p2", name: "DEMO Pizza boxes 14in", sku: "DEMO-PZ14", costPerCase: "23.10", cases: "600", unitsPerCase: "50", volumeMode: "dimensions", dimUnit: "in", length: "15", width: "15", height: "10", volumePerCase: "", volumeUnit: "cuft", weightPerCase: "21", weightUnit: "lb", pallets: "12" },
      { id: "p3", name: "DEMO Napkins", sku: "DEMO-NAP", costPerCase: "18.75", cases: "250", unitsPerCase: "6000", volumeMode: "direct", dimUnit: "in", length: "", width: "", height: "", volumePerCase: "2.4", volumeUnit: "cuft", weightPerCase: "24", weightUnit: "lb", pallets: "5" },
    ],
    charges: [
      { id: "c1", name: "Ocean freight", kind: "fixed", amount: "3250.00", currency: "USD", allocation: "volume", directProductId: "", manualSplit: {}, rate: "", basisChargeIds: [], appliesTo: "all", appliesToProductIds: [] },
      { id: "c2", name: "Insurance", kind: "fixed", amount: "185.00", currency: "USD", allocation: "value", directProductId: "", manualSplit: {}, rate: "", basisChargeIds: [], appliesTo: "all", appliesToProductIds: [] },
      { id: "c3", name: "Local handling", kind: "fixed", amount: "540.00", currency: "AWG", allocation: "pallets", directProductId: "", manualSplit: {}, rate: "", basisChargeIds: [], appliesTo: "all", appliesToProductIds: [] },
      { id: "c4", name: "Print plate fee (cups only)", kind: "fixed", amount: "120.00", currency: "USD", allocation: "direct", directProductId: "p1", manualSplit: {}, rate: "", basisChargeIds: [], appliesTo: "all", appliesToProductIds: [] },
      { id: "c5", name: "Import duty (invented rate)", kind: "percent", amount: "", currency: "AWG", allocation: "value", directProductId: "", manualSplit: {}, rate: "5", basisChargeIds: ["c1", "c2"], appliesTo: "all", appliesToProductIds: [] },
    ],
  };
  const results = calculate(inputs);
  const estimate = must(
    await admin
      .from("freight_estimates")
      .insert({ name: inputs.name, reference: inputs.reference, current_version_no: 1, is_complete: results.isComplete, reporting_currency: results.reportingCurrency, grand_total: results.totals.grandTotal, is_demo: true, created_by: leadId, updated_by: leadId })
      .select("id")
      .single(),
  )!;
  must(await admin.from("freight_estimate_versions").insert({ estimate_id: estimate.id, version_no: 1, inputs, results, is_complete: results.isComplete, engine_version: ENGINE_VERSION, note: "Demo data", created_by: leadId }));

  // --- Tasks ---------------------------------------------------------------------
  const shared = { kind: "shared", is_demo: true, created_by: leadId };
  must(
    await admin.from("tasks").insert([
      { ...shared, title: "DEMO Request quote for 12oz paper cups", owner_id: buyerId, department_id: dept("Purchasing"), due_date: day(-2), priority: "high", escalate_overdue: true, description: "Demo data." },
      { ...shared, title: "DEMO Review freight estimate DEMO-0001", owner_id: buyerId, department_id: dept("Purchasing"), due_date: day(0), priority: "normal", freight_estimate_id: estimate.id, description: "Demo data." },
      { ...shared, title: "DEMO Confirm container pickup date with forwarder", owner_id: leadId, department_id: dept("Logistics"), due_date: day(3), priority: "normal", description: "Demo data." },
      { ...shared, title: "DEMO Clear receiving bay for Thursday container", owner_id: warehouseId, department_id: dept("Warehouse"), due_date: day(1), priority: "urgent", escalate_overdue: true, created_by: adminId, description: "Demo data." },
      { kind: "personal", is_demo: true, created_by: buyerId, title: "DEMO Call supplier about sample shipment", owner_id: buyerId, due_date: day(5), priority: "low", description: "Demo data." },
    ], { defaultToNull: false }),
  );
  const first = must(await admin.from("tasks").select("id").eq("title", "DEMO Request quote for 12oz paper cups").single())!;
  must(await admin.from("task_checklist_items").insert([
    { task_id: first.id, label: "Confirm specification with sales", position: 1, is_done: true },
    { task_id: first.id, label: "Send quote request", position: 2 },
    { task_id: first.id, label: "Attach quote to this task", position: 3 },
  ], { defaultToNull: false }));

  // --- Recurring series ------------------------------------------------------------
  must(
    await admin.from("task_series").insert([
      { title: "DEMO Month-end stock count", kind: "shared", owner_id: warehouseId, department_id: dept("Warehouse"), frequency: "monthly", interval_count: 1, schedule_mode: "fixed_schedule", start_date: day(7), checklist_template: ["Count fast movers", "Count slow movers", "Report differences to administration"], escalate_overdue: true, is_demo: true, created_by: adminId },
      { title: "DEMO Check forklift battery water", kind: "shared", owner_id: warehouseId, department_id: dept("Warehouse"), frequency: "weekly", interval_count: 2, schedule_mode: "after_completion", start_date: day(0), is_demo: true, created_by: adminId },
    ], { defaultToNull: false }),
  );
  must(await admin.rpc("run_scheduled_jobs", { p_triggered_by: "seed" }));
  console.log("Demo tasks, recurring tasks and one freight estimate created (all labelled DEMO).");
}

console.log("\nDemo sign-ins (local only):");
for (const u of USERS) console.log(`  ${u.email.padEnd(34)} ${u.role.padEnd(16)} freight: ${u.freight}`);
console.log(`  password: ${password}\n`);
