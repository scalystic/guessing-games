import type { Metadata } from "next";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Log in",
  description: "Log in to your Cluecade account.",
  alternates: { canonical: "/login" },
  // A form behind no content. It can't rank for anything the game page doesn't
  // already own, and an indexed login page is a well-known way to have Google
  // show a sign-in screen to someone searching for the game.
  //
  // noindex rather than a robots.txt Disallow, and follow rather than nofollow:
  // the crawler has to be allowed to fetch the page to read this tag, and once
  // here it should still credit the links out of the auth layout.
  robots: { index: false, follow: true },
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";
  return <LoginForm next={next} />;
}
