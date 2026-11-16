"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireViewer } from "@/lib/auth";
import { dbMessage, done, fail, isUuid, safeFileName, safeNext, str, type ActionState } from "@/lib/action";
import { isIsoDate } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { FREQUENCIES, PRIORITIES, STATUSES, type TaskStatus } from "./labels";

const MAX_FILE_BYTES = 25 * 1024 * 1024;

const optionalUuid = z.preprocess((v) => (v === "" || v == null ? null : v), z.string().uuid().nullable());
const optionalDate = z.preprocess(
  (v) => (v === "" || v == null ? null : v),
  z.string().refine(isIsoDate, "Enter a valid date.").nullable(),
);
const optionalDays = z.preprocess(
  (v) => (v === "" || v == null ? null : Number(v)),
  z.number().int().min(0, "Reminder days cannot be negative.").max(30, "Reminder days: at most 30.").nullable(),
);

const taskSchema = z
  .object({
    kind: z.enum(["personal", "shared"]),
    title: z.string().trim().min(1, "Give the task a title.").max(200),
    description: z.string().trim().max(5000),
    department_id: optionalUuid,
    owner_id: optionalUuid,
    due_date: optionalDate,
    priority: z.enum(PRIORITIES as [string, ...string[]]),
    sop_id: optionalUuid,
    freight_estimate_id: optionalUuid,
    external_link_label: z.string().trim().max(120),
    external_link_url: z
      .string()
      .trim()
      .max(500)
      .refine((v) => v === "" || /^https?:\/\//i.test(v), "The record link must start with http:// or https://."),
    remind_days_before: optionalDays,
    escalate_overdue: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "shared") {
      if (!v.department_id) ctx.addIssue({ code: "custom", message: "Choose a department for a shared task." });
      if (!v.owner_id) ctx.addIssue({ code: "custom", message: "Choose the accountable owner." });
      if (!v.due_date) ctx.addIssue({ code: "custom", message: "A shared task needs a due date." });
    }
  });

function readTask(form: FormData) {
  return taskSchema.safeParse({
    kind: str(form, "kind"),
    title: str(form, "title"),
    description: str(form, "description"),
    department_id: str(form, "department_id"),
    owner_id: str(form, "owner_id"),
    due_date: str(form, "due_date"),
    priority: str(form, "priority") || "normal",
    sop_id: str(form, "sop_id"),
    freight_estimate_id: str(form, "freight_estimate_id"),
    external_link_label: str(form, "external_link_label"),
    external_link_url: str(form, "external_link_url"),
    remind_days_before: str(form, "remind_days_before"),
    escalate_overdue: form.get("escalate_overdue") === "on",
  });
}

function checklistLines(form: FormData): string[] {
  return String(form.get("checklist") ?? "")
    .split(/\r?\n/)
    .map((l) => l.trim().slice(0, 300))
    .filter(Boolean)
    .slice(0, 50);
}

