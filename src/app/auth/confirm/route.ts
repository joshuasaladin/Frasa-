import type { EmailOtpType } from "@supabase/supabase-js";
import type { NextRequest } from "next/server";
import { redirectToPath } from "@/lib/redirect";
import { createClient } from "@/lib/supabase/server";
import { safeNext } from "@/lib/action";

/** Landing point for invitation and password-reset emails. */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl;
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeNext(searchParams.get("next"), "/auth/set-password");

  if (tokenHash && type && ["invite", "recovery"].includes(type)) {
    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
    if (!error) return redirectToPath(next);
  }
  return redirectToPath("/login?error=link");
}
