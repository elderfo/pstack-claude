---
name: setup-pstack
description: Configure which models pstack uses per role. Detects models available in the active runtime and writes its per-role override sheet. Use for /setup-pstack, "configure pstack models", or changing pstack's model choices.
menu-description: configure pstack per-role model choices
---

# Setup pstack

Read the [runtime contract](../poteto-mode/references/runtime-contract.md) and the active runtime adapter. The adapter defines model discovery, the model override sheet, and how global instructions load that sheet.

## Steps

### 1. Detect available models

Use the runtime's model registry or model-list command. Separate discovered IDs from confirmed account access. Catalog presence alone is not a live inference test; do not launch probes without approval. `inherit-parent` and `auto` request the parent's model, but the adapter must validate lowering against effective agent defaults before promising inheritance.

### 2. Load current state

Read the runtime model override sheet when it exists. Treat its values as the current choices. Otherwise resolve the profiles in [Models](#models) through the active runtime adapter. Before writing either file, inspect the selected instructions file for an unmarked legacy sheet headed `# pstack model configuration`. If one exists outside a managed block, stop for reconciliation, even if the user removed role lines. Do not infer its bounds or append a new configuration.

### 3. Map and confirm

Show every role with its current model. Mark an unavailable concrete ID as needing a choice. Request a choice between accepting the current map and changing named roles. Offer available model IDs plus `inherit-parent` and `auto`.

A panel role contains a list. Run one child per list entry, including aliases, so list length sets panel size. `arena cross-judge pool` is also a list, but Arena selects one entry from a different model family than the parent when possible. `swarm workers` is the default for each worker unless a race names a model per arm.

### 4. Validate

Require concrete IDs in the detected set, recording unverified account access separately. Validate aliases against native precedence and validate any effort against the selected model/client. Resolve default panels jointly for distinct models where possible; preserve intentional duplicate overrides and report reduced diversity. If a choice is unsupported, request another before writing.

### 5. Write the override sheet

Write the runtime model override sheet with the shape below. Replace the profile names with concrete model IDs resolved by the active runtime adapter. Overwrite the whole file so reruns stay idempotent.

```markdown
# pstack model configuration

Per-role model overrides for pstack skills. Each pstack SKILL.md names its defaults in a Models section; the values here override those defaults. Delete a line to fall back to the skill default. A value of `inherit-parent` or `auto` runs that role on the parent session's model; an alias entry in a panel list still counts toward that panel's fan-out.

feature, refactoring: primary
bug-fix: strongest
perf-issue: strongest
hillclimb: strongest
judgment and prose: primary
strongest judgment: strongest
how explorer: primary
how explainer: primary
how critics: primary, strongest, balanced
why investigators: primary
why synthesizer: primary
reflect tooling: primary
reflect judgment, divergent, synthesizer: primary
arena runners: primary, strongest, balanced
arena cross-judge pool: primary, strongest, balanced
swarm workers: primary
architect runners: primary, strongest, balanced
interrogate reviewers: primary, strongest, balanced
```

Model-role lines contain concrete IDs or pstack aliases, never execution-profile names such as `general` or a native agent configuration blob. Optional separate lines `<role> effort: <native-level>` and `<role> context: fresh|fork` carry orthogonal controls, validated and lowered by the adapter. For a heterogeneous panel, an effort must be supported by every selected model or left inherited; do not silently clamp unsupported values. Omitted effort/context keeps the adapter's task-aware default, not a highest-effort mandate.

### 6. Load the sheet

Use the adapter's load mechanism to add the sheet to global instructions. If the runtime cannot include another file, replace one managed block delimited by `<!-- pstack-models:start -->` and `<!-- pstack-models:end -->` in its global instructions. Preserve all content outside the block; reject duplicate/unmatched markers or an unmarked legacy sheet outside the block for reconciliation. Never append a second copy on rerun. Preserve an existing project-scoped choice when the user already made one.

### 7. Confirm

Tell the user where the override sheet was written, how the runtime loads it, and whether panel diversity was reduced. Rerunning this skill updates the same file.

## Models

Runtime-neutral profiles, stamped from `plugins/pstack/models.json`. The active runtime adapter resolves them to usable model IDs.

- Profiles: `primary` means default model for implementation, explanation, and prose; `strongest` means highest-judgment model for difficult or adversarial work; `balanced` means a distinct model for panel diversity and lower-cost work.
- Default panel: `primary`, `strongest`, `balanced`
- Single-role default: `primary`
