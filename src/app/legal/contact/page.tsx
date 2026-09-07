import type { Metadata } from "next";
import Link from "next/link";
import {
  CONTACTS,
  EFFECTIVE_FROM,
  GENERAL_RESPONSE_TARGET,
  GRIEVANCE_OFFICER,
  OPERATOR,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact & Grievances",
  description:
    "Cluecade's Grievance Officer details, published under Rule 3(2) of the IT Rules 2021, with the deadlines we hold ourselves to.",
  alternates: { canonical: "/legal/contact" },
};

export default function ContactPage() {
  return (
    <article className="legal-prose">
      <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight text-(--text)">
        Contact &amp; Grievances
      </h1>
      <p className="mt-3">Effective from {EFFECTIVE_FROM}.</p>

      <p>
        Cluecade hosts content that players create — multiplayer chat, display
        names, room names — which makes it an intermediary under the Information
        Technology Act, 2000. Rule 3(2) of the IT (Intermediary Guidelines and
        Digital Media Ethics Code) Rules, 2021 requires us to publish the name
        and contact details of a Grievance Officer, and the mechanism by which
        you can complain. That is what this page is.
      </p>

      <h2 id="officer">Grievance Officer</h2>

      <div className="table-scroll">
        <table>
          <tbody>
            <tr>
              <th scope="row">Name</th>
              <td>{GRIEVANCE_OFFICER.name}</td>
            </tr>
            <tr>
              <th scope="row">Designation</th>
              <td>{GRIEVANCE_OFFICER.designation}</td>
            </tr>
            <tr>
              <th scope="row">Email</th>
              <td>
                <a href={`mailto:${GRIEVANCE_OFFICER.email}`}>
                  {GRIEVANCE_OFFICER.email}
                </a>
              </td>
            </tr>
            <tr>
              <th scope="row">Postal address</th>
              <td>
                {GRIEVANCE_OFFICER.address}, {OPERATOR.country}
              </td>
            </tr>
            <tr>
              <th scope="row">On behalf of</th>
              <td>
                {OPERATOR.legalName}, operating {OPERATOR.tradeName} as a{" "}
                {OPERATOR.form}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2 id="timelines">How quickly we respond</h2>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">What you report</th>
              <th scope="col">Our deadline</th>
              <th scope="col">Under</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                General enquiries — support, bugs, feedback
              </th>
              <td>{GENERAL_RESPONSE_TARGET}</td>
              <td>Our own target</td>
            </tr>
            <tr>
              <th scope="row">
                Any complaint — acknowledgement (sent automatically)
              </th>
              <td>{GRIEVANCE_OFFICER.acknowledgeWithin}</td>
              <td>Rule 3(2)(a)(i)</td>
            </tr>
            <tr>
              <th scope="row">Any complaint — resolution</th>
              <td>{GRIEVANCE_OFFICER.resolveWithin}</td>
              <td>Rule 3(2)(a)(i)</td>
            </tr>
            <tr>
              <th scope="row">
                Content exposing a person&rsquo;s private area, showing nudity
                or a sexual act, or impersonating them including by morphed
                imagery
              </th>
              <td>Removed within 24 hours of a valid complaint</td>
              <td>Rule 3(2)(b)</td>
            </tr>
            <tr>
              <th scope="row">
                Material subject to a court order or government direction
              </th>
              <td>Removed or disabled within 36 hours</td>
              <td>Rule 3(1)(d)</td>
            </tr>
            <tr>
              <th scope="row">
                Lawful information request from an authorised agency
              </th>
              <td>Answered within 72 hours</td>
              <td>Rule 3(1)(j)</td>
            </tr>
            <tr>
              <th scope="row">Copyright notice</th>
              <td>
                Acknowledged in 24 hours; material disabled for 21 days pending
                a court order
              </td>
              <td>Rule 75, Copyright Rules 2013</td>
            </tr>
            <tr>
              <th scope="row">
                Data-protection request — access, correction, erasure,
                withdrawal of consent
              </th>
              <td>{GRIEVANCE_OFFICER.resolveWithin}</td>
              <td>DPDP Act, 2023</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="legal-callout">
        <p>
          <strong>Which of these we chose, and which we did not.</strong>{" "}
          Cluecade is run by one person, so ordinary correspondence gets a
          considered reply within {GENERAL_RESPONSE_TARGET} rather than by
          return of post. That is the one line in the table we set ourselves.
          Every other deadline above is fixed by law and is not ours to extend —
          the 24-hour acknowledgement of a complaint is issued automatically
          when your email arrives, and a person follows up within the
          resolution window.
        </p>
      </div>

      <h2 id="how">How to complain</h2>

      <p>
        Email <a href={`mailto:${CONTACTS.grievance}`}>{CONTACTS.grievance}</a>{" "}
        with as much of the following as you can. Complete reports get resolved
        faster because we do not have to come back to you:
      </p>

      <ul>
        <li>your name and a contact address;</li>
        <li>
          what you are reporting and where it is — the page URL, and for chat,
          the room code and roughly when it happened;
        </li>
        <li>why you believe it breaches our rules or the law;</li>
        <li>
          for a data-protection request, the email address on your Cluecade
          account, so we can verify the request is yours;
        </li>
        <li>
          for a copyright notice, the particulars listed on the{" "}
          <Link href="/legal/copyright">Copyright</Link> page.
        </li>
      </ul>

      <p>
        Please send complaints from a working email address you check — we
        cannot resolve a grievance we cannot reply to.
      </p>

      <h2 id="escalation">If we do not resolve it</h2>

      <ul>
        <li>
          <strong>Data-protection complaints:</strong> you may escalate to the{" "}
          <strong>Data Protection Board of India</strong> under Section 13 of
          the DPDP Act, 2023.
        </li>
        <li>
          <strong>Content complaints:</strong> you may approach the Grievance
          Appellate Committee constituted under Rule 3A of the IT Rules, 2021
          within 30 days of our decision.
        </li>
      </ul>

      <p>
        We would rather you did not have to. If you think we have got something
        wrong, say so plainly and we will look at it again.
      </p>

      <h2 id="other">Everything else</h2>

      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th scope="col">Reason for writing</th>
              <th scope="col">Address</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <th scope="row">
                Privacy, data access, deletion, or a child&rsquo;s account
              </th>
              <td>
                <a href={`mailto:${CONTACTS.privacy}`}>{CONTACTS.privacy}</a>
              </td>
            </tr>
            <tr>
              <th scope="row">Copyright notices and licensing</th>
              <td>
                <a href={`mailto:${CONTACTS.copyright}`}>
                  {CONTACTS.copyright}
                </a>
              </td>
            </tr>
            <tr>
              <th scope="row">
                Reporting a player, a chat message, or a bug
              </th>
              <td>
                <a href={`mailto:${CONTACTS.general}`}>{CONTACTS.general}</a>
              </td>
            </tr>
            <tr>
              <th scope="row">Security vulnerabilities</th>
              <td>
                <a href={`mailto:${CONTACTS.general}`}>{CONTACTS.general}</a> —
                please report privately and give us a chance to fix it before
                disclosing
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </article>
  );
}