function touch(taskId?: string) {
  revalidatePath("/", "layout");
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function createTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const parsed = readTask(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const personal = v.kind === "personal";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("tasks")
    .insert({
      kind: v.kind,
      title: v.title,
      description: v.description,
      owner_id: personal ? viewer.id : v.owner_id!,
      department_id: personal ? null : v.department_id,
      due_date: v.due_date,
      priority: v.priority as "normal",
      sop_id: v.sop_id,
      freight_estimate_id: viewer.canViewFreight ? v.freight_estimate_id : null,
      external_link_label: v.external_link_label,
      external_link_url: v.external_link_url,
      remind_days_before: v.remind_days_before,
      escalate_overdue: personal ? false : v.escalate_overdue,
    })
    .select("id")
    .single();
  if (error) {
    return fail(
      /row-level security/i.test(error.message)
        ? "You cannot assign a task to that person in that department."
        : dbMessage(error),
    );
  }

  const lines = checklistLines(form);
  if (lines.length) {
    const { error: checklistError } = await supabase
      .from("task_checklist_items")
      .insert(lines.map((label, i) => ({ task_id: data.id, label, position: i + 1 })));
    if (checklistError) {
      touch(data.id);
      redirect(`/tasks/${data.id}?warn=checklist`);
    }
  }
  touch(data.id);
  redirect(`/tasks/${data.id}`);
}

export async function updateTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Task not found.");
  const parsed = readTask(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const personal = v.kind === "personal";

  const supabase = await createClient();
  const { data: existing } = await supabase.from("tasks").select("id, kind, freight_estimate_id").eq("id", id).maybeSingle();
  if (!existing) return fail("Task not found.");
  if (existing.kind !== v.kind) return fail("A task cannot be switched between personal and shared.");

  const { data, error } = await supabase
    .from("tasks")
    .update({
      title: v.title,
      description: v.description,
      ...(personal ? {} : { owner_id: v.owner_id!, department_id: v.department_id }),
      due_date: v.due_date,
      priority: v.priority as "normal",
      sop_id: v.sop_id,
      // Someone without freight access can edit the task without losing (or seeing) the link.
      ...(viewer.canViewFreight ? { freight_estimate_id: v.freight_estimate_id } : {}),
      external_link_label: v.external_link_label,
      external_link_url: v.external_link_url,
      remind_days_before: v.remind_days_before,
      escalate_overdue: personal ? false : v.escalate_overdue,
    })
    .eq("id", id)
    .select("id");
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail("You do not have permission to edit this task.");
  touch(id);
  redirect(`/tasks/${id}`);
}

/** Status buttons (Start, Complete, Reopen, ...). Used from lists and the task page. */
export async function setTaskStatus(form: FormData): Promise<void> {
  await requireViewer();
  const id = str(form, "id");
  const status = str(form, "status") as TaskStatus;
  if (!isUuid(id) || !STATUSES.includes(status)) return;
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update({ status }).eq("id", id).select("id");
  touch(id);
  const back = safeNext(str(form, "back"), `/tasks/${id}`);
  if (error || !data?.length) redirect(`/tasks/${id}?warn=status`);
  redirect(back);
}

export async function rescheduleTask(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const id = str(form, "id");
  const due = str(form, "due_date");
  if (!isUuid(id)) return fail("Task not found.");
  if (!isIsoDate(due)) return fail("Choose the new due date.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("tasks").update({ due_date: due }).eq("id", id).select("id");
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail("You do not have permission to reschedule this task.");
  touch(id);
  return done("Due date changed for this task only.");
}

export async function deleteTask(form: FormData): Promise<void> {
  await requireViewer();
  const id = str(form, "id");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { data: files } = await supabase.from("task_attachments").select("storage_path").eq("task_id", id);
  const { data, error } = await supabase.from("tasks").delete().eq("id", id).select("id");
  if (error || !data?.length) redirect(`/tasks/${id}?warn=delete`);
  if (files?.length) await supabase.storage.from("attachments").remove(files.map((f) => f.storage_path));
  touch();
  redirect("/tasks");
}

// --- Checklist -------------------------------------------------------------
export async function addChecklistItem(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const taskId = str(form, "task_id");
  const label = str(form, "label").slice(0, 300);
  if (!isUuid(taskId)) return fail("Task not found.");
  if (!label) return fail("Describe the checklist step.");
  const supabase = await createClient();
  const { data: last } = await supabase
    .from("task_checklist_items")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1);
  const { error } = await supabase
    .from("task_checklist_items")
    .insert({ task_id: taskId, label, position: (last?.[0]?.position ?? 0) + 1 });
  if (error) return fail(dbMessage(error));
  touch(taskId);
  return done("Added.");
}

export async function toggleChecklistItem(form: FormData): Promise<void> {
  await requireViewer();
  const id = str(form, "id");
  const taskId = str(form, "task_id");
  if (!isUuid(id) || !isUuid(taskId)) return;
  const supabase = await createClient();
  await supabase.from("task_checklist_items").update({ is_done: form.get("is_done") === "true" }).eq("id", id).eq("task_id", taskId);
  touch(taskId);
}

export async function removeChecklistItem(form: FormData): Promise<void> {
  await requireViewer();
  const id = str(form, "id");
  const taskId = str(form, "task_id");
  if (!isUuid(id) || !isUuid(taskId)) return;
  const supabase = await createClient();
  await supabase.from("task_checklist_items").delete().eq("id", id).eq("task_id", taskId);
  touch(taskId);
}

// --- Comments --------------------------------------------------------------
export async function addComment(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const taskId = str(form, "task_id");
  const body = str(form, "body").slice(0, 5000);
  if (!isUuid(taskId)) return fail("Task not found.");
  if (!body) return fail("Write a comment first.");
  const supabase = await createClient();
  const { error } = await supabase.from("task_comments").insert({ task_id: taskId, author_id: viewer.id, body });
  if (error) return fail(dbMessage(error));
  touch(taskId);
  return done("Comment added.");
}

// --- Attachments -----------------------------------------------------------
export async function uploadTaskAttachment(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const taskId = str(form, "task_id");
  const file = form.get("file");
  if (!isUuid(taskId)) return fail("Task not found.");
  if (!(file instanceof File) || file.size === 0) return fail("Choose a file to attach.");
  if (file.size > MAX_FILE_BYTES) return fail("Files can be at most 25 MB.");

  const supabase = await createClient();
  const path = `tasks/${taskId}/${randomUUID()}/${safeFileName(file.name)}`;
  const { error: uploadError } = await supabase.storage
    .from("attachments")
    .upload(path, file, { contentType: file.type || "application/octet-stream", upsert: false });
  if (uploadError) return fail(dbMessage(uploadError));

  const { error } = await supabase.from("task_attachments").insert({
    task_id: taskId,
    storage_path: path,
    file_name: file.name.slice(0, 200),
    mime_type: file.type || null,
    size_bytes: file.size,
    uploaded_by: viewer.id,
  });
  if (error) {
    await supabase.storage.from("attachments").remove([path]);
    return fail(dbMessage(error));
  }
  touch(taskId);
  return done("File attached.");
}

export async function removeTaskAttachment(form: FormData): Promise<void> {
  await requireViewer();
  const id = str(form, "id");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("task_attachments").delete().eq("id", id).select("task_id, storage_path");
  if (data?.length) {
    await supabase.storage.from("attachments").remove([data[0].storage_path]);
    touch(data[0].task_id);
  }
}

// --- Recurring series ------------------------------------------------------
const seriesSchema = z
  .object({
    kind: z.enum(["personal", "shared"]),
    title: z.string().trim().min(1, "Give the recurring task a title.").max(200),
    description: z.string().trim().max(5000),
    department_id: optionalUuid,
    owner_id: optionalUuid,
    priority: z.enum(PRIORITIES as [string, ...string[]]),
    frequency: z.enum(FREQUENCIES as [string, ...string[]], { message: "Choose how often the task repeats." }),
    interval_count: z.coerce.number().int().min(1, "Repeat interval must be at least 1.").max(52),
    schedule_mode: z.enum(["fixed_schedule", "after_completion"], {
      message: "Choose whether the task follows a fixed schedule or starts after completion.",
    }),
    start_date: z.string().refine(isIsoDate, "Choose the date of the first occurrence."),
    end_date: optionalDate,
    weekdays: z.array(z.number().int().min(1).max(7)),
    sop_id: optionalUuid,
    remind_days_before: optionalDays,
    escalate_overdue: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.kind === "shared" && !v.department_id) ctx.addIssue({ code: "custom", message: "Choose a department." });
    if (v.kind === "shared" && !v.owner_id) ctx.addIssue({ code: "custom", message: "Choose the accountable owner." });
    if (v.end_date && v.end_date < v.start_date) ctx.addIssue({ code: "custom", message: "The end date is before the start date." });
  });

