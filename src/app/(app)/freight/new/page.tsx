import { notFound } from "next/navigation";
import { requireFreightAccess } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { Notice, PageHeader } from "@/components/ui";
import { EstimateEditor } from "@/modules/freight/estimate-editor";
import { editableInputs, getEstimate, newEstimateInputs } from "@/modules/freight/queries";

export const metadata = { title: "New freight estimate" };

export default async function NewEstimatePage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; v?: string }>;
}) {
  await requireFreightAccess("edit");
  const sp = await searchParams;

  // Duplicate: start from the inputs of a saved version.
  let duplicatedFrom: string | undefined;
  let sourceName: string | undefined;
  let initial = null;
  if (typeof sp.from === "string") {
    if (!isUuid(sp.from)) notFound();
    const source = await getEstimate(sp.from);
    if (!source) notFound();
    const versionNo = Number(sp.v) || source.current_version_no;
    initial = await editableInputs(source.id, versionNo);
    if (!initial) notFound();
    duplicatedFrom = source.id;
    sourceName = `${source.name} (v${versionNo})`;
    initial = { ...initial, name: `Copy of ${initial.name}`.slice(0, 200) };
  }
  initial ??= await newEstimateInputs();

  return (
    <>
      <PageHeader
        eyebrow="Freight calculator"
        title={duplicatedFrom ? "Duplicate estimate" : "New estimate"}
        back={{ href: "/freight", label: "All estimates" }}
      />
      {duplicatedFrom ? (
        <div className="mb-4">
          <Notice tone="blue">
            Started from a copy of {sourceName}. Saving creates a separate estimate; the original is not changed.
          </Notice>
        </div>
      ) : null}
      <EstimateEditor initial={initial} duplicatedFrom={duplicatedFrom} />
    </>
  );
}
