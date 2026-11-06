import { checkProcessorSyntax, matcherProblems } from "./syntax";
import { Processor } from "./types";

const proc = (
  matcher: string,
  script = 'fieldsAdd dt.temp.x = "1"',
): Processor => ({
  id: "sevassist_t",
  type: "dql",
  enabled: true,
  description: "t",
  matcher,
  dql: { script },
});

describe("checkProcessorSyntax", () => {
  it("accepts the forms the compiler emits", () => {
    expect(
      checkProcessorSyntax([
        proc(
          'event.name=="x" and matchesValue(primary_tags.bu, "a") and (isNull(a) or a=="")',
        ),
        proc(
          "true",
          'fieldsAdd k = concat(coalesce(arrayFirst(a), toString(a)), "|", "b")\n| fieldsRemove sa_v',
        ),
      ]),
    ).toEqual([]);
  });

  it("rejects functions that are valid in scripts but not in matchers", () => {
    const errors = checkProcessorSyntax([
      proc('contains(event.name, "x")'),
      proc('arrayFirst(a)=="x"'),
    ]);
    expect(errors).toHaveLength(2);
    expect(errors[0].message).toContain("contains()");
  });

  it("ignores function-like text inside string literals", () => {
    expect(checkProcessorSyntax([proc('event.name=="contains(x)"')])).toEqual(
      [],
    );
  });

  it("rejects unsupported commands and unknown functions in scripts", () => {
    const errors = checkProcessorSyntax([
      proc("true", "summarize count()"),
      proc("true", "fieldsAdd a = bogus(b)"),
    ]);
    expect(errors.map((e) => e.message).join("\n")).toMatch(
      /summarize[\s\S]*bogus/,
    );
  });
});

describe("matcherProblems", () => {
  it("accepts the supported matcher forms and rejects the rest", () => {
    expect(matcherProblems("true")).toEqual([]);
    expect(
      matcherProblems(
        'matchesValue(primary_tags.bu, {"a","b"}) and isNotNull(event.name)',
      ),
    ).toEqual([]);
    expect(matcherProblems('contains(event.name, "x")')[0]).toMatch(
      /contains\(\) is not allowed/,
    );
    expect(matcherProblems('event.name=="contains(x)"')).toEqual([]);
  });
});
