import type { SupabaseClient } from "@supabase/supabase-js";

export type SeedUser = {
  email: string;
  name: string;
  role: "admin" | "department_lead" | "employee";
  freight: "none" | "view" | "edit";
  /** Department name -> leads it? */
  departments: Record<string, boolean>;
};

/** Creates (or resets) a demo/test user with a known password and returns its id. */
export async function ensureUser(admin: SupabaseClient, u: SeedUser, password: string): Promise<string> {
  const { data: existing } = await admin.from("profiles").select("id").eq("email", u.email).maybeSingle();
  let id = existing?.id as string | undefined;
  if (id) {
    const { error } = await admin.auth.admin.updateUserById(id, { password, ban_duration: "none" });
    if (error) throw new Error(`${u.email}: ${error.message}`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: u.email,
      password,
      email_confirm: true,
      user_metadata: { full_name: u.name },
    });
    if (error || !data.user) throw new Error(`${u.email}: ${error?.message}`);
    id = data.user.id;
  }
  const { error: profileError } = await admin
    .from("profiles")
    .update({ full_name: u.name, role: u.role, freight_access: u.freight, is_active: true, is_demo: true })
    .eq("id", id);
  if (profileError) throw new Error(profileError.message);

  const { data: departments } = await admin.from("departments").select("id, name");
  await admin.from("department_members").delete().eq("user_id", id);
  const rows = Object.entries(u.departments).map(([name, isLead]) => {
    const d = departments?.find((x) => x.name === name);
    if (!d) throw new Error(`Unknown department ${name}`);
    return { user_id: id!, department_id: d.id as string, is_lead: isLead };
  });
  if (rows.length) {
    const { error } = await admin.from("department_members").insert(rows);
    if (error) throw new Error(error.message);
  }
  return id;
}
