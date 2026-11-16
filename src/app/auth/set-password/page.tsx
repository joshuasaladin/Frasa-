import { ActionForm, SubmitButton } from "@/components/action-form";
import { Logo } from "@/components/logo";
import { setPassword } from "../actions";

export const metadata = { title: "Choose a password" };

export default function SetPasswordPage() {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-forest-900 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex justify-center">
          <Logo onDark />
        </div>
        <div className="card p-5">
          <h1 className="text-lg font-bold">Choose a password</h1>
          <p className="mb-4 mt-1 text-sm text-muted">Use at least 10 characters. You will use it with your work email to sign in.</p>
          <ActionForm action={setPassword} className="space-y-3">
            <label className="block">
              <span className="label">New password</span>
              <input className="input" type="password" name="password" autoComplete="new-password" minLength={10} required />
            </label>
            <label className="block">
              <span className="label">Repeat password</span>
              <input className="input" type="password" name="confirm" autoComplete="new-password" minLength={10} required />
            </label>
            <SubmitButton className="btn btn-primary w-full">Save password and continue</SubmitButton>
          </ActionForm>
        </div>
      </div>
    </main>
  );
}
