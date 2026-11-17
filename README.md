# Severity Assistant

A Dynatrace app for setting **`event.severity`** on Dynatrace events from rules written in business terms.
You say how severe an event is, optionally depending on labels such as business unit, application, tier
or team; the app generates and maintains the OpenPipeline pipeline for Dynatrace events that applies the rules.

> **Evaluation build, not a supported Dynatrace product.** Use a non-production tenant first. Questions
> and feedback go to this repository's issues.

## What it is for

Dynatrace events and problems carry a severity (`event.severity`), and a problem takes the severity of its
most severe event. Workflows, notification routing and ITSM integrations (a ServiceNow priority, for
example) can build on that field.

The severity an event arrives with is set by the detector that raised it, which does not know what the
event means for a particular application or team: the same failure-rate alert looks identical on an
outage-management service and on an internal reporting tool. OpenPipeline can set the severity conditionally, and that is the mechanism
this app uses. What the app adds is a way to keep the rules as data instead of as processor logic:

- **Rules in business terms.** "Failure rate increase is 3, but 1 for Grid Operations." The labels are your
  own (business unit, application, tier, stage, team...), mapped to the tenant fields that hold them.
- **Severity that follows a number.** When an event's description carries a value, such as the
  "Failure rate increased to 42%" that Dynatrace Intelligence writes, the severity can follow it: pick the value for each severity, and give
  a team or label its own bounds with an exception. Events from your own anomaly detectors need a little
  setup first, described on the Help page.
- **A generated pipeline.** The pipeline is regenerated from the rules each time, so it always matches
  them. It is an ordinary OpenPipeline pipeline: every processor has a plain-language description, and
  you can open it in the OpenPipeline settings. Changes are shown as a rule-level diff before anything
  is written, and processors the app does not own are left alone.
- **Staged rollout.** The route stays off until you enable it, an observe mode records what the app
  would set without changing `event.severity`, backups to your computer are optional, and uninstalling
  removes only what the app created.
- **Traceability.** Every event the app touches records what decided its severity (`sa.source`) and
  what it arrived with (`sa.original_severity`). "Explain this event" shows which rule wins and why,
  and you can check the result with a query.

It is aimed at Dynatrace admins and operations teams who manage severity for many applications or
teams. It does not create alerts or change detectors; it sets the severity of the events your detectors
already raise.

### An example

Northwind Energy runs hundreds of services: smart-meter ingestion, outage management, customer billing
and plenty of internal tools. Whenever one of them starts failing more often, Dynatrace Intelligence raises a *Failure
rate increase* event, and its description says by how much: "Failure rate increased to 12%".

The trouble is that the event looks the same everywhere. A 12% failure rate on the outage-management
service in the middle of a storm is a call in the night. The same 12% on an internal reporting tool can
wait until morning, and on a test copy nobody should be bothered at all.

With Severity Assistant, the operations team says this once, in plain terms (severity runs from 1, the
most severe, to 5):

- **The higher the failure rate, the higher the severity**, from 5% up to 50%.
- **Grid Operations' production services are treated more seriously**: for them, 10% is already the
  top severity.
- **Anything in a development environment is the lowest severity**, whoever owns it.

The app turns that into the pipeline. From then on the same event arrives with a severity that fits the
situation: the top one on outage management, a middle one on the reporting tool, the lowest on the test
copy. Workflows, notifications and ticket priorities that read the severity follow along. And when the
Grid Operations SRE team wants to manage its own rules, it can have its own profile for its events,
leaving everyone else's setup untouched.

## How it works

A first visit starts a short **Setup** (which field holds each label, which events the app takes), which
you can skip and run again from Help. Then the four steps:

1. **Profiles.** A profile is an independent pipeline and route with its own rules and its own matcher
   for the events it takes. Every install starts with one, **Default**; add another when a team wants its
   own severities while everyone else is left alone.
2. **Rules.** Per event name or anomaly detector, set a **rule** (the severity for the event), then add **exceptions**
   based on labels. Exceptions are ordered and **the last match wins**. **Explain an event** shows which
   rule wins for a given event and label values, and why.
3. **Pipeline.** The app compiles the rules into an OpenPipeline pipeline for Dynatrace events, shows a diff
   against what is live, publishes it, and manages the route. A profile can be set to **Observe** for its
   first go-live: it records `sa.proposed_severity` and leaves `event.severity` alone.
4. **Results.** See which severities events actually received, or would receive in observe mode.

Rules and the label mapping live in the app's own state, not in a Grail lookup table. The pipeline is a
*compiled artifact*, regenerated from them. Each processor carries a plain-language description in
OpenPipeline, for example `exception #2 - set severity 1 for events named "Foo" when Business Unit = bu1`.

### What it changes in your tenant

- **One pipeline and one route per profile**, named `Severity Assistant: <profile> ...` so they are
  recognisable. Processors the app does not own, in those pipelines or others, are never edited.
- **Fields written on events it touches:** `event.severity`, plus `sa.source` (what decided it),
  `sa.original_severity` (what it arrived with), `sa.proposed_severity` (observe mode only) and
  `sa.unmatched` (if you choose to flag unmatched events). Its working fields are discarded before storage.
- **Stored in the app, not in the tenant's data:** the label mapping, profiles and rules, in App State.
  No Grail lookup tables are created.
