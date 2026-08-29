# CI/CD Quick Reference Guide

Quick reference for common CI/CD tasks and commands.

## Workflow Triggers

| Workflow          | Trigger                      | Purpose                |
| ----------------- | ---------------------------- | ---------------------- |
| CI                | PR, Push to main/develop     | Run tests and builds   |
| Deploy            | Push to main/develop, Manual | Deploy to environments |
| Release           | Tag push (v*.*.\*), Manual   | Create releases        |
| Code Quality      | PR, Push to main/develop     | Code quality checks    |
| Security          | PR, Push, Daily 2 AM UTC     | Security scans         |
| Dependency Update | Weekly Mon 9 AM UTC, Manual  | Update dependencies    |

## Common Commands

### Local Development

```bash
# Backend
cd backend
npm install          # Install dependencies
npm run dev          # Start dev server
npm run lint         # Run linter
npm run lint:fix     # Fix linting issues
npm run build        # Build for production
npm test             # Run tests
npm test -- --coverage  # Run tests with coverage

# Contracts
cd contracts
cargo build          # Build contracts
cargo build --target wasm32-unknown-unknown --release  # Build for deployment
cargo test           # Run tests
cargo fmt            # Format code
cargo fmt --check    # Check formatting
cargo clippy         # Run linter
cargo clippy -- -D warnings  # Lint with warnings as errors
```

### Git Workflow

```bash
# Start new feature
git checkout develop
git pull upstream develop
git checkout -b feature/my-feature

# Commit changes
git add .
git commit -m "feat: add new feature"

# Keep branch updated
git fetch upstream
git rebase upstream/develop

# Push to fork
git push origin feature/my-feature

# After PR merge, cleanup
git checkout develop
git pull upstream develop
git branch -d feature/my-feature
```

### Release Process

```bash
# Create release tag
git checkout main
git pull origin main
git tag -a v1.0.0 -m "Release version 1.0.0"
git push origin v1.0.0

# Create pre-release
git tag -a v1.0.0-beta.1 -m "Beta release 1.0.0-beta.1"
git push origin v1.0.0-beta.1
```

## Workflow Status Checks

### Required Checks for PR Merge

- ✅ Backend Tests
- ✅ Frontend Build
- ✅ Soroban Contracts
- ✅ Docker Build Verification
- ✅ CI Status Check
- ✅ Code Quality Summary
- ✅ Security Summary

### Viewing Check Results

1. Go to PR on GitHub
2. Scroll to "Checks" section
3. Click failed check to view logs
4. Click "Details" for full output

## Fixing Common Issues

### Linting Failures

```bash
# Backend
cd backend
npm run lint:fix

# Contracts
cd contracts
cargo fmt
```

### Test Failures

```bash
# Run tests locally
cd backend && npm test
cd contracts && cargo test

# Run specific test
npm test -- path/to/test.ts
cargo test test_name
```

### Build Failures

```bash
# Clean and rebuild
cd backend
rm -rf node_modules dist
npm install
npm run build

cd contracts
cargo clean
cargo build
```

### Security Issues

```bash
# Update vulnerable dependencies
cd backend
npm audit fix

cd contracts
cargo update
cargo audit
```

## Manual Workflow Triggers

### Trigger Deploy Workflow

1. Go to Actions tab
2. Select "Deploy" workflow
3. Click "Run workflow"
4. Select environment (staging/production)
5. Click "Run workflow"

### Trigger Release Workflow

1. Go to Actions tab
2. Select "Release" workflow
3. Click "Run workflow"
4. Enter version (e.g., v1.0.0)
5. Click "Run workflow"

### Trigger Dependency Update

1. Go to Actions tab
2. Select "Dependency Updates" workflow
3. Click "Run workflow"
4. Click "Run workflow"

## Environment URLs

| Environment | URL                                   | Branch  | Approval |
| ----------- | ------------------------------------- | ------- | -------- |
| Staging     | https://staging.stellarbridgewatch.io | develop | None     |
| Production  | https://stellarbridgewatch.io         | main    | Required |

