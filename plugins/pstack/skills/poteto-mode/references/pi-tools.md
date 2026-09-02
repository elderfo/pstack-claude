# Pi tool mapping for pstack

pstack skills are written in Claude Code tool language (the `Skill` tool, the `Agent` tool, `AskUserQuestion`, `claude-*` model slugs). On Pi the skills are the same files; only the tool names resolve differently. Read this when a pstack skill names a Claude tool, a Claude built-in skill, or a `claude-*` model. This file is Pi-specific. Codex has its own map, and Gemini CLI, opencode, Prime Agent, and other runtimes must use their own concrete tools, model names, and configuration paths.

This map assumes four companion packages are installed alongside pstack. Each source needs its own `pi install`:

```shell
pi install npm:pi-subagents
pi install npm:pi-mcp-adapter
pi install npm:pi-background-tasks
pi install npm:pi-claude-marketplace
```

What degrades without each one:

- No `pi-subagents`: there is no `subagent` tool, so the fan-out skills (`interrogate`, `why`, `how`, `arena`, `reflect`, `architect`, `swarm`) run as one sequential pass in the main session. Say so in the verdict.
- No `pi-mcp-adapter`: there is no `mcp` tool, so `why`'s external evidence lanes (issue trackers, chat history, incident records) report as gaps rather than findings.
- No `pi-background-tasks`: there is no `bg_run`, so run long commands in the foreground and accept the wait. Never sleep or poll to fake a background wait.

`pi-claude-marketplace` is only needed for the bridge install of Claude plugins. The native Pi package does not use it.

## Tool actions

| pstack / Claude action | Pi equivalent |
|------------------------|---------------|
| Read a file | `read` |
| Create / edit / delete a file | `edit`, `write` |
| Run a shell command | `bash` |
| Search file contents / find files | `grep`, `find`, `ls` |
| Fetch a URL | `fetch_content` when `pi-web-access` is installed, otherwise `bash` with `curl` |
| Search the web | `web_search` when `pi-web-access` is installed. With no web tool, report the missing evidence as a gap. |
| Invoke a skill (the `Skill` tool, `/command`) | Read that skill's `SKILL.md` in full and follow it. A human forces a load by typing `/skill:<name>`. |
| Dispatch a subagent (the `Agent`/`Task` tool) | `subagent({ agent, task, model, async })` |
| Dispatch N parallel subagents in one turn | One `subagent({ workflowScript })` whose script calls `await runs.all([{ key, agent, task, model }, ...])` |
| Wait for a subagent result | An async run notifies the session when it finishes. Use `bg_wait` only when the turn has to block. |
| Track tasks (the todolist / `TodoWrite`) | Pi has no todo tool. Keep the numbered plan in your reply and restate it when it changes. |
| Ask the human a fixed-choice question (`AskUserQuestion`) | Ask in chat and list the options. Pi has no structured-choice tool, so the skill's approval gate is yours to hold. |

Pi loads a skill only when it decides to, and a model does not always pick the matching one. When a skill says to invoke another skill, read that skill's `SKILL.md` yourself instead of assuming it loaded.

## Subagent policy

poteto-mode's Subagents section sets Claude-specific defaults (`subagent_type: "poteto-agent"`, `run_in_background: true`, `readonly`). On Pi:

