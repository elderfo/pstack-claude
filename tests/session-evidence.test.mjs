import { expect, test } from "bun:test";
import { mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readSessionEvidence, parseSessionEvidence } from "../plugins/pstack/skills/poteto-mode/scripts/session-evidence.mjs";

const fixture = (runtime) => new URL(`fixtures/native-runtime/${runtime}.jsonl`, import.meta.url);
const options = (runtime) => ({ runtime, cwd: "/fixture/work", ...(runtime === "pi" ? { leaf: "tip" } : {}) });

test("synthetic runtime records preserve tool calls/results and find the opening user after metadata", () => {
  for (const runtime of ["claude", "pi", "codex"]) {
    const result = readSessionEvidence(fixture(runtime), options(runtime));
    expect(result.openingUser.text).toBe("Review fixture");
    expect(result.openingUser.line).toBeGreaterThan(1);
    expect(JSON.stringify(result.records)).toContain("call-1");
    expect(JSON.stringify(result.records)).toContain("fixture contents");
    expect(result.limitations.length).toBeGreaterThan(2);
    expect(() => readSessionEvidence(fixture(runtime), { ...options(runtime), cwd: "/unrelated" })).toThrow("workspace mismatch");
  }
});

test("Pi selects an explicit tree branch without reading the header's unrelated parentSession", () => {
  const result = readSessionEvidence(fixture("pi"), options("pi"));
  expect(result.records.map(({ record }) => record.id)).toEqual(["fixture-pi", "u", "a", "t", "c", "b", "tip"]);
  expect(JSON.stringify(result.records)).not.toContain('"id":"abandoned"');
  expect(JSON.stringify(result.records)).toContain("retainedTail");
  expect(result.limitations.join(" ")).toContain("parent file was not opened");
  expect(() => readSessionEvidence(fixture("pi"), { runtime: "pi", cwd: "/fixture/work" })).toThrow("explicit leaf");
  expect(() => readSessionEvidence(fixture("pi"), { ...options("pi"), leaf: "absent" })).toThrow("unknown Pi leaf");
  expect(readSessionEvidence(fixture("pi"), { ...options("pi"), leaf: "abandoned" }).records.at(-1).record.id).toBe("abandoned");
});

test("Pi v2 hookMessage evidence is retained raw with version-appropriate role validation", () => {
  const text = readFileSync(fixture("pi-v2"), "utf8");
  const parse = (input) => parseSessionEvidence(input, { runtime: "pi", cwd: "/fixture/work" });
  const result = parse(text);
  expect(result.openingUser).toEqual({ line: 2, text: "Review legacy fixture" });
  expect(result.records.at(-1).record).toEqual(JSON.parse(text.trim().split("\n").at(-1)));
  expect(result.records.at(-1).record.message.role).toBe("hookMessage");
  expect(() => parse(text.replace('"version":2', '"version":3'))).toThrow("unknown Pi message role");
  expect(parse(text.replace('"version":2', '"version":3').replace('"hookMessage"', '"custom"')).records.at(-1).record.message.role).toBe("custom");
  expect(() => parse(text.replace('"hookMessage"', '"custom"'))).toThrow("unknown Pi message role");
});

test("unsupported schemas, malformed JSON, missing metadata and broken trees fail closed", () => {
  expect(() => parseSessionEvidence('{"type":"novel"}', options("claude"))).toThrow("unknown claude record");
  expect(() => parseSessionEvidence('{"type":', options("pi"))).toThrow("invalid JSON");
  expect(() => parseSessionEvidence('{"type":"session","version":1}', options("pi"))).toThrow("unsupported Pi");
  expect(() => parseSessionEvidence('{"type":"response_item","payload":{"type":"message"}}', options("codex"))).toThrow("session_meta");
  const header = { type: "session", version: 3, id: "p", cwd: "/fixture/work" };
  for (const rows of [
    [header, { type: "message", id: "u", parentId: "missing" }],
    [header, { type: "message", id: "u", parentId: null, message: { role: "unexpected" } }],
  ]) expect(() => parseSessionEvidence(rows.map(JSON.stringify).join("\n"), options("pi"))).toThrow();
  expect(() => parseSessionEvidence('', options("claude"))).toThrow("empty session");
});

