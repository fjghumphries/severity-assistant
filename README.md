# Severity Assistant

Use Dynatrace's **`event.severity`** without writing or maintaining OpenPipeline code. You write severity
rules in business terms; the app builds and maintains the Davis-events pipeline that applies them.

> **Evaluation build, not a supported Dynatrace product.** Use a non-production tenant first. Questions
> and feedback go to this repository's issues.

## Why this app

Davis events and problems carry a severity (`event.severity`), and a problem takes the severity of its
most severe event. That field is what you can prioritise, route and escalate on: a ServiceNow priority,
a notification channel, a workflow branch.

The catch is that the severity an event arrives with comes from the detector that raised it, not from
what the event means for *your* business. The same CPU alert looks identical on the payments gateway
and on a test box. Making severity reflect business impact means setting it yourself in OpenPipeline,
and that is where it gets hard:

- It is **code**: DQL scripts, lookup tables and a route, written by someone who knows OpenPipeline,
  while the people who know what matters are somewhere else.
- It is **hard to maintain**: every new application, team or exception means editing logic that nobody
  can read at a glance.
- It **fails silently**: a wrong key, a remapped field or a route in the wrong position produces no
  error, just a pipeline that quietly does nothing, discovered when a sev-1 arrives as a sev-3.

This app lets you use the severity field without owning that code. You write rules; the app writes and
maintains the pipeline.

- **Severity in business terms.** "CPU Saturation is 3, but 1 for the payments team." The labels are
  your own (business unit, application, tier, stage...). You never see a script.
- **No pipeline to maintain.** The pipeline is regenerated from your rules every time, so it cannot
  drift from them. Changes are shown as a rule-level diff before anything is written, and processors
  the app does not own are left alone.
- **Safe to try, easy to undo.** A route that stays off until you turn it on, an observe mode that
  records what it *would* set without changing anything, optional backups on your computer, and an
  uninstall that removes only what the app created. Other teams' routes are never edited.
- **Verifiable, so you can trust it.** Every event the app touches records which tier decided it
  (`sa.source`) and what it arrived with (`sa.original_severity`). "Explain this event" shows which
  rule wins and why, and you can check the result with a query.

It is for Dynatrace admins and operations teams who want severity to mean something downstream without
becoming OpenPipeline authors. It does not create alerts or change detectors; it sets the severity of
the events your detectors already raise.

> [!WARNING]
> **Severity set on events does not yet reliably reach problems.** This app sets the severity of
> *events*. Problems and events are processed by separate pipelines that currently run in parallel, so a
> problem can be created before an event's new severity is visible to it. If you use events directly (for
> example an event feed), this does not affect you. If you send **problems** to an ITSM tool such as
> ServiceNow, check that the severity arrives before you rely on it.

### An example

Northwind Bank runs hundreds of applications for dozens of teams, and one alert, *CPU saturation*, fires
across all of them. Today it carries the same severity everywhere, so a payment outage and a broken
test box look alike.

**Retail Banking** runs the payments gateway: gold tier, in production, where every minute of downtime
costs money. **Corporate IT** runs internal tools such as HR and expenses, where the same alert can wait
until morning. Severity runs from **1 (most severe) to 5**. Using the built-in labels (Business Unit, Application, Tier, Stage), their rules read:

1. **Default:** CPU saturation is severity **3** for everyone.
2. *Corporate IT:* **4**. It is an internal tool.
3. *Retail Banking:* **2**. It matters more here.
4. *Retail Banking, gold tier, production:* **1**. This is the one worth waking someone for.
5. *Stage = dev, any event:* **5**. Nobody is paged for a test environment, whoever owns it.

The last matching rule wins, so putting the specific rules after the general ones does the right thing. The
same alert now arrives as **1** on the production payments gateway, **5** on its dev copy, **4** on the HR
tool and **3** everywhere else, without anyone writing OpenPipeline. When Retail Banking's SRE team wants
to own its rules, it gets its own profile with a narrow matcher for its events, so Corporate IT's pipeline
and everyone else's routes are left untouched.

