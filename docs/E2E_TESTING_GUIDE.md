# End-to-End Testing Guide

This project uses Playwright for end-to-end (E2E) testing of critical user flows.

## Goals

- Validate high-value user journeys from UI entrypoint to routed pages.
- Catch cross-browser regressions early.
- Support stable CI execution with retries, traces, screenshots, and video evidence.

## Current Coverage

- Landing page renders and routes to Dashboard.
- Dashboard renders key widgets with mocked backend responses.
- Dashboard customization panel interactions.
- Bridges page renders bridge cards.
- Mobile navigation menu flow to Bridges page.

## Test Architecture

- `e2e/tests`: Test specs focused on user behavior.
- `e2e/pages`: Page Object Models to keep selectors and interactions centralized.
- `e2e/fixtures`: Deterministic test data fixtures.
- `e2e/utils/mockApi.ts`: API interception and mocked responses.

## Running Tests

From repository root:

- `npm run test:e2e` - Run all E2E tests.
- `npm run test:e2e:headed` - Run in headed mode for local debugging.
- `npm run test:e2e:ui` - Open Playwright UI mode.
- `npm run test:e2e:report` - View generated HTML report.

## Browser and Device Matrix

Playwright projects currently run:

- Chromium (Desktop)
- Firefox (Desktop)
- WebKit (Desktop)
- Pixel 7 (Mobile viewport + user agent)

## Failure Evidence and Reporting

- Screenshot capture on failure (`only-on-failure`).
- Video capture retained for retries/failures.
- Trace capture on first retry.
- CI artifacts uploaded:
  - `playwright-report`
  - `test-results` (includes JUnit + JSON outputs)

## Flaky Test Handling

- Retries enabled (`2` in CI, `1` locally).
- API requests are mocked for deterministic responses.
- Assertions use semantic roles and visible text over unstable DOM structure.

## Test Data Management Pattern

- Keep realistic, minimal fixtures in `e2e/fixtures`.
- Add/modify fixture files for new flows instead of hardcoding payloads in specs.
- Use route-level mock handlers in `mockApi.ts` so multiple tests reuse the same setup.
- See [FIXTURE_AUDIT_REPORT.md](./FIXTURE_AUDIT_REPORT.md) for the full fixture inventory, ownership, and update process.

**Note:** `mockApi.ts` builds responses from `frontend/src/test/factories.ts` rather than loading `e2e/fixtures/*.json` directly. JSON fixtures are schema-validated in CI (`fixtures:validate`); keep factory defaults aligned when API shapes change.

## CI Integration

GitHub Actions workflow: `.github/workflows/e2e.yml`

CI workflow installs dependencies, installs Playwright browsers, runs E2E tests, and uploads reports/results for debugging.
