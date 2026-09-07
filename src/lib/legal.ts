/// Single source of truth for everything that appears on more than one legal
/// page: who operates Cluecade, how to reach them, and when the documents last
/// changed.
///
/// These pages are the only place in the product where wrong copy is a legal
/// problem rather than a cosmetic one — a grievance address that doesn't reach
/// anyone puts the IT Rules 2021 safe harbour at risk. Change a value here and
/// it changes on every page that cites it; don't hardcode any of them inline.

/// The proprietor's legal name, as it appears on their PAN.
export const OPERATOR_LEGAL_NAME = "Arshad Aqeel Khan";

/// Published under Rule 3(2)(a) as the Grievance Officer's address, and used as
/// the address for physical copyright notices under Rule 75.
export const OPERATOR_ADDRESS = "Nara, Nagpur, Maharashtra 440014";

/// Whose courts hear a dispute under the Terms. Kept separate from the address
/// because the two can legitimately diverge if the business ever moves.
export const JURISDICTION_CITY = "Nagpur";

/// Cluecade is operated by an individual (sole proprietor), not a registered
/// company. That is why these documents say "the Operator" rather than naming a
/// private limited entity — if you incorporate, this constant and the Terms'
/// "Who you are contracting with" section are what change.
export const OPERATOR = {
  tradeName: "Cluecade",
  legalName: OPERATOR_LEGAL_NAME,
  form: "sole proprietorship",
  address: OPERATOR_ADDRESS,
  country: "India",
} as const;

/// One mailbox for now. Separate aliases are worth setting up before launch so
/// a copyright notice and a password-reset question don't land in the same
/// thread — the addresses below are all routed to the same inbox today.
const PRIMARY_EMAIL = "scalystic@gmail.com";

export const CONTACTS = {
  general: PRIMARY_EMAIL,
  privacy: PRIMARY_EMAIL,
  grievance: PRIMARY_EMAIL,
  copyright: PRIMARY_EMAIL,
} as const;

/// Published under Rule 3(2)(a) of the IT (Intermediary Guidelines and Digital
/// Media Ethics Code) Rules, 2021. Cluecade hosts user content (multiplayer
/// room chat and player-chosen display names), which makes it an intermediary
/// and makes publishing this block mandatory, not optional.
/// The proprietor acts as their own Grievance Officer — normal for a
/// one-person service, and Rule 3(2)(a) only requires the officer be a person
/// resident in India whose details are published. Referencing the same constant
/// rather than repeating the name keeps the two from drifting apart.
export const GRIEVANCE_OFFICER = {
  name: OPERATOR_LEGAL_NAME,
  designation: "Grievance Officer",
  email: CONTACTS.grievance,
  address: OPERATOR_ADDRESS,
  /// Rule 3(2)(a)(i): acknowledge within 24 hours, dispose of within 15 days.
  ///
  /// These two are statutory and not ours to relax — a published promise of
  /// anything slower does not extend the deadline, it just records that we
  /// intend to miss it. The 24-hour acknowledgement is meant to be satisfied by
  /// an automated reply to the grievance mailbox, not by a person being at a
  /// keyboard; set that auto-responder up before launch.
  acknowledgeWithin: "24 hours",
  resolveWithin: "15 days",
} as const;

/// How long we take to reply to ordinary correspondence — support questions,
/// bug reports, feedback. Unlike the two above, this one is ours to choose,
/// which makes it the honest place to set expectations for a service run by one
/// person.
export const GENERAL_RESPONSE_TARGET = "3 working days";

/// Shown on every legal page. Bump this — and say what changed in the page's
/// own "Changes" section — whenever the substance changes, not when a typo is
/// fixed. Users are told they'll be notified of material changes.
export const LAST_UPDATED = "1 September 2026";
export const EFFECTIVE_FROM = "1 September 2026";

export type LegalPage = {
  href: string;
  label: string;
  /// Used as the nav tooltip and the footer's accessible description.
  blurb: string;
};

/// Order matters: this drives the legal nav and the site footer, and it reads
/// as a reading order — what the service is, then what we do with your data,
/// then the two reporting routes.
export const LEGAL_PAGES: readonly LegalPage[] = [
  {
    href: "/legal/terms",
    label: "Terms of Service",
    blurb: "The agreement between you and Cluecade.",
  },
  {
    href: "/legal/privacy",
    label: "Privacy Policy",
    blurb: "What we collect, why, and your rights under the DPDP Act.",
  },
  {
    href: "/legal/cookies",
    label: "Cookie Policy",
    blurb: "Every cookie and browser-storage key Cluecade sets.",
  },
  {
    href: "/legal/copyright",
    label: "Copyright",
    blurb: "How to report infringing material and have it taken down.",
  },
  {
    href: "/legal/contact",
    label: "Contact & Grievances",
    blurb: "Grievance Officer details and response timelines.",
  },
] as const;
