import "server-only";
import { createClient } from "@/lib/supabase/server";
import { isUuid } from "@/lib/action";
import { parseInputs } from "./schema";
import {
  ALLOCATION_METHODS,
  blankCharge,
  blankInputs,
  type AllocationMethod,
  type EstimateInputs,
  type EstimateResults,
} from "./types";

// All reads use the signed-in user's session, so the freight RLS policies decide
// what comes back. A user without freight access simply gets no rows.

export async function listEstimates(opts: { archived: boolean; q: string }) {
  const supabase = await createClient();
  let query = supabase
    .from("freight_estimates")
    .select("id, name, reference, current_version_no, is_complete, reporting_currency, grand_total, is_demo, archived_at, updated_at, updated_by")
    .order("updated_at", { ascending: false })
    .limit(200);
  query = opts.archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
  const q = opts.q.replace(/[%_,()\\]/g, " ").trim();
  if (q) query = query.or(`name.ilike.%${q}%,reference.ilike.%${q}%`);
  const { data } = await query;
  return data ?? [];
}

export async function getEstimate(id: string) {
  if (!isUuid(id)) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("freight_estimates")
    .select("id, name, reference, current_version_no, is_complete, is_demo, archived_at, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  return data;
}

export type VersionSummary = {
  versionNo: number;
  isComplete: boolean;
  note: string;
  createdAt: string;
  createdByName: string;
};

export async function listVersions(estimateId: string): Promise<VersionSummary[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("freight_estimate_versions")
    .select("version_no, is_complete, note, created_at, created_by")
    .eq("estimate_id", estimateId)
    .order("version_no", { ascending: false });
  const rows = data ?? [];
  const ids = [...new Set(rows.map((r) => r.created_by).filter((x): x is string => Boolean(x)))];
  const names = new Map<string, string>();
  if (ids.length > 0) {
    const { data: people } = await supabase.from("profiles").select("id, full_name, email").in("id", ids);
    for (const p of people ?? []) names.set(p.id, p.full_name || p.email);
  }
  return rows.map((r) => ({
    versionNo: r.version_no,
    isComplete: r.is_complete,
    note: r.note,
    createdAt: r.created_at,
    createdByName: (r.created_by && names.get(r.created_by)) || "Unknown",
  }));
}

export type StoredVersion = {
  versionNo: number;
  inputs: EstimateInputs;
  results: EstimateResults;
  isComplete: boolean;
  engineVersion: string;
  note: string;
  createdAt: string;
};

/** Returns the stored inputs and results exactly as saved; nothing is recalculated. */
export async function getVersion(estimateId: string, versionNo: number): Promise<StoredVersion | null> {
  if (!isUuid(estimateId) || !Number.isInteger(versionNo) || versionNo < 1) return null;
  const supabase = await createClient();
  const { data } = await supabase
    .from("freight_estimate_versions")
    .select("version_no, inputs, results, is_complete, engine_version, note, created_at")
    .eq("estimate_id", estimateId)
    .eq("version_no", versionNo)
    .maybeSingle();
  if (!data) return null;
  return {
    versionNo: data.version_no,
    inputs: data.inputs as unknown as EstimateInputs,
    results: data.results as unknown as EstimateResults,
    isComplete: data.is_complete,
    engineVersion: data.engine_version,
    note: data.note,
    createdAt: data.created_at,
  };
}

/**
 * Starting point for a new estimate. Admin-set defaults only pre-fill the form;
 * they are copied into the estimate's own inputs when it is saved, so changing
 * the defaults later never changes a saved estimate.
 */
export async function newEstimateInputs(): Promise<EstimateInputs> {
  const inputs = blankInputs();
  const supabase = await createClient();
  const { data } = await supabase.from("app_settings").select("value").eq("key", "freight_defaults").maybeSingle();
  const value = (data?.value ?? null) as { usd_to_awg_rate?: unknown; charge_templates?: unknown } | null;
  if (!value) return inputs;
  const rate = value.usd_to_awg_rate;
  if ((typeof rate === "string" || typeof rate === "number") && String(rate).trim() !== "") {
    inputs.exchangeRate = String(rate).trim();
  }
  if (Array.isArray(value.charge_templates)) {
    for (const t of value.charge_templates.slice(0, 30)) {
      if (!t || typeof t !== "object" || typeof (t as { name?: unknown }).name !== "string") continue;
      const tpl = t as { name: string; allocation?: unknown };
      const charge = blankCharge("USD");
      charge.name = tpl.name.slice(0, 200);
      if (ALLOCATION_METHODS.includes(tpl.allocation as AllocationMethod)) {
        charge.allocation = tpl.allocation as AllocationMethod;
      }
      inputs.charges.push(charge);
    }
  }
  return inputs;
}

/** Inputs of a saved version, safe to load into the editor. */
export async function editableInputs(estimateId: string, versionNo: number): Promise<EstimateInputs | null> {
  const version = await getVersion(estimateId, versionNo);
  return version ? parseInputs(version.inputs) : null;
}
