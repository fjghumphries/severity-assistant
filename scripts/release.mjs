// Builds a release candidate with the debug tooling removed, from a clean checkout of a git ref.
//
//   npm run release                 # builds HEAD
//   npm run release -- --ref v0.1.0 # builds a tag
//   npm run release -- --keep       # keep the temp directory afterwards (its path is printed)
//   npm run release -- --package    # also produce the installable zip in ./out (needs a login)
//
// Why a script rather than "remember the steps": DEBUG_ENABLED = false does NOT remove the debug
// code (the default build does not tree-shake), and a Hub zip containing a one-click "overwrite all
// config" button is a hazard in someone else's tenant. So the only way to produce a release is to
// delete ui/app/debug, delete the DEBUG-HOOK lines that reference it, and then prove that nothing
// else depended on it (tsc, lint, jest) and that the marker is gone from the bundle. Any failure
// stops the script with a non-zero exit code.
//
// --package: `dt-app deploy --dry-run` is the only thing that produces an installable bundle
// (a zipped `dist/` is rejected for missing metadata), and it validates the manifest against a
// tenant, so it needs an interactive browser login. app.config.json holds a placeholder URL, so pass
// your own: `npm run release -- --package --environment-url https://<id>.apps.dynatrace.com/`. It cannot run in CI; run it
// locally, then attach the zip to a GitHub release. The zip is re-checked for the debug marker.
//
// It works on a `git archive` of the ref, never on the working tree, so uncommitted changes can
// neither leak into a release nor be damaged by it. It stops after a verified build; publishing
// (`dt-app deploy` / `publish`) is a separate, deliberate step.

import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  existsSync,
  symlinkSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const refIndex = args.indexOf("--ref");
const ref = refIndex >= 0 ? args[refIndex + 1] : "HEAD";
const keep = args.includes("--keep");
const pack = args.includes("--package");
const envIndex = args.indexOf("--environment-url");
const environmentUrl = envIndex >= 0 ? args[envIndex + 1] : undefined;

if (!ref || !/^[\w./-]+$/.test(ref)) {
  console.error(`Refusing odd-looking ref: ${JSON.stringify(ref)}`);
  process.exit(2);
}

const step = (title) => console.log(`\n=== ${title}`);
const fail = (message) => {
  console.error(`\nRELEASE FAILED: ${message}`);
  process.exit(1);
};
const run = (cmd, cmdArgs, cwd) => {
  const r = spawnSync(cmd, cmdArgs, { cwd, stdio: "inherit" });
  if (r.status !== 0)
    fail(`${cmd} ${cmdArgs.join(" ")} exited with ${r.status}`);
};

const repoRoot = spawnSync("git", ["rev-parse", "--show-toplevel"], {
  encoding: "utf8",
}).stdout.trim();
if (!repoRoot) fail("not inside a git repository");

const work = mkdtempSync(join(tmpdir(), "sa-release-"));
const cleanup = () => {
  if (!keep) rmSync(work, { recursive: true, force: true });
};
process.on("exit", cleanup);

step(`Extract ${ref} into ${work}`);
const archive = spawnSync(
  "sh",
  [
    "-c",
    `git -C "${repoRoot}" archive --format=tar ${ref} | tar -x -C "${work}"`,
  ],
  { stdio: "inherit" },
);
if (archive.status !== 0) fail(`could not archive ref "${ref}"`);

step("Remove debug tooling");
rmSync(join(work, "ui/app/debug"), { recursive: true, force: true });

const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

let hookLines = 0;
for (const file of walk(join(work, "ui")).filter((f) => /\.tsx?$/.test(f))) {
  const text = readFileSync(file, "utf8");
  if (!text.includes("DEBUG-HOOK")) continue;
  const kept = text.split("\n").filter((line) => {
    const hook = line.includes("DEBUG-HOOK");
    if (hook) hookLines += 1;
    return !hook;
  });
  writeFileSync(file, kept.join("\n"));
}
console.log(`removed ui/app/debug and ${hookLines} DEBUG-HOOK line(s)`);

// Reuse the repo's installed dependencies instead of reinstalling: no network, no dependence on the
// maintainer's npm config, and seconds instead of minutes. A fresh checkout (CI) has no node_modules,
// so there it falls back to a clean `npm ci` inside the temp directory.
step("Dependencies");
if (existsSync(join(repoRoot, "node_modules"))) {
  symlinkSync(
    join(repoRoot, "node_modules"),
    join(work, "node_modules"),
    "dir",
  );
  console.log("linked the repo's node_modules");
} else {
  run("npm", ["ci", "--no-audit", "--no-fund"], work);
}

step("Prove nothing else depended on the debug code");
run("npx", ["tsc", "--noEmit", "-p", "ui/tsconfig.json"], work);
run("npm", ["run", "lint"], work);
run("npx", ["jest"], work);

step("Build");
run("npm", ["run", "build"], work);

step("Confirm the debug marker is not in the bundle");
run("node", ["scripts/check-no-debug.mjs"], work);

if (pack) {
  step("Package the installable app bundle (needs a browser login)");
  // The login URL is printed by dt-app; open it, sign in, and the command continues.
  const configured = JSON.parse(
    readFileSync(join(work, "app.config.json"), "utf8"),
  ).environmentUrl;
  if (!environmentUrl && /your-environment-id/.test(configured))
    fail(
      "app.config.json holds a placeholder environmentUrl; pass --environment-url <your tenant> with --package",
    );
  run(
    "npx",
    [
      "dt-app",
      "deploy",
      "--dry-run",
      "--skip-build",
      "--no-open",
      ...(environmentUrl ? ["--environment-url", environmentUrl] : []),
    ],
    work,
  );

  const outDir = join(work, "out");
  const zips = readdirSync(outDir).filter((f) => f.endsWith(".zip"));
  if (zips.length !== 1)
    fail(`expected exactly one zip in out/, found ${zips.length}`);

  // The marker check on dist/ does not prove the artifact: check the zip's own contents.
  const contents = spawnSync("unzip", ["-p", join(outDir, zips[0])], {
    encoding: "buffer",
    maxBuffer: 512 * 1024 * 1024,
  });
  if (contents.status !== 0) fail("could not read the zip with unzip");
  if (contents.stdout.includes("SA_DEBUG_FIXTURES"))
    fail("the zip still contains debug code (SA_DEBUG_FIXTURES)");

  const version = JSON.parse(
    readFileSync(join(work, "app.config.json"), "utf8"),
  ).app.version;
  const target = join(repoRoot, "out");
  mkdirSync(target, { recursive: true });
  const finalZip = join(target, `severity-assistant-${version}.zip`);
  copyFileSync(join(outDir, zips[0]), finalZip);
  const sha = createHash("sha256").update(readFileSync(finalZip)).digest("hex");
  writeFileSync(
    `${finalZip}.sha256`,
    `${sha}  severity-assistant-${version}.zip\n`,
  );
  console.log(`\nINSTALLABLE ZIP: ${finalZip}\nsha256: ${sha}`);
}

console.log(`\nRELEASE CANDIDATE OK (${ref}): ${join(work, "dist")}`);
if (keep) console.log("Temp directory kept (--keep).");
else console.log("Re-run with --keep to retain the build output.");
