---
name: no-comments
description: "Spawn the comment-sicko subagent, fix accepted findings, and offer encodings for claimed constraints."
menu-description: strip comments before review, fix the accepted findings, encode claimed constraints
---

# No comments

Spawn comment-sicko. Act on accepted findings.

Read the [runtime contract](../poteto-mode/references/runtime-contract.md) before delegation.

Authoring agents defend comments. Defer to comment-sicko's fresh perspective.

## Scope

Use the caller's files or diff. Otherwise use the current diff against the base branch, default `main`, including the working tree.

## Steps

1. Delegate one read-only child with the `comment-sicko` execution profile. Pass the scope. Do not restate its rules.
2. Inspect the proposed deletions and flags against the scoped code. Reject any mutation, scope escape, exception-protected deletion, misstated `MUST KILL` reason, or flag that treats kept intentional code as guilty. Preserve legal/license headers, public API contracts, and proven external constraints. Audit missed lint and TypeScript suppressions: correctness or safety suppressions require a proven root-cause fix, not blind removal. Before accepting thin `IMPORTANT` or `do not remove` proposals, run `/how` or `/why` on their symbol. Review ambiguous comments against the child's keep policy with scoped proof. A rejected report gets one re-review with the failure named; reject a second, report it open, and fail `/no-comments`. If the child mutated files, restore only its unauthorized edits, preserving pre-existing work, before re-review. The parent then applies accepted ordinary comment deletions, including deletion-only findings with no refactor flag. Record proposed, accepted, applied, and rejected counts separately. If later evidence requires restoration, restore the exact comment, record the exception and proof, and re-review that scope. Do not claim a proposed deletion already happened.
3. Fix trivial accepted flags directly by deleting a dead path, dropping a parameter, or using the real API. If any fix needs a shape, run `/architect` once for the accepted set and surrounding code. Stop at the sketch. Architect shapes. Step 4 implements.
4. Implement the smallest root-cause fix in scope. Remove every named workaround. If the root cause is out of scope, land the smallest in-scope fix and report the rest open. The **principle-fix-root-causes** and **principle-redesign-from-first-principles** skills guide intent only: fix real causes, redesign as if requirements always existed, never bolt on symptom guards. Neither authorizes widening the fence nor fixing instances outside it.
5. Constraint comments say `do not remove`, `do not change wording`, or `talk to X before changing`. Leave keeps about things we cannot change. Offer the cheapest in-scope type, runtime, test, or CI lint. Wait for interactive approval. Unattended and eval require caller pre-approval. If approved, encode then delete. Otherwise retain protected or safety-critical constraints and report the encoding open; apply only independently accepted non-protected deletions.
6. Report proposed and applied deletion counts separately, restored comments, reruns, architect sketch, fixes, encoding offers, encodings, unenforced constraints, and other open work.
