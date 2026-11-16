import { redirect } from "next/navigation";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { Notice } from "@/components/ui";
import { getViewer } from "@/lib/auth";
import { safeNext } from "@/lib/action";
import { requestPasswordReset, signIn } from "../auth/actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string; reset?: string }>;
}) {
  const params = await searchParams;
  if (await getViewer()) redirect(safeNext(params.next));
  const reset = params.reset === "1";

  return (
    <main className="flex min-h-dvh items-center justify-center bg-forest-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo onDark />
        </div>
        <div className="card p-5">
          <h1 className="text-lg font-bold">{reset ? "Reset your password" : "Sign in"}</h1>
          <p className="mb-4 mt-1 text-sm text-muted">
            {reset
              ? "Enter your work email and we will send you a link."
              : "Frasa HQ is for Frasa employees. Accounts are created by invitation."}
          </p>
          {params.error === "link" ? (
            <div className="mb-3">
              <Notice tone="red">That link is invalid or has expired. Ask an admin for a new invitation, or reset your password.</Notice>
            </div>
          ) : null}
          {reset ? (
            <ActionForm action={requestPasswordReset} className="space-y-3">
              <label className="block">
                <span className="label">Work email</span>
                <input className="input" type="email" name="email" autoComplete="email" required />
              </label>
              <SubmitButton className="btn btn-primary w-full">Send reset link</SubmitButton>
            </ActionForm>
          ) : (
            <ActionForm action={signIn} className="space-y-3">
              <input type="hidden" name="next" value={safeNext(params.next)} />
              <label className="block">
                <span className="label">Work email</span>
                <input className="input" type="email" name="email" autoComplete="email" required />
              </label>
              <label className="block">
                <span className="label">Password</span>
                <input className="input" type="password" name="password" autoComplete="current-password" required />
              </label>
              <SubmitButton className="btn btn-primary w-full">Sign in</SubmitButton>
            </ActionForm>
          )}
          <p className="mt-4 text-center text-sm">
            {reset ? (
              <a className="link" href="/login">Back to sign in</a>
            ) : (
              <a className="link" href="/login?reset=1">Forgot your password?</a>
            )}
          </p>
        </div>
        <p className="mt-4 text-center text-xs text-white/50">Frasa International Trading N.V. · Internal use only</p>
      </div>
    </main>
  );
}
