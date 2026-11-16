"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import type { ActionState } from "@/lib/action";
import { PRIORITIES, PRIORITY_LABELS, WEEKDAYS } from "./labels";
import type { TaskFormOptions } from "./queries";

type Action = (prev: ActionState, form: FormData) => Promise<ActionState>;

export type TaskFormValues = {
  id?: string;
  kind: "personal" | "shared";
  title: string;
  description: string;
  department_id: string;
  owner_id: string;
  due_date: string;
  priority: string;
  sop_id: string;
  freight_estimate_id: string;
  external_link_label: string;
  external_link_url: string;
  remind_days_before: string;
  escalate_overdue: boolean;
  checklist: string;
  // recurring series only
  frequency?: string;
  interval_count?: string;
  schedule_mode?: string;
  start_date?: string;
  end_date?: string;
  weekdays?: number[];
};

/**
 * One form for tasks and recurring series. `mode` decides which fields appear:
 *   task-new / task-edit: a single task;  series-new / series-edit: a recurrence rule.
 */
export function TaskForm({
  mode,
  action,
  options,
  values,
  viewerId,
  canCreateSharedSeries,
  hiddenFreightLink,
}: {
  mode: "task-new" | "task-edit" | "series-new" | "series-edit";
  action: Action;
  options: TaskFormOptions;
  values: TaskFormValues;
  viewerId: string;
  canCreateSharedSeries?: boolean;
  hiddenFreightLink?: boolean;
}) {
  const isSeries = mode.startsWith("series");
  const isEdit = mode.endsWith("edit");
  const [kind, setKind] = useState(values.kind);
  const [departmentId, setDepartmentId] = useState(values.department_id);
  const [ownerId, setOwnerId] = useState(values.owner_id);
  const [frequency, setFrequency] = useState(values.frequency ?? "weekly");
  const [scheduleMode, setScheduleMode] = useState(values.schedule_mode ?? "");
  const shared = kind === "shared";
  const sharedAllowed = options.departments.length > 0 && (!isSeries || canCreateSharedSeries);

  const ownerIds = options.assignable[departmentId] ?? [];
  const owners = options.people.filter((p) => ownerIds.includes(p.id));
  // Keep the current owner selectable when editing even if no longer a member.
  if (isEdit && values.owner_id && !owners.some((o) => o.id === values.owner_id)) {
    const current = options.people.find((p) => p.id === values.owner_id);
    if (current) owners.push(current);
  }

  function changeDepartment(id: string) {
    setDepartmentId(id);
    const allowed = options.assignable[id] ?? [];
    if (!allowed.includes(ownerId)) setOwnerId(allowed.includes(viewerId) ? viewerId : (allowed[0] ?? ""));
  }

  return (
    <ActionForm action={action} className="space-y-5">
      {values.id ? <input type="hidden" name="id" value={values.id} /> : null}
      <input type="hidden" name="kind" value={kind} />

      {!isEdit ? (
        <fieldset>
          <legend className="label">Type</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                ["personal", "Personal to-do", "Only you can see it."],
                ["shared", "Shared task", "Visible to the department, with one accountable owner."],
              ] as const
            ).map(([value, title, text]) => (
              <button
                key={value}
                type="button"
                disabled={value === "shared" && !sharedAllowed}
                onClick={() => setKind(value)}
                aria-pressed={kind === value}
                className={`rounded-lg border p-3 text-left disabled:opacity-50 ${
                  kind === value ? "border-forest-700 bg-forest-100" : "border-line bg-white"
                }`}
              >
                <span className="block text-sm font-semibold">{title}</span>
                <span className="block text-xs text-muted">
                  {value === "shared" && !sharedAllowed
                    ? isSeries
                      ? "Shared recurring tasks are set up by department leads and admins."
                      : "You are not a member of a department yet."
                    : text}
                </span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <label className="block">
        <span className="label">Title</span>
        <input className="input" name="title" defaultValue={values.title} maxLength={200} required />
      </label>
      <label className="block">
        <span className="label">Details</span>
        <textarea className="input" name="description" rows={3} defaultValue={values.description} />
      </label>

      {shared ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Department</span>
            <select
              className="input"
              name="department_id"
              value={departmentId}
              onChange={(e) => changeDepartment(e.target.value)}
              disabled={mode === "series-edit"}
              required
            >
              <option value="">Choose…</option>
              {options.departments.map((d) => (
                <option key={d.id} value={d.id}>{d.name}</option>
              ))}
            </select>
            {mode === "series-edit" ? <input type="hidden" name="department_id" value={departmentId} /> : null}
          </label>
          <label className="block">
            <span className="label">Accountable owner</span>
            <select className="input" name="owner_id" value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
              <option value="">Choose…</option>
              {owners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}{p.id === viewerId ? " (me)" : ""}</option>
              ))}
            </select>
            <span className="hint block">One person is accountable. Only people you may assign in this department are listed.</span>
          </label>
        </div>
      ) : null}

      {isSeries ? (
        <fieldset className="space-y-4 rounded-lg border border-line bg-paper/60 p-3">
          <legend className="px-1 text-[13px] font-semibold">Repeats</legend>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block">
              <span className="label">Every</span>
              <input className="input" type="number" name="interval_count" min={1} max={52} defaultValue={values.interval_count ?? "1"} required />
            </label>
            <label className="block sm:col-span-2">
              <span className="label">Period</span>
              <select className="input" name="frequency" value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                <option value="daily">day(s)</option>
                <option value="weekly">week(s)</option>
                <option value="monthly">month(s)</option>
              </select>
            </label>
          </div>
          {frequency === "daily" ? (
            <div>
              <span className="label">On these days</span>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d) => (
                  <label key={d.n} className="flex min-h-10 cursor-pointer items-center gap-1.5 rounded-lg border border-line bg-white px-3 text-sm">
                    <input type="checkbox" name="weekdays" value={d.n} defaultChecked={!values.weekdays?.length || values.weekdays.includes(d.n)} />
                    {d.short}
                  </label>
                ))}
              </div>
            </div>
          ) : null}
          <div>
            <span className="label">How is the next task scheduled?</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {(
                [
                  ["fixed_schedule", "Fixed schedule", "Tasks fall on set calendar dates counted from the start date (for example the 1st of every month), whether or not the previous one was finished."],
                  ["after_completion", "After completion", "The next task is due one period after the previous one is completed. Nothing new appears while one is still open."],
                ] as const
              ).map(([value, title, text]) => (
                <label
                  key={value}
                  className={`cursor-pointer rounded-lg border p-3 ${scheduleMode === value ? "border-forest-700 bg-forest-100" : "border-line bg-white"}`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    <input type="radio" name="schedule_mode" value={value} checked={scheduleMode === value} onChange={() => setScheduleMode(value)} required />
                    {title}
                  </span>
                  <span className="mt-1 block text-xs text-muted">{text}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="label">{isEdit ? "Start date (anchor)" : "First due date"}</span>
              <input className="input" type="date" name="start_date" defaultValue={values.start_date} required />
              <span className="hint block">
                {isEdit
                  ? "If you change the repeat rule or this date, it becomes the date of the next occurrence. Tasks already created are not changed."
                  : "Aruba date. For a monthly task on the 31st, shorter months use their last day."}
              </span>
            </label>
            <label className="block">
              <span className="label">End date (optional)</span>
              <input className="input" type="date" name="end_date" defaultValue={values.end_date} />
            </label>
          </div>
        </fieldset>
      ) : (
        <label className="block sm:max-w-xs">
          <span className="label">Due date{shared ? "" : " (optional)"}</span>
          <input className="input" type="date" name="due_date" defaultValue={values.due_date} required={shared} />
          <span className="hint block">Aruba local date.</span>
        </label>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Priority</span>
          <select className="input" name="priority" defaultValue={values.priority}>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="label">Remind the owner (days before due)</span>
          <input
            className="input"
            type="number"
            name="remind_days_before"
            min={0}
            max={30}
            defaultValue={values.remind_days_before}
            placeholder={`Company default: ${options.defaultRemindDays}`}
          />
          <span className="hint block">0 = on the due date. Leave blank to use the company default.</span>
        </label>
      </div>

      {shared ? (
        <label className="flex min-h-10 items-start gap-2 text-sm">
          <input type="checkbox" name="escalate_overdue" defaultChecked={values.escalate_overdue} className="mt-1" />
          <span>
            <span className="font-semibold">Escalate when overdue</span>
            <span className="block text-xs text-muted">Notifies the department lead in Frasa HQ once the due date has passed.</span>
          </span>
        </label>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block">
          <span className="label">Related SOP (optional)</span>
          <select className="input" name="sop_id" defaultValue={values.sop_id}>
            <option value="">None</option>
            {options.sops.map((s) => (
              <option key={s.id} value={s.id}>{s.title}</option>
            ))}
          </select>
        </label>
        {!isSeries && options.freightEstimates.length > 0 ? (
          <label className="block">
            <span className="label">Saved freight estimate (optional)</span>
            <select className="input" name="freight_estimate_id" defaultValue={values.freight_estimate_id}>
              <option value="">None</option>
              {options.freightEstimates.map((e) => (
                <option key={e.id} value={e.id}>{e.name}</option>
              ))}
            </select>
          </label>
        ) : null}
        {hiddenFreightLink ? (
          <p className="self-end text-xs text-muted">A freight estimate is linked to this task. It stays linked; you need freight access to see or change it.</p>
        ) : null}
      </div>

      {!isSeries ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="label">Record in NECS / QuickBooks (optional)</span>
            <input className="input" name="external_link_label" defaultValue={values.external_link_label} placeholder="e.g. NECS order 10452" maxLength={120} />
          </label>
          <label className="block">
            <span className="label">Link to that record (optional)</span>
            <input className="input" type="url" name="external_link_url" defaultValue={values.external_link_url} placeholder="https://…" />
          </label>
        </div>
      ) : null}

      {mode !== "task-edit" ? (
        <label className="block">
          <span className="label">Checklist (optional)</span>
          <textarea className="input" name="checklist" rows={4} defaultValue={values.checklist} placeholder={"One step per line"} />
          {isSeries ? <span className="hint block">Every new occurrence starts with this checklist.</span> : null}
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <SubmitButton>{isEdit ? "Save changes" : isSeries ? "Create recurring task" : "Create task"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
