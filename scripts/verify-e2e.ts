/**
 * Phase 1 verification through the real app in a browser (Playwright/Chromium).
 * Needs: local Supabase running with migrations applied, and the app running
 * (`npm run build && npm run start`, or `npm run dev`) on APP_URL.
 *
 *   npm run test:e2e
 *
 * Creates users at @frasa-test.test and records titled "VERIFY ...". Run it on
 * a local database only (it refuses anything else).
 */
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { createClient } from "@supabase/supabase-js";
import type { Browser, Page } from "playwright";
import { assertLocalSupabase, loadEnv } from "./lib/env.ts";
import { ensureUser } from "./lib/users.ts";

loadEnv();
assertLocalSupabase();
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE ?? "playwright") as typeof import("playwright");

const APP = (process.env.APP_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
const SUPABASE = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const MAIL = process.env.MAILPIT_URL ?? "http://127.0.0.1:54324";
const PASSWORD = "Verify-local-only-1!";
const SHOTS = process.env.SCREENSHOT_DIR;
const service = createClient(SUPABASE, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } });

let passed = 0;
const failures: string[] = [];
function check(name: string, ok: boolean, detail = "") {
  if (ok) passed++;
  else failures.push(name);
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${name}${!ok && detail ? ` — ${detail}` : ""}`);
}
const section = (t: string) => console.log(`\n${t}`);
const shot = async (page: Page, name: string) => {
  if (SHOTS) await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
};

async function cleanup() {
  for (const [table, column] of [["tasks", "title"], ["task_series", "title"], ["sops", "title"], ["freight_estimates", "name"]] as const) {
    await service.from(table).delete().like(column, "VERIFY%");
  }
  const { data } = await service.from("profiles").select("id").like("email", "%@frasa-test.test");
  for (const p of data ?? []) {
    await service.from("tasks").delete().eq("owner_id", p.id);
    await service.auth.admin.deleteUser(p.id);
  }
}

async function newPage(browser: Browser, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  page.setDefaultTimeout(15_000);
  page.on("dialog", (dialog) => void dialog.accept()); // "Are you sure?" prompts
  return page;
}

async function signIn(page: Page, email: string, password = PASSWORD) {
  await page.goto(`${APP}/login`);
  await page.getByLabel("Work email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(`${APP}/`);
}

await cleanup();
const E = {
  admin: "e2e.admin@frasa-test.test",
  lead: "e2e.lead@frasa-test.test",
  invited: "e2e.invited@frasa-test.test",
};
const leadId = await ensureUser(service, { email: E.lead, name: "Elena Lead", role: "department_lead", freight: "edit", departments: { Purchasing: true } }, PASSWORD);
await service.from("profiles").update({ is_demo: false }).eq("id", leadId);
const browser = await chromium.launch();

try {
  // -------------------------------------------------------------------------
  section("A. First admin account and invitation");
  const adminPage = await newPage(browser);
  {
    const out = execFileSync("npx", ["tsx", "scripts/create-admin.ts", E.admin, "Ada Admin"], { encoding: "utf8" });
    const link = /http\S+token_hash=\S+/.exec(out)?.[0];
    check("create-admin prints a one-time password link", !!link);
    await adminPage.goto(link!.replace(/^https?:\/\/[^/]+/, APP));
    await adminPage.getByLabel("New password").fill(PASSWORD);
    await adminPage.getByLabel("Repeat password").fill(PASSWORD);
    await adminPage.getByRole("button", { name: /Save password/ }).click();
    await adminPage.waitForURL(`${APP}/`);
    check("the first admin chooses a password and lands on My Work", await adminPage.getByRole("heading", { name: /Ada/ }).isVisible());
    check("the admin sees the Admin navigation", await adminPage.getByRole("link", { name: "Users" }).first().isVisible());

    await adminPage.goto(`${APP}/admin/users`);
    await adminPage.getByLabel("Work email").fill(E.invited);
    await adminPage.getByLabel("Full name").fill("Emilio Employee");
    await adminPage.getByRole("checkbox", { name: "Purchasing" }).check();
    await adminPage.getByRole("button", { name: "Send invitation" }).click();
    await adminPage.getByText(`Invitation sent to ${E.invited}`).waitFor();
    check("the admin invites an employee", true);
    await shot(adminPage, "e2e-admin-users");
  }

  const empPage = await newPage(browser, { width: 390, height: 844 }); // a phone on the warehouse floor
  {
    let link = "";
    for (let i = 0; i < 20 && !link; i++) {
      const list = (await (await fetch(`${MAIL}/api/v1/search?query=${encodeURIComponent(`to:${E.invited}`)}`)).json()) as { messages: { ID: string }[] };
      if (list.messages?.length) {
        const message = (await (await fetch(`${MAIL}/api/v1/message/${list.messages[0].ID}`)).json()) as { HTML: string };
        link = /href="([^"]*\/auth\/confirm[^"]*)"/.exec(message.HTML)?.[1]?.replace(/&amp;/g, "&") ?? "";
      } else await new Promise((r) => setTimeout(r, 500));
    }
    check("the invitation email arrives with a link to Frasa HQ", link.includes("type=invite"), link);
    await empPage.goto(link.replace(/^https?:\/\/[^/]+/, APP));
    await empPage.getByLabel("New password").fill(PASSWORD);
    await empPage.getByLabel("Repeat password").fill(PASSWORD);
    await empPage.getByRole("button", { name: /Save password/ }).click();
    await empPage.waitForURL(`${APP}/`);
    check("the invited employee sets a password and is signed in", await empPage.getByRole("heading", { name: /Emilio/ }).isVisible());
    const { data: profile } = await service.from("profiles").select("role, freight_access").eq("email", E.invited).single();
    check("a new account starts as employee without freight access", profile?.role === "employee" && profile.freight_access === "none");

    const stranger = await newPage(browser);
    await stranger.goto(`${APP}/tasks`);
    check("signed-out visitors are sent to the sign-in page", stranger.url().startsWith(`${APP}/login`));
    await stranger.goto(`${APP}/login`);
    await stranger.getByLabel("Work email").fill(E.invited);
    await stranger.getByLabel("Password").fill("wrong-password-123");
    await stranger.getByRole("button", { name: "Sign in" }).click();
    check("a wrong password is refused", await stranger.getByText(/do not match/).isVisible().catch(() => false) || (await stranger.getByText(/do not match/).waitFor().then(() => true)));
    await stranger.context().close();
  }

  // -------------------------------------------------------------------------
  section("B. An employee signs in and completes an assigned task");
  const leadPage = await newPage(browser);
  await signIn(leadPage, E.lead);
  let taskUrl = "";
  {
    await leadPage.goto(`${APP}/tasks/new`);
    await leadPage.getByRole("button", { name: /Shared task/ }).click();
    await leadPage.locator("input[name=title]").fill("VERIFY Request quote for branded cups");
    await leadPage.locator("select[name=department_id]").selectOption({ label: "Purchasing" });
    await leadPage.locator("select[name=owner_id]").selectOption({ label: "Emilio Employee" });
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Aruba" }).format(new Date());
    await leadPage.locator("input[name=due_date]").fill(today);
    await leadPage.locator("select[name=priority]").selectOption("high");
    await leadPage.locator("textarea[name=checklist]").fill("Confirm specification\nSend request to supplier");
    await leadPage.getByRole("button", { name: "Create task" }).click();
    await leadPage.waitForURL(/\/tasks\/[0-9a-f-]{36}$/);
    taskUrl = leadPage.url();
    check("the department lead assigns a shared task to the employee", await leadPage.getByText("Emilio Employee").first().isVisible());

    await empPage.goto(`${APP}/`);
    const row = empPage.locator('a[href^="/tasks/"]', { hasText: "VERIFY Request quote for branded cups" }).first();
    check("it appears under 'Due today' on the employee's My Work page", await row.isVisible());
    check("the employee has an unread 'Assigned to you' reminder", await empPage.getByText(/Assigned to you: VERIFY Request quote/).first().isVisible());
    await shot(empPage, "e2e-employee-home-phone");
    await row.click();
    await empPage.waitForURL(taskUrl);
    await empPage.getByRole("button", { name: "Confirm specification", exact: true }).click();
    await empPage.getByText("1 of 2 done").waitFor();
    await empPage.getByLabel("Comment").fill("Quote requested from the supplier.");
    await empPage.getByRole("button", { name: "Add comment" }).click();
    await empPage.getByText("Quote requested from the supplier.").first().waitFor();
    await shot(empPage, "e2e-employee-task-phone");
    await empPage.getByRole("button", { name: "Mark as done" }).click();
    await empPage.getByText("Done", { exact: true }).first().waitFor();
    const { data: task } = await service.from("tasks").select("status, completed_by, owner_id").like("title", "VERIFY Request quote%").single();
    check("the employee ticks a step, comments and marks the task done", task?.status === "done" && task.completed_by === task.owner_id);
    await empPage.goto(`${APP}/`);
    check("the finished task leaves My Work", !(await empPage.locator('a[href^="/tasks/"]', { hasText: "VERIFY Request quote for branded cups" }).first().isVisible().catch(() => false)));
    await leadPage.goto(taskUrl);
    check("the lead sees the completion in the task history", await leadPage.getByText(/changed the status from To do to Done/).isVisible());
  }

  // -------------------------------------------------------------------------
  section("C. An SOP editor publishes a revision and collects acknowledgments");
  let sopUrl = "";
  {
    await leadPage.goto(`${APP}/sops/new`);
    await leadPage.locator("[name=title]").fill("VERIFY Receiving a supplier quote");
    await leadPage.locator("select[name=department_id]").selectOption({ label: "Purchasing" });
    await leadPage.getByRole("button", { name: "Create draft" }).click();
    await leadPage.waitForURL(/\/sops\/[0-9a-f-]{36}\/edit/);
    sopUrl = leadPage.url().replace(/\/edit.*$/, "");
    await leadPage.locator("[name=purpose]").fill("Make sure every quote can be compared.");
    await leadPage.locator("[name=next_review_date]").fill("2027-06-30");
    await leadPage.locator("[name=tags]").fill("quote, supplier");
    if (!(await leadPage.getByLabel("Step 1 title").isVisible().catch(() => false))) await leadPage.getByRole("button", { name: /Add (a |another )?step/i }).click();
    await leadPage.getByLabel("Step 1 title").fill("Check the quote is complete");
    await leadPage.getByLabel(/Request acknowledgment/).check();
    await leadPage.locator("button[name=intent][value=publish]").click();
    await leadPage.waitForURL(sopUrl);
    check("the lead writes and publishes version 1, requesting acknowledgment", await leadPage.getByText("Check the quote is complete").isVisible());

    await empPage.goto(`${APP}/sops?q=quote+compared`);
    const hit = empPage.getByRole("link", { name: /VERIFY Receiving a supplier quote/ }).first();
    check("the employee finds the SOP by searching the library", await hit.isVisible());
    await hit.click();
    await empPage.waitForURL(sopUrl);
    await empPage.getByRole("button", { name: /I have read and understood/ }).click();
    await empPage.getByText(/You acknowledged/i).first().waitFor();
    check("the employee acknowledges version 1", true);
    await shot(empPage, "e2e-employee-sop-phone");

    await leadPage.goto(sopUrl);
    check("the lead sees the employee's acknowledgment", await leadPage.getByRole("row", { name: /Emilio Employee/ }).first().isVisible());

    // Revision: employees keep seeing v1 until v2 is published.
    await leadPage.getByRole("button", { name: "Start a revision" }).first().click();
    await leadPage.waitForURL(/\/edit/);
    await leadPage.locator("[name=purpose]").fill("Make sure every quote can be compared. Revised: include lead time.");
    await leadPage.locator("button[name=intent][value=save]").click();
    await leadPage.getByText(/saved/i).first().waitFor();
    await empPage.goto(sopUrl);
    check("while the revision is a draft, the employee still sees version 1", !(await empPage.getByText(/Revised: include lead time/).isVisible().catch(() => false)) && (await empPage.getByText("Make sure every quote can be compared.").first().isVisible()));
    await leadPage.reload();
    await leadPage.getByLabel(/Request acknowledgment/).check();
    await leadPage.locator("[name=change_summary]").fill("Added lead time");
    await leadPage.locator("button[name=intent][value=publish]").click();
    await leadPage.waitForURL(sopUrl);
    await empPage.goto(sopUrl);
    check("after publishing, the employee sees version 2", await empPage.getByText(/Revised: include lead time/).first().isVisible());
    check("version 2 asks for a fresh acknowledgment", await empPage.getByRole("button", { name: /I have read and understood/ }).isVisible());
    await empPage.getByRole("button", { name: /I have read and understood/ }).click();
    await empPage.getByText(/You acknowledged/i).first().waitFor();
    await leadPage.goto(sopUrl);
    await shot(leadPage, "e2e-lead-sop-acks");
    const sopId = sopUrl.split("/").pop()!;
    const { data: versions } = await service.from("sop_versions").select("id, version_no, status").eq("sop_id", sopId).order("version_no");
    const { count: acks } = await service.from("sop_acknowledgments").select("user_id", { count: "exact", head: true }).in("sop_version_id", versions!.map((v) => v.id));
    check("the database holds v1 superseded, v2 published and one acknowledgment for each", versions?.map((v) => v.status).join(",") === "superseded,published" && acks === 2);
    await empPage.goto(`${sopUrl}/versions/1`);
    check("the superseded version stays readable in the revision history", await empPage.getByText(/Superseded/).first().isVisible());
  }

  // -------------------------------------------------------------------------
  section("D. A freight estimate reconciles to the original shipment charges");
  let estimateId = "";
  {
    await leadPage.goto(`${APP}/freight/new`);
    await leadPage.getByLabel("Estimate name").fill("VERIFY container week 48");
    check("an estimate with blank inputs is labelled INCOMPLETE", await leadPage.getByText("INCOMPLETE").first().isVisible());
    await leadPage.getByLabel(/Exchange rate/).fill("1.79");
    const fillProduct = async (index: number, name: string, cost: string, cases: string, units: string) => {
      await leadPage.getByPlaceholder("Product name").nth(index).fill(name);
      await leadPage.getByLabel(/Cost per case/).nth(index).fill(cost);
      await leadPage.getByLabel("Cases", { exact: true }).nth(index).fill(cases);
      await leadPage.getByLabel("Units per case").nth(index).fill(units);
    };
    await fillProduct(0, "Paper cups", "40.00", "100", "1000");
    await leadPage.getByRole("button", { name: "+ Add product" }).click();
    await fillProduct(1, "Pizza boxes", "25.00", "200", "50");
    await leadPage.getByRole("button", { name: "+ Add product" }).click();
    await fillProduct(2, "Napkins", "10.00", "300", "500");
    // A charge that cannot divide evenly: USD 1000.01 by case count over 100/200/300 cases.
    await leadPage.getByRole("button", { name: "+ Add charge" }).click();
    await leadPage.getByPlaceholder("e.g. Ocean freight").nth(0).fill("Ocean freight");
    await leadPage.getByLabel("Amount", { exact: true }).nth(0).fill("1000.01");
    await leadPage.locator('label:has-text("Allocate") select').nth(0).selectOption("cases");
    await leadPage.getByRole("button", { name: "+ Add charge" }).click();
    await leadPage.getByPlaceholder("e.g. Ocean freight").nth(1).fill("Insurance");
    await leadPage.getByLabel("Amount", { exact: true }).nth(1).fill("100.00");
    await leadPage.locator('label:has-text("Allocate") select').nth(1).selectOption("value");
    await shot(leadPage, "e2e-freight-editor");
    await leadPage.getByRole("button", { name: /^Save/ }).click();
    await leadPage.waitForURL(/\/freight\/[0-9a-f-]{36}(\?.*)?$/);
    estimateId = /freight\/([0-9a-f-]{36})/.exec(leadPage.url())![1];
    await shot(leadPage, "e2e-freight-saved");

    const { data: version } = await service.from("freight_estimate_versions").select("inputs, results, is_complete, version_no").eq("estimate_id", estimateId).single();
    const results = version!.results as { products: { supplierValue: string; landedTotal: string; chargeAllocations: Record<string, string> }[]; charges: { chargeId: string; name: string; amount: string; reconciles: boolean }[]; totals: { grandTotal: string; reconciles: boolean } };
    const cents = (v: string | undefined) => Math.round(Number(v ?? 0) * 100);
    const freight = results.charges.find((c) => c.name === "Ocean freight")!;
    const insurance = results.charges.find((c) => c.name === "Insurance")!;
    const sum = (id: string) => results.products.reduce((s, p) => s + cents(p.chargeAllocations[id]), 0);
    check("the saved estimate is complete", version?.is_complete === true);
    check("ocean freight USD 1,000.01 × 1.79 = AWG 1,790.02 and its three allocations add up exactly", cents(freight.amount) === 179002 && sum(freight.chargeId) === 179002, `${freight.amount} / ${sum(freight.chargeId)}`);
    check("insurance USD 100.00 × 1.79 = AWG 179.00 and its allocations add up exactly", cents(insurance.amount) === 17900 && sum(insurance.chargeId) === 17900);
    const supplier = Math.round((40 * 100 + 25 * 200 + 10 * 300) * 1.79 * 100);
    check("shipment total = supplier value + all charges (AWG 23,449.02)", cents(results.totals.grandTotal) === supplier + 179002 + 17900 && results.totals.reconciles, results.totals.grandTotal);
    check("the saved page shows the shipment total and the allocation breakdown", (await leadPage.getByText("23,449.02").first().isVisible()) && (await leadPage.getByText(/By case count/).first().isVisible()));
    check("the inputs and the exchange rate used are stored with the version", (version!.inputs as { exchangeRate: string }).exchangeRate === "1.79");

    const csv = await leadPage.context().request.get(`${APP}/freight/${estimateId}/export`);
    const body = await csv.text();
    check("the estimate exports as CSV including the rate and totals", csv.status() === 200 && /csv/.test(csv.headers()["content-type"] ?? "") && body.includes("1.79") && body.includes("23449.02"), body.slice(0, 200));
  }

  // -------------------------------------------------------------------------
  section("E. An employee without freight access cannot retrieve a saved estimate");
  {
    const direct = await empPage.goto(`${APP}/freight/${estimateId}`);
    check("direct URL to the estimate → 404", direct?.status() === 404, String(direct?.status()));
    check("…and the page shows none of its contents", !(await empPage.content()).includes("VERIFY container week 48"));
    const request = empPage.context().request;
    check("direct URL to the edit page → 404", (await request.get(`${APP}/freight/${estimateId}/edit`)).status() === 404);
    const exportRes = await request.get(`${APP}/freight/${estimateId}/export`);
    check("direct URL to the CSV export → 404 with no data", exportRes.status() === 404 && !(await exportRes.text()).includes("Paper cups"));
    check("the estimate list → 404", (await request.get(`${APP}/freight`)).status() === 404);
    const searchPage = await request.get(`${APP}/search?q=VERIFY`);
    check("search does not reveal it", !(await searchPage.text()).includes("VERIFY container week 48"));
    await empPage.goto(`${APP}/`);
    check("there is no Freight entry in the employee's navigation", (await empPage.getByRole("link", { name: /Freight/ }).count()) === 0);

    // The same question asked straight to the database API with the employee's own session.
    const cookies = await empPage.context().cookies();
    const raw = cookies.filter((c) => c.name.includes("auth-token")).sort((a, b) => a.name.localeCompare(b.name)).map((c) => c.value).join("");
    const session = JSON.parse(Buffer.from(raw.replace(/^base64-/, ""), "base64").toString("utf8")) as { access_token: string };
    const headers = { apikey: ANON, Authorization: `Bearer ${session.access_token}` };
    const api = async (path: string) => (await fetch(`${SUPABASE}/rest/v1/${path}`, { headers })).json();
    const mine = (await api("tasks?select=id&limit=1")) as unknown[];
    const estimates = (await api(`freight_estimates?id=eq.${estimateId}&select=*`)) as unknown[];
    const versions = (await api(`freight_estimate_versions?estimate_id=eq.${estimateId}&select=inputs,results`)) as unknown[];
    check("API request with the employee's session: their own tasks are returned…", Array.isArray(mine) && mine.length === 1);
    check("…but the estimate and its versions are not", Array.isArray(estimates) && estimates.length === 0 && Array.isArray(versions) && versions.length === 0);

    check("the admin pages answer 404 to an employee", (await request.get(`${APP}/admin/users`)).status() === 404 && (await request.get(`${APP}/admin/audit`)).status() === 404);
    await adminPage.goto(`${APP}/admin/audit`);
    const auditText = await adminPage.locator("main").innerText();
    check("the audit log shows the SOP publications and the saved estimate", /Published “VERIFY Receiving a supplier quote” version 2/.test(auditText) && /freight estimate “VERIFY container week 48”/.test(auditText));
    await shot(adminPage, "e2e-admin-audit");
    await adminPage.goto(`${APP}/admin/jobs`);
    await adminPage.getByRole("button", { name: "Run now" }).click();
    await adminPage.locator("td", { hasText: /^admin$/ }).first().waitFor();
    const { data: runs } = await service.from("job_runs").select("job_name, status").eq("triggered_by", "admin");
    check("the admin can run the background jobs and see the log", runs?.length === 3 && runs.every((r) => r.status === "success") && (await adminPage.locator("td", { hasText: "Recurring tasks" }).first().isVisible()), JSON.stringify(runs));
  }
} catch (error) {
  failures.push(`Stopped early: ${(error as Error).message.split("\n")[0]}`);
  console.log(`\n  STOPPED: ${(error as Error).message}`);
  if (SHOTS) for (const [i, ctx] of browser.contexts().entries()) for (const p of ctx.pages()) await p.screenshot({ path: `${SHOTS}/e2e-failure-${i}.png`, fullPage: true }).catch(() => {});
} finally {
  await browser.close();
  if (!process.env.KEEP_DATA) await cleanup();
}

console.log(`\n${passed} checks passed, ${failures.length} failed.`);
if (failures.length) {
  console.log(failures.map((f) => ` - ${f}`).join("\n"));
  process.exit(1);
}
