# Pi compatibility audit for pstack

Status: this audit preceded the 0.9.19 native Pi package and describes the port as it stood before that work. It was a documentation and capability audit only; `AGENTS.md` was not created or modified. For how pstack installs and runs on Pi now, read [Running on Pi](../README.md#running-on-pi). The findings below are kept as the reasoning behind the package.

## Executive conclusion

Pi can support most of pstack's intended behavior, but the current repository is not a native Pi package and its skills cannot be followed literally without a runtime map.

The practical compatibility result is:

- **Directly reusable:** all 52 Agent Skills, their local references, ordinary repository work, Git operations, test execution, prose guidance, TDD, architecture principles, and most review workflows.
- **Supported through installed Pi extensions:** parallel and model-diverse subagents, worktree isolation, retained/resumable children, durable missions, background commands and completion notifications, MCP discovery and execution, and import of compatible Claude marketplace assets.
- **Supported differently:** startup routing, slash commands, model policy, named agents, session/transcript discovery, long-running loops, browser verification, and external service access.
- **Not supported exactly:** Claude's `Skill`/`Agent`/`AskUserQuestion` APIs, Claude model IDs, Claude transcript and configuration paths, Claude's `clear|compact` `SessionStart` matcher semantics, Cursor sticky mode/cloud-agent fields, Claude built-in `run`/`verify`/`loop`, and Claude LSP plugin components.
- **Open gaps:** no credible dedicated native Pi package was confirmed for semantic memory, general LSP/code intelligence, or OS/webhook notifications. Pi primitives can be used to build these, but that is not the same as an existing supported package.

The preferred port is a small native Pi package that exposes the existing skill tree, optional Pi prompt templates, and a Pi extension for lifecycle routing. The fastest trial path is `pi-claude-marketplace --partial` plus the already installed `pi-subagents` and `pi-mcp-adapter`, with `AGENTS.md` supplying the runtime map.

## Audit scope

The repository contains 153 Markdown documents:

| Group | Count | Coverage |
|---|---:|---|
| Top-level documentation and notices | 6 | Reviewed |
| Public and internal `SKILL.md` files | 52 | Reviewed |
| Skill references | 38 | Reviewed |
| Poteto-mode playbooks | 23 | Reviewed |
| Codex prompt stubs | 31 | Reviewed |
| Agent definitions | 2 | Reviewed |
| Session-start context | 1 | Reviewed |

The audit also reviewed the Claude and Codex manifests, hooks, model policy, generators, validators, tests, CI configuration, Pi 0.84.4 documentation, and the installed Pi package documentation relevant to skills, packages, extensions, sessions, prompts, subagents, background work, MCP, and Claude marketplace compatibility.

Repository evidence anchors:

- Portable boundary: `README.md:22-45`, `CONTEXT.md:5-6`.
- Claude/Codex runtime differences: `README.md:128-139`.
- Substitution history: `CHANGES.md` and `tools/substitutions.json`.
- Auto-routing hook: `plugins/pstack/hooks/hooks.json` and `plugins/pstack/hooks/session-start-context.md`.
- Main runtime assumptions: `plugins/pstack/skills/poteto-mode/SKILL.md:11-35,79-93,114-145`.
- Codex-only map: `plugins/pstack/skills/poteto-mode/references/codex-tools.md`.
- Portable asset and generator contracts: `tools/generate.mjs`, `tools/validate-skills.mjs`, and `tests/agent-skills.test.mjs`.

## Runtime inventory used for the determination

| Component | Type | Installed version | Role |
|---|---|---:|---|
| Pi coding agent | Core | 0.84.4 | Skills, context files, prompt templates, sessions, tools, models, extensions, packages |
| [`pi-subagents`](https://github.com/nicobailon/pi-subagents) | Installed Pi package | 0.62.0 | Parent-owned delegation, parallel workflows, model routing, worktrees, resume, missions |
| [`pi-mcp-adapter`](https://github.com/nicobailon/pi-mcp-adapter) | Installed Pi package | 2.31.0 | Lazy MCP discovery, tools, resources, prompts, OAuth, approvals |
| [`pi-claude-marketplace`](https://github.com/acolomba/pi-claude-marketplace) | Installed Pi package | 0.18.1 | Imports compatible Claude commands, skills, agents, hooks, and MCP declarations |
| [`pi-background-tasks`](https://github.com/ismailsaleekh/pi-background-tasks) | Installed Pi package | 2.4.2 | Durable background commands, notifications, delegated inspection, Fusion workflows |

These extensions are present in the current user's Pi settings. They are not Pi core and cannot be assumed on another installation.

## Capability matrix

### Supported natively by Pi

| pstack need | Pi support | Required change |
|---|---|---|
| Agent Skills and progressive disclosure | Pi discovers `SKILL.md` recursively from `~/.pi/agent/skills`, `~/.agents/skills`, project equivalents, packages, settings, and `--skill`. | Reuse `plugins/pstack/skills/` as the portable boundary. Keep all 21 `principle-*` leaves installed. |
| Skill commands | Pi exposes skills as `/skill:<name>`. | Do not assume Claude's `/pstack:<name>` spelling unless an importer or alias provides it. |
| Slash-like workflow prompts | Pi prompt templates become `/name` commands. Extensions can register commands. | Generate Pi prompts separately if short aliases are desired. Do not add `plugins/pstack/commands/`; repository tests forbid it. |
| Project instructions | Pi loads `AGENTS.md` and `CLAUDE.md` context files. | Put the Pi runtime mapping in `AGENTS.md`. No `@~/.claude/...` include is needed. |
| File/search/shell/edit work | Built-in `read`, `grep`, `find`, `ls`, `bash`, `edit`, and `write`. | Translate Claude tool names to outcomes, not one-for-one spellings. |
| Git, tests, compilers, scripts | Available through `bash`, subject to installed binaries and credentials. | Check `gh`, `bun`, `gt`, `jq`, and `rg` only when a selected workflow needs them. |
| Session persistence and branching | Pi stores per-project JSONL sessions and supports resume, tree navigation, fork, clone, and compaction. | Replace every `~/.claude/projects/<encoded-cwd>` lookup with Pi's session location or SessionManager-aware tooling. |
| Multi-provider models | Pi has a provider/model registry, model selection, thinking levels, and model cycling. | Replace hard-coded `claude-*` IDs with configured `provider/model` IDs. Pi can restore real cross-vendor panels when multiple providers are authenticated. |
| Lifecycle interception | Pi extensions expose `session_start`, `input`, `before_agent_start`, `tool_call`, `tool_result`, compaction events, `agent_end`, `agent_settled`, and `session_shutdown`. | Implement lifecycle-dependent behavior as a Pi extension when standing `AGENTS.md` guidance is insufficient. |
| User interaction from extensions | Pi extensions can select, confirm, input, edit, notify, and render custom UI. | Skills themselves should ask in normal chat unless a dedicated extension tool is provided. |
| Packaging and updates | Pi packages bundle extensions, skills, prompts, and themes and install from npm, git, URL, or local paths. | Add a native `package.json#pi` manifest for a maintained Pi distribution. Current Claude/Codex manifests are ignored by Pi core. |

### Supported by installed extensions

| pstack need | Extension | Pi pattern |
|---|---|---|
| `Agent` calls and parallel panels | `pi-subagents` | Parent uses `subagent` and one `workflowScript`; `runs.all` performs bounded parallel fanout. |
| Per-child models and thinking | `pi-subagents` | Configure agent overrides/profiles or pass Pi `provider/model:thinking` values. |
| Read-only critics and writable workers | `pi-subagents` | Use reviewer/scout roles for read-only work and one worker/writer per cwd. Tool restrictions are explicit, not Claude `readonly:` flags. |
| Worktree isolation | `pi-subagents` | Use managed `worktree: true` for concurrent writers; consume handoff artifacts. |
| Resume/continuity | `pi-subagents` | Resume retained child runs by run ID or workflow receipt. Do not assume Claude `subagent_type` continuity. |
| Standing long-lived objective | `pi-subagents` missions | Missions, decisions, state, artifacts, receipts, and goal budgets are the closest analog to Cursor `/goal` and `~/.claude/orchestrate`. |
| Background tests, servers, PR watchers | `pi-background-tasks` | Use `bg_run` for long commands, durable logs, completion notification, and follow-up wake. |
| Multi-model reasoning/investigation | `pi-background-tasks` Fusion | Useful for fixed-purpose advisory synthesis. It is not a replacement for writer work or mechanical tests. |
| MCP discovery and execution | `pi-mcp-adapter` | Use `mcp` for one call and `mcpScript` for multi-call workflows. It reads standard `.mcp.json` and supports OAuth/approvals. |
| Browser, GitHub, and service tools | `pi-mcp-adapter` plus a server | Configure a browser/GitHub/service MCP independently. The adapter alone does not provide those services. |
| Claude marketplace assets | `pi-claude-marketplace` | Compatible commands, skills, agents, hooks, and MCP servers can be imported; unsupported components require `--partial`. |

### Supported, but not in the prescribed way

| Prescribed behavior | Pi-compatible behavior | Documentation impact |
|---|---|---|
| Invoke with Claude's `Skill` tool | Read/load the matching Pi skill, or use `/skill:<name>`. | Every instruction saying “use the Skill tool” needs a Pi note. |
| Spawn Claude `Agent` with `subagent_type`, `model`, `readonly`, `run_in_background` | Parent-owned `pi-subagents` call with an executable agent, context policy, model override, tool boundary, and async workflow. | Centralize the mapping in `AGENTS.md`; do not rewrite all upstream skills by hand. |
| `AskUserQuestion` fixed-choice tool | Ask in chat; an extension may use `ctx.ui.select/confirm/input` when UI is required. | Preserve each skill's actual approval semantics. Do not globally turn every question into autonomy or every decision into a pause. |
| Claude `run` | Execute and observe the CLI/TUI with Pi tools or a project-specific harness. | Claim only observed results. |
| Claude `verify` | Use configured browser/UI automation; otherwise provide a manual check and mark it unverified. | Do not equate compilation with UI verification. |
| Claude `loop` | Use bounded background work, completion notifications, schedules, or a mission continuation loop. | Define stop conditions and avoid sleep/status polling. |
| `poteto-agent` / `comment-sicko` `subagent_type` | Dispatch an appropriate Pi child with the portable prompt under `poteto-mode/references/agents/`. | `comment-sicko` remains report-only and may not edit application code. |
| Claude model override sheet | Pi settings and `pi-subagents` profiles/agent overrides. | Treat repository model names as role/tier intent, not valid Pi IDs. |
| Claude transcripts | Pi session JSONL and Pi run artifacts. | Preserve project privacy boundaries; never glob unrelated project sessions. |
| `~/.claude/orchestrate/<slug>` | `pi-subagents` mission records and managed artifacts, or an explicitly approved durable project path. | Use mission state for small JSON and artifacts for large reports. |
| Claude command stubs | Pi skill commands or Pi prompt templates. | Keep adapters outside generator-owned Claude/Codex output. |
| MCP tools enumerated as `mcp__...` | Discover with `mcp({search})`, inspect with `mcp({describe})`, then call. Direct tools are optional. | The `why` skill needs a Pi-specific discovery rule. |
| Multiple `Agent` calls “in one message” | One parent `workflowScript` using `runs.all`. | Keep one top-level orchestrator call and one writer per worktree. |
| Remote/cloud workers | Local managed children/worktrees by default; external CLI/job agents only when explicitly configured. | Do not promise remote execution or cloud isolation. |

### Cannot be supported exactly

| Capability | Why | Best available answer |
|---|---|---|
| Claude `SessionStart` matcher `startup|clear|compact` | Pi's native session reasons differ. The installed Claude marketplace bridge considers only `startup` and `resume` safely mappable; `clear` and `compact` have no direct Pi `session_start` equivalent. | Put the routing mandate in `AGENTS.md`, or write a native Pi extension using `session_start` plus compaction events. Do not rely on the current Claude hook unchanged. |
| Claude hook wire protocol and environment parity | Pi has analogous events, not guaranteed byte-for-byte Claude payloads, exit semantics, or environment variables. | Use the native extension API, or test each hook through `pi-claude-marketplace` before claiming parity. |
| `user-invocable: false` behavior | Pi ignores unknown skill frontmatter. Pi supports `disable-model-invocation`, which has different semantics. | Keep principle leaves installed and tell Pi they are internal references. Accept that menu/system-prompt visibility may differ unless a native package filters them. |
| Guaranteed automatic skill invocation | Pi puts descriptions in context, but documentation explicitly says models do not always load matching skills. | Standing `AGENTS.md` routing plus `/skill:name` for forced use. |
| Claude built-in `run`, `verify`, `loop` as named skills | They are Claude runtime assets, not portable Agent Skills. | Outcome-based Pi instructions and the extensions listed above. |
| Cursor sticky mode and agent frontmatter such as `is_background` | No equivalent metadata contract. | `AGENTS.md`, native lifecycle extension, and async subagents. |
| Cursor cloud-agent fields | Pi local children do not implement Cursor cloud environment fields. | Managed local worktrees or explicitly configured external runners. |
| Exact Claude active-transcript layout | Pi's JSONL schema, path, tree entries, and compaction entries differ. | A Pi session parser or SessionManager-based extension. |
| Claude/Codex marketplace update semantics | Pi has its own package manager and trust model. | Publish/install a native Pi package or use the Claude marketplace bridge. |
| Claude LSP plugin components through the bridge | `pi-claude-marketplace` classifies official LSP plugins as only partially available and ignores unsupported LSP components. | Compiler/linter/CLI checks, an MCP code-intelligence server, or a future native Pi LSP extension. |

## Skill-by-skill result

Labels:

- **Native:** works as prose or ordinary Pi repository work.
- **Adapt:** works after applying the Pi runtime map.
- **Conditional:** depends on credentials, external binaries/services, browser/UI automation, or consequential-write approval.
- **Major adaptation:** the defining workflow needs persistent orchestration and cannot be treated as a simple skill invocation.

| Skill | Result | Main reason |
|---|---|---|
| `architect` | Adapt | Multi-model candidates, todo state, routed skills, and model policy need Pi orchestration. |
| `arena` | Adapt | Use `runs.all`, managed worktrees, a separate judge, and parent synthesis. |
| `automate-me` | Adapt | Replace Claude transcripts, `.claude/skills`, `AskUserQuestion`, and `plugin-dev` assumptions. |
| `babysit` | Conditional | Requires authenticated `gh`, durable watching, remote writes, and explicit risky-operation gates. |
| `blast-radius` | Native/Adapt | Core inspection and proof work are native; optional fanout uses subagents. |
| `bro` | Native | Conversation-only prose transformation. |
| `create-verification-skill` | Conditional | Needs real app/process ownership and browser, PTY, or API drivers; write to Pi/project skill paths. |
| `deslop` | Native | Diff inspection and editing only. |
| `figure-it-out` | Adapt | Use Pi plan/missions/artifacts and parent-owned design/review fanout. |
| `fix-ci` | Conditional | Requires authenticated `gh`, network access, pushing, and CI completion handling. |
| `fix-merge-conflicts` | Native | Git, edit, package manager, and tests. |
| `get-pr-comments` | Conditional | Requires GitHub CLI/API or GitHub MCP. |
| `how` | Adapt | Read-only explorers and critics map to Pi reviewers/scouts. |
| `interrogate` | Adapt | Pi can run a real cross-provider panel, but Claude model IDs and Agent fields are invalid. |
| `maintain-verification-skill` | Conditional | Source audit is native; real app lifecycle and evidence capture are environment-specific. |
| `make-pr-easy-to-review` | Conditional | GitHub access plus human approval before history rewrite/force-push. |
| `no-comments` | Adapt | Dispatch the portable `comment-sicko` prompt as a report-only reviewer. |
| `poteto-mode` | Adapt | Central router depends on nearly every runtime mapping in this document. |
| `recall` | Adapt | Replace Claude transcript path; optional shared-record sweep depends on MCPs. |
| `reflect` | Adapt | Replace active transcript lookup and use Pi reviewer/synthesizer fanout. |
| `setup-pstack` | Major rewrite | Must write Pi model/profile configuration, not Claude/Codex files. |
| `show-me-your-work` | Adapt | TSV works; transcript audit and cross-model reviewer need Pi paths and subagents. |
| `swarm` | Adapt | Use parent-owned parallel workflow and isolated writers. |
| `tdd` | Native | Test-first shell/edit loop. |
| `teach` | Adapt/Conditional | `how` is available after mapping; `why` and image generation depend on connectors. |
| `technical-writing` | Native | Prose and repository fact checking. |
| `thermo-nuclear-code-quality-review` | Native | Review/edit/validation workflow; mutation authority must be explicit. |
| `typescript-best-practices` | Native | Compiler/tests/schema inspection. |
| `unslop` | Native | Prose editing only. |
| `what-did-i-get-done` | Native | Git history only. |
| `why` | Conditional | Git lane works; six external evidence categories require separately configured/authenticated MCPs. |

All 21 `principle-*` skills are usable as guidance. `principle-guard-the-context-window`, `principle-exhaust-the-design-space`, and `principle-separate-before-serializing-shared-state` become stronger with `pi-subagents`; the remaining principle skills need no runtime-specific capability beyond ordinary tools and judgment.

## Poteto playbook result

| Playbook group | Result | Pi interpretation |
|---|---|---|
| Investigation, feature, refactoring, bug fix, performance, prototype, visual parity, runtime/trace forensics | Adapt/Conditional | Shell/repository work is native. Route fanout through `pi-subagents`; use actual browser/runtime instrumentation where required. |
| Skill authoring, eval, multi-phase planning | Adapt | Use Pi skill paths and authoring docs; inspect Pi sessions rather than Claude transcripts. |
| Opening PR, babysit, shipping | Conditional/high risk | Requires `gh`; Graphite workflows also require `gt`. Remote writes and merge/force-push remain gated. |
| Autonomous run and hillclimb | Adapt | Use missions, bounded background jobs, decision artifacts, and completion notifications. |
| Orchestrate, autopilot-full, autopilot-stack | Major adaptation | Use Pi missions and staged workflows. Do not launch dozens of uncontrolled writers or model a durable program as one chat-only loop. |
| Pause safely and session pickup | Adapt | Use retained children, mission records, Pi sessions, branches, and explicit handoff artifacts. |
| Worktree/simulator cleanup | Conditional/destructive | Script assumes Claude transcripts and macOS/Xcode. Require explicit deletion approval and adapt transcript lookup. |

## Plugin/package search results

### Strong recommendations already installed

1. **`pi-subagents`** fills the central Agent/fanout/worktree/resume/mission gap. It is the primary pstack execution adapter.
2. **`pi-background-tasks`** fills long tests, servers, PR watchers, bounded logs, and terminal completion notifications.
3. **`pi-mcp-adapter`** fills MCP discovery and external connectors. It needs separately configured servers and credentials.
4. **`pi-claude-marketplace`** provides a fast compatibility route for commands, skills, agents, some hooks, and MCP declarations. It is a bridge, not proof that arbitrary Claude plugins work unchanged.

### Credible companion options

| Need | Candidate | Finding |
|---|---|---|
| Browser verification | [Microsoft Playwright MCP](https://github.com/microsoft/playwright-mcp) through `pi-mcp-adapter` | Credible primary-source composition. Configure and pin the server separately. The official Claude `playwright` plugin is marked available through the marketplace bridge. |
| GitHub/PR operations | [GitHub MCP server](https://github.com/github/github-mcp-server) or [`gh`](https://cli.github.com/) | Credible. `gh` often matches pstack's exact CI/log workflow better. The official Claude `github` plugin is marked available through the bridge. |
| Skill authoring | Pi's own skill docs; official Claude `skill-creator` or `plugin-dev` via the bridge | Both Claude plugins are marked available. Prefer Pi-native authoring guidance for a Pi port. |
| PR review | Existing Pi review skills/subagents; official Claude `pr-review-toolkit` | Plugin is marked available and its agents can be bridged through `pi-subagents`; overlap with installed review skills should be evaluated before adding it. |
| Long loop | `pi-background-tasks` plus missions/schedules; official Claude `ralph-loop` | `ralph-loop` is marked available, but native installed Pi packages already cover the safer bounded-loop shape. Test before relying on Claude-specific semantics. |
| Artifact/session reports | Official Claude `project-artifact` and `session-report` | Both are marked available. They may improve reporting but are not semantic memory and do not fix pstack's Pi session-path assumptions automatically. |
| Code intelligence | Official Claude `serena` through the bridge or an MCP server | `serena` is marked available and may provide useful symbol tools. Verify its actual components and project fit. |
| External evidence sources | Service MCPs via `pi-mcp-adapter` | Linear and Discord are marked available in the configured marketplace. Slack, Notion, Datadog, Sentry, Atlassian, and BigQuery entries are remote and require fetch/compatibility/auth review. |

### Candidates that do not fill the gap

- Official Claude LSP plugins such as `typescript-lsp`, `pyright-lsp`, `gopls-lsp`, and `kotlin-lsp` are classified **partially available** by `pi-claude-marketplace`. Their unsupported LSP component is precisely the capability needed, so partial installation does not solve general LSP support.
- `hookify` is marked available, but pstack's startup routing does not need a second Claude hook authoring layer. Use `AGENTS.md` or a native Pi extension.
- A marketplace plugin with a matching name is not evidence that its Claude hooks, LSP server, model field, or tool names work in Pi.

### No credible package confirmed

- Semantic, cross-session memory/recall.
- General native Pi LSP client/code intelligence.
- General OS/webhook notification package independent of background-task completion.

Possible implementations are a focused Pi extension or an MCP server, but those remain build/selection tasks rather than confirmed plugin solutions.

## Recommended port shape

### Option A: fast compatibility trial

1. Install this local Claude marketplace through `pi-claude-marketplace`.
2. Use partial installation because the pstack `SessionStart` matcher contains Claude-only `clear` and `compact` values.
3. Keep `pi-subagents` and `pi-mcp-adapter` enabled.
4. Add the proposed `AGENTS.md` block below.
5. Smoke-test skill discovery, one prose skill, one writer skill, one reviewer fanout, `comment-sicko`, MCP discovery, session lookup, and a background completion.

Advantages: least repository work. Disadvantages: bridge behavior, namespacing, hook omission, and upstream Claude wording remain visible.

### Option B: maintainable native Pi package

Add a root or dedicated package manifest similar to:

```json
{
  "name": "pstack-pi",
  "keywords": ["pi-package"],
  "pi": {
    "skills": ["./plugins/pstack/skills"],
    "prompts": ["./plugins/pstack/.pi/prompts"],
    "extensions": ["./plugins/pstack/.pi/extensions"]
  }
}
```

The extension can implement exact Pi lifecycle behavior. Pi prompt templates can provide `/poteto-mode`, `/tdd`, and other short aliases without modifying forbidden `plugins/pstack/commands/`. Agent profiles can live in `.pi/agents` or be installed through `pi-subagents`. The generator should own these outputs if they are committed.

Advantages: explicit, testable Pi support and native names. Disadvantages: new maintained adapter surface and CI work.

## Proposed `AGENTS.md` update

This section is prepared for review only. It has **not** been written to `AGENTS.md`.

```markdown
## pstack runtime mapping for Pi

For any non-trivial engineering task, load and follow the `poteto-mode` skill
before responding. This includes features, bug fixes, refactors, debugging,
performance work, and multi-step code changes. Pure questions and trivial
one-line edits are exempt. When intent is already specific, enter `tdd`,
`architect`, `how`, `why`, `arena`, or `interrogate` directly.

If you are a dispatched child or subagent, do not re-enter poteto-mode and do
not launch more workers unless the parent explicitly delegated fanout. Follow
the scoped assignment. Direct user instructions and more specific repository
instructions take precedence.

Use these Pi equivalents:

- A Claude `Skill` invocation means load the matching Pi skill. Use
  `/skill:<name>` when a human needs to force it.
- A Claude `Agent` call means parent-owned `pi-subagents` delegation. Use one
  top-level `workflowScript` for coordinated parallel or sequential work.
  Keep one writer per cwd or managed worktree. The parent reviews and
  synthesizes child work.
- Claude `subagent_type`, `readonly`, and `run_in_background` fields do not
  transfer. Select a Pi agent with the required tool boundary, use async
  execution, and state the edit authority explicitly.
- `AskUserQuestion` means ask in normal chat unless an available Pi extension
  provides the required structured UI. Preserve explicit approval gates for
  force-push, merge, deploy, deletion, customer communication, and other
  irreversible actions.
- Claude `run` means execute and observe the real CLI/TUI with Pi tools.
  Claude `verify` means use configured browser/UI automation; otherwise mark
  UI verification as not run. Claude `loop` means use bounded background work,
  schedules, or mission continuation with explicit stop conditions. Never
  sleep or poll merely to wait for completion.
- Claude model slugs are role and capability hints, not valid Pi model IDs.
  Use configured Pi `provider/model` values. Keep panel members genuinely
  diverse when possible and disclose reduced diversity.
- Discover external tools through `mcp`/`mcpScript`; do not assume Claude's
  `mcp__<server>__<tool>` names are directly registered.

Install and retain the entire `plugins/pstack/skills/` tree, including all
`principle-*` leaves. Treat principle leaves as internal references even if Pi
shows them in skill discovery. For portable named-agent prompts, use
`poteto-mode/references/agents/poteto-agent.md` and
`poteto-mode/references/agents/comment-sicko.md`. `comment-sicko` is
report-only and must not edit application code.

Use Pi session files and managed run artifacts instead of `~/.claude/projects`.
Keep project privacy boundaries and never glob unrelated project sessions. Use
Pi settings and `pi-subagents` profiles or agent overrides instead of
`~/.claude/pstack-models.md`. Use missions and artifacts instead of
`~/.claude/orchestrate` for durable delegated programs.

Do not use Claude hook JSON, Claude/Codex marketplace manifests, generated
Codex prompt stubs, or Claude-specific configuration paths as Pi adapters. Do
not add `plugins/pstack/commands/`. Keep Pi-specific aliases and extensions in
a Pi-owned package path and generator if committed.

Check workflow prerequisites only when needed. `gh` is required for GitHub PR
and CI work, `bun` for vendored pstack scripts, `gt` for Graphite stack flows,
and `jq` plus `rg` for the worktree audit. Browser, GitHub, ticket, docs, chat,
observability, error-tracking, and warehouse capabilities require separately
configured and authenticated tools. Report unavailable categories as gaps.
```

## Validation plan for a real Pi port

1. **Discovery:** load all 52 skills and verify collisions, names, descriptions, references, and visibility of principle leaves.
2. **Routing:** confirm `AGENTS.md` causes parent-only poteto routing and that trivial tasks and dispatched children are exempt.
3. **Commands:** test `/skill:poteto-mode`; if aliases are generated, verify no duplicate entries.
4. **Leaf behavior:** run `bro`, `unslop`, `technical-writing`, `tdd`, and `fix-merge-conflicts` in fixtures.
5. **Delegation:** run `how`, `arena`, `interrogate`, `swarm`, and `no-comments` using `pi-subagents`; verify one writer per worktree and parent synthesis.
6. **Models:** prove configured panel members resolve to intended providers/models and report degraded diversity.
7. **Sessions:** adapt and test `recall`, `reflect`, `show-me-your-work`, eval, pickup, and worktree-audit against Pi JSONL/tree/compaction entries.
8. **Background work:** test a long command, completion notification, cancellation, bounded logs, and mission recovery.
9. **MCP:** test no-server, unauthenticated, authenticated, empty-result, and failure paths for `why`.
10. **Browser/UI:** run one verification skill against a real artifact using the selected browser driver.
11. **GitHub:** test read-only PR inspection separately from comment, push, force-push, merge, and release gates.
12. **Lifecycle:** if a Pi extension replaces the hook, test startup, new, resume, fork, reload, manual compaction, threshold compaction, and shutdown independently.
13. **Packaging:** install the package from a clean Pi home, run `pi list`, reload, update, remove, and confirm no Claude-only paths are required.
14. **Repository checks:** run `bun tools/generate.mjs`, `SKIP_BEHAVIORAL=1 bash tests/skill-collision-repro.sh`, and `bun test tests/` after adding any committed adapter files.

## Risks and decisions still open

- Decide whether Pi is a documented skills-only runtime or a first-class generated build. The latter should receive a manifest, adapter, tests, and release promises.
- Decide whether startup routing should remain standing `AGENTS.md` policy or become lifecycle code. `AGENTS.md` is simpler and covers compaction because context files remain part of the system prompt; an extension is more explicit but adds code and trust surface.
- Decide whether model policy belongs in repository `.pi/settings.json`, user profiles, or a generated setup skill. Exact model IDs should not be committed as universal guidance.
- Decide whether pstack's broad “reversible external writes proceed without asking” policy is acceptable under Pi's permission model. A conservative Pi port should retain stronger user/host approval gates.
- Do not claim semantic memory, LSP support, browser support, or a service connector merely because an adapter package is installed. Each backing provider must be configured and validated.
