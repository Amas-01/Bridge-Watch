# Build Cache Matrix

This document defines which build artifacts are cached in CI/CD workflows, when cache keys should invalidate, and who owns ongoing cache hygiene.

## Purpose

- reduce CI wall-clock time by reusing stable artifacts.
- avoid stale outputs by defining explicit invalidation rules.
- ensure cache usage does not leak secrets or unsafe artifacts.

## Workflow Cache Matrix

| Workflow | Job | Cache backend | Cache path(s) | Primary key inputs | Restore strategy | Platform scope | Owner |
|---|---|---|---|---|---|---|---|
| `.github/workflows/ci.yml` | `node-ci` | `setup-node` + `actions/cache` | npm global cache via `setup-node`; `backend/dist`, `backend/coverage`, `backend/.eslintcache` | OS, `CACHE_VERSION`, `package-lock.json`, `backend/package.json`, `ci.yml`, backend source/tests | two restore prefixes (lock/workflow hash, then version-only) | `ubuntu-latest` | Platform Engineering |
| `.github/workflows/ci.yml` | `frontend` | `setup-node` + `actions/cache` | npm global cache via `setup-node`; `frontend/dist`, `frontend/storybook-static`, `frontend/.eslintcache`, `frontend/.vite` | OS, `CACHE_VERSION`, `package-lock.json`, `frontend/package.json`, `ci.yml`, frontend source/tests | two restore prefixes (lock/workflow hash, then version-only) | `ubuntu-latest` | Frontend + Platform Engineering |
| `.github/workflows/ci.yml` | `rust-ci` | `actions/cache` | `~/.cargo/bin`, `~/.cargo/registry/index`, `~/.cargo/registry/cache`, `~/.cargo/git/db`, `contracts/target` | OS + `contracts/Cargo.lock` hash | exact key restore | `ubuntu-latest` | Smart Contracts Team |
| `.github/workflows/docker.yml` | `build-and-push` | Docker Buildx GHA cache | layer cache (`cache-from: type=gha`, `cache-to: type=gha,mode=max`) | Dockerfile/context state managed by BuildKit | BuildKit internal restore | `ubuntu-latest` | Platform Engineering |
| `.github/workflows/release.yml` | `build-and-publish-images` | Docker Buildx GHA cache | backend and frontend image layers | Dockerfile/context state managed by BuildKit | BuildKit internal restore | `ubuntu-latest` | Platform Engineering |

## Invalidation Rules

### Node and TypeScript artifacts

Invalidate when any of the following changes:

- root `package-lock.json` or workspace `package.json` files.
- workflow cache key templates in `.github/workflows/ci.yml`.
- source/test trees included in key hashing.
- explicit `CACHE_VERSION` bump.

### Rust/Cargo artifacts

Invalidate when `contracts/Cargo.lock` changes.

Recommended manual invalidation triggers:

- Rust toolchain major update.
- Soroban SDK major update.
- target directory layout changes.

### Docker layer cache

Invalidates naturally when:

- Dockerfile instruction changes.
- copied build context files change.
- base image digests update.

## Platform Coverage

- current workflows execute on `ubuntu-latest` only.
- cache keys are OS-scoped using `${{ runner.os }}` where explicit keys are defined.
- if macOS or Windows runners are introduced, add dedicated cache keys per OS and confirm path semantics.

## Security and Safety Notes

- never cache secret files (`.env`, key material, deployment credentials).
- avoid caching runtime data stores (PostgreSQL data, Redis data) in CI.
- cache only reproducible build artifacts and dependency stores.
- use lockfile-based keys for dependency caches to reduce poisoned-cache risk.
- prefer additive restore keys only where stale artifact risk is acceptable.

## Operational Guidance

### What to monitor

- cache hit/miss ratios by job.
- build duration changes after dependency or workflow updates.
- stale artifact behavior (unexpected compile/test outcomes).

### Hygiene checklist

1. review cache key inputs quarterly.
2. bump `CACHE_VERSION` when stale builds are suspected.
3. prune oversized or low-value cache targets.
4. validate restore-key behavior after major refactors.

## Ownership

| Cache domain | Primary owner | Backup owner |
|---|---|---|
| Node/backend cache | Platform Engineering | Backend Team |
| Frontend build cache | Frontend Team | Platform Engineering |
| Cargo/contracts cache | Smart Contracts Team | Platform Engineering |
| Docker layer cache | Platform Engineering | DevOps / Infrastructure |

## Related References

- [CI/CD Quick Reference](./CI-CD-QUICK-REFERENCE.md)
- [CI/CD Setup](./CI-CD-SETUP.md)
- [CICD Overview](./CICD.md)
- [Command Log Archive Policy](./infra/command-log-archive.md)