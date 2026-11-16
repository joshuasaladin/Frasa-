/**
 * Phase 1 verification, database and API level. Runs against a LOCAL Supabase
 * with the migrations applied (`npm run db:start`), using real signed-in
 * sessions through the public API, exactly as the app and a curious employee
 * with browser dev tools would.
 *
 *   npm run test:db
 *
 * It creates users at @frasa-test.test and rows titled "VERIFY ...", and
 * removes them again at the end.
 */
import { execFileSync } from "node:child_process";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { calculate, ENGINE_VERSION } from "../src/modules/freight/engine.ts";
import type { EstimateInputs } from "../src/modules/freight/types.ts";
import { assertLocalSupabase, loadEnv } from "./lib/env.ts";
import { ensureUser } from "./lib/users.ts";

loadEnv();
assertLocalSupabase();
const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const PASSWORD = "Verify-local-only-1!";
const service = createClient(URL, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ok    ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}
const section = (t: string) => console.log(`\n${t}`);
const sql = (statement: string) => execFileSync("psql", [DB_URL, "-qAt", "-v", "ON_ERROR_STOP=1", "-c", statement], { encoding: "utf8" }).trim();

async function signIn(email: string): Promise<SupabaseClient> {
  const client = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (error) throw new Error(`sign in ${email}: ${error.message}`);
  return client;
}

async function cleanup() {
  sql(`
    delete from public.tasks where title like 'VERIFY%';
    delete from public.task_series where title like 'VERIFY%';
    delete from public.sops where title like 'VERIFY%';
    delete from public.freight_estimates where name like 'VERIFY%';
    alter table public.tasks drop constraint if exists verify_forced_failure;
  `);
  const { data } = await service.from("profiles").select("id").like("email", "%@frasa-test.test");
  for (const p of data ?? []) await service.auth.admin.deleteUser(p.id);
}

await cleanup();
const E = {
  admin: "verify.admin@frasa-test.test",
  lead: "verify.lead@frasa-test.test",
  emp: "verify.employee@frasa-test.test",
  other: "verify.warehouse@frasa-test.test",
};
const adminId = await ensureUser(service, { email: E.admin, name: "Verify Admin", role: "admin", freight: "none", departments: {} }, PASSWORD);
const leadId = await ensureUser(service, { email: E.lead, name: "Verify Lead", role: "department_lead", freight: "edit", departments: { Purchasing: true } }, PASSWORD);
const empId = await ensureUser(service, { email: E.emp, name: "Verify Employee", role: "employee", freight: "none", departments: { Purchasing: false } }, PASSWORD);
const otherId = await ensureUser(service, { email: E.other, name: "Verify Warehouse", role: "employee", freight: "none", departments: { Warehouse: false } }, PASSWORD);
const { data: depts } = await service.from("departments").select("id, name");
const purchasing = depts!.find((d) => d.name === "Purchasing")!.id as string;
const warehouse = depts!.find((d) => d.name === "Warehouse")!.id as string;
const [admin, lead, emp, other] = await Promise.all([signIn(E.admin), signIn(E.lead), signIn(E.emp), signIn(E.other)]);
const anon = createClient(URL, ANON, { auth: { autoRefreshToken: false, persistSession: false } });
const runJobs = (today: string) => service.rpc("run_scheduled_jobs", { p_today: today, p_triggered_by: "verify" });

