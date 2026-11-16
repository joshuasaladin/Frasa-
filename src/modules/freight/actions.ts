"use server";

import { revalidatePath } from "next/cache";
import { getViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbMessage, done, fail, isUuid, str, type ActionState } from "@/lib/action";
import type { Json } from "@/lib/supabase/database.types";
import { ENGINE_VERSION, calculate } from "./engine";
import { parseInputs } from "./schema";

export type SaveResult =
  | { ok: false; message: string }
  | { ok: true; estimateId: string; versionNo: number; isComplete: boolean };

/**
 * Saves a new estimate, or a new version of an existing one. The results are
 * always recalculated here from the submitted inputs; anything the browser
 * computed is ignored. The insert runs with the user's session, so the freight
 * RLS policies and freight_save_version() enforce edit access again.
 */
export async function saveEstimate(payload: {
  estimateId?: string | null;
  inputs: unknown;
  note?: string;
  duplicatedFrom?: string | null;
}): Promise<SaveResult> {
  const viewer = await getViewer();
  if (!viewer) return { ok: false, message: "Your session has expired. Sign in again." };
  if (!viewer.canEditFreight) return { ok: false, message: "You do not have access to save freight estimates." };

  const estimateId = payload.estimateId ?? null;
  if (estimateId !== null && !isUuid(estimateId)) return { ok: false, message: "Unknown estimate." };
  const duplicatedFrom = isUuid(payload.duplicatedFrom) ? payload.duplicatedFrom : null;

  const inputs = parseInputs(payload.inputs);
  if (!inputs) return { ok: false, message: "The estimate could not be read. Reload the page and try again." };
  if (inputs.name === "") return { ok: false, message: "Give the estimate a name before saving." };

  const results = calculate(inputs);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("freight_save_version", {
    p_estimate_id: estimateId as string, // null creates a new estimate
    p_name: inputs.name,
    p_reference: inputs.reference,
    p_inputs: inputs as unknown as Json,
    p_results: results as unknown as Json,
    p_is_complete: results.isComplete,
    p_reporting_currency: results.reportingCurrency,
    p_grand_total: (results.totals.grandTotal === null ? null : Number(results.totals.grandTotal)) as number,
    p_engine_version: ENGINE_VERSION,
    p_note: (typeof payload.note === "string" ? payload.note : "").trim().slice(0, 500),
    p_duplicated_from: duplicatedFrom as string,
  });
  if (error || !data || data.length === 0) return { ok: false, message: dbMessage(error) };

  revalidatePath("/freight");
  revalidatePath(`/freight/${data[0].estimate_id}`);
  return { ok: true, estimateId: data[0].estimate_id, versionNo: data[0].version_no, isComplete: results.isComplete };
}

export async function setArchivedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await getViewer();
  if (!viewer?.canEditFreight) return fail("You do not have access to change freight estimates.");
  const id = str(form, "estimateId");
  if (!isUuid(id)) return fail("Unknown estimate.");
  const archive = str(form, "archive") === "1";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("freight_estimates")
    .update({ archived_at: archive ? new Date().toISOString() : null, updated_by: viewer.id })
    .eq("id", id)
    .select("id");
  if (error) return fail(dbMessage(error));
  if (!data || data.length === 0) return fail("Estimate not found.");
  revalidatePath("/freight");
  revalidatePath(`/freight/${id}`);
  return done(archive ? "Estimate archived." : "Estimate restored.");
}