## Docker Images

### Pull Images

```bash
# Login to GHCR
echo $GITHUB_TOKEN | docker login ghcr.io -u USERNAME --password-stdin

# Pull latest
docker pull ghcr.io/stellabridge/bridge-watch/backend:latest
docker pull ghcr.io/stellabridge/bridge-watch/frontend:latest

# Pull specific version
docker pull ghcr.io/stellabridge/bridge-watch/backend:v1.0.0
```

### Build Locally

```bash
# Backend
docker build -t backend:local ./backend

# Frontend
docker build -t frontend:local ./frontend
```

## Secrets and Variables

### Required Secrets

| Secret              | Required | Used In |
| ------------------- | -------- | ------- |
| CODECOV_TOKEN       | Optional | CI      |
| NPM_TOKEN           | Optional | Release |
| SLACK_WEBHOOK_URL   | Optional | All     |
| DISCORD_WEBHOOK_URL | Optional | All     |

### Adding Secrets

1. Go to Settings > Secrets and variables > Actions
2. Click "New repository secret"
3. Enter name and value
4. Click "Add secret"

## Branch Protection

### Main Branch Rules

- Require PR before merge
- Require 1 approval
- Require status checks to pass
- Require branch to be up to date
- Require conversation resolution

### Develop Branch Rules

- Require PR before merge
- Require status checks to pass
- Require branch to be up to date

## Debugging

### Enable Debug Logging

1. Go to Settings > Secrets and variables > Actions > Variables
2. Add variable: `ACTIONS_STEP_DEBUG` = `true`
3. Re-run workflow

### View Detailed Logs

1. Go to Actions tab
2. Click on workflow run
3. Click on job
4. Expand step to view logs
5. Download logs if needed

## Notifications

### Slack Notification Format

```json
{
  "text": "✅ Deployment to production succeeded",
  "blocks": [
    {
      "type": "section",
      "text": {
        "type": "mrkdwn",
        "text": "*Deployment Status*\nEnvironment: Production\nStatus: Success\nCommit: abc123"
      }
    }
  ]
}
```

### Discord Notification Format

```json
{
  "content": "✅ Deployment to production succeeded",
  "embeds": [
    {
      "title": "Deployment Status",
      "description": "Environment: Production\nStatus: Success",
      "color": 3066993
    }
  ]
}
```

## Performance Tips

### Speed Up CI

1. Use caching for dependencies
2. Run jobs in parallel
3. Skip unnecessary steps
4. Use smaller Docker images
5. Optimize test execution

### Reduce Build Time

```yaml
# Cache npm dependencies
- uses: actions/cache@v4
  with:
    path: ~/.npm
    key: ${{ runner.os }}-node-${{ hashFiles('**/package-lock.json') }}

# Cache cargo dependencies
- uses: actions/cache@v4
  with:
    path: |
      ~/.cargo/registry
      ~/.cargo/git
      target
    key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
```

## Monitoring

### Key Metrics

- Build success rate
- Average build time
- Deployment frequency
- Mean time to recovery
- Test coverage
- Security vulnerabilities

### Viewing Metrics

1. Go to Actions tab
2. Click "View workflow runs"
3. Filter by status/branch
4. Export data if needed

## Support

### Getting Help

- Check workflow logs
- Review documentation
- Search GitHub issues
- Ask in discussions
- Contact maintainers

### Reporting Issues

1. Check existing issues
2. Gather relevant information:
   - Workflow name
   - Run ID
   - Error message
   - Steps to reproduce
3. Open new issue with details

## Resources

- [Full CI/CD Documentation](./CI-CD-SETUP.md)
- [Build Cache Matrix](./build-cache-matrix.md)
- [Contributing Guide](../CONTRIBUTING.md)
- [GitHub Actions Docs](https://docs.github.com/en/actions)
- [Workflow Files](../.github/workflows/)
