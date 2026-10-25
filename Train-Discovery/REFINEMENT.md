# Autonomous hackathon refinement brief

Use this document as the working prompt when asked to run an autonomous improvement session on Train Discovery.

## Goal

Make Train Discovery a compelling, useful, memorable hackathon contender: a location-aware companion that turns an ordinary LIRR ride into a narrated discovery of the world outside the window. Optimize for the chance of winning through a convincing working product and a strong demonstration. Treat winning as an aspiration, not an outcome you can guarantee or declare achieved through self-evaluation.

Find the highest-value work yourself and deliver it through the specialist subagents below. Deliver working improvements rather than stopping at an audit, a feature list, or a proposal.

## Authorization

The user authorizes you to introduce features, change UI and interaction flows, remove weak or redundant elements, improve architecture and content pipelines, and fix problems across this project when doing so advances this goal. New features must fit the product's theme and earn their complexity. You can propose a direction in a brief progress update and proceed with implementation without waiting for routine approval.

Make reasonable reversible decisions autonomously. Ask only when genuinely necessary information is unavailable, an action needs authorization beyond the session's existing permissions, or a change would override an explicit user requirement. Continue useful independent work while a question is pending. Existing system, workspace, security, spending, and external-action restrictions still apply.

Work inside `Train-Discovery`. Preserve other projects in the enclosing repository and existing unrelated work. Inspect the worktree before editing.

The reviewer subagent is authorized to commit and push completed refinement work to the configured repository after the relevant tests and required checks pass, without asking for routine confirmation. Include the applicable test results in the commit or handoff. Stage only the intended project changes, keep secrets out of commits, and use ordinary pushes to the working branch and its upstream. If no upstream exists, you may publish the working branch to the configured remote. Preserve collaborators' work when synchronizing with the remote; force pushes and destructive history rewrites require separate explicit authorization. Follow the session's actual authorization for deployments, paid services, and other external or destructive actions. Builder and designer do not commit or push.

## Establish the truth first

Read these before choosing work:

1. `AGENTS.md` for project instructions and the installed Next.js documentation requirement.
2. `README.md` for operation, integrations, and current behavior.
3. The latest decisions in `pass.md` for accepted scope, previous findings, and unresolved work.
4. `PRODUCT.md` for product intent and `DESIGN.md` for the Waymo visual authority.
5. The actual code, relevant tests, and running app for the experience users currently get.

Read applicable skills and follow their workflows. Check current official documentation when changing integrations or unfamiliar APIs. If an event rubric, deadline, submission checklist, or sponsor requirements are available, use them to guide priorities. Otherwise label your judging assumptions explicitly.

Documentation can be stale. Resolve conflicts using the latest user instructions, then the latest explicit product decisions; inspect the implementation to establish what is actually built. Keep historical notes distinct from current facts. Check whether credentials are configured without exposing their values.

## Product commitments

- Keep a coherent phone experience: choose an LIRR branch, start a ride, encounter stations, point toward a POI, hear something worth knowing, and save the places worth keeping.
- Support all LIRR branches. Jamaica replay and the developer controls must make movement and pointing easy to demonstrate, with simulation clearly labeled.
- Follow the Waymo theme recorded in `DESIGN.md`. Improve hierarchy, layout, controls, feedback, and accessibility within that visual language. A restrained steel-and-steam accent may sit on that base once `DESIGN.md` records it. Keep visible copy purposeful and concise.
- Use phone orientation for pointing. Geographic proximity and heading do not prove visibility or camera recognition.
- Station narration says **“Station approaching: [station name].”** It is geographic discovery, not a prediction of scheduled service.
- A pointed POI acknowledges the gesture, such as **“You just pointed at [name],”** and includes a sourced fact or story. A name-only POI clip is insufficient. Automatic nearby narration and explicit replay must use truthful introductions for their context.
- Make audio warm, curious, quietly whimsical, and well paced. Let supported details create the wonder. Preserve source checks, attribution, distinct verification states, cancellation, deduplication, and a single playback queue.
- Missing evidence needs a recoverable state. Do not invent facts, fabricate source support, label generated images as archival photographs, or present mocked provider results as live evidence.
- Preserve the Next.js PWA, Supabase, and existing provider integrations unless there is a concrete reason to change them. Keep secrets server-side, respect configured quotas, and avoid unnecessary provider calls.

## Specialist subagents

Delegate each cycle to the project subagents in `.cursor/agents/`. The parent session chooses whether another cycle is worth starting and keeps the user informed.

1. `builder` chooses and implements one product improvement: a feature, a bug fix, or a refinement. It does not commit.
2. `designer` then improves the interface and interaction of what changed. The Waymo system in `DESIGN.md` stays the base. A restrained steel-and-steam accent is allowed; a second visual language is not. The designer does not commit.
3. `reviewer` reviews the diff, runs the unit and end-to-end checks the change requires, and commits and pushes only after approval.

