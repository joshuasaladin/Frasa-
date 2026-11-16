"use client";

import { useActionState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import type { ActionState } from "@/lib/action";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

/** A form bound to a server action that shows the action's success or error message. */
export function ActionForm({
  action,
  children,
  className,
  resetOnSuccess,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
}) {
  const [state, formAction] = useActionState(action, null);
  return (
    <form
      action={formAction}
      className={className}
      key={resetOnSuccess && state?.ok ? state.message + Math.random() : undefined}
    >
      {children}
      {state?.message ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={`mt-2 rounded-lg border px-3 py-2 text-sm ${
            state.ok ? "border-green-200 bg-forest-100 text-forest-700" : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function SubmitButton({
  children,
  className = "btn btn-primary",
  name,
  value,
  confirm,
}: {
  children: ReactNode;
  className?: string;
  name?: string;
  value?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      className={className}
      disabled={pending}
      onClick={confirm ? (e) => { if (!window.confirm(confirm)) e.preventDefault(); } : undefined}
    >
      {pending ? "Working…" : children}
    </button>
  );
}
