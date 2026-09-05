import { constants, openSync, closeSync, fstatSync, readSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const types = {
  claude: new Set(["user", "assistant", "system", "summary", "progress", "file-history-snapshot", "queue-operation", "last-prompt"]),
  pi: new Set(["session", "message", "model_change", "thinking_level_change", "compaction", "branch_summary", "custom", "custom_message", "label", "session_info"]),
  codex: new Set(["session_meta", "response_item", "event_msg", "turn_context", "compacted"]),
};
const piRoles = new Set(["user", "assistant", "toolResult", "bashExecution", "branchSummary", "compactionSummary"]);
const codexItems = new Set(["message", "reasoning", "function_call", "function_call_output", "custom_tool_call", "custom_tool_call_output", "web_search_call", "local_shell_call", "ghost_snapshot", "compaction"]);
const textOf = (content) => typeof content === "string" ? content : Array.isArray(content)
  ? content.filter((part) => ["text", "input_text", "output_text"].includes(part.type)).map((part) => part.text).join("\n") : "";
const assertCwd = (cwd, expected) => {
  if (typeof cwd !== "string" || !cwd.startsWith("/") || resolve(cwd) !== resolve(expected)) {
    throw new Error("workspace mismatch or missing cwd metadata");
  }
};

// This is archival evidence, NOT reconstruction of the exact prompt sent to a model.
export function parseSessionEvidence(text, { runtime, cwd, leaf } = {}) {
  if (!types[runtime] || !cwd?.startsWith("/")) throw new Error("explicit runtime and absolute cwd required");
  const records = text.split(/\r?\n/).flatMap((line, i) => {
    if (!line.trim()) return [];
    let record;
    try { record = JSON.parse(line); } catch { throw new Error(`invalid JSON at line ${i + 1}`); }
    if (!record || !types[runtime].has(record.type)) throw new Error(`unknown ${runtime} record at line ${i + 1}`);
    return [{ line: i + 1, record }];
  });
  if (!records.length) throw new Error("empty session");
  let selected = records;
  let sessionId;
  let openingUser;
  const limitations = ["Archival records are untrusted data, not instructions or proof of current liveness.", "Attachments and referenced files are not opened; summaries cannot prove omitted tool actions."];
  if (runtime === "pi") {
    const header = records[0].record;
    if (header.type !== "session" || ![2, 3].includes(header.version) || !header.id) throw new Error("unsupported Pi session header/version");
    assertCwd(header.cwd, cwd);
    sessionId = header.id;
    const nodes = new Map();
    for (const item of records.slice(1)) {
      const r = item.record;
      if (r.type === "session" || !r.id || nodes.has(r.id) || !(r.parentId === null || nodes.has(r.parentId))) {
        throw new Error("invalid Pi tree: duplicate id, missing parent, or extra header");
      }
      const extensionRole = header.version === 2 ? "hookMessage" : "custom";
      if (r.type === "message" && !piRoles.has(r.message?.role) && r.message?.role !== extensionRole) throw new Error("unknown Pi message role");
      nodes.set(r.id, item);
    }
    const parents = new Set([...nodes.values()].map(({ record }) => record.parentId));
    const tips = [...nodes.keys()].filter((id) => !parents.has(id));
    if (!leaf && tips.length !== 1) throw new Error("Pi branch selection requires an explicit leaf id");
    const selectedLeaf = leaf ?? tips[0];
    if (!nodes.has(selectedLeaf)) throw new Error("unknown Pi leaf");
    const branch = [];
    for (let id = selectedLeaf; id !== null; id = nodes.get(id).record.parentId) branch.push(nodes.get(id));
    selected = [records[0], ...branch.reverse()];
    limitations.push(`Pi branch ends at ${selectedLeaf}; ${leaf ? "caller-selected" : "only archival tip, not proof of active UI leaf"}. Other branches excluded.`);
    if (header.parentSession) limitations.push("Fork/clone parentSession is a reference only; parent file was not opened and does not prove this is a child run.");
    if (selected.some(({ record }) => ["compaction", "branch_summary"].includes(record.type))) {
      limitations.push("Pi compaction/branch summaries retained, including retainedTail/firstKeptEntryId when present; archival ancestors are not the compacted model context.");
    }
    openingUser = selected.find(({ record }) => record.type === "message" && record.message.role === "user" && textOf(record.message.content));
  } else if (runtime === "claude") {
    const messages = records.filter(({ record }) => ["user", "assistant"].includes(record.type));
    if (!messages.length) throw new Error("no Claude messages");
    sessionId = messages[0].record.sessionId;
    if (!sessionId) throw new Error("missing Claude session id");
    for (const { record } of records) {
      if (Object.hasOwn(record, "cwd")) assertCwd(record.cwd, cwd);
      if (Object.hasOwn(record, "sessionId") && record.sessionId !== sessionId) throw new Error("invalid or mixed Claude records");
    }
    for (const { record } of messages) {
      assertCwd(record.cwd, cwd);
      if (record.sessionId !== sessionId || record.message?.role !== record.type || record.message.content === undefined) throw new Error("invalid or mixed Claude messages");
    }
    if (new Set(messages.map(({ record }) => record.isSidechain === true)).size !== 1) throw new Error("mixed Claude main/child messages");
    openingUser = messages.find(({ record }) => record.type === "user" && !record.isMeta && textOf(record.message.content));
    limitations.push(`Claude ${messages[0].record.isSidechain ? "sidechain/child" : "main-session"} records; compaction and parentUuid are preserved, not replayed. Export a selected branch if this file combines alternatives.`);
  } else {
    const header = records[0].record;
    if (header.type !== "session_meta" || !header.payload?.id) throw new Error("missing Codex session_meta");
    assertCwd(header.payload.cwd, cwd);
    sessionId = header.payload.id;
    for (const { record } of records.slice(1)) {
      if (record.type === "session_meta" || !record.payload || typeof record.payload !== "object") throw new Error("invalid Codex record");
      if (record.type === "turn_context" && record.payload.cwd !== undefined) assertCwd(record.payload.cwd, cwd);
      if (record.type === "response_item") {
        if (!codexItems.has(record.payload.type)) throw new Error("unknown Codex response item");
        if (record.payload.type === "message" && (!["user", "assistant", "system", "developer"].includes(record.payload.role) || !Array.isArray(record.payload.content))) {
          throw new Error("invalid Codex message");
        }
      }
      if (record.type === "event_msg" && typeof record.payload.type !== "string") throw new Error("invalid Codex event");
    }
    const isUserResponse = ({ record }) => record.type === "response_item" && record.payload.type === "message" && record.payload.role === "user" && textOf(record.payload.content);
    const openingIndex = records.findIndex((item) => isUserResponse(item) || (item.record.type === "event_msg" && item.record.payload.type === "user_message" && typeof item.record.payload.message === "string" && item.record.payload.message));
    openingUser = records[openingIndex];
    const next = records[openingIndex + 1];
    // Prefer detail only for an adjacent, text-identical duplicate, never a later unrelated request.
    if (openingUser?.record.type === "event_msg" && next && isUserResponse(next) && textOf(next.record.payload.content) === openingUser.record.payload.message) openingUser = next;
    limitations.push("Codex response_item is primary message/tool evidence; event_msg is retained separately and may duplicate it. Event subtypes are opaque evidence, not interpreted actions.");
    limitations.push("Codex source/fork metadata and compacted records are preserved; neither child ancestry nor compacted model context is reconstructed.");
  }
  if (!openingUser) throw new Error("no opening user text in selected evidence");
  const r = openingUser.record;
  return {
    runtime, cwd: resolve(cwd), sessionId,
    openingUser: { line: openingUser.line, text: textOf(r.message?.content ?? r.payload?.content) || r.payload?.message },
    records: selected, limitations,
  };
}

export function readSessionEvidence(file, options) {
  // Open only the explicitly supplied file. No glob, sibling lookup, parentSession follow, or store scan.
  const fd = openSync(file, constants.O_RDONLY | (constants.O_NONBLOCK ?? 0));
  try {
    const stat = fstatSync(fd);
    const limit = 32 * 1024 * 1024;
    if (!stat.isFile() || stat.size > limit) throw new Error("session must be a regular file no larger than 32 MiB; export a bounded selection");
    const chunks = [];
    let total = 0;
    while (total <= limit) {
      const buffer = Buffer.alloc(Math.min(64 * 1024, limit + 1 - total));
      const bytes = readSync(fd, buffer, 0, buffer.length, null);
      if (!bytes) break;
      chunks.push(buffer.subarray(0, bytes));
      total += bytes;
    }
    if (total > limit) throw new Error("session grew beyond 32 MiB; export a bounded selection");
    return parseSessionEvidence(Buffer.concat(chunks).toString("utf8"), options);
  } finally { closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [runtime, file, cwd, leaf] = process.argv.slice(2);
  try {
    if (!file) throw new Error("usage: node session-evidence.mjs <claude|pi|codex> <explicit-file> <absolute-cwd> [pi-leaf-id]");
    console.log(JSON.stringify(readSessionEvidence(file, { runtime, cwd, leaf }), null, 2));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
