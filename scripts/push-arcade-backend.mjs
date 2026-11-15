#!/usr/bin/env node
/**
 * Assemble the peccary backend (pinned profile + arcade overlay) and push it
 * from this repo. Never pushes arcade src/ alone — that would wipe profile
 * functions. Target is always dev:brazen-peccary-506.
 *
 *   npm run convex:push-dev
 */
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build", "peccary");
const DEPLOYMENT = "dev:brazen-peccary-506";
const skipCheck = process.argv.includes("--skip-check");

function fail(message) {
  console.error(`✖ convex:push-dev: ${message}`);
  process.exit(1);
}

function convexBin() {
  const bin = join(BUILD, "node_modules", ".bin", process.platform === "win32" ? "convex.cmd" : "convex");
  if (!existsSync(bin)) fail("build/peccary has no Convex CLI; assemble failed");
  return bin;
}

const env = { ...process.env, CONVEX_DEPLOYMENT: DEPLOYMENT };
delete env.CONVEX_DEPLOY_KEY;

execFileSync(process.execPath, [join(ROOT, "scripts", "guard-convex-target.mjs")], { cwd: ROOT, stdio: "inherit", env });
execFileSync(process.execPath, [join(ROOT, "scripts", "assemble-backend.mjs")], { cwd: ROOT, stdio: "inherit" });

if (existsSync(join(BUILD, ".stubbed"))) {
  fail("build/peccary still has offline stubs; re-run assemble without --with-stubs");
}

const specPre = join(ROOT, "build", "spec-pre.json");
if (!skipCheck) {
  execFileSync(process.execPath, [join(ROOT, "scripts", "check-no-function-loss.mjs"), "--save", specPre], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
}

console.log("… pushing assembled backend to", DEPLOYMENT);
execFileSync(convexBin(), ["dev", "--once", "--typecheck", "enable", "--tail-logs", "disable"], {
  cwd: BUILD,
  stdio: "inherit",
  env,
  shell: process.platform === "win32",
});

if (!skipCheck && existsSync(specPre)) {
  execFileSync(process.execPath, [join(ROOT, "scripts", "check-no-function-loss.mjs"), "--post", specPre], {
    cwd: ROOT,
    stdio: "inherit",
    env,
  });
}

console.log("✔ convex:push-dev: peccary now has the assembled arcade backend");