// ---------------------------------------------------------------------------
section("1. An employee completes an assigned task");
{
  const { data: task, error } = await lead
    .from("tasks")
    .insert({ kind: "shared", title: "VERIFY assigned task", owner_id: empId, department_id: purchasing, due_date: "2027-01-15", priority: "high" })
    .select("id")
    .single();
  check("lead assigns a shared task to a department member", !error && !!task, error?.message);
  const { data: seen } = await emp.from("tasks").select("id, status").eq("id", task!.id).maybeSingle();
  check("the employee sees the task", seen?.status === "open");
  const { data: note } = await emp.from("notifications").select("kind").eq("task_id", task!.id);
  check("the employee got an in-app 'assigned' notification", note?.length === 1 && note[0].kind === "task_assigned");
  const { data: done } = await emp.from("tasks").update({ status: "done" }).eq("id", task!.id).select("status, completed_by, completed_at");
  check("the employee marks it done", done?.[0]?.status === "done" && done[0].completed_by === empId && !!done[0].completed_at);
  const { data: events } = await lead.from("task_events").select("event").eq("task_id", task!.id);
  check("history records creation and completion", ["created", "status_changed"].every((e) => events?.some((x) => x.event === e)));

  const { error: e1 } = await emp.from("tasks").insert({ kind: "shared", title: "VERIFY not allowed", owner_id: leadId, department_id: purchasing, due_date: "2027-01-15" });
  check("an employee cannot assign a shared task to someone else", !!e1);
  const { data: mine } = await emp.from("tasks").insert({ kind: "shared", title: "VERIFY own shared", owner_id: empId, department_id: purchasing, due_date: "2027-01-20" }).select("id").single();
  const { error: e2 } = await emp.from("tasks").update({ owner_id: leadId }).eq("id", mine!.id);
  check("an employee cannot reassign their shared task", !!e2, "update was accepted");
  const { data: hidden } = await other.from("tasks").select("id").eq("id", task!.id);
  check("another department's employee cannot see the task", hidden?.length === 0);
  const { data: personal } = await emp.from("tasks").insert({ kind: "personal", title: "VERIFY personal", owner_id: empId }).select("id").single();
  const [l, a] = await Promise.all([lead.from("tasks").select("id").eq("id", personal!.id), admin.from("tasks").select("id").eq("id", personal!.id)]);
  check("a personal to-do is invisible to the lead and the admin", l.data?.length === 0 && a.data?.length === 0);

  // Attachment: private file, readable by the task's department only.
  const path = `tasks/${task!.id}/verify/quote.txt`;
  const up = await emp.storage.from("attachments").upload(path, new Blob(["supplier quote"]), { contentType: "text/plain" });
  check("the employee attaches a file", !up.error, up.error?.message);
  const okUrl = await lead.storage.from("attachments").createSignedUrl(path, 30);
  const noUrl = await other.storage.from("attachments").createSignedUrl(path, 30);
  const noDownload = await other.storage.from("attachments").download(path);
  check("a colleague in the department can open the file", !!okUrl.data?.signedUrl);
  check("someone outside the department cannot open or download the file", !noUrl.data?.signedUrl && !!noDownload.error);
  const publicFetch = await fetch(`${URL}/storage/v1/object/public/attachments/${path}`);
  check("the file is not publicly reachable", publicFetch.status >= 400);
  await service.storage.from("attachments").remove([path]);
}

