import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { resolvePanel, lowerDispatch as planDispatch, invocationMetadata, replaceManagedModelBlock } from "../plugins/pstack/skills/poteto-mode/scripts/runtime-policy.mjs";
import { codexAgentTemplate, validateCodexHooks, validateModelPolicy } from "../tools/generate.mjs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const refs = "plugins/pstack/skills/poteto-mode/references/";
const lowerDispatch = (request) => planDispatch({ availableModels: ["claude-opus-5", "openai/gpt-6-astra", "gpt-6-astra", "gpt-5.6-terra", "concrete-model"], ...request });

test("Claude general maps to native builtin; packaged names require discovery", () => {
  expect(lowerDispatch({ runtime: "claude", profile: "general", model: "auto", parent: { model: "claude-opus-5" } })).toEqual({ subagent_type: "general-purpose" });
  for (const profile of ["poteto-agent", "comment-sicko"]) {
    expect(lowerDispatch({ runtime: "claude", profile, registered: { [profile]: `pstack:${profile}` }, model: "claude-opus-5" }).subagent_type).toBe(`pstack:${profile}`);
    expect(() => lowerDispatch({ runtime: "claude", profile, model: "auto" })).toThrow("undiscovered profile");
  }
  expect(() => lowerDispatch({ runtime: "claude", profile: "general", model: "strongest" })).toThrow("resolve model profile");
  expect(() => lowerDispatch({ runtime: "claude", profile: "general", model: "how critics" })).toThrow("not discovered");
});

test("both parent aliases override pinned agent models rather than omitting Pi model", () => {
  for (const model of ["auto", "inherit-parent"]) {
    expect(lowerDispatch({ runtime: "pi", profile: "general", registered: { general: "scout" }, model, parent: { model: "openai/gpt-6-astra" }, agentConfig: { model: "anthropic/claude-fable-5-1" } })).toEqual({ agent: "scout", model: "inherit" });
    expect(lowerDispatch({ runtime: "claude", profile: "general", model, parent: { model: "claude-opus-5" }, agentConfig: { model: "claude-sonnet-5" } }).model).toBe("claude-opus-5");
  }
});

test("Codex config precedence fails closed for model OR effort override", () => {
  const request = { runtime: "codex", profile: "general", registered: { general: "default" }, model: "inherit-parent", parent: { model: "gpt-6-astra", effort: "medium" }, supportedEfforts: ["low", "medium", "high"] };
  expect(lowerDispatch(request)).toEqual({ agent_type: "default", model: "gpt-6-astra", model_reasoning_effort: "medium" });
  expect(() => lowerDispatch({ ...request, agentConfig: { model: "gpt-5.6-luna" } })).toThrow("config overrides request");
  expect(() => lowerDispatch({ ...request, agentConfig: { model_reasoning_effort: "high" } })).toThrow("config overrides request");
  expect(lowerDispatch({ ...request, agentConfig: { model: "gpt-6-astra", model_reasoning_effort: "medium" } }).model).toBe("gpt-6-astra");
  expect(lowerDispatch({ ...request, model: "gpt-6-astra", agentConfig: { model_reasoning_effort: "high" } }).model_reasoning_effort).toBeUndefined();
  expect(() => lowerDispatch({ ...request, model: "gpt-5.6-terra", agentConfig: { model: "gpt-6-astra" } })).toThrow("config overrides request");
});

test("effort is validated separately and lowered to each runtime's native surface", () => {
  for (const runtime of ["claude", "codex", "pi"]) {
    const request = { runtime, profile: "general", registered: { general: "worker" }, model: runtime === "pi" ? "openai/gpt-6-astra" : "concrete-model", effort: "high", supportedEfforts: ["low", "high"] };
    const result = lowerDispatch(request);
    if (runtime === "pi") expect(result.model).toBe("openai/gpt-6-astra:high");
    if (runtime === "claude") expect(result.agentFrontmatter).toEqual({ effort: "high" });
    if (runtime === "codex") expect(result.model_reasoning_effort).toBe("high");
    expect(() => lowerDispatch({ ...request, effort: "max" })).toThrow("unsupported or undiscovered effort");
    expect(() => lowerDispatch({ ...request, supportedEfforts: undefined })).toThrow("unsupported or undiscovered effort");
  }
  expect(lowerDispatch({ runtime: "pi", profile: "general", registered: { general: "worker" }, model: "auto", parent: { model: "openai/gpt-6-astra", effort: "low" }, supportedEfforts: ["low"], agentConfig: { thinking: "high" } }).model).toBe("openai/gpt-6-astra:low");
});

