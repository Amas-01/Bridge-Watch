# CI/CD Pipeline Setup Guide

This document provides a comprehensive guide to the CI/CD pipeline implementation for Stellar Bridge Watch using GitHub Actions.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Workflows](#workflows)
4. [Setup Instructions](#setup-instructions)
5. [Deployment Process](#deployment-process)
6. [Security](#security)
7. [Monitoring and Notifications](#monitoring-and-notifications)
8. [Troubleshooting](#troubleshooting)

## Overview

The CI/CD pipeline automates the entire software delivery process from code commit to production deployment. It includes:

- ✅ Automated testing on every pull request
- ✅ Build verification for all packages (backend, frontend, contracts)
- ✅ Code quality and linting checks
- ✅ Security vulnerability scanning
- ✅ Docker image building and publishing
- ✅ Automated deployment to staging and production
- ✅ Release automation with artifact publishing
- ✅ Dependency update automation
- ✅ Test coverage reporting

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         Developer Push                           │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Pull Request Created                        │
└────────────────────────────┬────────────────────────────────────┘
                             │
                ┌────────────┴────────────┐
                ▼                         ▼
┌───────────────────────┐   ┌───────────────────────┐
│   CI Workflow         │   │  Code Quality         │
│   - Backend Tests     │   │  - ESLint             │
│   - Frontend Build    │   │  - Clippy             │
│   - Contract Tests    │   │  - Dependency Review  │
│   - Docker Build      │   └───────────────────────┘
└───────────┬───────────┘
            │                ┌───────────────────────┐
            └───────────────▶│  Security Scanning    │
                             │  - NPM Audit          │
                             │  - Cargo Audit        │
                             │  - CodeQL             │
                             │  - Trivy              │
                             │  - Secret Scan        │
                             └───────────────────────┘
                                       │
                                       ▼
                             ┌───────────────────────┐
                             │   PR Approved         │
                             │   & Merged            │
                             └──────────┬────────────┘
                                        │
                    ┌───────────────────┴───────────────────┐
                    ▼                                       ▼
        ┌───────────────────────┐              ┌───────────────────────┐
        │  Deploy to Staging    │              │  Create Release       │
        │  (develop branch)     │              │  (version tag)        │
        └───────────┬───────────┘              └───────────┬───────────┘
                    │                                      │
                    ▼                                      ▼
        ┌───────────────────────┐              ┌───────────────────────┐
        │  Smoke Tests          │              │  Build Artifacts      │
        └───────────┬───────────┘              │  - Contracts          │
                    │                          │  - Docker Images      │
                    ▼                          └───────────────────────┘
        ┌───────────────────────┐
        │  Deploy to Production │
        │  (main branch)        │
        │  [Requires Approval]  │
        └───────────────────────┘
```

## Workflows

### 1. CI Workflow (ci.yml)

**Purpose:** Continuous Integration for all code changes

**Triggers:**

- Push to `main` or `develop` branches
- Pull requests to `main` or `develop` branches

**Jobs:**

#### Backend Tests

- Sets up Node.js 20
- Starts PostgreSQL (TimescaleDB) and Redis services
- Installs dependencies
- Runs ESLint
- Builds TypeScript code
- Executes tests with coverage
- Uploads coverage to Codecov

#### Frontend Build

- Sets up Node.js 20
- Installs dependencies
- Runs ESLint
- Performs TypeScript type checking
- Builds production bundle
- Runs tests with coverage

#### Contracts

- Sets up Rust toolchain with wasm32 target
- Caches Cargo dependencies
- Checks code formatting with rustfmt
- Runs Clippy linter
- Builds contracts for wasm32-unknown-unknown
- Executes contract tests
- Uploads compiled WASM artifacts

#### Docker Build

- Verifies backend Docker image builds successfully
- Uses BuildKit cache for faster builds

#### Status Check

- Aggregates all job results
- Required for branch protection

**Environment Variables:**

```yaml
NODE_ENV: test
POSTGRES_HOST: localhost
POSTGRES_PORT: 5432
POSTGRES_DB: bridge_watch_test
POSTGRES_USER: bridge_watch
POSTGRES_PASSWORD: test_password
REDIS_HOST: localhost
REDIS_PORT: 6379
```

### 2. Deploy Workflow (deploy.yml)

**Purpose:** Automated deployment to staging and production

**Triggers:**

- Push to `main` (production) or `develop` (staging)
- Manual workflow dispatch with environment selection

**Jobs:**

#### Build and Push

- Builds Docker images for backend and frontend
- Tags images with:
  - Branch name
  - Git SHA
  - Semantic version (if tagged)
- Pushes to GitHub Container Registry (ghcr.io)
- Uses layer caching for faster builds

#### Deploy Staging

- Runs on `develop` branch pushes
- Deploys to staging environment
- Executes smoke tests
- Sends deployment notifications

#### Deploy Production

- Runs on `main` branch pushes
- Requires manual approval (environment protection)
- Deploys to production environment
- Executes smoke tests
- Sends deployment notifications

#### Rollback

- Automatically triggered on deployment failure
- Reverts to previous stable version

**Deployment Placeholders:**

The workflow includes placeholder commands that need to be customized for your infrastructure:

```yaml
# Kubernetes example
kubectl set image deployment/backend backend=${{ needs.build-and-push.outputs.backend-tag }}

# Docker Compose example
docker-compose pull && docker-compose up -d

# Cloud platform examples
aws ecs update-service --cluster my-cluster --service backend --force-new-deployment
gcloud run deploy backend --image ${{ needs.build-and-push.outputs.backend-tag }}
az containerapp update --name backend --image ${{ needs.build-and-push.outputs.backend-tag }}
```

### 3. Release Workflow (release.yml)

**Purpose:** Automated release creation and artifact publishing

**Triggers:**

- Push tags matching `v*.*.*` (e.g., v1.0.0)
- Manual workflow dispatch with version input

**Jobs:**

#### Create Release

- Extracts version from tag or input
- Generates changelog from git commits
- Creates GitHub release (draft for pre-releases)

#### Build Contracts

- Compiles Soroban contracts
- Creates tarball of WASM files
- Uploads to GitHub release

#### Build and Publish Images

- Builds Docker images
- Tags with version and `latest`
- Pushes to GitHub Container Registry

#### Publish NPM

- Currently disabled
- Can be enabled for publishing packages to NPM registry

#### Notify Release

- Sends notifications about release completion

**Version Format:**

- Stable: `v1.0.0`, `v2.1.3`
- Pre-release: `v1.0.0-alpha.1`, `v1.0.0-beta.2`, `v1.0.0-rc.1`

### 4. Code Quality Workflow (code-quality.yml)

**Purpose:** Enforce code quality standards

**Triggers:**

- Pull requests
- Push to `main` or `develop`

**Jobs:**

#### ESLint Analysis

- Runs ESLint on TypeScript/JavaScript code
- Generates JSON report
- Uploads results as artifact

#### Rust Clippy

- Runs Clippy linter on Rust code
- Treats warnings as errors
- Generates JSON report

#### Dependency Review

- Reviews dependency changes in PRs
- Fails on moderate or higher severity vulnerabilities
- Only runs on pull requests

#### Code Quality Summary

- Aggregates all results
- Displays in GitHub Actions summary

### 5. Security Scanning Workflow (security.yml)

**Purpose:** Identify and report security vulnerabilities

**Triggers:**

- Push to `main` or `develop`
- Pull requests
- Daily schedule at 2 AM UTC

**Jobs:**

#### NPM Audit

- Scans Node.js dependencies
- Reports moderate and higher vulnerabilities
- Runs for backend and frontend

#### Cargo Audit

- Scans Rust dependencies
- Uses RustSec Advisory Database
- Reports known vulnerabilities

#### CodeQL Analysis

- Static code analysis for security issues
- Scans JavaScript and TypeScript
- Uploads results to GitHub Security tab

#### Trivy Scan

- Scans filesystem for vulnerabilities
- Checks for misconfigurations
- Reports critical and high severity issues
- Uploads SARIF results

#### Secret Scan

- Detects accidentally committed secrets
- Uses TruffleHog OSS
- Scans entire git history
- Only reports verified secrets

#### Security Summary

- Aggregates all scan results
- Displays in GitHub Actions summary

### 6. Dependency Update Workflow (dependency-update.yml)

**Purpose:** Keep dependencies up to date

**Triggers:**

- Weekly schedule (Monday 9 AM UTC)
- Manual workflow dispatch

**Jobs:**

#### NPM Update

- Updates Node.js dependencies
- Runs `npm audit fix` for security patches
- Creates pull request with changes

#### Cargo Update

- Updates Rust dependencies
- Creates pull request with changes

**Automation:**

- PRs are automatically labeled with `dependencies` and `automated`
- Branch is automatically deleted after merge

## Setup Instructions

For cache strategy and invalidation details, see [Build Cache Matrix](./build-cache-matrix.md).

### Step 1: Repository Secrets

Configure these secrets in `Settings > Secrets and variables > Actions`:

| Secret Name           | Required | Description                                       |
| --------------------- | -------- | ------------------------------------------------- |
| `CODECOV_TOKEN`       | Optional | Token for uploading test coverage to Codecov      |
| `NPM_TOKEN`           | Optional | NPM authentication token (if publishing packages) |
| `SLACK_WEBHOOK_URL`   | Optional | Webhook URL for Slack notifications               |
| `DISCORD_WEBHOOK_URL` | Optional | Webhook URL for Discord notifications             |

### Step 2: Environment Configuration

Configure deployment environments in `Settings > Environments`:

#### Staging Environment

1. Click "New environment"
2. Name: `staging`
3. Environment URL: `https://staging.stellarbridgewatch.io`
4. Protection rules: None (auto-deploy)

#### Production Environment

1. Click "New environment"
2. Name: `production`
3. Environment URL: `https://stellarbridgewatch.io`
4. Protection rules:
   - ✅ Required reviewers (add team members)
   - ✅ Wait timer: 5 minutes (optional)
   - ✅ Deployment branches: `main` only

### Step 3: Branch Protection Rules

Configure branch protection for `main`:

1. Go to `Settings > Branches > Add rule`
2. Branch name pattern: `main`
3. Enable:
   - ✅ Require a pull request before merging
     - Required approvals: 1
   - ✅ Require status checks to pass before merging
     - Required checks:
       - `CI Status Check`
       - `Code Quality Summary`
       - `Security Summary`
   - ✅ Require branches to be up to date before merging
   - ✅ Require conversation resolution before merging
   - ✅ Do not allow bypassing the above settings
   - ✅ Restrict who can push to matching branches (optional)

Repeat for `develop` branch with similar settings.

### Step 4: Enable GitHub Container Registry

1. Go to `Settings > Actions > General`
2. Workflow permissions:
   - ✅ Read and write permissions
   - ✅ Allow GitHub Actions to create and approve pull requests

### Step 5: Configure Codecov (Optional)

1. Sign up at https://codecov.io
2. Add your repository
3. Copy the upload token
4. Add as `CODECOV_TOKEN` secret in GitHub

### Step 6: Customize Deployment Commands

Update deployment commands in `.github/workflows/deploy.yml` based on your infrastructure:

```yaml
# Example for Kubernetes
- name: Deploy to production
  run: |
    kubectl config use-context production
    kubectl set image deployment/backend backend=${{ needs.build-and-push.outputs.backend-tag }}
    kubectl set image deployment/frontend frontend=${{ needs.build-and-push.outputs.frontend-tag }}
    kubectl rollout status deployment/backend
    kubectl rollout status deployment/frontend
```

## Deployment Process

### Staging Deployment

1. Create feature branch from `develop`
2. Make changes and commit
3. Open pull request to `develop`
4. CI workflows run automatically
5. After approval and merge:
   - Docker images are built
   - Deployed to staging automatically
   - Smoke tests run
   - Notifications sent

### Production Deployment

1. Create pull request from `develop` to `main`
2. CI workflows run automatically
3. After approval and merge:
   - Docker images are built
   - Deployment waits for manual approval
   - Reviewer approves in GitHub UI
   - Deployed to production
   - Smoke tests run
   - Notifications sent

### Hotfix Deployment

1. Create hotfix branch from `main`
2. Make critical fix
3. Open pull request to `main`
4. After approval and merge:
   - Follows production deployment process
5. Backport to `develop` if needed

### Release Process

1. Ensure `main` branch is stable
2. Create and push version tag:
   ```bash
   git tag -a v1.0.0 -m "Release version 1.0.0"
   git push origin v1.0.0
   ```
3. Release workflow runs automatically:
   - Creates GitHub release
   - Builds and uploads contract artifacts
   - Publishes Docker images with version tags
   - Sends notifications

## Security

### Security Best Practices

1. **Secrets Management**
   - Never commit secrets to repository
   - Use GitHub Secrets for sensitive data
   - Rotate secrets regularly

2. **Dependency Security**
   - Review dependency update PRs promptly
   - Monitor security advisories
   - Keep dependencies up to date

3. **Container Security**
   - Use official base images
   - Scan images for vulnerabilities
   - Keep base images updated

4. **Access Control**
   - Limit who can approve production deployments
   - Use branch protection rules
   - Enable two-factor authentication

### Security Scanning Schedule

- **On every PR**: CodeQL, Trivy, Dependency Review
- **Daily**: Full security scan suite
- **Weekly**: Dependency updates

### Responding to Security Issues

1. Security scan fails:
   - Review the security report
   - Assess severity and impact
   - Create issue or fix immediately
   - Update dependencies if needed

2. Secret detected:
   - Rotate the compromised secret immediately
   - Update in GitHub Secrets
   - Review git history
   - Consider rewriting history if needed

## Monitoring and Notifications

### Workflow Status

Monitor workflow status:

- GitHub Actions tab in repository
- Email notifications (configure in GitHub settings)
- Status badges in README

### Setting Up Slack Notifications

1. Create Slack webhook:
   - Go to https://api.slack.com/messaging/webhooks
   - Create new webhook for your channel
   - Copy webhook URL

2. Add secret to GitHub:
   - Go to `Settings > Secrets and variables > Actions`
   - Add `SLACK_WEBHOOK_URL` secret

3. Notifications are sent on:
   - Deployment completion (success/failure)
   - Release creation
   - Security scan failures

### Setting Up Discord Notifications

1. Create Discord webhook:
   - Go to Server Settings > Integrations > Webhooks
   - Create webhook
   - Copy webhook URL

2. Add secret to GitHub:
   - Add `DISCORD_WEBHOOK_URL` secret

3. Update workflow notification steps to use Discord format

### Monitoring Metrics

Track these metrics:

- Build success rate
- Average build time
- Deployment frequency
- Mean time to recovery (MTTR)
- Test coverage trends
- Security vulnerability trends

## Troubleshooting

### Common Issues

#### 1. Tests Fail with Database Connection Errors

**Symptoms:**

```
Error: connect ECONNREFUSED 127.0.0.1:5432
```

**Solution:**

- Ensure service containers are healthy
- Check health check configuration
- Verify port mappings
- Add wait-for-it script if needed

#### 2. Docker Build Fails with "No Space Left on Device"

**Symptoms:**

```
Error: no space left on device
```

**Solution:**

```yaml
- name: Free disk space
  run: |
    docker system prune -af
    df -h
```

#### 3. Coverage Upload Fails

**Symptoms:**

```
Error: Failed to upload coverage
```

**Solution:**

- Verify `CODECOV_TOKEN` is set
- Check coverage file path
- Ensure coverage is generated
- Use `continue-on-error: true` for non-blocking

#### 4. Deployment Fails with Authentication Errors

**Symptoms:**

```
Error: authentication failed
```

**Solution:**

- Verify deployment credentials
- Check secret names match workflow
- Ensure secrets are not expired
- Test credentials manually

#### 5. Workflow Doesn't Trigger

**Symptoms:**

- Workflow doesn't run on push/PR

**Solution:**

- Check branch names match trigger configuration
- Verify workflow file syntax (use YAML validator)
- Check if workflows are enabled in repository settings
- Review workflow permissions

### Debugging Workflows

Enable debug logging:

1. Add repository variable:
   - Go to `Settings > Secrets and variables > Actions > Variables`
   - Add `ACTIONS_STEP_DEBUG` = `true`

2. Re-run failed workflow

3. Review detailed logs

### Getting Help

- Check [GitHub Actions documentation](https://docs.github.com/en/actions)
- Review workflow logs in Actions tab
- Search GitHub Community forums
- Open issue in repository

## Maintenance

### Regular Tasks

| Frequency | Task                                     |
| --------- | ---------------------------------------- |
| Weekly    | Review and merge dependency update PRs   |
| Monthly   | Review security scan results             |
| Monthly   | Update GitHub Actions versions           |
| Quarterly | Review and optimize workflow performance |
| Quarterly | Update documentation                     |
| As needed | Update deployment scripts                |

### Updating GitHub Actions

Check for outdated actions:

```bash
# List all actions used
grep -r "uses:" .github/workflows/ | cut -d: -f3 | sort -u

# Check for updates on GitHub Marketplace
```

Update actions to latest versions:

```yaml
# Before
- uses: actions/checkout@v3

# After
- uses: actions/checkout@v4
```

### Performance Optimization

1. **Use caching:**

   ```yaml
   - uses: actions/cache@v4
     with:
       path: ~/.npm
       key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}
   ```

2. **Parallelize jobs:**
   - Run independent jobs concurrently
   - Use job dependencies only when necessary

3. **Optimize Docker builds:**
   - Use multi-stage builds
   - Leverage layer caching
   - Minimize image size

4. **Skip unnecessary runs:**
   ```yaml
   on:
     push:
       paths-ignore:
         - "docs/**"
         - "**.md"
   ```

## Conclusion

This CI/CD pipeline provides a robust, automated workflow for developing and deploying Stellar Bridge Watch. It ensures code quality, security, and reliability while enabling rapid iteration and deployment.

For questions or issues, please open an issue in the repository or contact the maintainers.
