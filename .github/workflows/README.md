# GitHub Actions Workflows

This directory contains the CI/CD pipeline configuration for Stellar Bridge Watch.

## Workflows Overview

### 1. CI Workflow (`ci.yml`)

**Trigger:** Push to `main`/`develop` branches, Pull Requests

**Purpose:** Automated testing and build verification for all packages

**Jobs:**

- **Backend Tests**: Runs linting, builds, and tests with PostgreSQL and Redis services
- **Frontend Build**: Lints, type-checks, and builds the frontend application
- **Contracts**: Builds Soroban contracts, runs tests, and performs Rust quality checks
- **Docker Build**: Verifies Docker images can be built successfully
- **Status Check**: Aggregates all job results for branch protection

**Coverage:** Test coverage reports are uploaded to Codecov (requires `CODECOV_TOKEN` secret)

### 2. Deploy Workflow (`deploy.yml`)

**Trigger:** Push to `main`/`develop` branches, Manual workflow dispatch

**Purpose:** Build Docker images and deploy to staging/production environments

**Jobs:**

- **Build and Push**: Builds and pushes Docker images to GitHub Container Registry
- **Deploy Staging**: Deploys to staging environment (from `develop` branch)
- **Deploy Production**: Deploys to production environment (from `main` branch, requires approval)
- **Rollback**: Automatic rollback on deployment failure

**Environments:**

- **Staging**: `https://staging.stellarbridgewatch.io`
- **Production**: `https://stellarbridgewatch.io` (requires manual approval)

**Required Secrets:**

- `GITHUB_TOKEN` (automatically provided)

### 3. Release Workflow (`release.yml`)

**Trigger:** Push tags matching `v*.*.*`, Manual workflow dispatch

**Purpose:** Create GitHub releases and publish artifacts

**Jobs:**

- **Create Release**: Generates changelog and creates GitHub release
- **Build Contracts**: Compiles and uploads Soroban contract artifacts
- **Build and Publish Images**: Tags and publishes Docker images with version numbers
- **Publish NPM**: Publishes packages to NPM (currently disabled)
- **Notify Release**: Sends notifications about release status

**Artifacts:**

- Compiled Soroban contracts (`.wasm` files)
- Docker images tagged with version and `latest`

**Required Secrets:**

- `GITHUB_TOKEN` (automatically provided)
- `NPM_TOKEN` (if NPM publishing is enabled)

**Release Shield:**

- Runs before a GitHub release or release artifact can be published.
- Requires successful `CI`, `Code Quality`, and `Security Scanning` workflow runs for the exact release commit.
- Probes every comma-separated readiness endpoint in the `RELEASE_HEALTH_URLS` repository variable.
- Rebuilds the backend, frontend, and Soroban WASM artifacts from locked dependencies.
- Blocks promotion if any gate fails. Frontend image publication failures are not ignored.
- A manual dispatch can request an emergency override, but the actor must have `maintain` or `admin` permission and provide an audit reason of at least 10 characters. Overrides are unavailable to tag-triggered releases.
- Set `RELEASE_REQUIRED_WORKFLOWS` to a comma-separated list to customize the required workflow names.

The release dry-run calls the same shield with external health and prior-workflow evidence disabled, and runs the shield in report-only mode so PR checks still continue to the concrete dry-run jobs. Metadata and artifact gates still run and are written to the GitHub Actions job summary, but only the real release workflow enforces the shield decision.

### 4. Code Quality Workflow (`code-quality.yml`)

**Trigger:** Pull Requests, Push to `main`/`develop` branches

**Purpose:** Enforce code quality standards

**Jobs:**

- **ESLint Analysis**: Runs ESLint on TypeScript/JavaScript code
- **Rust Clippy**: Runs Clippy linter on Rust contracts
- **Dependency Review**: Reviews dependency changes in PRs for security issues
- **Code Quality Summary**: Aggregates results in GitHub summary

### 5. Security Scanning Workflow (`security.yml`)

**Trigger:** Push to `main`/`develop`, Pull Requests, Daily schedule (2 AM UTC)

**Purpose:** Identify security vulnerabilities

**Jobs:**

- **NPM Audit**: Scans Node.js dependencies for vulnerabilities
- **Cargo Audit**: Scans Rust dependencies for security issues
- **CodeQL Analysis**: Performs static code analysis for security vulnerabilities
- **Trivy Scan**: Scans filesystem and containers for vulnerabilities
- **Secret Scan**: Detects accidentally committed secrets using TruffleHog
- **Security Summary**: Aggregates all security scan results

**Security Reports:** Results are uploaded to GitHub Security tab

### 6. Dependency Update Workflow (`dependency-update.yml`)

**Trigger:** Weekly schedule (Monday 9 AM UTC), Manual workflow dispatch

**Purpose:** Keep dependencies up to date

**Jobs:**

- **NPM Update**: Updates Node.js dependencies and creates PR
- **Cargo Update**: Updates Rust dependencies and creates PR