// ---------------------------------------------------------------------------
section("2. Recurring tasks: exactly one occurrence, even when the job retries");
{
  const { data: monthly } = await service
    .from("task_series")
    .insert({ title: "VERIFY monthly report", kind: "shared", owner_id: empId, department_id: purchasing, frequency: "monthly", interval_count: 1, schedule_mode: "fixed_schedule", start_date: "2027-03-31", checklist_template: ["Step A", "Step B"], created_by: leadId })
    .select("id")
    .single();
  const sid = monthly!.id as string;
  const occurrences = async () => (await service.from("tasks").select("id, due_date, scheduled_for, occurrence_no").eq("series_id", sid).order("occurrence_no")).data ?? [];

  check("nothing is created before the lead window", (await occurrences()).length === 0);
  await runJobs("2027-03-20");
  await runJobs("2027-03-20"); // retry
  await runJobs("2027-03-21"); // next scheduled run
  await Promise.all([1, 2, 3, 4, 5, 6].map(() => runJobs("2027-03-22"))); // overlapping runs
  let occ = await occurrences();
  check("a monthly task has exactly ONE occurrence after 9 runs (3 retries, 6 concurrent)", occ.length === 1, `found ${occ.length}`);
  check("it is due on the scheduled date (31 Mar)", occ[0]?.due_date === "2027-03-31");
  const { count: items } = await service.from("task_checklist_items").select("id", { count: "exact", head: true }).eq("task_id", occ[0].id);
  check("the checklist was copied once (2 steps, not duplicated)", items === 2, `found ${items}`);

  // Reschedule this occurrence only.
  const { error: moveError } = await lead.from("tasks").update({ due_date: "2027-04-02" }).eq("id", occ[0].id);
  check("the lead reschedules one occurrence", !moveError, moveError?.message);
  await runJobs("2027-04-20");
  await runJobs("2027-04-20");
  await runJobs("2027-05-20");
  await runJobs("2027-05-20");
  occ = await occurrences();
  check("following months add exactly one occurrence each", occ.length === 3, `found ${occ.length}`);
  check("rescheduling did not move the series (30 Apr, then 31 May)", occ[1]?.due_date === "2027-04-30" && occ[2]?.due_date === "2027-05-31", occ.map((o) => o.due_date).join(", "));
  check("the rescheduled occurrence keeps its original scheduled date", occ[0].due_date === "2027-04-02" && occ[0].scheduled_for === "2027-03-31");
  const { data: history } = await service.from("task_events").select("event").eq("task_id", occ[0].id);
  check("each occurrence keeps its own history", history?.some((h) => h.event === "created_from_series") === true && history?.some((h) => h.event === "rescheduled") === true);

  // After-completion mode.
  const today = sql("select app.today()");
  const { data: after } = await service
    .from("task_series")
    .insert({ title: "VERIFY after completion", kind: "shared", owner_id: empId, department_id: purchasing, frequency: "weekly", interval_count: 1, schedule_mode: "after_completion", start_date: today, created_by: leadId })
    .select("id")
    .single();
  const afterTasks = async () => (await service.from("tasks").select("id, due_date, status").eq("series_id", after!.id).order("occurrence_no")).data ?? [];
  await runJobs(today);
  await runJobs(today);
  let ao = await afterTasks();
  check("after-completion: one open occurrence, and no new one while it is open", ao.length === 1);
  await emp.from("tasks").update({ status: "done" }).eq("id", ao[0].id);
  await runJobs(today);
  ao = await afterTasks();
  const expected = sql(`select (app.today() + 7)::text`);
  check("after-completion: finishing it schedules exactly one next occurrence, one week later", ao.length === 2 && ao[1].due_date === expected, ao.map((o) => o.due_date).join(", "));

  // One broken series must not stop the others, and the failure is logged.
  sql(`alter table public.tasks add constraint verify_forced_failure check (title <> 'VERIFY forced failure') not valid`);
  await service.from("task_series").update({ is_active: false }).eq("id", sid);
  sql(`insert into public.task_series (title, kind, owner_id, department_id, frequency, schedule_mode, start_date, is_active, created_by)
       values ('VERIFY forced failure', 'shared', '${empId}', '${purchasing}', 'monthly', 'fixed_schedule', '2027-06-01', false, '${leadId}'),
              ('VERIFY healthy series', 'shared', '${empId}', '${purchasing}', 'monthly', 'fixed_schedule', '2027-06-01', false, '${leadId}');`);
  sql(`alter table public.task_series disable trigger task_series_after_update;
       update public.task_series set is_active = true where title in ('VERIFY forced failure', 'VERIFY healthy series');
       alter table public.task_series enable trigger task_series_after_update;`);
  const { data: runs } = await runJobs("2027-06-01");
  const recurring = (runs as { job_name: string; status: string; detail: { failures?: { title: string }[] } }[]).find((r) => r.job_name === "recurring_tasks");
  check("a failing series is logged as a failure (run status 'partial')", recurring?.status === "partial" && recurring.detail.failures?.[0]?.title === "VERIFY forced failure", JSON.stringify(recurring));
  const { count: healthy } = await service.from("tasks").select("id", { count: "exact", head: true }).eq("title", "VERIFY healthy series");
  check("the other series still got its task", healthy === 1);
  sql(`alter table public.tasks drop constraint verify_forced_failure`);
  await runJobs("2027-06-01");
  const { count: recovered } = await service.from("tasks").select("id", { count: "exact", head: true }).eq("title", "VERIFY forced failure");
  check("the failed series is retried successfully on the next run", recovered === 1);
  const failedId = sql(`select app.run_job('no_such_job', app.today(), 'verify')`);
  const failedRun = sql(`select status || ':' || coalesce(error, '') from public.job_runs where id = ${Number(failedId)}`);
  check("a job that throws is recorded as failed with its error", failedRun.startsWith("failed:Unknown job"), failedRun);
  sql(`update public.task_series set is_active = false where title like 'VERIFY%'`);
}

