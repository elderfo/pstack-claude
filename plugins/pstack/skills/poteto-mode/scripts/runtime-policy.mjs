// Deterministic dispatch planning, not a native tool client. Discovery and permissions stay with the host.
const aliases = new Set(["auto", "inherit-parent"]);
const profiles = new Set(["primary", "strongest", "balanced"]);
const piEfforts = ["off", "minimal", "low", "medium", "high", "xhigh", "max"];

function normalizeModelSelection(selection, { runtime, known, supportedEfforts }) {
  // Registry IDs may contain colons, including a suffix that resembles an effort level.
  if (runtime !== "pi" || known.has(selection) || typeof selection !== "string") return { model: selection };
  const split = selection.lastIndexOf(":");
  if (split < 0) return { model: selection };
  const model = selection.slice(0, split);
  const effort = selection.slice(split + 1);
  if (!known.has(model) && !piEfforts.includes(effort)) return { model: selection };
  validateEffort(effort, piEfforts);
  validateEffort(effort, supportedEfforts);
  return { model, effort };
}

export function resolvePanel(entries, { runtime, preferences, available, parent = {}, supportedEfforts, explicit = false }) {
  if (!entries.length) throw new Error("empty panel");
  const known = new Set(available);
  const normalize = (id) => normalizeModelSelection(id, { runtime, known, supportedEfforts });
  // Effort and provider routes to the same catalog model are not independent models.
  const identity = (selection) => {
    const { model } = normalize(selection);
    return model.includes("/") ? model.slice(model.indexOf("/") + 1) : model;
  };
  const candidates = entries.map((entry) => {
    const ids = aliases.has(entry) ? [parent.model] : profiles.has(entry) ? preferences[entry] : [entry];
    if (!Array.isArray(ids)) throw new Error(`unresolved profile: ${entry}`);
    const reachable = ids.filter((id) => known.has(normalize(id).model));
    if (!reachable.length) throw new Error(`no discovered model for ${entry}`);
    return reachable;
  });
  const models = candidates.map((ids) => ids[0]);
  const pinned = new Set(entries.flatMap((entry, i) => explicit || !profiles.has(entry) ? [identity(models[i])] : []));
  const owners = new Map();
  function assign(slot, seen = new Set()) {
    const options = candidates[slot].filter((id) => !pinned.has(identity(id)));
    // Preserve earlier preferences if an unused candidate exists; otherwise augment the matching.
    const ordered = [...options.filter((id) => !owners.has(identity(id))), ...options.filter((id) => owners.has(identity(id)))];
    for (const id of ordered) {
      const key = identity(id);
      if (seen.has(key)) continue;
      seen.add(key);
      if (!owners.has(key) || assign(owners.get(key), seen)) {
        owners.set(key, slot);
        models[slot] = id;
        return true;
      }
    }
    return false;
  }
  if (!explicit) entries.forEach((entry, slot) => { if (profiles.has(entry)) assign(slot); });
  const selections = models.map((model, i) => aliases.has(entries[i])
    ? { model: entries[i], parent: { ...parent } }
    : { model });
  return { selections, reducedDiversity: new Set(models.map(identity)).size < models.length };
}

export function validateEffort(effort, supported) {
  if (effort !== undefined && (!Array.isArray(supported) || !supported.includes(effort))) {
    throw new Error(`unsupported or undiscovered effort: ${effort}`);
  }
}

// registered maps neutral profile names to exact discovered native names; agentConfig is the effective selected profile.
export function lowerDispatch({ runtime, profile, registered = {}, model, parent = {}, agentConfig = {}, effort, supportedEfforts, availableModels }) {
  if (!["claude", "codex", "pi"].includes(runtime)) throw new Error(`unknown runtime: ${runtime}`);
  const agent = runtime === "claude" && profile === "general" ? "general-purpose" : registered[profile];
  if (!agent) throw new Error(`undiscovered profile: ${profile}`);
  if (!model || profiles.has(model)) throw new Error(`resolve model profile before dispatch: ${model}`);
  const inherited = aliases.has(model);
  const selection = inherited ? parent.model : model;
  if (!selection) throw new Error("parent model is unknown");
  const known = new Set(availableModels);
  const { model: resolvedModel, effort: suffix } = normalizeModelSelection(selection, { runtime, known, supportedEfforts });
  if (suffix !== undefined && effort !== undefined && effort !== suffix) throw new Error("conflicting Pi effort and suffix");
  if (!known.has(resolvedModel)) throw new Error(`model was not discovered: ${resolvedModel}`);
  const resolvedEffort = effort ?? suffix ?? (inherited ? parent.effort : undefined);
  validateEffort(resolvedEffort, supportedEfforts);
  if (runtime === "pi") {
    if (!resolvedModel.includes("/")) throw new Error("Pi requires provider/model");
    // A suffix overrides configured thinking; bare inherit overrides agent model defaults.
    return { agent, model: resolvedEffort === undefined ? (inherited ? "inherit" : resolvedModel) : `${resolvedModel}:${resolvedEffort}` };
  }
  if (runtime === "codex") {
    if ((agentConfig.model && agentConfig.model !== resolvedModel) ||
        (resolvedEffort !== undefined && agentConfig.model_reasoning_effort && agentConfig.model_reasoning_effort !== resolvedEffort)) {
      throw new Error("Codex agent config overrides request; select a config-neutral/matching profile or disclose blocked inheritance");
    }
    return { agent_type: agent, model: resolvedModel, ...(resolvedEffort === undefined ? {} : { model_reasoning_effort: resolvedEffort }) };
  }
  const omitModel = inherited && (!agentConfig.model || agentConfig.model === "inherit");
  return {
    subagent_type: agent,
    ...(omitModel ? {} : { model: resolvedModel }),
    // Claude effort belongs to supported agent frontmatter, not an invented Agent call parameter.
    ...(resolvedEffort === undefined ? {} : { agentFrontmatter: { effort: resolvedEffort } }),
  };
}

export function invocationMetadata(runtime, { explicitOnly, internal = false }) {
  if (internal && explicitOnly) throw new Error("internal principles must remain model-reachable");
  if (!["claude", "codex", "pi"].includes(runtime)) throw new Error(`unknown runtime: ${runtime}`);
  if (runtime === "codex") {
    return { frontmatter: {}, files: explicitOnly ? { "agents/openai.yaml": "policy:\n  allow_implicit_invocation: false\n" } : {} };
  }
  return { frontmatter: explicitOnly ? { "disable-model-invocation": true } : {}, files: {} };
}

export function replaceManagedModelBlock(instructions, content) {
  const start = "<!-- pstack-models:start -->";
  const end = "<!-- pstack-models:end -->";
  const block = `${start}\n${content.trim()}\n${end}`;
  const starts = instructions.split(start).length - 1;
  const ends = instructions.split(end).length - 1;
  if (starts !== ends || starts > 1 || (starts && instructions.indexOf(end) < instructions.indexOf(start))) {
    throw new Error("ambiguous pstack model block; reconcile before writing");
  }
  const outside = starts ? instructions.slice(0, instructions.indexOf(start)) + instructions.slice(instructions.indexOf(end) + end.length) : instructions;
  if (/^\s*# pstack model configuration\s*$/m.test(outside)) {
    throw new Error("legacy unmarked pstack model sheet; reconcile before writing");
  }
  return starts ? instructions.slice(0, instructions.indexOf(start)) + block + instructions.slice(instructions.indexOf(end) + end.length)
    : instructions.trimEnd() + (instructions.trim() ? "\n\n" : "") + block + "\n";
}
