import { adminLogout } from "@/lib/admin/actions";
import type { AdminUser } from "@/lib/admin/auth";
import { ThemeModeToggle } from "@/components/ThemeModeToggle";

type Props = {
  admin: AdminUser;
};

// Server component — the logout button is a plain form action, no client JS
// needed just to sign out. ThemeModeToggle is the same client component the
// player-facing app uses; it toggles the .dark class the CSS variable tokens
// throughout this admin UI already respond to, so no separate admin theme
// system is needed.
export function AdminTopbar({ admin }: Props) {
  return (
    <header className="flex items-center justify-between border-b border-(--hairline) bg-(--surface-strong) px-6 py-4">
      <div className="text-sm text-(--text-dim)">
        Signed in as{" "}
        <span className="font-medium text-(--text)">
          {admin.displayName ?? admin.email}
        </span>
      </div>

      <div className="flex items-center gap-3">
        <ThemeModeToggle />
        <form action={adminLogout}>
          <button
            type="submit"
            className="rounded-lg border border-(--hairline) px-3.5 py-1.5 text-sm font-medium text-(--text-dim) transition hover:bg-(--surface-hover)"
          >
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
