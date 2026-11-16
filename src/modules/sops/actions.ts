"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { dbMessage, done, fail, isUuid, safeFileName, str, uuidOrNull, type ActionState } from "@/lib/action";
import { isIsoDate } from "@/lib/dates";
import { canCreateSops, canPublishIn } from "./queries";
import { MAX_ATTACHMENT_BYTES } from "./types";

const BUCKET = "attachments";

function revalidateSop(id: string) {
  revalidatePath("/sops");
  revalidatePath(`/sops/${id}`, "layout");
  revalidatePath("/");
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createSopAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  if (!canCreateSops(viewer)) return fail("Only admins and department leads can create SOPs.");

  const title = str(form, "title");
  if (title.length < 3 || title.length > 200) return fail("Give the SOP a title of 3 to 200 characters.");
  const departmentRaw = str(form, "department_id");
  const departmentId = departmentRaw === "" ? null : departmentRaw;
  if (departmentId !== null && !isUuid(departmentId)) return fail("Choose a department.");
  if (!canPublishIn(viewer, departmentId)) {
    return fail(
      departmentId === null
        ? "Only an admin can create a company-wide SOP."
        : "You can only create SOPs for a department you lead.",
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("sop_create", {
    p_title: title,
    // The generated types mark these as required; the function accepts null.
    p_department_id: departmentId as unknown as string,
    p_category_id: uuidOrNull(form, "category_id") as unknown as string,
    p_owner_id: (uuidOrNull(form, "owner_id") ?? viewer.id) as string,
  });
  if (error || !data) return fail(dbMessage(error));
  revalidatePath("/sops");
  redirect(`/sops/${data}/edit`);
}

// ---------------------------------------------------------------------------
// Revisions
// ---------------------------------------------------------------------------
export async function startRevisionAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const sopId = str(form, "sop_id");
  if (!isUuid(sopId)) return fail("SOP not found.");
  const supabase = await createClient();
  const { error } = await supabase.rpc("sop_start_revision", { p_sop_id: sopId });
  if (error) return fail(dbMessage(error));
  revalidateSop(sopId);
  redirect(`/sops/${sopId}/edit`);
}

const stepsSchema = z
  .array(z.object({ title: z.string().trim().max(200), detail: z.string().trim().max(5000) }))
  .max(100);
const linksSchema = z
  .array(
    z.object({
      label: z.string().trim().max(200),
      url: z
        .string()
        .trim()
        .max(2000)
        .regex(/^https?:\/\/\S+$/i, "Links must start with http:// or https://"),
    }),
  )
  .max(30);

function parseJsonField(form: FormData, key: string): unknown {
  try {
    return JSON.parse(str(form, key) || "[]");
  } catch {
    return undefined;
  }
}

function parseTags(raw: string): string[] | null {
  const tags = [...new Set(raw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean))];
  if (tags.length > 15 || tags.some((t) => t.length > 40)) return null;
  return tags;
}

/**
 * Saves the SOP's metadata and (when a draft exists) the draft content. With
 * intent=publish it then publishes the draft through public.sop_publish().
 */
