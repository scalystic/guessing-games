---
type: "query"
date: "2026-09-11T10:01:22.367825+00:00"
question: "I also want to take users age when user is logging in. How to do this and also how to get it from google acccount also"
contributor: "graphify"
outcome: "useful"
source_nodes: ["signup()", "route.ts", "postAuthDestination", "SignupSchema"]
---

# Q: I also want to take users age when user is logging in. How to do this and also how to get it from google acccount also

## Answer

Expanded from original query via graph vocab: [auth, google, login, signup, user, profile, session, token]. Recommended: do not ask for mutable age on every login. Store dateOfBirth (or a minimum-data birthYear/age band) on Player, collect it during signup/onboarding, and make postAuthDestination route any USER whose age field is missing to a one-time onboarding form. The existing email signup path is SignupSchema -> signup(); the Google path is OAuth route -> callback -> postAuthDestination, so the shared post-auth gate covers Google and legacy accounts. Basic Google OIDC scope openid email profile does not provide birthday. Exact birthday requires People API scope user.birthday.read, an access_token, and GET people/me?personFields=birthdays; it can be absent or partial, so the form remains mandatory fallback. If only eligibility is needed, prefer profile.agerange.read with personFields=ageRanges or a self-declared age gate. Update the privacy policy and Google consent configuration if extra scope/data is added.

## Outcome

- Signal: useful

## Source Nodes

- signup()
- route.ts
- postAuthDestination
- SignupSchema