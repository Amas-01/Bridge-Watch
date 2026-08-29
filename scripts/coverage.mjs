#!/usr/bin/env node

import { execSync } from "child_process";
import { existsSync, mkdirSync, copyFileSync, readdirSync, writeFileSync } from "fs";
import { resolve, join, basename } from "path";

const ROOT = resolve(import.meta.dirname, "..");
const COMBINED_DIR = join(ROOT, "coverage", "combined");

const WORKSPACES = ["backend", "frontend", "sdk"];

function log(label, msg) {
  const ts = new Date().toISOString().split("T")[1].split(".")[0];
  process.stdout.write(`[${ts}] [${label}] ${msg}\n`);
}

function run(label, cmd) {
  log(label, `Running: ${cmd}`);
  execSync(cmd, { stdio: "inherit", cwd: ROOT });
}

function collectCoverage(ws) {
  const covDir = join(ROOT, ws, "coverage");
  if (!existsSync(covDir)) {
    log(ws, `No coverage directory found at ${covDir}`);
    return;
  }
  const dest = join(COMBINED_DIR, ws);
  mkdirSync(dest, { recursive: true });

  for (const entry of readdirSync(covDir)) {
    const srcPath = join(covDir, entry);
    const destPath = join(dest, entry);
    copyFileSync(srcPath, destPath);
  }
  log(ws, `Coverage artifacts copied to ${dest}`);
}

function generateSummary() {
  const lines = [];
  const timestamp = new Date().toISOString();

  lines.push("<!DOCTYPE html>");
  lines.push('<html lang="en">');
  lines.push("<head><meta charset='UTF-8'><title>Combined Coverage Report</title></head>");
  lines.push("<body>");
  lines.push(`<h1>Bridge Watch - Combined Coverage Report</h1>`);
  lines.push(`<p>Generated: ${timestamp}</p>`);
  lines.push("<ul>");

  for (const ws of WORKSPACES) {
    const wsDir = join(COMBINED_DIR, ws);
    if (!existsSync(wsDir)) continue;

    const htmlIndex = join(wsDir, "index.html");
    if (existsSync(htmlIndex)) {
      lines.push(`<li><a href="${ws}/index.html">${ws.toUpperCase()}</a></li>`);
    } else {
      const entries = readdirSync(wsDir).filter((f) => f.endsWith(".html"));
      if (entries.length > 0) {
        lines.push(`<li><a href="${ws}/${entries[0]}">${ws.toUpperCase()}</a></li>`);
      } else {
        lines.push(`<li>${ws.toUpperCase()} - no HTML report found</li>`);
      }
    }
  }

  lines.push("</ul>");
  lines.push("</body>");
  lines.push("</html>");

  writeFileSync(join(COMBINED_DIR, "index.html"), lines.join("\n"));
  log("summary", "Combined index written to coverage/combined/index.html");
}

function main() {
  const start = Date.now();
  log("coverage", "Starting combined coverage run");

  mkdirSync(COMBINED_DIR, { recursive: true });

  // 1. Backend coverage (runs unit + integration tests)
  run("backend", "npm run test:coverage --workspace=backend");
  collectCoverage("backend");

  // 2. Frontend coverage
  run("frontend", "npm run test:coverage --workspace=frontend");
  collectCoverage("frontend");

  // 3. SDK tests (no coverage config, just run tests)
  run("sdk", "npm run test --workspace=sdk");

  // 4. Generate combined index
  generateSummary();

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  log("coverage", `Combined coverage run complete in ${elapsed}s`);
  log("coverage", `Reports available at: coverage/combined/index.html`);
}

main();
