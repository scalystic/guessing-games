/// The one header both game screens use — practice and daily. Kept as a
/// component rather than duplicated markup so the two can't drift apart, and
/// deliberately short: everything below it has to clear the fold on a phone.
/// `children` is the right-hand control cluster (streak pill + menu).
export function GameHeader({
  subtitle,
  accentSubtitle,
  children,
}: {
  subtitle: string;
  /// Marks a distinct mode (the daily challenge) in the palette's own accent
  /// instead of an off-palette colour.
  accentSubtitle?: boolean;
  children: React.ReactNode;
}) {
  return (
    <header className="flex items-center justify-between gap-3 border-b border-(--hairline) pt-2 pb-3 sm:pt-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2.5">
          <span className="h-6 w-1.5 bg-(--signal)" aria-hidden="true" />
          <p className="font-[family-name:var(--font-display)] text-2xl font-semibold leading-none tracking-[0.04em] text-(--text) sm:text-3xl">
            SARGAM
          </p>
        </div>
        <p
          className={`mt-1 truncate pl-4 font-mono text-[9px] uppercase tracking-[0.18em] ${
            accentSubtitle ? "text-(--signal)" : "text-(--text-faint)"
          }`}
        >
          {subtitle}
        </p>
      </div>

      <nav className="flex shrink-0 items-center gap-2" aria-label="Game controls">
        {children}
      </nav>
    </header>
  );
}
