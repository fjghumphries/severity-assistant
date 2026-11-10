import React from "react";
import { useNavigate } from "react-router-dom";

import { Flex, Surface } from "@dynatrace/strato-components/layouts";
import {
  Heading,
  Paragraph,
  Strong,
  Text,
} from "@dynatrace/strato-components/typography";
import { Button } from "@dynatrace/strato-components/buttons";
import { Accordion } from "@dynatrace/strato-components/content";

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
    what: "Defaults per profile",
    limit: "Thousands",
    note: "Every default shares one lookup table, so they cost no extra processors. The table is capped at 100 KB per pipeline, which is thousands of entries. The Pipeline screen warns from 80 KB.",
  },
  {
    what: "Exceptions per profile",
    limit: "About 990",
    note: "One processor each, against a limit of 1,000 processors per pipeline. You are warned from 800. This is the limit most likely to matter.",
  },
  {
    what: "Threshold defaults per profile",
    limit: "Counted with exceptions",
    note: "One processor each, out of the same 1,000.",
  },
  {
    what: "Conditions per rule",
    limit: "4 by default, 1 to 10",
    note: "One per label, each label at most once, so a rule can combine up to this many labels. Change it in Settings; lowering it below what an existing rule uses makes that rule invalid.",
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
    q: "What is the difference between saving, deploying and enabling the route?",
    a: "Three separate steps, and only the last one changes what happens to events. Saving stores your rules and settings in the app. Deploying (step 3) writes the pipeline into your tenant, where it does nothing yet. Enabling its route makes events start flowing through it. Rule edits are stored when you confirm them; Settings and Profiles are drafts until you press Save in the bar that appears at the bottom. A banner at the top of every screen tells you which step is still outstanding.",
  },
  {
    q: "What happens to events that no rule matches?",
    a: "Whatever you choose per profile: leave the severity untouched (the default), set a severity, or set one and flag the event with sa.unmatched so you can find the gaps later.",
  },
  {
    q: "Will problems pick up the severity I set on events?",
    a: "A problem takes the severity of its most severe event, when it is created or updated. So only problems opened after the route goes live are affected; existing problems and severities already written to events are not changed, and cannot be unwritten. Today the problems and events pipelines run in parallel on the platform, so a severity written by an events pipeline may not reach the problem yet; the platform is being fixed. The event severities this app writes are correct and visible on the Results screen regardless.",
  },
  {
    q: "Can I run this alongside my own Davis event routing?",
    a: "Only if your matcher is narrow. Routing is first-match-wins and this app's route goes first, so a matcher of true takes every event and routes below it stop receiving anything. Give a profile a narrow matcher to scope it to one team or business unit.",
  },
  {
    q: "What is a profile for?",
    a: "An independent pipeline, route and rule set. Use one when a single team wants its own severities while everyone else keeps the current behaviour. Labels are shared across profiles; everything else is per profile.",
  },
  {
    q: "How do defaults and exceptions interact?",
    a: "A default gives one severity to an event or anomaly detector for everyone. An exception overrides it when the event carries particular label values. Exceptions are applied in the order you set, and the last one that matches wins.",
  },
  {
    q: "What is a label?",
    a: 'A business attribute your rules can match on, such as a business unit, an application, a tier or a stage. You say once, in Settings, which tenant field or tag holds each label\'s value. Rules then say "Tier = gold" and never name the field. Four labels come built in and you can add your own. Labels are shared by every profile.',
  },
  {
    q: "What happens to my rules if I rename a label?",
    a: "Nothing changes in how they work. Rules refer to the label internally, not by its name, so they keep matching exactly as before. The generated processors do quote the label name in their descriptions, so the next deploy will list description changes and the banner will say there are changes to deploy. That is cosmetic: matching is identical.",
  },
  {
    q: "What happens if I map a label to a different field?",
    a: 'Your rules follow the label to the new field, but nothing changes in the tenant until you deploy. After that, new events are matched on the new field; events already stored keep what they have. Values are not translated: a rule saying "Tier = gold" still looks for gold, so if the new field uses different values the rule simply stops matching, with no error. Check the coverage on the Rules screen after a remap. Because labels are shared, every profile that uses the label needs to be deployed again, and the banner only tracks the profile you are looking at.',
  },
  {
    q: "What if I disable or remove a label that rules use?",
    a: "Those rules become invalid, and the app will not deploy until you fix them: the banner says so, and the Pipeline screen shows which rule. Re-enable the label, or edit or delete the rules. Nothing already deployed is touched, so the pipeline keeps running as it was. The same happens if you lower the maximum conditions per rule below what a rule uses.",
  },
  {
    q: "Do label values have to match exactly?",
    a: 'Case does not matter for label values: a rule for bu1 also matches BU1. Anything else does, including spaces, so "bu1 " with a trailing space is a different value. Event names are different and are matched exactly, case included. Leave a condition\'s value empty to mean "label not set", which matches events that do not carry the label at all. If an event carries several values for one label, a rule matches when any one of them equals its value.',
  },
  {
    q: "How can I try rules without affecting real events?",
    a: "Give a profile a narrow route matcher, for example one team's events, so only those events are touched while everyone else is unaffected. The simulated tile on the Results screen also estimates what your rules would do to the last two hours of events before the route is live, as a lower bound. If something goes wrong, disabling the route stops new events from being touched at once.",
  },
  {
    q: "What does the coverage percentage on the Rules screen mean?",
    a: "The share of the last two hours of events that at least one rule matches. It is an estimate and a lower bound: threshold rules and detector rules cannot be evaluated from that data, so real coverage is at least this high.",
  },
  {
    q: "How do I undo a deploy?",
    a: "Disable the route on the Pipeline screen. That stops new events from being touched immediately. To remove a profile's pipeline and route from the tenant, use Settings > Remove and reset. Tick the backup option before a write if you want a file to restore from.",
  },
  {
    q: "How is the pipeline put together?",
    a: (
      <>
        Your rules compile into a short list of processors that run in order on
        every event the route sends in:
        <br />
        <br />
        <Strong>1. Default severities.</Strong> All your defaults become one
        lookup table, read straight off event.name — and a second one off the
        detector id if you key any defaults on an anomaly detector. The table
        maps a value to a severity, so one processor covers every default no
        matter how many you have.
        <br />
        <Strong>2. Threshold defaults</Strong> (if any). One processor each: it
        reads a number out of the event text and turns it into a severity. When
        both kinds of default exist, one more processor merges their results.
        <br />
        <Strong>3. Label-based exceptions.</Strong> One processor each, emitted
        in the order you set. Each one only runs when its conditions match, so
        the last match wins.
        <br />
        <Strong>4. Apply.</Strong> The final processor picks the exception
        result over the default result, writes event.severity, and records what
        decided it.
        <br />
        <br />
        Everything in between is held in temporary fields that are discarded
        before the event is stored. A profile with only defaults is two
        processors; add 50 exceptions and it is 52. Each processor is described
        in plain words in OpenPipeline, for example "exception #2 - set severity
        1 for events named Foo when Business Unit = bu1". The Pipeline screen
        shows the exact list, and "Technical details" there shows the generated
        code.
      </>
    ),
  },
  {
    q: "I deleted every rule, so why does the pipeline still have one processor?",
    a: 'That last step is the one that writes event.severity. It is always there, because it is what applies whatever the rules decided. With no rules there is nothing to apply, so what it does depends on your "when no rule matches" setting: on "Leave severity untouched" it changes nothing, but on "Set a default severity" it stamps that severity on every event the profile takes. The Deploy step warns when that is the case.',
  },
  {
    q: "How do I clear my rules, or start over?",
    a: 'Both are under Settings > Remove and reset. "Delete all rules" empties one profile\'s rules and keeps everything around them: the route matcher, the fallback severity and the deployed pipeline. Events keep their current severity until you deploy again, because the deployed pipeline still holds the old rules. To start over completely, uninstall each profile\'s pipeline first, which takes the pipeline and route out of the tenant but keeps the rules so you can deploy again. "Reset the app" then deletes the label mapping, every profile and every rule set. It does not touch the tenant, so a pipeline left deployed would keep running with nothing in the app pointing at it.',
  },
  {
    q: "What does the app leave behind in my tenant?",
    a: "One pipeline and one routing entry per profile, both named so they are recognisable, and the fields it writes on events. It creates no Grail lookup tables, and its working fields (dt.temp.*) are discarded before events are stored.",
  },
  {
    q: "Which fields does it write on an event?",
    a: "event.severity, plus sa.source (whether a default, an exception, or nothing matched) and sa.original_severity (what the event arrived with) so the Results screen can show what changed.",
  },
  {
    q: "Why do my Results numbers look small or empty?",
    a: "Processed and Modified only count events that went through this app's pipeline, so they stay at zero until the route is live. Use the simulated tile to preview the effect of your rules before then.",
  },
  {
    q: "What happens if I hit one of these limits?",
    a: "You get an error instead of a half-written pipeline. Every budget is checked against the real compiled output before anything is sent to the tenant, so a rule set that would not fit is refused at the Deploy step with the number that was exceeded. Nothing is written and the live pipeline keeps working. Well before that you get warnings: from 800 processors and from 80 KB of default lookup table.",
  },
  {
    q: "Is there a limit on how many events this can handle?",
    a: "No. The pipeline runs on every event its route sends in, whatever the volume. The limits are on how many rules you write, not on throughput.",
  },
  {
    q: "What can this app not do?",
    a: "It manages one standalone pipeline and one route per profile. It does not manage pipeline groups or bucket assignment, and it does not support Dynatrace Spaces. A profile cannot be a member of a pipeline group, because member pipelines cannot carry the storage or security-context stages this app writes -- those are accepted on save and then silently ignored by the platform.",
  },
  {
    q: "Someone else edited the pipeline. What happens?",
    a: "A deploy reads the live pipeline first and keeps any processor the app does not own, in every stage. If the object changed between that read and the write, the write is rejected rather than overwriting their change, and you can review the refreshed diff.",
  },
];

