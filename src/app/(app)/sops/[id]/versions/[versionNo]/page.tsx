import Link from "next/link";
import { notFound } from "next/navigation";
import { requireViewer } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { formatDateTime } from "@/lib/dates";
import { Notice, PageHeader } from "@/components/ui";
import { getSop, listAttachments, listVersions } from "@/modules/sops/queries";
import { SopContent } from "@/modules/sops/sop-content";

export const metadata = { title: "SOP version · Frasa HQ" };

export default async function SopVersionPage({ params }: { params: Promise<{ id: string; versionNo: string }> }) {
  await requireViewer();
  const { id, versionNo } = await params;
  const no = Number(versionNo);
  if (!isUuid(id) || !Number.isInteger(no) || no < 1) notFound();

  const sop = await getSop(id);
  if (!sop) notFound();
  const version = (await listVersions(id)).find((v) => v.versionNo === no && v.status !== "draft");
  if (!version) notFound();
  const attachments = await listAttachments(version.id);
  const isCurrent = sop.current_version_id === version.id && sop.status === "published";

  return (
    <>
      <PageHeader
        eyebrow={`${sop.departmentName} · Version ${version.versionNo}`}
        title={version.title}
        subtitle={`Published ${formatDateTime(version.publishedAt)}${version.publishedByName ? ` by ${version.publishedByName}` : ""}`}
        back={{ href: `/sops/${id}`, label: "Current version" }}
      />
      <div className="mb-4">
        {isCurrent ? (
          <Notice tone="green">This is the current published version.</Notice>
        ) : (
          <Notice tone="red">
            <strong>Superseded — not the current procedure.</strong> Kept for the record only.{" "}
            <Link href={`/sops/${id}`} className="font-semibold underline">
              Open the current version
            </Link>
            .
          </Notice>
        )}
      </div>
      {version.changeSummary ? (
        <p className="mb-4 text-sm text-muted">
          <span className="font-semibold text-ink">What changed in this version:</span> {version.changeSummary}
        </p>
      ) : null}
      <SopContent sopId={id} version={version} attachments={attachments} />
    </>
  );
}