## How it works

A first visit starts a short **Setup** (which field holds each label, which events the app takes), which
you can skip and run again from Help. Then the four steps:

1. **Profiles.** A profile is an independent pipeline and route with its own rules and its own matcher
   for the events it takes. Every install starts with one, **Default**; add another when a team wants its
   own severities while everyone else is left alone.
2. **Rules.** Per event name or anomaly detector, set a **default** severity, then add **exceptions**
   based on labels. Exceptions are ordered and **the last match wins**. **Explain an event** shows which
   rule wins for a given event and label values, and why.
3. **Pipeline.** The app compiles the rules into a Davis-events OpenPipeline pipeline, shows a diff
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
  deletes what it stored. Severities already written to events stay: they cannot be un-written.

## How to install

> **Use a non-production tenant first.** The app writes OpenPipeline settings and, once a route is
> enabled, changes `event.severity` on events. Severities already written to Grail cannot be un-written.

**You need** a Dynatrace SaaS tenant with Grail and OpenPipeline for Davis events, permission to install
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

**Cost.** Using the app consumes query capacity: it queries Davis events when you open it. The rule
screens and label fill rates look at the last two hours; the Results screen looks at 24 hours by default
(a few GB scanned on a busy tenant) and offers other windows.

The app id is `my.severity.assistant`.

### Option A: from source (recommended)

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

### First launch

Open the app from the tenant's app menu. A first visit starts the **Setup** wizard (skippable, and
re-runnable from Help): which field holds each label, which events the app takes, and what happens to the
rest. The **Help** page explains the four steps, lists the limits, and answers the questions people ask
first. A banner on every screen tells you what is still unfinished (setup, rules saved but not deployed,
deployed but no route, and so on).

## How to test

A quick way to try it in your own tenant, with your own labels. No script and no fixed recipe: adapt it
to what you have. Allow 20 to 30 minutes.

1. **Pick one or two labels you already use**: team, environment, application, cost centre. A label is a
   business attribute plus the event field that holds its value, so a rule says "Team = payments" and
   never mentions the field. Map them in the **Setup** wizard (or later in **Settings**, where you can
   rename the built-in labels or add your own).
2. **Get an event that always fires and carries those labels.** Any source will do. An anomaly detector
   with a threshold it always exceeds is the easy route: put your label fields in its event properties
   and use event type *Custom info*, so no problem is opened.
3. **Create a profile with a narrow matcher** that selects only that event, for example
   `matchesValue(event.name, "MYTEST-*")`. The Default profile of a new install takes only events
   carrying `sa.optin = true`, so it touches nothing until you change it. Never choose "All Davis events"
   for a test: the app's route goes first and would take every Davis event in the tenant.
4. **Add rules.** A default severity for the event, then an exception on a label (Team = payments), and
   perhaps a second one combining two labels, to see that the last match wins.
5. **Publish and enable the route** on the Pipeline screen. Review the diff first. A banner on every screen
   tells you what is still outstanding.
6. **Look at the result** on the Results screen, or with this query, which shows what each rule tier did
   to each event:

   ```
   fetch dt.davis.events, from:-24h
   | filter isNotNull(sa.source)
   | summarize events = count(),
       by:{event.name, sa.source, sa.original_severity, event.severity, sa.proposed_severity}
   | sort events desc
   ```

   Then change a rule, publish again, and watch the next event change.

Worth poking at: **Explain an event** on the Rules screen (does it agree with what happened?), a profile in **Observe** mode (what would it change, with `event.severity` untouched?), reorder the exceptions, remap a label to a different field, change what happens to events
no rule matches, and key a default on the detector instead of the event name (we have not verified that
path end to end).

When you are done: delete or disable the detector, disable the route, and use **Settings > Remove and
reset** to uninstall the test profile.