// ---------------------------------------------------------------------------
section("3. Reminders and overdue escalation are sent once");
{
  await service.from("notifications").delete().in("user_id", [empId, leadId, adminId]);
  const base = { kind: "shared", owner_id: empId, department_id: purchasing, created_by: leadId };
  const { data: t } = await service
    .from("tasks")
    .insert([
      { ...base, title: "VERIFY due soon", due_date: "2027-08-11", escalate_overdue: false },
      { ...base, title: "VERIFY overdue escalated", due_date: "2027-08-05", escalate_overdue: true, remind_days_before: 0 },
      { ...base, title: "VERIFY overdue quiet", due_date: "2027-08-05", escalate_overdue: false, remind_days_before: 0 },
    ])
    .select("id, title");
  const id = (title: string) => t!.find((x) => x.title === title)!.id;
  await runJobs("2027-08-10");
  await runJobs("2027-08-10");
  await Promise.all([runJobs("2027-08-10"), runJobs("2027-08-10")]);
  const { data: reminders } = await emp.from("notifications").select("task_id, title").eq("kind", "task_reminder");
  check("the owner gets exactly one reminder the day before", reminders?.filter((r) => r.task_id === id("VERIFY due soon")).length === 1, JSON.stringify(reminders));
  const { data: escalations } = await lead.from("notifications").select("task_id").eq("kind", "task_overdue");
  check("the department lead gets exactly one overdue notice", escalations?.filter((r) => r.task_id === id("VERIFY overdue escalated")).length === 1);
  check("no escalation when it is switched off on the task", !escalations?.some((r) => r.task_id === id("VERIFY overdue quiet")));
  const { data: adminNotes } = await admin.from("notifications").select("id").eq("kind", "task_overdue").in("task_id", t!.map((x) => x.id));
  check("admins are not notified while the department has a lead", adminNotes?.length === 0);
  await runJobs("2027-08-11");
  const { data: again } = await emp.from("notifications").select("id").eq("kind", "task_reminder").eq("task_id", id("VERIFY due soon"));
  check("still one reminder on the due date itself", again?.length === 1);
  const { data: leaked } = await emp.from("notifications").select("id").eq("kind", "task_overdue");
  check("employees cannot read the lead's notifications", leaked?.length === 0);
}