**Automation:** Creates pull requests with dependency updates for review

## Setup Instructions

### 1. Required Secrets

Configure these secrets in your repository settings (`Settings > Secrets and variables > Actions`):

- `CODECOV_TOKEN`: Token for uploading test coverage (optional)
- `NPM_TOKEN`: NPM authentication token for publishing packages (if enabled)
- `SLACK_WEBHOOK_URL`: Webhook URL for Slack notifications (optional)

### 2. Environment Configuration

Configure deployment environments in repository settings (`Settings > Environments`):

**Staging Environment:**

- Name: `staging`
- URL: `https://staging.stellarbridgewatch.io`
- Protection rules: None (auto-deploy)

**Production Environment:**

- Name: `production`
- URL: `https://stellarbridgewatch.io`
- Protection rules: Required reviewers (recommended)

### 3. Branch Protection Rules

Recommended branch protection for `main` and `develop`:

1. Go to `Settings > Branches > Add rule`
2. Branch name pattern: `main` or `develop`
3. Enable:
   - ✅ Require a pull request before merging
   - ✅ Require status checks to pass before merging
     - Required checks: `CI Status Check`, `Code Quality Summary`, `Security Summary`
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings

### 4. GitHub Container Registry

Docker images are pushed to GitHub Container Registry (ghcr.io). To pull images:

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull images
docker pull ghcr.io/OWNER/REPO/backend:latest
docker pull ghcr.io/OWNER/REPO/frontend:latest
```

### 5. Deployment Configuration

The deployment workflows include placeholder deployment commands. Update these based on your infrastructure:

**For Kubernetes:**

```yaml
- name: Deploy to production
  run: |
    kubectl set image deployment/backend backend=${{ needs.build-and-push.outputs.backend-tag }}
    kubectl rollout status deployment/backend
```

**For Docker Compose:**

```yaml
- name: Deploy to production
  run: |
    docker-compose pull
    docker-compose up -d
```

**For Cloud Platforms:**

- AWS ECS: Use `aws ecs update-service`
- Google Cloud Run: Use `gcloud run deploy`
- Azure Container Apps: Use `az containerapp update`

## Workflow Badges

Add these badges to your README.md:

```markdown
[![CI](https://github.com/OWNER/REPO/actions/workflows/ci.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/ci.yml)
[![Security](https://github.com/OWNER/REPO/actions/workflows/security.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/security.yml)
[![Deploy](https://github.com/OWNER/REPO/actions/workflows/deploy.yml/badge.svg)](https://github.com/OWNER/REPO/actions/workflows/deploy.yml)
```

## Notifications

To enable notifications on workflow failures:

### Slack Integration

1. Create a Slack webhook: https://api.slack.com/messaging/webhooks
2. Add `SLACK_WEBHOOK_URL` secret to repository
3. Update notification steps in workflows:

```yaml
- name: Notify on failure
  if: failure()
  run: |
    curl -X POST -H 'Content-type: application/json' \
      --data '{"text":"❌ Workflow failed: ${{ github.workflow }} on ${{ github.ref }}"}' \
      ${{ secrets.SLACK_WEBHOOK_URL }}
```

### Discord Integration

1. Create a Discord webhook in your server settings
2. Add `DISCORD_WEBHOOK_URL` secret
3. Use similar curl command with Discord webhook format

## Troubleshooting

### Common Issues

**1. Docker build fails with "no space left on device"**

- Solution: GitHub Actions runners have limited disk space. Use `docker system prune` before builds

**2. Tests fail with database connection errors**

- Solution: Ensure service containers are healthy before running tests (check `options` in service definition)

**3. Coverage upload fails**

- Solution: Verify `CODECOV_TOKEN` is set correctly and coverage files are generated

**4. Deployment fails with authentication errors**

- Solution: Check that deployment credentials are configured correctly in secrets

### Debugging Workflows

Enable debug logging:

1. Go to `Settings > Secrets and variables > Actions`
2. Add repository variable: `ACTIONS_STEP_DEBUG` = `true`
3. Re-run failed workflow

## Maintenance

### Regular Tasks

- **Weekly**: Review dependency update PRs
- **Monthly**: Review and update workflow versions (actions/checkout, etc.)
- **Quarterly**: Review security scan results and update policies
- **As needed**: Update deployment scripts when infrastructure changes

### Updating Actions

Keep GitHub Actions up to date:

```bash
# Check for outdated actions
gh api repos/:owner/:repo/actions/workflows --jq '.workflows[].path' | \
  xargs -I {} grep -h "uses:" {} | sort -u
```

## Contributing

When modifying workflows:

1. Test changes in a feature branch first
2. Use `workflow_dispatch` trigger for manual testing
3. Document any new secrets or configuration requirements
4. Update this README with changes

## Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Docker Build Push Action](https://github.com/docker/build-push-action)
- [CodeQL Action](https://github.com/github/codeql-action)
- [Trivy Security Scanner](https://github.com/aquasecurity/trivy-action)
