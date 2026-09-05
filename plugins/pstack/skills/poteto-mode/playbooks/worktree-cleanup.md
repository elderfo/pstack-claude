### Worktree and simulator cleanup

**You own the disk and the safety gate.** Prune merged or abandoned git worktrees and stale iOS simulators to reclaim space. Deletion is irreversible, so every step guards against deleting something in use or holding uncommitted work.

1. Snapshot and audit. Record `df -h /`, then run `skills/poteto-mode/scripts/worktree-audit.sh` under the installed plugin (principle-build-the-lever). It reads paths from `git worktree list` and reports size, age, merge state, uncommitted work and PR state. It never reads transcripts; `LAST_CHAT` is `unknown` and candidates need `verify-activity`. Missing activity evidence is not safe.
2. The bucket is advice, not permission. Obtain an independent current active/pinned-session and retained-child inventory from the user or an authorized runtime view. Cross-check every candidate, including worktrees used by a child of a session in another directory. Never enumerate unrelated transcript stores. An absent transcript or old mtime does not prove inactivity.
3. If usage remains unknown, keep the worktree. Use only explicitly authorized session files when transcript evidence is needed; it cannot prove current pinned/running status on its own. Record the independent liveness check and its scope.
4. Show exact candidate paths and any tracked/untracked files, merge/PR evidence, and active-session checks; request human approval before deletion. `wip:N` and `scratch:N` both require inspection, not an assumption that untracked files are disposable. Preserve active or unknown worktrees. Approval never follows merely from a clean/merged bucket.
5. Prune the confirmed set. Per path, `git worktree remove --force <path>`; if the dir survives on ignored build artifacts, `rm -rf` it, then `git worktree prune`. Branch refs survive, so no commits are lost. Confirm with `df -h /` and re-list.
6. Simulators and other reclaimers. Simulators are usually the next-biggest win. `xcrun simctl --set testing delete all` (XCTestDevices clones), `xcrun simctl delete unavailable`, and `xcrun simctl runtime list` then `runtime delete <id>` for old runtimes. More when needed: Xcode `DerivedData` and `iOS DeviceSupport`; your editor's application-support caches; old runtime shell snapshots and transcripts, keeping the recent current-workspace records the **recall** skill and Session pickup read; package caches (pnpm, uv, brew, yarn). Clear only caches the user has not said to keep.

This is the one playbook that deletes user state with no code review to catch a slip, so the gates above are the review.

**Reply:** `df -h /` before and after with space reclaimed, the worktrees pruned, and a one-line reason for each held back (in-use by which chat, or uncommitted work).
