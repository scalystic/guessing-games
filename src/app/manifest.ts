import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/// Serves /manifest.webmanifest.
///
/// Two reasons this is worth having beyond the install prompt: Google treats
/// installability as a signal on mobile results, and the manifest is where
/// Android and Chrome read the name and icon they show when someone adds the
/// game to their home screen. Without it they fall back to the <title> and a
/// screenshot of the favicon.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${SITE.name} — ${SITE.tagline}`,
    // What fits under a home-screen icon (~12 characters before Android
    // truncates it).
    short_name: SITE.name,
    description: SITE.description,
    // "/" 307s to /sargam (see src/app/page.tsx). Starting the installed app
    // one redirect earlier costs a round trip on every launch and would break
    // the moment "/" becomes a real arcade landing page — the installed app
    // should keep opening the game.
    start_url: "/sargam",
    // The scope still includes "/", so /legal, /login and the multiplayer
    // rooms all open inside the installed app rather than kicking out to the
    // browser.
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    // --bg and --surface from the dark theme in globals.css. The manifest is
    // read once at install time and can't follow the light/dark toggle, so it
    // names the dark values — the same choice the OG cards make.
    background_color: "#0d1120",
    theme_color: "#0d1120",
    lang: SITE.lang,
    categories: ["games", "music", "entertainment"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        // Padded so Android's circle/squircle crop doesn't clip the mark —
        // see MASKABLE_SAFE_ZONE in scripts/generate-brand-assets.ts.
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
