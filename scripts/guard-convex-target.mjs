#!/usr/bin/env node
/**
 * Refuses any Convex CLI command unless it targets the sandbox deployment.
 * Run before every `convex ...` script:  node scripts/guard-convex-target.mjs && convex ...
 *
 * Passes only when:
 *   - CONVEX_DEPLOYMENT is exactly "dev:brazen-peccary-506" (env, else .env.local), and
 *   - CONVEX_DEPLOY_KEY is NOT set (a deploy key would override the target).
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ALLOWED_DEPLOYMENT = "dev:brazen-peccary-506";
const root = join(dirname(fileURLToPath(import.meta.url)), "..");

function readEnvFile(path) {
  if (!existsSync(path)) return {};
  const values = {};
  for (const rawLine of readFileSync(path, "utf8").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    const hash = value.search(/\s#/);
    if (hash !== -1) value = value.slice(0, hash).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    values[key] = value;
  }
  return values;
}

function fail(message) {
  console.error(`✖ Convex guard: ${message}`);
  console.error(`  This repo may only run Convex commands against ${ALLOWED_DEPLOYMENT}.`);
  process.exit(1);
}

const fileEnv = readEnvFile(join(root, ".env.local"));
const deployment = (process.env.CONVEX_DEPLOYMENT ?? fileEnv.CONVEX_DEPLOYMENT ?? "").trim();
const deployKey = (process.env.CONVEX_DEPLOY_KEY ?? fileEnv.CONVEX_DEPLOY_KEY ?? "").trim();

if (deployKey) {
  fail("CONVEX_DEPLOY_KEY is set. A deploy key overrides the target deployment; unset it.");
}
if (!deployment) {
  fail("CONVEX_DEPLOYMENT is not set (env or .env.local).");
}
if (deployment !== ALLOWED_DEPLOYMENT) {
  fail(`CONVEX_DEPLOYMENT is "${deployment}", not "${ALLOWED_DEPLOYMENT}".`);
}

console.log(`✔ Convex guard: targeting ${ALLOWED_DEPLOYMENT}`);
