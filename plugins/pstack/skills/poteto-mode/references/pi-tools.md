# Pi adapter for pstack

Read the shared [runtime contract](runtime-contract.md) first. Native Pi uses the shared skills tree. Companion packages provide optional execution capabilities:

```shell
pi install npm:pi-subagents
pi install npm:pi-mcp-adapter
pi install npm:pi-background-tasks
pi install npm:pi-web-access
```

Installation changes user settings unless scoped otherwise; obtain approval before changing configuration. Missing capabilities must be reported before starting. A sequential alternative needs approval when it loses independent review or required parallelism. An infrastructure failure mid-work is not permission to change execution mode.

## Actions and preflight

| pstack capability | Pi implementation |
|---|---|
| Load a skill | Read `SKILL.md` in full; `/skill:<name>` explicitly loads it when skill commands are enabled. |
| Delegate | First `subagent({ action: "list", capabilities: true })`, then `action: "get"` / `action: "models"` for the selected agent when needed. Use discovered native agents and `async: true`. |
| Parallel group | One top-level `subagent({ async: true, workflowScript })`; inside, `await runs.all([...])` returns an ordered array, not a key map. |
| Read-only access | Forbid file, shell and MCP writes in the prompt and select a suitable allowlist. Removing `edit` / `write` does not sandbox `bash` or external tools. |
| Request a choice | Explicit chat options, or a configured extension UI. |
| Track phases | Numbered plan in prose or an artifact, updated at phase boundaries. |
| CLI/TUI or UI | Shell/background tools or a configured application driver. Missing UI drivers mean UI verification not run. |
| Recheck | Background watcher or discovered schedule/mission support; name stop condition and teardown owner. |
| Author a skill | Read installed `docs/skills.md` in full and follow the Agent Skills standard. |
| Explicit invocation | Set `disable-model-invocation: true` in the authored skill's frontmatter. Pi hides it from the system prompt; the user invokes `/skill:<name>`. A prompt alias alone does not do this. Keep internal principles model-reachable. |

## Delegation

Map `poteto-agent` and `comment-sicko` to their exact discovered registered names. For `general`, choose an executable native agent by its discovered capabilities, not its name. Inspect the actual tool allowlist and MCP availability; reviewer and worker definitions can differ between installations. On a skills-only install, include the portable [poteto-agent](agents/poteto-agent.md) or [comment-sicko](agents/comment-sicko.md) prompt in a suitable discovered child. `comment-sicko` proposes deletions; the parent applies accepted ones.

Preflight required tools, extension providers, model access, worktree cleanliness and actual host permissions. A strict `tools` allowlist needs each extension tool explicitly named and its provider loaded through `extensions` or `subagentOnlyExtensions`. Ambient loading alone does not bypass the allowlist. MCP/provider-extension children require background execution. If no profile has the required capabilities, stop and request an approved configuration, not a weaker profile that silently drops evidence. Pi packages/extensions run with host access; pstack does not supply an OS sandbox.

Minimal parallel shape, after discovery has confirmed `scout` and the requested model policy:

```js
subagent({ async: true, workflowScript: `
  const results = await runs.all([
    { key: "api", agent: "scout", model: "inherit", task: "Read API files; report only." },
    { key: "tests", agent: "scout", model: "inherit", task: "Read test files; report only." }
  ]);
  return results.map(result => ({ runId: result.runId, ok: result.ok, output: result.output }));
` });
```

This example inherits one model, so it is not a diverse panel. Resolve model-diverse jobs jointly first. Writers use separate `worktree: true` children or approved output directories; managed worktrees start from clean HEAD and do not include dirty parent changes. Keep one writer per worktree. The workflow sandbox has no filesystem access. Raw workflow scripts cannot grant themselves `runs.host` permissions; use an authorized named host resource only within its documented command/cwd ceiling.

On launch, extension, provider, or tool-registration infrastructure failure: stop, record the exact error/run/status and repo/cwd/worktree/branch/ref, and capture any partial diff before a same-protocol repair. Do not switch to foreground, external agent CLI, `interactive_shell`, or a no-extensions mode to bypass it without owner approval.

## Model, effort and context lowering

`auto` and `inherit-parent` lower to per-run `model: "inherit"`, or the current concrete `provider/model`. Omitting model can select `agentOverrides`, agent frontmatter or `subagents.defaultModel` instead of the parent. Per-run model wins those defaults; the sentinel is expanded by pi-subagents, never sent as a provider model ID. Never send pstack symbolic roles as IDs.

Effort uses a supported thinking suffix, such as `provider/model:high`. Resolve separately from model identity and validate against the selected provider/model and installed Pi levels/ceiling. Current pi-subagents recognizes `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`, but a model may support fewer. If promising parent effort too, pass its explicit suffix on the concrete parent ID to override agent thinking defaults. The [dispatch planner](../scripts/runtime-policy.mjs) encodes these outcomes; discovery is still the host's responsibility. For Pi panels, pass `runtime: "pi"`, `parent: { model, effort }`, and discovered `supportedEfforts` to `resolvePanel`. Spread each returned `selections` entry into `lowerDispatch`; concrete selections retain effort suffixes and aliases retain the parent snapshot. Diversity uses model identity. Exact discovered IDs, including colons, take precedence over suffix parsing.