function readSeries(form: FormData) {
  return seriesSchema.safeParse({
    kind: str(form, "kind"),
    title: str(form, "title"),
    description: str(form, "description"),
    department_id: str(form, "department_id"),
    owner_id: str(form, "owner_id"),
    priority: str(form, "priority") || "normal",
    frequency: str(form, "frequency"),
    interval_count: str(form, "interval_count") || "1",
    schedule_mode: str(form, "schedule_mode"),
    start_date: str(form, "start_date"),
    end_date: str(form, "end_date"),
    weekdays: form.getAll("weekdays").map(Number).filter((n) => Number.isInteger(n)),
    sop_id: str(form, "sop_id"),
    remind_days_before: str(form, "remind_days_before"),
    escalate_overdue: form.get("escalate_overdue") === "on",
  });
}

function seriesColumns(v: z.infer<typeof seriesSchema>, form: FormData) {
  const allDays = v.weekdays.length === 0 || v.weekdays.length === 7;
  return {
    title: v.title,
    description: v.description,
    priority: v.priority as "normal",
    frequency: v.frequency as "daily",
    interval_count: v.interval_count,
    schedule_mode: v.schedule_mode,
    start_date: v.start_date,
    end_date: v.end_date,
    weekdays: v.frequency === "daily" && !allDays ? [...new Set(v.weekdays)].sort() : null,
    checklist_template: checklistLines(form),
    sop_id: v.sop_id,
    remind_days_before: v.remind_days_before,
    escalate_overdue: v.kind === "personal" ? false : v.escalate_overdue,
  };
}

export async function createSeries(_prev: ActionState, form: FormData): Promise<ActionState> {
  const viewer = await requireViewer();
  const parsed = readSeries(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_series")
    .insert({
      ...seriesColumns(v, form),
      kind: v.kind,
      owner_id: v.kind === "personal" ? viewer.id : v.owner_id!,
      department_id: v.kind === "personal" ? null : v.department_id,
      created_by: viewer.id,
    })
    .select("id")
    .single();
  if (error) {
    return fail(
      /row-level security/i.test(error.message)
        ? "Only a department lead or admin can set up a shared recurring task, for a member of that department."
        : dbMessage(error),
    );
  }
  touch();
  redirect(`/tasks/recurring/${data.id}`);
}

export async function updateSeries(_prev: ActionState, form: FormData): Promise<ActionState> {
  await requireViewer();
  const id = str(form, "id");
  if (!isUuid(id)) return fail("Recurring task not found.");
  const parsed = readSeries(form);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("task_series")
    .update({ ...seriesColumns(v, form), ...(v.kind === "shared" ? { owner_id: v.owner_id! } : {}) })
    .eq("id", id)
    .select("id");
  if (error) return fail(dbMessage(error));
  if (!data?.length) return fail("You do not have permission to change this recurring task.");
  touch();
  revalidatePath(`/tasks/recurring/${id}`);
  return done("Saved. Changes apply to future occurrences; tasks already created are not changed.");
}

export async function setSeriesActive(form: FormData): Promise<void> {
  await requireViewer();
  const id = str(form, "id");
  if (!isUuid(id)) return;
  const supabase = await createClient();
  await supabase.from("task_series").update({ is_active: form.get("active") === "true" }).eq("id", id);
  touch();
  revalidatePath(`/tasks/recurring/${id}`);
}
