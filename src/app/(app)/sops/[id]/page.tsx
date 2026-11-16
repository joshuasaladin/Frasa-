import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { arubaToday, formatDate, formatDateTime } from "@/lib/dates";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Card, Notice, PageHeader, TableWrap } from "@/components/ui";
import { acknowledgeSopAction, startRevisionAction } from "@/modules/sops/actions";
import {
  canEditSop,
  getAckStatus,
  getSop,
  hasAcknowledged,
  inAudience,
  listAttachments,
  listVersions,
} from "@/modules/sops/queries";
import { SopContent } from "@/modules/sops/sop-content";

export const metadata = { title: "SOP · Frasa HQ" };

export default async function SopPage({ params }: { params: Promise<{ id: string }> }) {
  const viewer = await requireViewer();
  const { id } = await params;
  if (!isUuid(id)) notFound();

  const sop = await getSop(id);
  if (!sop) notFound();
  const canEdit = canEditSop(viewer, sop);
  if (sop.status !== "published") {
    // Drafts and archived SOPs only exist for their editors.
    if (canEdit) redirect(`/sops/${id}/edit`);
    notFound();
  }

  const versions = await listVersions(id);
  const current = versions.find((v) => v.id === sop.current_version_id);
  if (!current) notFound();
  const draft = versions.find((v) => v.status === "draft");
  const history = versions.filter((v) => v.status !== "draft");

  const mustAcknowledge = current.requiresAck && inAudience(viewer, sop.department_id);
  const [attachments, acknowledgedAt, ackRows] = await Promise.all([
    listAttachments(current.id),
    mustAcknowledge ? hasAcknowledged(current.id, viewer.id) : Promise.resolve(null),
    canEdit && current.requiresAck ? getAckStatus(sop, current.id) : Promise.resolve(null),
  ]);
  const today = arubaToday();
  const reviewOverdue = !!sop.next_review_date && sop.next_review_date < today;

  return (
    <>
      <PageHeader
        eyebrow={`${sop.departmentName}${sop.categoryName ? ` · ${sop.categoryName}` : ""}`}
        title={current.title}
        back={{ href: "/sops", label: "SOP library" }}
        actions={
          canEdit ? (
            draft ? (
              <Link href={`/sops/${id}/edit`} className="btn btn-primary">
                Continue draft v{draft.versionNo}
              </Link>
            ) : (
              <>
                <Link href={`/sops/${id}/edit`} className="btn">
                  Details
                </Link>
                <ActionForm action={startRevisionAction}>
                  <input type="hidden" name="sop_id" value={id} />
                  <SubmitButton>Start a revision</SubmitButton>
                </ActionForm>
              </>
            )
          ) : null
        }
      />

      <div className="mb-4 space-y-3">
        {canEdit && draft ? (
          <Notice tone="blue">
            Draft revision v{draft.versionNo} in progress (last saved {formatDateTime(draft.updatedAt)}). Employees
            still see version {current.versionNo} below.{" "}
            <Link href={`/sops/${id}/edit`} className="font-semibold underline">
              Open the draft
            </Link>
          </Notice>
        ) : null}

        {mustAcknowledge ? (
          acknowledgedAt ? (
            <Notice tone="green">
              You acknowledged version {current.versionNo} on {formatDateTime(acknowledgedAt)}.
            </Notice>
          ) : (
            <div className="rounded-xl border border-orange-200 bg-brand-100 p-4">
              <p className="text-[15px] font-semibold text-ink">Please read this procedure and acknowledge it.</p>
              <p className="mt-0.5 text-sm text-ink/75">
                Acknowledging confirms you have read and understood version {current.versionNo}.
              </p>
              <ActionForm action={acknowledgeSopAction} className="mt-3">
                <input type="hidden" name="sop_id" value={id} />
                <input type="hidden" name="version_id" value={current.id} />
                <SubmitButton className="btn btn-accent w-full sm:w-auto">I have read and understood this</SubmitButton>
              </ActionForm>
            </div>
          )
        ) : null}
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_300px]">
        <SopContent sopId={id} version={current} attachments={attachments} />

        <aside className="space-y-4">
          <Card title="About this SOP">
            <dl className="space-y-2.5 text-sm">
              <Row label="Version">
                v{current.versionNo}
                {current.requiresAck ? <span className="badge badge-orange ml-2">Acknowledgment requested</span> : null}
              </Row>
              <Row label="Published">
                {formatDateTime(current.publishedAt)}
                {current.publishedByName ? ` by ${current.publishedByName}` : ""}
              </Row>
              <Row label="Owner">{sop.ownerName ?? "—"}</Row>
              <Row label="Department">{sop.departmentName}</Row>
              <Row label="Category">{sop.categoryName ?? "Uncategorised"}</Row>
              <Row label="Next review">
                {formatDate(sop.next_review_date)}
                {reviewOverdue ? <span className="badge badge-amber ml-2">Review overdue</span> : null}
              </Row>
            </dl>
            {sop.tags.length > 0 ? (
              <div className="mt-3 flex flex-wrap gap-1">
                {sop.tags.map((t) => (
                  <Link key={t} href={`/sops?tag=${encodeURIComponent(t)}`} className="badge badge-gray">
                    #{t}
                  </Link>
                ))}
              </div>
            ) : null}
          </Card>

          <Card title="Revision history" padded={false}>
            <ul className="divide-y divide-line">
              {history.map((v) => (
                <li key={v.id} className="px-4 py-3 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    {v.id === current.id ? (
                      <span className="font-semibold">
                        v{v.versionNo} <span className="badge badge-green ml-1">Current</span>
                      </span>
                    ) : (
                      <Link href={`/sops/${id}/versions/${v.versionNo}`} className="link">
                        v{v.versionNo}
                      </Link>
                    )}
                    <span className="text-xs text-muted">{formatDate(v.publishedAt?.slice(0, 10))}</span>
                  </div>
                  <p className="mt-0.5 text-xs text-muted">
                    {v.publishedByName ? `${v.publishedByName} · ` : ""}
                    {v.changeSummary || "No change summary."}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </aside>
      </div>

      {ackRows ? (
        <Card
          className="mt-4"
          padded={false}
          title={`Acknowledgments for v${current.versionNo}: ${ackRows.filter((r) => r.acknowledgedAt).length} of ${ackRows.length}`}
        >
          {ackRows.length === 0 ? (
            <p className="px-4 py-4 text-sm text-muted">
              Nobody is expected to acknowledge this yet: the department has no active members.
            </p>
          ) : (
            <TableWrap>
              <table className="table">
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Status</th>
                    <th>Acknowledged</th>
                  </tr>
                </thead>
                <tbody>
                  {ackRows.map((row) => (
                    <tr key={row.userId}>
                      <td>
                        <span className="font-medium">{row.name}</span>
                        <span className="block text-xs text-muted">{row.email}</span>
                      </td>
                      <td>
                        {row.acknowledgedAt ? (
                          <span className="badge badge-green">Acknowledged</span>
                        ) : (
                          <span className="badge badge-amber">Outstanding</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap">{row.acknowledgedAt ? formatDateTime(row.acknowledgedAt) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </TableWrap>
          )}
        </Card>
      ) : null}
    </>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-3">
      <dt className="w-24 shrink-0 text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium">{children}</dd>
    </div>
  );
}
