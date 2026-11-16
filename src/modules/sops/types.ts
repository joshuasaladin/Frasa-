import type { Database } from "@/lib/supabase/database.types";

export type SopStatus = Database["public"]["Enums"]["sop_status"];
export type SopVersionStatus = Database["public"]["Enums"]["sop_version_status"];
export type SopStep = { title: string; detail: string };
export type SopLink = { label: string; url: string };

export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

/** Reads the steps JSON stored on a version, tolerating anything malformed. */
export function parseSteps(value: unknown): SopStep[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      title: typeof s.title === "string" ? s.title : "",
      detail: typeof s.detail === "string" ? s.detail : "",
    }));
}

export function parseLinks(value: unknown): SopLink[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((s): s is Record<string, unknown> => !!s && typeof s === "object")
    .map((s) => ({
      label: typeof s.label === "string" ? s.label : "",
      url: typeof s.url === "string" ? s.url : "",
    }))
    .filter((l) => /^https?:\/\//i.test(l.url));
}

export function formatBytes(n: number | null | undefined): string {
  if (!n && n !== 0) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
