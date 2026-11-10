# Contributing

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

## Releasing

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