// ---------------------------------------------------------------------------
section("4. SOP editor publishes a revision and collects acknowledgments");
let sopId = "";
{
  const created = await lead.rpc("sop_create", { p_title: "VERIFY receiving a container", p_department_id: purchasing, p_category_id: null as unknown as string, p_owner_id: leadId });
  sopId = created.data as string;
  check("the lead creates a draft SOP", !created.error && !!sopId, created.error?.message);
  const { data: v1 } = await lead.from("sop_versions").select("id").eq("sop_id", sopId).single();
  check("employees cannot see a draft", ((await emp.from("sops").select("id").eq("id", sopId)).data ?? []).length === 0);
  const early = await lead.rpc("sop_publish", { p_version_id: v1!.id, p_requires_ack: true, p_change_summary: "" });
  check("publishing is refused until purpose, steps and review date exist", !!early.error);
  await lead.from("sop_versions").update({ purpose: "Version one purpose", steps: [{ title: "Check seal", detail: "Compare with the bill of lading" }] }).eq("id", v1!.id);
  await lead.from("sops").update({ next_review_date: "2027-12-01", tags: ["receiving"] }).eq("id", sopId);
  const forged = await lead.from("sop_versions").update({ status: "published" } as never).eq("id", v1!.id);
  check("status cannot be changed by writing to the table directly", !!forged.error);
  check("an employee cannot publish", !!(await emp.rpc("sop_publish", { p_version_id: v1!.id, p_requires_ack: false, p_change_summary: "" })).error);
  const pub = await lead.rpc("sop_publish", { p_version_id: v1!.id, p_requires_ack: true, p_change_summary: "First version" });
  check("the lead publishes version 1 and requests acknowledgment", !pub.error, pub.error?.message);
  const again = await lead.rpc("sop_publish", { p_version_id: v1!.id, p_requires_ack: true, p_change_summary: "First version" });
  const { count: publishedAudit } = await service.from("audit_log").select("id", { count: "exact", head: true }).eq("action", "sop.published").eq("entity_id", sopId);
  check("a repeated publish call changes nothing", !again.error && publishedAudit === 1);
  const { data: found } = await emp.from("sops").select("id").eq("status", "published").ilike("search_text", "%bill of lading%");
  check("the employee finds it by searching step text", found?.some((s) => s.id === sopId) === true);
  const { data: askNote } = await emp.from("notifications").select("id").eq("kind", "sop_ack_requested").eq("sop_id", sopId);
  check("the employee is notified once that acknowledgment is requested", askNote?.length === 1);

  check("the employee acknowledges version 1", !(await emp.from("sop_acknowledgments").insert({ sop_version_id: v1!.id, user_id: empId })).error);
  check("nobody can acknowledge on someone else's behalf", !!(await emp.from("sop_acknowledgments").insert({ sop_version_id: v1!.id, user_id: otherId })).error);
  const { data: acks } = await lead.from("sop_acknowledgments").select("user_id").eq("sop_version_id", v1!.id);
  check("the lead sees who has acknowledged", acks?.length === 1 && acks[0].user_id === empId);
  const { data: peek } = await other.from("sop_acknowledgments").select("user_id").eq("sop_version_id", v1!.id);
  check("other employees cannot see who acknowledged", peek?.length === 0);

  const rev = await lead.rpc("sop_start_revision", { p_sop_id: sopId });
  const v2 = rev.data as string;
  await lead.from("sop_versions").update({ purpose: "Version two purpose" }).eq("id", v2);
  const { data: empView } = await emp.from("sops").select("current:sop_versions!sops_current_version_fk(version_no, purpose)").eq("id", sopId).single();
  const current = empView?.current as unknown as { version_no: number; purpose: string };
  check("while a revision is drafted, employees still see the published version", current.version_no === 1 && current.purpose === "Version one purpose");
  check("employees cannot read the draft revision", ((await emp.from("sop_versions").select("id").eq("id", v2)).data ?? []).length === 0);
  await lead.rpc("sop_publish", { p_version_id: v2, p_requires_ack: true, p_change_summary: "Clarified purpose" });
  const { data: versions } = await emp.from("sop_versions").select("version_no, status").eq("sop_id", sopId).order("version_no");
  check("publishing the revision supersedes version 1 and keeps it in the history", versions?.map((v) => v.status).join(",") === "superseded,published");
  const { data: acks2 } = await lead.from("sop_acknowledgments").select("user_id").eq("sop_version_id", v2);
  check("acknowledgment is per version: version 2 starts with none", acks2?.length === 0);
  await emp.from("sop_acknowledgments").insert({ sop_version_id: v2, user_id: empId });
  const { data: acks3 } = await lead.from("sop_acknowledgments").select("user_id").eq("sop_version_id", v2);
  check("the employee's acknowledgment of version 2 is recorded", acks3?.length === 1);
  const { data: audit } = await admin.from("audit_log").select("detail").eq("action", "sop.published").eq("entity_id", sopId);
  check("both publications are in the audit log", audit?.length === 2);
}

