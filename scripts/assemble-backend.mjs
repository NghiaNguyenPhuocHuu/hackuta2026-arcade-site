#!/usr/bin/env node
/**
 * Assembles the backend that gets pushed to the sandbox deployment
 * (dev:brazen-peccary-506) into build/peccary/:
 *
 *   1. `git archive` the pinned profile commit (backend/BASE.json) from the
 *      sibling profile repo. That commit is exactly what peccary runs, so the
 *      push loses no functions.
 *   2. Check that the profile files we modify still match their recorded base
 *      hashes (fails loudly if the pin or the files drifted).
 *   3. Copy backend/overlay/ on top (game modules + the 3 edited files + tests),
 *      then the repo-root shared/ (pure rules, one copy) into build/peccary/shared/.
 *   4. Write build/peccary/.env.local with ONLY CONVEX_DEPLOYMENT (no secrets)
 *      and remove .env.example so the CLI can never pick another deployment.
 *   5. `npm ci` there when node_modules is missing or the lockfile changed.
 *
 * Flags:
 *   --with-stubs   also write the offline convex/_generated stubs (tests and
 *                  typecheck only — never for a push; `convex dev` generates
 *                  the real ones).
 *   --skip-install skip npm ci.
 *
 * Node built-ins only. Never touches the profile repo's working tree.
 */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BUILD = join(ROOT, "build", "peccary");
const OVERLAY = join(ROOT, "backend", "overlay");
const BASE = JSON.parse(readFileSync(join(ROOT, "backend", "BASE.json"), "utf8"));
const PROFILE = resolve(ROOT, BASE.profileRepo);
const DEPLOYMENT = "dev:brazen-peccary-506";
// `src` only so the profile's own integration tests (which import src/convex/api) can run here;
// `convex dev` bundles convex/ alone.
const ARCHIVE_PATHS = ["convex", "shared", "src", "security", "tests", "scripts", "package.json", "package-lock.json", "tsconfig.json", "vitest.config.ts", "vercel.json", "index.html"];

const args = new Set(process.argv.slice(2));
const withStubs = args.has("--with-stubs");
const skipInstall = args.has("--skip-install");

function fail(message) {
  console.error(`✖ assemble-backend: ${message}`);
  process.exit(1);
}

function sha256Lf(buffer) {
  // git archive may apply core.autocrlf; hash with LF endings so both sides agree.
  return createHash("sha256").update(buffer.toString("utf8").replace(/\r\n/g, "\n")).digest("hex");
}

if (!/^[0-9a-f]{40}$/.test(BASE.commit ?? "")) fail("backend/BASE.json has no full commit sha");
if (!existsSync(join(PROFILE, ".git"))) fail(`profile repo not found at ${PROFILE}`);

// Keep node_modules across runs (npm ci is slow); clear everything else.
const keepModules = existsSync(join(BUILD, "node_modules"));
if (existsSync(BUILD)) {
  for (const entry of readdirSync(BUILD)) {
    if (entry === "node_modules" || entry === ".lockhash") continue;
    rmSync(join(BUILD, entry), { recursive: true, force: true });
  }
} else {
  mkdirSync(BUILD, { recursive: true });
}

// 1. Archive the pinned commit and unpack with the system tar.
const tarPath = join(ROOT, "build", "profile-base.tar");
mkdirSync(dirname(tarPath), { recursive: true });
const topLevel = new Set(execFileSync("git", ["-C", PROFILE, "ls-tree", "--name-only", BASE.commit], { encoding: "utf8" }).split(/\r?\n/));
for (const required of ["convex", "shared", "package.json", "package-lock.json"]) {
  if (!topLevel.has(required)) fail(`pinned commit has no ${required}`);
}
const paths = ARCHIVE_PATHS.filter((path) => topLevel.has(path));
execFileSync("git", ["-C", PROFILE, "archive", "--format=tar", "-o", tarPath, BASE.commit, "--", ...paths], { stdio: "inherit" });
// Relative path: GNU tar (Git Bash) reads "c:\..." as a remote host.
execFileSync("tar", ["-xf", relative(BUILD, tarPath).replace(/\\/g, "/")], { cwd: BUILD, stdio: "inherit" });
rmSync(tarPath, { force: true });
console.log(`✔ archived profile ${BASE.commit.slice(0, 7)} → ${relative(ROOT, BUILD)}`);

// 2. Base-hash check for every file the overlay replaces.
for (const [path, expected] of Object.entries(BASE.modified)) {
  const file = join(BUILD, path);
  if (!existsSync(file)) fail(`base file missing in archive: ${path}`);
  const actual = sha256Lf(readFileSync(file));
  if (actual !== expected) fail(`base file ${path} changed (expected ${expected.slice(0, 12)}…, got ${actual.slice(0, 12)}…). Re-check the pin before pushing.`);
}
console.log(`✔ ${Object.keys(BASE.modified).length} modified base files match backend/BASE.json`);

// 3. Overlay.
// backend/overlay/** -> build/peccary/**, and the repo's shared/** (pure rules the site
// and the backend both import) -> build/peccary/shared/**. shared/ has one copy only.
let copied = 0;
function overlay(fromRoot, toRoot) {
  (function walk(dir) {
    for (const entry of readdirSync(dir)) {
      const source = join(dir, entry);
      if (statSync(source).isDirectory()) {
        walk(source);
        continue;
      }
      const target = join(toRoot, relative(fromRoot, source));
      mkdirSync(dirname(target), { recursive: true });
      cpSync(source, target);
      copied += 1;
    }
  })(fromRoot);
}
overlay(OVERLAY, BUILD);
overlay(join(ROOT, "shared"), join(BUILD, "shared"));
console.log(`✔ overlaid ${copied} files from backend/overlay + shared`);

// 4. Deployment pin (no secrets).
rmSync(join(BUILD, ".env.example"), { force: true });
writeFileSync(join(BUILD, ".env.local"), `# Written by scripts/assemble-backend.mjs. Sandbox only.\nCONVEX_DEPLOYMENT=${DEPLOYMENT}\n`);
console.log(`✔ build/peccary/.env.local → ${DEPLOYMENT}`);

// 5. Dependencies.
if (!skipInstall) {
  const lockHash = sha256Lf(readFileSync(join(BUILD, "package-lock.json")));
  const stamp = join(BUILD, ".lockhash");
  const upToDate = keepModules && existsSync(stamp) && readFileSync(stamp, "utf8").trim() === lockHash;
  if (upToDate) {
    console.log("✔ node_modules up to date");
  } else {
    console.log("… npm ci (first run takes a few minutes)");
    execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["ci", "--no-audit", "--no-fund"], {
      cwd: BUILD,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    writeFileSync(stamp, `${lockHash}\n`);
  }
}

if (withStubs) {
  execFileSync(process.execPath, [join(BUILD, "scripts", "ensure-convex-server-stub.mjs")], { cwd: BUILD, stdio: "inherit" });
  console.log("✔ offline convex/_generated stubs written (tests/typecheck only — do not push this build)");
  writeFileSync(join(BUILD, ".stubbed"), "offline stubs present; re-run without --with-stubs before pushing\n");
}