/** One reason to use the app, as a card. */
const Reason = ({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) => (
  <Surface padding={24} style={{ flex: "1 1 260px" }}>
    <Flex flexDirection="column" gap={8}>
      <Heading level={4}>{title}</Heading>
      <Text>{children}</Text>
    </Flex>
  </Surface>
);

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
  2: "Set a system-wide default severity per event, then label-based exceptions where a team differs.",
  3: "Review what will change, deploy the pipeline, then enable its route to go live.",
  4: "See which events were modified, split by detector, team, severity or pipeline.",
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

/** Why the app exists, how an event flows through it, and the questions users are likely to ask. */
export const GettingStarted = () => {
  const navigate = useNavigate();
  return (
    <Flex flexDirection="column" padding={32} gap={40}>
      <Flex flexDirection="column" gap={12}>
        <Heading level={2}>Help</Heading>
        <Prose>
          Severity Assistant decides how severe each Davis event is from rules
          you write in business terms, instead of pipeline code, and manages the
          pipeline and route that apply them.
        </Prose>
      </Flex>

      <InitialSetup />

      <Flex flexDirection="column" gap={16}>
        <Heading level={3}>Why this app</Heading>
        <Prose>
          A problem is only as severe as its most severe event. When events
          carry no meaningful severity, every problem looks alike, and anything
          downstream that routes on severity, such as a ServiceNow priority, has
          nothing to go on. Writing that logic by hand in OpenPipeline means
          scripts, lookup tables and a route that is easy to get silently wrong.
        </Prose>
        <Flex gap={16} flexWrap="wrap">
          <Reason title="Severity in business terms">
            Say &quot;CPU Saturation is Medium, but Critical for the payments
            team&quot;. No scripts, no lookup tables, and the labels are your
            own: team, application, environment.
          </Reason>
          <Reason title="See it before it is live">
            A preview of what your rules would change, an exact diff of what
            will be written, and a route that stays off until you turn it on.
            Nothing reaches an event before then.
          </Reason>
          <Reason title="Safe to undo">
            Optional backups saved on your computer, a route you can switch off
            in one click, and an uninstall that removes only what the app
            created. Other teams&apos; routes are never edited.
          </Reason>
        </Flex>
      </Flex>

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
                caption="Inside the pipeline there are only three ideas. A default gives an event or detector one severity for everyone. Exceptions override it for particular labels, in the order you set. The last step writes the result."
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

      <Accordion>
        <Accordion.Section id="limits">
          <Accordion.SectionLabel>Reference: limits</Accordion.SectionLabel>
          <Accordion.SectionContent>
            <Flex flexDirection="column" gap={16}>
              <Prose>
                <Paragraph>
                  Worth reading before you build a large rule set. Defaults are
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

      <Flex flexDirection="column" gap={16}>
        <Heading level={3}>Questions</Heading>
        <Accordion>
          {FAQ.map((item, i) => (
            <Accordion.Section key={i} id={`faq-${i}`}>
              <Accordion.SectionLabel>{item.q}</Accordion.SectionLabel>
              <Accordion.SectionContent>
                <Paragraph style={{ maxWidth: 760 }}>{item.a}</Paragraph>
              </Accordion.SectionContent>
            </Accordion.Section>
          ))}
        </Accordion>
      </Flex>
    </Flex>
  );
};