test("Pi suffix requests are validated even without a separate effort field", () => {
  const request = { runtime: "pi", profile: "general", registered: { general: "worker" }, model: "openai/gpt-6-astra:low", supportedEfforts: ["low"] };
  expect(lowerDispatch(request).model).toBe("openai/gpt-6-astra:low");
  expect(() => lowerDispatch({ ...request, model: "openai/gpt-6-astra:max" })).toThrow("unsupported");
  expect(() => lowerDispatch({ ...request, effort: "high" })).toThrow("conflicting");
});

test("Pi preserves discovered colon-bearing IDs before parsing native effort suffixes", () => {
  const model = "amazon-bedrock/amazon.nova-2-lite-v1:0";
  const request = { runtime: "pi", profile: "general", registered: { general: "worker" }, model, availableModels: [model], supportedEfforts: ["low", "high"] };
  expect(lowerDispatch(request).model).toBe(model);
  expect(lowerDispatch({ ...request, model: `${model}:low` }).model).toBe(`${model}:low`);
  expect(lowerDispatch({ ...request, effort: "high" }).model).toBe(`${model}:high`);
  for (const alias of ["auto", "inherit-parent"]) {
    expect(lowerDispatch({ ...request, model: alias, parent: { model } }).model).toBe("inherit");
    expect(lowerDispatch({ ...request, model: alias, parent: { model, effort: "low" } }).model).toBe(`${model}:low`);
    expect(lowerDispatch({ ...request, model: alias, parent: { model: `${model}:low` } }).model).toBe(`${model}:low`);
  }
  expect(() => lowerDispatch({ ...request, model: `${model}:max` })).toThrow("unsupported");
  expect(() => lowerDispatch({ ...request, model: `${model}:unknown` })).toThrow("unsupported");
  expect(() => lowerDispatch({ ...request, model: `${model}:low`, effort: "high" })).toThrow("conflicting");
  // Even a suffix-shaped registered ID is identity, not an effort request.
  expect(lowerDispatch({ ...request, model: "fixture/model:high", availableModels: ["fixture/model:high"], supportedEfforts: [] }).model).toBe("fixture/model:high");
});

test("Pi effort-qualified panels compose with dispatch and do not count effort as diversity", () => {
  const model = "amazon-bedrock/amazon.nova-2-lite-v1:0";
  const config = { runtime: "pi", available: ["openai/gpt-6-astra", "openai-codex/gpt-6-astra", model], supportedEfforts: ["low", "high"], parent: { model: `${model}:high` }, explicit: true };
  const panel = resolvePanel([`${model}:low`, "auto", "openai/gpt-6-astra:high"], config);
  expect(panel).toEqual({ selections: [{ model: `${model}:low` }, { model: "auto", parent: config.parent }, { model: "openai/gpt-6-astra:high" }], reducedDiversity: true });
  expect(panel.selections.map((selection) => lowerDispatch({ runtime: config.runtime, profile: "general", registered: { general: "worker" }, ...selection, availableModels: config.available, supportedEfforts: config.supportedEfforts }).model)).toEqual([`${model}:low`, `${model}:high`, "openai/gpt-6-astra:high"]);
  expect(resolvePanel(["openai/gpt-6-astra:low", "openai-codex/gpt-6-astra:high"], config).reducedDiversity).toBe(true);
  expect(resolvePanel([model, "openai/gpt-6-astra:low"], config).reducedDiversity).toBe(false);
  expect(() => resolvePanel([`${model}:max`], config)).toThrow("unsupported");
  expect(() => resolvePanel([`${model}:low`], { ...config, supportedEfforts: undefined })).toThrow("unsupported");
  expect(resolvePanel(["primary", "strongest"], { ...config, explicit: false, preferences: { primary: ["openai/gpt-6-astra:low", `${model}:high`], strongest: ["openai/gpt-6-astra:high"] } })).toEqual({ selections: [{ model: `${model}:high` }, { model: "openai/gpt-6-astra:high" }], reducedDiversity: false });
});

test("joint panels preserve explicit duplicates and report reduced diversity", () => {
  const config = { available: ["a", "b", "c"], parent: { model: "a" }, preferences: { primary: ["a", "b", "c"], strongest: ["a", "b", "c"], balanced: ["b", "c", "a"] } };
  expect(resolvePanel(["primary", "strongest", "balanced"], config)).toEqual({ selections: [{ model: "a" }, { model: "b" }, { model: "c" }], reducedDiversity: false });
  expect(resolvePanel(["a", "a", "auto"], { ...config, explicit: true })).toEqual({ selections: [{ model: "a" }, { model: "a" }, { model: "auto", parent: config.parent }], reducedDiversity: true });
  expect(resolvePanel(["primary", "strongest"], { ...config, available: ["a"] }).reducedDiversity).toBe(true);
  expect(() => resolvePanel(["missing"], config)).toThrow("no discovered model");
  expect(resolvePanel(["primary", "strongest", "balanced"], { ...config, preferences: { primary: ["a", "b"], strongest: ["a"], balanced: ["c"] } })).toEqual({ selections: [{ model: "b" }, { model: "a" }, { model: "c" }], reducedDiversity: false });
  expect(resolvePanel(["openai/gpt-6-astra", "openai-codex/gpt-6-astra"], { available: ["openai/gpt-6-astra", "openai-codex/gpt-6-astra"], explicit: true }).reducedDiversity).toBe(true);
});

