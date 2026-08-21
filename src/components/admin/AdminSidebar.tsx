"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavItem = {
  href: string;
  label: string;
  icon: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/admin", label: "Dashboard", icon: "🏠" },
  { href: "/admin/songs", label: "Manage Song", icon: "🎵" },
  { href: "/admin/users", label: "Manage User", icon: "👥" },
];

// A persistent column, unlike the player-facing src/components/Sidebar.tsx
// (a slide-in drawer keyed by onSelect callbacks) — the admin panel has real
// distinct routes, so this uses actual <Link>s and highlights by pathname.
//
// h-screen + sticky (not just flex-stretch off the parent row): pins the
// sidebar to the full viewport height and keeps it in place while the
// content column scrolls independently, instead of it only being as tall as
// whatever the row's content happens to be.
export function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 flex-shrink-0 flex-col gap-4 overflow-y-auto border-r border-(--hairline) bg-(--surface-strong) p-5">
      <Link
        href="/admin"
        className="flex items-center gap-2 border-b border-(--hairline) pb-4 text-base font-[family-name:var(--font-display)] font-bold text-(--text)"
      >
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
          G
        </span>
        Admin
      </Link>

      <nav className="flex flex-col gap-1.5">
        {NAV_ITEMS.map((item) => {
          const isActive =
            item.href === "/admin"
              ? pathname === "/admin"
              : pathname.startsWith(item.href);

          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition ${
                isActive
                  ? "bg-gradient-to-r from-violet-600 to-fuchsia-600 text-white shadow-sm"
                  : "text-(--text-dim) hover:bg-(--surface-hover)"
              }`}
            >
              <span className="inline-flex w-5 shrink-0 justify-center text-base">
                {item.icon}
              </span>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
