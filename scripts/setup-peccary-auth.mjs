#!/usr/bin/env node
/**
 * One-time Convex Auth setup for the sandbox deployment brazen-peccary-506.
 *
 * Peccary has no JWT signing keys, so `auth:signIn` fails for every account with
 * "Missing environment variable JWT_PRIVATE_KEY". This generates a fresh RS256 key pair
 * locally and sets JWT_PRIVATE_KEY and JWKS on peccary (the standard Convex Auth setup).
 * The keys are never printed or written to disk. Undo with:
 *   npx convex env remove JWT_PRIVATE_KEY   and   npx convex env remove JWKS
 *
 * Usage (from the repo root, after `node scripts/assemble-backend.mjs`):
 *   node scripts/setup-peccary-auth.mjs            # refuses if keys already exist
 *   node scripts/setup-peccary-auth.mjs --force    # replace existing keys (signs everyone out)
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const build = path.join(repo, "build", "peccary");
const TARGET = "dev:brazen-peccary-506";

function fail(message) {
  console.error(`✖ ${message}`);
  process.exit(1);
}

const guard = spawnSync(process.execPath, [path.join(repo, "scripts", "guard-convex-target.mjs")], {
  stdio: "inherit",
  env: { ...process.env, CONVEX_DEPLOYMENT: TARGET },
});
if (guard.status !== 0) fail("guard refused the target");
if (!existsSync(path.join(build, "node_modules", "jose"))) {
  fail("build/peccary/node_modules is missing; run `node scripts/assemble-backend.mjs` first");
}

const env = { ...process.env, CONVEX_DEPLOYMENT: TARGET };
const convexBin = path.join(build, "node_modules", "convex", "bin", "main.js");
/** Runs the Convex CLI without a shell, so values are passed through untouched. */
function convex(args) {
  return spawnSync(process.execPath, [convexBin, ...args], { cwd: build, encoding: "utf8", env });
}

const existing = convex(["env", "list"]);
if (existing.status !== 0) fail("could not list peccary env vars (are you logged in to Convex?)");
const names = existing.stdout.split(/\r?\n/).map((line) => line.split("=")[0].trim()).filter(Boolean);
if (names.includes("JWT_PRIVATE_KEY") && !process.argv.includes("--force")) {
  fail("JWT_PRIVATE_KEY is already set on peccary. Use --force to replace it (this signs everyone out).");
}

const requireFromBuild = createRequire(path.join(build, "package.json"));
const { exportJWK, exportPKCS8, generateKeyPair } = await import(
  "file://" + requireFromBuild.resolve("jose").replace(/\\/g, "/")
);
const keys = await generateKeyPair("RS256", { extractable: true });
const privateKey = (await exportPKCS8(keys.privateKey)).trimEnd().replace(/\n/g, " ");
const jwks = JSON.stringify({ keys: [{ use: "sig", ...(await exportJWK(keys.publicKey)) }] });

for (const [name, value] of [["JWT_PRIVATE_KEY", privateKey], ["JWKS", jwks]]) {
  // No shell involved; the value is never echoed.
  const result = convex(["env", "set", name, "--", value]);
  if (result.status !== 0) fail(`setting ${name} failed`);
  console.log(`✔ ${name} set on peccary`);
}
console.log("✔ Convex Auth keys installed. Sign-in on peccary should work now.");
