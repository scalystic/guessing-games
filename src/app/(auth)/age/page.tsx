import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { getSession } from "@/lib/session";
import { postAuthDestination, safeNextPath } from "@/lib/auth/post-auth";
import AgeForm from "./age-form";

export const metadata: Metadata = {
  title: "Confirm your age",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AgePage({ searchParams }: PageProps<"/age">) {
  const params = await searchParams;
  const nextParam = params.next;
  const next = safeNextPath(typeof nextParam === "string" ? nextParam : null);

  const session = await getSession();
  if (!session || session.kind !== "USER") redirect("/login");

  const player = await prisma.player.findUnique({
    where: { id: session.playerId },
    select: { declaredAge: true },
  });

  if (!player) redirect("/login");

  if (player.declaredAge !== null) {
    redirect(await postAuthDestination(session.playerId, next));
  }

  return <AgeForm next={next} />;
}
