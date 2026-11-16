import { notFound } from "next/navigation";
import { requireFreightAccess } from "@/lib/auth";
import { Notice, PageHeader } from "@/components/ui";
import { EstimateEditor } from "@/modules/freight/estimate-editor";
import { editableInputs, getEstimate } from "@/modules/freight/queries";

export const metadata = { title: "Edit freight estimate" };

export default async function EditEstimatePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ v?: string }>;
}) {
  await requireFreightAccess("edit");
  const { id } = await params;
  const sp = await searchParams;
  const estimate = await getEstimate(id);
  if (!estimate) notFound();

  const baseVersion = Number(sp.v) || estimate.current_version_no;
  const initial = await editableInputs(estimate.id, baseVersion);
  if (!initial) notFound();

  return (
    <>
      <PageHeader
        eyebrow="Freight calculator"
        title={`Edit: ${estimate.name}`}
        subtitle={`Saving creates version ${estimate.current_version_no + 1}. Versions already saved are never changed.`}
        back={{ href: `/freight/${estimate.id}`, label: "Back to estimate" }}
      />
      {baseVersion !== estimate.current_version_no ? (
        <div className="mb-4">
          <Notice>
            You are starting from version {baseVersion}, not the latest version ({estimate.current_version_no}).
          </Notice>
        </div>
      ) : null}
      <EstimateEditor initial={initial} estimateId={estimate.id} currentVersionNo={estimate.current_version_no} />
    </>
  );
}
