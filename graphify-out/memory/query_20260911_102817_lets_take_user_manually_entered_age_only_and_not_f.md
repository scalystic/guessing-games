---
type: "query"
date: "2026-09-11T10:28:17.700655+00:00"
question: "Lets take user manually entered age only and not from google Do implement it"
contributor: "graphify"
outcome: "useful"
source_nodes: ["signup()", "login()", "postAuthDestination", "SignupSchema", "route.ts"]
---

# Q: Lets take user manually entered age only and not from google Do implement it

## Answer

Expanded from graph vocab: [auth, google, login, signup, user, player, profile, session, validation, route]. Implemented manual self-declared age collection only. Added nullable Player.declaredAge with a PostgreSQL 18-120 check, required age validation and input during email signup, and a protected one-time /age onboarding page for Google and existing accounts. postAuthDestination now orders missing age before missing username, so every interactive auth path reaches the age gate without expanding Google OAuth scopes. Updated JSON signup/login routes, privacy disclosures, and legal last-updated date. Applied the additive migration to Neon, regenerated Prisma, restarted Next dev, and verified focused ESLint, TypeScript, Prisma validation/status, Next MCP compilation, browser rendering/constraints, and no browser runtime errors. Full repository lint remains blocked by pre-existing unrelated errors in DailyCalendarModal and Leaderboard.

## Outcome

- Signal: useful

## Source Nodes

- signup()
- login()
- postAuthDestination
- SignupSchema
- route.ts