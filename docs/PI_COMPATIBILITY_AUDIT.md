# Native-runtime compatibility audit

Status: implementation and deterministic/static regression coverage in the working tree. No new native inference, plugin installation, account-access or live orchestration smoke was run for these fixes. Historical README smoke observations do not validate the changed behavior.

## Ownership and data shape

One `plugins/pstack/skills/` tree is the conceptual source. `poteto-mode/references/runtime-contract.md` defines capabilities; `claude-tools.md`, `codex-tools.md`, and `pi-tools.md` own concrete execution. `models.json` maps shared roles to symbolic profiles. Claude has documented concrete defaults; Codex/Pi have runtime selectors (`active`, `highest-judgment`, `distinct`) and examples, not forced providers. Runtime discovery supplies ordered concrete candidates and supported effort values.

`poteto-mode/scripts/runtime-policy.mjs` is a pure dispatch/authoring planner, not a second agent runtime. It consumes discovered model IDs, exact native agent names, effective agent configuration, parent model/effort and supported effort levels. It resolves default panels jointly, preserves explicit duplicates, validates native effort and rejects unresolved/conflicting choices. Its Claude `agentFrontmatter` and Codex `model_reasoning_effort` represent native configuration requirements, not invented tool-call fields. Host capability and permission discovery remain necessary.

`poteto-mode/scripts/session-evidence.mjs` reads one explicit bounded JSONL file. It validates exact cwd and known runtime envelopes, identifies opening user text and retains line-numbered raw records/tool evidence. Pi selects an explicit branch when ambiguous. It never scans a store, opens a parentSession reference or replays exact model context. Unknown formats fail closed; compaction, branch, attachment and liveness limits are reported.

## Fixed native contracts

| Capability | Claude | Codex | Pi |
|---|---|---|---|
| General delegation | `general-purpose`; named profiles from discovery | Discovered type or optional installed native TOML template | Capability-discovered native agent; strict allowlist/provider preflight |
| Parent aliases | Omit model only for unset/inherit native profile; override pins explicitly | Explicit parent values plus config precedence check; block conflicting profile | Per-run `model: "inherit"` or concrete current provider/model, not omission |
| Effort | Supported agent `effort` frontmatter | Supported `model_reasoning_effort` | Validated thinking suffix; explicit parent effort overrides profile default |
| Explicit-only authored skill | Native frontmatter | Skill `agents/openai.yaml` policy | Native frontmatter; prompt alias alone is insufficient |
| Context/continuation | Capability-dependent fresh/fork and retained handles | Capability-dependent context and retained handles | Fresh/fork, children.list/status and resumable returned run IDs |
| Hook ownership | Claude SessionStart hook | Explicit empty native hook file prevents accidental Claude hook import | Parent-only before_agent_start extension |

Internal principle skills remain model-reachable. Report-only is not a sandbox: Pi's comment reviewer retains `bash`, and shell/MCP permissions must be checked independently. The child proposes comment deletions only; `no-comments` assigns accepted edits, restoration and re-review to the parent.

## Pi execution boundaries

The root `package.json` exposes the shared skills, prompts, agents and extension. Read the installed Pi skills/packages/session-format/sessions docs before relying on their behavior. `pi-subagents` supports native discovery, one asynchronous top-level workflow with awaited ordered `runs.all`, capabilities, worktrees and retention. A missing provider under a strict allowlist is an infrastructure blocker, not permission to launch a CLI/foreground fallback.

`bg_logs` can inspect running jobs for readiness, an explicit request or a concrete hang. Repeated polling merely to wait is prohibited. Finite-job completion is distinct from persistent-service readiness; services need a bounded readiness check and explicit owned teardown.

## Codex and desktop boundaries

Current Codex enables subagents by default; `[agents]` and project/user `.codex/agents/*.toml` are native configuration. Generated templates require explicit installation/discovery; no plugin auto-registration is assumed. Codex supports plugin hooks and shares the manifest shape with ChatGPT plugins. pstack intentionally supplies no Codex lifecycle mandate. Local Codex/ChatGPT desktop capabilities do not imply ChatGPT web/Work access, local filesystem access, or successful inference.

## Safety and verification

`worktree-audit.sh` no longer reads any transcript store. It reports unknown activity and cannot assign `safe`; independent active/pinned-session/child checks and human approval are required before deletion.

Run:

```shell
bun tools/generate.mjs
bun tools/generate.mjs
bun test tests/
SKIP_BEHAVIORAL=1 bash tests/skill-collision-repro.sh
git diff --check
```

The second generator run must make no writes. Tests include:

- `runtime-policy.test.mjs`: concrete lowering, aliases versus effective agent overrides, effort/suffix validation, joint panel matching, intentional duplicates, explicit authoring fixtures, native TOML parse/roundtrip, hook ownership, managed-block idempotence, and an executed Pi workflow example against a mock `runs` API.
- `session-evidence.test.mjs`: synthetic Claude/Pi/Codex records, tool evidence, first user selection, branch selection, scope/schema rejection and bounded explicit-file reading.
- `worktree-audit.test.mjs`: stubbed Git/PR tools and a synthetic unrelated transcript store; no transcript probe, unknown activity never safe, tracked work held.
- `agent-skills.test.mjs`, `pi-extension.test.mjs`, and invariants: shared boundary/generator contracts, parent mandate semantics and child exclusion.

Lexical adapter/playbook assertions and mocks are **static contract checks**, not proof of native tool invocation. The generator validates references for all three runtime model configurations; it cannot prove catalog access. Browser/MCP/authentication, host sandbox enforcement, model availability, actual profile registration, native effort precedence and end-to-end retained-child behavior still require separately authorized smoke testing. Do not run model-probe CLIs or enumerate real unrelated sessions as part of these fixtures.