// ---------------------------------------------------------------------------
section("5. A freight estimate reconciles to the original shipment charges");
let estimateId = "";
{
  const product = (id: string, name: string, cost: string, cases: string, units: string, dims: [string, string, string], weight: string, pallets: string) => ({
    id, name, sku: "", costPerCase: cost, cases, unitsPerCase: units, volumeMode: "dimensions" as const, dimUnit: "in" as const,
    length: dims[0], width: dims[1], height: dims[2], volumePerCase: "", volumeUnit: "cuft" as const, weightPerCase: weight, weightUnit: "lb" as const, pallets,
  });
  const fixed = (id: string, name: string, amount: string, currency: "USD" | "AWG", allocation: string, extra: object = {}) => ({
    id, name, kind: "fixed" as const, amount, currency, allocation, directProductId: "", manualSplit: {}, rate: "", basisChargeIds: [], appliesTo: "all" as const, appliesToProductIds: [], ...extra,
  });
  const inputs = {
    name: "VERIFY Miami to Aruba container", reference: "VERIFY-1", origin: "Miami", destination: "Aruba", notes: "",
    supplierCurrency: "USD", reportingCurrency: "AWG", exchangeRate: "1.7925",
    products: [
      product("a", "Cups", "41.37", "333", "1000", ["20", "16", "22"], "18.5", "7"),
      product("b", "Boxes", "23.11", "617", "50", ["15", "15", "10"], "21", "11"),
      product("c", "Napkins", "18.79", "251", "6000", ["17", "13", "9"], "24.3", "5"),
    ],
    charges: [
      fixed("f", "Ocean freight", "3257.77", "USD", "volume"),
      fixed("i", "Insurance", "185.01", "USD", "value"),
      fixed("h", "Local handling", "540.10", "AWG", "pallets"),
      fixed("w", "Trucking", "100.00", "USD", "weight"),
      fixed("k", "Documentation", "100.00", "AWG", "cases"),
      fixed("m", "Inspection", "250.00", "USD", "manual_percent", { manualSplit: { a: "33.33", b: "33.33", c: "33.34" } }),
      fixed("d", "Plate fee", "120.00", "USD", "direct", { directProductId: "a" }),
      { ...fixed("t", "Duty (test rate)", "", "AWG", "value"), kind: "percent" as const, rate: "6.5", basisChargeIds: ["f", "i"] },
    ],
  } as unknown as EstimateInputs;
  const r = calculate(inputs);
  const cents = (v: string | null | undefined) => Math.round(Number(v) * 100);
  check("the estimate is complete (no missing inputs)", r.isComplete && r.issues.length === 0, JSON.stringify(r.issues));
  const rate = 1.7925;
  let allReconcile = true;
  let chargeTotal = 0;
  for (const c of r.charges as unknown as { chargeId: string; name: string; amount: string }[]) {
    const input = inputs.charges.find((x) => x.id === c.chargeId)!;
    const allocated = r.products.reduce((sum, p) => sum + cents(p.chargeAllocations[c.chargeId] ?? "0"), 0);
    chargeTotal += allocated;
    if (input.kind === "fixed") {
      const original = input.currency === "USD" ? Math.round(Number(input.amount) * rate * 100) : cents(input.amount);
      if (allocated !== original || cents(c.amount) !== original) {
        allReconcile = false;
        console.log(`        ${c.name}: allocated ${allocated} vs original ${original} (engine ${c.amount})`);
      }
    }
  }
  check("every shared charge's allocations add up to the original charge, to the cent (7 charges, 6 methods)", allReconcile);
  const supplier = r.products.reduce((s, p) => s + cents(p.supplierValue), 0);
  const landed = r.products.reduce((s, p) => s + cents(p.landedTotal), 0);
  check("products + charges = shipment total", landed === supplier + chargeTotal && cents(r.totals.grandTotal) === landed && r.totals.reconciles === true, `${landed} vs ${supplier}+${chargeTotal}`);
  check("supplier value was converted at the entered rate", supplier === [41.37 * 333, 23.11 * 617, 18.79 * 251].reduce((s, v) => s + Math.round(v * rate * 100), 0), String(supplier));

  const blank = calculate({ ...inputs, exchangeRate: "" });
  check("a blank exchange rate is reported as missing, never assumed", !blank.isComplete && blank.issues.some((i) => /exchange rate/i.test(i.message)) && blank.totals.grandTotal == null);
  const bad = calculate({ ...inputs, charges: inputs.charges.map((c) => (c.id === "m" ? { ...c, manualSplit: { a: "50", b: "30", c: "10" } } : c)) });
  check("a manual split that does not total 100% is rejected", !bad.isComplete && bad.issues.some((i) => i.refId === "m"));

  const save = (client: SupabaseClient, id: string | null, inp: EstimateInputs, note: string) => {
    const res = calculate(inp);
    return client.rpc("freight_save_version", {
      p_estimate_id: id, p_name: inp.name, p_reference: inp.reference, p_inputs: inp, p_results: res, p_is_complete: res.isComplete,
      p_reporting_currency: res.reportingCurrency, p_grand_total: res.totals.grandTotal, p_engine_version: ENGINE_VERSION, p_note: note,
    });
  };
  const s1 = await save(lead, null, inputs, "first");
  estimateId = (s1.data as { estimate_id: string }[] | null)?.[0]?.estimate_id ?? "";
  check("a user with edit access saves the estimate", !s1.error && !!estimateId, s1.error?.message);
  await save(lead, estimateId, { ...inputs, exchangeRate: "1.80" }, "new rate");
  const { data: versions } = await lead.from("freight_estimate_versions").select("version_no, inputs, results").eq("estimate_id", estimateId).order("version_no");
  const v1 = versions?.[0] as { inputs: EstimateInputs; results: { totals: { grandTotal: string } } };
  check("editing saves version 2 and leaves version 1's inputs, rate and results untouched", versions?.length === 2 && v1.inputs.exchangeRate === "1.7925" && v1.results.totals.grandTotal === r.totals.grandTotal);
  const tamper = await lead.from("freight_estimate_versions").update({ note: "changed" } as never).eq("estimate_id", estimateId);
  const removal = await lead.from("freight_estimate_versions").delete().eq("estimate_id", estimateId);
  check("saved versions cannot be edited or deleted", !!tamper.error && !!removal.error);
  const { data: audit } = await admin.from("audit_log").select("action").eq("entity_type", "freight_estimate").eq("entity_id", estimateId);
  check("saving and editing are in the audit log", audit?.some((a) => a.action === "freight_estimate.created") === true && audit?.some((a) => a.action === "freight_estimate.edited") === true);
}

