import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { decodeJwt } from "jose";
import { prisma } from "@/lib/db";
import { createSession, getSession } from "@/lib/session";
import { claimGuestProgress } from "@/lib/auth/merge-guest";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    console.error("[auth:google] OAuth error:", error);
    redirect("/login?error=Google authentication failed.");
  }

  if (!code || !state) {
    redirect("/login?error=Invalid OAuth response.");
  }

  const cookieStore = await cookies();
  const oauthState = cookieStore.get("oauth_state")?.value;

  if (state !== oauthState) {
    redirect("/login?error=OAuth state mismatch. Please try again.");
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  
  if (!clientId || !clientSecret) {
    console.error("[auth:google] Missing Google OAuth credentials.");
    redirect("/login?error=Server configuration error.");
  }

  const redirectUri = `${url.origin}/api/auth/google/callback`;

  try {
    // 1. Exchange code for tokens
    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok) {
      console.error("[auth:google] Token exchange failed:", tokenData);
      redirect("/login?error=Failed to authenticate with Google.");
    }

    const { id_token } = tokenData;
    if (!id_token) {
      redirect("/login?error=Google didn't provide an identity token.");
    }

    // 2. Decode the ID token.
    // (Since we obtained this directly over HTTPS from Google, decode is safe without verify).
    const payload = decodeJwt(id_token);
    const googleId = payload.sub;
    const email = payload.email as string | undefined;
    const displayName = payload.name as string | undefined;
    const avatarUrl = payload.picture as string | undefined;

    if (!googleId || !email) {
      redirect("/login?error=Google account is missing required email or ID.");
    }

    // 3. Database logic
    // See if a player exists with this googleId or email
    let player = await prisma.player.findFirst({
      where: {
        OR: [{ googleId }, { email }],
      },
    });

    const session = await getSession();
    const guestPlayerId = session?.kind === "GUEST" ? session.playerId : null;

    if (player) {
      // User exists. Ensure googleId and avatar are updated if missing.
      if (player.googleId !== googleId || (!player.avatarUrl && avatarUrl)) {
        player = await prisma.player.update({
          where: { id: player.id },
          data: {
            googleId,
            avatarUrl: player.avatarUrl || avatarUrl,
            // If they signed up with email but didn't have a displayName, set it
            displayName: player.displayName || displayName,
          },
        });
      }

      // Signing in to an existing account still carries the guest's progress
      // across: runs, puzzle history, balances and board placements all fold
      // into the account, and the guest row stays as the claim receipt.
      await claimGuestProgress(
        player.id,
        "Guest progress merged into existing account via Google sign-in.",
      );

      await createSession(player.id, "USER");
      redirect("/");
    } else {
      // Fresh user or Guest merge
      if (guestPlayerId) {
        // Guest → User merge
        const guest = await prisma.player.findUnique({
          where: { id: guestPlayerId },
          select: { xp: true, coins: true },
        });

        await prisma.$transaction(async (tx) => {
          await tx.player.update({
            where: { id: guestPlayerId },
            data: {
              kind: "USER",
              displayName,
              email,
              googleId,
              avatarUrl,
              authUserId: guestPlayerId, // Maintain consistency with self-managed
            },
          });

          const runCount = await tx.run.count({
            where: { playerId: guestPlayerId },
          });

          await tx.guestClaim.create({
            data: {
              guestPlayerId,
              userPlayerId: guestPlayerId,
              xpMerged: guest?.xp ?? 0,
              coinsMerged: guest?.coins ?? 0,
              runsMerged: runCount,
            },
          });

          await tx.ledgerEntry.create({
            data: {
              playerId: guestPlayerId,
              kind: "GUEST_MERGE",
              xpDelta: 0,
              coinDelta: 0,
              reason: "Guest account merged into user account via Google OAuth.",
            },
          });
        });

        await createSession(guestPlayerId, "USER");
        redirect("/");
      } else {
        // Fresh signup (no guest session)
        const newPlayer = await prisma.player.create({
          data: {
            kind: "USER",
            displayName,
            email,
            googleId,
            avatarUrl,
          },
          select: { id: true },
        });

        await prisma.player.update({
          where: { id: newPlayer.id },
          data: { authUserId: newPlayer.id },
        });

        await createSession(newPlayer.id, "USER");
        redirect("/");
      }
    }
  } catch (error) {
    if (error instanceof Error && error.message === "NEXT_REDIRECT") {
      throw error; // Let Next.js handle redirect throws
    }
    console.error("[auth:google] Callback error:", error);
    redirect("/login?error=An unexpected error occurred during authentication.");
  }
}
