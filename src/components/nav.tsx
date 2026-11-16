"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon } from "./icons";

export type NavItem = { href: string; label: string; icon: string; badge?: number };
export type NavSection = { title: string; items: NavItem[] };

function isActive(pathname: string, href: string, all: string[]) {
  if (href === "/") return pathname === "/";
  if (!(pathname === href || pathname.startsWith(href + "/"))) return false;
  // Prefer the most specific match (e.g. /tasks/recurring over /tasks).
  return !all.some((o) => o !== href && o.length > href.length && (pathname === o || pathname.startsWith(o + "/")));
}

export function SidebarNav({ sections }: { sections: NavSection[] }) {
  const pathname = usePathname();
  const all = sections.flatMap((s) => s.items.map((i) => i.href));
  return (
    <nav className="flex-1 overflow-y-auto px-2 pb-4">
      {sections.map((section) => (
        <div key={section.title} className="mt-5">
          <p className="px-2 pb-1.5 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-white/45">
            {section.title}
          </p>
          {section.items.map((item) => {
            const active = isActive(pathname, item.href, all);
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-10 items-center gap-2.5 rounded-lg px-2.5 text-[14px] ${
                  active ? "bg-nav-active font-semibold text-white" : "text-white/80 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon name={item.icon} className={`h-[17px] w-[17px] ${active ? "text-brand" : ""}`} />
                <span className="flex-1">{item.label}</span>
                {item.badge ? (
                  <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{item.badge}</span>
                ) : null}
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}

/** Bottom tab bar for phones. */
export function MobileTabs({ items }: { items: NavItem[] }) {
  const pathname = usePathname();
  const all = items.map((i) => i.href);
  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
      {items.map((item) => {
        const active = isActive(pathname, item.href, all);
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={`relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
              active ? "text-forest-900" : "text-muted"
            }`}
          >
            <Icon name={item.icon} className={`h-5 w-5 ${active ? "text-brand" : ""}`} />
            {item.label}
            {item.badge ? (
              <span className="absolute right-[calc(50%-20px)] top-1.5 rounded-full bg-brand px-1 text-[10px] font-bold text-white">
                {item.badge}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
