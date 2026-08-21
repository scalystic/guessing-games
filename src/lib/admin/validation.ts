import { z } from "zod";

export const AdminLoginSchema = z.object({
  email: z.string().email("Please enter a valid email.").trim().toLowerCase(),
  password: z.string().min(1, "Password is required."),
});

export type AdminLoginInput = z.infer<typeof AdminLoginSchema>;

export type AdminFormState =
  | {
      errors?: Record<string, string[]>;
      message?: string;
      success?: boolean;
    }
  | undefined;