// ---------------------------------------------------------------------------
section("6. Access: no freight access means no data, and roles cannot be self-granted");
{
  const byId = await emp.from("freight_estimates").select("*").eq("id", estimateId);
  const all = await emp.from("freight_estimates").select("id");
  const versions = await emp.from("freight_estimate_versions").select("*").eq("estimate_id", estimateId);
  check("an employee without freight access gets no estimate by id through the API", byId.data?.length === 0 && all.data?.length === 0);
  check("…and no saved versions (inputs, costs, results)", versions.data?.length === 0);
  const raw = await fetch(`${URL}/rest/v1/freight_estimate_versions?estimate_id=eq.${estimateId}&select=inputs`, {
    headers: { apikey: ANON, Authorization: `Bearer ${(await emp.auth.getSession()).data.session!.access_token}` },
  });
  check("…also with a hand-written API request", raw.ok && (await raw.json()).length === 0);
  const write = await emp.rpc("freight_save_version", { p_estimate_id: estimateId, p_name: "x", p_reference: "", p_inputs: {}, p_results: {}, p_is_complete: false, p_reporting_currency: "AWG", p_grand_total: 0, p_engine_version: "x", p_note: "" });
  check("…and cannot save one", !!write.error);
  check("admins do not get freight access automatically", ((await admin.from("freight_estimates").select("id")).data ?? []).length === 0);
  await emp.from("tasks").insert({ kind: "personal", title: "VERIFY linked", owner_id: empId, freight_estimate_id: estimateId });
  const { data: linked } = await emp.from("tasks").select("freight_estimate_id, estimate:freight_estimates(name)").eq("title", "VERIFY linked").single();
  check("a task link to an estimate reveals nothing about it", (linked as { estimate: unknown } | null)?.estimate === null);

  const self = await emp.from("profiles").update({ role: "admin", freight_access: "edit" }).eq("id", empId).select("id");
  const { data: still } = await service.from("profiles").select("role, freight_access").eq("id", empId).single();
  check("an employee cannot change their own role or freight access", (self.data ?? []).length === 0 && still?.role === "employee" && still.freight_access === "none");
  check("an employee cannot read the audit log or job log", ((await emp.from("audit_log").select("id")).data ?? []).length === 0 && ((await emp.from("job_runs").select("id")).data ?? []).length === 0);
  check("an employee cannot run the jobs", !!(await emp.rpc("admin_run_jobs")).error && !!(await emp.rpc("run_scheduled_jobs", {})).error);
  check("the lead cannot manage users", ((await lead.from("profiles").update({ role: "admin" }).eq("id", leadId).select("id")).data ?? []).length === 0);
  const anonRead = await Promise.all(["profiles", "tasks", "sops", "freight_estimates", "notifications"].map((t) => anon.from(t).select("*").limit(1)));
  check("without signing in, the API returns nothing", anonRead.every((res) => (res.data ?? []).length === 0));
  check("self sign-up is disabled (invite only)", !!(await anon.auth.signUp({ email: "intruder@frasa-test.test", password: PASSWORD })).error);

  const grant = await admin.from("profiles").update({ freight_access: "view" }).eq("id", empId).select("id");
  const { data: roleAudit } = await admin.from("audit_log").select("actor_id").eq("action", "user.freight_access_changed").eq("entity_id", empId);
  check("an admin grants freight access, and it is audited with the admin's name", grant.data?.length === 1 && roleAudit?.[0]?.actor_id === adminId);
  check("with view access the employee can read the estimate but still not save", ((await emp.from("freight_estimates").select("id").eq("id", estimateId)).data ?? []).length === 1
    && !!(await emp.rpc("freight_save_version", { p_estimate_id: estimateId, p_name: "x", p_reference: "", p_inputs: {}, p_results: {}, p_is_complete: false, p_reporting_currency: "AWG", p_grand_total: 0, p_engine_version: "x", p_note: "" })).error);
  await admin.from("profiles").update({ role: "department_lead" }).eq("id", otherId);
  const { data: roleChange } = await admin.from("audit_log").select("detail").eq("action", "user.role_changed").eq("entity_id", otherId);
  check("role changes are audited", roleChange?.length === 1);
  const lastAdmin = await admin.from("profiles").update({ role: "employee" }).eq("role", "admin").select("id");
  const { count: admins } = await service.from("profiles").select("id", { count: "exact", head: true }).eq("role", "admin").eq("is_active", true);
  check("the last active admin cannot be removed", !!lastAdmin.error && (admins ?? 0) >= 1);

  await service.from("profiles").update({ is_active: false }).eq("id", empId);
  const after = await Promise.all([emp.from("tasks").select("id"), emp.from("sops").select("id"), emp.from("profiles").select("id"), emp.from("freight_estimates").select("id")]);
  check("a deactivated user's existing session can no longer read anything", after.every((res) => (res.data ?? []).length === 0));
}

await cleanup();
console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
