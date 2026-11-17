import { buildAppUrl } from "./appLinks";

describe("buildAppUrl", () => {
  it("builds the platform address of an app screen", () => {
    expect(
      buildAppUrl(
        "https://abc.apps.dynatrace.com/",
        "my.severity.assistant",
        "/help?open=value-rules",
      ),
    ).toBe(
      "https://abc.apps.dynatrace.com/ui/apps/my.severity.assistant/help?open=value-rules",
    );
  });

  it("accepts a route without a leading slash and an environment url without a trailing one", () => {
    expect(buildAppUrl("https://abc.apps.dynatrace.com", "x.y", "help")).toBe(
      "https://abc.apps.dynatrace.com/ui/apps/x.y/help",
    );
  });
});
