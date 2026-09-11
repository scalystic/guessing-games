import { redirect } from "next/navigation";

/// The daily challenge used to live here, with the unlimited practice run on
/// /sargam. The daily is now the only mode players can reach, so it moved to
/// /sargam — the marketed URL, the one "/" forwards to and the one the share
/// poster prints.
///
/// This route stays as a redirect rather than a 404 because the poster has been
/// shipping "…/play/daily" on every shared image, and those links have to keep
/// landing on the game.
///
/// 307 (redirect(), not permanentRedirect()) for the same reason "/" is a 307:
/// a 308 cached by browsers and crawlers is very hard to take back, and /play
/// is a plausible home for a future mode picker. /sargam carries the canonical,
/// so this does not split the page in two for search either.
export default function Page() {
  redirect("/sargam");
}
