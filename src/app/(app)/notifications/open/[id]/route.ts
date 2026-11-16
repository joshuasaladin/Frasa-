import type { NextRequest } from "next/server";
import { redirectToPath } from "@/lib/redirect";
import { isUuid, safeNext } from "@/lib/action";
import { createClient } from "@/lib/supabase/server";

/** Marks one notification as read and opens what it points to. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (isUuid(id)) {
    const supabase = await createClient();
    const { data } = await supabase.from("notifications").select("link").eq("id", id).maybeSingle();
    if (data) {
      await supabase.rpc("mark_notifications_read", { p_ids: [id] });
      return redirectToPath(safeNext(data.link, "/notifications"));
    }
  }
  return redirectToPath("/notifications");
}
