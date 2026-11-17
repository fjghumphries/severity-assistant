import { readFileSync } from "fs";
import { join } from "path";

import { APP_VERSION } from "./appInfo";

describe("APP_VERSION", () => {
  it("matches package.json and app.config.json", () => {
    const root = join(__dirname, "..", "..", "..");
    const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
    const cfg = JSON.parse(readFileSync(join(root, "app.config.json"), "utf8"));
    expect(APP_VERSION).toBe(pkg.version);
    expect(APP_VERSION).toBe(cfg.app.version);
  });
});
