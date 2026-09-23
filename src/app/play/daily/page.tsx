import { redirect } from "next/navigation";

/// The daily challenge used to live at /sargam. It's now at /sargam/daily,
/// gated behind a "coming soon" screen while /sargam ships as the unlimited
/// run instead.
///
/// This route stays as a redirect rather than a 404 because the share poster
/// has been shipping "…/play/daily" on every shared image, and those links
/// have to keep landing somewhere that still talks about the daily.
///
/// 307 (redirect(), not permanentRedirect()) for the same reason "/" is a 307:
/// a 308 cached by browsers and crawlers is very hard to take back.
export default function Page() {
  redirect("/sargam/daily");
}
