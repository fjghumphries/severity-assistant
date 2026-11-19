import React from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
  ExternalLink,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { TextInput } from "@dynatrace/strato-components/forms";
import { Accordion, CodeSnippet } from "@dynatrace/strato-components/content";

import {
  InsidePipelineDiagram,
  JourneyDiagram,
  ProfilesDiagram,
} from "../components/Diagrams";
import { Prose } from "../components/Prose";
import { useRegistry } from "../lib/config/useRegistry";
import { usableRoles } from "./rules/shared";

import { STEPS } from "../components/steps";

interface Faq {
  topic: string;
  q: string;
  a: React.ReactNode;
}

interface LimitRow {
  what: string;
  limit: string;
  note: string;
}

/**
 * Platform and app limits a user should know before building rules. Numbers come from
 * docs/01-openpipeline-verified-facts.md section 5 (measured against the tenant, not the docs) and
 * from the compiler's own budget checks in lib/compiler/validate.ts -- keep the two in step.
 */
const LIMITS: LimitRow[] = [
  {
    what: "Rules per profile",
    limit: "Thousands",
    note: "Every rule shares one lookup table, so they cost no extra processors. The table is capped at 100 KB per pipeline, which is thousands of entries. The Pipeline screen warns from 80 KB.",
  },
  {
    what: "Exceptions per profile",
    limit: "About 990",
    note: "One processor each, against a limit of 1,000 processors per pipeline. You are warned from 800. This is the limit most likely to matter.",
  },
  {
    what: "Threshold rules per profile",
    limit: "Counted with exceptions",
    note: "One processor each, out of the same 1,000.",
  },
  {
    what: "Conditions per rule",
    limit: "Up to 4",
    note: "One per label, each label at most once, and a rule stores four conditions, so four is the most (fewer if you have fewer labels). It is worked out from your labels; there is nothing to set.",
  },
  {
    what: "Labels",
    limit: "4 to start, add your own",
    note: "Business Unit, Application, Tier and Stage come built in; add more in Settings. Enabling more than 6 is flagged, because every rule editor gets a slot for each. You choose which tenant field each one reads, and rules refer to the label, never the field.",
  },
  {
    what: "Severity values",
    limit: "1 to 5",
    note: "1 is the most severe. A problem takes the severity of its most severe event.",
  },
  {
    what: "Profiles",
    limit: "Up to 100 pipelines and 100 routes per tenant",
    note: "Each profile uses one of each, and they are shared with every other pipeline in the tenant, not just this app's.",
  },
  {
    what: "Rule text length",
    limit: "4,096 characters of conditions per rule",
    note: "Reached only by unusually long label values. A threshold rule's generated code is capped at 8,192 characters.",
  },
];

