#!/usr/bin/env node
/**
 * Assembles build/peccary with offline codegen stubs, then runs the game's
 * backend integration tests there (vitest + convex-test). Nothing touches a
 * deployment.
 *
 * Vitest is started from the canonical (realpath) directory: on Windows a
 * lower-case drive letter in the working directory (e.g. from VS Code's
 * terminal) makes vitest load twice and fail with "failed to find the runner".
 *
 *   node scripts/test-backend.mjs [--all]   --all runs the profile's whole
 *                                           integration + unit suite too.
 */
import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = realpathSync.native(resolve(dirname(fileURLToPath(import.meta.url)), ".."));

execFileSync(process.execPath, [join(ROOT, "scripts", "assemble-backend.mjs"), "--with-stubs"], { cwd: ROOT, stdio: "inherit" });

const cwd = realpathSync.native(join(ROOT, "build", "peccary"));
const targets = process.argv.includes("--all") ? ["tests/integration", "tests/unit"] : ["tests/integration/slot", "tests/integration/arcade"];
try {
  execFileSync(process.execPath, [join(cwd, "node_modules", "vitest", "vitest.mjs"), "run", ...targets, "--project", "profile"], {
    cwd,
    stdio: "inherit",
  });
} catch {
  process.exit(1);
}
