import Link from "next/link";
import { revalidatePath } from "next/cache";
import { Card, Empty, PageHeader } from "@/components/ui";
import { requireViewer } from "@/lib/auth";
import { formatDateTime } from "@/lib/dates";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Notifications" };

const KIND_LABELS: Record<string, [string, string]> = {
  task_assigned: ["Assigned", "badge-blue"],
  task_reminder: ["Reminder", "badge-orange"],
  task_overdue: ["Overdue", "badge-red"],
  sop_published: ["SOP update", "badge-green"],
  sop_ack_requested: ["Acknowledge", "badge-orange"],
};

async function markAllRead() {
  "use server";
  await requireViewer();
  const supabase = await createClient();
  await supabase.rpc("mark_notifications_read", {});
  revalidatePath("/", "layout");
}

export default async function NotificationsPage() {
  await requireViewer();
  const supabase = await createClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, created_at, read_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const unread = (data ?? []).filter((n) => !n.read_at).length;

  return (
    <>
      <PageHeader
        title="Notifications"
        subtitle={unread ? `${unread} unread` : "Everything is read."}
        actions={unread ? <form action={markAllRead}><button className="btn" type="submit">Mark all as read</button></form> : null}
      />
      <Card padded={false}>
        {data?.length ? (
          <ul className="divide-y divide-line">
            {data.map((n) => {
              const [label, badge] = KIND_LABELS[n.kind] ?? ["Notice", "badge-gray"];
              return (
                <li key={n.id}>
                  <Link href={`/notifications/open/${n.id}`} prefetch={false} className={`flex items-start gap-3 px-4 py-3 hover:bg-paper ${n.read_at ? "opacity-60" : ""}`}>
                    <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${n.read_at ? "bg-transparent" : "bg-brand"}`} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-semibold">{n.title}</span>
                      {n.body ? <span className="block text-sm text-muted">{n.body}</span> : null}
                      <span className="block text-xs text-muted">{formatDateTime(n.created_at)}</span>
                    </span>
                    <span className={`badge ${badge}`}>{label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <Empty>No notifications yet. Reminders, overdue escalations and SOP updates appear here.</Empty>
        )}
      </Card>
    </>
  );
}
