"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { dbMessage, done, fail, isUuid, str, type ActionState } from "@/lib/action";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const ROLES = ["admin", "department_lead", "employee"] as const;
const FREIGHT = ["none", "view", "edit"] as const;

/** Departments ticked on the user form: `dept_<id>` = member, `lead_<id>` = lead. */
function readMemberships(form: FormData, role: string) {
  const members: { department_id: string; is_lead: boolean }[] = [];
  for (const [key, value] of form.entries()) {
    if (key.startsWith("dept_") && value === "on") {
      const id = key.slice(5);
      if (isUuid(id)) members.push({ department_id: id, is_lead: role === "department_lead" && form.get(`lead_${id}`) === "on" });
    }
  }
  return members;
}

async function syncMemberships(userId: string, wanted: { department_id: string; is_lead: boolean }[]): Promise<string | null> {
  // Uses the admin's own session, so the audit history records who made the change.
  const supabase = await createClient();
  const { data: current, error } = await supabase.from("department_members").select("department_id, is_lead").eq("user_id", userId);
  if (error) return dbMessage(error);
  for (const c of current ?? []) {
    const w = wanted.find((x) => x.department_id === c.department_id);
    if (!w) {
      const { error: e } = await supabase.from("department_members").delete().eq("user_id", userId).eq("department_id", c.department_id);
      if (e) return dbMessage(e);
    } else if (w.is_lead !== c.is_lead) {
      const { error: e } = await supabase.from("department_members").update({ is_lead: w.is_lead }).eq("user_id", userId).eq("department_id", c.department_id);
      if (e) return dbMessage(e);
    }
  }
  const add = wanted.filter((w) => !(current ?? []).some((c) => c.department_id === w.department_id));
  if (add.length) {
    const { error: e } = await supabase.from("department_members").insert(add.map((a) => ({ ...a, user_id: userId })));
    if (e) return dbMessage(e);
  }
  return null;
}

const userSchema = z.object({
  full_name: z.string().trim().min(1, "Enter the employee's name.").max(120),
  role: z.enum(ROLES),
  freight_access: z.enum(FREIGHT),
});

export async function inviteUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const email = z.string().trim().toLowerCase().email().safeParse(str(form, "email"));
  if (!email.success) return fail("Enter a valid email address.");
  const parsed = userSchema.safeParse({ full_name: str(form, "full_name"), role: str(form, "role"), freight_access: str(form, "freight_access") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const memberships = readMemberships(form, parsed.data.role);
  if (parsed.data.role === "department_lead" && !memberships.some((m) => m.is_lead)) {
    return fail("Tick at least one department this person leads.");
  }

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email.data, { data: { full_name: parsed.data.full_name } });
  if (error || !data.user) {
    return fail(/already/i.test(error?.message ?? "") ? "Someone with that email already has an account." : (error?.message ?? "The invitation could not be sent."));
  }

  const supabase = await createClient();
  const { error: profileError } = await supabase
    .from("profiles")
    .update({ full_name: parsed.data.full_name, role: parsed.data.role, freight_access: parsed.data.freight_access })
    .eq("id", data.user.id);
  if (profileError) return fail(`Invited, but the role could not be set: ${dbMessage(profileError)}`);
  const membershipError = await syncMemberships(data.user.id, memberships);
  if (membershipError) return fail(`Invited, but departments could not be set: ${membershipError}`);

  revalidatePath("/admin/users");
  return done(`Invitation sent to ${email.data}.`);
}

