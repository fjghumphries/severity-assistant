/** The four steps of the flow, in order. One definition for the side rail, the pages and Help. */

export type StepTone = "neutral" | "success" | "warning" | "critical";

export interface StepState {
  /** Short status, e.g. "3 rules" or "Route live". */
  label: string;
  tone: StepTone;
}

export type StepKey = "profiles" | "rules" | "pipeline" | "results";

export const STEPS: { key: StepKey; n: number; title: string; path: string }[] =
  [
    { key: "profiles", n: 1, title: "Profiles", path: "/profiles" },
    { key: "rules", n: 2, title: "Rules", path: "/rules" },
    { key: "pipeline", n: 3, title: "Pipeline", path: "/pipeline" },
    { key: "results", n: 4, title: "Results", path: "/results" },
  ];
