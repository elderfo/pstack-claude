import { readFileSync } from "node:fs";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";

const mandate = readFileSync(new URL("../session-start-context.md", import.meta.url), "utf8").trim();

export default function pstack(pi: ExtensionAPI) {
  // pi-subagents children load the parent's extensions. The mandate routes the
  // orchestrating session; a child already has its task and its agent prompt.
  if (process.env.PI_SUBAGENT_CHILD === "1") return;
  pi.on("before_agent_start", async (event) => ({
    systemPrompt: `${event.systemPrompt}\n\n${mandate}`,
  }));
}