export async function saveSopAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const sopId = str(form, "sop_id");
  if (!isUuid(sopId)) return fail("SOP not found.");
  const intent = str(form, "intent") === "publish" ? "publish" : "save";
  const supabase = await createClient();

  const { data: sop } = await supabase
    .from("sops")
    .select("id, department_id, owner_id, is_sample")
    .eq("id", sopId)
    .maybeSingle();
  if (!sop) return fail("SOP not found.");
  const isPublisher = canPublishIn(viewer, sop.department_id);
  if (!isPublisher && sop.owner_id !== viewer.id) return fail("You do not have permission to edit this SOP.");

  // --- metadata ---
  const tags = parseTags(str(form, "tags"));
  if (!tags) return fail("Use at most 15 tags of up to 40 characters each.");
  const reviewRaw = str(form, "next_review_date");
  if (reviewRaw !== "" && !isIsoDate(reviewRaw)) return fail("Enter a valid next review date.");

  const meta: {
    category_id: string | null;
    tags: string[];
    next_review_date: string | null;
    department_id?: string | null;
    owner_id?: string | null;
    is_sample?: boolean;
  } = {
    category_id: uuidOrNull(form, "category_id"),
    tags,
    next_review_date: reviewRaw === "" ? null : reviewRaw,
  };
  // Only publishers may move a SOP to another department or change its owner.
  if (isPublisher) {
    const departmentRaw = str(form, "department_id");
    const departmentId = departmentRaw === "" ? null : departmentRaw;
    if (departmentId !== null && !isUuid(departmentId)) return fail("Choose a department.");
    if (!canPublishIn(viewer, departmentId)) {
      return fail(
        departmentId === null
          ? "Only an admin can make a SOP company-wide."
          : "You can only move a SOP to a department you lead.",
      );
    }
    meta.department_id = departmentId;
    meta.owner_id = uuidOrNull(form, "owner_id");
  }
  // A sample stops being labelled as one when the editor confirms it was revised.
  if (sop.is_sample && form.get("sample_revised") === "on") meta.is_sample = false;

  const { error: metaError } = await supabase.from("sops").update(meta).eq("id", sopId);
  if (metaError) return fail(dbMessage(metaError));

  // --- draft content ---
  const versionId = str(form, "version_id");
  if (versionId !== "") {
    if (!isUuid(versionId)) return fail("Draft not found.");
    const title = str(form, "title");
    if (title.length < 3 || title.length > 200) return fail("Give the SOP a title of 3 to 200 characters.");
    const purpose = str(form, "purpose");
    if (purpose.length > 5000) return fail("Keep the purpose under 5,000 characters.");
    const steps = stepsSchema.safeParse(parseJsonField(form, "steps"));
    if (!steps.success) return fail("The steps could not be read. Keep each step title under 200 characters.");
    const links = linksSchema.safeParse(parseJsonField(form, "links"));
    if (!links.success) return fail("Every link needs an address starting with http:// or https://.");
    const changeSummary = str(form, "change_summary");
    if (changeSummary.length > 1000) return fail("Keep the change summary under 1,000 characters.");

    const cleanSteps = steps.data.filter((s) => s.title !== "" || s.detail !== "");
    const cleanLinks = links.data.map((l) => ({ label: l.label || l.url, url: l.url }));

    const { data: updated, error } = await supabase
      .from("sop_versions")
      .update({ title, purpose, steps: cleanSteps, links: cleanLinks, change_summary: changeSummary })
      .eq("id", versionId)
      .eq("sop_id", sopId)
      .eq("status", "draft")
      .select("id");
    if (error) return fail(dbMessage(error));
    if (!updated || updated.length === 0) {
      return fail("This draft is no longer editable. It may already have been published.");
    }

    if (intent === "publish") {
      const { error: publishError } = await supabase.rpc("sop_publish", {
        p_version_id: versionId,
        p_requires_ack: form.get("requires_ack") === "on",
        p_change_summary: changeSummary,
      });
      if (publishError) {
        revalidateSop(sopId);
        return fail(`Draft saved, but not published: ${dbMessage(publishError)}`);
      }
      revalidateSop(sopId);
      redirect(`/sops/${sopId}`);
    }
  } else if (intent === "publish") {
    return fail("There is no draft to publish.");
  }

  revalidateSop(sopId);
  return done(versionId ? "Draft saved. Employees still see the published version." : "Details saved.");
}

export async function discardDraftAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const sopId = str(form, "sop_id");
  const versionId = str(form, "version_id");
  if (!isUuid(sopId) || !isUuid(versionId)) return fail("Draft not found.");
  const supabase = await createClient();

  const { data: attachments } = await supabase
    .from("sop_attachments")
    .select("storage_path")
    .eq("sop_version_id", versionId);

  const { data: deleted, error } = await supabase
    .from("sop_versions")
    .delete()
    .eq("id", versionId)
    .eq("sop_id", sopId)
    .eq("status", "draft")
    .select("id");
  if (error) return fail(dbMessage(error));
  if (!deleted || deleted.length === 0) {
    return fail("This draft cannot be discarded. The first version of a SOP can be archived instead.");
  }
  await removeUnreferencedObjects(supabase, (attachments ?? []).map((a) => a.storage_path));
  revalidateSop(sopId);
  redirect(`/sops/${sopId}`);
}

