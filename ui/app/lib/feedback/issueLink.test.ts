import { buildIssueUrl } from "./issueLink";

const ctx = { version: "9.9.9", screen: "/rules", userAgent: "TestBrowser/1" };

describe("buildIssueUrl", () => {
  it("targets the repo's new-issue page with the right label", () => {
    const bug = new URL(buildIssueUrl("bug", ctx));
    expect(bug.origin + bug.pathname).toBe(
      "https://github.com/fjghumphries/severity-assistant/issues/new",
    );
    expect(bug.searchParams.get("labels")).toBe("bug");
    expect(
      new URL(buildIssueUrl("feedback", ctx)).searchParams.get("labels"),
    ).toBe("enhancement");
  });

  it("adds version, screen and browser and warns that the repo is public", () => {
    const body = new URL(buildIssueUrl("bug", ctx)).searchParams.get("body")!;
    expect(body).toContain("9.9.9");
    expect(body).toContain("/rules");
    expect(body).toContain("TestBrowser/1");
    expect(body).toContain("public");
  });
});