**We would like your feedback.** What was confusing, what is missing, and whether this would fit your
customers' severity needs. Please open an issue on this repository.

## Known limitations

- **Problem-level severity**, see the note near the top.
- **Pipeline groups and bucket assignment** are out of scope, and a profile cannot be a member of a
  pipeline group (the stages the app writes are silently ignored there).
- **Dynatrace Spaces** is not supported.
- **Routing is first-match-wins.** Each profile's route goes first. A profile that takes every Davis
  event (matcher `true`) makes routes below it, including other teams' pipelines, stop receiving them.
  Give a profile a narrow matcher; the app asks you to confirm before you choose "All Davis events".
- **Limits:** about 990 exceptions per profile (one processor each, against a platform limit of 1,000),
  defaults effectively unlimited (they share one lookup table), up to 4 conditions per rule. The app
  refuses to publish something that would not fit rather than writing a partial pipeline. The full list
  is on the **Help** page.
- **Test against a saved, routed pipeline**, not OpenPipeline Preview.

## Test status

**Verified on a test tenant, with events sent through the Events API:** label mapping and saving; rules
(defaults, exceptions, thresholds); compiling and publishing the pipeline; enabling the route;
event-level results; reordering, deleting and remapping, and changing the fallback. Not yet run against
events raised by a real anomaly detector.

**Less exercised:** restoring from a backup file; the uninstall and full "Reset the app" flows; the
security-context stage; the Results screen; rules keyed on an anomaly detector against a real firing
detector. Everything added in 0.2.0 (setup wizard, Explain an event, observe mode, rules export and import,
the matcher dropdown, the grouped Help FAQ) has unit tests, and the observe-mode processor was checked with
the tenant's processor preview, but none of it has been clicked through in a browser.

## Contributing

Build, test and release instructions are in [CONTRIBUTING.md](CONTRIBUTING.md).

## Changelog

### 0.2.0 (2026-11-10)

**Added**
- **Setup wizard and Help.** A skippable, re-runnable first-run setup (labels, which events the app
  takes, what happens to unmatched events) and a "Finish setup" banner while no label is usable. The old
  Getting started page is now Help, with the diagrams and limits collapsed.
- **Explain this event.** Pick an event and label values from dropdowns and see which rule wins and why.
- **Observe mode** (per profile). Records `sa.proposed_severity` and leaves `event.severity` alone; the
  Results screen reads the proposals. Meant for a profile's first go-live.
- **Rules export and import.** Versioned JSON for labels, profiles and rules, with a validated preview
  and merge or replace. Importing never publishes by itself.
- **Label-change safety.** Changing or removing a label lists the rules it would invalidate.
- **Fill rate for any mapped field** in Settings, not only the four built-in labels.
- A warning in the top bar when a profile takes every Davis event.
- Docs: the README now says what the app changes in your tenant, its support status, prerequisites, an
  example IAM policy, query cost and a verification query. The Help page groups its questions by topic
  with a filter, documents the new features, and no longer carries the pitch.

**Changed**
- **Safer default routing.** New installs take only events carrying `sa.optin = true` instead of every
  Davis event. "All Davis events" is a deliberate choice that needs a tick. Existing installs keep their
  saved matcher.
- The exception dialog starts with one condition; the publish confirmation lists one change per line;
  clearer wording throughout (Publish changes, Which events does this take?). The backup, restore and
  technical details section on the Pipeline screen is easier to find.
- Label ordering buttons removed (the order never affected which rule wins).

**Fixed**
- Max conditions per rule is now derived from the labels and capped at four, the number a rule can
  store. Values above four were silently truncated before.

### 0.1.0 (2026-11-06)

First packaged release (pre-release). Rules in business terms (defaults plus ordered, label-based
exceptions), profiles with their own pipeline and route, a rule-level diff before publishing, route
control, optional backups and restore, the Results screen, impact simulation and uninstall.
