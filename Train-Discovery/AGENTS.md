<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Product UI design reference

- Before creating or changing any user interface, read `DESIGN.md` and follow the Waymo iOS visual reference and tokens recorded there. Treat it as the durable design authority for this product; do not substitute an unrelated visual style.
- Keep the interface minimal. Omit subtitles and helper text that merely describe visible content or controls; include copy only when it clarifies purpose, action, or uncertainty.

## Autonomous refinement

- For an autonomous hackathon improvement session, read `REFINEMENT.md` as the operating brief. It records the user's authorization for fitting features and UI/interaction improvements, the current product commitments, and the implementation/verification/reassessment loop. Targeted requests retain their requested scope.

## Specialist subagents

Project subagents live in `.cursor/agents/`. Delegate their jobs instead of doing the work in the parent session.

- `builder` — features, bug fixes, and refinements. Use proactively for product behavior.
- `designer` — UI, interaction, and a restrained steel-and-steam accent on the Waymo base. Use proactively when the interface changes or feels generic.
- `reviewer` — review, unit tests, end-to-end tests, then commit and push. Use after builder or designer work, and before any commit.

A refinement pass runs builder, then designer on the surfaces that changed, then reviewer. Reviewer is the only role that commits or pushes.