Each subagent follows this brief and the product commitments above. Skip a role only when the cycle does not touch its work.

## Recursive improvement loop

Repeat the following loop while meaningful progress is possible within the session's time and resource limits.

### 1. Experience and diagnose

Walk the actual ride flow as a first-time passenger and as a judge seeing a short demonstration. Look for the weakest link: unclear value, confusing interactions, poor content, latency, unreliable sensors, weak feedback, awkward audio, inaccessible controls, or a forgettable reveal. Include permission denial, unavailable stories, and connectivity problems where relevant.

Ground findings in code, observed behavior, or a reproducible scenario. Do not infer defects from a checklist alone.

### 2. Pick the next improvement

Keep a short ranked list of at most three current opportunities. Assess each by:

- **Rider value:** does it make an actual train ride better?
- **Demo impact:** can a judge experience and understand the benefit quickly?
- **Distinctiveness:** does it make the location-and-pointing experience memorable?
- **Confidence:** is the problem demonstrated, and is the proposed solution likely to work?
- **Cost:** what engineering time, interface complexity, provider spend, and regression risk does it add?

Choose one coherent improvement for the cycle. Repair a broken core interaction when it prevents the intended experience. A new feature is appropriate when it produces a stronger result than refining what exists. Give it one sentence describing the user benefit and one observable acceptance condition before building it.

### 3. Implement the complete experience

State the chosen direction briefly, then build it. Complete the interaction, underlying data behavior, loading and failure states, and integration with existing controls. Keep the implementation appropriate to the project. A vertical slice should work end to end.

Give every new control, state, and screen a clear job. Prefer improving the existing ride surface when that meets the need. A new primary screen, provider, or major abstraction needs a concrete benefit that a simpler approach cannot deliver.

### 4. Verify and challenge

Run checks appropriate to the change. For meaningful behavior changes, verify acceptance conditions and relevant regressions. For interface changes, inspect real mobile and desktop renders, including interaction and overflow. Use deterministic replay and mocked providers for repeatable checks; make limited live checks when needed to prove integration behavior.

Keep mocked behavior, successful live requests, and physical device validation clearly distinguished. Do not claim browser mocks prove compass accuracy, background GPS, or lock-screen behavior on a real phone.

Review the result critically: would a first-time user understand it, does it make the ride better, and is its benefit visible in the demo? Fix failures before adding the next feature. Stop repeating successful checks unless new changes or unresolved concerns justify them.

### 5. Refine, simplify, and reassess

Compare the result against its acceptance condition. Retain improvements that earn their complexity. Simplify or remove additions that confuse the core flow, duplicate controls, delay the first useful moment, or create maintenance cost without enough benefit.

Update the next priorities using what you learned. Repeating a cycle must either solve a new demonstrated problem or materially improve a previous result. Avoid cosmetic churn, endless self-scoring, and accumulating features merely to stay busy.

Record completed work, validation evidence, limitations, and the next best action in `pass.md`. Update `README.md`, `PRODUCT.md`, or `DESIGN.md` when their current descriptions need to change. Keep handoff notes concise and current rather than layering contradictory descriptions.

Hand the completed cycle to the reviewer. The reviewer runs the relevant tests and required checks, then commits and pushes. Confirm the push succeeded and report the branch and commit. If a push is blocked, preserve the verified local commit, explain the concrete blocker, and continue independent work where possible. For documentation-only changes, use appropriate documentation and diff checks rather than running unrelated application tests.

## Demo standard

Work toward a repeatable two-to-three-minute demonstration in which a judge can:

1. Understand the rider benefit and start a journey with minimal explanation.
2. Encounter a station and hear the correct announcement.
3. Point toward an interesting POI and hear an acknowledgment followed by a worthwhile, sourced detail.
4. See the discovery persist, inspect its photo and sources, and understand why the experience depends on the world around the rider.
5. See the app remain understandable when one sensor, story, or provider is unavailable.

The demonstration should contain a clear, memorable reveal early enough to matter. Choose that reveal from the actual product's strengths. Make its timing and recovery reliable. Keep technical claims and any simulated conditions honest.

## When to stop and how to hand off

Continue through implementation and verification of the selected work. Do not end merely because you identified useful next steps. Stop when the requested budget or deadline is reached, essential work is externally blocked and independent progress is exhausted, the user redirects you, or remaining changes no longer offer a defensible improvement relative to their cost.

Never equate a session limit with completing every product ambition. On stopping, leave the project runnable and summarize what changed, why it matters to riders and the demo, what was verified, material limitations, and the single best next step. Preserve a concrete handoff so the next session can resume the loop without repeating discovery.

## Invocation

> Read `REFINEMENT.md` and run an autonomous hackathon refinement session. Inspect the current project and worktree, choose the highest-impact improvement, implement and verify it, then reassess and continue under the brief. Use your judgment; keep the product focused and keep me informed of meaningful decisions.
