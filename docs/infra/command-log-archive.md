# Command Log Archive Policy

Bridge-Watch archives key CI and release command output so failed runs can be investigated after the live GitHub Actions log view expires or becomes hard to search.

## What is archived

The CI workflow writes one log file per key command group:

- dependency installation;
- backend lint, build, migration, and test commands;
- frontend lint, build, Storybook, unit test, and visual regression commands;
- Rust format, clippy, build, and test commands.

Each job also writes `COMMANDS.tsv`, `MANIFEST.tsv`, and `FILES.txt` into the archive before compression.

## Retention window

Command log archives uploaded from GitHub Actions use a 30-day retention window. This matches the troubleshooting window for short-lived CI failures and keeps storage use bounded.

For release investigations that must survive longer than 30 days, attach the compressed command-log archive to the GitHub Release alongside build artifacts.

## Searchability

Archives are compressed as `.tar.gz` files. After downloading an archive, extract it and search with standard command-line tools:

```bash
tar -xzf command-logs-*.tar.gz -C ./command-logs
grep -R "error\|failed\|panic\|warning" ./command-logs
cat ./command-logs/COMMANDS.tsv
```

`COMMANDS.tsv` maps logical step names to log file names. `MANIFEST.tsv` records workflow, job, run id, attempt, ref, and commit SHA.

## Artifact links

For CI runs:

1. Open the workflow run.
2. Scroll to **Artifacts**.
3. Download the artifact named `command-logs-<workflow>-<job>-<run>-<attempt>.tar.gz`.
4. Extract and search locally.

For releases:

1. Open the GitHub Release.
2. Check release assets for a command-log archive.
3. Download the `.tar.gz` archive and inspect it with the same commands above.

## Access control

Command logs are stored as GitHub Actions artifacts and, where applicable, GitHub Release assets. Access is controlled by GitHub repository permissions:

- public artifacts/assets are visible according to the repository visibility and GitHub Actions settings;
- private or restricted repositories require users to have repository access;
- secrets must not be printed in command output;
- workflow steps should rely on GitHub secret masking and must not echo raw token values.

## Compression

Archives are created with `tar -czf` and use gzip compression. This keeps related logs, indexes, and manifests together while remaining easy to download and inspect with default UNIX tooling.

## Release workflow note

Release jobs should call `bash scripts/archive-command-logs.sh` after build commands and upload the generated `${COMMAND_LOG_ARCHIVE}` as both:

- a GitHub Actions artifact with 30-day retention;
- a GitHub Release asset when the job has release upload permissions.

The archive file path and archive name are exported by `scripts/archive-command-logs.sh` through `GITHUB_ENV` as `COMMAND_LOG_ARCHIVE` and `COMMAND_LOG_ARCHIVE_NAME`.

## PR checklist

- [ ] CI command logs upload successfully for backend, frontend, and Rust jobs.
- [ ] Release jobs attach compressed command-log archives to release assets.
- [ ] The PR includes a closing reference to the assigned issue.
- [ ] No secrets or credentials are printed into command logs.