/** Questions users are expected to ask, answered from what this app actually does today. */
const FAQ: Faq[] = [
  {
    topic: "Going live and undoing",
    q: "What is the difference between saving, publishing and enabling the route?",
    a: "Three separate steps, and only the last one changes what happens to events. Saving stores your rules and settings in the app. Publishing (on the Pipeline screen) writes the pipeline into your tenant, where it does nothing yet. Enabling its route makes events start flowing through it. Rule edits are stored when you confirm them; Settings and Profiles are drafts until you press Save in the bar that appears at the bottom. A banner at the top of every screen tells you which step is still outstanding.",
  },
  {
    topic: "Concepts",
    q: "What happens to events that no rule matches?",
    a: "Whatever you choose per profile: leave the severity untouched (the usual choice), set a severity, or set one and flag the event with sa.unmatched so you can find the gaps later.",
  },
  {
    topic: "Going live and undoing",
    q: "Will problems pick up the severity I set on events?",
    a: "A problem takes the severity of its most severe event, when it is created or updated. So only problems opened after the route goes live are affected; existing problems and severities already written to events are not changed, and cannot be unwritten. The app writes the severity as a number, the form Dynatrace Intelligence expects, and the event severities it writes are visible on the Results screen.",
  },
  {
    topic: "Going live and undoing",
    q: "Can I run this alongside my own event routing?",
    a: "Only if your matcher is narrow. Routing is first-match-wins and this app's route goes first, so a matcher of true takes every event and routes below it stop receiving anything. Give a profile a narrow matcher to scope it to one team or business unit.",
  },
  {
    topic: "Concepts",
    q: "How do I configure an anomaly detector to use threshold monitoring?",
    a: 'In the detector\'s event template, put the metric value in the description after a fixed label with the {severity} placeholder, for example "Triggering Value: {severity}", and write a by-value rule with a pattern that reads the number after that label. Do not add computed fields to the query (such as max_cpu = arrayMax(...)) to get the number into the text: Dynatrace treats a changing value in the query result as a new timeseries and opens a new problem every time it changes. The {severity} value is the one that opened the alert and does not change if the alert escalates. Events that Dynatrace Intelligence writes itself, such as the failure rate of a service, update their description, so they work with no setup. The step-by-step example is in the section "Severity from a number" on this page, and the rule editor tests your pattern on a real description.',
  },
  {
    topic: "Concepts",
    q: "What is a profile for?",
    a: "An independent pipeline, route and rule set. Every install starts with one, called Default, which is where setup puts your labels and first rules. Add another when a single team wants its own severities while everyone else keeps the current behaviour: give it a narrow matcher for that team's events and only those go through it. Labels are shared across profiles; everything else is per profile.",
  },
  {
    topic: "Concepts",
    q: "How do rules and exceptions interact?",
    a: "A rule gives one severity to an event or anomaly detector for everyone. An exception overrides it when the event carries particular label values. Exceptions are applied in the order you set, and the last one that matches wins.",
  },
  {
    topic: "Concepts",
    q: "What is a label?",
    a: 'A business attribute your rules can match on, such as a business unit, an application, a tier or a stage. You say once, in Settings, which tenant field or tag holds each label\'s value. Rules then say "Tier = gold" and never name the field. Four labels come built in and you can add your own. Labels are shared by every profile.',
  },
  {
    topic: "Concepts",
    q: "What happens to my rules if I rename a label?",
    a: "Nothing changes in how they work. Rules refer to the label internally, not by its name, so they keep matching exactly as before. The generated processors do quote the label name in their descriptions, so the next publish will list description changes and the banner will say there are changes to publish. That is cosmetic: matching is identical.",
  },
  {
    topic: "Concepts",
    q: "What happens if I map a label to a different field?",
    a: 'Your rules follow the label to the new field, but nothing changes in the tenant until you publish. After that, new events are matched on the new field; events already stored keep what they have. Values are not translated: a rule saying "Tier = gold" still looks for gold, so if the new field uses different values the rule simply stops matching, with no error. Check the coverage on the Rules screen after a remap. Because labels are shared, every profile that uses the label needs to be deployed again, and the banner only tracks the profile you are looking at.',
  },
  {
    topic: "Concepts",
    q: "What if I disable or remove a label that rules use?",
    a: "Those rules become invalid, and the app will not publish until you fix them: the banner says so, and the Pipeline screen shows which rule. Re-enable the label, or edit or delete the rules. Nothing already deployed is touched, so the pipeline keeps running as it was.",
  },
  {
    topic: "Concepts",
    q: "Do label values have to match exactly?",
    a: 'Case does not matter for label values: a rule for bu1 also matches BU1. Anything else does, including spaces, so "bu1 " with a trailing space is a different value. Event names are different and are matched exactly, case included. Leave a condition\'s value empty to mean "label not set", which matches events that do not carry the label at all. If an event carries several values for one label, a rule matches when any one of them equals its value.',
  },
  {
    topic: "Going live and undoing",
    q: "How can I try rules without affecting real events?",
    a: "Give a profile a narrow route matcher, for example one team's events, so only those events are touched while everyone else is unaffected. The simulated tile on the Results screen also estimates what your rules would do to the last two hours of events before the route is live, as a lower bound. If something goes wrong, disabling the route stops new events from being touched at once.",
  },
  {
    topic: "Checking the result",
    q: "What does the coverage percentage on the Rules screen mean?",
    a: "The share of the last two hours of events that at least one rule matches. It is an estimate and a lower bound: threshold rules and detector rules cannot be evaluated from that data, so real coverage is at least this high.",
  },
  {
    topic: "Going live and undoing",
    q: "How do I undo a publish?",
    a: "Disable the route on the Pipeline screen. That stops new events from being touched immediately. To remove a profile's pipeline and route from the tenant, use Uninstall at the bottom of the Pipeline screen (select the profile first). Tick the backup option before a write if you want a file to restore from.",
  },
  {
    topic: "Reference: what the app builds",
    q: "How is the pipeline put together?",
    a: (
      <>
        Your rules compile into a short list of processors that run in order on
        every event the route sends in:
        <br />
        <br />
        <Strong>1. Rules.</Strong> All your rules become one lookup table, read
        straight off event.name — and a second one off the detector id if you
        key any rules on an anomaly detector. The table maps a value to a
        severity, so one processor covers every rule no matter how many you
        have.
        <br />
        <Strong>2. Threshold rules</Strong> (if any). One processor each: it
        reads a number out of the event text and turns it into a severity. When
        both kinds of rule exist, one more processor merges their results.
        <br />
        <Strong>3. Exceptions.</Strong> One processor each, emitted in the order
        you set. Each one only runs when its conditions match, so the last match
        wins.
        <br />
        <Strong>4. Apply.</Strong> The final processor picks the exception
        result over the rule result, writes event.severity, and records what
        decided it.
        <br />
        <br />
        Everything in between is held in temporary fields that are discarded
        before the event is stored. A profile with only rules is two processors;
        add 50 exceptions and it is 52. Each processor is described in plain
        words in OpenPipeline, for example "exception #2 - set severity 1 for
        events named Foo when Business Unit = bu1". The Pipeline screen shows
        the exact list, and "Technical details" there shows the generated code.
      </>
    ),
  },
  {
    topic: "Reference: what the app builds",
    q: "I deleted every rule, so why does the pipeline still have one processor?",
    a: 'That last step is the one that writes event.severity. It is always there, because it is what applies whatever the rules decided. With no rules there is nothing to apply, so what it does depends on your "events with no rule" setting: on "Leave severity untouched" it changes nothing, but on "Set a severity for them" it stamps that severity on every event the profile takes. The Pipeline screen warns when that is the case.',
  },
  {
    topic: "Maintenance and removal",
    q: "How do I clear my rules, or start over?",
    a: 'Rules and the full reset are under Settings > Remove and reset. "Delete all rules" empties one profile\'s rules and keeps everything around them: the route matcher, the fallback severity and the deployed pipeline. Events keep their current severity until you publish again, because the deployed pipeline still holds the old rules. To start over completely, use "Reset the app": it deletes the label mapping, every profile and every rule set, and (with the option ticked, the default) removes the pipelines and routes the app deployed. To take only the pipeline and route out of the tenant and keep the rules, use Uninstall on that profile\'s Pipeline screen instead. Removing a profile on the Profiles screen can uninstall its pipeline in the same step. Neither changes events that were already processed.',
  },
  {
    topic: "Reference: what the app builds",
    q: "What does the app leave behind in my tenant?",
    a: "One pipeline and one routing entry per profile, both named so they are recognisable, and the fields it writes on events. It creates no Grail lookup tables, and its working fields (dt.temp.*) are discarded before events are stored.",
  },
  {
    topic: "Reference: what the app builds",
    q: "Which fields does it write on an event?",
    a: "event.severity, plus sa.source (whether a rule, an exception, or nothing matched) and sa.original_severity (what the event arrived with) so the Results screen can show what changed.",
  },
  {
    topic: "Checking the result",
    q: "Why do my Results numbers look small or empty?",
    a: "Processed and Modified only count events that went through this app's pipeline, so they stay at zero until the route is live. Use the simulated tile to preview the effect of your rules before then.",
  },
  {
    topic: "Limits and platform",
    q: "What happens if I hit one of these limits?",
    a: "You get an error instead of a half-written pipeline. Every budget is checked against the real compiled output before anything is sent to the tenant, so a rule set that would not fit is refused when you publish, with the number that was exceeded. Nothing is written and the live pipeline keeps working. Well before that you get warnings: from 800 processors and from 80 KB of rule lookup table.",
  },
  {
    topic: "Limits and platform",
    q: "Is there a limit on how many events this can handle?",
    a: "No. The pipeline runs on every event its route sends in, whatever the volume. The limits are on how many rules you write, not on throughput.",
  },
  {
    topic: "Limits and platform",
    q: "What can this app not do?",
    a: "It manages one standalone pipeline and one route per profile. It does not manage pipeline groups or bucket assignment, and it does not support Dynatrace Spaces. A profile cannot be a member of a pipeline group, because member pipelines cannot carry the storage or security-context stages this app writes -- those are accepted on save and then silently ignored by the platform.",
  },
  {
    topic: "Limits and platform",
    q: "Someone else edited the pipeline. What happens?",
    a: "Publishing reads the live pipeline first and keeps any processor the app does not own, in every stage. If the object changed between that read and the write, the write is rejected rather than overwriting their change, and you can review the refreshed diff.",
  },
  {
    topic: "Checking the result",
    q: "How do I check what rule decided an event's severity?",
    a: "Use Explain an event on the Rules screen: choose an event (or detector) and the label values it carries, and it shows which rule wins, which others matched or missed and why. It evaluates event names and labels only; threshold rules read a number from the event text, so it reports them as undecided rather than guessing. For events that already went through the pipeline, sa.source says whether a rule, an exception or nothing decided, and sa.original_severity is what the event arrived with.",
  },
  {
    topic: "Going live and undoing",
    q: "What is observe mode?",
    a: "A per-profile setting. In observe mode the pipeline writes sa.proposed_severity, the severity it would set, and leaves event.severity alone, so you can compare on the Results screen before anything real changes. It is meant for a profile's first go-live. While it is on, the profile does not change event.severity at all, so rules that were already live stop applying: switch back to Live once you have compared. To try one new rule on real traffic, a profile with a narrow matcher for a slice of events is usually the better tool.",
  },
  {
    topic: "Maintenance and removal",
    q: "Can I back up my rules or move them to another tenant?",
    a: "Yes. Settings > Export and import rules saves your labels, profiles and rules as one JSON file on your computer. Import offers merge (keep what you have, add what is missing) or replace, shows a preview and refuses a file with invalid rules. Importing only writes the app's own state: nothing is published until you publish. This is different from the pipeline backup on the Pipeline screen, which holds compiled output and cannot be turned back into rules.",
  },
  {
    topic: "Maintenance and removal",
    q: "I skipped the setup. How do I do it later?",
    a: "A banner on every screen offers Finish setup until at least one label is saved, and Run setup again is always available at the top of this page. The setup shows your current values and changes nothing until you save, so running it again is safe.",
  },
  {
    topic: "Limits and platform",
    q: "Does the app cost anything to run?",
    a: "Using it consumes Dynatrace query capacity: it runs queries on events when you open it, and queries are billed by data scanned. The rule screens and the label fill rates look at the last two hours; the Results screen looks at 24 hours by default (a few GB on a busy tenant) and offers other windows. Opening Results less often, or choosing a shorter window, is the lever.",
  },
];

