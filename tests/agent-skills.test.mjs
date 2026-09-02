import { describe, expect, test } from "bun:test";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  agentSkills,
  PI_AGENTS,
  piAgentDefinition,
  piPromptTemplate,
  PORTABLE_ASSETS,
  promptStub,
  publicSkills,
  syncPortableAssets,
  validatePiManifest,
} from "../tools/generate.mjs";
import { validateProsePaths, validateSkillsTree } from "../tools/validate-skills.mjs";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const skillsDir = join(repoRoot, "plugins/pstack/skills");
const agentsDir = join(repoRoot, "plugins/pstack/agents");
const requiredPortableFiles = [
  "poteto-mode/references/agents/comment-sicko.md",
  "poteto-mode/references/agents/poteto-agent.md",
  "poteto-mode/references/licenses/LICENSE",
  "poteto-mode/references/licenses/LICENSE-cursor-team-kit",
  "poteto-mode/references/licenses/NOTICE.md",
];

describe("shared Agent Skills tree", () => {
  test("every skill satisfies the portable name and description boundary", () => {
    const skills = agentSkills(skillsDir);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      expect(skill.name).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
      expect(skill.name.length).toBeLessThanOrEqual(64);
      expect(skill.description.length).toBeGreaterThan(0);
      expect(skill.description.length).toBeLessThanOrEqual(1024);
    }
  });

  test("derives the public Codex prompts from the validated shared skills", () => {
    const skills = publicSkills(skillsDir);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      const out = promptStub(skill);
      expect(out).toContain(`name: ${skill.name}`);
      expect(out).toContain("disable-model-invocation: true");
      expect(out).toContain(`Invoke the \`${skill.name}\` skill and follow it.`);
    }
  });

  test("derives a Pi prompt template from the same shared skills", () => {
    const skills = publicSkills(skillsDir);
    expect(skills.length).toBeGreaterThan(0);
    for (const skill of skills) {
      const out = piPromptTemplate(skill);
      expect(out).toContain(`description: ${skill.menu}`);
      expect(out).toContain('argument-hint: "[instructions]"');
      expect(out).toContain(`Read the \`${skill.name}\` skill's SKILL.md in full and follow it.`);
      expect(out.trimEnd().endsWith("$@")).toBe(true);
    }
  });

  test("no markdown link escapes the skills tree", () => {
    expect(() => validateSkillsTree(skillsDir)).not.toThrow();
  });

  test("no skill tells the reader to open a plugin path outside the tree", () => {
    expect(() => validateProsePaths(skillsDir)).not.toThrow();
  });

  test("a backticked plugin path in prose fails the boundary check", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-prose-paths-"));
    try {
      const skill = join(root, "example");
      mkdirSync(skill, { recursive: true });
      for (const prose of [
        "Read `agents/comment-sicko.md` in full first.",
        "Read `./agents/comment-sicko.md` in full first.",
        "Read the following file:\n`agents/comment-sicko.md`",
      ]) {
        writeFileSync(join(skill, "SKILL.md"), `# Example\n\n${prose}\n`);
        expect(() => validateProsePaths(root)).toThrow("example/SKILL.md -> agents/comment-sicko.md");
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("prose may name a runtime directory it does not tell the reader to open", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-prose-allowed-"));
    try {
      const skill = join(root, "example");
      mkdirSync(skill, { recursive: true });
      writeFileSync(
        join(skill, "SKILL.md"),
        [
          "# Example",
          "",
          "The `hooks/` directory is Claude Code only and ships with the plugin.",
          "Read this section before noting that `agents/comment-sicko.md` ships only with the plugin.",
        ].join("\n"),
      );
      expect(() => validateProsePaths(root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a bare missing markdown target fails the boundary check", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-skills-links-"));
    const skill = join(root, "example");
    mkdirSync(skill);
    writeFileSync(
      join(skill, "SKILL.md"),
      "[missing](missing.md)\n[external](https://example.com/reference)\n",
    );

    try {
      expect(() => validateSkillsTree(root)).toThrow("example/SKILL.md -> missing.md (missing)");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("bare, dotted, and reference-style local links resolve inside the boundary", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-skills-links-"));
    const skill = join(root, "example");
    const references = join(skill, "references");
    mkdirSync(references, { recursive: true });
    writeFileSync(join(references, "guide.md"), "# Guide\n");
    writeFileSync(
      join(skill, "SKILL.md"),
      [
        "[bare](references/guide.md)",
        "[dotted](./references/guide.md#section)",
        "[reference][guide]",
        "[external](https://example.com/reference)",
        "[guide]: references/guide.md",
        "[^note]: explanatory footnote text is not a link target",
      ].join("\n"),
    );

    try {
      expect(() => validateSkillsTree(root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("an escaping markdown target fails the boundary check", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-skills-links-"));
    const skill = join(root, "example");
    mkdirSync(skill);
    writeFileSync(join(skill, "SKILL.md"), "[escape](../../outside.md)\n");

    try {
      expect(() => validateSkillsTree(root)).toThrow(
        "example/SKILL.md -> ../../outside.md (escapes skills tree)",
      );
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("a markdown symlink target cannot escape the boundary", () => {
    const parent = mkdtempSync(join(tmpdir(), "pstack-skills-links-"));
    const root = join(parent, "skills");
    const skill = join(root, "example");
    const outside = join(parent, "outside.md");
    mkdirSync(skill, { recursive: true });
    writeFileSync(outside, "outside\n");
    symlinkSync(outside, join(skill, "linked.md"));
    writeFileSync(join(skill, "SKILL.md"), "[escape](linked.md)\n");

    try {
      expect(() => validateSkillsTree(root)).toThrow(
        "example/SKILL.md -> linked.md (escapes skills tree through symlink)",
      );
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("the subagent definitions dispatched by name install with the skills", () => {
    const vendored = join(skillsDir, "poteto-mode", "references", "agents");
    for (const name of ["poteto-agent", "comment-sicko"]) {
      const copy = readFileSync(join(vendored, `${name}.md`), "utf8");
      expect(copy).toBe(readFileSync(join(agentsDir, `${name}.md`), "utf8"));
      expect(copy).toContain(`name: ${name}`);
    }
  });

  test("Pi agent definitions carry the source prompt under a pi-subagents allowlist", () => {
    for (const agent of PI_AGENTS) {
      const source = readFileSync(join(repoRoot, agent.source), "utf8");
      const [, sourceFront, body] = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
      const front = piAgentDefinition(source, agent).match(/^---\n([\s\S]*?)\n---\n/)[1].split("\n");

      expect(front[0]).toBe(`name: ${basename(agent.source, ".md")}`);
      expect(front[1]).toBe(sourceFront.split("\n").find((l) => l.startsWith("description: ")));
      expect(front.slice(2)).toEqual([
        `tools: ${agent.tools}`,
        "thinking: high",
        "inheritProjectContext: true",
        "inheritSkills: true",
      ]);
      expect(piAgentDefinition(source, agent).endsWith(body)).toBe(true);
    }
  });

  test("the report-only Pi agent gets no write tools", () => {
    const sicko = PI_AGENTS.find((a) => a.source.endsWith("comment-sicko.md"));
    const tools = sicko.tools.split(", ");
    expect(tools).not.toContain("edit");
    expect(tools).not.toContain("write");
  });

  test("the committed root manifest satisfies the Pi package contract", () => {
    expect(() =>
      validatePiManifest(readFileSync(join(repoRoot, "package.json"), "utf8"), {
        pathExists: (p) => existsSync(join(repoRoot, p)),
      }),
    ).not.toThrow();
  });

  test("a Pi manifest fails on a dead path, a missing keyword, a private skills tree, or a dropped output", () => {
    const manifest = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
    const check = (mutate) => {
      const next = mutate(structuredClone(manifest));
      return () =>
        validatePiManifest(JSON.stringify(next), {
          pathExists: (p) => existsSync(join(repoRoot, p)),
        });
    };

    expect(
      check((m) => {
        m.pi.extensions.push("./plugins/pstack/.pi-plugin/extensions/gone.ts");
        return m;
      }),
    ).toThrow("./plugins/pstack/.pi-plugin/extensions/gone.ts");
    expect(
      check((m) => {
        m.keywords = m.keywords.filter((k) => k !== "pi-package");
        return m;
      }),
    ).toThrow('"keywords" must include "pi-package"');
    expect(
      check((m) => {
        m.pi.skills = ["./plugins/pstack/.pi-plugin/skills"];
        return m;
      }),
    ).toThrow('"pi.skills" must be');
    expect(
      check((m) => {
        delete m.pi.prompts;
        return m;
      }),
    ).toThrow('"pi.prompts" must list ./plugins/pstack/.pi-plugin/prompts');
    expect(
      check((m) => {
        m.pi.subagents = {};
        return m;
      }),
    ).toThrow('"pi.subagents.agents" must list');
  });

  test("an agent source with a duplicate description line is rejected by name", () => {
    const source = "---\nname: x\ndescription: one\ndescription: two\n---\n\nbody\n";
    expect(() => piAgentDefinition(source, { tools: "read" })).toThrow("exactly one description line, found 2");
    expect(() => piAgentDefinition("---\ndescription: one\n---\n\nbody\n", { tools: "read" })).toThrow(
      "exactly one name line, found 0",
    );
  });

  test("every required portable asset lives inside the skills tree", () => {
    for (const file of requiredPortableFiles) {
      expect(existsSync(join(skillsDir, file))).toBe(true);
    }
    for (const { source, target } of PORTABLE_ASSETS) {
      expect(readFileSync(join(skillsDir, target), "utf8")).toBe(
        readFileSync(join(repoRoot, source), "utf8"),
      );
    }
  });

  test("portable asset sync creates, updates, and removes generated files", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-portable-assets-"));
    const fixtureRepo = join(root, "repo");
    const fixtureSkills = join(fixtureRepo, "plugins/pstack/skills");
    const generatedDirs = new Set(PORTABLE_ASSETS.map(({ target }) => dirname(target)));

    try {
      for (const { source } of PORTABLE_ASSETS) {
        const path = join(fixtureRepo, source);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `source: ${source}\n`);
      }
      for (const dir of generatedDirs) {
        const output = join(fixtureSkills, dir);
        mkdirSync(output, { recursive: true });
        writeFileSync(join(output, "stale.md"), "stale\n");
      }

      expect(syncPortableAssets(fixtureRepo, fixtureSkills, { log() {} })).toEqual({
        stamped: PORTABLE_ASSETS.length,
        removed: generatedDirs.size,
        total: PORTABLE_ASSETS.length,
      });
      for (const { source, target } of PORTABLE_ASSETS) {
        expect(readFileSync(join(fixtureSkills, target), "utf8")).toBe(
          readFileSync(join(fixtureRepo, source), "utf8"),
        );
      }
      for (const dir of generatedDirs) {
        expect(existsSync(join(fixtureSkills, dir, "stale.md"))).toBe(false);
      }

      expect(syncPortableAssets(fixtureRepo, fixtureSkills, { log() {} })).toEqual({
        stamped: 0,
        removed: 0,
        total: PORTABLE_ASSETS.length,
      });

      const changed = PORTABLE_ASSETS[0];
      writeFileSync(join(fixtureRepo, changed.source), "changed\n");
      expect(syncPortableAssets(fixtureRepo, fixtureSkills, { log() {} })).toEqual({
        stamped: 1,
        removed: 0,
        total: PORTABLE_ASSETS.length,
      });
      expect(readFileSync(join(fixtureSkills, changed.target), "utf8")).toBe("changed\n");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("portable asset sync refuses an output directory symlink escape", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-portable-assets-"));
    const fixtureRepo = join(root, "repo");
    const fixtureSkills = join(fixtureRepo, "plugins/pstack/skills");
    const agentsOutput = join(fixtureSkills, "poteto-mode/references/agents");
    const outside = join(root, "outside");

    try {
      for (const { source } of PORTABLE_ASSETS) {
        const path = join(fixtureRepo, source);
        mkdirSync(dirname(path), { recursive: true });
        writeFileSync(path, `source: ${source}\n`);
      }
      mkdirSync(dirname(agentsOutput), { recursive: true });
      mkdirSync(outside);
      symlinkSync(outside, agentsOutput, "dir");

      expect(() => syncPortableAssets(fixtureRepo, fixtureSkills, { log() {} })).toThrow(
        "poteto-mode/references/agents resolves outside the skills tree through a symlink",
      );
      expect(existsSync(join(outside, "poteto-agent.md"))).toBe(false);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  test("linked skills keep their own resources and sibling principle leaves", () => {
    const root = mkdtempSync(join(tmpdir(), "pstack-agent-skills-"));
    const installed = join(root, "unrelated-home", ".agents", "skills");
    mkdirSync(installed, { recursive: true });

    try {
      for (const { name } of agentSkills(skillsDir)) {
        symlinkSync(join(skillsDir, name), join(installed, name), "dir");
      }

      const poteto = join(installed, "poteto-mode");
      expect(readFileSync(join(poteto, "SKILL.md"), "utf8")).toContain("# Poteto mode");
      expect(readFileSync(join(poteto, "references", "codex-tools.md"), "utf8")).toContain(
        "# Codex tool mapping for pstack",
      );
      expect(
        readFileSync(join(poteto, "..", "principle-model-the-domain", "SKILL.md"), "utf8"),
      ).toContain("# Model the Domain");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
