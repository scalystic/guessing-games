import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACTS,
  EFFECTIVE_FROM,
  GRIEVANCE_OFFICER,
  OPERATOR,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "What personal data Cluecade collects, why, who it is shared with, how long it is kept, and your rights under India's Digital Personal Data Protection Act, 2023.",
  alternates: { canonical: "/legal/privacy" },
};

export default function PrivacyPage() {
  return (
    <article className="legal-prose">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-(--text)">
        Privacy Policy
      </h1>
      <p className="mt-3">Effective from {EFFECTIVE_FROM}.</p>

      <p>
        This notice explains what personal data Cluecade collects, why we
        collect it, who else sees it, how long we keep it, and what you can ask
        us to do with it. It is the notice required under Section 5 of the
        Digital Personal Data Protection Act, 2023 (&ldquo;DPDP Act&rdquo;) and
        under Rule 4 of the Information Technology (Reasonable Security
        Practices and Procedures and Sensitive Personal Data or Information)
        Rules, 2011.
      </p>

      <p>
        In DPDP Act language: you are the <strong>Data Principal</strong> and we
        are the <strong>Data Fiduciary</strong>.
      </p>

      <h2 id="who">1. Who is responsible for your data</h2>

      <p>
        Cluecade is operated by {OPERATOR.legalName}, an individual carrying on
        business as a {OPERATOR.form} at {OPERATOR.address},{" "}
        {OPERATOR.country}.
      </p>

      <p>
        For any question about this policy or about your data, write to{" "}
        <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a>. We are
        not a Significant Data Fiduciary and are therefore not required to
        appoint a Data Protection Officer; the address above is the contact for
        all data-protection matters.
      </p>

      <h2 id="what">2. What we collect</h2>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Category</th>
              <th scope="col">What it actually is</th>
              <th scope="col">When we get it</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Account data</th>
              <td>
                Email address, a bcrypt hash of your password (never the
                password itself), display name, handle, avatar URL, and — if
                you use Google Sign-In — your Google account identifier.
              </td>
              <td>When you register or sign in.</td>
            </tr>
            <tr>
              <th scope="row">Guest identity</th>
              <td>
                A randomly generated player identifier held in a cookie, plus a
                salted one-way hash of your IP address. We do not store raw IP
                addresses.
              </td>
              <td>On your first visit, before you register.</td>
            </tr>
            <tr>
              <th scope="row">Gameplay data</th>
              <td>
                Your runs, individual guesses, attempts and skips, scores,
                experience points, coins, level, which puzzles you have already
                seen, daily-challenge results, and leaderboard entries.
              </td>
              <td>As you play.</td>
            </tr>
            <tr>
              <th scope="row">Multiplayer data</th>
              <td>
                Room membership, round results, and the text of chat messages
                you send in a room, along with the name shown next to them.
              </td>
              <td>When you join or host a multiplayer room.</td>
            </tr>
            <tr>
              <th scope="row">Technical data</th>
              <td>
                Two-letter country code, timezone, and the time you were last
                active. Our hosting provider and our own server logs record
                request metadata, including IP address, for a short period.
              </td>
              <td>Automatically, as you use the service.</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h3>What we do not collect</h3>

      <ul>
        <li>
          <strong>No payment data.</strong> Cluecade is free and we do not
          process card or bank details.
        </li>
        <li>
          <strong>No precise location.</strong> We derive an approximate country
          only; we never ask for or use device GPS.
        </li>
        <li>
          <strong>No microphone or camera access.</strong> The game plays audio;
          it never records any.
        </li>
        <li>
          <strong>No advertising or cross-site tracking.</strong> There are no
          ad networks, no analytics SDKs, and no third-party trackers on
          Cluecade. See the{" "}
          <Link href="/legal/cookies">Cookie Policy</Link> for the complete
          list of what is set in your browser.
        </li>
        <li>
          <strong>No sensitive personal data</strong> as defined by the 2011
          SPDI Rules — no financial information, health data, biometrics, or
          sexual-orientation data.
        </li>
      </ul>

      <h2 id="why">3. Why we use it, and on what basis</h2>

      <p>
        We process your data on the basis of your <strong>consent</strong>{" "}
        under Section 6 of the DPDP Act, given when you choose to play or
        register, and — for the narrower purposes noted below — on the basis of
        the <strong>legitimate uses</strong> permitted by Section 7.
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Purpose</th>
              <th scope="col">Data used</th>
              <th scope="col">Basis</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Running the game</th>
              <td>Guest identity, gameplay data</td>
              <td>Consent — the purpose you gave the data for</td>
            </tr>
            <tr>
              <th scope="row">Keeping you signed in</th>
              <td>Account data, session cookie</td>
              <td>Consent</td>
            </tr>
            <tr>
              <th scope="row">
                Leaderboards, levels, and daily-challenge standings
              </th>
              <td>Display name, scores, experience</td>
              <td>Consent</td>
            </tr>
            <tr>
              <th scope="row">Not repeating puzzles you have already seen</th>
              <td>Puzzle history</td>
              <td>Consent</td>
            </tr>
            <tr>
              <th scope="row">Preventing abuse, cheating, and rate-limit evasion</th>
              <td>Hashed IP address, gameplay patterns</td>
              <td>Section 7 legitimate use — fair-play and security</td>
            </tr>
            <tr>
              <th scope="row">Moderating chat and handling grievances</th>
              <td>Chat messages, account data</td>
              <td>Compliance with the IT Rules, 2021</td>
            </tr>
            <tr>
              <th scope="row">Scheduling the daily challenge in your day</th>
              <td>Timezone, country code</td>
              <td>Consent</td>
            </tr>
            <tr>
              <th scope="row">Fixing faults and keeping the service secure</th>
              <td>Server logs</td>
              <td>Section 7 legitimate use</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        We do not use your data to build advertising profiles, and we do not
        make automated decisions with legal consequences for you.
      </p>

      <h2 id="google">4. Google Sign-In</h2>

      <p>
        If you sign in with Google, we ask Google for three things —{" "}
        <code>openid</code>, <code>email</code>, and <code>profile</code>. That
        gives us your Google account identifier, your email address, your name,
        and your profile picture URL. Nothing else: not your contacts, not your
        Drive, not your calendar.
      </p>

      <p>
        We never receive your Google password. We use this data only to create
        and sign you into your Cluecade account, and we do not transfer it to
        others except as described in section 5.
      </p>

      <p>
        You can revoke Cluecade&rsquo;s access at any time from your Google
        account&rsquo;s security settings. Doing so stops you signing in that
        way but does not by itself delete your Cluecade account — email us if
        you want that too.
      </p>

      <h2 id="sharing">5. Who else sees your data</h2>

      <p>
        <strong>We do not sell your personal data,</strong> and we do not share
        it with advertisers or data brokers. We use a small number of service
        providers who process data on our instructions:
      </p>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Provider</th>
              <th scope="col">What they do</th>
              <th scope="col">What they see</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Hosting and delivery</th>
              <td>Serves the site and our APIs</td>
              <td>Request metadata including IP address; server logs</td>
            </tr>
            <tr>
              <th scope="row">Managed database</th>
              <td>Stores accounts and gameplay records</td>
              <td>Everything in section 2 that we store</td>
            </tr>
            <tr>
              <th scope="row">Object storage / CDN</th>
              <td>Stores and delivers audio and artwork</td>
              <td>
                Request metadata for signed asset URLs; no account data
              </td>
            </tr>
            <tr>
              <th scope="row">Google</th>
              <td>Optional sign-in</td>
              <td>
                Only what is needed to authenticate you, at the moment you
                choose to sign in
              </td>
            </tr>
            <tr>
              <th scope="row">Realtime server</th>
              <td>Carries multiplayer rounds and chat</td>
              <td>Room membership, chat messages, display names</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        We also query third-party music catalogues to build our puzzle library.
        That traffic goes out from our servers and carries{" "}
        <strong>no player data</strong> — those services do not learn who is
        playing or what anyone guessed.
      </p>

      <p>We will disclose data beyond this where we are legally obliged to:</p>

      <ul>
        <li>
          in response to a lawful order from a court or a competent authority,
          including a request under Rule 3(1)(j) of the IT Rules, 2021, which we
          must answer within 72 hours;
        </li>
        <li>
          to establish, exercise, or defend a legal claim, or to investigate a
          serious breach of our{" "}
          <Link href="/legal/terms">Terms of Service</Link>;
        </li>
        <li>
          to a successor, if the service is transferred or incorporated — on
          notice to you, and subject to this policy.
        </li>
      </ul>

      <h2 id="public">6. What is visible to other players</h2>

      <p>
        Some information is public by design. Your <strong>display name</strong>{" "}
        or handle, your <strong>level</strong>, and your{" "}
        <strong>scores</strong> appear on leaderboards and in multiplayer rooms,
        visible to other players. Your <strong>chat messages</strong> are
        visible to everyone in that room.
      </p>

      <p>
        Your email address is never shown to other players. If you would rather
        not be identifiable, choose a display name that is not your real name —
        you can change it at any time in your profile.
      </p>

      <h2 id="transfers">7. Where your data goes</h2>

      <p>
        Our providers may store and process data on servers outside India.
        Section 16 of the DPDP Act permits such transfers except to countries
        the Central Government restricts by notification; we will stop
        transferring to any such country if it is notified. Wherever the data
        sits, this policy and our contracts with providers continue to apply to
        it.
      </p>

      <h2 id="retention">8. How long we keep it</h2>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Data</th>
              <th scope="col">Kept for</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">Account data</th>
              <td>
                Until you ask us to delete your account, then erased within 30
                days — apart from backup copies, which age out within a further
                90 days
              </td>
            </tr>
            <tr>
              <th scope="row">Gameplay and leaderboard data</th>
              <td>
                Deleted or irreversibly de-linked from you when your account is
                deleted
              </td>
            </tr>
            <tr>
              <th scope="row">Guest player records</th>
              <td>
                Purged after a period of inactivity if never claimed by an
                account
              </td>
            </tr>
            <tr>
              <th scope="row">Chat messages</th>
              <td>
                Retained while the room exists and for a short period after, so
                grievances can be investigated
              </td>
            </tr>
            <tr>
              <th scope="row">Hashed IP addresses</th>
              <td>Retained for abuse prevention, then purged</td>
            </tr>
            <tr>
              <th scope="row">Server logs</th>
              <td>Short-lived — typically days, per our hosting provider</td>
            </tr>
          </tbody>
        </table>
      </div>

      <p>
        Section 8(7) of the DPDP Act requires us to erase personal data once you
        withdraw consent or the purpose is no longer being served, unless we are
        required by law to keep it. That is what the periods above implement.
      </p>

      <h2 id="security">9. How we protect it</h2>

      <ul>
        <li>
          Passwords are stored as <strong>bcrypt hashes</strong>, never in a
          form we or an attacker could read back.
        </li>
        <li>
          Session cookies are <strong>encrypted and signed</strong>, marked{" "}
          <code>HttpOnly</code> so page scripts cannot read them, and marked{" "}
          <code>Secure</code> in production.
        </li>
        <li>
          IP addresses are stored only as <strong>salted SHA-256 hashes</strong>
          , which cannot be reversed to the original address without the secret
          salt.
        </li>
        <li>
          Audio and artwork are served through{" "}
          <strong>short-lived signed URLs</strong>, not public buckets.
        </li>
        <li>All traffic is encrypted in transit over HTTPS.</li>
        <li>
          Administrative access is separately authenticated and limited to
          people who need it.
        </li>
      </ul>

      <p>
        No system is perfectly secure. If a personal data breach occurs, we will
        notify the Data Protection Board of India and every affected user, as
        Section 8(6) of the DPDP Act requires, and we will report incidents to
        CERT-In within the timelines set by its directions.
      </p>

      <h2 id="rights">10. Your rights</h2>

      <p>Under Chapter III of the DPDP Act, you may:</p>

      <ul>
        <li>
          <strong>Access</strong> a summary of the personal data we hold about
          you and how we process it (Section 11);
        </li>
        <li>
          <strong>Correct or complete</strong> inaccurate data, and{" "}
          <strong>erase</strong> data we no longer need (Section 12);
        </li>
        <li>
          <strong>Withdraw your consent</strong> at any time, as easily as you
          gave it (Section 6(4)) — which for most processing means asking us to
          delete your account;
        </li>
        <li>
          <strong>Nominate</strong> another person to exercise these rights on
          your behalf if you die or become incapacitated (Section 14);
        </li>
        <li>
          <strong>Complain</strong> to us, and then to the Data Protection Board
          of India if we do not resolve it (Section 13).
        </li>
      </ul>

      <p>
        To exercise any of these, email{" "}
        <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a> from the
        address on your account. We will respond within{" "}
        {GRIEVANCE_OFFICER.resolveWithin} and will not charge you. We may need
        to verify that the request is really from you before acting on it.
      </p>

      <p>
        The DPDP Act also places duties on you: do not impersonate someone else
        when giving us data, do not suppress material information, and do not
        file a false or frivolous complaint (Section 15).
      </p>

      <h2 id="children">11. Children</h2>

      <p>
        Cluecade is intended for users aged 18 and over. We do not knowingly
        collect the personal data of a child under 18 without verifiable
        parental consent, and we never track, profile, or serve behavioural
        advertising to children — both prohibited by Section 9 of the DPDP Act.
      </p>

      <p>
        If you are a parent or guardian and believe your child has given us
        data, email{" "}
        <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a> and we
        will delete the account and its data.
      </p>

      <h2 id="grievance">12. Complaints</h2>

      <p>
        If you are unhappy with how we have handled your data, contact our
        Grievance Officer — details, and the deadlines we hold ourselves to, are
        on the <Link href="/legal/contact">Contact &amp; Grievances</Link>{" "}
        page. If we do not resolve your complaint, you may escalate it to the
        Data Protection Board of India.
      </p>

      <h2 id="changes">13. Changes to this policy</h2>

      <p>
        If we change what we collect or why, we will update this page, change
        the &ldquo;last updated&rdquo; date, and — where the change materially
        affects you — tell registered users by email or in the product before it
        takes effect. Where a change requires fresh consent, we will ask for it
        rather than assume it.
      </p>
    </article>
  );
}
