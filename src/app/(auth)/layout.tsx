import Link from "next/link";

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-full flex-1 flex-col items-center justify-center bg-zinc-50 px-4 py-12 font-sans dark:bg-black">
      <div className="w-full max-w-md">
        <Link
          href="/"
          className="mb-10 flex items-center justify-center gap-2 text-lg font-semibold tracking-tight text-black dark:text-zinc-50"
        >
          <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
            G
          </span>
          Guessing Games
        </Link>

        <div className="rounded-2xl border border-black/[.08] bg-white p-8 shadow-xl shadow-black/[.03] dark:border-white/[.1] dark:bg-zinc-900/80 dark:shadow-none">
          {children}
        </div>
      </div>
    </div>
  );
}
