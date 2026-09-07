import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACTS,
  EFFECTIVE_FROM,
  GRIEVANCE_OFFICER,
  JURISDICTION_CITY,
  OPERATOR,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description:
    "The agreement between you and Cluecade: eligibility, accounts, acceptable use, virtual items, and how disputes are handled under Indian law.",
  alternates: { canonical: "/legal/terms" },
};

export default function TermsPage() {
  return (
    <article className="legal-prose">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-(--text)">
        Terms of Service
      </h1>
      <p className="mt-3">Effective from {EFFECTIVE_FROM}.</p>

      <p>
        These Terms are a legally binding agreement between you and the operator
        of Cluecade. They also serve as the terms of use and privacy notice
        required to be published under Rule 3(1)(a) of the Information
        Technology (Intermediary Guidelines and Digital Media Ethics Code)
        Rules, 2021, and constitute an electronic record under the Information
        Technology Act, 2000. No physical or digital signature is required.
      </p>

      <p>
        <strong>
          By playing Cluecade — including as a guest, without creating an
          account — you accept these Terms.
        </strong>{" "}
        If you do not accept them, please do not use the service.
      </p>

      <h2 id="who">1. Who you are contracting with</h2>

      <p>
        Cluecade (&ldquo;Cluecade&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) is
        operated by {OPERATOR.legalName}, an individual carrying on business as
        a {OPERATOR.form} at {OPERATOR.address}, {OPERATOR.country}. Cluecade is
        not a registered company; your agreement is with that individual.
      </p>

      <p>
        You can reach us at{" "}
        <a href={`mailto:${CONTACTS.general}`}>{CONTACTS.general}</a>. For
        complaints, use the Grievance Officer route set out in{" "}
        <Link href="/legal/contact">Contact &amp; Grievances</Link>.
      </p>

      <h2 id="service">2. What Cluecade is</h2>

      <p>
        Cluecade is a browser-based arcade of guessing games. Sargam, the game
        available today, plays a short audio excerpt of a track and asks you to
        name it within a limited number of attempts, revealing more of the
        excerpt with each miss. The service also offers a daily challenge,
        leaderboards, and multiplayer rooms with text chat.
      </p>

      <p>
        Cluecade is provided free of charge. There is no paid tier, and we do
        not currently sell anything. If that changes, we will publish pricing
        and refund terms before taking any payment.
      </p>

      <h2 id="eligibility">3. Eligibility and age</h2>

      <p>
        You must be <strong>18 years of age or older</strong> to create a
        Cluecade account or to use multiplayer chat. If you are under 18, you
        may use Cluecade only with the consent of a parent or legal guardian,
        who must provide that consent to us and who accepts these Terms on your
        behalf.
      </p>

      <p>
        This threshold is set by Section 9 of the Digital Personal Data
        Protection Act, 2023, which requires verifiable parental consent before
        processing the personal data of anyone under 18 in India, and prohibits
        tracking or behavioural monitoring of children. We do not serve
        behavioural advertising to anyone and we do not track users across other
        websites.
      </p>

      <div className="legal-callout">
        <p>
          <strong>If you are a parent or guardian:</strong> if you believe a
          child under 18 has created an account or used chat without your
          consent, email{" "}
          <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a> and we
          will delete the account and its data.
        </p>
      </div>

      <h2 id="accounts">4. Guests and accounts</h2>

      <ul>
        <li>
          <strong>Playing as a guest.</strong> You can play without registering.
          We create a temporary player identity for you, stored in a cookie, so
          your run and progress survive a page refresh. Guest progress is tied
          to that browser — clearing your cookies loses it, and we cannot
          recover it.
        </li>
        <li>
          <strong>Registering.</strong> You can create an account with an email
          address and password, or by signing in with Google. If you register
          after playing as a guest, we merge that guest progress (experience,
          coins, completed runs) into your new account once. That merge is
          final and cannot be reversed.
        </li>
        <li>
          <strong>Your credentials are yours to protect.</strong> Keep your
          password confidential and tell us promptly if you suspect
          unauthorised access. You are responsible for activity under your
          account, except to the extent it results from our own failure.
        </li>
        <li>
          <strong>One account per person.</strong> Do not create multiple
          accounts to farm rewards, evade a suspension, or manipulate a
          leaderboard.
        </li>
        <li>
          <strong>Accurate information.</strong> Give us a real, working email
          address. It is how we reach you about your account.
        </li>
      </ul>

      <h2 id="acceptable-use">5. Acceptable use</h2>

      <p>You agree not to use Cluecade to do any of the following.</p>

      <h3>Content you must not host, display, upload, or share</h3>

      <p>
        This list reflects Rule 3(1)(b) of the IT (Intermediary Guidelines and
        Digital Media Ethics Code) Rules, 2021. In chat, display names, room
        names, or anywhere else on Cluecade, you must not transmit anything
        that:
      </p>

      <ul>
        <li>
          belongs to another person and to which you do not have any right;
        </li>
        <li>
          is obscene, pornographic, paedophilic, invasive of another&rsquo;s
          privacy including bodily privacy, or harmful to children;
        </li>
        <li>
          is defamatory, libellous, racially or ethnically objectionable, or
          promotes enmity, hatred, or violence between groups;
        </li>
        <li>
          infringes any patent, trademark, copyright, or other proprietary
          right;
        </li>
        <li>
          violates any law for the time being in force, or deceives or misleads
          anyone about the origin of a message, or knowingly communicates
          information that is patently false or misleading;
        </li>
        <li>
          impersonates another person, including by choosing a display name
          designed to pass you off as someone else;
        </li>
        <li>
          threatens the unity, integrity, defence, security, or sovereignty of
          India, its friendly relations with foreign states, or public order, or
          causes incitement to any cognisable offence, or prevents investigation
          of any offence, or insults any foreign state;
        </li>
        <li>
          contains a software virus or any other code designed to interrupt,
          destroy, or limit the functionality of any computer resource.
        </li>
      </ul>

      <h3>Things you must not do to the service</h3>

      <ul>
        <li>
          <strong>Do not cheat.</strong> No bots, scripts, automated solvers,
          audio-fingerprinting tools, or third-party software that plays for
          you or identifies tracks on your behalf.
        </li>
        <li>
          <strong>Do not extract the audio.</strong> Audio excerpts are streamed
          to you for the sole purpose of playing the game. Downloading,
          recording, re-hosting, redistributing, or building a dataset from them
          is prohibited.
        </li>
        <li>
          <strong>Do not scrape.</strong> No crawling, bulk-downloading, or
          automated access to our pages or APIs beyond ordinary gameplay, and no
          circumventing rate limits or signed asset URLs.
        </li>
        <li>
          <strong>Do not attack or probe.</strong> No attempts to gain
          unauthorised access to accounts, servers, the admin console, or data
          you are not entitled to; no denial-of-service; no interference with
          other players&rsquo; games.
        </li>
        <li>
          <strong>Do not reverse engineer</strong> the service or attempt to
          derive source code, except to the extent that restriction is
          unenforceable under applicable law.
        </li>
        <li>
          <strong>Do not resell or commercialise</strong> access to Cluecade
          without our written permission.
        </li>
      </ul>

      <h2 id="user-content">6. Your content, and our role</h2>

      <p>
        &ldquo;Your content&rdquo; means anything you submit to Cluecade —
        chat messages in multiplayer rooms, your display name and handle, and
        any feedback you send us.
      </p>

      <p>
        You keep ownership of your content. You grant us a non-exclusive,
        worldwide, royalty-free licence to store, reproduce, and display it for
        the purpose of operating the service — for example, showing your chat
        message to the other players in your room and your name on a
        leaderboard. This licence ends when the content is deleted, except for
        copies retained in backups for the period described in the{" "}
        <Link href="/legal/privacy">Privacy Policy</Link>.
      </p>

      <p>
        You are responsible for your content and confirm you have the right to
        post it.
      </p>

      <p>
        Cluecade is an <strong>intermediary</strong> under Section 2(1)(w) of
        the Information Technology Act, 2000, in respect of user content. We do
        not pre-screen chat and we are not obliged to monitor it. We may, but
        need not, remove or disable access to any content that we reasonably
        believe breaches these Terms — and we will remove content when required
        to under Section 79(3)(b) of that Act on receiving a valid court order
        or government direction. Reporting routes are set out in{" "}
        <Link href="/legal/contact">Contact &amp; Grievances</Link> and{" "}
        <Link href="/legal/copyright">Copyright</Link>.
      </p>

      <h2 id="virtual-items">7. Coins, experience, and levels</h2>

      <p>
        Cluecade awards coins, experience points, and levels as part of
        gameplay. These are a scorekeeping feature, not property. Specifically:
      </p>

      <ul>
        <li>they have no monetary value and cannot be exchanged for money;</li>
        <li>
          they are a limited, personal, revocable, non-transferable permission
          to use a feature of the service — you do not own them;
        </li>
        <li>
          they cannot be sold, gifted, or traded, on Cluecade or anywhere else;
        </li>
        <li>
          we may adjust balances, rebalance rewards, or reset them where needed
          to fix a bug, reverse cheating, or change how the game works;
        </li>
        <li>
          they expire when your account is closed, and we owe you nothing for
          any unspent balance.
        </li>
      </ul>

      <h2 id="our-content">8. Our content and third-party music</h2>

      <p>
        The Cluecade name, logo, interface, code, and game design are ours or
        our licensors&rsquo;. We grant you a personal, non-transferable,
        revocable licence to use them for the purpose of playing the game, and
        nothing more.
      </p>

      <p>
        The musical works and sound recordings featured in the games belong to
        their respective rights holders — composers, lyricists, performers,
        publishers, and labels. Nothing on Cluecade transfers any right in them
        to you. Excerpts are streamed for the purpose of gameplay only. If you
        hold rights in a recording used on Cluecade and want it removed, follow
        the process on the{" "}
        <Link href="/legal/copyright">Copyright</Link> page and we will act on
        it.
      </p>

      <h2 id="availability">9. Availability and changes</h2>

      <p>
        Cluecade is offered on an ongoing but not guaranteed basis. We may
        change, suspend, or discontinue any part of it — including a game, a
        feature, or the whole service — with reasonable notice where
        practicable. We do not promise uninterrupted or error-free operation,
        and we may take the service down for maintenance.
      </p>

      <p>
        We do not guarantee that your account, gameplay history, leaderboard
        standing, or coin balance will be preserved indefinitely.
      </p>

      <h2 id="termination">10. Suspension and closing your account</h2>

      <p>
        You may stop using Cluecade at any time, and you may ask us to delete
        your account by emailing{" "}
        <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a>.
      </p>

      <p>
        We may suspend or terminate your access, with notice where reasonably
        practicable, if you breach these Terms — in particular the acceptable
        use rules — or if we are required to by law. Where a breach is serious
        or ongoing, we may act immediately. If you believe we have acted
        wrongly, the Grievance Officer route is open to you and we will review
        the decision.
      </p>

      <p>
        Sections 6 (the licence you grant, for content already posted), 7, 8,
        11, 12, 13, and 14 survive termination.
      </p>

      <h2 id="disclaimers">11. Disclaimers</h2>

      <p>
        Cluecade is provided <strong>&ldquo;as is&rdquo;</strong> and{" "}
        <strong>&ldquo;as available&rdquo;</strong>. To the maximum extent
        permitted by law, we exclude all implied warranties, including
        merchantability, fitness for a particular purpose, and
        non-infringement.
      </p>

      <p>
        Song metadata — titles, artists, years, album details — is drawn in part
        from third-party catalogues and may contain errors. Cluecade is
        entertainment, not a reference work.
      </p>

      <h2 id="liability">12. Limitation of liability</h2>

      <p>
        To the maximum extent permitted by Indian law, we are not liable for
        indirect, incidental, special, consequential, or punitive losses, or for
        loss of data, goodwill, or gameplay progress, arising from your use of
        Cluecade.
      </p>

      <p>
        Our total aggregate liability to you for all claims connected with the
        service is limited to the greater of (a) the total amount you have paid
        us in the twelve months before the claim — which, while Cluecade is
        free, is nil — and (b) ₹1,000.
      </p>

      <p>
        Nothing in these Terms excludes or limits liability that cannot lawfully
        be excluded or limited, including liability for fraud, for wilful
        misconduct, or for death or personal injury caused by negligence.
      </p>

      <h2 id="indemnity">13. Indemnity</h2>

      <p>
        You agree to indemnify us against claims, damages, and reasonable legal
        costs arising from your breach of these Terms, your content, or your
        unlawful use of the service. We will notify you of any such claim and
        will not settle it without consulting you.
      </p>

      <h2 id="law">14. Governing law and jurisdiction</h2>

      <p>
        These Terms are governed by the laws of India. The courts at{" "}
        {JURISDICTION_CITY}, India, have exclusive jurisdiction over any dispute
        arising out of or in connection with them, and you and we submit to that
        jurisdiction.
      </p>

      <p>
        Before starting proceedings, please raise the matter with our Grievance
        Officer — most issues are resolved there.
      </p>

      <h2 id="grievance">15. Grievance redressal</h2>

      <p>
        Under Rule 3(2) of the IT (Intermediary Guidelines and Digital Media
        Ethics Code) Rules, 2021, we publish the name and contact details of our
        Grievance Officer, who will acknowledge your complaint within{" "}
        {GRIEVANCE_OFFICER.acknowledgeWithin} and dispose of it within{" "}
        {GRIEVANCE_OFFICER.resolveWithin}. Full details, including the
        categories of complaint that carry shorter deadlines, are on the{" "}
        <Link href="/legal/contact">Contact &amp; Grievances</Link> page.
      </p>

      <h2 id="changes">16. Changes to these Terms</h2>

      <p>
        We may update these Terms. When a change materially affects your rights,
        we will give notice in the product or by email to registered users
        before it takes effect, and we will update the &ldquo;last
        updated&rdquo; date at the foot of this page. Continuing to use Cluecade
        after a change takes effect means you accept the revised Terms; if you
        do not, stop using the service and ask us to close your account.
      </p>

      <h2 id="general">17. General</h2>

      <ul>
        <li>
          <strong>Whole agreement.</strong> These Terms, together with the
          Privacy, Cookie, and Copyright policies, are the entire agreement
          between us about Cluecade.
        </li>
        <li>
          <strong>Severability.</strong> If any provision is held
          unenforceable, the rest stays in force.
        </li>
        <li>
          <strong>No waiver.</strong> If we do not enforce a provision, we have
          not waived it.
        </li>
        <li>
          <strong>Assignment.</strong> You may not assign your rights under
          these Terms. We may assign ours if we transfer or incorporate the
          business, on notice to you.
        </li>
        <li>
          <strong>Force majeure.</strong> Neither of us is liable for failures
          caused by events beyond reasonable control.
        </li>
      </ul>
    </article>
  );
}
