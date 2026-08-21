import type { Metadata } from "next";
import AdminLoginForm from "./admin-login-form";

export const metadata: Metadata = {
  title: "Admin Login",
  description: "Sign in to the Guessing Games admin console.",
};

export default function AdminLoginPage() {
  return (
    // min-h-screen, not min-h-full: the card is shorter than most viewports,
    // and min-h-full only resolves against the parent's content height — the
    // background would stop wherever the card ends instead of covering the
    // rest of the screen, leaving the page's own --bg color visible below it.
    <div className="flex min-h-screen flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="w-full max-w-md">
        <div className="mb-10 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight text-black dark:text-zinc-50">
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
            G
          </span>
          Guessing Games · Admin
        </div>

        <div className="rounded-2xl border border-black/[.08] bg-white p-8 shadow-xl shadow-black/[.03] dark:border-white/[.1] dark:bg-zinc-900/80 dark:shadow-none">
          <AdminLoginForm />
        </div>
      </div>
    </div>
  );
}
