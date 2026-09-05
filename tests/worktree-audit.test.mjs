import { expect, test } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const script = new URL("../plugins/pstack/skills/poteto-mode/scripts/worktree-audit.sh", import.meta.url).pathname;

test("worktree-audit.sh never probes unrelated transcripts or marks unknown activity safe", () => {
  const root = mkdtempSync(join(tmpdir(), "pstack-worktree-audit-"));
  const bin = join(root, "bin");
  const home = join(root, "home");
  const repo = join(root, "repo");
  const child = join(root, "child");
  for (const dir of [bin, repo, child, join(home, ".claude/projects/unrelated")]) mkdirSync(dir, { recursive: true });
  const probe = join(root, "forbidden-probe");
  const command = (name, body) => writeFileSync(join(bin, name), `#!/usr/bin/env bash\n${body}\n`, { mode: 0o755 });
  command("git", `
case "$*" in
  "worktree list --porcelain") printf 'worktree %s\\n\\nworktree %s\\n' "$FIXTURE_REPO" "$FIXTURE_CHILD" ;;
  "fetch origin main --quiet") exit 0 ;;
  *"rev-parse HEAD") echo abc123 ;;
  *"log -1"*) echo 1 ;;
  *"merge-base --is-ancestor"*) exit 0 ;;
  *"status --porcelain"*) printf '%s' "\${FIXTURE_DIRTY:-}" ;;
  *"symbolic-ref"*) echo feature ;;
  *"show-ref"*) exit 1 ;;
  *) exit 1 ;;
esac`);
  command("gh", 'echo "[]"');
  command("jq", 'exit 0');
  command("rg", 'echo "unrelated transcript scan attempted" > "$FIXTURE_PROBE"; exit 1');
  writeFileSync(join(home, ".claude/projects/unrelated/private.jsonl"), "private sentinel, must not be accessed\n");
  try {
    for (const dirty of ["", "?? scratch.txt", " M wip.txt"]) {
      const result = spawnSync("bash", [script, repo], { encoding: "utf8", timeout: 5000, env: { ...process.env, HOME: home, PATH: `${bin}:${process.env.PATH}`, FIXTURE_REPO: repo, FIXTURE_CHILD: child, FIXTURE_PROBE: probe, FIXTURE_DIRTY: dirty } });
      expect(result.status).toBe(0);
      expect(result.stderr).toContain("no transcripts are read");
      expect(result.stdout).toContain("unknown");
      expect(result.stdout).not.toMatch(/\tsafe\t/);
      expect(result.stdout).toContain(dirty.startsWith(" M") ? "hold-wip" : "verify-activity");
      expect(existsSync(probe)).toBe(false);
    }
    const source = readFileSync(script, "utf8");
    expect(source).not.toContain("$HOME");
    expect(source).not.toContain("rg -l");
  } finally { rmSync(root, { recursive: true, force: true }); }
});
