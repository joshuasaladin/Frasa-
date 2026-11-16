import { NextResponse, type NextRequest } from "next/server";
import { isUuid } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

/**
 * Sends the browser to a 60-second signed URL for a task attachment. The row
 * lookup and the signing both run as the signed-in user, so the task and
 * storage policies decide whether the file can be opened.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  const notFound = new NextResponse("Not found", { status: 404 });
  if (!isUuid(id) || !isUuid(attachmentId)) return notFound;
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("task_attachments")
    .select("storage_path, file_name")
    .eq("id", attachmentId)
    .eq("task_id", id)
    .maybeSingle();
  if (!row) return notFound;
  const { data } = await supabase.storage.from("attachments").createSignedUrl(row.storage_path, 60, { download: row.file_name });
  if (!data?.signedUrl) return notFound;
  return NextResponse.redirect(data.signedUrl);
}
