import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACTS,
  EFFECTIVE_FROM,
  GRIEVANCE_OFFICER,
  OPERATOR,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Copyright Policy",
  description:
    "How to report infringing material on Cluecade under Section 52(1)(c) of the Copyright Act, 1957 and Rule 75 of the Copyright Rules, 2013, and how we respond.",
  alternates: { canonical: "/legal/copyright" },
};

export default function CopyrightPage() {
  return (
    <article className="legal-prose">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-(--text)">
        Copyright Policy
      </h1>
      <p className="mt-3">Effective from {EFFECTIVE_FROM}.</p>

      <p>
        Cluecade respects the rights of composers, lyricists, performers,
        publishers, and labels. This page explains how to tell us that material
        on Cluecade infringes your copyright, what we need from you, and what we
        will do about it.
      </p>

      <p>
        We act on notices under Section 52(1)(c) of the Copyright Act, 1957 read
        with Rule 75 of the Copyright Rules, 2013 — India&rsquo;s
        notice-and-takedown procedure. We also accept notices in the form used
        under the United States Digital Millennium Copyright Act from rights
        holders more familiar with that format; a notice containing the
        particulars listed below is valid either way.
      </p>

      <h2 id="two-kinds">1. Two kinds of material</h2>

      <p>It helps to be clear about which one you are reporting.</p>

      <ul>
        <li>
          <strong>Material we publish.</strong> The audio excerpts, artwork, and
          song metadata used in the games are selected and published by us. If
          you hold rights in a recording or work we are using and you want it
          removed, tell us and we will take it out of rotation — we do not
          require a court order for this, and we will not argue with you about
          it first.
        </li>
        <li>
          <strong>Material users post.</strong> Chat messages, display names,
          and room names come from players. For that content we are an
          intermediary under Section 79 of the Information Technology Act, 2000
          and act on the process below.
        </li>
      </ul>

      <h2 id="notice">2. How to send a notice</h2>

      <p>
        Email <a href={`mailto:${CONTACTS.copyright}`}>{CONTACTS.copyright}</a>{" "}
        with the subject line <strong>&ldquo;Copyright notice&rdquo;</strong>,
        or write to {OPERATOR.legalName}, {OPERATOR.address}.
      </p>

      <p>
        Rule 75 requires the notice to be in writing and to contain the
        following. A notice missing these particulars may be delayed while we
        come back to you for them:
      </p>

      <ol>
        <li>
          A description of the work in which you claim copyright, with enough
          detail to identify it — for a recording, the title, artist, and any
          ISRC or catalogue number.
        </li>
        <li>
          Details of your ownership or exclusive licence in that work, and, if
          the copyright is registered, the registration particulars.
        </li>
        <li>
          The <strong>exact location on Cluecade</strong> where the material
          appears — the page URL, and for a specific track the title and artist
          as shown in the game; for chat, the room and approximate time.
        </li>
        <li>
          A statement of why the communication of that work to the public
          infringes your copyright.
        </li>
        <li>
          Details of the person to whom the material was communicated, if
          known, and a description of the infringement.
        </li>
        <li>
          A statement that you are the owner or exclusive licensee, or are
          authorised to act on their behalf.
        </li>
        <li>
          A statement that the information in the notice is accurate and that
          you undertake to file an infringement suit and produce the court order
          within 21 days, as Rule 75(3) requires.
        </li>
        <li>
          Your name, postal address, telephone number, and email address, and an
          electronic or physical signature.
        </li>
      </ol>

      <h2 id="response">3. What we do when we receive one</h2>

      <ul>
        <li>
          <strong>Within {GRIEVANCE_OFFICER.acknowledgeWithin}</strong> we
          acknowledge receipt, as Rule 3(2)(a) of the IT Rules, 2021 requires.
        </li>
        <li>
          <strong>For material we publish:</strong> where the notice is
          complete and appears well founded, we take the material out of
          rotation promptly — usually within one working day — and confirm to
          you when it is out.
        </li>
        <li>
          <strong>For user content:</strong> we disable access to the reported
          material for 21 days from receipt of a complete notice, as Rule 75(3)
          provides. If you produce an order from a competent court within those
          21 days, the material stays down. If you do not, we may restore it.
        </li>
        <li>
          <strong>On a court order or government direction</strong> under
          Section 79(3)(b) of the IT Act, we remove or disable the material
          within 36 hours, as Rule 3(1)(d) requires.
        </li>
        <li>
          <strong>Within {GRIEVANCE_OFFICER.resolveWithin}</strong> we dispose
          of the complaint and tell you the outcome.
        </li>
      </ul>

      <p>
        We keep a record of every notice, what we did, and when — both because
        the rules require it and because it is how repeat infringement gets
        noticed.
      </p>

      <h2 id="counter">4. If your content was removed and you disagree</h2>

      <p>
        If we removed something you posted and you believe that was wrong, email{" "}
        <a href={`mailto:${CONTACTS.copyright}`}>{CONTACTS.copyright}</a> with:
        what was removed and where it was; why you believe you have the right to
        post it or why the use is permitted under Section 52 of the Copyright
        Act; your name, address, and contact details; and a statement that the
        information you have given is accurate.
      </p>

      <p>
        We will pass your counter-notice to the complainant and, if no court
        order reaches us within the 21-day window, we may restore the material.
      </p>

      <h2 id="repeat">5. Repeat infringement</h2>

      <p>
        Accounts that repeatedly post infringing material will be suspended or
        terminated, as set out in the{" "}
        <Link href="/legal/terms">Terms of Service</Link>. Ripping, recording,
        or redistributing the audio Cluecade streams is itself a breach of those
        Terms and grounds for termination.
      </p>

      <h2 id="bad-faith">6. Notices sent in bad faith</h2>

      <p>
        Please be sure before you send. A knowingly false claim of infringement
        can expose you to liability, and Section 15 of the Digital Personal Data
        Protection Act, 2023 prohibits filing false or frivolous complaints. If
        you are unsure whether you hold the right you are asserting, take
        advice first.
      </p>

      <h2 id="contact">7. Copyright contact</h2>

      <p>
        Copyright notices, counter-notices, and licensing enquiries all go to{" "}
        <a href={`mailto:${CONTACTS.copyright}`}>{CONTACTS.copyright}</a>. This
        address reaches our Grievance Officer; see{" "}
        <Link href="/legal/contact">Contact &amp; Grievances</Link> for the full
        details and timelines.
      </p>

      <p>
        If you are a rights holder who would rather license a catalogue to us
        than have it removed, we would genuinely like to hear from you at the
        same address.
      </p>
    </article>
  );
}