/** A diagram with a heading and a sentence on what to take from it. */
const Figure = ({
  title,
  caption,
  children,
}: {
  title: string;
  caption: string;
  children: React.ReactNode;
}) => (
  <Flex flexDirection="column" gap={12}>
    <Heading level={3}>{title}</Heading>
    <Prose>{caption}</Prose>
    <Surface padding={24}>{children}</Surface>
  </Flex>
);

const STEP_TEXT: Record<number, string> = {
  1: "Pick the profile to work on, or create one for a team that needs its own severities.",
  2: "Set a rule per event, then exceptions where a team differs.",
  3: "Review what will change, publish the pipeline, then enable its route to go live.",
  4: "See which events were modified, split by detector, team, severity or pipeline.",
};

const TOPIC_ORDER = [
  "Concepts",
  "Going live and undoing",
  "Checking the result",
  "Maintenance and removal",
  "Limits and platform",
  "Reference: what the app builds",
];

/** The FAQ, grouped by topic, with a filter box. Filtering matches the question text. */
const Questions = () => {
  const [filter, setFilter] = React.useState("");
  const needle = filter.trim().toLowerCase();
  const shown = FAQ.map((item, i) => ({ item, i })).filter(
    ({ item }) => needle === "" || item.q.toLowerCase().includes(needle),
  );
  return (
    <Flex flexDirection="column" gap={16}>
      <Heading level={3}>Questions</Heading>
      <Flex style={{ maxWidth: 420 }}>
        <TextInput
          value={filter}
          onChange={setFilter}
          placeholder="Filter the questions..."
        />
      </Flex>
      {shown.length === 0 && <Text>No question matches that.</Text>}
      {TOPIC_ORDER.map((topic) => {
        const items = shown.filter(({ item }) => item.topic === topic);
        if (items.length === 0) return null;
        return (
          <Flex key={topic} flexDirection="column" gap={8}>
            <Heading level={4}>{topic}</Heading>
            <Accordion>
              {items.map(({ item, i }) => (
                <Accordion.Section key={i} id={`faq-${i}`}>
                  <Accordion.SectionLabel>{item.q}</Accordion.SectionLabel>
                  <Accordion.SectionContent>
                    <Paragraph style={{ maxWidth: 760 }}>{item.a}</Paragraph>
                  </Accordion.SectionContent>
                </Accordion.Section>
              ))}
            </Accordion>
          </Flex>
        );
      })}
    </Flex>
  );
};

