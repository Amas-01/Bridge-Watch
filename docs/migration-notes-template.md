# Migration Notes Template

Use this template for each release that introduces breaking changes or migration-sensitive behavior.

## How to Use

1. Copy this template into release notes or PR description.
2. Fill all sections that apply.
3. Link completed notes from `docs/API_CHANGELOG.md` under the relevant version.
4. Attach notes to the release ticket before production deployment.

---

## Migration Summary

- **Release version:**
- **Date:**
- **Owner:**
- **Affected domains:** (API, data model, contracts, frontend, infra)
- **Migration required:** Yes / No

## Breaking Changes

Describe incompatible behavior changes.

- **Change 1:**
- **Impact:**
- **Affected consumers:**
- **Mitigation:**

## Upgrade Steps

List the required order of operations.

1. 
2. 
3. 

## Configuration Changes

- **New environment variables:**
- **Changed defaults:**
- **Removed settings:**

## Data and Schema Changes

- **Migrations applied:**
- **Backfill required:** Yes / No
- **Estimated runtime:**
- **Rollback impact:**

## Compatibility Notes

- **Backward compatibility window:**
- **Supported old versions:**
- **Deprecation timeline:**

## Rollback Notes

Document safe rollback criteria and procedure.

- **Rollback trigger criteria:**
- **Rollback steps:**
- **Data recovery considerations:**

## Verification Checklist

- [ ] Health endpoints are green (`/health`, `/health/ready`, `/health/detailed`).
- [ ] Critical API paths return expected responses.
- [ ] Queue workers and schedulers are healthy.
- [ ] Metrics and alert baselines are normal.
- [ ] No unexpected error-rate spike.

## Example Filled Entry (Abbreviated)

- **Release version:** `v1.6.0`
- **Migration required:** Yes
- **Breaking change:** `risk_score` removed; use `risk_score_bps`.
- **Upgrade step:** update client payload schema before write operations.
- **Rollback note:** rollback blocked if new schema rows are committed without conversion script.

---

When no migration is required, keep a short note:

`No migration required. This release is backward compatible.`