import { profileColor } from "./profileColor";

describe("profileColor", () => {
  const ids = ["default", "a", "b"];

  it("is stable for the same profile", () => {
    expect(profileColor("a", ids)).toEqual(profileColor("a", ids));
  });

  it("gives each profile its own colour", () => {
    const colors = ids.map((id) => profileColor(id, ids).accent);
    expect(new Set(colors).size).toBe(ids.length);
  });

  it("falls back safely for an unknown profile", () => {
    expect(profileColor("gone", ids).accent).toMatch(/^hsl\(/);
  });
});
