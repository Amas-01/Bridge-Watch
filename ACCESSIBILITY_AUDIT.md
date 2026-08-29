# Accessibility Audit Report

## Overview
This document records the accessibility status of the **Bridge‑Watch** web application. It focuses on the most important UI views, highlights any accessibility gaps, and provides recommendations for remediation and future maintenance.

---

## Table of Contents
1. [Dashboard Page](#dashboard-page)
2. [Assets Page](#assets-page)
3. [Bridges Page](#bridges-page)
4. [Watchlist Widget](#watchlist-widget)
5. [Export & Share Dialogs](#export--share-dialogs)
6. [General Accessibility Findings](#general-accessibility-findings)
7. [Issue Tracking & Follow‑up](#issue-tracking--follow‑up)
8. [Maintenance & Execution Recommendations](#maintenance--execution-recommendations)

---

## Dashboard Page
- **Keyboard navigation** – All interactive elements (filters, tabs, buttons, drill‑down cards) are reachable via `Tab`. Focus order follows visual order. The `Select` for bridge status filter has a visible focus ring.
- **Screen reader** – ARIA labels are provided for filter controls (`aria-label="Filter bridges by status"`). The `Tabs` component uses `role="tablist"` and proper `aria-selected` attributes.
- **Color contrast** – Primary text meets WCAG AA (ratio ≥ 4.5:1). Some decorative icons use a lower contrast (≈3.2:1) but are non‑informative.
- **Known gaps** – The **Refresh** button lacks an explicit `aria‑pressed` state and does not announce loading status to screen readers.
- **Related component** – `src/components/dashboard/KpiBanner.tsx`, `src/components/dashboard/DrilldownDrawer.tsx`.

---

## Assets Page
- **Keyboard navigation** – Asset cards are focusable; however the **Inspect** button inside each card does not have a visible focus style.
- **Screen reader** – Asset names are rendered inside `<h2>` elements, but the health score is only displayed as plain text; should be wrapped with `role="status"`.
- **Color contrast** – The **Improving** badge uses a green shade with sufficient contrast; the **Critical** badge fails AA on the dark background (ratio 3.9:1).
- **Known gaps** – Missing `aria‑live` region for dynamic loading of assets.
- **Related component** – `src/components/AssetDiscoverySection.tsx`.

---

## Bridges Page
- **Keyboard navigation** – Bridge cards can be tabbed to; the **Inspect bridge details** button is correctly labeled.
- **Screen reader** – Bridge status is conveyed via text, but the mismatched percentage is only visual; add `aria‑description`.
- **Color contrast** – Status labels use a blue hue with sufficient contrast; the **Down** status uses a light gray that fails WCAG AA.
- **Known gaps** – No skip‑link to jump directly to the bridge list.
- **Related component** – `src/components/BridgeStatusCard.tsx`.

---

## Watchlist Widget
- **Keyboard navigation** – All watchlist items are reachable, but the **Remove** icon button lacks a descriptive `aria‑label`.
- **Screen reader** – The widget provides a heading (`h3`) but does not announce the count of items.
- **Color contrast** – Adequate.
- **Known gaps** – Add `aria‑label="Remove {asset} from watchlist"` to the delete button.
- **Related component** – `src/components/watchlist/WatchlistWidget.tsx`.

---

## Export & Share Dialogs
- **Keyboard navigation** – Dialog traps focus correctly; tab order inside the dialog is logical.
- **Screen reader** – Dialog has `role="dialog"` and `aria‑modal="true"`. The **Copy link** button does not announce success; add an `aria‑live` region.
- **Color contrast** – Buttons meet AA.
- **Known gaps** – Provide a success toast with `role="alert"` for copy actions.
- **Related components** – `src/components/ExportPickerDialog.tsx`, `src/components/DashboardSharingModal.tsx`.

---

## General Accessibility Findings
- **Focus styles** – Consistent focus ring across the app, but a few custom components (`BridgeStatusCard`, asset cards) miss the `outline` style.
- **ARIA landmarks** – Main sections lack `role="main"` or `nav` landmarks; adding them improves navigation for assistive technologies.
- **Live regions** – Dynamic content updates (e.g., KPI banner) are not announced; consider adding `aria‑live="polite"` where appropriate.
- **Form controls** – All form controls have associated labels.

---

## Issue Tracking & Follow‑up
- **Issue #42** – Refresh button loading announcement.
- **Issue #43** – Critical badge contrast on Assets page.
- **Issue #44** – Down status contrast on Bridges page.
- **Issue #45** – Add `aria‑label` to Watchlist remove button.
- **Issue #46** – Add `aria‑live` region for copy‑link success.
- **Issue #47** – Ensure focus ring on custom cards.
- **Issue #48** – Add main landmark markup.

Each issue should be tagged with `accessibility` and linked to the relevant component PR.

---

## Maintenance & Execution Recommendations
1. **Run automated audits** – Integrate `axe-core` with the CI pipeline (`npm run lint:accessibility`).
2. **Periodic manual testing** – Quarterly manual keyboard and screen‑reader testing sessions.
3. **Documentation** – Keep this file up‑to‑date; add a checklist section to the development guide.
4. **Version notes** – When a UI change affecting accessibility is merged, add a short note under the version heading in this file.

---

*Closing reference: this PR addresses the Accessibility Audit Report issue.*
