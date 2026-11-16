import { NextResponse } from "next/server";
import { getViewer } from "@/lib/auth";
import { isUuid } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

/**
 * Downloads a SOP attachment. The row is looked up with the signed-in user's
 * session (row level security decides whether it exists for them), then a
 * 60-second signed URL is created with the same session and the browser is
 * redirected to it. Files are never public.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; attachmentId: string }> }) {
  const { id, attachmentId } = await params;
  const viewer = await getViewer();
  if (!viewer) return new NextResponse("Sign in to download this file.", { status: 401 });
  if (!isUuid(id) || !isUuid(attachmentId)) return new NextResponse("Not found", { status: 404 });

  const supabase = await createClient();
  const { data: attachment } = await supabase
    .from("sop_attachments")
    .select("storage_path, file_name")
    .eq("id", attachmentId)
    .eq("sop_id", id)
    .maybeSingle();
  if (!attachment) return new NextResponse("Not found", { status: 404 });

  const { data: signed, error } = await supabase.storage
    .from("attachments")
    .createSignedUrl(attachment.storage_path, 60, { download: attachment.file_name });
  if (error || !signed?.signedUrl) return new NextResponse("Not found", { status: 404 });

  return NextResponse.redirect(signed.signedUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
}
