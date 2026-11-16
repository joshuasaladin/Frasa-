import { NextResponse, type NextRequest } from "next/server";
import { getViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { buildEstimateCsv } from "@/modules/freight/csv";
import { getEstimate, getVersion, listVersions } from "@/modules/freight/queries";

const notFound = () => new NextResponse("Not found", { status: 404 });

/**
 * CSV export of one saved version. Reads go through the caller's session, so
 * someone without freight access gets the same 404 as for an unknown estimate.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer?.canViewFreight) return notFound();

  const { id } = await params;
  const estimate = await getEstimate(id);
  if (!estimate) return notFound();

  const requested = Number(request.nextUrl.searchParams.get("v"));
  const versionNo = Number.isInteger(requested) && requested > 0 ? requested : estimate.current_version_no;
  const version = await getVersion(estimate.id, versionNo);
  if (!version) return notFound();
  const summary = (await listVersions(estimate.id)).find((v) => v.versionNo === versionNo);

  const csv = buildEstimateCsv(
    {
      estimateName: version.inputs.name || estimate.name,
      reference: version.inputs.reference ?? "",
      versionNo,
      savedAt: formatDateTime(version.createdAt),
      savedBy: summary?.createdByName ?? "Unknown",
      note: version.note,
    },
    version.inputs,
    version.results,
  );
  const slug = (version.inputs.name || estimate.name).replace(/[^\w-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "estimate";
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="freight-${slug}-v${versionNo}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
