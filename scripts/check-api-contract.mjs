import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

const manifestText = readFileSync("contracts/api-compatibility.json", "utf8");
const manifest = JSON.parse(manifestText);
const source = readFileSync("backend/src/api/compatibility/contracts.ts", "utf8");
const fixturePaths = [
  "frontend/src/test/fixtures/api-compatibility.json",
  "sdk/src/fixtures/api-compatibility.json",
];

for (const version of manifest.versions) {
  if (!source.includes(`version: "${version.version}"`)) {
    throw new Error(`API contract ${version.version} is missing from the backend registry`);
  }
  if (!source.includes(`mediaType: "${version.mediaType}"`)) {
    throw new Error(`Media type ${version.mediaType} is missing from the backend registry`);
  }
}

if (!source.includes(`version: "${manifest.current}"`)) {
  throw new Error(`Current API contract ${manifest.current} is not registered`);
}

for (const fixturePath of fixturePaths) {
  if (process.argv.includes("--write")) {
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(fixturePath, manifestText);
  } else if (readFileSync(fixturePath, "utf8") !== manifestText) {
    throw new Error(`${fixturePath} is stale; run npm run generate:api-contract`);
  }
}

console.log(`${process.argv.includes("--write") ? "Generated" : "Validated"} ${manifest.versions.length} API contract version(s)`);
