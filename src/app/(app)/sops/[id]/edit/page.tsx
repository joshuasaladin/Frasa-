import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { Card, Field, Notice, PageHeader } from "@/components/ui";
import {
  discardDraftAction,
  removeSopAttachmentAction,
  saveSopAction,
  setArchivedAction,
  startRevisionAction,
  uploadSopAttachmentAction,
} from "@/modules/sops/actions";
import {
  canEditSop,
  canPublishIn,
  getSop,
  getSopReferenceData,
  listAttachments,
  listVersions,
} from "@/modules/sops/queries";
import { LinksEditor, StepsEditor } from "@/modules/sops/steps-editor";
import { formatBytes } from "@/modules/sops/types";

export const metadata = { title: "Edit SOP · Frasa HQ" };

export default async function EditSopPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const sop = await getSop(id);
  if (!sop || !canEditSop(viewer, sop)) notFound();

  const isPublisher = canPublishIn(viewer, sop.department_id);
  const [versions, reference] = await Promise.all([listVersions(id), getSopReferenceData(await createClient())]);
  const draft = versions.find((v) => v.status === "draft") ?? null;
  const current = versions.find((v) => v.id === sop.current_version_id) ?? null;
  const attachments = draft ? await listAttachments(draft.id) : [];
  const departments = viewer.isAdmin
    ? reference.departments
    : reference.departments.filter((d) => viewer.ledDepartmentIds.includes(d.id) || d.id === sop.department_id);
  const archived = sop.status === "archived";

  return (
    <>
      <PageHeader
        eyebrow={draft ? `Draft v${draft.versionNo}` : archived ? "Archived" : "Details"}
        title={draft?.title ?? sop.title}
        subtitle={
          draft
            ? `Last saved ${formatDateTime(draft.updatedAt)}`
            : "There is no draft revision at the moment."
        }
        back={
          sop.status === "published"
            ? { href: `/sops/${id}`, label: "Published version" }
            : { href: "/sops?view=drafts", label: "Drafts and archived" }
        }
      />

      <div className="mb-4 space-y-3">
        {sop.is_sample ? (
          <Notice tone="amber">
            <strong>Sample — revise before publishing.</strong> This example was supplied with Frasa HQ. It does not
            describe Frasa&apos;s actual rules; replace the wording and the notes in [square brackets] first.
          </Notice>
        ) : null}
        {archived ? (
          <Notice tone="amber">This SOP is archived. Employees cannot see it. Restore it at the bottom of this page.</Notice>
        ) : null}
        {draft && current && !archived ? (
          <Notice tone="blue">
            Employees keep seeing published version {current.versionNo} until this draft is published.
          </Notice>
        ) : null}
        {!draft ? (
          <Notice tone="blue">
            <span className="flex flex-wrap items-center justify-between gap-3">
              <span>To change the wording, steps, links or attachments, start a revision.</span>
              <ActionForm action={startRevisionAction}>
                <input type="hidden" name="sop_id" value={id} />
                <SubmitButton className="btn btn-primary btn-sm">Start a revision</SubmitButton>
              </ActionForm>
            </span>
          </Notice>
        ) : null}
      </div>

      <ActionForm action={saveSopAction} className="space-y-4">
        <input type="hidden" name="sop_id" value={id} />
        <input type="hidden" name="version_id" value={draft?.id ?? ""} />

        <Card title="Details">
          <p className="mb-3 text-xs text-muted">
            Details apply to the SOP as a whole and take effect as soon as you save, also for the published version.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field
              label="Department"
              hint={isPublisher ? undefined : "Only a department lead or admin can change this."}
            >
              <select name="department_id" className="input" defaultValue={sop.department_id ?? ""} disabled={!isPublisher}>
                {viewer.isAdmin || sop.department_id === null ? <option value="">Company-wide</option> : null}
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Category">
              <select name="category_id" className="input" defaultValue={sop.category_id ?? ""}>
                <option value="">Uncategorised</option>
                {reference.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field
              label="Owner"
              hint={isPublisher ? "Responsible for keeping this procedure correct. Required to publish." : "Only a department lead or admin can change this."}
            >
              <select name="owner_id" className="input" defaultValue={sop.owner_id ?? ""} disabled={!isPublisher}>
                <option value="">Not assigned</option>
                {reference.people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Next review date" hint="Required to publish.">
              <input type="date" name="next_review_date" className="input" defaultValue={sop.next_review_date ?? ""} />
            </Field>
            <Field label="Tags" hint="Separate with commas, e.g. supplier, quote" className="sm:col-span-2">
              <input name="tags" className="input" defaultValue={sop.tags.join(", ")} autoComplete="off" />
            </Field>
          </div>
          {sop.is_sample ? (
            <label className="mt-4 flex min-h-11 items-start gap-2.5 text-sm">
              <input type="checkbox" name="sample_revised" className="mt-1 h-5 w-5" />
              <span>
                <span className="font-semibold">This has been revised for Frasa.</span> Remove the “Sample” label.
              </span>
            </label>
          ) : null}
        </Card>

        {draft ? (
          <>
            <Card title="Content">
              <div className="space-y-4">
                <Field label="Title">
                  <input name="title" className="input" defaultValue={draft.title} required minLength={3} maxLength={200} />
                </Field>
                <Field label="Purpose" hint="Why this procedure exists and when to use it.">
                  <textarea name="purpose" className="input" rows={4} defaultValue={draft.purpose} maxLength={5000} />
                </Field>
              </div>
            </Card>

            <Card title="Steps">
              <StepsEditor initial={draft.steps} />
            </Card>

            <Card title="Links">
              <p className="mb-3 text-xs text-muted">
                For example a NECS screen, a supplier portal or a shared document. Addresses must start with http:// or
                https://.
              </p>
              <LinksEditor initial={draft.links} />
            </Card>

            <Card title={draft.versionNo > 1 ? "Save or publish this revision" : "Save or publish"}>
              <div className="space-y-4">
                <Field
                  label="What changed in this version"
                  hint="Shown in the revision history and in the notification employees receive."
                >
                  <textarea
                    name="change_summary"
                    className="input"
                    rows={2}
                    maxLength={1000}
                    defaultValue={draft.changeSummary}
                  />
                </Field>
                {isPublisher ? (
                  <label className="flex min-h-11 items-start gap-2.5 text-sm">
                    <input type="checkbox" name="requires_ack" className="mt-1 h-5 w-5" />
                    <span>
                      <span className="font-semibold">Request acknowledgment from employees for this version.</span>
                      <span className="block text-muted">
                        {sop.department_id
                          ? `Every active member of ${sop.departmentName} is asked to confirm they have read it.`
                          : "Every active employee is asked to confirm they have read it."}
                      </span>
                    </span>
                  </label>
                ) : (
                  <Notice tone="blue">
                    You can save this draft. A department lead or admin publishes it.
                  </Notice>
                )}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton name="intent" value="save" className={isPublisher ? "btn" : "btn btn-primary"}>
                    Save draft
                  </SubmitButton>
                  {isPublisher && !archived ? (
                    <SubmitButton
                      name="intent"
                      value="publish"
                      className="btn btn-primary"
                      confirm={
                        current
                          ? `Publish version ${draft.versionNo}? It replaces version ${current.versionNo} for all employees.`
                          : "Publish this SOP? Employees will be able to see it."
                      }
                    >
                      Save and publish v{draft.versionNo}
                    </SubmitButton>
                  ) : null}
                </div>
              </div>
            </Card>
          </>
        ) : (
          <div>
            <SubmitButton>Save details</SubmitButton>
          </div>
        )}
      </ActionForm>

      {draft ? (
        <Card title={`Attachments (${attachments.length})`} className="mt-4">
          {attachments.length === 0 ? (
            <p className="text-sm text-muted">No files attached to this draft.</p>
          ) : (
            <ul className="divide-y divide-line">
              {attachments.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <a
                    href={`/sops/${id}/attachments/${a.id}`}
                    className="flex min-h-11 min-w-0 items-center gap-2 text-sm font-medium text-forest-600 hover:underline"
                  >
                    <Icon name="clip" />
                    <span className="min-w-0 break-words">{a.fileName}</span>
                    <span className="shrink-0 text-xs font-normal text-muted">{formatBytes(a.sizeBytes)}</span>
                  </a>
                  <ActionForm action={removeSopAttachmentAction}>
                    <input type="hidden" name="sop_id" value={id} />
                    <input type="hidden" name="attachment_id" value={a.id} />
                    <SubmitButton className="btn btn-sm btn-danger" confirm={`Remove ${a.fileName} from this draft?`}>
                      Remove
                    </SubmitButton>
                  </ActionForm>
                </li>
              ))}
            </ul>
          )}
          <ActionForm action={uploadSopAttachmentAction} resetOnSuccess className="mt-3 border-t border-line pt-3">
            <input type="hidden" name="sop_id" value={id} />
            <input type="hidden" name="version_id" value={draft.id} />
            <div className="flex flex-wrap items-end gap-2">
              <Field label="Add a file" hint="Up to 25 MB. Published with the draft." className="min-w-0 flex-1">
                <input type="file" name="file" required className="input py-2" />
              </Field>
              <SubmitButton className="btn">Upload</SubmitButton>
            </div>
          </ActionForm>
        </Card>
      ) : null}

      {(draft && draft.versionNo > 1) || isPublisher ? (
        <Card title="Other actions" className="mt-4">
          <div className="flex flex-wrap items-start gap-3">
            {draft && draft.versionNo > 1 ? (
              <ActionForm action={discardDraftAction}>
                <input type="hidden" name="sop_id" value={id} />
                <input type="hidden" name="version_id" value={draft.id} />
                <SubmitButton
                  className="btn btn-danger"
                  confirm={`Discard draft v${draft.versionNo}? The published version is not affected.`}
                >
                  Discard this draft revision
                </SubmitButton>
              </ActionForm>
            ) : null}
            {isPublisher ? (
              <ActionForm action={setArchivedAction}>
                <input type="hidden" name="sop_id" value={id} />
                <input type="hidden" name="archived" value={archived ? "false" : "true"} />
                {archived ? (
                  <SubmitButton className="btn">Restore this SOP</SubmitButton>
                ) : (
                  <SubmitButton
                    className="btn btn-danger"
                    confirm="Archive this SOP? Employees will no longer see it. You can restore it later."
                  >
                    Archive this SOP
                  </SubmitButton>
                )}
              </ActionForm>
            ) : null}
          </div>
          {sop.status === "published" ? (
            <p className="mt-3 text-xs text-muted">
              <Link href={`/sops/${id}`} className="link">
                View the published version
              </Link>
            </p>
          ) : null}
        </Card>
      ) : null}
    </>
  );
}