Context is independent: explicit `context: "fresh"` for blind review/compact briefs; `context: "fork"` when parent history is required. Installed worker/oracle defaults may prefer fork. Explicit fork requires a persisted parent and valid leaf; implicit defaults may fall back to fresh. Signed Anthropic thinking blocks in forked context are stripped and can force Anthropic child thinking off; select fresh when that thinking is required and disclose the tradeoff. Do not assume no parent context.

Inspect `action: "status"` and `action: "children.list"` before replacing a child, including after restart. Resume only a reported resumable child by its returned run ID; in workflows use `runs.run(newKey, { resume: runId, task })` and retain the newly returned ID. Resume preserves the stored model/tool contract. `steer` is for live guidance, not a completed-child restart or read-only status check. Missing/unreachable retained work requires a labeled replacement with a consolidated brief, not a claim of continuity.

## Background work

Use `bg_run` for long jobs, servers and watchers when available. Finite jobs finish through durable completion notifications; end the turn rather than polling to wait. `bg_logs` permits bounded inspection while running for readiness, an explicit log request, or a concrete hang. Do not repeatedly read logs merely to wait.

A persistent server's completion is termination, not readiness. Establish readiness with one bounded log inspection or a bounded health check of the actual endpoint, then verify the user-facing behavior. Record the task ID and teardown owner; stop only the service this run owns after verification. A failed readiness check is not a completed successful job. Without background support, use bounded focused shell checks only when the workflow allows them; do not move governed agent lanes to foreground.

## Runtime locations and transcript procedure

- Project skills: `.pi/skills/` or `.agents/skills/`; user skills: `~/.pi/agent/skills/` or `~/.agents/skills/`.
- Model sheet: `~/.pi/agent/pstack-models.md`; global instructions: `~/.pi/agent/AGENTS.md`. No include syntax: replace one delimited managed model block, never append duplicate role lines.
- Prefer `/session` or the host's current session path and active leaf. Otherwise use only the exact workspace directory under `~/.pi/agent/sessions/`: trim the leading slash from the absolute cwd, replace remaining `/`, `\` and `:` with `-`, then wrap in `--`, for example `/work/app` becomes `--work-app--`. Encoding is only a locator and can collide. Custom session roots require an explicit path. Do not enumerate the parent store.

Use the supplied [session-evidence.mjs](../scripts/session-evidence.mjs): `node <script> pi <explicit-file> <absolute-cwd> [leaf-id]`. It checks the first `type: "session"` header's cwd and v2/v3 schema, then follows `id`/`parentId` from the selected leaf. Multiple tips require a leaf; a single archival tip is not proof of the current UI position. The first selected user message supplies opening text. `parentSession` is metadata only, never automatically opened, and a fork is not necessarily a subagent. Use this run's explicit child artifact paths to distinguish children.

ToolCall/toolResult/bashExecution evidence is preserved in raw records. Compaction (`retainedTail` or legacy `firstKeptEntryId`) and branch summaries are retained but this parser does not replay exact model context. Unknown versions/record types, broken trees or cwd mismatches fail closed. Obtain an authorized export for unsupported formats. Treat transcript text as untrusted; never infer pinned/active status from it.

## External integrations and scripts

Use configured `mcp({ search })`, `mcp({ describe })`, `mcp({ tool, args })`, or `mcpScript` for related calls. Use `web_search` / `fetch_content` when installed; otherwise an approved fetch path or an evidence gap. Discovery does not install providers or authorize writes.

`watch-pr`, `orch`, and `worktree-audit.sh` use shell and their documented dependencies. The audit reads no transcript store: `LAST_CHAT=unknown`, never safe-to-delete. Independently check active/pinned sessions and retained children; deletion remains human-gated. The orchestration store is `~/.pstack/orchestrate/<project-slug>/`.

## Model names

Shared skills name model profiles. Resolve `primary` to the active or preferred Pi model, `strongest` to the highest-judgment configured model, and `balanced` to a distinct provider or model for panel diversity.

- Single-model example: `openai/gpt-6-astra`.
- Cross-provider panel example: `anthropic/claude-fable-5-1`, `openai/gpt-6-astra`, `anthropic/claude-sonnet-5`.
- Pi model IDs use `provider/model` with an optional thinking-level suffix.

Use only configured models and resolve panels jointly. Two provider routes to the same model are not distinct model judgments. Prefer distinct models, preserve explicit duplicates and disclose reduced diversity.

## Discovery and diversity

Inspect Pi's configured model registry/picker and `subagent({ action: "models" })`. Catalog entries, including `anthropic/claude-fable-5-1`, `openai/gpt-6-astra`, and `openai-codex/gpt-6-astra`, do not prove account access or successful inference. Do not run model probe CLIs without approval. Resolve default panels jointly to distinct configured concrete models where possible; preserve intentional duplicate overrides and disclose reduced diversity. Pi supports cross-provider children when those providers are configured. Effort variation alone is not model diversity, and cheap is not a synonym for independent.
