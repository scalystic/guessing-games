import { z } from "zod";
import { UsernameSchema } from "@/lib/auth/username";
import {
  MAXIMUM_USER_AGE,
  MINIMUM_USER_AGE,
} from "@/lib/auth/age-policy";

export {
  DEFAULT_USER_AGE,
  MAXIMUM_USER_AGE,
  MINIMUM_USER_AGE,
} from "@/lib/auth/age-policy";

/// Age is accepted from both HTML FormData (a string) and the JSON signup API
/// (normally a number). Empty values stay invalid instead of coercing to zero.
export const AgeSchema = z.preprocess(
  (value) => {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed === "") return undefined;
      return /^-?\d+(?:\.\d+)?$/.test(trimmed) ? Number(trimmed) : Number.NaN;
    }
    return value;
  },
  z
    .number({ error: "Please enter your age." })
    .int("Age must be a whole number.")
    .min(MINIMUM_USER_AGE, `Please enter an age of ${MINIMUM_USER_AGE} or more.`)
    .max(MAXIMUM_USER_AGE, `Please enter an age of ${MAXIMUM_USER_AGE} or less.`),
);

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export const SignupSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(50, "Name must be at most 50 characters.")
    .trim(),
  /// The public, unique one — see src/lib/auth/username.ts for why this is a
  /// separate field from displayName rather than a normalized copy of it.
  /// Uniqueness is enforced by the DB index, not here.
  username: UsernameSchema,
  age: AgeSchema,
  email: z
    .string()
    .email("Please enter a valid email.")
    .trim()
    .toLowerCase(),
  password: z
    .string()
    .min(8, "Password must be at least 8 characters.")
    .regex(/[a-zA-Z]/, "Password must contain at least one letter.")
    .regex(/[0-9]/, "Password must contain at least one number."),
});

export type SignupInput = z.infer<typeof SignupSchema>;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------

export const LoginSchema = z.object({
  email: z
    .string()
    .email("Please enter a valid email.")
    .trim()
    .toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

export type LoginInput = z.infer<typeof LoginSchema>;

// ---------------------------------------------------------------------------
// Action state
// ---------------------------------------------------------------------------

export type AuthFormState = {
  errors?: Record<string, string[]>;
  message?: string;
  success?: boolean;
} | undefined;
