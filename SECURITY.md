# Security Policy

## Reporting A Vulnerability

Please do not open a public issue for a suspected vulnerability.

Send a private report to `avifenesh@gmail.com` with:

- the affected version or commit
- a short reproduction or proof of impact
- whether local transcript data, hook execution, or package install behavior is involved

You should receive an initial response within 7 days.

## Data Boundary

orientation reads local Claude Code transcript JSONL and writes derived graph data locally. It does not send transcript contents, source code, prompts, or graph data to a remote service.

Derived data can include prompt snippets, file paths, command names, and commit messages. Treat generated graph data as local developer data.
