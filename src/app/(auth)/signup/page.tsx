import type { Metadata } from "next";
import SignupForm from "./signup-form";

export const metadata: Metadata = {
  title: "Sign up",
  description: "Create your Cluecade account.",
  alternates: { canonical: "/signup" },
  // Same reasoning as /login — see the note there. Kept consistent with it
  // deliberately: an indexed signup page and a noindexed login page would just
  // put the account wall in front of searchers half the time.
  robots: { index: false, follow: true },
};

export default function SignupPage() {
  return <SignupForm />;
}
