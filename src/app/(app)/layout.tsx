import Link from "next/link";
import { Icon } from "@/components/icons";
import { Logo } from "@/components/logo";
import { MobileTabs, SidebarNav, type NavItem, type NavSection } from "@/components/nav";
import { requireViewer, ROLE_LABELS } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "../auth/actions";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const viewer = await requireViewer();
  const supabase = await createClient();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .is("read_at", null);
  const unread = count ?? 0;

  const sections: NavSection[] = [
    {
      title: "Overview",
      items: [
        { href: "/", label: "My Work", icon: "home" },
        { href: "/notifications", label: "Notifications", icon: "bell", badge: unread || undefined },
      ],
    },
    {
      title: "Work",
      items: [
        { href: "/tasks", label: "Tasks", icon: "tasks" },
        { href: "/tasks/recurring", label: "Recurring tasks", icon: "repeat" },
      ],
    },
    { title: "Procedures", items: [{ href: "/sops", label: "SOP library", icon: "book" }] },
  ];
  if (viewer.canViewFreight) {
    sections.push({ title: "Costing", items: [{ href: "/freight", label: "Freight calculator", icon: "ship" }] });
  }
  if (viewer.isAdmin) {
    sections.push({
      title: "Admin",
      items: [
        { href: "/admin/users", label: "Users", icon: "users" },
        { href: "/admin/departments", label: "Departments", icon: "building" },
        { href: "/admin/settings", label: "Settings", icon: "settings" },
        { href: "/admin/jobs", label: "Background jobs", icon: "bolt" },
        { href: "/admin/audit", label: "Audit log", icon: "history" },
      ],
    });
  }

  const tabs: NavItem[] = [
    { href: "/", label: "My Work", icon: "home" },
    { href: "/tasks", label: "Tasks", icon: "tasks" },
    { href: "/sops", label: "SOPs", icon: "book" },
    ...(viewer.canViewFreight ? [{ href: "/freight", label: "Freight", icon: "ship" }] : []),
    { href: "/notifications", label: "Alerts", icon: "bell", badge: unread || undefined },
  ];

  const initial = viewer.fullName.trim().charAt(0).toUpperCase() || "?";

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col bg-forest-900 lg:flex">
        <Link href="/" className="px-4 pb-1 pt-5">
          <Logo onDark />
        </Link>
        <SidebarNav sections={sections} />
        <div className="flex items-center gap-2.5 border-t border-white/10 px-3 py-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand text-sm font-bold text-white">{initial}</span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block truncate text-[13px] font-semibold text-white">{viewer.fullName}</span>
            <span className="block text-[11px] text-white/55">{ROLE_LABELS[viewer.role]}</span>
          </span>
          <form action={signOut}>
            <button type="submit" title="Sign out" aria-label="Sign out" className="rounded-lg p-2 text-white/60 hover:bg-white/10 hover:text-white">
              <Icon name="logout" />
            </button>
          </form>
        </div>
      </aside>

      {/* Top bar */}
      <header className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-paper/95 px-4 py-2.5 backdrop-blur lg:px-7">
        <Link href="/" className="lg:hidden" aria-label="Frasa HQ home">
          <span className="text-lg font-black tracking-[0.14em] text-brand">FRASA</span>
        </Link>
        <form action="/search" className="relative min-w-0 flex-1 lg:max-w-md">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">
            <Icon name="search" className="h-4 w-4" />
          </span>
          <input
            type="search"
            name="q"
            placeholder="Search tasks and SOPs…"
            aria-label="Search tasks and SOPs"
            className="input pl-9"
          />
        </form>
        <Link href="/tasks/new" className="btn btn-primary btn-sm shrink-0" aria-label="New task">
          <Icon name="plus" className="h-4 w-4" />
          <span className="hidden sm:inline">New task</span>
        </Link>
        <details className="relative lg:hidden">
          <summary className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-line bg-white" aria-label="Menu">
            <Icon name="menu" />
          </summary>
          <div className="absolute right-0 mt-2 w-64 rounded-xl border border-line bg-white p-2 shadow-lg">
            <p className="px-2 py-1 text-[13px] font-semibold">{viewer.fullName}</p>
            <p className="px-2 pb-2 text-xs text-muted">{ROLE_LABELS[viewer.role]}</p>
            {sections
              .flatMap((s) => s.items)
              .map((i) => (
                <Link key={i.href} href={i.href} className="flex min-h-11 items-center gap-2 rounded-lg px-2 text-sm hover:bg-paper">
                  <Icon name={i.icon} /> {i.label}
                </Link>
              ))}
            <form action={signOut} className="mt-1 border-t border-line pt-1">
              <button type="submit" className="flex min-h-11 w-full items-center gap-2 rounded-lg px-2 text-sm hover:bg-paper">
                <Icon name="logout" /> Sign out
              </button>
            </form>
          </div>
        </details>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 lg:px-7 lg:pb-10">{children}</main>
      <MobileTabs items={tabs} />
    </div>
  );
}
