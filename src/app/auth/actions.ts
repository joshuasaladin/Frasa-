"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fail, done, safeNext, str, type ActionState } from "@/lib/action";

export async function signIn(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form, "email").toLowerCase();
  const password = String(form.get("password") ?? "");
  if (!email || !password) return fail("Enter your email and password.");

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return fail("That email and password do not match an account.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("is_active")
    .eq("id", data.user.id)
    .maybeSingle();
  if (!profile?.is_active) {
    await supabase.auth.signOut();
    return fail("This account has been deactivated. Ask an admin for access.");
  }
  redirect(safeNext(str(form, "next")));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Always answers the same way, so the form cannot be used to discover accounts. */
export async function requestPasswordReset(_prev: ActionState, form: FormData): Promise<ActionState> {
  const email = str(form, "email").toLowerCase();
  if (!email) return fail("Enter your email address.");
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email);
  return done("If that address has an account, a reset link is on its way.");
}

export async function setPassword(_prev: ActionState, form: FormData): Promise<ActionState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 10) return fail("Use at least 10 characters.");
  if (password !== confirm) return fail("The two passwords do not match.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return fail("Your link has expired. Ask an admin to invite you again, or request a new reset link.");
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return fail(error.message);
  redirect("/");
}
