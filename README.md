# Severity Assistant

Set **Davis event severity** with business rules instead of hand-built OpenPipeline logic, for a
Dynatrace tenant.

> [!WARNING]
> **Event severity doesn't yet pass on reliably to problems.** This app sets the severity of *events*.
> If you use events directly (for example an event feed), you're good. If you send **problems** to an
> ITSM tool such as ServiceNow, the severity may not carry through yet; this is expected to be fixed in
> Dynatrace soon.

## Why this app

A problem is only as severe as its most severe event. When events carry no meaningful severity, every
problem looks alike, and anything downstream that routes on severity has nothing to go on. Writing that
logic by hand in OpenPipeline means scripts, lookup tables and a route that is easy to get silently
wrong: a wrong key, a remapped field or a route in the wrong position produces no error, just a pipeline
that quietly does nothing.

This app replaces that with rules a person can read:

- **Severity in business terms.** "CPU Saturation is 3, but 1 for the payments team." No scripts, no
  lookup tables, and the labels are your own (business unit, application, tier, stage...).
- **See it before it is live.** A preview of what your rules would change, an exact rule-level diff of
  what will be written, and a route that stays off until you turn it on.
- **Safe to undo.** Optional backups saved on your computer, a route you can switch off in one click,
  and an uninstall that removes only what the app created. Other teams' routes are never edited.
- **Verifiable.** Every event the app touches records which rule tier decided it (`sa.source`) and what
  it arrived with (`sa.original_severity`), so you can check the result with a query.

### An example

Northwind Bank runs hundreds of applications for dozens of teams, and one alert, *CPU saturation*, fires
across all of them. Today it carries the same severity everywhere, so a payment outage and a broken
test box look alike.

**Retail Banking** runs the payments gateway: gold tier, in production, where every minute of downtime
costs money. **Corporate IT** runs internal tools such as HR and expenses, where the same alert can wait
until morning. Using the built-in labels (Business Unit, Application, Tier, Stage), their rules read:

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

1. **Profiles.** Each profile is an independent pipeline and route, with its own rules and its own
   matcher for the events it takes.
2. **Rules.** Per event name or anomaly detector, set a **default** severity, then add **exceptions**
   based on labels. Exceptions are ordered and **the last match wins**.
3. **Pipeline.** The app compiles the rules into a Davis-events OpenPipeline pipeline, shows a diff
   against what is live, deploys it, and manages the route.
4. **Results.** See which severities events actually received.

Rules and the label mapping live in the app's own state, not in a Grail lookup table. The pipeline is a
*compiled artifact*, regenerated from them. Each processor carries a plain-language description in
OpenPipeline, for example `exception #2 - set severity 1 for events named "Foo" when Business Unit = bu1`.

## How to install

> **Use a non-production tenant first.** The app writes OpenPipeline settings and, once a route is
> enabled, changes `event.severity` on events. Severities already written to Grail cannot be un-written.

**You need** permission to install apps on the tenant, and users of the app need access matching the
scopes it requests:

| Scope | Used for |
|---|---|
| `storage:events:read`, `storage:buckets:read` | Event history, discovery and the Results screen |
| `settings:objects:read`, `settings:objects:write` | Reading and writing the OpenPipeline pipeline and route |
| `state:app-states:read`, `:write`, `:delete` | Storing the label mapping and rules |
| `davis:analyzers:execute` | Suggesting threshold patterns from real event descriptions |

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

Open the app from the tenant's app menu. The **Getting started** page explains the four steps, lists the
limits, and answers the questions people ask first. A banner on every screen tells you what is still
unfinished (rules saved but not deployed, deployed but no route, and so on).

## How to test

A quick way to try it in your own tenant, with your own labels. No script and no fixed recipe: adapt it
to what you have. Allow 20 to 30 minutes.

1. **Pick one or two labels you already use**: team, environment, application, cost centre. A label is a
   business attribute plus the event field that holds its value, so a rule says "Team = payments" and
   never mentions the field. Map them in **Settings** (rename the built-in labels or add your own) and
   press **Save settings**.