- **Removal:** each profile's pipeline and route can be removed from the app, and *Reset the app*
  deletes what it stored and, optionally, the pipelines and routes it deployed. Severities already written to events stay: they cannot be un-written.

## How to install

> **Use a non-production tenant first.** The app writes OpenPipeline settings and, once a route is
> enabled, changes `event.severity` on events. Severities already written to Grail cannot be un-written.

**You need** a Dynatrace SaaS tenant with Grail and OpenPipeline for events, permission to install
apps, and for the people using the app, access matching the scopes it requests:

| Scope | Used for |
|---|---|
| `storage:events:read`, `storage:buckets:read` | Event history, discovery and the Results screen |
| `settings:objects:read`, `settings:objects:write` | Reading and writing the OpenPipeline pipeline and route |
| `state:app-states:read`, `:write`, `:delete` | Storing the label mapping and rules |
| `davis:analyzers:execute` | Suggesting threshold patterns from real event descriptions |

Publishing edits routing for the whole tenant, so limit who can write the two settings schemas. An example
IAM policy (adjust to your own conventions):

```
ALLOW settings:objects:read, settings:objects:write
  WHERE settings:schemaId IN ("builtin:openpipeline.davis.events.pipelines",
                              "builtin:openpipeline.davis.events.routing");
ALLOW state:app-states:read, state:app-states:write, state:app-states:delete;
ALLOW storage:events:read, storage:buckets:read, davis:analyzers:execute;
```

**Cost.** Using the app consumes query capacity: it queries events when you open it. The rule
screens and label fill rates look at the last two hours; the Results screen looks at 24 hours by default
(a few GB scanned on a busy tenant) and offers other windows.

The app id is `my.severity.assistant`.

### Option A: from source

Needs Node.js 24 and the Dynatrace App Toolkit (installed by `npm install`).

```bash
git clone https://github.com/fjghumphries/severity-assistant.git
cd severity-assistant
npm install
```

`app.config.json` holds a placeholder tenant URL, so pass your own (for example
`https://<environment-id>.apps.dynatrace.com/`):

```bash
npm run deploy -- --environment-url https://<environment-id>.apps.dynatrace.com/
# builds and installs the app; opens a browser login on first use
```

> `npm run deploy` installs the **development build**, which includes a Debug panel on the Settings
> screen used for the repository's own test cycle. It is harmless for evaluation but writes test data,
> so do not click its buttons on a tenant you care about. The release zip below does not contain it.

### Option B: the release zip

Download `severity-assistant-<version>.zip` from the
[Releases page](https://github.com/fjghumphries/severity-assistant/releases) (take the newest) and check it against
the `.sha256` file next to it. It is built from a tagged commit with the debug tooling removed.

An app bundle is installed through the App Engine **Registry API** (`POST …/registry/v1/apps`, bearer
token with the `app-engine:apps:install` scope). See the
[API reference](https://docs.dynatrace.com/docs/dynatrace-api/platform-api/platform-app-engine-registry-v1/apps-post)
for the exact request. A custom app's id must start with `my.`; this one does.

> **Status:** installing this zip through the Registry API has not yet been verified end to end by the
> maintainers. If it does not work for you, use Option A and please open an issue.

## Try it safely

Use a non-production tenant and a narrow test profile.

1. **Map one or two labels you already use** (team, environment, application) in the **Setup** wizard.
2. **Create a profile with a narrow matcher** that selects only your test event, for example
   `matchesValue(event.name, "MYTEST-*")`. The Default profile of a new install takes only events
   carrying `sa.optin = true`, so it touches nothing until you change it. Do not choose "All events"
   for a test: the app's route goes first and would take every event in the tenant.
3. **Add a rule for the event and an exception on a label**, review the diff, publish, and enable the
   route. Check the outcome with **Explain an event**, the **Results** screen, or this query:

   ```
   fetch dt.davis.events, from:-24h
   | filter isNotNull(sa.source)
   | summarize events = count(),
       by:{event.name, sa.source, sa.original_severity, event.severity, sa.proposed_severity}
   | sort events desc
   ```

A profile in **Observe** mode records what it would set and leaves `event.severity` alone. When you
are done, use **Settings > Remove and reset** to remove the test profile. Questions and feedback are
welcome as issues on this repository.

## Known limitations

- **Pipeline groups and bucket assignment** are out of scope, and a profile cannot be a member of a
  pipeline group (the stages the app writes are silently ignored there).
- **Dynatrace Spaces** is not supported.
- **Routing is first-match-wins.** Each profile's route goes first. A profile that takes every
  event (matcher `true`) makes routes below it, including other teams' pipelines, stop receiving them.
  Give a profile a narrow matcher; the app asks you to confirm before you choose "All events".
- **Limits:** about 990 exceptions per profile (one processor each, against a platform limit of 1,000),
  rules effectively unlimited (they share one lookup table), up to 4 conditions per rule. The app
  refuses to publish something that would not fit rather than writing a partial pipeline. The full list
  is on the **Help** page.
- **Test against a saved, routed pipeline**, not OpenPipeline Preview.

## Contributing

Build, test and release instructions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

See [CHANGELOG.md](CHANGELOG.md) and the [Releases page](https://github.com/fjghumphries/severity-assistant/releases).