test("explicit-only authoring fixtures use native policy, not prompt aliases; principles stay reachable", () => {
  for (const runtime of ["claude", "pi", "codex"]) {
    const metadata = invocationMetadata(runtime, { explicitOnly: true });
    const skill = read(`tests/fixtures/native-runtime/explicit-${runtime}/SKILL.md`);
    for (const [key, value] of Object.entries(metadata.frontmatter)) expect(skill).toContain(`${key}: ${value}`);
    for (const [file, text] of Object.entries(metadata.files)) expect(read(`tests/fixtures/native-runtime/explicit-${runtime}/${file}`)).toBe(text);
    expect(() => invocationMetadata(runtime, { explicitOnly: true, internal: true })).toThrow("model-reachable");
    expect(invocationMetadata(runtime, { explicitOnly: false, internal: true })).toEqual({ frontmatter: {}, files: {} });
  }
});

test("native Codex templates preserve prompt, don't pin model/effort, and own hooks explicitly", () => {
  for (const name of ["poteto-agent", "comment-sicko"]) {
    const source = read(`plugins/pstack/agents/${name}.md`);
    const rendered = codexAgentTemplate(source, { readOnly: name === "comment-sicko" });
    expect(read(`plugins/pstack/.codex-plugin/agent-templates/${name}.toml`)).toBe(rendered);
    const parsed = Bun.TOML.parse(rendered);
    expect(parsed.name).toBe(name);
    expect(parsed.model).toBeUndefined();
    expect(parsed.model_reasoning_effort).toBeUndefined();
    expect(parsed.sandbox_mode).toBe(name === "comment-sicko" ? "read-only" : "workspace-write");
    expect(parsed.developer_instructions).toContain(name === "comment-sicko" ? "zero applied deletions" : "Poteto");
  }
  const manifest = read("plugins/pstack/.codex-plugin/plugin.json");
  const options = { read: (path) => read(`plugins/pstack/${path}`) };
  expect(() => validateCodexHooks(manifest, options)).not.toThrow();
  expect(() => validateCodexHooks('{"hooks":"./hooks/hooks.json"}', options)).toThrow("explicitly own");
  expect(() => validateCodexHooks(manifest, { read: () => '{"hooks":{"SessionStart":[]}}' })).toThrow("empty");
});

test("model policy validates runtime references, not just Claude", () => {
  const models = JSON.parse(read("plugins/pstack/models.json"));
  for (const runtime of ["claude", "codex", "pi"]) {
    const changed = structuredClone(models);
    delete changed.runtimes[runtime].profiles.balanced;
    expect(() => validateModelPolicy(changed)).toThrow(`${runtime} adapter does not resolve`);
  }
  const changed = structuredClone(models);
  changed.runtimes.pi.singleRoleExample = "primary";
  expect(() => validateModelPolicy(changed)).toThrow("invalid pi model reference");
});

test("managed model instructions replace one block idempotently and preserve surrounding content", () => {
  const original = "User preferences stay here.\n";
  const first = replaceManagedModelBlock(original, "how critics: a, b, c");
  expect(replaceManagedModelBlock(first, "how critics: a, b, c")).toBe(first);
  const second = replaceManagedModelBlock(first, "how critics: c, b, a");
  expect(second).toContain(original);
  expect(second).not.toContain("how critics: a, b, c");
  expect(() => replaceManagedModelBlock(first + first, "x")).toThrow("ambiguous");
});

test("Pi adapter's executable workflow example awaits an ordered array (mock runtime, no native launch)", async () => {
  const adapter = read(`${refs}pi-tools.md`);
  const example = adapter.match(/```js\n([\s\S]*?)\n```/)[1];
  let request;
  new Function("subagent", example)((input) => { request = input; });
  expect(request.async).toBe(true);
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  let calls = 0;
  const output = await new AsyncFunction("runs", request.workflowScript)({ all: async (items) => {
    calls++;
    expect(items.map((item) => item.key)).toEqual(["api", "tests"]);
    return items.map(({ key }) => ({ runId: key, ok: true, output: `${key} evidence` }));
  } });
  expect(calls).toBe(1);
  expect(output.map((result) => result.runId)).toEqual(["api", "tests"]);
});

