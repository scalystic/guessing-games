import { clipRange, sargamFaq, sargamHowToPlay, type SargamRules } from "@/lib/sargam-content";

/// The "about the game" copy under the Sargam board.
///
/// A server component, passed into the client board as children, so it lands
/// in the initial HTML. The board itself is interactive state that a crawler
/// sees as "Tuning your first signal…"; this is the part of the page that
/// actually says what the page is. The FAQ here is the same list the FAQPage
/// JSON-LD in page.tsx is built from.
export function SargamAboutSection({ rules }: { rules: SargamRules }) {
  const { first, last } = clipRange(rules);
  const steps = sargamHowToPlay(rules);
  const faq = sargamFaq(rules);

  return (
    <section
      aria-labelledby="about-sargam-title"
      className="mt-12 border-t border-(--hairline) pt-8 text-(--text-dim)"
    >
      <p className="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-(--signal)">
        About the game
      </p>
      <h2
        id="about-sargam-title"
        className="mt-2 text-balance font-[family-name:var(--font-display)] text-2xl font-semibold leading-[1.1] tracking-[-0.02em] text-(--text) sm:text-3xl"
      >
        A free song guessing game for Bollywood fans
      </h2>
      <div className="mt-4 space-y-3 text-sm leading-6 sm:text-base sm:leading-7">
        <p>
          Sargam is a quick, free song guessing game you play right in your browser. We play you a
          tiny clip of a mystery song, just {first} of it, and you guess the song. Wrong guesses
          unlock more of the clip, up to {last}, so the faster you recognise the song, the higher
          you score.
        </p>
        <p>
          It is built for anyone who grew up with Hindi film music: the classic melodies of the 70s
          and 90s, the chartbusters of the 2000s, and the songs on every playlist today. Play one
          round on a break or keep going to build a streak.
        </p>
      </div>

      <h2 className="mt-10 font-[family-name:var(--font-display)] text-xl font-semibold text-(--text) sm:text-2xl">
        How to play Sargam
      </h2>
      <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm leading-6 marker:font-mono marker:text-(--signal) sm:text-base sm:leading-7">
        {steps.map((step) => (
          <li key={step} className="pl-1">
            {step}
          </li>
        ))}
      </ol>

      <h2 className="mt-10 font-[family-name:var(--font-display)] text-xl font-semibold text-(--text) sm:text-2xl">
        Guess the song from any era
      </h2>
      <p className="mt-4 text-sm leading-6 sm:text-base sm:leading-7">
        Choose the tape you want to play before a run. <strong className="text-(--text)">Old</strong>{" "}
        covers Bollywood songs from 1960 to 1999, <strong className="text-(--text)">New</strong>{" "}
        covers 2000 to today, and <strong className="text-(--text)">All eras</strong> mixes the
        whole catalog. It makes a good music quiz whether you only know the hits or know every
        soundtrack.
      </p>

      <h2 className="mt-10 font-[family-name:var(--font-display)] text-xl font-semibold text-(--text) sm:text-2xl">
        Frequently asked questions
      </h2>
      <dl className="mt-4 divide-y divide-(--hairline) border-y border-(--hairline)">
        {faq.map((entry) => (
          <div key={entry.question} className="py-4">
            <dt className="text-sm font-semibold text-(--text) sm:text-base">{entry.question}</dt>
            <dd className="mt-1.5 text-sm leading-6 sm:text-base sm:leading-7">{entry.answer}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