/** Step zero: the labels must be mapped and saved before a rule can use them. */
const InitialSetup = () => {
  const navigate = useNavigate();
  const { registry, isLoading, isError } = useRegistry();
  if (isLoading || isError) return null;
  const labels = usableRoles(registry);
  const done = labels.length > 0;
  return (
    <Surface padding={24}>
      <Flex flexDirection="column" gap={12}>
        <Heading level={3}>
          {done ? "Setup: done" : "Setup: not finished"}
        </Heading>
        <Prose>
          {done
            ? `${labels.length} labels are saved (${labels
                .map((l) => l.label)
                .join(
                  ", ",
                )}). You can run the setup again at any time; it shows your current values and changes nothing until you save.`
            : "A one-minute setup: say which tenant field holds each label and which events the app takes. You can skip it and come back; the rest of the app tells you what is missing."}
        </Prose>
        <Flex>
          <Button
            variant={done ? "emphasized" : "accent"}
            onClick={() => navigate("/setup")}
          >
            {done ? "Run setup again" : "Finish setup"}
          </Button>
        </Flex>
      </Flex>
    </Surface>
  );
};

/** Worked example for the "severity from a number" Help section (a host CPU detector). */
const DETECTOR_QUERY = `timeseries cpu_usage = avg(dt.host.cpu.usage),
  by: { dt.smartscape.host, host.name, primary_tags.bu, primary_tags.tier }`;

