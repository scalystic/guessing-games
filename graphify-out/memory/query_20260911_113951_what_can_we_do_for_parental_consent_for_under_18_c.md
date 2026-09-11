---
type: "query"
date: "2026-09-11T11:39:51.340451+00:00"
question: "What can we do for parental consent for under-18 Cluecade users?"
contributor: "graphify"
outcome: "useful"
source_nodes: ["signup()", "createSession()", "SignupSchema", "guest.ts"]
---

# Q: What can we do for parental consent for under-18 Cluecade users?

## Answer

Expanded from original query via vocab: [auth, form, guest, player, route, session, signup, user, validation]. Recommended two-stage onboarding: adult users continue; under-18 users are blocked before server-backed account activation and routed to verifiable parent consent. Existing signup creates sessions immediately, so enforcement belongs before signup()/createSession(). Short-term alternative is local-only child play with no server identifiers or analytics. Rule 10 permits checking an existing reliably verified adult account or identity/age details or a virtual token from an authorised entity such as a Digital Locker provider.

## Outcome

- Signal: useful

## Source Nodes

- signup()
- createSession()
- SignupSchema
- guest.ts