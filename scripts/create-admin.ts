/**
 * Creates the first admin account (or promotes an existing account to admin).
 *
 *   npm run create-admin -- you@frasa.example "Your Name"
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (read from the
 * environment, or from .env.local). Prints a one-time link to choose a password;
 * no password is ever written to disk or shown.
 */
import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./lib/env.ts";

loadEnv();
const [email, ...nameParts] = process.argv.slice(2);
const fullName = nameParts.join(" ").trim();
if (!email || !/^\S+@\S+\.\S+$/.test(email) || !fullName) {
  console.error('Usage: npm run create-admin -- <email> "<full name>"');
  process.exit(1);
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const site = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY first.");
  process.exit(1);
}
const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: existing } = await admin.from("profiles").select("id").eq("email", email.toLowerCase()).maybeSingle();
let userId = existing?.id as string | undefined;
if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email: email.toLowerCase(),
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error || !data.user) {
    console.error("Could not create the account:", error?.message);
    process.exit(1);
  }
  userId = data.user.id;
}

const { error: roleError } = await admin
  .from("profiles")
  .update({ role: "admin", full_name: fullName, is_active: true })
  .eq("id", userId);
if (roleError) {
  console.error("Could not set the admin role:", roleError.message);
  process.exit(1);
}

const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: "recovery", email: email.toLowerCase() });
if (linkError || !link.properties) {
  console.error("Admin created, but no password link could be generated:", linkError?.message);
  console.error('Use "Forgot your password?" on the sign-in page instead.');
  process.exit(1);
}
console.log(`\n${fullName} <${email}> is now an admin of Frasa HQ.`);
console.log("Open this one-time link (valid for a limited time) to choose a password:\n");
console.log(`${site}/auth/confirm?token_hash=${link.properties.hashed_token}&type=recovery&next=/auth/set-password\n`);
console.log("Freight access is separate from the admin role: grant it under Admin > Users.");
