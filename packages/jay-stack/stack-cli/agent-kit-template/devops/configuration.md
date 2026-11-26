# Configuration (`.jay`) — file keys and env overrides

The project's `.jay` file (YAML, at the project root) is the **committed source of truth** for all
Jay Stack settings. Every setting can also be overridden at runtime by an environment variable, so a
deployment environment (CI, a pod, a preview sandbox) configures the app **without editing the
git-managed `.jay` file** (DL#240).

## Precedence

```
programmatic override (tests/internal)  →  JAY_* env var  →  .jay file  →  built-in default
highest                                                                           lowest
```

- An env var **replaces** the `.jay` value (it does not merge — including list values such as
  `allowedHosts`).
- An **invalid** env value (e.g. a non-numeric body limit) is **warned and ignored** — the server
  falls back to the `.jay` value or the default. A malformed env never takes the server down.
- An env var applies **even when there is no `.jay` file**.

## Example `.jay`

Every key is optional — omit a section to take its defaults (a project often ships only `devServer`
and `site`). This lists them all for reference; numeric/boolean keys show their default, while
`site.*` and `allowedHosts` (which have no default) show example values:

```yaml
# .jay — project configuration (YAML). All keys optional.

devServer: # dev server (`jay-stack dev`)
  portRange: [3000, 3100] # pin a single port with [3000, 3000]
  pagesBase: ./src/pages
  componentsBase: ./src/components
  publicFolder: ./public
  configBase: ./config
  base: / # public base URL path the dev server mounts under
  # allowedHosts, beyond localhost, for cloud preview proxies (Vite host-suffix syntax):
  allowedHosts:
    - .mysandbox.dev
  # allowedHosts: true   # or disable the host check entirely (dev only)
  sourceEditing: false # inject source-editing markers (DL#219); dev only

site: # site identity → JSON-LD (DL#213)
  baseUrl: https://example.com
  name: Example Co
  logo: /logo.png
  description: We make examples.
  sameAs:
    - https://x.com/example
    - https://github.com/example

server: # runtime (`jay-stack dev` and `jay-stack serve`)
  actionBodyLimitBytes: 1048576 # JSON action body cap; over it → 413
  actionPollAfterMs: 25000 # long-request polling budget; omit → off (single-process only)
  staleWaitMs: 2000 # wait for an expired instance's refresh
  missTimeoutMs: 8000 # wait of a render-on-miss before 503
  slowRenderConcurrency: 5 # max concurrent slow renders
  freshnessHeader: true # emit the `jay-freshness` header

validations: # project-level validation suppressions
  allow-no-ard: false # suppress the missing /.well-known/ard.json nudge
  allow-no-error-pages: false # suppress the missing 404/5xx pages nudge
```

Each key above maps to one env override in the tables below (e.g. `server.actionBodyLimitBytes` ↔
`JAY_SERVER_ACTION_BODY_LIMIT_BYTES`), so a deployment can set any of these without editing this file.

## Settings

### `devServer.*` — dev server (`jay-stack dev`)

| `.jay` key       | Env override                     | Type           | Default            | Meaning                                          |
| ---------------- | -------------------------------- | -------------- | ------------------ | ------------------------------------------------ |
| `portRange`      | `JAY_DEV_SERVER_PORT_RANGE`      | `min,max` ints | `3000,3100`        | Port search range (pin with `[3000,3000]`)       |
| `pagesBase`      | `JAY_DEV_SERVER_PAGES_BASE`      | path           | `./src/pages`      | Pages directory                                  |
| `componentsBase` | `JAY_DEV_SERVER_COMPONENTS_BASE` | path           | `./src/components` | Components directory                             |
| `publicFolder`   | `JAY_DEV_SERVER_PUBLIC_FOLDER`   | path           | `./public`         | Static public directory                          |
| `configBase`     | `JAY_DEV_SERVER_CONFIG_BASE`     | path           | `./config`         | Config directory                                 |
| `allowedHosts`   | `JAY_DEV_SERVER_ALLOWED_HOSTS`   | csv, or `true` | localhost-only     | Extra Vite allowed hosts; `true` disables check  |
| `sourceEditing`  | `JAY_DEV_SERVER_SOURCE_EDITING`  | `on`/`off`     | `off`              | Inject source-editing markers (DL#219)           |
| `base`           | `JAY_DEV_SERVER_BASE`            | path           | `/`                | Public base URL path the dev server mounts under |

### `site.*` — site identity (JSON-LD, DL#213)

| `.jay` key    | Env override           | Type   | Default | Meaning                                 |
| ------------- | ---------------------- | ------ | ------- | --------------------------------------- |
| `baseUrl`     | `JAY_SITE_BASE_URL`    | URL    | —       | Site base URL                           |
| `name`        | `JAY_SITE_NAME`        | string | —       | Site/organization name                  |
| `logo`        | `JAY_SITE_LOGO`        | URL    | —       | Logo URL (absolute or baseUrl-relative) |
| `description` | `JAY_SITE_DESCRIPTION` | string | —       | Short site description                  |
| `sameAs`      | `JAY_SITE_SAME_AS`     | csv    | —       | Social/profile URLs (`sameAs`)          |

### `server.*` — runtime (`jay-stack dev` and `jay-stack serve`)

| `.jay` key              | Env override                         | Type       | Default | Meaning                                                    |
| ----------------------- | ------------------------------------ | ---------- | ------- | ---------------------------------------------------------- |
| `actionBodyLimitBytes`  | `JAY_SERVER_ACTION_BODY_LIMIT_BYTES` | int bytes  | 1 MiB   | JSON action body cap; over it → 413 (DL#234)               |
| `actionPollAfterMs`     | `JAY_SERVER_ACTION_POLL_AFTER_MS`    | int ms     | off     | Switch a long action to polling after this budget (DL#239) |
| `staleWaitMs`           | `JAY_SERVER_STALE_WAIT_MS`           | int ms     | `2000`  | Max wait for the refresh of an `expired` instance (DL#226) |
| `missTimeoutMs`         | `JAY_SERVER_MISS_TIMEOUT_MS`         | int ms     | `8000`  | Max wait of a render-on-miss before 503 (DL#227)           |
| `slowRenderConcurrency` | `JAY_SERVER_SLOW_RENDER_CONCURRENCY` | int        | `5`     | Max concurrent slow renders (DL#227)                       |
| `freshnessHeader`       | `JAY_SERVER_FRESHNESS_HEADER`        | `on`/`off` | `on`    | Emit the `jay-freshness` response header (DL#226)          |

> `actionPollAfterMs` is only for single-process deployments — see
> [long-request-polling.md](long-request-polling.md). The serving knobs (`staleWaitMs`,
> `missTimeoutMs`, `slowRenderConcurrency`, `freshnessHeader`) are detailed in
> [serving-modes.md](serving-modes.md).

### `validations.*` — project-level validation suppressions (DL#214/#218)

| `.jay` key             | Env override                           | Type       | Default | Meaning                                            |
| ---------------------- | -------------------------------------- | ---------- | ------- | -------------------------------------------------- |
| `allow-no-ard`         | `JAY_VALIDATIONS_ALLOW_NO_ARD`         | `on`/`off` | `off`   | Suppress the missing `/.well-known/ard.json` nudge |
| `allow-no-error-pages` | `JAY_VALIDATIONS_ALLOW_NO_ERROR_PAGES` | `on`/`off` | `off`   | Suppress the missing 404/5xx error-pages nudge     |

## Env-var value formats

- **int / int bytes / int ms** — a positive integer (`staleWaitMs` allows `0`). Non-integer or
  out-of-range values are ignored with a warning.
- **`min,max` ints** — two positive integers, comma-separated: `JAY_DEV_SERVER_PORT_RANGE=3000,3000`.
- **`on`/`off`** — `on`/`true`/`1` → enabled; `off`/`false`/`0` → disabled.
- **csv** — comma-separated, blanks trimmed: `JAY_SITE_SAME_AS=https://x.com/a,https://y.com/b`.
- **csv, or `true`** — as csv, or the literal `true` (for `allowedHosts`, disables the host check).

## Migration — old env names (removed, DL#240)

These ad-hoc env vars were **renamed** into the scheme above and no longer work under their old names:

| Old (removed)                            | New                                                    |
| ---------------------------------------- | ------------------------------------------------------ |
| `__VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS` | `JAY_DEV_SERVER_ALLOWED_HOSTS` (replaces, was a merge) |
| `JAY_STALE_WAIT_MS`                      | `JAY_SERVER_STALE_WAIT_MS`                             |
| `JAY_FRESHNESS_HEADER`                   | `JAY_SERVER_FRESHNESS_HEADER`                          |
| `JAY_SLOW_RENDER_CONCURRENCY`            | `JAY_SERVER_SLOW_RENDER_CONCURRENCY`                   |
| `JAY_MISS_TIMEOUT_MS`                    | `JAY_SERVER_MISS_TIMEOUT_MS`                           |
| `BASE`                                   | `JAY_DEV_SERVER_BASE`                                  |

## Examples

Pin the port and raise the action body cap on a pod, without touching `.jay`:

```bash
JAY_DEV_SERVER_PORT_RANGE=3000,3000 \
JAY_SERVER_ACTION_BODY_LIMIT_BYTES=2097152 \
jay-stack serve
```

Allow a preview proxy's host in a sandbox:

```bash
JAY_DEV_SERVER_ALLOWED_HOSTS=.mysandbox.dev jay-stack dev
```