test("static workflow contracts retain comment ownership, bootstrap, and lifecycle boundaries", () => {
  const child = read("plugins/pstack/agents/comment-sicko.md");
  expect(child).toContain("All kills above are proposals");
  expect(child).not.toContain("Name touched files");
  const parent = read("plugins/pstack/skills/no-comments/SKILL.md");
  expect(parent).toContain("parent then applies accepted ordinary comment deletions");
  expect(parent).toContain("proposed and applied deletion counts separately");
  expect(read("plugins/pstack/skills/show-me-your-work/SKILL.md")).toContain("references/runtime-contract.md");
  expect(read(`${refs}pi-tools.md`)).toContain("bounded inspection while running for readiness");
  expect(read("plugins/pstack/skills/poteto-mode/playbooks/orchestrate.md")).not.toContain("in-flight subagents are dead");
});

for (const runtime of ["claude", "codex", "pi"]) {
  for (const alias of ["auto", "inherit-parent"]) {
    test(`${runtime} panel composition preserves ${alias} parent effort and native precedence`, () => {
      const parent = { model: runtime === "pi" ? "openai/gpt-6-astra" : runtime === "codex" ? "gpt-6-astra" : "claude-opus-5", effort: "low" };
      const supportedEfforts = ["low", "high"];
      const panel = resolvePanel([alias], { runtime, available: [parent.model], parent, supportedEfforts });
      const request = { runtime, profile: "general", registered: { general: "worker" }, ...panel.selections[0], supportedEfforts };
      const result = lowerDispatch(request);
      if (runtime === "pi") {
        expect(lowerDispatch({ ...request, agentConfig: { thinking: "high" } }).model).toBe(`${parent.model}:low`);
      } else if (runtime === "codex") {
        expect(result.model_reasoning_effort).toBe("low");
        expect(() => lowerDispatch({ ...request, agentConfig: { model_reasoning_effort: "high" } })).toThrow("config overrides request");
      } else {
        expect(result).toEqual({ subagent_type: "general-purpose", agentFrontmatter: { effort: "low" } });
        expect(lowerDispatch({ ...request, agentConfig: { model: "claude-sonnet-5" } }).model).toBe(parent.model);
      }
    });
  }
}

test("legacy pasted model sheets require reconciliation even when an override was removed", () => {
  const legacy = read("tests/fixtures/native-runtime/legacy-model-instructions.md");
  for (const text of [legacy, legacy.replace(/^how critics:.*\n/m, "")]) {
    expect(() => replaceManagedModelBlock(text, "how critics: replacement")).toThrow("reconcile");
    const managed = replaceManagedModelBlock("", "how critics: current");
    expect(() => replaceManagedModelBlock(text + managed, "how critics: replacement")).toThrow("reconcile");
  }
});

test("panel alias snapshots preserve bare inheritance and explicit effort overrides", () => {
  for (const runtime of ["claude", "codex", "pi"]) {
    for (const alias of ["auto", "inherit-parent"]) {
      const parent = { model: runtime === "pi" ? "openai/gpt-6-astra" : runtime === "codex" ? "gpt-6-astra" : "claude-opus-5" };
      const panel = resolvePanel([alias, parent.model], { runtime, available: [parent.model], parent, explicit: true });
      expect(panel.reducedDiversity).toBe(true);
      expect(panel.selections).toEqual([{ model: alias, parent: { ...parent } }, { model: parent.model }]);
      const request = { runtime, profile: "general", registered: { general: "worker" }, ...panel.selections[0], supportedEfforts: ["low", "high"] };
      const bare = lowerDispatch(request);
      if (runtime === "claude") expect(bare).toEqual({ subagent_type: "general-purpose" });
      if (runtime === "codex") expect(bare).toEqual({ agent_type: "worker", model: parent.model });
      if (runtime === "pi") expect(bare).toEqual({ agent: "worker", model: "inherit" });
      parent.effort = "low";
      expect(panel.selections[0].parent.effort).toBeUndefined();
      const override = lowerDispatch({ ...request, effort: "high" });
      if (runtime === "claude") expect(override.agentFrontmatter).toEqual({ effort: "high" });
      if (runtime === "codex") expect(override.model_reasoning_effort).toBe("high");
      if (runtime === "pi") expect(override.model).toBe(`${parent.model}:high`);
    }
  }
});

test("managed model sheets may contain the legacy heading inside the one owned block", () => {
  const sheet = "# pstack model configuration\n\nhow critics: a, b";
  const first = replaceManagedModelBlock("Keep these preferences.\n", sheet);
  expect(replaceManagedModelBlock(first, sheet)).toBe(first);
  expect(replaceManagedModelBlock(first, sheet.replace("how critics: a, b", ""))).not.toContain("how critics:");
  for (const markers of ["<!-- pstack-models:start -->", "<!-- pstack-models:end -->", "<!-- pstack-models:end --><!-- pstack-models:start -->"]) {
    expect(() => replaceManagedModelBlock(markers, sheet)).toThrow("ambiguous");
  }
});