2. **Get an event that always fires and carries those labels.** Any source will do. An anomaly detector
   with a threshold it always exceeds is the easy route: put your label fields in its event properties
   and use event type *Custom info*, so no problem is opened.
3. **Create a profile with a narrow matcher** that selects only that event, for example
   `matchesValue(event.name, "MYTEST-*")`. Never use `true`: the app's route goes first and would take
   every Davis event in the tenant.
4. **Add rules.** A default severity for the event, then an exception on a label (Team = payments), and
   perhaps a second one combining two labels, to see that the last match wins.
5. **Deploy and enable the route** on the Pipeline screen. Review the diff first. A banner on every screen
   tells you what is still outstanding.
6. **Look at the result** on the Results screen, or at `event.severity` and `sa.source` on the event itself.
   Then change a rule, deploy again, and watch the next event change.

Worth poking at: reorder the exceptions, remap a label to a different field, change what happens to events
no rule matches, and key a default on the detector instead of the event name (we have not verified that
path end to end).

When you are done: delete or disable the detector, disable the route, and use **Settings > Remove and
reset** to uninstall the test profile.

**We would like your feedback.** What was confusing, what is missing, and whether this would fit your
customers' severity needs. Please open an issue on this repository.

## Status and known limitations

**Verified on a test tenant, with events sent through the Events API:** label mapping and saving; rules
(defaults, exceptions, thresholds); compiling and deploying the pipeline; enabling the route;
event-level results; reordering, deleting and remapping, and changing the fallback. Not yet run against
events raised by a real anomaly detector.

**Less exercised:** restoring from a backup file; the uninstall and full "Reset the app" flows; the
security-context stage; the Results screen; rules keyed on an anomaly detector against a real firing
detector; and the newest interface additions (the deploy-state banner, the unsaved-changes bar, and the
Getting started limits and FAQ), which were added after the last full test pass.

**Not available:**

- **Problem-level severity**, see the note at the top.
- **Pipeline groups and bucket assignment** are out of scope, and a profile cannot be a member of a
  pipeline group (the stages the app writes are silently ignored there).
- **Dynatrace Spaces** is not supported.

**Things to know:**

- **Routing is first-match-wins.** Each profile's route goes first. A profile with a matcher of `true`
  takes every Davis event, so routes below it, including other teams' pipelines, stop receiving them.
  Give a profile a narrow matcher.
- **Limits:** about 990 exceptions per profile (one processor each, against a platform limit of 1,000),
  defaults effectively unlimited (they share one lookup table), 4 conditions per rule by default. The
  app refuses to deploy something that would not fit rather than writing a partial pipeline. The full
  list is on the **Getting started** page.
- **Test against a saved, routed pipeline**, not OpenPipeline Preview.

## Development

Requires Node.js 24 and the Dynatrace App Toolkit. `app.config.json` holds a placeholder tenant URL: pass a
**non-production** tenant with `--environment-url` (below), or edit `environmentUrl` locally and do not
commit it.

```bash
npm install
npm run start -- --environment-url https://<environment-id>.apps.dynatrace.com/   # dev server
npm run build      # production bundle
npm run lint
npx tsc --noEmit -p ui/tsconfig.json
npx jest           # unit tests (compiler, planner, rules, simulation)
```

The compiler (`ui/app/lib/compiler`) is pure and has no SDK imports, so it is unit-tested without a tenant.

### Releasing

The development build contains a Debug panel (`ui/app/debug`) that seeds test data and can overwrite
configuration. It must never ship. Setting its flag to false does **not** remove it, so releases are
built by a script that deletes it and proves it is gone:

```bash
npm run release                    # verify a release build of HEAD, debug code removed
npm run release -- --ref v0.1.0    # ...of a tag
npm run release -- --package --environment-url https://<environment-id>.apps.dynatrace.com/
                                   # also produce the installable zip in ./out (needs a browser login)
```

CI runs the type check, lint, tests and the debug-free release build on every push and pull request. The
zip itself must be built locally, because `dt-app deploy --dry-run` needs a login; attach it to a GitHub
release together with its `.sha256`.
