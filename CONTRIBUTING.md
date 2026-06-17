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

- Keep runtime paths in `src/paths.js`.
- Keep hook installation idempotent and preserve unrelated user hooks.
- Keep `AGENTS.md` and `CLAUDE.md` byte-for-byte identical.
- Keep `skill/get-oriented/SKILL.md` frontmatter limited to `name` and `description`.
- Do not write tests that touch the developer's real `~/.claude` directory.

## Pull Requests

Good pull requests include:

- a short explanation of the behavior change
- a focused regression test when changing engine, installer, or skill behavior
- updated README or project docs when user-facing behavior changes

For larger changes, please open an issue first so the design can be discussed.
