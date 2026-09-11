import { z } from "zod";

/// The public username — Player.handle.
///
/// Two name fields exist and they are not interchangeable:
///
///   - `handle` (this file) is the unique, public one. It is what the
///     leaderboard prints, what identifies one player to another, and it can
///     never collide. Every USER must have one; guests stay null.
///   - `displayName` is free text, may duplicate, and is the human name used
///     for greetings ("Guest session", the menu header).
///
/// The column has been in schema.prisma from the start — `handle String? @unique`,
/// commented "claimed at signup" — but nothing ever wrote it. This is that
/// claim path.

/// Lowercased and trimmed. Uniqueness has to be case-insensitive — `Arshad`
/// and `arshad` must not be two people on one board — and a single unique
/// column can only enforce that if exactly one casing can ever be stored. So
/// the normalized form IS the stored form and the displayed form: what you see
/// on the board is byte-for-byte the row in the database, with no second
/// "canonical" column to drift out of sync.
export function normalizeUsername(input: string): string {
  return input.trim().toLowerCase();
}

/// Keeps the controlled username fields limited to the same character set the
/// server accepts. Server validation still rejects invalid raw input instead
/// of relying on this client-side convenience.
export function sanitizeUsernameInput(input: string): string {
  return normalizeUsername(input).replace(/[^a-z0-9.]/g, "");
}

/// 3–20 characters of lowercase letters, digits and dots, starting with
/// a letter or digit.
///
/// Deliberately an allowlist and deliberately narrower than displayName's
/// (which permits any script plus punctuation): a handle is an identifier, it
/// shows up in URLs and server-built HTML, and the tighter the character set
/// the fewer ways one username can be made to look like another. A dot is the
/// only punctuation allowed, and a handle cannot start with one.
export const UsernameSchema = z
  .string()
  .transform(normalizeUsername)
  .pipe(
    z
      .string()
      .min(3, "Username must be at least 3 characters.")
      .max(20, "Username must be at most 20 characters.")
      .regex(
        /^[a-z0-9][a-z0-9.]*$/,
        "Use lowercase letters, numbers and dots only, starting with a letter or number.",
      ),
  );

/// Names the app itself uses, or that would let someone pass as staff. Checked
/// against the normalized form, so "Admin" and "ADMIN" are both refused.
///
/// "player" is in here for a specific reason: it is the fallback label the
/// leaderboard prints for anyone without a name, so a real account holding it
/// would be indistinguishable from every anonymous guest on the board.
const RESERVED = new Set([
  "admin",
  "administrator",
  "cluecade",
  "sargam",
  "moderator",
  "mod",
  "staff",
  "support",
  "system",
  "root",
  "official",
  "player",
  "guest",
  "you",
  "me",
  "null",
  "undefined",
  "anonymous",
]);

export function isReservedUsername(normalized: string): boolean {
  return RESERVED.has(normalized);
}

/// Full check in one call: shape, then the reserved list. Returns the
/// normalized username to store, or a message to show.
///
/// Uniqueness is NOT checked here — that is the database's job, via the unique
/// index on Player.handle. A "is it taken?" SELECT followed by an INSERT is a
/// race with a window wide enough to hand the same name to two people who
/// submit at once; the callers instead let the insert fail and translate P2002.
export function validateUsername(
  input: unknown,
): { ok: true; username: string } | { ok: false; message: string } {
  const parsed = UsernameSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: parsed.error.issues[0]?.message ?? "Invalid username." };
  }
  if (isReservedUsername(parsed.data)) {
    return { ok: false, message: "That username is reserved. Pick another." };
  }
  return { ok: true, username: parsed.data };
}

/// True when a Prisma error is a unique-constraint violation on Player.handle.
///
/// P2002 is Prisma's unique-violation code. Knowing *which* index blew up is
/// what lets one catch block tell "username taken" apart from "email already
/// registered", both of which a single signup insert can raise.
///
/// Which is harder than it should be, because where the field name lands
/// depends on how the client talks to Postgres. Verified against this project's
/// setup (Prisma 7.9 + @prisma/adapter-pg), a duplicate handle arrives as:
///
///   code: "P2002"
///   meta.target: undefined                              ← not populated
///   meta.driverAdapterError.cause.constraint.fields: ["handle"]
///   meta.driverAdapterError.cause.originalMessage:
///     'duplicate key value violates unique constraint "Player_handle_key"'
///
/// `meta.target` is the shape Prisma documents and the one you get without a
/// driver adapter. Reading only that — as this function first did — made every
/// taken username report "Something went wrong. Please try again.", which is
/// both useless and wrong: the name is fine, it's just spoken for.
///
/// So all the known carriers are gathered and searched, structured fields
/// first and the raw message last. "handle" appears in no other unique index
/// on Player (email, authUserId, googleId), so a substring test cannot
/// misattribute one of those to the username.
function uniqueViolationFields(error: unknown): string[] {
  const e = error as
    | {
        code?: string;
        meta?: {
          target?: unknown;
          driverAdapterError?: {
            cause?: {
              originalMessage?: unknown;
              constraint?: { fields?: unknown; name?: unknown } | string;
            };
          };
        };
      }
    | null
    | undefined;

  if (e?.code !== "P2002") return [];

  const found: string[] = [];

  const target = e.meta?.target;
  if (Array.isArray(target)) found.push(...target.map(String));
  else if (target != null) found.push(String(target));

  const cause = e.meta?.driverAdapterError?.cause;
  const constraint = cause?.constraint;
  if (typeof constraint === "string") {
    found.push(constraint);
  } else if (constraint) {
    if (Array.isArray(constraint.fields)) found.push(...constraint.fields.map(String));
    if (constraint.name != null) found.push(String(constraint.name));
  }
  if (typeof cause?.originalMessage === "string") found.push(cause.originalMessage);

  return found;
}

export function isUsernameTakenError(error: unknown): boolean {
  return uniqueViolationFields(error).some((field) =>
    field.toLowerCase().includes("handle"),
  );
}
