// The extension is Pi's whole auto-fire path; nothing else in the repo notices if it breaks.
import { describe, expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const extension = join(repoRoot, "plugins/pstack/.pi-plugin/extensions/pstack.ts");
const mandate = readFileSync(
  join(repoRoot, "plugins/pstack/.pi-plugin/session-start-context.md"),
  "utf8",
).trim();

describe("Pi routing extension", () => {
  test("appends the mandate to every turn's system prompt", async () => {
    const { default: pstack } = await import(extension);
    const handlers = new Map();
    pstack({ on: (event, handler) => handlers.set(event, handler) });

    expect([...handlers.keys()]).toEqual(["before_agent_start"]);
    const result = await handlers.get("before_agent_start")({ systemPrompt: "base" });
    expect(result.systemPrompt.startsWith("base\n\n")).toBe(true);
    expect(result.systemPrompt).toContain(mandate);
    expect(mandate.length).toBeGreaterThan(0);
  });

  test("registers nothing in a pi-subagents child", () => {
    const probe = [
      `const { default: pstack } = await import(${JSON.stringify(extension)});`,
      "const events = [];",
      "pstack({ on: (event) => events.push(event) });",
      "console.log(JSON.stringify(events));",
    ].join("\n");
    const child = spawnSync("bun", ["-e", probe], {
      encoding: "utf8",
      env: { ...process.env, PI_SUBAGENT_CHILD: "1" },
    });

    expect(child.status).toBe(0);
    expect(child.stdout.trim()).toBe("[]");
  });
});
