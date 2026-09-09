import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin/auth";
import { AdminSidebar } from "@/components/admin/AdminSidebar";
import { AdminTopbar } from "@/components/admin/AdminTopbar";

/// Applies to every page in the group, so no admin screen has to remember to
/// opt out of search on its own. Overriding `title.template` too: the console
/// is an internal tool and "Songs · Cluecade" reads like a public page.
export const metadata: Metadata = {
  title: {
    default: "Admin",
    template: "%s · Cluecade Admin",
  },
  robots: { index: false, follow: false, nocache: true },
};

// The (protected) route group doesn't appear in the URL — /admin, /admin/songs,
// and /admin/users all resolve normally — but it excludes the sibling
// src/app/admin/login/ directory from this layout, so the login page stays
// public while everything nested here requires requireAdmin().
export default async function AdminProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    // min-h-screen (not min-h-full): min-h-full only resolves against the
    // parent's content height, which on a short page (a small form, the
    // dashboard) is shorter than the viewport — the whole row, sidebar
    // included, would end wherever the content ends instead of reaching the
    // bottom of the screen.
    <div className="flex min-h-screen bg-(--bg) text-(--text)">
      <AdminSidebar />
      <div className="flex flex-1 flex-col">
        <AdminTopbar admin={admin} />
        <main className="flex-1 p-6">{children}</main>
      </div>
    </div>
  );
}
