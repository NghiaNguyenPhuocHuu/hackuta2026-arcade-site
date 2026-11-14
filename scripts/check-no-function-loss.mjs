#!/usr/bin/env node
/**
 * No-function-loss check for the sandbox deployment (dev:brazen-peccary-506).
 *
 * A Convex push replaces EVERY function on a deployment. This check makes sure
 * the assembled build (build/peccary, from scripts/assemble-backend.mjs) still
 * contains every function and HTTP route peccary runs right now.
 *
 *   node scripts/check-no-function-loss.mjs [--save <file>]
 *     Pre-push: fetch the live spec (read-only `convex function-spec`), scan
 *     build/peccary/convex statically, exit 1 listing anything the build lacks.
 *     Prints what is new. `--save` writes the live spec for the post check.
 *
 *   node scripts/check-no-function-loss.mjs --post <saved-spec.json>
 *     Post-push: fetch the live spec again and require it to be a superset of
 *     the saved pre-push spec.
 *
 * Read-only against the deployment. Runs the target guard first.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEPLOYMENT = "dev:brazen-peccary-506";

const argv = process.argv.slice(2);
const flag = (name) => {
  const i = argv.indexOf(name);
  return i === -1 ? null : argv[i + 1] ?? "";
};
const postFile = flag("--post");
const saveFile = flag("--save");
/** --build <dir>: scan another tree (default build/peccary). --spec <file>: use a saved spec instead of fetching. */
const BUILD = resolve(flag("--build") || join(ROOT, "build", "peccary"));
const specFile = flag("--spec");

function fail(message) {
  console.error(`✖ no-function-loss: ${message}`);
  process.exit(1);
}

function convexBin() {
  const bin = join(ROOT, "build", "peccary", "node_modules", ".bin", process.platform === "win32" ? "convex.cmd" : "convex");
  if (!existsSync(bin)) fail("build/peccary has no node_modules; run `npm run backend:assemble` first");
  return bin;
}

function fetchLiveSpec() {
  execFileSync(process.execPath, [join(ROOT, "scripts", "guard-convex-target.mjs")], { stdio: "inherit" });
  const env = { ...process.env, CONVEX_DEPLOYMENT: DEPLOYMENT };
  delete env.CONVEX_DEPLOY_KEY;
  const out = execFileSync(convexBin(), ["function-spec"], {
    cwd: BUILD,
    env,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    shell: process.platform === "win32",
  });
  const spec = JSON.parse(out.slice(out.indexOf("{")));
  if (!Array.isArray(spec.functions)) fail("unexpected function-spec output");
  if (spec.url && !String(spec.url).includes("brazen-peccary-506")) fail(`function-spec answered for ${spec.url}, not peccary`);
  return spec;
}

/** Stable keys: "module.js:name" for functions, "HTTP METHOD /path" for routes. */
function specKeys(spec) {
  const keys = new Set();
  for (const fn of spec.functions) {
    if (fn.identifier) keys.add(fn.identifier);
    else if (fn.functionType === "HttpAction") keys.add(`HTTP ${fn.method} ${fn.path}`);
  }
  return keys;
}

const BUILDER = /\b(query|mutation|action|internalQuery|internalMutation|internalAction|httpAction)\s*\(/;

/** Every exported name per module in build/peccary/convex (over-inclusive on purpose). */
function scanBuild() {
  const dir = join(BUILD, "convex");
  if (!existsSync(dir)) fail("build/peccary/convex is missing; run `npm run backend:assemble` first");
  const exportsByModule = new Map();
  const builderExports = new Set();
  (function walk(current) {
    for (const entry of readdirSync(current)) {
      const path = join(current, entry);
      if (statSync(path).isDirectory()) {
        if (entry !== "_generated" && entry !== "node_modules") walk(path);
        continue;
      }
      if (!/\.(ts|js)$/.test(entry) || /\.(test|spec)\.ts$/.test(entry) || entry.endsWith(".d.ts")) continue;
      const source = readFileSync(path, "utf8");
      const module = relative(dir, path).replace(/\\/g, "/").replace(/\.(ts|js)$/, ".js");
      const names = new Set();
      for (const m of source.matchAll(/export\s+(?:const|let|var|async\s+function|function)\s+([A-Za-z_$][\w$]*)\s*(=?)\s*([^\n]*)/g)) {
        names.add(m[1]);
        if (BUILDER.test(m[3])) builderExports.add(`${module}:${m[1]}`);
      }
      for (const m of source.matchAll(/export\s+const\s*\{([^}]*)\}\s*=/g)) {
        for (const part of m[1].split(",")) {
          const name = part.split(":").pop().trim();
          if (name) names.add(name);
        }
      }
      for (const m of source.matchAll(/export\s*\{([^}]*)\}/g)) {
        for (const part of m[1].split(",")) {
          const name = part.split(/\s+as\s+/).pop().trim();
          if (name) names.add(name);
        }
      }
      if (/export\s+default\b/.test(source)) names.add("default");
      exportsByModule.set(module, { names, source });
    }
  })(dir);
  return { exportsByModule, builderExports };
}

function buildHas(key, scan) {
  if (key.startsWith("HTTP ")) {
    const http = scan.exportsByModule.get("http.js")?.source ?? "";
    const [, , path] = key.split(" ");
    if (path.startsWith("/.well-known/")) return /addHttpRoutes\s*\(/.test(http);
    return http.includes(`"${path}"`) || http.includes(`'${path}'`);
  }
  const [module, name] = key.split(":");
  return scan.exportsByModule.get(module)?.names.has(name) ?? false;
}

if (postFile !== null) {
  if (!postFile || !existsSync(postFile)) fail("--post needs the saved pre-push spec file");
  const before = specKeys(JSON.parse(readFileSync(postFile, "utf8")));
  const after = specKeys(fetchLiveSpec());
  const lost = [...before].filter((key) => !after.has(key)).sort();
  const added = [...after].filter((key) => !before.has(key)).sort();
  console.log(`live now: ${after.size} (was ${before.size}); added ${added.length}`);
  for (const key of added) console.log(`  + ${key}`);
  if (lost.length) {
    for (const key of lost) console.error(`  - LOST ${key}`);
    fail(`${lost.length} function(s) disappeared after the push`);
  }
  console.log("✔ post-push: every pre-push function is still deployed");
  process.exit(0);
}

const live = specFile ? JSON.parse(readFileSync(specFile, "utf8")) : fetchLiveSpec();
if (saveFile) {
  mkdirSync(dirname(resolve(saveFile)), { recursive: true });
  writeFileSync(saveFile, JSON.stringify(live, null, 2));
  console.log(`saved live spec → ${saveFile}`);
}
const liveKeys = specKeys(live);
const scan = scanBuild();
const missing = [...liveKeys].filter((key) => !buildHas(key, scan)).sort();
const added = [...scan.builderExports].filter((key) => !liveKeys.has(key)).sort();

if (existsSync(join(BUILD, ".stubbed"))) {
  console.warn("! build/peccary has offline _generated stubs (fine for this check; re-assemble without --with-stubs before pushing)");
}
console.log(`live on peccary: ${liveKeys.size} functions/routes; build covers ${liveKeys.size - missing.length}`);
console.log(`new in build: ${added.length}`);
for (const key of added) console.log(`  + ${key}`);
if (missing.length) {
  for (const key of missing) console.error(`  - MISSING ${key}`);
  fail(`${missing.length} deployed function(s) are not in the build — pushing would delete them`);
}
console.log("✔ no function loss: the build contains everything peccary runs");