- `subagent_type: "poteto-agent"` becomes `agent: "poteto-agent"`. This package ships that agent definition. See [Named agents](#named-agents).
- `run_in_background: true` becomes `async: true`. The run notifies the session when it finishes.
- A read-only dispatch becomes an agent whose `tools` allowlist carries no `edit` and no `write`. The bundled `reviewer` and `oracle` agents qualify, and so does this package's `comment-sicko`.
- `model` takes a `provider/model` ID with an optional `:<level>` thinking suffix, in the form `anthropic/<slug>:high`. A bare ID resolves against the registry. The Model names section below has the slugs.
- `isolation: "worktree"` becomes `worktree: true` on the dispatch.
- Resume a retained child with `runs.run(key, { resume: <runId>, task })` inside a workflow script. Do not respawn a fresh child to continue its work.
- Children get no `subagent` tool unless their definition sets `allowNestedSubagents: true`. Plan the fan-out from the parent.
- For a durable multi-day program, `subagent({ action: "mission.create", mission: { title, objective } })` keeps objective, decisions, and runs in one record across sessions.

Keep the rest of the policy unchanged. Pass file pointers instead of inlined context, give each writer its own cwd or worktree, and review every child's diff yourself.

## Named agents

This package ships two pi-subagents agent definitions, generated from the Claude agent definitions so both runtimes describe the same roles:

- `poteto-agent` is the routing target for poteto's style. It reads `poteto-mode`'s `SKILL.md` in full before any work.
- `comment-sicko` is the comment reviewer the `no-comments` skill dispatches. Its `tools` allowlist has no `edit` and no `write`, so it reports findings and never applies them.

On an install that carries only the skills tree, neither agent is registered. Dispatch the bundled `worker` (for edits) or `reviewer` (for a read-only pass) and give it the portable prompt in [`agents/poteto-agent.md`](agents/poteto-agent.md) or [`agents/comment-sicko.md`](agents/comment-sicko.md), both next to this file.

## Model names

Skills name Claude defaults (a single-role default for code, prose, and judgment plus a diverse-model panel; each model-consuming skill lists its own in a Models section). A Pi model ID is `provider/model`, so those slugs resolve as `anthropic/<slug>` once the `anthropic` provider is configured. List what you have with `pi --list-models anthropic`.

- Single-model roles: `anthropic/claude-opus-5`.
- Diverse-model panels (`arena`, `architect`, `interrogate`, `how` critics, `reflect`): `anthropic/claude-opus-5`, `anthropic/claude-fable-5`, `anthropic/claude-sonnet-5`. The adversarial signal comes from diversity, so when a second provider is configured swap one member for it (for example `openai/gpt-5.4`).
- Thinking effort is a `:level` suffix on the ID: `off`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`.

`/setup-pstack` writes the configured model list. On Pi, write `provider/model` IDs.

## Claude built-in skills pstack references

Some triggers name skills that ship with Claude Code, not pstack. They do not exist on Pi. Substitute the behavior:

| Claude built-in named in pstack | On Pi |
|---------------------------------|-------|
| `run` (drive a CLI/TUI to see a change work) | Run the app with `bash`, or with `bg_run` when it is a server that must stay up, and read the real output. |
| `verify` (drive a UI to confirm a fix) | Drive the browser through a UI automation MCP server via the `mcp` tool (Playwright MCP, for example). With none configured, record UI verification as not run rather than claiming the fix works. |
| `plugin-dev:skill-development` (Claude's SKILL.md authoring guidance) | Follow Pi's skills documentation (`docs/skills.md` in the Pi install). Keep `name` and `description` frontmatter and progressive disclosure. |
| `loop` (recurring re-invocation, used by `babysit`) | Pi has no `loop` skill. Use `bg_run` and act on its completion notification, or `subagent({ action: "schedule.create", ... })` with `at` or `every`, or a mission. Never sleep and never poll. |

## MCP tools

Claude Code registers each MCP tool under an `mcp__<server>__<tool>` name and lists it in the system prompt. Pi does not. `pi-mcp-adapter` puts every configured server behind one gateway tool:

- `mcp({ search: "screenshot" })` finds tools by keyword.
- `mcp({ describe: "<tool path>" })` returns one tool's schema.
- `mcp({ tool: "<name>", args: { ... } })` calls it. Gateway parameters sit at the top level of the call.
- `mcpScript({ code })` runs several calls in one turn through `tools.search`, `tools.describe`, `tools.call(path, args)`, and `emit`.

The adapter reads `.mcp.json`, `.pi/mcp.json`, `~/.pi/agent/mcp.json`, `~/.agents/mcp.json`, and `~/.config/mcp/mcp.json`. The `directTools` setting registers chosen tools individually instead of behind the gateway. The adapter ships no servers of its own, so browser, GitHub, and service MCPs are configured separately.

A skill that names an MCP category you have not configured is not a failure. The `why` skill in particular treats an unconfigured evidence category as a reported gap in the synthesis, and the verdict says which lanes ran.

## Background work and loops

`pi-background-tasks` supplies `bg_run({ name, command, isAgent })`, `bg_status`, `bg_logs({ taskId })`, `bg_result({ taskId })`, `bg_kill`, and `bg_delegate`. Task state lives under `.pi/tasks/` in the project.

Completion arrives on its own as a `<background-task-notification>` that starts a follow-up turn. The package's own instructions forbid sleeping or polling `bg_status` or `bg_logs` to wait for a task. End the turn, and pick the work back up when the notification arrives.

`babysit` paces itself with Claude's `loop` skill. On Pi, either schedule the next check with `subagent({ action: "schedule.create", at: "+30m" })` or run the vendored `watch-pr` script under `bg_run` and act on its notification.

## Sessions and durable state

Pi writes session transcripts as JSONL under `~/.pi/agent/sessions/<encoded-cwd>/`. The encoding replaces every `/` in the working directory with `-` and wraps the result in `-`, so `/home/user/Developer/repo` becomes `--home-user-Developer-repo--`. `pi --session`, `--resume`, `--fork`, and `--continue` operate on those files.

Where a pstack skill reads `~/.claude/projects/`, read the Pi sessions directory instead. That covers `recall`, `reflect`, `automate-me`, and the evaluation and session-pickup playbooks. Read only the directory for the current working tree. Globbing across encoded-cwd directories reads other projects' transcripts.

The `orch` store stays at `~/.claude/orchestrate/<project-slug>/` on every runtime. The script owns that directory and creates it, so the path is a store location rather than a dependency on Claude Code. For a new multi-day program, a pi-subagents mission is the Pi-native alternative and keeps its state under `~/.pi/agent/missions/projects/<project-hash>/`. Either is acceptable. Pick one per program and stay with it.

## Vendored scripts

`skills/poteto-mode/scripts/` ships the `watch-pr` PR watcher, the `orch` store CLI, and `worktree-audit.sh`. They are plain bun and bash, so they run the same on Pi; invoke them through `bash`. They need `bun`, `gh`, (for stack work) `gt`, and (for `worktree-audit.sh`) `jq` and `rg`. `worktree-audit.sh` reads Claude Code transcripts under `~/.claude/projects/`; point it at `~/.pi/agent/sessions/` instead. Pi's JSONL schema differs from Claude's, so the LAST_CHAT column may come back blank against a Pi sessions directory. Read a blank LAST_CHAT as unknown, not as an idle worktree. The rest of the table stays usable.

## Instructions file

Where a pstack skill says "your instructions file", on Pi that is `AGENTS.md` in the project root, plus `~/.pi/agent/AGENTS.md` for the global one. Pi also reads `CLAUDE.md`. There is no `@include` syntax, so a file that must load is pasted in rather than referenced.

`/setup-pstack` on Pi writes the override sheet to `~/.pi/agent/pstack-models.md` with `provider/model` IDs. Paste its contents into `~/.pi/agent/AGENTS.md` to load it.
