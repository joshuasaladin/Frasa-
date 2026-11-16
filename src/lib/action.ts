/** Result of a server action, shown by <ActionForm>. */
export type ActionState = { ok: boolean; message: string } | null;

export const fail = (message: string): ActionState => ({ ok: false, message });
export const done = (message = "Saved."): ActionState => ({ ok: true, message });

/** Turns a database / RLS error into something an employee can act on. */
export function dbMessage(error: { message: string; code?: string } | null | undefined): string {
  if (!error) return "Something went wrong.";
  if (error.code === "42501" || /row-level security|permission denied/i.test(error.message)) {
    return /row-level security|permission denied/i.test(error.message)
      ? "You do not have permission to do that."
      : error.message;
  }
  if (error.code === "23505") return "That already exists.";
  if (error.code === "23503") return "That record is still in use and cannot be removed.";
  return error.message;
}

export function str(form: FormData, key: string): string {
  const v = form.get(key);
  return typeof v === "string" ? v.trim() : "";
}

export function strOrNull(form: FormData, key: string): string | null {
  const v = str(form, key);
  return v === "" ? null : v;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

export function uuidOrNull(form: FormData, key: string): string | null {
  const v = str(form, key);
  return isUuid(v) ? v : null;
}

/** Only same-site paths are accepted as redirect targets. */
export function safeNext(value: string | null | undefined, fallback = "/"): string {
  if (!value || !value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return fallback;
  return value;
}

/** Storage object names: keep it readable but safe. */
export function safeFileName(name: string): string {
  const cleaned = name.normalize("NFKD").replace(/[^\w.\- ]+/g, "").replace(/\s+/g, "_").slice(-120);
  return cleaned.replace(/^\.+/, "") || "file";
}
