// Fails if the built bundle still carries debug code. Run before packaging a Hub zip:
//   npm run build && npm run check:no-debug
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const MARKER = "SA_DEBUG_FIXTURES";
const walk = (dir) =>
  readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });

const hits = walk("dist").filter((f) => readFileSync(f, "utf8").includes(MARKER));
if (hits.length > 0) {
  console.error(`Debug code is in the build (${MARKER}):\n  ${hits.join("\n  ")}\nSet DEBUG_ENABLED = false in ui/app/debug/flag.ts (or delete ui/app/debug) and rebuild.`);
  process.exit(1);
}
console.log("OK: no debug code in dist/.");