export async function updateUser(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireAdmin();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("User not found.");
  const parsed = userSchema.safeParse({ full_name: str(form, "full_name"), role: str(form, "role"), freight_access: str(form, "freight_access") });
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const isActive = form.get("is_active") === "on";
  if (id === viewer.id && (!isActive || parsed.data.role !== "admin")) {
    return fail("You cannot remove your own admin role or deactivate yourself. Ask another admin.");
  }
  const memberships = readMemberships(form, parsed.data.role);
  if (parsed.data.role === "department_lead" && !memberships.some((m) => m.is_lead)) {
    return fail("Tick at least one department this person leads.");
  }

  const supabase = await createClient();
  const { data: before } = await supabase.from("profiles").select("is_active").eq("id", id).maybeSingle();
  if (!before) return fail("User not found.");
  const { error } = await supabase.from("profiles").update({ ...parsed.data, is_active: isActive }).eq("id", id);
  if (error) return fail(dbMessage(error));
  const membershipError = await syncMemberships(id, memberships);
  if (membershipError) return fail(membershipError);

  if (before.is_active !== isActive) {
    // Block sign-in as well; data access is already cut off by is_active.
    const { error: banError } = await createAdminClient().auth.admin.updateUserById(id, { ban_duration: isActive ? "none" : "876000h" });
    if (banError) return fail(`Saved, but sign-in could not be ${isActive ? "restored" : "blocked"}: ${banError.message}`);
  }
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${id}`);
  return done("Saved.");
}

export async function sendPasswordLink(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("User not found.");
  const supabase = await createClient();
  const { data: profile } = await supabase.from("profiles").select("email").eq("id", id).maybeSingle();
  if (!profile) return fail("User not found.");
  const { error } = await createAdminClient().auth.resetPasswordForEmail(profile.email);
  if (error) return fail(error.message);
  return done(`A link to choose a password was sent to ${profile.email}.`);
}

// --- Departments and SOP categories ----------------------------------------
export async function saveDepartment(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(form, "id");
  const name = str(form, "name").slice(0, 80);
  if (!name) return fail("Enter a department name.");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("departments").update({ name, is_active: form.get("is_active") === "on" }).eq("id", id)
    : await supabase.from("departments").insert({ name });
  if (error) return fail(error.code === "23505" ? "A department with that name already exists." : dbMessage(error));
  revalidatePath("/admin/departments");
  return done(isUuid(id) ? "Saved." : "Department added.");
}

export async function saveSopCategory(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const id = str(form, "id");
  const name = str(form, "name").slice(0, 80);
  if (!name) return fail("Enter a category name.");
  const supabase = await createClient();
  const { error } = isUuid(id)
    ? await supabase.from("sop_categories").update({ name }).eq("id", id)
    : await supabase.from("sop_categories").insert({ name });
  if (error) return fail(error.code === "23505" ? "That category already exists." : dbMessage(error));
  revalidatePath("/admin/departments");
  return done(isUuid(id) ? "Saved." : "Category added.");
}

// --- Settings ---------------------------------------------------------------
export async function saveNotificationDefaults(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const days = Number(str(form, "remind_days_before"));
  if (str(form, "remind_days_before") === "" || !Number.isInteger(days) || days < 0 || days > 30) {
    return fail("Reminder days must be a whole number from 0 to 30.");
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: { remind_days_before: days, escalate_overdue: form.get("escalate_overdue") === "on" } })
    .eq("key", "notification_defaults");
  if (error) return fail(dbMessage(error));
  revalidatePath("/admin/settings");
  return done("Notification defaults saved. Tasks with their own reminder setting are not changed.");
}

export async function saveFreightDefaults(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireAdmin();
  const rateText = str(form, "usd_to_awg_rate");
  if (rateText !== "" && !(/^\d+(\.\d+)?$/.test(rateText) && Number(rateText) > 0)) {
    return fail("The exchange rate must be a positive number, or blank.");
  }
  const allowed = new Set(str(form, "allowed_allocations").split(",").filter(Boolean));
  const templates: { name: string; allocation: string }[] = [];
  for (const line of String(form.get("charge_templates") ?? "").split(/\r?\n/)) {
    if (!line.trim()) continue;
    const [name, allocation = ""] = line.split("|").map((p) => p.trim());
    if (!name) return fail(`Each charge line needs a name: “${line}”.`);
    if (!allowed.has(allocation)) {
      return fail(`“${name}” needs an allocation method after a “|”. Use one of: ${[...allowed].join(", ")}.`);
    }
    templates.push({ name: name.slice(0, 80), allocation });
  }
  const supabase = await createClient();
  const { error } = await supabase
    .from("app_settings")
    .update({ value: { usd_to_awg_rate: rateText === "" ? null : rateText, charge_templates: templates.slice(0, 30) } })
    .eq("key", "freight_defaults");
  if (error) return fail(dbMessage(error));
  revalidatePath("/admin/settings");
  return done("Freight defaults saved. They pre-fill new estimates only; saved estimates keep the values they were saved with.");
}

// --- Jobs --------------------------------------------------------------------
export async function runJobsNow(): Promise<void> {
  await requireAdmin();
  const supabase = await createClient();
  await supabase.rpc("admin_run_jobs");
  revalidatePath("/", "layout");
  redirect("/admin/jobs");
}