const DETECTOR_TEMPLATE = `event.type: CUSTOM_ALERT
event.name: CPU alert on {host.name}
event.description: |
  CPU is above the threshold of {threshold}.
  Triggering Value: {severity}`;

const DETECTOR_PATTERN = `DATA 'Triggering Value: 'DOUBLE:sa_v`;

const DETECTOR_CHECK = `fetch dt.davis.events, from: -1h
| filter matchesPhrase(event.name, "CPU alert")
| fields timestamp, event.start, event.end, event.description
| sort timestamp desc
| limit 10`;

/** Why the app exists, how an event flows through it, and the questions users are likely to ask. */
export const GettingStarted = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const openSection = params.get("open");
  React.useEffect(() => {
    if (openSection !== "value-rules") return;
    document
      .getElementById("value-rules-anchor")
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [openSection]);
  return (
    <Flex flexDirection="column" padding={32} gap={40}>
      <Flex flexDirection="column" gap={12}>
        <Heading level={2}>Help</Heading>
        <Prose>
          Severity Assistant decides how severe each event is from rules you
          write in business terms, and generates and manages the pipeline and
          route that apply them.
        </Prose>
      </Flex>

      <InitialSetup />

      <Accordion>
        <Accordion.Section id="how-it-works">
          <Accordion.SectionLabel>
            How it works, in three diagrams
          </Accordion.SectionLabel>
          <Accordion.SectionContent>
            <Flex flexDirection="column" gap={32}>
              <Figure
                title="The journey of an event"
                caption="An event is raised, a route decides which pipeline sees it, the pipeline applies your rules, and the event is stored with a severity. The problem then takes the most severe of its events, and a workflow can act on that."
              >
                <JourneyDiagram />
              </Figure>

              <Figure
                title="What your rules become"
                caption="Inside the pipeline there are only three ideas. A rule gives an event or detector one severity for everyone. Exceptions override it for particular labels, in the order you set. The last step writes the result."
              >
                <InsidePipelineDiagram />
              </Figure>

              <Figure
                title="One team, its own rules"
                caption="Each profile has its own route, matched in order, so a team can have its own severities without touching anyone else. An event goes to the first route that matches it; the rest is left as it was."
              >
                <ProfilesDiagram />
              </Figure>
            </Flex>
          </Accordion.SectionContent>
        </Accordion.Section>
      </Accordion>

      <Flex flexDirection="column" gap={16}>
        <Heading level={3}>Four steps</Heading>
        <Flex gap={16} flexWrap="wrap">
          {STEPS.map((step) => (
            <Surface key={step.path} padding={24} style={{ flex: "1 1 220px" }}>
              <Flex
                flexDirection="column"
                gap={12}
                style={{ height: "100%" }}
                justifyContent="space-between"
              >
                <Flex flexDirection="column" gap={8}>
                  <Strong>
                    {step.n}. {step.title}
                  </Strong>
                  <Text>{STEP_TEXT[step.n]}</Text>
                </Flex>
                <Flex>
                  <Button
                    variant="emphasized"
                    onClick={() => navigate(step.path)}
                  >
                    Open
                  </Button>
                </Flex>
              </Flex>
            </Surface>
          ))}
        </Flex>
      </Flex>

      <div id="value-rules-anchor">
        <Accordion
          defaultExpanded={
            openSection === "value-rules" ? "value-rules" : undefined
          }
        >
          <Accordion.Section id="value-rules">
            <Accordion.SectionLabel>
              Severity from a number: set up your own detector first
            </Accordion.SectionLabel>
            <Accordion.SectionContent>
              <Flex flexDirection="column" gap={16}>
                <Prose>
                  <Paragraph>
                    A rule can read a number from the event description. Events
                    that Dynatrace Intelligence writes itself, such as the
                    failure rate of a service, update their description as the
                    problem develops, so a rule follows them with no setup.
                    <Strong> Your own anomaly detector</Strong> (a custom alert)
                    needs a few settings, and one thing to avoid.
                  </Paragraph>
                </Prose>

                <Heading level={4}>What to avoid</Heading>
                <Prose>
                  <Paragraph>
                    Do not add fields to the detector&apos;s query to get the
                    number into the text, such as{" "}
                    <code>fieldsAdd max_cpu = arrayMax(cpu_usage)</code>. It
                    works, but a changing value in the query result counts as a
                    new timeseries, so Dynatrace opens a new alert, and with it
                    a new problem, every time the value changes. On a test
                    tenant a detector that evaluated every minute opened a
                    problem per minute. Dynatrace&apos;s{" "}
                    <ExternalLink href="https://docs.dynatrace.com/docs/dynatrace-intelligence/anomaly-detection/anomaly-detection-app/anomaly-detection-dql-best-practice">
                      DQL best practices
                    </ExternalLink>{" "}
                    for custom alerts say the same: keep dimensions stable.
                  </Paragraph>
                </Prose>

                <Heading level={4}>1. Query: keep it plain</Heading>
                <Prose>
                  <Paragraph>
                    Group by the fields your labels use (tier, business unit and
                    so on) and nothing computed.
                  </Paragraph>
                </Prose>
                <CodeSnippet language="dql">{DETECTOR_QUERY}</CodeSnippet>

                <Heading level={4}>2. Alert condition</Heading>
                <Prose>
                  <Paragraph>
                    Use a static threshold on the series, for example{" "}
                    <code>ABOVE 90</code>. It only decides when the detector
                    raises an event; the rules in this app decide its severity
                    from the number.
                  </Paragraph>
                </Prose>

                <Heading level={4}>
                  3. Event template: the {"{severity}"} placeholder
                </Heading>
                <Prose>
                  <Paragraph>
                    In the detector&apos;s event properties, put the value in
                    the description after a fixed label, using the{" "}
                    <code>{"{severity}"}</code> placeholder. It holds the metric
                    value that opened the alert.
                  </Paragraph>
                </Prose>
                <CodeSnippet language="yaml">{DETECTOR_TEMPLATE}</CodeSnippet>
                <Prose>
                  <Paragraph>
                    <Strong>It does not follow an escalation.</Strong> The text
                    keeps the value from the moment the alert opened, even if
                    the metric climbs later, so a rule sees how bad it was at
                    the start. If you need the severity to follow an escalation
                    of a custom alert, use one detector per level (a second one
                    with the higher threshold) and give each its own rule.
                  </Paragraph>
                  <Paragraph>
                    Events of type <code>CUSTOM_ALERT</code> are not merged into
                    existing problems by default. With one event per alert that
                    usually does not matter; if you still see several problems
                    for one condition, add the event property{" "}
                    <code>dt.davis.is_merging_allowed</code> with the value{" "}
                    <code>true</code>.
                  </Paragraph>
                </Prose>

                <Heading level={4}>4. Rule in this app</Heading>
                <Prose>
                  <Paragraph>
                    Add a rule for the detector, choose &quot;severity by
                    value&quot;, and use a pattern that starts at the label:
                  </Paragraph>
                </Prose>
                <CodeSnippet language="log">{DETECTOR_PATTERN}</CodeSnippet>
                <Prose>
                  <Paragraph>
                    Then set the bounds, for example 95, 90 and 80 for Critical,
                    High and Medium. Per-team thresholds are exceptions with
                    label conditions on the same rule. The editor tests the
                    pattern on a real description (&quot;Use the latest
                    event&quot;) and does not let you save one that reads
                    nothing.
                  </Paragraph>
                </Prose>

                <Heading level={4}>5. Check it</Heading>
                <Prose>
                  <Paragraph>
                    After the detector has fired, look at its events: there
                    should be one event per host while the condition lasts, and
                    the description should hold a real number.
                  </Paragraph>
                </Prose>
                <CodeSnippet language="dql">{DETECTOR_CHECK}</CodeSnippet>
              </Flex>
            </Accordion.SectionContent>
          </Accordion.Section>
        </Accordion>
      </div>

      <Accordion>
        <Accordion.Section id="limits">
          <Accordion.SectionLabel>Reference: limits</Accordion.SectionLabel>
          <Accordion.SectionContent>
            <Flex flexDirection="column" gap={16}>
              <Prose>
                <Paragraph>
                  Worth reading before you build a large rule set. Rules are
                  effectively unlimited because they share one lookup table;
                  exceptions cost one processor each, so they are the number to
                  watch.
                </Paragraph>
              </Prose>
              <Flex flexDirection="column" gap={8}>
                {LIMITS.map((row) => (
                  <Surface key={row.what} padding={16}>
                    <Flex flexDirection="column" gap={4}>
                      <Flex gap={12} alignItems="baseline" flexWrap="wrap">
                        <Strong>{row.what}</Strong>
                        <Text>{row.limit}</Text>
                      </Flex>
                      <Text style={{ maxWidth: 760 }}>{row.note}</Text>
                    </Flex>
                  </Surface>
                ))}
              </Flex>
            </Flex>
          </Accordion.SectionContent>
        </Accordion.Section>
      </Accordion>

      <Questions />
    </Flex>
  );
};