export async function setArchivedAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const sopId = str(form, "sop_id");
  if (!isUuid(sopId)) return fail("SOP not found.");
  const archived = str(form, "archived") === "true";
  const supabase = await createClient();
  const { error } = await supabase.rpc("sop_set_archived", { p_sop_id: sopId, p_archived: archived });
  if (error) return fail(dbMessage(error));
  revalidateSop(sopId);
  return done(archived ? "SOP archived. Employees no longer see it." : "SOP restored.");
}

// ---------------------------------------------------------------------------
// Attachments (draft versions only; enforced by RLS on rows and storage)
// ---------------------------------------------------------------------------
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Deletes storage objects that no SOP version points at any more. */
async function removeUnreferencedObjects(supabase: Supabase, paths: string[]) {
  const unique = [...new Set(paths)];
  if (unique.length === 0) return;
  const { data: still } = await supabase.from("sop_attachments").select("storage_path").in("storage_path", unique);
  const referenced = new Set((still ?? []).map((r) => r.storage_path));
  const orphaned = unique.filter((p) => !referenced.has(p));
  if (orphaned.length > 0) await supabase.storage.from(BUCKET).remove(orphaned);
}

export async function uploadSopAttachmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const sopId = str(form, "sop_id");
  const versionId = str(form, "version_id");
  if (!isUuid(sopId) || !isUuid(versionId)) return fail("Draft not found.");
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to attach.");
  if (file.size > MAX_ATTACHMENT_BYTES) return fail("Files can be at most 25 MB.");

  const supabase = await createClient();
  const { data: version } = await supabase
    .from("sop_versions")
    .select("id")
    .eq("id", versionId)
    .eq("sop_id", sopId)
    .eq("status", "draft")
    .maybeSingle();
  if (!version) return fail("Attachments can only be added to a draft you can edit.");

  const fileName = safeFileName(file.name);
  const path = `sops/${sopId}/${randomUUID()}/${fileName}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) return fail(dbMessage(uploadError));

  const { error } = await supabase.from("sop_attachments").insert({
    sop_id: sopId,
    sop_version_id: versionId,
    storage_path: path,
    file_name: file.name.slice(-200) || fileName,
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: viewer.id,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    return fail(dbMessage(error));
  }
  revalidatePath(`/sops/${sopId}/edit`);
  return done(`Attached ${file.name}.`);
}

export async function removeSopAttachmentAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const sopId = str(form, "sop_id");
  const attachmentId = str(form, "attachment_id");
  if (!isUuid(sopId) || !isUuid(attachmentId)) return fail("Attachment not found.");
  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("sop_attachments")
    .delete()
    .eq("id", attachmentId)
    .eq("sop_id", sopId)
    .select("storage_path");
  if (error) return fail(dbMessage(error));
  if (!deleted || deleted.length === 0) return fail("Attachments can only be removed from a draft you can edit.");
  await removeUnreferencedObjects(supabase, deleted.map((d) => d.storage_path));
  revalidatePath(`/sops/${sopId}/edit`);
  return done("Attachment removed.");
}

// ---------------------------------------------------------------------------
// Acknowledgment
// ---------------------------------------------------------------------------
export async function acknowledgeSopAction(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const sopId = str(form, "sop_id");
  const versionId = str(form, "version_id");
  if (!isUuid(sopId) || !isUuid(versionId)) return fail("SOP not found.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("sop_acknowledgments")
    .insert({ sop_version_id: versionId, user_id: viewer.id });
  // 23505: already acknowledged (double tap) - that is fine.
  if (error && error.code !== "23505") {
    return fail(
      /row-level security/i.test(error.message)
        ? "This version can no longer be acknowledged. Reload the page to see the current version."
        : dbMessage(error),
    );
  }
  revalidateSop(sopId);
  return done("Thank you. Your acknowledgment has been recorded.");
}
