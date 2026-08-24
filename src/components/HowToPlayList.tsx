"use client";

export function HowToPlayList({ maxAttempts }: { maxAttempts: number }) {
  const steps = [
    {
      content: (
        <>
          Play the mystery clip. The first signal is only <strong className="font-semibold text-(--text)">0.2 seconds</strong>.
        </>
      ),
      color: "var(--signal)",
      bgColor: "color-mix(in srgb, var(--signal) 12%, transparent)",
      borderColor: "color-mix(in srgb, var(--signal) 30%, transparent)",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="6 3 20 12 6 21 6 3" />
        </svg>
      ),
    },
    {
      content: (
        <>
          Search by <strong className="font-semibold text-(--text)">song title or artist</strong>, then choose a catalog match.
        </>
      ),
      color: "#a855f7",
      bgColor: "rgba(168, 85, 247, 0.12)",
      borderColor: "rgba(168, 85, 247, 0.3)",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      ),
    },
    {
      content: (
        <>
          A wrong guess or skip unlocks a longer clip. You have <strong className="font-semibold text-(--text)">{maxAttempts} attempts</strong>.
        </>
      ),
      color: "var(--miss)",
      bgColor: "color-mix(in srgb, var(--miss) 12%, transparent)",
      borderColor: "color-mix(in srgb, var(--miss) 30%, transparent)",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
          <path d="M7 11V7a5 5 0 0 1 9.9-1" />
        </svg>
      ),
    },
    {
      content: (
        <>
          After two misses, a <strong className="font-semibold text-(--text)">decade and genre clue</strong> appears when available.
        </>
      ),
      color: "#eab308",
      bgColor: "rgba(234, 179, 8, 0.12)",
      borderColor: "rgba(234, 179, 8, 0.3)",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5" />
          <line x1="9" y1="18" x2="15" y2="18" />
          <line x1="10" y1="22" x2="14" y2="22" />
        </svg>
      ),
    },
    {
      content: (
        <>
          Recognise the song from less audio to earn a <strong className="font-semibold text-(--text)">higher score</strong>.
        </>
      ),
      color: "var(--success)",
      bgColor: "color-mix(in srgb, var(--success) 12%, transparent)",
      borderColor: "color-mix(in srgb, var(--success) 30%, transparent)",
      icon: (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6" />
          <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18" />
          <path d="M4 22h16" />
          <path d="M10 14.66V17c0 .55-.45 1-1 1H4v2h12v-2h-5v-2.34" />
          <path d="M12 2a7.7 7.7 0 0 1 7.54 9H4.46A7.7 7.7 0 0 1 12 2z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="relative pl-1">
      {/* Connecting timeline track */}
      <div className="absolute left-[16px] top-3 bottom-3 w-px bg-(--hairline) opacity-50" />

      <div className="space-y-5">
        {steps.map((step, index) => (
          <div key={index} className="relative grid grid-cols-[32px_1fr] gap-4 items-start">
            {/* Step Icon Node */}
            <div
              className="relative z-10 flex h-8 w-8 items-center justify-center rounded-full border border-[var(--step-border)] bg-(--surface-strong) text-[var(--step-color)] shadow-xs transition-all duration-200 hover:border-[var(--step-color)] hover:bg-[var(--step-bg)]"
              style={{
                "--step-color": step.color,
                "--step-border": step.borderColor,
                "--step-bg": step.bgColor,
              } as React.CSSProperties}
            >
              {step.icon}
            </div>

            {/* Step Text Block */}
            <div className="flex flex-col pt-0.5">
              <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-(--text-faint) mb-1">
                Step {String(index + 1).padStart(2, "0")}
              </span>
              <p className="text-sm leading-5 text-(--text-dim)">
                {step.content}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
