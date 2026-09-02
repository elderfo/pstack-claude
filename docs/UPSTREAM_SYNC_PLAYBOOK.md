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

Fifteen files carry a **Platform note** that the merge must re-apply: `poteto-mode/SKILL.md` (the Platform Adaptation paragraph) plus the `SKILL.md` of `architect`, `arena`, `automate-me`, `babysit`, `create-verification-skill`, `how`, `interrogate`, `maintain-verification-skill`, `no-comments`, `reflect`, `setup-pstack`, `swarm`, `teach`, and `why`. Each note names the Claude primitives that skill uses and points at both runtime maps. Leave every `## Models` section alone; the generator rewrites them from `plugins/pstack/models.json`.

## 4. Resolve every denylist hit

A denylist token in a written file fails the run with the file, line, and hint. Either add a mechanical rule to `tools/substitutions.json`, or rewrite the sentence by hand when the Cursor-ism has no one-to-one Claude equivalent.

A new Cursor primitive is also a new row in both runtime maps. Add it to `plugins/pstack/skills/poteto-mode/references/codex-tools.md` and `plugins/pstack/skills/poteto-mode/references/pi-tools.md` in the same change, so neither runtime is left guessing.

## 5. Wire up anything new upstream added

- **A new public skill** needs a `menu-description` frontmatter line and a name in `README_COMMAND_ORDER` in `tools/generate.mjs`. The generator then emits its Codex prompt stub, its Pi prompt template, and its README command-table row. It fails by name if either input is missing.
- **A new `principle-*` leaf** needs `user-invocable: false` in its frontmatter, never `disable-model-invocation`. The latter makes Claude Code's Skill tool refuse the invocation and breaks the mandate.
- **A change to the routing mandate** is two edits, not one: `plugins/pstack/hooks/session-start-context.md` for Claude Code and `plugins/pstack/.pi-plugin/session-start-context.md` for Pi. The wording differs per runtime, so they are hand-maintained copies rather than generated ones.
- **A new named agent** goes in `plugins/pstack/agents/`, then into `PORTABLE_ASSETS` (so a skills-only install carries it) and `PI_AGENTS` (so Pi gets a pi-subagents definition) in `tools/generate.mjs`.

## 6. Regenerate and check

```shell
bun tools/generate.mjs
bun test tests/
bash tests/skill-collision-repro.sh
node tools/validate-skills.mjs plugins/pstack/skills
```

Run the generator twice. The second run must print only `ok:` lines, which is what proves it is idempotent. The invariant script's last leg is behavioral and needs the `claude` CLI plus API access, so run it unflagged at least once here rather than only under `SKIP_BEHAVIORAL=1`.

## 7. Smoke each runtime

```shell
claude --plugin-dir plugins/pstack           # Claude Code
pi -e "$PWD" --no-session -p "list your skills"  # Pi
```

For Codex, use the symlink install from the README and confirm the skills list as `pstack:<name>`. In each runtime, confirm one skill loads and the mandate is present. A build that generates cleanly but does not load is still broken.

## 8. Release

Write the `CHANGES.md` entry from the sync report, naming what upstream changed and what the port had to translate. Bump the root `VERSION`, then run the generator again so the manifests and `package.json` restamp. Open one pull request per concern; a sync and an unrelated fix in one diff means neither gets reviewed properly.

## Port-owned surfaces the sync must preserve

| Surface | File(s) | Owner |
|---|---|---|
| Platform notes and the Platform Adaptation paragraph | 15 `SKILL.md` files listed in step 3 | Hand |
| Runtime maps | `poteto-mode/references/codex-tools.md`, `poteto-mode/references/pi-tools.md` | Hand, except the `## Model names` section |
| Routing mandate, one copy per injecting runtime | `hooks/session-start-context.md`, `.pi-plugin/session-start-context.md` | Hand |
| Cursor-to-Claude substitutions and the denylist | `tools/substitutions.json` | Hand |
| Per-skill substitution audit | `CHANGES.md` | Hand |
| Model policy | `plugins/pstack/models.json` | Hand (source), generator (every stamped copy) |
| Manifest versions | `.claude-plugin/`, `.codex-plugin/`, marketplace manifests, root `package.json` | Generator, from `VERSION` |
| Codex prompt stubs | `.codex-plugin/prompts/*.md` | Generator, from `menu-description` |
| Pi prompt templates | `.pi-plugin/prompts/*.md` | Generator, from `menu-description` |
| Pi agent definitions | `.pi-plugin/agents/*.md` | Generator, from `plugins/pstack/agents/` |
| Portable assets in the skills-only boundary | `poteto-mode/references/agents/`, `poteto-mode/references/licenses/` | Generator, from `PORTABLE_ASSETS` |
| README slash-command table and Models sections | `README.md`, every model-consuming `SKILL.md` | Generator |
