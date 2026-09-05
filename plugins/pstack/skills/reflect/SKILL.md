---
name: reflect
description: Spawn three parallel review subagents over the active transcript, surface learnings, and route each to a concrete edit on an existing skill. Use when the user says reflect.
menu-description: capture a long task's lessons as a skill edit
---

# Reflect

Mine the current conversation for durable learnings, then route them into skill edits.

Read the [runtime contract](../poteto-mode/references/runtime-contract.md) before locating transcripts or delegating work.

## When to invoke

- The user said "reflect" or "/reflect".
- A complex task (5+ tool calls) just landed cleanly and the recipe is worth keeping.
- The agent hit dead ends, found the working path, and the path generalizes.
- The user corrected the agent's approach mid-task.
- A non-trivial workflow emerged that isn't captured anywhere.

Skip when the conversation is trivial, off-topic, or already covered by an existing skill the parent followed correctly. One-offs are not learnings.

## Process

### 1. Locate the active transcript

The parent finds its own transcript file before fanning out. The system prompt names the runtime's current-workspace transcript location; use that path. Do not glob across other workspace transcript locations. That crosses workspace boundaries and reads private chats from unrelated projects.

Use the adapter's transcript locator and parser. Validate each candidate against the conversation's opening user prompt. If no transcript resolves, write a tight session digest and pass that instead.

### 2. Spawn three reviewers in parallel

Delegate three reviewers as one concurrent group. Use the `general` execution profile and assign each configured model role explicitly. Reviewers need external-integration access for context lookups. Keep that capability while forbidding file writes in the prompt. The parent applies edits.

| Lens | `model` | Prompt template |
|---|---|---|
| Judgment | your configured reflect-judgment model (default in [Models](#models)) | `references/judgment-reviewer.md` |
| Tooling | your configured reflect-tooling model (default in [Models](#models)) | `references/tooling-reviewer.md` |
| Divergent | your configured reflect-judgment model (default in [Models](#models)) | `references/divergent-reviewer.md` |

Pass each template verbatim, substituting the transcript path or digest where marked. Reviewers return findings in the child result.

### 3. Synthesize

Delegate one synthesizer with the `general` execution profile and the configured reflect-judgment model role. Preserve external-integration access because the quality check spot-verifies citations. Use `references/synthesizer.md` verbatim, with each reviewer's full output inlined where marked. The synthesizer returns a structured Accepted / Rejected / Backlog list.

### 4. Structural enforcement check

Sanity-check the synthesizer's Accepted list. For any item that would be enforced more reliably by a lint rule, script, metadata flag, or runtime check, move it from Accepted to Backlog. The synthesizer already applies this criterion; this is a final pass before edits land. See the **encode-lessons-in-structure** principle skill.

### 5. Apply

Before applying any Accepted edit, present the synthesizer's full Accepted/Rejected/Backlog output to the user and wait for explicit approval. The user picks which subset to apply and may redirect routings. Skill changes affect every future agent in the org; do not auto-apply.

Backlog items file to whatever devex / backlog tracker your team uses automatically. Those are tracker submissions, not skill edits. Only the Accepted list waits for approval.

For each approved Accepted item, follow the Routing field exactly:

- Trivial existing-skill edit (a one-line bullet, a tightened sentence, a stale fact corrected): parent does directly.
- Substantive existing-skill edit (a new section, a new pattern table, more than ~10 lines): use the runtime's **skill-authoring guidance** and run its draft, test, and iteration loop.
- `tune description: <skill path>` (the skill exists but didn't trigger when it should have): use the skill-authoring guidance and run its description-optimization loop.
- `new skill via skill-authoring guidance: <kebab-name>`: use the skill-authoring guidance for creation. Do not invent the shape ad hoc.

If your environment ships a SKILL.md validator, run it on every touched skill before declaring done. Skip this step if it doesn't.

### 6. Summarize for the user

Short list, no preamble:

- Edits applied: `<skill path>`. What changed, one line each.
- New skills created: `<skill path>`. One line each (rare).
- Backlog filed to the devex tracker: `<issue title>` (`<tags>`). One line each.
- Dropped: one line per rejected finding + reason from the synthesizer.

## Models

Runtime-neutral model profiles, stamped from `plugins/pstack/models.json`. Resolve each profile through the active runtime adapter. A matching role in the runtime model override sheet wins; see `/setup-pstack`.

- reflect tooling: `primary`
- reflect judgment, divergent, synthesizer: `primary`
