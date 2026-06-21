# Contributing

Thanks for helping make orientation more reliable for real agent workflows.

## Development

orientation is intentionally small:

- Node.js 18 or newer
- CommonJS modules
- no runtime dependencies
- local files only; no model or network calls in the engine

Run the checks before opening a pull request:

```bash
npm test
npm run pack:check
```

## What To Preserve

- Keep runtime paths centralized and self-locating in `src/state.js` (do not reintroduce `paths.js`, the old `__dirname`-vs-default inference, or hardcoded user paths).
- Keep hook installation idempotent, preserve unrelated user hooks, and keep the `ORIENTATION_HOOK=1` sentinel on owned hooks.
- Keep the dual install shape working: marketplace `/plugin install` runs no npm step, so `.claude-plugin/plugin.json`, the auto-discovered `skills/` dir, and `hooks/hooks.json` must stay self-contained.
- Keep the skill at `skills/get-oriented/SKILL.md` (plural) with frontmatter limited to `name` and `description`.
- Keep `AGENTS.md` and `CLAUDE.md` byte-for-byte identical.
- Do not write tests that touch the developer's real `~/.claude`, `~/.codex`, or `~/.eigen` directories.

## Pull Requests

Good pull requests include:

- a short explanation of the behavior change
- a focused regression test when changing engine, installer, or skill behavior
- updated README or project docs when user-facing behavior changes

For larger changes, please open an issue first so the design can be discussed.
