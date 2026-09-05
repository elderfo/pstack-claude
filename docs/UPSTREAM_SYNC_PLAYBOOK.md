# Upstream sync playbook

How to move this port to a new upstream `pstack` (or `cursor-team-kit`) revision while the Claude Code, Codex, and Pi builds stay in step. Follow the steps in order. Each one names the check that proves it worked.

Read [CONTRIBUTING.md](../CONTRIBUTING.md) first for the sync boundary. Upstream owns skill content; this port owns the translation of Cursor primitives and everything in the table at the end of this file.

## 1. Pick the target revision

Read `tools/upstream.json` for the current pin per component. Pick the upstream SHA you are syncing to and read upstream's own diff between the two, so you know which skills changed before any tool rewrites them.

## 2. Run the sync tool

```shell
bun tools/sync.mjs pstack <new-upstream-sha>
```

The tool applies `tools/substitutions.json`, writes files whose only local differences came from upstream, and reports the files carrying port-specific edits. Read that report before touching anything. The pin advances only when the run finishes clean.

## 3. Merge the port-edited files by hand

Every file the report lists as port-edited needs a manual merge. Take upstream's new content and re-apply the port's edits on top, rather than the reverse.

Preserve the runtime-neutral boundary while merging. Translate upstream tool calls, dispatch fields, model IDs, paths, transcript assumptions, and built-in workflows into capabilities from `poteto-mode/references/runtime-contract.md`. Put concrete execution details in the matching runtime adapter. Do not restore per-skill Platform notes. Leave every `## Models` section alone because the generator rewrites it from `plugins/pstack/models.json`. Keep model identity, effort, and fresh/fork context separate; validate references for all runtimes and never infer account access from a catalog.

## 4. Resolve every denylist hit

A denylist token in a written file fails the run with the file, line, and hint. Either add a mechanical rule to `tools/substitutions.json`, or rewrite the sentence by hand when the Cursor-ism has no one-to-one Claude equivalent.

Preserve native inheritance precedence, explicit-only authoring metadata, report-only comment proposals, scoped transcript schemas and retained-child reconciliation. Do not restore user-wide transcript scans or unknown-activity safe buckets.

A new upstream primitive needs a neutral capability in `runtime-contract.md` and a mapping in each of `claude-tools.md`, `codex-tools.md`, and `pi-tools.md`. Add all four in the same change so no runtime is left guessing. Extend the runtime-language rules in `tools/generate.mjs` when the new primitive introduces a leak pattern the gate does not recognize.

## 5. Wire up anything new upstream added

- **A new public skill** needs a `menu-description` frontmatter line and a name in `README_COMMAND_ORDER` in `tools/generate.mjs`. The generator then emits its Codex prompt stub, its Pi prompt template, and its README command-table row. It fails by name if either input is missing.
- **A new `principle-*` leaf** needs `user-invocable: false` in its frontmatter, never `disable-model-invocation`. The latter makes Claude Code's Skill tool refuse the invocation and breaks the mandate.
- **A change to the routing mandate** is two edits, not one: `plugins/pstack/hooks/session-start-context.md` for Claude Code and `plugins/pstack/.pi-plugin/session-start-context.md` for Pi. The wording differs per runtime, so they are hand-maintained copies rather than generated ones.
- **A new named agent** goes in `plugins/pstack/agents/`, then into `PORTABLE_ASSETS` (skills-only prompt) and `PI_AGENTS` (Pi definition and optional Codex native TOML template) in `tools/generate.mjs`. Templates are not installed automatically. Verify effective registered names, permissions and tool providers before dispatch.

## 6. Regenerate and check

```shell
bun tools/generate.mjs
bun test tests/
bash tests/skill-collision-repro.sh
node tools/validate-skills.mjs plugins/pstack/skills
```

Run the generator twice. The second run must print only `ok:` lines, which is what proves it is idempotent. The invariant script's last leg is behavioral and needs the `claude` CLI plus API access, so run it unflagged at least once here rather than only under `SKIP_BEHAVIORAL=1`.

## 7. Smoke each runtime only with operator approval

Static tests and a no-write second generation are necessary, not a native smoke. On an approved disposable workspace and existing authenticated accounts, exercise skill loading, native named/general delegation, model aliases against agent pins, supported effort and context, and retained-child continuation. For Pi also verify background service readiness/teardown and required extension tools. For transcript tests use synthetic fixtures; do not scan real unrelated stores. Record runtime versions, access mode, commands, exact results and evidence gaps. If CLI inference or personal configuration changes are prohibited, mark these checks not run, rather than improvising a fallback.

Claude and Pi have routing mandates. Codex supports plugin hooks but pstack explicitly selects an empty `.codex-plugin/hooks.json`; do not replace it with the Claude SessionStart schema or rely on default auto-loading of `hooks/hooks.json`. Current Codex subagents are enabled by default; use native `[agents]` controls, not a mandatory legacy feature flag. Verify installed agent templates through native discovery. Local Codex/ChatGPT desktop and ChatGPT web/Work are distinct installation/access surfaces; do not imply a web smoke from a local result.

## 8. Release

Write the `CHANGES.md` entry from the sync report, naming what upstream changed and what the port had to translate. Bump the root `VERSION`, then run the generator again so the manifests and `package.json` restamp. Open one pull request per concern; a sync and an unrelated fix in one diff means neither gets reviewed properly.

## Port-owned surfaces the sync must preserve

| Surface | File(s) | Owner |
|---|---|---|
| Runtime-neutral capability contract | `poteto-mode/references/runtime-contract.md` | Hand |
| Runtime adapters | `poteto-mode/references/claude-tools.md`, `poteto-mode/references/codex-tools.md`, `poteto-mode/references/pi-tools.md` | Hand, except generated `## Model names` sections |
| Runtime-neutrality rules | `tools/generate.mjs`, `tests/agent-skills.test.mjs` | Hand |
| Routing mandate, one copy per injecting runtime | `hooks/session-start-context.md`, `.pi-plugin/session-start-context.md` | Hand |
| Cursor-to-Claude substitutions and the denylist | `tools/substitutions.json` | Hand |
| Per-skill substitution audit | `CHANGES.md` | Hand |
| Model policy | `plugins/pstack/models.json` | Hand (source), generator (every stamped copy) |
| Manifest versions | `.claude-plugin/`, `.codex-plugin/`, marketplace manifests, root `package.json` | Generator, from `VERSION` |
| Codex prompt stubs | `.codex-plugin/prompts/*.md` | Generator, from `menu-description` |
| Pi prompt templates | `.pi-plugin/prompts/*.md` | Generator, from `menu-description` |
| Pi definitions / optional Codex agent templates | `.pi-plugin/agents/*.md`, `.codex-plugin/agent-templates/*.toml` | Generator, from `plugins/pstack/agents/` |
| Explicit Codex hook ownership | `.codex-plugin/plugin.json`, `.codex-plugin/hooks.json` | Hand; empty until native lifecycle is separately verified |
| Deterministic native policy and scoped session evidence | `poteto-mode/scripts/runtime-policy.mjs`, `session-evidence.mjs`, `tests/*policy*`, `tests/*evidence*`, `tests/fixtures/native-runtime/` | Hand; synthetic fixtures only |
| Worktree activity safety | `poteto-mode/scripts/worktree-audit.sh`, `tests/worktree-audit.test.mjs` | Hand; unknown activity never safe |
| Portable assets in the skills-only boundary | `poteto-mode/references/agents/`, `poteto-mode/references/licenses/` | Generator, from `PORTABLE_ASSETS` |
| README slash-command table and Models sections | `README.md`, every model-consuming `SKILL.md` | Generator |
