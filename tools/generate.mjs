#!/usr/bin/env bun
// Stamps facts that live in one source file into every file that carries a
// copy, and validates cross-file contracts. Idempotent; run it after editing
// a source of truth. CI contract: `bun tools/generate.mjs && git diff --exit-code`,
// so a stale committed copy fails the build instead of shipping.
//
// Sources of truth:
//   VERSION  -> the "version" field in the three plugin manifests and the root
//   package.json (the Pi package manifest)
//   CHANGES.md must carry a heading for the current VERSION (release completeness)
//   each skill's frontmatter (name + description) defines the shared Agent
//   Skills boundary consumed natively by Codex, Prime, opencode, and Gemini CLI
//   each public skill's menu-description
//     -> one prompt file per runtime adapter in PROMPT_ADAPTERS (Codex stubs in
//        .codex-plugin/prompts/, Pi templates in .pi-plugin/prompts/)
//     -> its row in README.md's "Slash commands" table
//   plugins/pstack/models.json (runtime-neutral role profiles plus concrete
//   runtime resolutions)
//     -> each model-consuming skill's "## Models" section
//     -> setup-pstack's override-sheet block and interrogate's reviewer table
//     -> the "## Model names" section of each runtime adapter
//   plugins/pstack/agents/{poteto-agent,comment-sicko}.md, LICENSE,
//   LICENSE-cursor-team-kit, and NOTICE-skills.md
//     -> portable copies under poteto-mode/references/{agents,licenses}/
//   plugins/pstack/agents/*.md listed in PI_AGENTS
//     -> pi-subagents agent definitions in .pi-plugin/agents/
//   Runtime API names, paths, and concrete model IDs may appear only in runtime
//   adapters; the scan below fails on leaks into shared workflow prose.
//
// Also validated: .agents/plugins/marketplace.json points at a real plugin
// directory whose Codex manifest name matches (it carries no version; Codex
// reads the version from .codex-plugin/plugin.json), and every path in the root
// package.json "pi" object exists.

import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  realpathSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, dirname, join, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { markdownFiles, pathIsInside, validateProsePaths, validateSkillsTree } from "./validate-skills.mjs";

const repo = join(dirname(fileURLToPath(import.meta.url)), "..");

const VERSIONED_MANIFESTS = [
  "package.json",
  ".claude-plugin/marketplace.json",
  "plugins/pstack/.claude-plugin/plugin.json",
  "plugins/pstack/.codex-plugin/plugin.json",
];

export const PORTABLE_ASSETS = [
  {
    source: "plugins/pstack/agents/poteto-agent.md",
    target: "poteto-mode/references/agents/poteto-agent.md",
  },
  {
    source: "plugins/pstack/agents/comment-sicko.md",
    target: "poteto-mode/references/agents/comment-sicko.md",
  },
  { source: "LICENSE", target: "poteto-mode/references/licenses/LICENSE" },
  {
    source: "LICENSE-cursor-team-kit",
    target: "poteto-mode/references/licenses/LICENSE-cursor-team-kit",
  },
  { source: "NOTICE-skills.md", target: "poteto-mode/references/licenses/NOTICE.md" },
];

const PORTABLE_OUTPUT_DIRS = [
  "poteto-mode/references/agents",
  "poteto-mode/references/licenses",
];

function resolveWithin(root, path) {
  const base = resolve(root);
  const resolved = resolve(base, path);
  if (!pathIsInside(base, resolved)) {
    throw new Error(`${path} resolves outside ${base}`);
  }
  return resolved;
}

export function syncPortableAssets(repoRoot, skillsRoot, { log = console.log } = {}) {
  mkdirSync(skillsRoot, { recursive: true });
  const realRepoRoot = realpathSync(repoRoot);
  const realSkillsRoot = realpathSync(skillsRoot);
  const expectedByDir = new Map(
    PORTABLE_OUTPUT_DIRS.map((dir) => [resolveWithin(skillsRoot, dir), new Set()]),
  );
  for (const dir of expectedByDir.keys()) {
    mkdirSync(dir, { recursive: true });
    if (!pathIsInside(realSkillsRoot, realpathSync(dir))) {
      throw new Error(`${relative(skillsRoot, dir)} resolves outside the skills tree through a symlink`);
    }
  }

  const prepared = PORTABLE_ASSETS.map((asset) => {
    const source = resolveWithin(repoRoot, asset.source);
    const target = resolveWithin(skillsRoot, asset.target);
    const targetDir = dirname(target);
    if (!pathIsInside(realRepoRoot, realpathSync(source))) {
      throw new Error(`${asset.source} resolves outside the repository through a symlink`);
    }
    const expected = expectedByDir.get(targetDir);
    if (!expected) throw new Error(`${asset.target} has no declared generated output directory`);
    expected.add(basename(target));
    if (existsSync(target) && lstatSync(target).isSymbolicLink()) {
      throw new Error(`${asset.target} is a symlink; refusing to overwrite it`);
    }
    return { label: asset.target, target, next: readFileSync(source, "utf8") };
  });

  let stamped = 0;
  let removed = 0;
  for (const { label, target, next } of prepared) {
    if (existsSync(target) && readFileSync(target, "utf8") === next) continue;
    writeFileSync(target, next);
    stamped += 1;
    log(`stamped: ${label}`);
  }

  for (const [dir, expected] of expectedByDir) {
    for (const entry of readdirSync(dir)) {
      if (expected.has(entry)) continue;
      rmSync(join(dir, entry), { recursive: true, force: true });
      removed += 1;
      log(`removed orphan: ${relative(skillsRoot, join(dir, entry))}`);
    }
  }

  return { stamped, removed, total: PORTABLE_ASSETS.length };
}

