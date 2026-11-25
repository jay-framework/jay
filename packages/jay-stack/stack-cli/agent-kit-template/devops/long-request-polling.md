# Long-request polling (long actions behind a gateway)

Some hosts cut every HTTP request at a fixed limit. A sandbox gateway, for example, answers `504`
after 55 s even though the server is still working — so a long action's result is lost.

Polling fixes this in the transport, with no change to any action. When it is on and a request runs
past the budget, the server answers `202` with a **ticket**, and the client transparently long-polls
`GET /_jay/action-results/<ticket>` until the result is ready. Streams (`makeJayStream`) are delivered
in resumable segments. A request the gateway cuts outright (`502/503/504`) is recovered the same way,
because the client holds the ticket from the start. The call site still gets one `Promise` / one
`AsyncIterable` — nothing in the app changes.

## Enabling it

`.jay`:

```yaml
server:
  actionPollAfterMs: 25000 # recommended behind a 55 s gateway
```

- **Absent → off** (the default). The server behaves exactly as before.
- The value must be a **positive integer, well under the gateway's limit**, because a poll also waits
  up to the budget. `25000` clears both a 55 s gateway and the common 30 s proxy cut. `jay-stack
validate` warns if it is `≥ 45000` or not a positive integer.

## When to enable

| Deployment                                               | Enable? | Why                                                                           |
| -------------------------------------------------------- | ------- | ----------------------------------------------------------------------------- |
| Dev server / `jay-stack serve` on a **single process**   | ✅ yes  | The poll reaches the same process that holds the ticket                       |
| A sandbox behind a time-limited gateway (AIditor online) | ✅ yes  | This is exactly the case it solves                                            |
| **Fetch-handler platforms** (Wix, Cloudflare Workers)    | ❌ no   | Work after the response may be killed, and a poll may hit a different isolate |
| **Multi-instance** deployments (more than one process)   | ❌ no   | The ticket lives in one process's memory; a poll on another instance 404s     |

The ticket store is in-memory and single-process (DL#239 Q2). On the two "no" platforms, leave
`actionPollAfterMs` unset and keep actions under the gateway limit (or write them as streams that
flush within it). A shared/pluggable store for multi-instance is future work.

## What it affects

- Only `/_jay/actions/*` request/response and stream actions. Pages and SSR are out of scope (a page
  must not run past the gateway limit; see the **error-pages** guide / DL#218 for the `504` page).
- Poll responses are always `Cache-Control: private, no-store`, including a polled GET.
- The seed the client derives tickets from is injected into each page's `window.__jay.actionSeed`;
  it is per-process and resets on restart (in-flight tickets are lost on restart — the client reports
  a clear "result no longer available" error).

See DL#239 for the full design.
