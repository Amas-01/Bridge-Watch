# Domain Glossary

## Terms

| Term | Definition |
|------|-----------|
| **Stellar Bridge Watch** | Open-source monitoring platform for cross-chain asset bridges, DEX liquidity, and bridged asset health on the Stellar network. |
| **Bridge** | A protocol that enables asset transfers between Stellar and other blockchain networks (Ethereum, Solana, etc.). |
| **Soroban** | Stellar's smart contract platform, built with Rust/WASM, used for bridge logic and state management. |
| **Bridge Contract** | A Soroban smart contract that manages cross-chain asset transfers and bridge state. |
| **Transfer State Machine** | The state machine governing bridge transfer lifecycle: initiated, confirming, completed, failed, disputed. |
| **Health Score** | A composite metric ranking each bridged asset by liquidity depth, volatility, bridge solvency, and oracle freshness. |
| **Alert Routing Engine** | A rule-based system that evaluates incoming alert events against user-defined routing rules. |
| **Alert Rule** | A user-defined condition that determines when and how an alert is triggered and delivered. |
| **Webhook Delivery System** | A reliable delivery mechanism that sends alert notifications to external endpoints. |
| **Anomaly Detection Engine** | A service that analyzes metric streams to detect abnormal patterns in bridge operations. |
| **Outbox** | A reliable event-dispatching pattern ensuring at-least-once delivery of domain events to downstream systems. |
| **Event Federation** | A service that streams real-time events to connected clients and external subscribers. |
| **Bridge Watch SDK** | TypeScript SDK (`@bridge-watch/contract-sdk`) for integrating Soroban contracts with the monitoring platform. |
| **KPI Drilldown** | The ability to click on a dashboard metric and navigate to its detailed breakdown view. |
| **Checkpoint** | A snapshot of bridge state at a given block height, used for reconciliation and audit. |
| **Reconciliation** | The process of comparing bridge state across chains to detect discrepancies. |
| **Liquidity Fragmentation** | The distribution of liquidity across multiple bridge providers, measured by the fragmentation index. |
| **Circuit Breaker** | A security mechanism that halts bridge operations when certain risk thresholds are exceeded. |
| **Rate Limiting** | A sliding-window Redis-based system that limits API request rates per client. |
| **Usage Metrics** | Lightweight request counters stored as Redis sorted sets for query analytics. |

## Entities

| Entity | Description |
|--------|-----------|
| **Asset** | A bridged cryptocurrency or token monitored by the platform (e.g., USDC, ETH, BTC). |
| **Bridge Provider** | A third-party bridge service integrated with the platform (e.g., Stellar-Terminal, BridgeNetwork). |
| **Pool** | A liquidity pool on a DEX tracked for bridge-backed asset health. |
| **Alert** | A notification generated when a monitored metric crosses a defined threshold. |
| **Incident** | A tracked event representing service degradation or failure requiring investigation. |
| **Webhook** | An HTTP callback configured by users to receive alert notifications. |
| **Watchlist** | A user-defined list of assets for focused monitoring and alerting. |
| **API Key** | An authentication credential for programmatic access to the Bridge Watch API. |
| **Dashboard** | A Grafana dashboard displaying system metrics, health scores, and alert volumes. |
| **Service Account** | An automated account used for internal system-to-system communication. |

## Abbreviations

| Abbreviation | Full Form |
|-------------|-----------|
| **TVL** | Total Value Locked |
| **DEX** | Decentralized Exchange |
| **KPI** | Key Performance Indicator |
| **HPA** | Horizontal Pod Autoscaler |
| **PDB** | Pod Disruption Budget |
| **RBAC** | Role-Based Access Control |
| **WASM** | WebAssembly |
| **RPC** | Remote Procedure Call |
| **IaC** | Infrastructure as Code |
| **API** | Application Programming Interface |
| **SDK** | Software Development Kit |
| **CI/CD** | Continuous Integration / Continuous Deployment |
| **CLI** | Command-Line Interface |
| **JSON** | JavaScript Object Notation |
| **TSV** | Tab-Separated Values |

## Workflows

| Workflow | Description |
|----------|-----------|
| **CI** | Runs lint, build, and test for backend, frontend, and contracts on push/PR. |
| **Docker Build** | Builds and pushes Docker images to GitHub Container Registry. |
| **Deployment** | Deploys to staging (develop) or production (main with approval) after Docker build. |
| **Release** | Creates GitHub releases with changelog, contract artifacts, and Docker images. |
| **Release Shield** | A multi-gate validation that runs before a release is published. |
| **E2E Tests** | Runs Playwright E2E tests across Chromium, Firefox, WebKit, and mobile. |
| **Integration Tests** | Runs backend unit and integration tests with PostgreSQL and Redis services. |
| **Load Testing** | Runs k6 load tests with smoke, ramp, spike, and endurance profiles. |
| **Security Scan** | Runs CodeQL, npm audit, and Rust audit scans. |
| **Dependency Update** | Weekly automated PRs for NPM and Cargo dependency updates. |
| **Release Dry-Run** | Pre-release validation without publishing artifacts. |

## Architecture Layers

| Layer | Description |
|-------|-----------|
| **Frontend** | React 18 + TypeScript + Vite web application with TailwindCSS and Recharts. |
| **Backend API** | Node.js + Fastify REST API with PostgreSQL/TimescaleDB and Redis/BullMQ. |
| **Smart Contracts** | Soroban (Rust/WASM) contracts deployed on the Stellar network. |
| **SDK** | TypeScript library for Soroban contract integration. |
| **Infrastructure** | Docker Compose for local dev, Kubernetes for production, Terraform for cloud IaC. |
| **Monitoring** | Prometheus + Grafana for metrics, Loki for logs, Tempo for traces. |

## Maintenance

This glossary should be updated whenever new domain terms, entities, or abbreviations are introduced into the codebase or documentation. To update:

1. Add new terms in alphabetical order within each section.
2. Link terms to their source code or documentation files where applicable.
3. Keep definitions concise (1-2 sentences).
4. Review and prune outdated entries during each release cycle.
