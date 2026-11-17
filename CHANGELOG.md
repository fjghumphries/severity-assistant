# Changelog

Newest first. Release notes with the downloads are on the
[Releases page](https://github.com/fjghumphries/severity-assistant/releases).

### 0.2.5 (2026-11-17)

Covers everything since 0.2.0. The intermediate 0.2.1 to 0.2.4 releases of the same day were folded into this one.

**When upgrading, publish each profile again.** `event.severity` is now written as a number (see Fixed); the pipeline already deployed still writes text until it is published again, and only events processed afterwards carry the number.

**Added**
- **Setup notes for custom anomaly detectors.** Events from a custom detector (type `CUSTOM_ALERT`) are not merged into problems by default, so each new value opens a new problem. The threshold editor warns about it and links (in a new tab) to a Help section with a five-step worked example: reduce the series to one number in the query, put it in the event description, allow merging with `dt.davis.is_merging_allowed = true`, write the rule, check the result.
- **Optional bounds for severity by value.** Fill in only the severities you want, for example just Critical at 70; everything below keeps the rule's other severity or the profile's fallback. Fill in all four to keep the earlier behaviour (below the lowest value is Informational). Existing rules are unchanged.
- **Feedback links.** "Report a bug" and "Give feedback" in the top strip open a pre-filled GitHub issue (app version, screen and browser only; no tenant data).
- **The profile is always visible.** The top strip stays at the top while you scroll and is tinted in the profile's own colour.
- **Labels explained** in Setup and Settings, with a Save button on the "Not saved yet" notice.
- **Reset the app can also remove the pipelines and routes** it deployed (ticked by default), so it returns to a fresh install. The dialog lists what is deleted and what is never touched.
- **Upgrades that only reword descriptions no longer look like pending work.** When the only difference between the deployed pipeline and what the app would build is processor descriptions, the Pipeline screen and top bar say "Up to date (wording differs)" and explain it.

**Changed**
- **Simpler wording.** The per-event "system-wide default" is now simply a **rule**, with exceptions refining it ("+ Add rule", "Set severity"). The profile option for events no rule covers reads "Set a severity for them".
- **Severity from a number is clearer.** The editor says the number is read from `event.description` and shows a worked pattern.

**Fixed**
- **`event.severity` is written as a number.** It was written as text (`"4"`), and Dynatrace does not pass a text severity on to problems: on a test tenant none of the problems carried a severity. The number is written in live mode, in the fixed severity for events no rule covers, and in observe mode (`sa.proposed_severity`). Events set to "Leave severity untouched" keep their own value.
- Event names and label values containing `|` are no longer rejected (a check left over from an old key scheme).
- A rule with a fixed severity can no longer be saved with "contains" matching, which used to compile as an exact match without saying so. Use "is exactly", or make it an exception, which supports "contains".
- A new install lands on Setup even when the browser remembers an earlier install, and the "changes not active" banner no longer sits on top of "Setup is not finished".
- A registry emptied by a reset that could not delete no longer loses its route matcher and roles.
- Opening a link to a Help page in a new tab no longer redirects to Profiles.

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
- A warning in the top bar when a profile takes every event.
- Docs: the README now says what the app changes in your tenant, its support status, prerequisites, an
  example IAM policy, query cost and a verification query. The Help page groups its questions by topic
  with a filter, documents the new features, and no longer carries the pitch.

**Changed**
- **Safer default routing.** New installs take only events carrying `sa.optin = true` instead of every
  event. "All events" is a deliberate choice that needs a tick. Existing installs keep their
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
