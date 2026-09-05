# Runtime contract

Shared pstack skills describe outcomes through this contract. They do not name a runtime tool, model ID, configuration path, transcript schema, or built-in workflow. Before executing a runtime-dependent instruction, read the adapter for the active runtime:

- [Claude adapter](claude-tools.md)
- [Codex adapter](codex-tools.md)
- [Pi adapter](pi-tools.md)

If no adapter matches, map the same capability to the runtime you have. Report any capability that cannot be preserved.

## Skill and workflow capabilities

- **Load a skill.** Resolve the named Agent Skill, read its `SKILL.md` in full, and follow it.
- **Use skill-authoring guidance.** Load the runtime's authoritative guidance for creating Agent Skills. Preserve the shared `name`, `description`, progressive-disclosure, and relative-resource rules.
- **Set invocation policy.** Use runtime-specific metadata or packaging to mark a skill for explicit invocation or automatic discovery. When the runtime has no such control, state that limitation.
- **Drive a CLI or TUI.** Start the real program, interact with it, and observe output on the user-facing path.
- **Drive a UI.** Use the configured browser or application driver. If none exists, mark UI verification as not run.

## Delegation capabilities

A shared skill describes each child with these fields:

- **Profile.** The named prompt and capability set, such as `poteto-agent`, `general`, or `comment-sicko`.
- **Access.** `read-only` forbids file edits, shell mutations and external writes. It is prompt posture unless the adapter identifies an enforced sandbox/tool policy; removing file-write tools alone is not a sandbox. `full` permits only authorized task writes. Integration capability is separate from write authority.
- **Model role.** A role from `plugins/pstack/models.json` or the active model override sheet. The runtime adapter resolves the role to a usable model ID.
- **Effort.** Reasoning budget is separate from model identity. Inherit or choose task-appropriate supported effort, never a blanket highest setting. Validate against the current model/client and disclose unsupported requests.
- **Context.** The adapter selects fresh vs fork from available capabilities and the task: independent blind reviews prefer fresh; context-dependent continuation may need fork. Pass explicit scope either way.
- **Concurrent.** Launch siblings as one bounded parallel group when the skill requests concurrent work.
- **Isolation.** Give concurrent writers separate worktrees or output directories. Keep one writer per worktree.
- **Continuation.** Inspect and reconnect the same retained child when continuity matters, including after restart. Reconfirm current status and scope before respawning. If continuation is unavailable, label the replacement and supply a consolidated brief; do not assume either all children died or all context survived.

The parent owns the result. It reads the artifacts, checks the diff, and writes the final synthesis.

## User input

When a skill requests a choice, use the runtime's structured input UI when available. Otherwise ask in chat with explicit options. Preserve every approval gate.

## Runtime locations

Resolve these logical locations through the active runtime adapter:

- **Project skills.** Skills installed for the current repository.
- **User skills.** Skills installed for the current user.
- **Current-workspace transcripts.** Session records for only the active working directory. Never enumerate unrelated projects.
- **Model override sheet.** The per-role pstack model configuration.
- **Global instructions.** Instructions loaded in every session for the active runtime.

Transcript lookup includes both the directory and the runtime's record schema. A path substitution alone is not enough.

## External tools and scheduling

- **Discover integrations.** Enumerate configured external tools through the runtime's discovery mechanism. Missing categories become explicit gaps.
- **Run in the background.** Use completion notifications when available. Do not sleep or poll merely to wait.
- **Schedule a recheck.** Use the runtime scheduler, a background watcher, or an equivalent bounded continuation. State the stop condition.

## Model profiles

Shared skills use symbolic profiles:

- `primary` is the normal implementation, explanation, and prose model.
- `strongest` is the highest-judgment model available.
- `balanced` is a distinct model used to improve panel diversity or reduce cost.
- `inherit-parent` and `auto` use the parent session's model.

Concrete IDs belong only in runtime adapters and the user's model override sheet.

Resolve panel slots jointly, not independently: prefer distinct concrete models from the configured reachable set for default symbolic slots. Preserve intentional duplicate user overrides, including parent aliases, and report the number of distinct models and reduced diversity. Effort changes alone do not create model diversity. A cheap model is not automatically an independent reviewer; a separate evidence-driven review is required regardless of cost. Cross-provider children are a runtime capability, not a universal promise.

The [dispatch planner](../scripts/runtime-policy.mjs) accepts `parent: { model, effort }` in `resolvePanel`. Its `selections` array contains dispatch inputs, not model identities. Spread each selection into `lowerDispatch` with the discovered runtime/profile configuration. Alias selections retain the alias and a parent snapshot, so native lowering preserves parent effort and omission semantics. Diversity is computed separately from resolved model identity.

Model IDs, reasoning effort and context are separate choices. A catalog is evidence of discovery, not account authorization or successful inference. Validate each runtime's native model/effort schema before dispatch. If agent-level defaults defeat an explicit choice, use a compatible profile or disclose inability instead of promising inheritance.

Transcript readers must preserve tool evidence, identify selected branches and compaction limits, and fail closed on unsupported schemas. Use explicit session files or exact workspace-scoped locators; do not turn a missing locator into a user-wide search. Missing activity evidence is unknown, never safe for worktree deletion.
