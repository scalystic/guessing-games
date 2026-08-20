import { z } from "zod";

// ---------------------------------------------------------------------------
// Signup
// ---------------------------------------------------------------------------

export const SignupSchema = z.object({
  displayName: z
    .string()
    .min(2, "Name must be at least 2 characters.")
    .max(50, "Name must be at most 50 characters.")
    .trim(),
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
