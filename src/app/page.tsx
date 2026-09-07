import { redirect } from "next/navigation";

/// Sargam is the only game that ships today, so "/" just forwards to it.
///
/// Deliberately a 307 (redirect(), not permanentRedirect()) and deliberately a
/// page rather than a next.config redirect:
///
///   - 307 keeps "/" reusable. Once there's an arcade landing page here, a 308
///     already cached by browsers and crawlers would be very hard to take back.
///   - Keeping page.tsx means "/" stays a real route, so the existing
///     `href="/"` links (auth layout, daily screens, game view) keep passing
///     typed-route checks and keep meaning "home".
///
/// When the landing page arrives, replace this body — nothing else has to move.
export default function Page() {
  redirect("/sargam");
}
