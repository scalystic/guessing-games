---
type: "query"
date: "2026-09-11T10:44:09.216518+00:00"
question: "In pick your username don't allow any symbol except dot. Also remove border from the input box when active"
contributor: "graphify"
outcome: "useful"
source_nodes: ["validation.ts", "signup-form.tsx"]
---

# Q: In pick your username don't allow any symbol except dot. Also remove border from the input box when active

## Answer

Expanded from original query via graph vocab: [auth, form, input, validation]. Updated UsernameSchema and both username forms so letters, numbers, and dot are allowed; other symbols are removed during controlled input and rejected by server validation. Username suggestions now use dots. Focused username wrappers use an important transparent border override so the themed inline border is hidden while active without layout shift. Verified via ESLint, TypeScript, focused schema assertions, Next.js compilation, and headless browser interaction.

## Outcome

- Signal: useful

## Source Nodes

- validation.ts
- signup-form.tsx