// Replace the manifest's single "version" value, preserving all formatting.
// Exactly one "version" field per manifest is a precondition: a second one
// (say, from a future nested object) would make the blind replace ambiguous,
// so fail loudly and force this function to grow a targeted path instead.
export function stampVersion(text, version, file) {
  const fields = text.match(/"version"\s*:\s*"[^"]*"/g) ?? [];
  if (fields.length !== 1) {
    throw new Error(`${file}: expected exactly 1 "version" field, found ${fields.length}`);
  }
  return text.replace(/("version"\s*:\s*)"[^"]*"/, `$1"${version}"`);
}

export function assertChangesHeading(changes, version) {
  const found = changes
    .split("\n")
    .some((line) => line === `## ${version}` || line.startsWith(`## ${version} `));
  if (!found) {
    throw new Error(`CHANGES.md has no "## ${version} - <title>" heading.`);
  }
  const malformed = changes.split("\n").filter((line) => /^## \d+/.test(line) && !/^## \d+\.\d+\.\d+ - .+/.test(line));
  if (malformed.length) throw new Error(`read "## <version> - <title>":\n${malformed.join("\n")}`);
}

export function validateCodexMarketplace(text, { expectedName, pathExists }) {
  const manifest = JSON.parse(text);
  const plugins = manifest.plugins ?? [];
  if (plugins.length !== 1) {
    throw new Error(`.agents/plugins/marketplace.json: expected 1 plugin entry, found ${plugins.length}`);
  }
  const [plugin] = plugins;
  if (plugin.name !== expectedName) {
    throw new Error(
      `.agents/plugins/marketplace.json: plugin name "${plugin.name}" != Codex manifest name "${expectedName}"`,
    );
  }
  const path = plugin.source?.path;
  if (!path || !pathExists(path)) {
    throw new Error(`.agents/plugins/marketplace.json: source.path "${path}" does not resolve to a directory`);
  }
}

// Single-line frontmatter lookup; returns undefined when the key is absent.
export function frontmatterValue(text, key) {
  const block = text.match(/^---\n([\s\S]*?)\n---/);
  if (!block) return undefined;
  const line = block[1].split("\n").find((l) => l.startsWith(`${key}: `));
  return line?.slice(key.length + 2);
}

// Validate the shared subset of the Agent Skills contract before deriving any
// runtime-specific views. Runtime-only frontmatter keys may be ignored by other
// consumers, but every skill needs a portable name and description.
export function agentSkills(skillsDir) {
  const skills = [];
  for (const entry of readdirSync(skillsDir).sort()) {
    const path = join(skillsDir, entry, "SKILL.md");
    if (!statSync(join(skillsDir, entry)).isDirectory() || !existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    const front = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    const name = frontmatterValue(text, "name");
    if (name !== entry) throw new Error(`${path}: frontmatter name "${name}" != directory "${entry}"`);
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || name.length > 64) {
      throw new Error(`${path}: frontmatter name "${name}" is not a portable Agent Skills name`);
    }
    const description = frontmatterValue(text, "description");
    if (!description) throw new Error(`${path}: skill has no description frontmatter`);
    if (description.length > 1024) {
      throw new Error(`${path}: description exceeds the portable Agent Skills limit of 1024 characters`);
    }
    skills.push({
      name,
      description,
      menu: frontmatterValue(text, "menu-description"),
      userInvocable: !front.split("\n").includes("user-invocable: false"),
    });
  }
  return skills;
}

// A public skill is any Agent Skill not marked user-invocable: false (the
// principle-* leaves). Each needs the one-liner rendered into the Codex slash
// menu and README command table.
export function publicSkills(skillsDir) {
  return agentSkills(skillsDir)
    .filter((skill) => skill.userInvocable)
    .map(({ name, menu }) => {
      if (!menu) {
        throw new Error(`${join(skillsDir, name, "SKILL.md")}: public skill has no menu-description`);
      }
      return { name, menu };
    });
}

// Derive the portable frontmatter shape used when syncing upstream skills.
// Body prose remains upstream text; runtime mappings stay in the adapters.
export function deriveSkill(file, text, models = loadModels()) {
  const skill = file.match(/(?:^|\/)skills\/([^/]+)\/SKILL\.md$/)?.[1];
  if (!skill) return text;
  const replacement = skill.startsWith("principle-") ? "\nuser-invocable: false\n" : "\n";
  let out = text.replace("\ndisable-model-invocation: true\n", replacement);
  if (skill !== "interrogate" && !out.includes("\n## Models\n") && (models.roles ?? []).some((role) => role.skill === skill)) {
    out = `${out.replace(/\n*$/, "\n\n")}## Models\n\n${modelsSection((models.roles ?? []).filter((role) => role.skill === skill))}\n`;
  }
  return out;
}

export function resolveModels(models) {
  return { ...models, roles: (models.roles ?? []).map((role) => ({
    ...role,
    models: role.models === "panel" ? models.panel : role.models,
  })) };
}

export function loadModels() {
  const raw = resolveModels(JSON.parse(readFileSync(join(repo, "plugins/pstack/models.json"), "utf8")));
  const claude = raw.runtimes?.claude;
  const codex = raw.runtimes?.codex;
  return {
    ...raw,
    available: raw.available ?? (claude?.available ?? []).map(({ label, id }) => ({ label, slug: id })),
    singleRoleDefault: raw.singleRoleDefault,
    codex: {
      singleRoleExample: codex?.singleRoleExample,
      strongestRoleExample: codex?.strongestRoleExample ?? "gpt-6-astra",
      panelQuad: codex?.panelQuad ?? codex?.panel,
    },
  };
}

export const section = (title) => (lines) => {
  const start = lines.findIndex((line) => line === `## ${title}`);
  if (start < 0) return null;
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  return [start + 1, end];
};

export const fenceUnder = (heading, language) => (lines) => {
  const start = lines.findIndex((line) => line.startsWith(heading));
  if (start < 0) return null;
  const open = lines.findIndex((line, index) => index > start && line === `\`\`\`${language}`);
  if (open < 0) return null;
  const close = lines.findIndex((line, index) => index > open && line === "```");
  return close < 0 ? null : [open + 1, close];
};

export const tableRows = (header, rowPrefix) => (lines) => {
  const start = lines.indexOf(header);
  if (start < 0) return null;
  let end = start + 2;
  while (end < lines.length && lines[end].startsWith(rowPrefix)) end++;
  return [start + 2, end];
};

export function regions(models) {
  const skills = new Set((models.roles ?? []).map((role) => role.skill));
  return [...skills].map((skill) => ({
    file: `plugins/pstack/skills/${skill}/SKILL.md`,
    locate: section("Models"),
    render: () => modelsSection((models.roles ?? []).filter((role) => role.skill === skill)),
  }));
}

export function applyRegions(file, text, models, { strict = true } = {}) {
  const lines = text.split("\n");
  for (const region of regions(models).filter((item) => item.file === file)) {
    const range = region.locate(lines);
    if (!range) {
      if (strict) throw new Error(`${file}: no anchor for the Models section to stamp`);
      continue;
    }
    lines.splice(range[0], range[1] - range[0], ...region.render().split("\n"));
  }
  return lines.join("\n");
}

export function strayModelSlugs(file, text, models) {
  const lines = text.split("\n");
  const owned = regions(models).filter((region) => region.file === file).map((region) => region.locate(lines)).filter(Boolean);
  const found = [];
  lines.forEach((line, index) => {
    if (!/claude-(?:opus|fable|sonnet|haiku)[0-9a-z.-]*/.test(line)) return;
    if (owned.some(([start, end]) => index >= start && index < end)) return;
    found.push(`${file}:${index + 1}: ${line.trim()}`);
  });
  return found;
}

export function validatePluginLayout(pluginRoot) {
  const skillsRoot = join(pluginRoot, "skills");
  if (existsSync(join(pluginRoot, "commands"))) throw new Error("plugins/pstack/commands/ exists");
  for (const file of markdownFiles(skillsRoot)) {
    const text = readFileSync(file, "utf8");
    const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
    if (frontmatter.includes("disable-model-invocation: true")) throw new Error(`${relative(pluginRoot, file)}: disable-model-invocation: true breaks`);
    const name = file.split("/").slice(-2, -1)[0];
    if (name.startsWith("principle-") && !frontmatter.includes("user-invocable: false")) {
      throw new Error(`${relative(pluginRoot, file)}: principle leaves carry user-invocable: false`);
    }
    const match = text.match(/subagent_type:\s*["']?([a-z0-9-]+)["']?/);
    if (match && existsSync(join(pluginRoot, "agents", `${match[1]}.md`))) {
      const line = text.slice(0, match.index).split("\n").length;
      throw new Error(`${relative(pluginRoot, file)}:${line}: subagent_type: "${match[1]}" (use "pstack:${match[1]}")`);
    }
  }
}

export function readmeCommands(readme, skillNames) {
  const start = readme.split("\n").findIndex((line) => line === "| command | use it when |");
  if (start < 0) throw new Error("table header not found");
  const rows = [];
  const lines = readme.split("\n");
  for (let i = start + 2; i < lines.length && lines[i].startsWith("|"); i++) {
    const match = lines[i].match(/^\| `\/([^`]+)` \| (.+) \|$/);
    if (!match) throw new Error(`row ${i - start - 1} is not a slash-command row`);
    rows.push({ name: match[1], menu: match[2] });
  }
  const names = skillNames.map((skill) => typeof skill === "string" ? skill : skill.name);
  const expected = new Set(names);
  const actual = new Set(rows.map((row) => row.name));
  const missing = names.filter((name) => !actual.has(name));
  const extra = rows.map((row) => row.name).filter((name) => !expected.has(name));
  if (missing.length || extra.length) {
    throw new Error(`row without a skill: ${extra.join(", ")}; skill without a row: ${missing.join(", ")}`);
  }
  return rows;
}

export function promptStub({ name, menu }) {
  return `---\nname: ${name}\ndescription: ${menu}\ndisable-model-invocation: true\n---\n\nInvoke the \`${name}\` skill and follow it.\n`;
}

// Pi has no Skill tool, so the template tells the model to read the SKILL.md.
// The trailing $@ expands to nothing when the command is typed bare.
export function piPromptTemplate({ name, menu }) {
  return `---\ndescription: ${menu}\nargument-hint: "[instructions]"\n---\n\nRead the \`${name}\` skill's SKILL.md in full and follow it. $@\n`;
}

// One row per runtime that gets generated prompt files. Adding a runtime is a
// row here, not a second copy of the stamp-and-prune loop in main().
export const PROMPT_ADAPTERS = [
  {
    runtime: "Codex",
    dir: "plugins/pstack/.codex-plugin/prompts",
    render: promptStub,
  },
  {
    runtime: "Pi",
    dir: "plugins/pstack/.pi-plugin/prompts",
    render: piPromptTemplate,
  },
];

// Bare package agent names; adapters still verify discovery and user overrides.
// comment-sicko is report-only by prompt, not sandboxed: bash can mutate.
// Its allowlist carries no edit or write; poteto-agent matches
// the bundled worker, including contact_supervisor for escalation to the parent.
export const PI_AGENTS = [
  {
    source: "plugins/pstack/agents/poteto-agent.md",
    tools: "read, grep, find, ls, bash, edit, write, contact_supervisor",
  },
  {
    source: "plugins/pstack/agents/comment-sicko.md",
    tools: "read, grep, find, ls, bash",
  },
];

// Keep skill/repo context; model and thinking remain host-selected, not pinned here.
const PI_AGENT_KEYS = ["inheritProjectContext: true", "inheritSkills: true"];

export function piAgentDefinition(sourceText, { tools }) {
  const parsed = sourceText.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
  if (!parsed) throw new Error("agent definition has no frontmatter block");
  const [, front, body] = parsed;
  const lines = front.split("\n");
  const carried = ["name", "description"].map((key) => {
    const matches = lines.filter((line) => line.startsWith(`${key}: `));
    if (matches.length !== 1) {
      throw new Error(`agent frontmatter needs exactly one ${key} line, found ${matches.length}`);
    }
    return matches[0];
  });
  return ["---", ...carried, `tools: ${tools}`, ...PI_AGENT_KEYS, "---", body].join("\n");
}

export function codexAgentTemplate(sourceText, { readOnly = false } = {}) {
  const name = frontmatterValue(sourceText, "name");
  const description = frontmatterValue(sourceText, "description");
  const body = sourceText.replace(/^---\n[\s\S]*?\n---\n/, "").trim();
  if (!name || !description) throw new Error("native agent needs name and description");
  return `name = ${JSON.stringify(name)}\ndescription = ${JSON.stringify(description)}\nsandbox_mode = "${readOnly ? "read-only" : "workspace-write"}"\ndeveloper_instructions = ${JSON.stringify(body)}\n`;
}

export function validateCodexHooks(manifestText, { read }) {
  const manifest = JSON.parse(manifestText);
  if (manifest.hooks !== "./.codex-plugin/hooks.json") throw new Error("Codex must explicitly own its native hook path");
  const hooks = JSON.parse(read(manifest.hooks));
  if (!hooks.hooks || Object.keys(hooks.hooks).length) throw new Error("Codex hooks must remain explicitly empty until native lifecycle is verified");
}

const code = (s) => `\`${s}\``;
const codeList = (models) => models.map(code).join(", ");

// Replace the body of a "## <title>" section (everything up to the next "## "
// heading or EOF). Throws when the heading is absent — a Models section is a
// structural anchor, not an optional nicety.
export function replaceSection(text, title, body, file) {
  const lines = text.split("\n");
  const start = lines.indexOf(`## ${title}`);
  if (start === -1) throw new Error(`${file}: no "## ${title}" section to stamp`);
  let end = start + 1;
  while (end < lines.length && !lines[end].startsWith("## ")) end++;
  lines.splice(start + 1, end - start - 1, "", ...body.split("\n"), "");
  return lines.join("\n");
}

export function validateModelPolicy(models) {
  const profiles = new Set(Object.keys(models.profiles ?? {}));
  if (profiles.size === 0) throw new Error("models.json: profiles must not be empty");
  const aliases = new Set(["inherit-parent", "auto"]);
  for (const role of models.roles ?? []) {
    if (!role.role || !role.skill || !(role.models === "panel" || (Array.isArray(role.models) && role.models.length > 0))) {
      throw new Error("models.json: every role needs role, skill, and at least one model profile");
    }
    for (const profile of role.models === "panel" ? models.panel : role.models) {
      if (!profiles.has(profile) && !aliases.has(profile)) {
        throw new Error(`models.json: role "${role.role}" references unknown profile "${profile}"`);
      }
    }
  }
  for (const profile of [models.singleRoleDefault, ...(models.panel ?? [])]) {
    if (!profiles.has(profile)) throw new Error(`models.json: unknown default profile "${profile}"`);
  }
  for (const runtime of ["claude", "codex", "pi"]) {
    const config = models.runtimes?.[runtime];
    if (!config) throw new Error(`models.json: missing ${runtime} runtime`);
    for (const profile of profiles) {
      if (!config.profiles?.[profile]) throw new Error(`models.json: ${runtime} adapter does not resolve "${profile}"`);
    }
    for (const key of Object.keys(config.profiles)) {
      if (!profiles.has(key)) throw new Error(`models.json: ${runtime} references unknown profile "${key}"`);
    }
    if (runtime === "claude") {
      const known = new Set((config.available ?? []).map(({ id }) => id));
      for (const id of [...Object.values(config.profiles), ...known]) {
        if (!/^claude-[a-z0-9.-]+$/.test(id) || !known.has(id)) throw new Error(`models.json: invalid Claude reference ${id}`);
      }
    } else {
      for (const selector of Object.values(config.profiles)) {
        if (!["active", "highest-judgment", "distinct"].includes(selector)) throw new Error(`models.json: invalid ${runtime} selector ${selector}`);
      }
      const examples = runtime === "pi" ? config.crossVendorPanel : config.panel;
      if (!Array.isArray(examples) || !examples.length) throw new Error(`models.json: missing ${runtime} examples`);
      const pattern = runtime === "pi" ? /^[a-z0-9-]+\/[a-z0-9][a-z0-9./-]*$/ : /^gpt-[a-z0-9.-]+$/;
      for (const id of [config.singleRoleExample, ...examples]) {
        if (typeof id !== "string" || !pattern.test(id)) throw new Error(`models.json: invalid ${runtime} model reference ${id}`);
      }
    }
  }
}

export function modelsSection(roles) {
  const bullets = roles.map((r) => `- ${r.role}: ${codeList(r.models)}`).join("\n");
  return (
    "Role defaults, stamped from `plugins/pstack/models.json`. " +
    "Resolve each profile through the active runtime adapter. A matching role in the runtime model override sheet wins; see `/setup-pstack`.\n\n" +
    bullets
  );
}

export function setupModelsSection(models) {
  const profiles = Object.entries(models.profiles)
    .map(([name, description]) => `${code(name)} means ${description.toLowerCase()}`)
    .join("; ");
  return (
    "Runtime-neutral profiles, stamped from `plugins/pstack/models.json`. The active runtime adapter resolves them to usable model IDs.\n\n" +
    `- Profiles: ${profiles}.\n` +
    `- Default panel: ${codeList(models.panel)}\n` +
    `- Single-role default: ${code(models.singleRoleDefault)}`
  );
}

// The override sheet the setup skill writes for users. The preamble is fixed;
// the role rows come from models.json.
export function overrideSheetBlock(models) {
  const rows = models.roles.map((r) => `${r.role}: ${r.models.join(", ")}`).join("\n");
  return (
    "# pstack model configuration\n\n" +
    "Per-role model overrides for pstack skills. Each pstack SKILL.md names its defaults in a Models section; " +
    "the values here override those defaults. Delete a line to fall back to the skill default. " +
    "A value of `inherit-parent` or `auto` runs that role on the parent session's model; " +
    "an alias entry in a panel list still counts toward that panel's fan-out.\n\n" +
    rows
  );
}

export function stampOverrideSheet(text, models, file) {
  const lines = text.split("\n");
  const step = lines.findIndex((l) => l.startsWith("### 5. Write the override sheet"));
  if (step === -1) throw new Error(`${file}: no "### 5. Write the override sheet" heading`);
  const open = lines.indexOf("```markdown", step);
  if (open === -1) throw new Error(`${file}: no \`\`\`markdown fence under step 5`);
  const close = lines.indexOf("```", open + 1);
  if (close === -1) throw new Error(`${file}: unclosed fence under step 5`);
  lines.splice(open + 1, close - open - 1, overrideSheetBlock(models));
  return lines.join("\n");
}

export function stampReviewerTable(text, models, file) {
  const lines = text.split("\n");
  const header = lines.indexOf("| Subagent | Default model |");
  if (header === -1) throw new Error(`${file}: no reviewer table header`);
  let end = header + 2;
  while (end < lines.length && lines[end].startsWith("| Reviewer ")) end++;
  const reviewers = models.roles.find((r) => r.role === "interrogate reviewers").models;
  const rows = reviewers.map((m, i) => `| Reviewer ${String.fromCharCode(65 + i)} | ${code(m)} |`);
  lines.splice(header + 2, end - header - 2, ...rows);
  return lines.join("\n");
}

export function claudeModelNamesSection(models) {
  const runtime = models.runtimes.claude;
  const profileRows = Object.entries(runtime.profiles)
    .map(([profile, id]) => `- ${code(profile)}: ${code(id)}.`)
    .join("\n");
  const available = runtime.available.map((m) => `${m.label} (${code(m.id)})`).join(", ");
  return (
    "Shared skills name model profiles. Resolve them to Claude model IDs as follows:\n\n" +
    `${profileRows}\n\nDocumented model examples, not an access guarantee: ${available}. ` +
    "`/setup-pstack` checks current discovery and records account-access uncertainty separately."
  );
}

export function codexModelNamesSection(models) {
  const runtime = models.runtimes.codex;
  return (
    "Shared skills name model profiles. Resolve `primary` to your main Codex model, `strongest` to the " +
    "highest-judgment model available, and `balanced` to a distinct model for panel diversity.\n\n" +
    `- Single-model example: ${code(runtime.singleRoleExample)}.\n` +
    `- Diverse panel example: ${codeList(runtime.panel)}.\n\n` +
    "Resolve default panels jointly to distinct discovered concrete IDs, preserve explicit duplicates, and disclose reduced diversity. Effort variation is not model diversity. `/setup-pstack` writes concrete Codex model IDs."
  );
}

export function piModelNamesSection(models) {
  const runtime = models.runtimes.pi;
  return (
    "Shared skills name model profiles. Resolve `primary` to the active or preferred Pi model, `strongest` " +
    "to the highest-judgment configured model, and `balanced` to a distinct provider or model for panel diversity.\n\n" +
    `- Single-model example: ${code(runtime.singleRoleExample)}.\n` +
    `- Cross-provider panel example: ${codeList(runtime.crossVendorPanel)}.\n` +
    "- Pi model IDs use `provider/model` with an optional thinking-level suffix.\n\n" +
    "Use only configured models and resolve panels jointly. Two provider routes to the same model are not distinct model judgments. Prefer distinct models, preserve explicit duplicates and disclose reduced diversity."
  );
}

// Pi reads the root package.json. A path typo there is silent (the package
// installs, the extension or the agents just never load), and so is a dropped
// key (the generator keeps stamping files Pi never reads), so require every
// output the generator writes to be declared and every declared path to exist.
export const PI_MANIFEST_OUTPUTS = [
  ["extensions", "./plugins/pstack/.pi-plugin/extensions/pstack.ts"],
  ["prompts", "./plugins/pstack/.pi-plugin/prompts"],
  ["subagents.agents", "./plugins/pstack/.pi-plugin/agents"],
];

export function validatePiManifest(text, { pathExists }) {
  const manifest = JSON.parse(text);
  if (!(manifest.keywords ?? []).includes("pi-package")) {
    throw new Error('package.json: "keywords" must include "pi-package" or Pi ignores the package');
  }
  const pi = manifest.pi ?? {};
  const skills = pi.skills ?? [];
  const sharedTree = ["./plugins/pstack/skills"];
  if (JSON.stringify(skills) !== JSON.stringify(sharedTree)) {
    throw new Error(
      `package.json: "pi.skills" must be ${JSON.stringify(sharedTree)} (the one shared Agent Skills tree), ` +
        `found ${JSON.stringify(skills)}`,
    );
  }
  const entries = (key) => (key === "subagents.agents" ? pi.subagents?.agents : pi[key]) ?? [];
  for (const [key, output] of PI_MANIFEST_OUTPUTS) {
    if (!entries(key).includes(output)) {
      throw new Error(`package.json: "pi.${key}" must list ${output}, which the generator writes`);
    }
  }
  const declared = [...skills, ...PI_MANIFEST_OUTPUTS.flatMap(([key]) => entries(key))];
  const missing = declared.filter((path) => !pathExists(path));
  if (missing.length) {
    throw new Error(`package.json: "pi" paths that do not exist: ${missing.join(", ")}`);
  }
}

const RUNTIME_PROSE_RULES = [
  ["Claude Code", /\bClaude Code\b/i],
  ["runtime config path", /(?:~\/)?\.(?:claude|codex|pi)\/|\b(?:CLAUDE|AGENTS)\.md\b/],
  ["concrete Claude model", /claude-(?:opus|fable|sonnet|haiku)[0-9a-z.-]*/i],
  ["concrete non-Claude model", /\b(?:gpt-\d[0-9a-z.-]*|gemini-\d[0-9a-z.-]*|codestral(?:-[0-9a-z.-]+)?|(?:openai|google|mistral)\/[0-9a-z.-]+)\b/i],
  ["Claude tool name", /`(?:Agent|Skill)`|\bAskUserQuestion\b/],
  ["Claude dispatch field", /\b(?:subagent_type|run_in_background)\b/],
  ["Claude MCP name", /\bmcp__[a-z0-9_]+/i],
  ["Codex dispatch field", /\bspawn_agent\b/],
  ["runtime-specific authoring skill", /\bplugin-dev:skill-development\b/],
  ["runtime-specific built-in workflow", /\/loop\b|\bloop`? skill\b|`(?:run|verify)` skill|the `verify`|`run` for CLIs|`verify` for UIs/],
  ["runtime-specific invocation field", /\bdisable-model-invocation\b/],
  ["runtime-specific transcript schema", /current-workspace transcript[^\n]*\.jsonl\b/i],
];

const RUNTIME_ADAPTER_PATHS = new Set([
  "poteto-mode/references/claude-tools.md",
  "poteto-mode/references/codex-tools.md",
  "poteto-mode/references/pi-tools.md",
]);

const ADAPTER_REFERENCE_EXCEPTIONS = {
  "poteto-mode/references/codex-tools.md": [
    { id: "gpt-5.4", context: /(?<reference>GPT-5\.4) retired from Codex ChatGPT sign-in/dg, reason: "Documents retired sign-in access, not a dispatch default." },
  ],
  "poteto-mode/references/pi-tools.md": [
    { id: "openai-codex/gpt-6-astra", context: /Catalog entries, including `anthropic\/claude-fable-5-1`, `openai\/gpt-6-astra`, and `(?<reference>openai-codex\/gpt-6-astra)`, do not prove account access/dg, reason: "Explains a second provider route to the declared model without claiming access." },
  ],
};

function adapterModelReferences(path, text, models) {
  if (!models) throw new Error("model policy required to validate adapter references");
  const runtime = path.split("/").at(-1).replace("-tools.md", "");
  const config = models.runtimes[runtime];
  const allowed = new Set(runtime === "claude" ? config.available.map(({ id }) => id)
    : [config.singleRoleExample, ...(config.panel ?? config.crossVendorPanel)]);
  const references = /\b(?:[a-z][a-z0-9-]*\/)?(?:claude-(?:opus|fable|sonnet|haiku)|gpt-|gemini-|codestral|o[134])[0-9a-z._:-]*|\b(?:anthropic|openai(?:-codex)?|google|mistral|amazon-bedrock)\/[0-9a-z._:-]+/gi;
  return text.split("\n").flatMap((line, i) => [...line.matchAll(references)].flatMap((match) => {
    const [reference] = match;
    const id = reference.toLowerCase().replace(/[.,]+$/, "");
    if (allowed.has(id)) return [];
    const suffix = id.match(/^(.*):(off|minimal|low|medium|high|xhigh|max)$/);
    if (runtime === "pi" && suffix && allowed.has(suffix[1])) return [];
    if (ADAPTER_REFERENCE_EXCEPTIONS[path]?.some((entry) => entry.id === id &&
      [...line.matchAll(entry.context)].some(({ indices }) => {
        const [start, end] = indices.groups.reference;
        return start === match.index && end === match.index + reference.length;
      }))) return [];
    return [`${path}:${i + 1}: undeclared model reference ${reference}: ${line.trim()}`];
  }));
}

export function runtimeSpecificSkillProse(path, text, models) {
  path = path.replaceAll("\\", "/");
  if (path.includes("/references/licenses/")) return [];
  if (RUNTIME_ADAPTER_PATHS.has(path)) return adapterModelReferences(path, text, models);
  const lines = text.split("\n");
  const problems = [];
  lines.forEach((line, i) => {
    for (const [label, pattern] of RUNTIME_PROSE_RULES) {
      if (pattern.test(line)) problems.push(`${path}:${i + 1}: ${label}: ${line.trim()}`);
    }
  });
  return problems;
}

// Editorial ordering of the README "Slash commands" table. Set-checked against
// the public skills on every run: adding or retiring a skill without updating
// this list fails here by name.
const README_COMMAND_ORDER = [
  "poteto-mode", "how", "why", "architect", "arena", "interrogate",
  "automate-me", "reflect", "tdd", "typescript-best-practices", "teach",
  "swarm", "technical-writing", "bro", "figure-it-out", "show-me-your-work",
  "blast-radius", "recall", "setup-pstack", "unslop", "no-comments",
  "create-verification-skill", "maintain-verification-skill", "deslop",
  "babysit", "thermo-nuclear-code-quality-review", "make-pr-easy-to-review",
  "fix-ci", "fix-merge-conflicts", "get-pr-comments", "what-did-i-get-done",
];

export function renderReadmeTable(readme, skills) {
  const byName = new Map(skills.map((s) => [s.name, s]));
  const missing = README_COMMAND_ORDER.filter((n) => !byName.has(n));
  const extra = skills.filter((s) => !README_COMMAND_ORDER.includes(s.name)).map((s) => s.name);
  if (missing.length || extra.length) {
    throw new Error(
      `README_COMMAND_ORDER in tools/generate.mjs is out of sync with the public skills` +
        (missing.length ? `; listed but not a skill: ${missing.join(", ")}` : "") +
        (extra.length ? `; skill without a row: ${extra.join(", ")}` : ""),
    );
  }
  const lines = readme.split("\n");
  const header = lines.indexOf("| command | use it when |");
  if (header === -1) throw new Error('README.md: "| command | use it when |" table header not found');
  let end = header + 1;
  while (end < lines.length && lines[end].startsWith("|")) end++;
  const rows = README_COMMAND_ORDER.map((n) => `| \`/${n}\` | ${byName.get(n).menu} |`);
  lines.splice(header, end - header, "| command | use it when |", "| --- | --- |", ...rows);
  return lines.join("\n");
}

// hooks.json names commands as "${CLAUDE_PLUGIN_ROOT}/hooks/run-hook.cmd <script>";
// both the runner and the named script must exist in the plugin and be
// executable, or the SessionStart hook fails silently for every user.
export function validateHooks(hooksJson, { statOf }) {
  const problems = [];
  for (const [event, groups] of Object.entries(JSON.parse(hooksJson).hooks ?? {})) {
    for (const group of groups) {
      for (const hook of group.hooks ?? []) {
        const m = hook.command?.match(/\$\{CLAUDE_PLUGIN_ROOT\}\/([^"\s]+)"?(?:\s+(\S+))?/);
        if (!m) {
          problems.push(`${event}: command does not reference \${CLAUDE_PLUGIN_ROOT}: ${hook.command}`);
          continue;
        }
        const targets = [m[1]];
        if (m[1].endsWith("run-hook.cmd") && m[2]) targets.push(`hooks/${m[2]}`);
        for (const t of targets) {
          const st = statOf(t);
          if (!st) problems.push(`${event}: ${t} does not exist`);
          else if (m[1] === t && hook.command.trim().startsWith(`"${"${CLAUDE_PLUGIN_ROOT}"}`) && !(st.mode & 0o111)) {
            problems.push(`${event}: ${t} is not executable`);
          }
        }
      }
    }
  }
  if (problems.length) throw new Error(`hooks.json:\n  ${problems.join("\n  ")}`);
}

function main() {
  const version = readFileSync(join(repo, "VERSION"), "utf8").trim();
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    throw new Error(`VERSION must be MAJOR.MINOR.PATCH, got "${version}"`);
  }

  assertChangesHeading(readFileSync(join(repo, "CHANGES.md"), "utf8"), version);
  console.log(`ok: CHANGES.md has a heading for ${version}`);

  for (const file of VERSIONED_MANIFESTS) {
    const path = join(repo, file);
    const text = readFileSync(path, "utf8");
    const stamped = stampVersion(text, version, file);
    if (stamped === text) {
      console.log(`ok: ${file} @ ${version}`);
    } else {
      writeFileSync(path, stamped);
      console.log(`stamped: ${file} -> ${version}`);
    }
  }

  const rawModels = JSON.parse(readFileSync(join(repo, "plugins/pstack/models.json"), "utf8"));
  validateModelPolicy(rawModels);
  const models = resolveModels(rawModels);
  const skillsDir = join(repo, "plugins/pstack/skills");

  const bySkill = new Map();
  for (const r of models.roles) {
    if (!bySkill.has(r.skill)) bySkill.set(r.skill, []);
    bySkill.get(r.skill).push(r);
  }
  const stampFile = (path, next, label) => {
    if (existsSync(path) && readFileSync(path, "utf8") === next) return false;
    writeFileSync(path, next);
    console.log(`stamped: ${label}`);
    return true;
  };
  let modelStamps = 0;
  for (const [skill, roles] of bySkill) {
    const path = join(skillsDir, skill, "SKILL.md");
    let text = readFileSync(path, "utf8");
    if (skill === "interrogate") {
      text = stampReviewerTable(text, models, path);
    } else {
      text = replaceSection(text, "Models", modelsSection(roles), path);
    }
    if (stampFile(path, text, `skills/${skill}/SKILL.md (models)`)) modelStamps++;
  }
  {
    const path = join(skillsDir, "setup-pstack/SKILL.md");
    let text = readFileSync(path, "utf8");
    text = replaceSection(text, "Models", setupModelsSection(models), path);
    text = stampOverrideSheet(text, models, path);
    if (stampFile(path, text, "skills/setup-pstack/SKILL.md (models)")) modelStamps++;
  }
  for (const [file, render] of [
    ["claude-tools.md", claudeModelNamesSection],
    ["codex-tools.md", codexModelNamesSection],
    ["pi-tools.md", piModelNamesSection],
  ]) {
    const path = join(skillsDir, "poteto-mode/references", file);
    const text = readFileSync(path, "utf8");
    const next = replaceSection(text, "Model names", render(models), path);
    if (stampFile(path, next, `poteto-mode/references/${file} (models)`)) modelStamps++;
  }
  if (modelStamps === 0) console.log("ok: model-policy sections current");

  const runtimeLeaks = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir)) {
      if (entry === "node_modules" || entry === "scripts") continue;
      const full = join(dir, entry);
      if (statSync(full).isDirectory()) walk(full);
      else if (entry.endsWith(".md")) {
        const path = relative(skillsDir, full);
        runtimeLeaks.push(...runtimeSpecificSkillProse(path, readFileSync(full, "utf8"), models));
      }
    }
  };
  walk(skillsDir);
  if (runtimeLeaks.length) {
    throw new Error(
      "runtime prose or model-reference violations (use runtime-contract.md or declare adapter model policy):\n" +
        runtimeLeaks.join("\n"),
    );
  }
  console.log("ok: shared skill prose is runtime-neutral; adapter model references match policy");

  const skills = publicSkills(skillsDir);

  const expectedPrompts = new Set(skills.map((s) => `${s.name}.md`));
  for (const adapter of PROMPT_ADAPTERS) {
    const dir = join(repo, adapter.dir);
    mkdirSync(dir, { recursive: true });
    let changed = 0;
    for (const skill of skills) {
      const path = join(dir, `${skill.name}.md`);
      if (stampFile(path, adapter.render(skill), `${adapter.dir}/${skill.name}.md`)) changed++;
    }
    for (const file of readdirSync(dir)) {
      if (!file.endsWith(".md") || expectedPrompts.has(file)) continue;
      unlinkSync(join(dir, file));
      console.log(`removed orphan: ${adapter.dir}/${file}`);
    }
    if (changed === 0) console.log(`ok: ${skills.length} ${adapter.runtime} prompts current`);
  }

  const piAgentsDir = join(repo, "plugins/pstack/.pi-plugin/agents");
  mkdirSync(piAgentsDir, { recursive: true });
  let piAgentsChanged = 0;
  for (const agent of PI_AGENTS) {
    const name = basename(agent.source);
    const next = piAgentDefinition(readFileSync(join(repo, agent.source), "utf8"), agent);
    if (stampFile(join(piAgentsDir, name), next, `.pi-plugin/agents/${name}`)) piAgentsChanged++;
  }
  const expectedPiAgents = new Set(PI_AGENTS.map((a) => basename(a.source)));
  for (const file of readdirSync(piAgentsDir)) {
    if (!file.endsWith(".md") || expectedPiAgents.has(file)) continue;
    unlinkSync(join(piAgentsDir, file));
    console.log(`removed orphan: .pi-plugin/agents/${file}`);
  }
  if (piAgentsChanged === 0) console.log(`ok: ${PI_AGENTS.length} Pi agent definitions current`);

  const codexTemplatesDir = join(repo, "plugins/pstack/.codex-plugin/agent-templates");
  mkdirSync(codexTemplatesDir, { recursive: true });
  for (const agent of PI_AGENTS) {
    const name = basename(agent.source, ".md");
    stampFile(join(codexTemplatesDir, `${name}.toml`), codexAgentTemplate(readFileSync(join(repo, agent.source), "utf8"), { readOnly: name === "comment-sicko" }), `Codex agent template ${name}`);
  }
  for (const file of readdirSync(codexTemplatesDir)) {
    if (!PI_AGENTS.some((agent) => `${basename(agent.source, ".md")}.toml` === file)) {
      unlinkSync(join(codexTemplatesDir, file));
      console.log(`removed orphan: Codex agent template ${file}`);
    }
  }
  console.log("ok: Codex native templates current (installation remains explicit)");

  const readmePath = join(repo, "README.md");
  const readme = readFileSync(readmePath, "utf8");
  const nextReadme = renderReadmeTable(readme, skills);
  if (nextReadme === readme) {
    console.log("ok: README slash-command table current");
  } else {
    writeFileSync(readmePath, nextReadme);
    console.log("stamped: README.md slash-command table");
  }

  const portable = syncPortableAssets(repo, skillsDir);
  if (portable.stamped === 0 && portable.removed === 0) {
    console.log(`ok: ${portable.total} portable assets current`);
  }
  validateSkillsTree(skillsDir);
  console.log("ok: local markdown links stay inside the skills tree");
  validateProsePaths(skillsDir);
  console.log("ok: no skill prose points at a path outside the skills tree");

  validateCodexHooks(readFileSync(join(repo, "plugins/pstack/.codex-plugin/plugin.json"), "utf8"), {
    read: (path) => readFileSync(join(repo, "plugins/pstack", path), "utf8"),
  });
  console.log("ok: Codex hook ownership excludes Claude lifecycle");

  const codexName = JSON.parse(
    readFileSync(join(repo, "plugins/pstack/.codex-plugin/plugin.json"), "utf8"),
  ).name;
  validateCodexMarketplace(readFileSync(join(repo, ".agents/plugins/marketplace.json"), "utf8"), {
    expectedName: codexName,
    pathExists: (p) => existsSync(join(repo, p)),
  });
  console.log("ok: .agents/plugins/marketplace.json names the plugin and points at a real path");

  const pluginRoot = join(repo, "plugins/pstack");
  validateHooks(readFileSync(join(pluginRoot, "hooks/hooks.json"), "utf8"), {
    statOf: (rel) => (existsSync(join(pluginRoot, rel)) ? statSync(join(pluginRoot, rel)) : null),
  });
  console.log("ok: hooks.json commands point at existing, executable scripts");

  validatePiManifest(readFileSync(join(repo, "package.json"), "utf8"), {
    pathExists: (p) => existsSync(join(repo, p)),
  });
  console.log("ok: package.json pi manifest points at the shared skills tree and real paths");
}

// Guarded so importing the generator's validation and rendering functions does
// not regenerate the repo as a side effect.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (err) {
    console.error(`FAIL: ${err.message}`);
    process.exit(1);
  }
}