test("Claude tool-result-only user records are not opening text; child and mixed session metadata validated", () => {
  const message = (content, extra = {}) => ({ type: "user", sessionId: "c", cwd: "/fixture/work", isSidechain: true, message: { role: "user", content }, ...extra });
  const tool = message([{ type: "tool_result", tool_use_id: "id", content: "not the user request" }]);
  const request = message("Actual request");
  const parse = (rows) => parseSessionEvidence(rows.map(JSON.stringify).join("\n"), options("claude"));
  expect(parse([tool, request]).openingUser).toEqual({ line: 2, text: "Actual request" });
  expect(parse([tool, request]).limitations.join(" ")).toContain("sidechain/child");
  expect(() => parse([tool, message("Other session", { sessionId: "other" })])).toThrow("mixed Claude");
  expect(() => parse([tool, message("Main", { isSidechain: false })])).toThrow("mixed Claude main/child");
});

test("Claude validates optional cwd and session metadata on every returned record type", () => {
  const text = readFileSync(fixture("claude"), "utf8");
  const parse = (record) => parseSessionEvidence(`${text}${JSON.stringify(record)}\n`, options("claude"));
  for (const type of ["system", "summary", "progress", "file-history-snapshot", "queue-operation", "last-prompt"]) {
    expect(parse({ type }).records.at(-1).record).toEqual({ type });
    expect(parse({ type, cwd: "/fixture/work", sessionId: "fixture-claude" }).sessionId).toBe("fixture-claude");
    expect(parse({ type, cwd: "/fixture/work" }).sessionId).toBe("fixture-claude");
    expect(parse({ type, sessionId: "fixture-claude" }).sessionId).toBe("fixture-claude");
    for (const cwd of ["/unrelated", null]) expect(() => parse({ type, cwd })).toThrow("workspace mismatch");
    for (const sessionId of ["other-session", null]) expect(() => parse({ type, sessionId })).toThrow("mixed Claude");
    expect(() => parse({ type, cwd: "/unrelated", sessionId: "other-session" })).toThrow();
  }
});

test("Codex opening selection stays chronological across event and response representations", () => {
  const text = readFileSync(fixture("codex-event-first"), "utf8");
  const parse = (input) => parseSessionEvidence(input, options("codex"));
  expect(parse(text).openingUser).toEqual({ line: 2, text: "Opening event-only request" });
  expect(parse(text.replace("Later response-item request", "Opening event-only request")).openingUser.line).toBe(2);
  // Adjacent duplicate representations prefer the detailed response item, not later unrelated requests.
  expect(readSessionEvidence(fixture("codex"), options("codex")).openingUser.line).toBe(3);
  const rows = text.trim().split("\n");
  expect(parse([rows[0], rows[3], rows[1]].join("\n")).openingUser).toEqual({ line: 2, text: "Later response-item request" });
  expect(parse([rows[0], rows[1], rows[3]].join("\n")).openingUser).toEqual({ line: 2, text: "Opening event-only request" });
});

test("Codex event-only user fallback is separate from response evidence, unknown items rejected", () => {
  const rows = [
    { type: "session_meta", payload: { id: "c", cwd: "/fixture/work" } },
    { type: "event_msg", payload: { type: "user_message", message: "event-only request" } },
  ];
  expect(parseSessionEvidence(rows.map(JSON.stringify).join("\n"), options("codex")).openingUser.text).toBe("event-only request");
  rows.push({ type: "response_item", payload: { type: "future_tool" } });
  expect(() => parseSessionEvidence(rows.map(JSON.stringify).join("\n"), options("codex"))).toThrow("unknown Codex response item");
});

test("explicit file reader rejects directories and oversized files without scanning any session store", () => {
  const dir = mkdtempSync(join(tmpdir(), "pstack-session-fixture-"));
  try {
    expect(() => readSessionEvidence(dir, options("pi"))).toThrow("regular file");
    const file = join(dir, "large.jsonl");
    writeFileSync(file, " ".repeat(32 * 1024 * 1024 + 1));
    expect(() => readSessionEvidence(file, options("pi"))).toThrow("32 MiB");
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

for (const linked of [false, true]) {
  test.skipIf(process.platform === "win32")(`explicit reader rejects ${linked ? "symlink to FIFO" : "FIFO"} without blocking open`, () => {
    const dir = mkdtempSync(join(tmpdir(), "pstack-fifo-fixture-"));
    try {
      const fifo = join(dir, "session.fifo");
      expect(spawnSync("mkfifo", [fifo]).status).toBe(0);
      const file = linked ? join(dir, "session-link.jsonl") : fifo;
      if (linked) symlinkSync(fifo, file);
      const script = fileURLToPath(new URL("../plugins/pstack/skills/poteto-mode/scripts/session-evidence.mjs", import.meta.url));
      const result = spawnSync("node", [script, "pi", file, "/fixture/work"], { encoding: "utf8", timeout: 1500 });
      expect(result.error?.code).not.toBe("ETIMEDOUT");
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("regular file");
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
}
