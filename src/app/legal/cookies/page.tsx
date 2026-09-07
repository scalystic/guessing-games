import type { Metadata } from "next";
import Link from "next/link";
import { CONTACTS, EFFECTIVE_FROM } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Cookie Policy",
  description:
    "Every cookie and browser-storage key Cluecade sets, what each one does, and how long it lasts. No analytics, no advertising, no third-party trackers.",
  alternates: { canonical: "/legal/cookies" },
};

export default function CookiePolicyPage() {
  return (
    <article className="legal-prose">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-(--text)">
        Cookie Policy
      </h1>
      <p className="mt-3">Effective from {EFFECTIVE_FROM}.</p>

      <p>
        This page lists everything Cluecade stores in your browser. It is a
        complete inventory, not a summary — if something is set on your device,
        it is named below.
      </p>

      <div className="legal-callout">
        <p>
          <strong>
            Cluecade has no analytics, no advertising, and no third-party
            trackers.
          </strong>{" "}
          Every item below is strictly necessary to run the game or to remember
          a setting you chose yourself. Nothing here follows you to other
          websites, and nothing is shared with an ad network.
        </p>
      </div>

      <h2 id="cookies">1. Cookies</h2>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Name</th>
              <th scope="col">Purpose</th>
              <th scope="col">Lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <code>gg_session</code>
              </th>
              <td>
                Your signed-in session, or your guest identity if you have not
                registered. Encrypted and signed; marked{" "}
                <code>HttpOnly</code> so page scripts cannot read it,{" "}
                <code>SameSite=Lax</code>, and <code>Secure</code> in
                production. Without it you cannot stay signed in or keep
                progress across visits.
              </td>
              <td>7 days, extended each time you play</td>
            </tr>
            <tr>
              <th scope="row">
                <code>gg_pid</code>
              </th>
              <td>
                Links your browser to the temporary guest player record that
                holds your progress before you register.
              </td>
              <td>Until it expires or you clear your cookies</td>
            </tr>
            <tr>
              <th scope="row">
                <code>oauth_state</code>
              </th>
              <td>
                A one-time random value used to verify that a Google Sign-In
                response really belongs to the sign-in you started. It is a
                security measure against cross-site request forgery.
              </td>
              <td>Minutes — deleted as soon as sign-in completes</td>
            </tr>
            <tr>
              <th scope="row">
                <code>gg_admin_session</code>
              </th>
              <td>
                Set only for administrators signing in to the internal console.
                It is never set for players.
              </td>
              <td>Duration of the admin session</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="local-storage">2. Local storage</h2>

      <p>
        These are stored by your browser and never transmitted to us
        automatically the way cookies are. They exist so a refresh does not cost
        you your game or your settings.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Purpose</th>
              <th scope="col">Lifetime</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                <code>sargam.run.v1</code>
              </th>
              <td>
                The token for the game you have in progress, so reloading the
                page resumes the same run instead of abandoning it. It works
                for that one run and nothing else — it cannot read your
                profile, change your password, or start another game.
              </td>
              <td>Until the run ends or expires (3 hours by default)</td>
            </tr>
            <tr>
              <th scope="row">
                <code>sargam.playerName</code>
              </th>
              <td>
                The name you last used in a multiplayer room, so you do not
                retype it every time.
              </td>
              <td>Until you clear it</td>
            </tr>
            <tr>
              <th scope="row">
                <code>cluecade-theme-mode</code>
              </th>
              <td>
                Whether you chose light or dark. Applied before the first paint
                so the page does not flash the wrong theme.
              </td>
              <td>Until you clear it</td>
            </tr>
            <tr>
              <th scope="row">
                <code>cluecade-theme-color</code>
              </th>
              <td>The accent colour you picked.</td>
              <td>Until you clear it</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="consent">3. Why there is no consent banner</h2>

      <p>
        Consent is required for cookies that are not necessary to provide a
        service the user has asked for — analytics, advertising, and
        cross-site profiling. Cluecade sets none of those. Everything in the
        tables above is either required to run the game you asked to play or
        stores a preference you set yourself, so there is nothing to ask
        permission for, and we would rather not interrupt you with a banner
        that has no real choice in it.
      </p>

      <p>
        <strong>If that changes, this changes.</strong> Before we add any
        analytics, measurement, or advertising technology, we will publish a
        consent mechanism that asks you first and works if you say no, and we
        will update this page.
      </p>

      <h2 id="control">4. How to control cookies</h2>

      <p>
        Every major browser lets you view, block, and delete cookies and local
        storage from its settings, usually under &ldquo;Privacy&rdquo; or
        &ldquo;Site data&rdquo;. You can also use a private or incognito window,
        which discards everything when you close it.
      </p>

      <p>Be aware of what blocking costs you here:</p>

      <ul>
        <li>
          Blocking <code>gg_session</code> means you cannot sign in, and guest
          progress is lost on every page load.
        </li>
        <li>
          Blocking <code>oauth_state</code> makes Google Sign-In fail, because
          we cannot verify the response is genuine.
        </li>
        <li>
          Clearing local storage abandons any game in progress and resets your
          theme.
        </li>
      </ul>

      <p>
        Clearing cookies while playing as a guest is irreversible: the guest
        record stays on our side with no way to link it back to you, and your
        progress cannot be recovered. Registering an account is what makes
        progress portable.
      </p>

      <h2 id="more">5. More information</h2>

      <p>
        How we handle the data behind these cookies — how long records are kept,
        who processes them, and what you can ask us to delete — is set out in
        the <Link href="/legal/privacy">Privacy Policy</Link>. Questions about
        anything on this page go to{" "}
        <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a>.
      </p>
    </article>
  );
}
