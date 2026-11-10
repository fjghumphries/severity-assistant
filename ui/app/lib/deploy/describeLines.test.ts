import { describeChangeLines, type ChangeSummary } from "./describe";

const empty = (): ChangeSummary => ({
  defaults: [],
  exceptions: [],
  thresholds: [],
  security: [],
  internalChanged: false,
  settings: [],
  orderChanged: false,
});

describe("describeChangeLines", () => {
  it("is empty when nothing changed", () => {
    expect(describeChangeLines(empty())).toEqual([]);
  });

  it("gives one line per change, grouped by kind, with detail or the list of changes", () => {
    const s: ChangeSummary = {
      ...empty(),
      defaults: [{ tone: "added", title: "CPU", detail: "severity 3" }],
      exceptions: [
        {
          tone: "changed",
          title: "Foo",
          changes: ["severity 2 -> 1", "order 1 -> 2"],
        },
        { tone: "removed", title: "Bar" },
      ],
      settings: ["display name"],
      orderChanged: true,
    };
    expect(describeChangeLines(s)).toEqual([
      "Add default: CPU -- severity 3",
      "Change exception: Foo -- severity 2 -> 1; order 1 -> 2",
      "Remove exception: Bar",
      "Pipeline setting: display name",
      "Change the order of exceptions",
    ]);
  });
});
