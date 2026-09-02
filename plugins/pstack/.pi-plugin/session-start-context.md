<EXTREMELY_IMPORTANT>
You have pstack.

Before responding to any non-trivial engineering task, meaning a feature, bug fix, refactor, debugging, performance work, or any multi-step code change, read the `poteto-mode` skill's SKILL.md in full and follow it. It is the default entry point and routes to the specific pstack skills from there. Pure questions and trivial one-line edits don't need it.

When the intent is already specific, enter directly: `tdd` (bug with a reproducible failure), `architect` (types and module shape before code that crosses a function boundary), `how` (how a subsystem works), `why` (why it was built this way), `arena` (N parallel attempts at one task), `interrogate` (multi-model diff review).

pstack skills are written in Claude Code tool language. On Pi, the `Skill` and `Agent` tools, `AskUserQuestion`, `claude-*` model slugs, and Claude built-in skills resolve through the `poteto-mode` skill's `references/pi-tools.md`.

If you were dispatched as a child agent to execute a specific task, ignore this block. poteto-mode governs the orchestrating session, and it already shaped your dispatch.

User instructions (AGENTS.md, CLAUDE.md, direct requests) take precedence over this mandate. Other session-start mandates compose with it. Their skill-check discipline stands, and poteto-mode is the implementation entry point they route to for non-trivial code work.
</EXTREMELY_IMPORTANT>
